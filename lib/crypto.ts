export type Byte32 = Uint8Array & { readonly __byte32: unique symbol }

export function u8(len: number): Byte32 {
  return new Uint8Array(len) as Byte32
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  if (typeof crypto !== 'undefined') crypto.getRandomValues(out)
  return out
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function bytesOf(s: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (s instanceof Uint8Array) return s
  if (s instanceof ArrayBuffer) return new Uint8Array(s)
  return enc.encode(s)
}

export function strOf(b: Uint8Array): string {
  return dec.decode(b)
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
}

export function concatBytes(...arrs: Uint8Array[]): Uint8Array {
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

export function toBase64Url(b: Uint8Array): string {
  if (typeof btoa !== 'undefined') {
    return btoa(String.fromCharCode(...b))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  }
  return Buffer.from(b).toString('base64url')
}

export function fromBase64Url(s: string): Uint8Array {
  if (typeof atob !== 'undefined') {
    const pad = s.length % 4 === 0 ? s : s + '='.repeat(4 - (s.length % 4))
    const bin = atob(pad.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  }
  return Uint8Array.from(Buffer.from(s, 'base64url'))
}

// ---- SHA-256 ----

export async function sha256(msg: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', msg))
}

// ---- HKDF-SHA256 (RFC 5869) ----

export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array,
  length = 32,
): Promise<Uint8Array> {
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

function spacToPkcs8(seed: Uint8Array, oid: number): Uint8Array {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes')
  const der = new Uint8Array(48)
  der.set([...OKP_PREFIX, oid, ...OKP_TAIL], 0)
  der.set(seed, 16 + 0)
  return der
}

function jwkX(jwk: JsonWebKey): Byte32 {
  const x = fromBase64Url(jwk.x!)
  if (x.length !== 32) throw new Error('bad jwk x')
  return x as Byte32
}

function jwkD(jwk: JsonWebKey): Byte32 {
  const d = fromBase64Url(jwk.d!)
  if (d.length !== 32) throw new Error('bad jwk d')
  return d as Byte32
}

// ---- Ed25519 ----

export interface EdKeyPair {
  pub: Byte32
  priv: Byte32
}

export async function ed25519Keypair(seed?: Uint8Array): Promise<EdKeyPair> {
  let key: CryptoKeyPair
  if (seed !== undefined) {
    const der = spacToPkcs8(seed, 0x70)
    const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, true, [
      'sign',
    ])
    const jwk = await crypto.subtle.exportKey('jwk', priv)
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: jwk.x, ext: true } as JsonWebKey,
      { name: 'Ed25519' },
      true,
      ['verify'],
    )
    key = { privateKey: priv, publicKey: pubKey }
  } else {
    key = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  }
  const pubJwk = await crypto.subtle.exportKey('jwk', key.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', key.privateKey)
  return { pub: jwkX(pubJwk), priv: jwkD(privJwk) }
}

export async function ed25519Sign(priv: Byte32, msg: Uint8Array): Promise<Uint8Array> {
  const der = spacToPkcs8(priv, 0x70)
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, msg))
}

// ---- X25519 ----

export interface XKeyPair {
  pub: Byte32
  priv: Byte32
}

export async function x25519Keypair(seed?: Uint8Array): Promise<XKeyPair> {
  let key: CryptoKeyPair
  if (seed !== undefined) {
    const der = spacToPkcs8(seed, 0x6e)
    const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'X25519' }, true, [
      'deriveBits',
    ])
    const jwk = await crypto.subtle.exportKey('jwk', priv)
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'X25519', x: jwk.x, ext: true } as JsonWebKey,
      { name: 'X25519' },
      true,
      [],
    )
    key = { privateKey: priv, publicKey: pubKey }
  } else {
    key = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair
  }
  const pubJwk = await crypto.subtle.exportKey('jwk', key.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', key.privateKey)
  return { pub: jwkX(pubJwk), priv: jwkD(privJwk) }
}

export async function x25519SharedSecret(priv: Byte32, theirPub: Byte32): Promise<Byte32> {
  const der = spacToPkcs8(priv, 0x6e)
  const privKey = await crypto.subtle.importKey('pkcs8', der, { name: 'X25519' }, false, [
    'deriveBits',
  ])
  const pubKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'X25519', x: toBase64Url(theirPub), ext: true } as JsonWebKey,
    { name: 'X25519' },
    false,
    [],
  )
  const bits = await crypto.subtle.deriveBits({ name: 'X25519', public: pubKey }, privKey, 256)
  return new Uint8Array(bits) as Byte32
}

// ---- AES-GCM with aad ----

export async function aesGcmEncrypt(
  key: Byte32,
  plain: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const iv = randomBytes(12)
  const cryptoKey = await crypto.subtle.importKey('raw', key as Uint8Array, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad ?? undefined },
    cryptoKey,
    plain,
  )
  return concatBytes(iv, new Uint8Array(ct))
}

export async function aesGcmDecrypt(
  key: Byte32,
  blob: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  if (blob.length < 13) throw new Error('aes-gcm: too short')
  const iv = blob.slice(0, 12)
  const ct = blob.slice(12)
  const cryptoKey = await crypto.subtle.importKey('raw', key as Uint8Array, { name: 'AES-GCM' }, false, [
    'decrypt',
  ])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad ?? undefined },
    cryptoKey,
    ct,
  )
  return new Uint8Array(plain)
}