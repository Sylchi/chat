// Browser-safe crypto helpers (WebCrypto only — no Buffer, no node: built-ins).
// Runs in every modern browser and under Node 16+ (global crypto/atob/btoa).

export function u8(len) {
  return new Uint8Array(len)
}

export function randomBytes(n) {
  const out = new Uint8Array(n)
  if (typeof crypto !== 'undefined') crypto.getRandomValues(out)
  return out
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function bytesOf(s) {
  if (s instanceof Uint8Array) return s
  if (s instanceof ArrayBuffer) return new Uint8Array(s)
  return enc.encode(s)
}

export function strOf(b) {
  return dec.decode(b)
}

export function bytesToHex(b) {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
}

export function concatBytes(...arrs) {
  let total = 0
  for (const a of arrs) total += a.length
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) {
    out.set(a, off)
    off += a.length
  }
  return out
}

// ---- base64url (padding stripped), for JWK transport ----

export function toBase64Url(b) {
  if (typeof btoa === 'undefined') throw new Error('btoa unavailable')
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < b.length; i += chunk) {
    bin += String.fromCharCode(...b.subarray(i, i + chunk))
  }
  return btoa(bin)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export function fromBase64Url(s) {
  if (typeof atob === 'undefined') throw new Error('atob unavailable')
  const pad = s.length % 4 === 0 ? s : s + '='.repeat(4 - (s.length % 4))
  const bin = atob(pad.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

// ---- SHA-256 ----

export async function sha256(msg) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', msg))
}

// ---- HKDF-SHA256 (RFC 5869) ----

export async function hkdf(ikm, salt, info, length = 32) {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF', hash: 'SHA-256' }, false, [
    'deriveBits',
  ])
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt ?? new Uint8Array(0), info },
      key,
      length * 8,
    ),
  )
}

// ---- PKCS#8 import templates (fixed 48-byte DER for OKP keys) ----
// WebCrypto importKey('pkcs8') auto-derives the public key from the seed.

const OKP_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65]
// + OID byte 0x70 (ed25519) or 0x6e (x25519)
const OKP_TAIL = [0x04, 0x22, 0x04, 0x20]

function spacToPkcs8(seed, oid) {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes')
  const der = new Uint8Array(48)
  der.set([...OKP_PREFIX, oid, ...OKP_TAIL], 0)
  der.set(seed, 16 + 0)
  return der
}

function jwkX(jwk) {
  const x = fromBase64Url(jwk.x)
  if (x.length !== 32) throw new Error('bad jwk x')
  return x
}

function jwkD(jwk) {
  const d = fromBase64Url(jwk.d)
  if (d.length !== 32) throw new Error('bad jwk d')
  return d
}

// ---- Ed25519 ----

export async function ed25519Keypair(seed) {
  /** @type {CryptoKeyPair} */
  let key
  if (seed !== undefined) {
    const der = spacToPkcs8(seed, 0x70)
    const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, true, ['sign'])
    const jwk = await crypto.subtle.exportKey('jwk', priv)
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x, ext: true },
      { name: 'Ed25519' },
      true,
      ['verify'],
    )
    key = { privateKey: priv, publicKey: pubKey }
  } else {
    key = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  }
  const pubJwk = await crypto.subtle.exportKey('jwk', key.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', key.privateKey)
  return { pub: jwkX(pubJwk), priv: jwkD(privJwk) }
}

export async function ed25519Sign(priv, msg) {
  const der = spacToPkcs8(priv, 0x70)
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, msg))
}

// ---- X25519 ----

export async function x25519Keypair(seed) {
  /** @type {CryptoKeyPair} */
  let key
  if (seed !== undefined) {
    const der = spacToPkcs8(seed, 0x6e)
    const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'X25519' }, true, ['deriveBits'])
    const jwk = await crypto.subtle.exportKey('jwk', priv)
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'X25519', x: jwk.x, ext: true },
      { name: 'X25519' },
      true,
      [],
    )
    key = { privateKey: priv, publicKey: pubKey }
  } else {
    key = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])
  }
  const pubJwk = await crypto.subtle.exportKey('jwk', key.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', key.privateKey)
  return { pub: jwkX(pubJwk), priv: jwkD(privJwk) }
}

export async function x25519SharedSecret(priv, theirPub) {
  const der = spacToPkcs8(priv, 0x6e)
  const privKey = await crypto.subtle.importKey('pkcs8', der, { name: 'X25519' }, false, ['deriveBits'])
  const pubKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'X25519', x: toBase64Url(theirPub), ext: true },
    { name: 'X25519' },
    false,
    [],
  )
  const bits = await crypto.subtle.deriveBits({ name: 'X25519', public: pubKey }, privKey, 256)
  return new Uint8Array(bits)
}

// ---- AES-GCM with aad ----

export async function aesGcmEncrypt(key, plain, aad) {
  const iv = randomBytes(12)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt'])
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad ?? undefined },
    cryptoKey,
    plain,
  )
  return concatBytes(iv, new Uint8Array(ct))
}

export async function aesGcmDecrypt(key, blob, aad) {
  if (blob.length < 13) throw new Error('aes-gcm: too short')
  const iv = blob.slice(0, 12)
  const ct = blob.slice(12)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad ?? undefined },
    cryptoKey,
    ct,
  )
  return new Uint8Array(plain)
}