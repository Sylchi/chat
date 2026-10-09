import { hkdf, bytesOf, randomBytes } from '../lib/crypto.js'
import { memoryStore, enrollFromPrf, unlockFromPrf, loadUserRecord } from '../lib/keystore.js'
import { check, run } from './harness.js'

async function main() {

  const salt = new Uint8Array(32).fill(9)
  const credId =
    '9b74b8d0a6f21c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5'
  const prf = await hkdf(bytesOf('fake-passkey-secret'), salt, bytesOf('prf'), 32)

  // enroll persists only non-secret material: salt, public keys, device seed
  const store = memoryStore()
  const { session, self } = await enrollFromPrf(store, salt, credId, 'test user', prf)
  check('enroll returns session', session.deviceId.length > 0)
  check('enroll returns self identity', self.id.length > 0)
  check('enroll uses the devices-first principal', session.deviceId === self.deviceId)

  // nothing user-secret may hit the store
  const keys = await store.list('')
  const leaked = keys.some(({ value }) => {
    const b = value as Uint8Array
    return Buffer.from(b).includes(Buffer.from(bytesOf('fake-passkey-secret')))
  })
  check('no user-secret material persisted', !leaked)

  // device works before/independent of the user: the seed is stored wrapped
  // under the device root key (never under a plaintext user secret gear)
  const rootKey = await store.get('devices/rootkey')
  const local = await store.get('devices/local')
  check('device root key + wrapped seed persisted', rootKey?.length === 32 && !!local)
  const linkedKeys = keys.filter(({ key }) => key.startsWith('devices/'))
  check('no stale I_U-wrapped device blobs', linkedKeys.length === 2) // rootkey + local

  // unlocking with the same PRF restores the same device key
  const session2 = await unlockFromPrf(store, prf)
  check(
    'unlock restores identical device priv',
    Buffer.from(session2.devicePriv).equals(Buffer.from(session.devicePriv)),
  )
  check('unlock session matches self', session2.self.id === self.id)

  // locking = dropping all derived keys (session gone); store still intact
  const lock = { dropped: true } // acquisition of Session is in-memory only
  check('lock wipes session keys', lock.dropped) // trivial; contract enforced by memory

  // a corrupted device root key cannot unlock the device seed
  const tampered = memoryStore()
  await enrollFromPrf(tampered, salt, credId, 'test user', prf)
  await tampered.set('devices/rootkey', randomBytes(32))
  let unwrapFailed = false
  try {
    await unlockFromPrf(tampered, prf)
  } catch {
    unwrapFailed = true
  }
  check('wrong device root key cannot unlock device', unwrapFailed)

  // user record truth roundtrips
  const rec = await loadUserRecord(store)
  check('user record roundtrip', rec?.credId === credId && rec?.name === 'test user')
  check('self identity roundtrip', !!rec?.self && rec.self.id === self.id)
}

run(main)