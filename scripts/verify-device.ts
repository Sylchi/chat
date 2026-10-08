// Device layer verification — principals (seed→keypair), wrapped seeds,
// symmetric link secrets + pairing codes, peer payloads, and the keystore
// device store (devices-first, user-independent).
import {
  createDevicePrincipal,
  keypairFromSeed,
  wrapDeviceSeed,
  unwrapDeviceSeed,
  deviceLinkSecret,
  pairingCode,
  peerPayload,
  parsePeerPayload,
  devIdFor,
  deviceFingerprint,
} from '../lib/device.js'
import { randomBytes } from '../lib/crypto.js'
import {
  memoryStore,
  ensureLocalPrincipal,
  getLocalPrincipal,
  localDeviceKeypair,
  linkDevice,
  linkedDevices,
  deviceLinkWith,
} from '../lib/keystore.js'

async function main() {
  let ok = true
  const check = (name, cond) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

  // two independent devices
  const A = await createDevicePrincipal('phone')
  const B = await createDevicePrincipal('laptop')
  check('device ids distinct', A.id !== B.id)
  check('id is 12-char base64url', /^[A-Za-z0-9_-]{12}$/.test(A.id))
  check('fingerprint is 8 hex', /^[0-9A-F]{8}$/.test(await deviceFingerprint(A.pub)))

  // seed -> keypair is deterministic
  const kpA = await keypairFromSeed(A.seed)
  check('seed derives the same pub', eq(kpA.pub, A.pub) && eq(kpA.priv, A.priv))

  // wrapped seed round-trips and is bound to the device id
  const rootKey = randomBytes(32)
  const wrapped = await wrapDeviceSeed(rootKey, A.id, A.seed)
  const seedBack = await unwrapDeviceSeed(rootKey, A.id, wrapped)
  check('wrapped seed round-trips', eq(seedBack, A.seed))

  let tamperRejected = false
  try {
    await unwrapDeviceSeed(rootKey, B.id, wrapped) // wrong device id in aad
  } catch {
    tamperRejected = true
  }
  check('seed wrap bound to device id', tamperRejected)

  // link secret is symmetric and pair-bound
  const sA = await deviceLinkSecret(A.priv, A.pub, B.pub)
  const sB = await deviceLinkSecret(B.priv, B.pub, A.pub)
  check('link secret symmetric', eq(sA, sB))
  check('link secret 32 bytes', sA.length === 32)
  check('pairing code identical + 6 digits', pairingCode(sA) === pairingCode(sB) && /^\d{6}$/.test(pairingCode(sA)))
  const C = await createDevicePrincipal('server')
  const sAC = await deviceLinkSecret(A.priv, A.pub, C.pub)
  check('link secret bound to the pair', !eq(sA, sAC))

  // peer payloads: round-trip + forged id / swapped pub rejected
  const json = JSON.stringify(peerPayload(A))
  const parsed = await parsePeerPayload(json)
  check('payload round-trip', parsed.id === A.id && parsed.name === 'phone' && eq(parsed.pub, A.pub))
  let badId = false
  try {
    await parsePeerPayload(JSON.stringify({ ...peerPayload(A), id: B.id }))
  } catch {
    badId = true
  }
  check('payload id must match pub', badId)
  let badPub = false
  try {
    await parsePeerPayload(JSON.stringify(peerPayload(B)))
    await parsePeerPayload(JSON.stringify({ ...peerPayload(A), pub: peerPayload(B).pub }))
  } catch {
    badPub = true
  }
  check('payload pub validated as 32 bytes', badPub)

  // keystore device store: two stores, no user needed
  const storeA = memoryStore()
  const storeB = memoryStore()
  const localA = await ensureLocalPrincipal(storeA, 'laptop')
  const localB = await ensureLocalPrincipal(storeB, 'phone')
  check('ensureLocalPrincipal persisted', (await getLocalPrincipal(storeA))?.id === localA.id)
  check('ensureLocalPrincipal is idempotent', (await ensureLocalPrincipal(storeA, 'name ignored')).id === localA.id)

  const keyA1 = await localDeviceKeypair(storeA)
  const keyA2 = await localDeviceKeypair(storeA)
  check('device priv stable across reloads', eq(keyA1.priv, keyA2.priv))
  check('device pub matches linked identity', eq(keyA1.pub, localA.pub))

  // link A<->B through the store layer
  await linkDevice(storeA, { id: localB.id, name: localB.name, pub: localB.pub })
  await linkDevice(storeB, { id: localA.id, name: localA.name, pub: localA.pub })
  const listA = await linkedDevices(storeA)
  check('linked device stored', listA.length === 1 && listA[0].id === localB.id)

  const linkA = await deviceLinkWith(storeA, localB.id)
  const linkB = await deviceLinkWith(storeB, localA.id)
  check('store-level verification codes match', linkA.code === linkB.code && /^\d{6}$/.test(linkA.code))

  let selfLink = false
  try {
    const storeSelf = memoryStore()
    const dup = await ensureLocalPrincipal(storeSelf, 'x')
    await linkDevice(storeSelf, { id: dup.id, name: dup.name, pub: dup.pub })
    selfLink = true
  } catch {
    selfLink = false
  }
  check('cannot link a device to itself', !selfLink)

  // devices-first: no user records anywhere, yet the device layer is live
  const storeC = memoryStore()
  await ensureLocalPrincipal(storeC, 'fresh')
  const userKeys = await storeC.list('user/')
  check('device layer needs no user records', userKeys.length === 0)

  console.log(ok ? '\nALL OK (device layer)' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})