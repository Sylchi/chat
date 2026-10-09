// Minimal QR Code encoder — byte mode, error-correction level M, versions 1-10.
//
// Written from scratch (no dependencies) because the link-a-device flow needs
// to render a QR of the device payload in-browser. Covers exactly what S needs:
// UTF-8/byte data up to 213 bytes, which comfortably fits a peer payload.
//
// Exports qrMatrix(text) -> boolean[][] and qrSvg(text, opts) -> SVG string.

// ---- GF(256) arithmetic (primitive polynomial 0x11d) ----
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function rsEncode(data, ecLen) {
  // Generator polynomial ∏ (x - α^i) for i in 0..ecLen-1, monic (gen[0] === 1).
  let gen = [1]
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= gfMul(gen[j], EXP[i])
    }
    gen = next
  }
  // Polynomial long division of data·x^ecLen by gen; remainder is the EC bytes.
  const res = data.slice()
  for (let i = 0; i < data.length; i++) {
    const factor = res[i]
    if (factor === 0) continue
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], factor)
  }
  return res.slice(data.length)
}

// ---- per-version tables (level M) ----
// { ec, groups: [[count, dataCodewords], ...] }
const RS_BLOCKS = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
}

const ALIGN = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

function dataCapacity(version) {
  const { groups } = RS_BLOCKS[version]
  return groups.reduce((sum, [count, size]) => sum + count * size, 0)
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= 10; version++) {
    const lengthBits = version < 10 ? 8 : 16
    const capacity = Math.floor((dataCapacity(version) * 8 - 4 - lengthBits) / 8)
    if (byteLength <= capacity) return version
  }
  throw new Error(`qr: payload too large (${byteLength} bytes, max 213)`)
}

function encodeCodewords(text, version) {
  const bytes = new TextEncoder().encode(text)
  const total = dataCapacity(version)
  const lengthBits = version < 10 ? 8 : 16
  const bits = []
  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, lengthBits)
  for (const byte of bytes) push(byte, 8)
  const capacityBits = total * 8
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const pad = [0xec, 0x11]
  for (let i = 0; bits.length < capacityBits; i++) push(pad[i % 2], 8)
  const codewords = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j]
    codewords.push(value)
  }

  // Split into blocks, error-correct each, then interleave.
  const { ec, groups } = RS_BLOCKS[version]
  const blocks = []
  let cursor = 0
  for (const [count, size] of groups) {
    for (let b = 0; b < count; b++) {
      const data = codewords.slice(cursor, cursor + size)
      cursor += size
      blocks.push({ data, ec: rsEncode(data, ec) })
    }
  }
  const maxData = Math.max(...blocks.map((block) => block.data.length))
  const out = []
  for (let i = 0; i < maxData; i++) for (const block of blocks) if (i < block.data.length) out.push(block.data[i])
  for (let i = 0; i < ec; i++) for (const block of blocks) out.push(block.ec[i])
  return out
}

// ---- module placement ----

function bitLength(value) {
  let count = 0
  while (value !== 0) {
    count++
    value >>>= 1
  }
  return count
}

function bchTypeInfo(data) {
  const G15 = 0b10100110111
  let d = data << 10
  while (bitLength(d) - bitLength(G15) >= 0) d ^= G15 << (bitLength(d) - bitLength(G15))
  return ((data << 10) | d) ^ 0b101010000010010
}

function bchTypeNumber(version) {
  const G18 = 0b1111100100101
  let d = version << 12
  while (bitLength(d) - bitLength(G18) >= 0) d ^= G18 << (bitLength(d) - bitLength(G18))
  return (version << 12) | d
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
]

