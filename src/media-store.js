import { backend } from './device-store.js'
import { sessionKey } from './vault.js'
import { aesGcmDecrypt, aesGcmEncrypt, bytesOf, concatBytes, randomBytes } from '../lib/crypto.js'

// Encrypted media blob store.
//
// Files attached to a chat (and voice memos) are stored as sealed AES-GCM
// envelopes in IndexedDB, using the same in-memory session key as the at-rest
// vault (src/vault.js sessionKey()). While S is locked the key is gone, so no
// media — not even its metadata — is readable. Each record is two envelopes so
// listing only decrypts the small metadata envelope, never a whole video:
//
//   media/<id> = u32(metaLen) ++ aes-gcm(meta, aad=meta) ++ aes-gcm(content)
//
// The KV backend is the same IndexedDB wrapper the keystore uses (memoryStore
// fallback in tests), so this needs no new storage layer.

const PREFIX = 'media/'

const AAD_META = 's/media/meta/v1'
const AAD_BLOB = 's/media/blob/v1'

function u32(n) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, false)
  return b
}

function readU32(b, off) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(off, false)
}

async function seal(key, plaintext, aad) {
  return aesGcmEncrypt(key, plaintext, bytesOf(aad))
}

async function open(key, ciphertext, aad) {
  return aesGcmDecrypt(key, ciphertext, bytesOf(aad))
}

function parseMeta(bytes) {
  const meta = JSON.parse(new TextDecoder().decode(bytes))
  return { id: meta.id, name: meta.name, type: meta.type, size: meta.size, created: meta.created }
}

function encodeRecord(metaBytes, contentCipher) {
  return concatBytes(u32(metaBytes.length), metaBytes, contentCipher)
}

/**
 * @typedef {Object} MediaItem
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {number} size
 * @property {number} created
 */

/** Persist a File/Blob (or raw bytes + name) as a sealed media record. */
export async function putMedia(input, fallbackName) {
  const key = sessionKey()
  if (!key) throw new Error('S is locked')
  const name = String(input.name ?? fallbackName ?? 'file')
  const type = String(input.type ?? '')
  const size = input.size ?? (typeof input.byteLength === 'number' ? input.byteLength : 0)
  const data = input.arrayBuffer
    ? new Uint8Array(await input.arrayBuffer())
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input)
  const id = `m-${Date.now().toString(36)}-${randomBytes(6).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')}`
  const meta = { id, name, type, size, created: Date.now() }
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta))
  const metaCipher = await seal(key, metaBytes, AAD_META)
  const blobCipher = await seal(key, data, `${AAD_BLOB}/${id}`)
  const store = await backend()
  await store.set(PREFIX + id, encodeRecord(metaCipher, blobCipher))
  return meta
}

/** Latest-first list of stored media (metadata only — cheap). */
export async function listMedia() {
  const key = sessionKey()
  if (!key) return []
  const store = await backend()
  const rows = await store.list(PREFIX)
  const found = []
  for (const { key: recordKey, value } of rows) {
    try {
      const metaLen = readU32(value, 0)
      const meta = parseMeta(await open(key, value.slice(4, 4 + metaLen), AAD_META))
      found.push({ ...meta, id: recordKey.slice(PREFIX.length) })
    } catch {
      // undecryptable (locked/wrong key/corrupt) — skip silently
    }
  }
  return found.sort((a, b) => b.created - a.created)
}

/** Decrypt a stored media record into a Blob, or null if missing/locked. */
export async function getMedia(id) {
  const key = sessionKey()
  if (!key) return null
  const store = await backend()
  const value = await store.get(PREFIX + id)
  if (!value) return null
  try {
    const metaLen = readU32(value, 0)
    const metaCipher = value.slice(4, 4 + metaLen)
    const meta = parseMeta(await open(key, metaCipher, AAD_META))
    const content = await open(key, value.slice(4 + metaLen), `${AAD_BLOB}/${id}`)
    return { ...meta, blob: new Blob([content], { type: meta.type || 'application/octet-stream' }) }
  } catch {
    return null
  }
}

/** Remove one media record. */
export async function deleteMedia(id) {
  const store = await backend()
  await store.del(PREFIX + id)
}

/** Remove every media record (used by the wipe/security flow). */
export async function clearMedia() {
  const store = await backend()
  for (const { key } of await store.list(PREFIX)) await store.del(key)
}