import { bytesOf } from './crypto.js'

// ---------------------------------------------------------------------------
// Tor v3 onion service address (rend-spec-v3 section 6):
//
//   checksum = SHA3-256(".onion checksum" || pubkey || version)[0..2]
//   address  = base32(pubkey || checksum || version), lowercase, no padding
//   version  = 0x03
//
// WebCrypto has no SHA3, so we ship a compact keccak-f[1600] sponge here.
// ---------------------------------------------------------------------------

const LANE = 0xffffffffffffffffn // 64-bit mask (2^64 - 1)

function rol64(x, n) {
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & LANE
}

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]

const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
]

function keccakF1600(state) {
  for (let round = 0; round < 24; round++) {
    // theta
    const c = new Array(5).fill(0n)
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
    }
    const d = new Array(5)
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rol64(c[(x + 1) % 5], 1)
    }
    for (let x = 0; x < 25; x++) state[x] ^= d[x % 5]

    // rho + pi
    const b = new Array(25).fill(0n)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rol64(state[x + 5 * y], ROT[x][y])
      }
    }

    // chi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])
      }
    }

    // iota
    state[0] ^= RC[round]
  }
}

function keccakAbsorb(rate, input) {
  const state = new Array(25).fill(0n)
  const lanes = rate / 8

  // The caller guarantees input is rate-aligned and already padded.
  for (let off = 0; off + rate <= input.length; off += rate) {
    for (let i = 0; i < lanes; i++) {
      let lane = 0n
      for (let j = 7; j >= 0; j--) {
        lane = (lane << 8n) | BigInt(input[off + i * 8 + j])
      }
      state[i] ^= lane
    }
    keccakF1600(state)
  }
  return state
}

function keccakSqueeze(state, outLen) {
  const out = new Uint8Array(outLen)
  let written = 0
  while (written < outLen) {
    for (let i = 0; written < outLen && i < 25; i++) {
      let lane = state[i]
      for (let j = 0; written < outLen && j < 8; j++) {
        out[written++] = Number(lane & 0xffn)
        lane >>= 8n
      }
    }
    keccakF1600(state)
  }
  return out
}

// SHA3-256 (NIST padding 0x06, rate 136)
export function sha3_256(msg) {
  const rate = 136
  const plen = Math.ceil((msg.length + 1) / rate) * rate
  const padded = new Uint8Array(plen)
  padded.set(msg)
  padded[msg.length] = 0x06
  padded[padded.length - 1] |= 0x80
  const state = keccakAbsorb(rate, padded)
  return keccakSqueeze(state, 32)
}

// ---- base32 (RFC 4648, lowercase, no padding) ----

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'

export function base32Encode(input) {
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of input) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

// ---- v3 onion address ----

export const ONION_VERSION = 0x03
const CHECKSUM_PREFIX = bytesOf('.onion checksum')

export function onionAddress(ed25519Pub) {
  if (ed25519Pub.length !== 32) throw new Error('ed25519 pubkey must be 32 bytes')
  const version = Uint8Array.of(ONION_VERSION)
  const checksum = sha3_256(concat3(CHECKSUM_PREFIX, ed25519Pub, version)).slice(0, 2)
  const addr = base32Encode(concat3(ed25519Pub, checksum, version))
  return addr.toLowerCase() + '.onion'
}

export function onionAddressFromBase32(raw) {
  const addr = raw.replace(/\.onion$/i, '')
  const decoded = base32Decode(addr)
  if (!decoded || decoded.length !== 35) return null
  const pub = decoded.slice(0, 32)
  const version = decoded[34]
  const checksum = sha3_256(concat3(CHECKSUM_PREFIX, pub, Uint8Array.of(version))).slice(0, 2)
  if (decoded[32] !== checksum[0] || decoded[33] !== checksum[1]) return null
  return { pub, version }
}

function base32Decode(s) {
  s = s.toLowerCase()
  let bits = 0
  let value = 0
  const out = []
  for (const ch of s) {
    const idx = B32.indexOf(ch)
    if (idx < 0) return null
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

function concat3(a, b, c) {
  const out = new Uint8Array(a.length + b.length + c.length)
  out.set(a, 0)
  out.set(b, a.length)
  out.set(c, a.length + b.length)
  return out
}