import {
  createDevice,
  appKeysFromPRF,
  userKeysFromPRF,
  unwrapDevice,
  sealTo,
  openSealed,
  hkdf,
  sha256,
  bytesOf,
} from '../lib/identity.ts'

async function main() {
  let ok = true
  const check = (name: string, cond: boolean) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }

  // simulate the passkey PRF output (deterministic per user+salt)
  const salt = new Uint8Array(32).fill(5)
  const prf = await hkdf(bytesOf('fake-passkey-secret'), salt, bytesOf('prf'), 32)

  // Re-derivation is deterministic: same prf -> same user/app keys
  const u1 = await userKeysFromPRF(prf)
  const u2 = await userKeysFromPRF(prf)
  check('user keys deterministic', Buffer.from(u1.dec.pub).equals(Buffer.from(u2.dec.pub)))
  check('user verify vector deterministic', Buffer.from(u1.verify).equals(Buffer.from(u2.verify)))

  const a1 = await appKeysFromPRF(prf)
  const a2 = await appKeysFromPRF(prf)
  check('app keys deterministic across devices', Buffer.from(a1.enc.pub).equals(Buffer.from(a2.enc.pub)))
  check('app sig seed deterministic', Buffer.from(a1.sigSeed).equals(Buffer.from(a2.sigSeed)))

  // device principal: wrapped under user-derived key
  const dev = await createDevice(prf)
  const unwrapped = await unwrapDevice(dev.wrapped, prf)
  check('device unwrap restores priv', Buffer.from(unwrapped).equals(Buffer.from(dev.priv)))

  // without correct user presence, unwrap fails
  const wrongPrf = await hkdf(bytesOf('other-user-secret'), salt, bytesOf('prf'), 32)
  let failed = false
  try {
    await unwrapDevice(dev.wrapped, wrongPrf)
  } catch {
    failed = true
  }
  check('device unwrap fails with wrong user', failed)

  // recipient principals (the trusted contact on another device)
  const recSubject = await hkdf(bytesOf('contact-secret'), salt, bytesOf('prf'), 32)
  const recUser = await userKeysFromPRF(recSubject)
  const recApp = await appKeysFromPRF(recSubject)
  const recDev = await createDevice(recSubject)

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
  check('seal/open roundtrip', Buffer.from(opened).equals(Buffer.from(msg)))

  // sender device CANNOT open (only recipient device key works)
  const attackerDev = await createDevice(await hkdf(bytesOf('attacker'), salt, bytesOf('prf'), 32))
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

  console.log(ok ? '\nALL OK' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})