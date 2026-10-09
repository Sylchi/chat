import { atom } from './vendor/store.js'
import { backend } from './device-store.js'
import { enroll, loadUserRecord, unlock } from '../lib/keystore.js'
import { lockVault, unlockVault } from './vault.js'

// App-level user/passkey layer, sitting on top of the device principal.
// The passkey's PRF output (I_U) anchors the user key; enroll() persists only
// non-secret facts (salt, credId, name, self) and returns a session whose
// keys (userDec/appEnc, unwrapped device priv) live in memory for this page
// load only — lockPasskey() drops them.
//
// status: unknown (no passkey yet) | locked | busy | unlocked

export const passkey = atom({
  status: 'unknown',
  enrolled: false,
  name: '',
  attachment: '',
  error: null,
  session: null,
  self: null,
})

function patch(next) {
  passkey.set({ ...passkey.get(), ...next })
}

function friendly(error) {
  const name = error?.name
  if (name === 'NotAllowedError') return 'Passkey prompt was cancelled or timed out.'
  if (name === 'NotFoundError') return 'No passkey found for this account — create one first.'
  if (name === 'InvalidStateError') return 'This device already has a passkey for this identity.'
  if (name === 'NotSupportedError') return 'This authenticator does not support the required PRF extension.'
  if (name === 'SecurityError') return 'This origin is not allowed for this relying party.'
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/** Read enrollment facts from the store so the modal opens in the right state. */
export async function initPasskey() {
  try {
    if (passkey.get().status === 'unlocked') return passkey.get()
    const store = await backend()
    const rec = await loadUserRecord(store)
    patch({ enrolled: !!rec, name: rec?.name ?? '', attachment: rec?.attachment ?? '', status: rec ? 'locked' : 'unknown', error: null })
  } catch (error) {
    patch({ error: friendly(error) })
  }
  return passkey.get()
}

/** First run: create the passkey, derive I_U, persist the user records. */
export async function enrollPasskey(displayName = 'S user', attachment = 'platform') {
  if (passkey.get().status === 'busy') return passkey.get()
  patch({ status: 'busy', error: null })
  try {
    if (passkey.get().enrolled) throw new Error('Already enrolled — unlock instead of creating a second root.')
    const store = await backend()
    const { session, self } = await enroll(store, displayName, attachment)
    await unlockVault(session.localKey)
    patch({ status: 'unlocked', enrolled: true, name: displayName, attachment, session, self, error: null })
  } catch (error) {
    const enrolled = passkey.get().enrolled
    patch({ status: enrolled ? 'locked' : 'unknown', error: friendly(error) })
  }
  return passkey.get()
}

/** Returning run: assert the stored credential, re-derive I_U, build a session. */
export async function unlockPasskey(attachment) {
  if (passkey.get().status === 'busy') return passkey.get()
  patch({ status: 'busy', error: null })
  try {
    const store = await backend()
    const rec = await loadUserRecord(store)
    if (!rec) throw new Error('No passkey registered yet — create one first.')
    const session = await unlock(store, attachment)
    await unlockVault(session.localKey)
    patch({ status: 'unlocked', enrolled: true, name: rec.name, attachment: rec.attachment ?? '', session, self: session.self, error: null })
  } catch (error) {
    const enrolled = passkey.get().enrolled
    patch({ status: enrolled ? 'locked' : 'unknown', error: friendly(error) })
  }
  return passkey.get()
}

/** Drop the in-memory session keys. Enrollment records stay untouched. */
export function lockPasskey() {
  const { enrolled } = passkey.get()
  lockVault()
  patch({ status: enrolled ? 'locked' : 'unknown', session: null, self: null, error: null })
}
