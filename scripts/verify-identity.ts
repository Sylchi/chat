import { appKeysFromPRF, userKeysFromPRF, sealTo, openSealed, DEV_WRAP_INFO } from '../lib/identity.js'
import { createDevicePrincipal, wrapDeviceSeed, unwrapDeviceSeed } from '../lib/device.js'
import { hkdf, bytesOf } from '../lib/crypto.js'
import { check, eq, run } from './harness.js'

async function main() {
  // simulate the passkey PRF output (deterministic per user+salt)
  const salt = new Uint8Array(32).fill(5)
  const prf = await hkdf(bytesOf('fake-passkey-secret'), salt, bytesOf('prf'), 32)

  // Re-derivation is deterministic: same prf -> same user/app keys
  const u1 = await userKeysFromPRF(prf)
  const u2 = await userKeysFromPRF(prf)
  check('user keys deterministic', eq(u1.dec.pub, u2.dec.pub))
  check('user verify vector deterministic', eq(u1.verify, u2.verify))

  const a1 = await appKeysFromPRF(prf)
  const a2 = await appKeysFromPRF(prf)
  check('app keys deterministic across devices', eq(a1.enc.pub, a2.enc.pub))
  check('app sig seed deterministic', eq(a1.sigSeed, a2.sigSeed))

  // device principal: seed wrapped under a user-derived key
  const wrapKey = await hkdf(prf, null, bytesOf(DEV_WRAP_INFO), 32)
  const dev = await createDevicePrincipal('test device')
  const wrapped = await wrapDeviceSeed(wrapKey, dev.id, dev.seed)
  const seedBack = await unwrapDeviceSeed(wrapKey, dev.id, wrapped)
  check('device unwrap restores seed', eq(seedBack, dev.seed))

  // without correct user presence, unwrap fails
  const wrongPrf = await hkdf(bytesOf('other-user-secret'), salt, bytesOf('prf'), 32)
  const wrongWrapKey = await hkdf(wrongPrf, null, bytesOf(DEV_WRAP_INFO), 32)
  let failed = false
  try {
    await unwrapDeviceSeed(wrongWrapKey, dev.id, wrapped)
  } catch {
    failed = true
  }
  check('device unwrap fails with wrong user', failed)

  // recipient principals (the trusted contact on another device)
  const recSubject = await hkdf(bytesOf('contact-secret'), salt, bytesOf('prf'), 32)
  const recUser = await userKeysFromPRF(recSubject)
  const recApp = await appKeysFromPRF(recSubject)
  const recDev = await createDevicePrincipal('contact device')

  // seal + open at intended recipient
  const msg = bytesOf('message content, sealed to the user')
  const env = await sealTo(msg, {
    userPub: recUser.dec.pub,
    appPub: recApp.enc.pub,
    devicePub: recDev.pub,
    deviceId: recDev.id,
  })
  const opened = await openSealed(env, {
    userPriv: recUser.dec.priv,
    appPriv: recApp.enc.priv,
    devicePriv: recDev.priv,
  })
  check('seal/open roundtrip', eq(opened, msg))

  // sender device CANNOT open (only recipient device key works)
  const attackerDev = await createDevicePrincipal('attacker device')
  let attackerFailed = false
  try {
    await openSealed(env, {
      userPriv: recUser.dec.priv,
      appPriv: recApp.enc.priv,
      devicePriv: attackerDev.priv, // wrong device
    })
  } catch {
    attackerFailed = true
  }
  check('wrong device cannot open', attackerFailed)

  // recipient device WITHOUT user-present cannot open (no app/user privs)
  let noUserFailed = false
  try {
    await openSealed(env, {
      userPriv: new Uint8Array(32), // no user presence
      appPriv: new Uint8Array(32), // no app derivation
      devicePriv: recDev.priv,
    })
  } catch {
    noUserFailed = true
  }
  check('device alone (no user) cannot open', noUserFailed)

  // sender with only user+app (no recipient device) cannot open
  let noDevFailed = false
  try {
    await openSealed(env, {
      userPriv: recUser.dec.priv,
      appPriv: recApp.enc.priv,
      devicePriv: new Uint8Array(32),
    })
  } catch {
    noDevFailed = true
  }
  check('user+app without recipient device cannot open', noDevFailed)
}

run(main)
