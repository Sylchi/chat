// BIP32 hierarchical deterministic keys over secp256k1.
//
// Browser-native: HMAC-SHA512 comes from WebCrypto, and the secp256k1 scalar
// multiplication (needed only to serialize public keys) is implemented here on
// BigInt. No dependencies, no Node built-ins.

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const G = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
}

const HARDENED = 0x80000000
const encoder = new TextEncoder()

function mod(value, m = P) {
  const r = value % m
  return r >= 0n ? r : r + m
}

function powmod(base, exponent, m) {
  let result = 1n
  base = mod(base, m)
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % m
    base = (base * base) % m
    exponent >>= 1n
  }
  return result
}

// Affine point arithmetic (a = 0, b = 7).
function pointDouble(point) {
  if (!point || point.y === 0n) return null
  const slope = mod(3n * point.x * point.x * powmod(2n * point.y, P - 2n, P))
  const x = mod(slope * slope - 2n * point.x)
  return { x, y: mod(slope * (point.x - x) - point.y) }
}

function pointAdd(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.x === b.x) {
    if (mod(a.y + b.y) === 0n) return null
    return pointDouble(a)
  }
  const slope = mod((b.y - a.y) * powmod(b.x - a.x, P - 2n, P))
  const x = mod(slope * slope - a.x - b.x)
  return { x, y: mod(slope * (a.x - x) - a.y) }
}

function pointMul(scalar, point = G) {
  let result = null
  let addend = point
  let k = scalar
  while (k > 0n) {
    if (k & 1n) result = pointAdd(result, addend)
    addend = pointDouble(addend)
    k >>= 1n
  }
  return result
}

function bytesToBigInt(bytes) {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

function bigIntToBytes(value, length = 32) {
  const out = new Uint8Array(length)
  let v = value
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

function serializePublicKey(point) {
  if (!point) throw new Error('point at infinity')
  const out = new Uint8Array(33)
  out[0] = (point.y & 1n) === 0n ? 0x02 : 0x03
  out.set(bigIntToBytes(point.x, 32), 1)
  return out
}

function writeUInt32BE(target, offset, value) {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

async function hmacSha512(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

function node(privateKey, chainCode) {
  const secret = bytesToBigInt(privateKey)
  if (secret === 0n || secret >= N) throw new Error('Invalid private key')
  return { privateKey, chainCode, publicKey: serializePublicKey(pointMul(secret)) }
}

async function childKey(parent, index) {
  const data = new Uint8Array(37)
  if (index >= HARDENED) {
    data.set(parent.privateKey, 1)
  } else {
    data.set(parent.publicKey, 0)
  }
  writeUInt32BE(data, 33, index)

  const digest = await hmacSha512(parent.chainCode, data)
  const tweak = bytesToBigInt(digest.slice(0, 32))
  const secret = (tweak + bytesToBigInt(parent.privateKey)) % N
  if (tweak >= N || secret === 0n) throw new Error('Invalid child key')
  return node(bigIntToBytes(secret, 32), digest.slice(32, 64))
}

/** Master node from a 16..64-byte seed (BIP39 seed is 64 bytes). */
export async function fromSeed(seed) {
  const digest = await hmacSha512(encoder.encode('Bitcoin seed'), seed)
  return node(digest.slice(0, 32), digest.slice(32, 64))
}

/** Walk a path like `m/84'/0'/0'/0/0` and return the child node. */
export async function derivePath(parent, path = "m/84'/0'/0'/0/0") {
  let current = parent
  for (const segment of path.split('/')) {
    if (segment === '' || segment === 'm' || segment === 'M') continue
    const hardened = /[hH']$/.test(segment)
    const index = parseInt(hardened ? segment.slice(0, -1) : segment, 10)
    if (!Number.isInteger(index) || index < 0 || index >= HARDENED) {
      throw new Error(`Invalid path segment: ${segment}`)
    }
    current = await childKey(current, index + (hardened ? HARDENED : 0))
  }
  return current
}
