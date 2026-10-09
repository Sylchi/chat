import { bytesOf, hkdf } from '../lib/crypto.js'
import { memoryStore, enrollFromPrf } from '../lib/keystore.js'
import { check, run } from './harness.js'

// The vault is a src/ module backed by localStorage, so stub a minimal store
// before importing it (dynamic import runs after the stub is installed).
async function main() {
  const disk: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => (k in disk ? disk[k] : null),
    setItem: (k: string, v: string) => {
      disk[k] = String(v)
    },
    removeItem: (k: string) => {
      delete disk[k]
    },
    clear: () => {
      for (const k of Object.keys(disk)) delete disk[k]
    },
  } as unknown as Storage

  const { localKeyFromPRF } = await import('../lib/identity.js')
  const vault = await import('../src/vault.js')
  const store = await import('../src/store.js')
  const { sealMessage, openMessage } = await import('../src/messages.js')

  const keyA = await localKeyFromPRF(new Uint8Array(32).fill(1))
  const keyB = await localKeyFromPRF(new Uint8Array(32).fill(2))

  // locked: no plaintext may touch storage
  check('vault starts locked', !vault.isUnlocked())
  store.draft.set('top-secret-draft')
  check('locked write stores no plaintext', !JSON.stringify(disk).includes('top-secret-draft'))

  await vault.unlockVault(keyA)
  check('vault unlocks with a 32-byte key', vault.isUnlocked())
  store.draft.set('hello vault')
  await vault.settled()
  const raw = disk['s:draft']
  check('write is a sealed envelope', !!raw && JSON.parse(raw).__s === 1)
  check('ciphertext hides the plaintext', !raw.includes('hello vault'))

  // lock blanks the atom, unlock restores it from ciphertext
  vault.lockVault()
  check('lock drops the key', !vault.isUnlocked())
  check('lock blanks atoms', store.draft.get() === '')
  await vault.unlockVault(keyA)
  check('unlock rehydrates sealed data', store.draft.get() === 'hello vault')

  // a different passkey-derived key cannot decrypt the blob
  vault.lockVault()
  await vault.unlockVault(keyB)
  check('wrong key leaves atoms locked', store.draft.get() === '')

  // legacy plaintext is read and migrated to sealed on unlock
  vault.lockVault()
  disk['s:active-nav'] = JSON.stringify('Legacy')
  await vault.unlockVault(keyB)
  check('legacy plaintext is read', store.activeNav.get() === 'Legacy')
  check('legacy plaintext is re-sealed', JSON.parse(disk['s:active-nav']).__s === 1)

  let badKeyRejected = false
  try {
    await vault.unlockVault(new Uint8Array(16))
  } catch {
    badKeyRejected = true
  }
  check('non-32-byte key rejected', badKeyRejected)

  // E2E envelope plumbing: seal to self's ContactPub, open with the session
  const salt = new Uint8Array(32).fill(7)
  const prf = await hkdf(bytesOf('e2e-secret'), salt, bytesOf('prf'), 32)
  const { session } = await enrollFromPrf(memoryStore(), salt, 'cred-1', 'me', prf)
  const otherSalt = new Uint8Array(32).fill(8)
  const otherPrf = await hkdf(bytesOf('other-secret'), otherSalt, bytesOf('prf'), 32)
  const { session: other } = await enrollFromPrf(memoryStore(), otherSalt, 'cred-2', 'other', otherPrf)
  const envelope = await sealMessage('attack at dawn', session.self)
  check('sealed message is a JSON envelope', typeof envelope === 'string' && JSON.parse(envelope).body.length > 0)
  check('sealed message opens with the session', (await openMessage(envelope, session)) === 'attack at dawn')
  const wrongRejected = await openMessage(envelope, other).then(
    () => false,
    () => true,
  )
  check('wrong session cannot open', wrongRejected)
}

run(main)
