// P2WPKH (native segwit, bech32) addresses.
//
// SHA-256 via WebCrypto; RIPEMD-160 and the BIP173 bech32 encoder are pure JS.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

function rotl(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

const RIPEMD_Z_L = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
]
const RIPEMD_Z_R = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
]
const RIPEMD_S_L = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
]
const RIPEMD_S_R = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
]
const RIPEMD_K_L = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]
const RIPEMD_K_R = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]

function ripemdF(round, x, y, z) {
  if (round === 0) return (x ^ y ^ z) >>> 0
  if (round === 1) return ((x & y) | (~x & z)) >>> 0
  if (round === 2) return ((x | ~y) ^ z) >>> 0
  if (round === 3) return ((x & z) | (y & ~z)) >>> 0
  return (x ^ (y | ~z)) >>> 0
}

/** Pure-JS RIPEMD-160; returns a 20-byte Uint8Array. */
export function ripemd160(input) {
  const length = input.length
  const withPadding = new Uint8Array((((length + 8) >> 6) + 1) * 64)
  withPadding.set(input)
  withPadding[length] = 0x80
  const bitLength = length * 8
  const view = new DataView(withPadding.buffer)
  view.setUint32(withPadding.length - 8, bitLength >>> 0, true)
  view.setUint32(withPadding.length - 4, Math.floor(bitLength / 0x100000000), true)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const words = new Uint32Array(16)
  for (let offset = 0; offset < withPadding.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true)

    let al = h0
    let bl = h1
    let cl = h2
    let dl = h3
    let el = h4
    let ar = h0
    let br = h1
    let cr = h2
    let dr = h3
    let er = h4

    for (let i = 0; i < 80; i++) {
      const round = (i / 16) | 0
      let t = (al + ripemdF(round, bl, cl, dl) + words[RIPEMD_Z_L[i]] + RIPEMD_K_L[round]) >>> 0
      t = (rotl(t, RIPEMD_S_L[i]) + el) >>> 0
      al = el
      el = dl
      dl = rotl(cl, 10)
      cl = bl
      bl = t

      t = (ar + ripemdF(4 - round, br, cr, dr) + words[RIPEMD_Z_R[i]] + RIPEMD_K_R[round]) >>> 0
      t = (rotl(t, RIPEMD_S_R[i]) + er) >>> 0
      ar = er
      er = dr
      dr = rotl(cr, 10)
      cr = br
      br = t
    }

    const t = (h1 + cl + dr) >>> 0
    h1 = (h2 + dl + er) >>> 0
    h2 = (h3 + el + ar) >>> 0
    h3 = (h4 + al + br) >>> 0
    h4 = (h0 + bl + cr) >>> 0
    h0 = t
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, true)
  outView.setUint32(4, h1, true)
  outView.setUint32(8, h2, true)
  outView.setUint32(12, h3, true)
  outView.setUint32(16, h4, true)
  return out
}

/** RIPEMD-160(SHA-256(data)) — the standard Bitcoin hash160. */
export async function hash160(bytes) {
  return ripemd160(await sha256(bytes))
}

function polymod(values) {
  let checksum = 1
  for (const value of values) {
    const top = checksum >> 25
    checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) checksum ^= GENERATOR[i]
    }
  }
  return checksum >>> 0
}

function hrpExpand(hrp) {
  const out = []
  for (const char of hrp) out.push(char.charCodeAt(0) >> 5)
  out.push(0)
  for (const char of hrp) out.push(char.charCodeAt(0) & 31)
  return out
}

function createChecksum(hrp, data) {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])
  const checksum = polymod(values) ^ 1
  const out = []
  for (let i = 0; i < 6; i++) out.push((checksum >> (5 * (5 - i))) & 31)
  return out
}

function convertBits(data, fromBits, toBits, pad) {
  let accumulator = 0
  let bits = 0
  const out = []
  const maxValue = (1 << toBits) - 1
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1
  for (const value of data) {
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator
    bits += fromBits
    while (bits >= toBits) {
      bits -= toBits
      out.push((accumulator >> bits) & maxValue)
    }
  }
  if (pad) {
    if (bits) out.push((accumulator << (toBits - bits)) & maxValue)
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue)) {
    throw new Error('invalid bech32 padding')
  }
  return out
}

/** Segwit v0 bech32 encoding (mainnet `bc1...`). */
export function bech32Encode(hrp, data) {
  const combined = data.concat(createChecksum(hrp, data))
  let out = hrp + '1'
  for (const value of combined) out += CHARSET[value]
  return out
}

/** Native segwit address for a compressed (33-byte) public key. */
export async function p2wpkhAddress(publicKey) {
  const program = await hash160(publicKey)
  return bech32Encode('bc', [0].concat(convertBits(Array.from(program), 8, 5, true)))
}