function buildMatrix(version, codewords, mask) {
  const N = version * 4 + 17
  const modules = Array.from({ length: N }, () => new Array(N).fill(null))
  const reserved = Array.from({ length: N }, () => new Array(N).fill(false))

  const finder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      if (row + r < 0 || row + r >= N) continue
      for (let c = -1; c <= 7; c++) {
        if (col + c < 0 || col + c >= N) continue
        const dark =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        modules[row + r][col + c] = dark
        reserved[row + r][col + c] = true
      }
    }
  }
  finder(0, 0)
  finder(N - 7, 0)
  finder(0, N - 7)

  for (let i = 8; i < N - 8; i++) {
    if (modules[i][6] === null) {
      modules[i][6] = i % 2 === 0
      reserved[i][6] = true
    }
    if (modules[6][i] === null) {
      modules[6][i] = i % 2 === 0
      reserved[6][i] = true
    }
  }

  for (const row of ALIGN[version]) {
    for (const col of ALIGN[version]) {
      if (modules[row][col] !== null) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          modules[row + dr][col + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
          reserved[row + dr][col + dc] = true
        }
      }
    }
  }

  const bits = bchTypeInfo((0 << 3) | mask) // level M = 0
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1
    if (i < 6) {
      modules[i][8] = dark
      reserved[i][8] = true
    } else if (i < 8) {
      modules[i + 1][8] = dark
      reserved[i + 1][8] = true
    } else {
      modules[N - 15 + i][8] = dark
      reserved[N - 15 + i][8] = true
    }
  }
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1
    if (i < 8) {
      modules[8][N - i - 1] = dark
      reserved[8][N - i - 1] = true
    } else if (i < 9) {
      modules[8][15 - i - 1 + 1] = dark
      reserved[8][15 - i - 1 + 1] = true
    } else {
      modules[8][15 - i - 1] = dark
      reserved[8][15 - i - 1] = true
    }
  }
  modules[N - 8][8] = true
  reserved[N - 8][8] = true

  if (version >= 7) {
    const vbits = bchTypeNumber(version)
    for (let i = 0; i < 18; i++) {
      const dark = ((vbits >> i) & 1) === 1
      modules[Math.floor(i / 3)][(i % 3) + N - 11] = dark
      reserved[Math.floor(i / 3)][(i % 3) + N - 11] = true
      modules[(i % 3) + N - 11][Math.floor(i / 3)] = dark
      reserved[(i % 3) + N - 11][Math.floor(i / 3)] = true
    }
  }

  let row = N - 1
  let inc = -1
  let bitIndex = 7
  let byteIndex = 0
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (reserved[row][cc]) continue
        let dark = byteIndex < codewords.length && ((codewords[byteIndex] >>> bitIndex) & 1) === 1
        if (MASKS[mask](row, cc)) dark = !dark
        modules[row][cc] = dark
        bitIndex--
        if (bitIndex === -1) {
          byteIndex++
          bitIndex = 7
        }
      }
      row += inc
      if (row < 0 || row >= N) {
        row -= inc
        inc = -inc
        break
      }
    }
  }
  return { modules, reserved, N }
}

function penalty(modules) {
  const N = modules.length
  let score = 0
  // Rule 1: runs of 5+ same-colour modules.
  const runScore = (line) => {
    let total = 0
    let run = 1
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) run++
      else {
        if (run >= 5) total += 3 + (run - 5)
        run = 1
      }
    }
    if (run >= 5) total += 3 + (run - 5)
    return total
  }
  for (let i = 0; i < N; i++) {
    score += runScore(modules[i])
    score += runScore(modules.map((r) => r[i]))
  }
  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const v = modules[r][c]
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3
    }
  }
  // Rule 3: finder-like patterns.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false]
  const matches = (line, at) => pattern.every((p, k) => line[at + k] === p)
  for (let i = 0; i < N; i++) {
    const row = modules[i]
    const col = modules.map((r) => r[i])
    for (let j = 0; j <= N - 11; j++) {
      if (matches(row, j)) score += 40
      if (matches(col, j)) score += 40
    }
  }
  // Rule 4: dark/light balance.
  let dark = 0
  for (const row of modules) for (const v of row) if (v) dark++
  const percent = (dark * 100) / (N * N)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10
  return score
}

export function qrMatrix(text) {
  const version = chooseVersion(new TextEncoder().encode(text).length)
  const codewords = encodeCodewords(text, version)
  let best = null
  for (let mask = 0; mask < 8; mask++) {
    const built = buildMatrix(version, codewords, mask)
    const score = penalty(built.modules)
    if (!best || score < best.score) best = { ...built, score, mask }
  }
  return best.modules
}

/**
 * Full construction details for a payload — used by tests to decode the output
 * back to the original bytes and prove the encoder is correct.
 */
export function qrInspect(text) {
  const version = chooseVersion(new TextEncoder().encode(text).length)
  const codewords = encodeCodewords(text, version)
  let best = null
  for (let mask = 0; mask < 8; mask++) {
    const built = buildMatrix(version, codewords, mask)
    const score = penalty(built.modules)
    if (!best || score < best.score) best = { ...built, score, mask }
  }
  return { version, mask: best.mask, modules: best.modules, reserved: best.reserved, codewords, N: best.N }
}

/** Render the QR as a crisp, scalable SVG (one path for all dark modules). */
export function qrSvg(text, { size = 168, margin = 4, label = 'QR code' } = {}) {
  const modules = qrMatrix(text)
  const N = modules.length
  const total = N + margin * 2
  let path = ''
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (modules[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}
