import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesOf,
  fromBase64Url,
  strOf,
  toBase64Url,
} from '../lib/crypto.js'

// ---------------------------------------------------------------------------
// At-rest vault.
//
// Every persistent atom in src/store.js is encrypted with a symmetric key
// derived from the passkey PRF (lib/identity.js localKeyFromPRF). The key is
// held in memory only while unlocked and dropped on lock — so the localStorage
// blobs are unreadable without a WebAuthn unlock. Stored form:
//
//   { "__s": 1, "c": base64url(aes-gcm(JSON(value))) }
//
// Plaintext blobs written before encryption existed are read as-is and
// re-encrypted on the next unlock (migration).
// ---------------------------------------------------------------------------

const AAD = bytesOf('s/at-rest/v1')
const MARK = '__s'

let encKey = null
let pending = Promise.resolve()
const entries = new Map() // storage key -> { apply(value), lockedValue() }

export function registerEntry(key, entry) {
  entries.set(key, entry)
}

export function isUnlocked() {
  return encKey !== null
}

/**
 * The in-memory at-rest key, or null while locked. Media blobs are sealed with
 * the same session key as localStorage atoms, so locked === unreadable media.
 */
export function sessionKey() {
  return encKey
}

function storage() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

async function encryptValue(key, value) {
  const blob = await aesGcmEncrypt(key, bytesOf(JSON.stringify(value)), AAD)
  return JSON.stringify({ [MARK]: 1, c: toBase64Url(blob) })
}

async function decryptValue(envelope) {
  const plain = await aesGcmDecrypt(encKey, fromBase64Url(envelope.c), AAD)
  return JSON.parse(strOf(plain))
}

/**
 * Queue one atom value to be sealed and written. No-op while locked (never
 * writes plaintext). Writes are serialized; await settled() to drain them.
 */
export function persist(key, value) {
  const ls = storage()
  if (!encKey || !ls) return pending
  const keySnapshot = encKey
  pending = pending.then(async () => {
    try {
      ls.setItem(key, await encryptValue(keySnapshot, value))
    } catch {
      // quota / serialization failure — keep the in-memory value
    }
  })
  return pending
}

/** Resolves once every queued write has hit storage. */
export function settled() {
  return pending
}

async function rehydrate() {
  const ls = storage()
  if (!ls) return
  await Promise.all(
    [...entries].map(async ([key, entry]) => {
      const raw = ls.getItem(key)
      if (raw == null) return
      try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed[MARK] === 1 && typeof parsed.c === 'string') {
          entry.apply(await decryptValue(parsed))
        } else {
          entry.apply(parsed)
          await persist(key, parsed) // migrate legacy plaintext
        }
      } catch {
        // wrong key or corrupt blob — leave the atom at its locked value
      }
    }),
  )
}

/** Derive-stable key from the passkey session; loads and decrypts stored data. */
export async function unlockVault(localKey) {
  if (!(localKey instanceof Uint8Array) || localKey.length !== 32) {
    throw new Error('vault key must be 32 bytes')
  }
  encKey = localKey
  await rehydrate()
}

/** Drop the key and blank every atom so no plaintext lingers in memory. */
export function lockVault() {
  encKey = null
  for (const entry of entries.values()) entry.apply(entry.lockedValue())
}
