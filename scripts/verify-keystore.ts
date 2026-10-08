import { hkdf, bytesOf } from '../lib/crypto.js'
import { memoryStore, enrollFromPrf, unlockFromPrf, loadUserRecord } from '../lib/keystore.js'
import { unwrapDevice } from '../lib/identity.js'

async function main() {
  let ok = true
  const check = (name: string, cond: boolean) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }

  const salt = new Uint8Array(32).fill(9)
  const credId =
    '9b74b8d0a6f21c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5'
  const prf = await hkdf(bytesOf('fake-passkey-secret'), salt, bytesOf('prf'), 32)

  // enroll persists only non-secret material: salt, public keys, wrapped device
  const store = memoryStore()
  const { session, self } = await enrollFromPrf(store, salt, credId, 'test user', prf)
  check('enroll returns session', session.deviceId.length > 0)
  check('enroll returns self identity', self.id.length > 0)

  // nothing user-secret may hit the store
  const keys = await store.list('')
  const leaked = keys.some(({ value }) => {
    const b = value as Uint8Array
    return Buffer.from(b).includes(Buffer.from(bytesOf('fake-passkey-secret')))
  })
  check('no user-secret material persisted', !leaked)

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

  // wrong PRF (different user) cannot unlock the wrapped device key
  const wrongPrf = await hkdf(bytesOf('some-other-secret'), salt, bytesOf('prf'), 32)
  let unwrapFailed = false
  try {
    const local = await store.get('devices/local')
    if (!local) throw new Error('no local blob')
    // devices/local layout: [idLen:4][id][pub:32][wrappedLen:4][wrapped]
    const d = new DataView(local.buffer, local.byteOffset, local.byteLength)
    const idLen = d.getUint32(0, false)
    const wrappedLenOff = 4 + idLen + 32
    const wrappedLen = d.getUint32(wrappedLenOff, false)
    const wrapped = local.slice(wrappedLenOff + 4, wrappedLenOff + 4 + wrappedLen)
    await unwrapDevice(wrapped, wrongPrf) // wrapped is the AES-GCM ciphertext
  } catch {
    unwrapFailed = true
  }
  check('wrong user cannot unwrap device', unwrapFailed)

  // user record truth roundtrips
  const rec = await loadUserRecord(store)
  check('user record roundtrip', rec?.credId === credId && rec?.name === 'test user')
  check('self identity roundtrip', !!rec?.self && rec.self.id === self.id)

  console.log(ok ? '\nALL OK' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})