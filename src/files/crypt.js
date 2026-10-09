import { aesGcmDecrypt, aesGcmEncrypt, bytesOf } from '../../lib/crypto.js'
import { sessionKey } from '../vault.js'

// File contents and metadata for the local providers are sealed with the same
// in-memory session key as the rest of the app's at-rest data. The key only
// exists while S is unlocked, so nothing is readable from storage when locked.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function key() {
  const k = sessionKey()
  if (!k) throw new Error('S is locked')
  return k
}

export function sealBytes(bytes, aad = '') {
  return aesGcmEncrypt(key(), bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), bytesOf(`s/files/v1/${aad}`))
}

export function openBytes(cipher, aad = '') {
  return aesGcmDecrypt(key(), cipher, bytesOf(`s/files/v1/${aad}`))
}

export function sealJson(value, aad = '') {
  return sealBytes(encoder.encode(JSON.stringify(value)), aad)
}

export function openJson(cipher, aad = '') {
  return openBytes(cipher, aad).then((bytes) => JSON.parse(decoder.decode(bytes)))
}
