import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import { BRAND_PATHS } from '../src/dom.js'

// Build-time icon generator — no dependencies.
//
// Rasterizes the S monogram (BRAND_PATHS, a 180x180 viewBox) into RGBA PNGs by:
//   1. parsing the SVG path `d` grammar into flattened polygons,
//   2. scanline-filling them with the nonzero winding rule at 4x supersample,
//   3. box-downsampling to anti-aliased coverage,
//   4. compositing the covered pixels over an optional background,
//   5. encoding a minimal PNG (IHDR/IDAT/IEND, zlib deflate, CRC32).
//
// It also emits the OG share card (monogram on a near-black field) since there
// is no text renderer available.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

const VIEWBOX = 180

// ---- SVG path parsing ----

function tokenize(d) {
  const tokens = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g
  let match
  while ((match = re.exec(d))) tokens.push(match[1] ?? Number(match[2]))
  return tokens
}

function flattenCubic(out, [x0, y0], [x1, y1], [x2, y2], [x3, y3], steps = 32) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const e = t * t * t
    out.push([a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3])
  }
}

function flattenQuad(out, [x0, y0], [x1, y1], [x2, y2], steps = 24) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2])
  }
}

function parsePath(d) {
  const tokens = tokenize(d)
  const subpaths = []
  let points = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  let i = 0
  let lastCtrl = null // for S/T reflection
  let lastKind = ''

  const push = (x, y) => {
    points.push([x, y])
    cx = x
    cy = y
  }

  const num = () => {
    const value = tokens[i++]
    if (typeof value !== 'number') throw new Error(`path: expected number, got ${value}`)
    return value
  }

  while (i < tokens.length) {
    const token = tokens[i]
    if (typeof token === 'string') {
      cmd = token
      i++
      if (cmd === 'Z' || cmd === 'z') {
        if (points.length > 2) {
          points.push([sx, sy])
          subpaths.push(points)
        }
        points = []
        push(sx, sy)
        lastCtrl = null
        lastKind = 'Z'
        continue
      }
    } else if (!cmd) {
      throw new Error('path: number before command')
    }
    const rel = cmd === cmd.toLowerCase()
    const baseX = rel ? cx : 0
    const baseY = rel ? cy : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        const x = num() + baseX
        const y = num() + baseY
        if (points.length > 2) subpaths.push(points)
        points = [[x, y]]
        sx = x
        sy = y
        push(x, y)
        cmd = rel ? 'l' : 'L' // subsequent pairs are implicit lineto
        lastKind = 'M'
        lastCtrl = null
        break
      }
      case 'L': {
        push(num() + baseX, num() + baseY)
        lastKind = 'L'
        lastCtrl = null
        break
      }
      case 'H': {
        push(num() + baseX, cy)
        lastKind = 'L'
        lastCtrl = null
        break
      }
      case 'V': {
        push(cx, num() + baseY)
        lastKind = 'L'
        lastCtrl = null
        break
      }
      case 'C': {
        const c1x = num() + baseX
        const c1y = num() + baseY
        const c2x = num() + baseX
        const c2y = num() + baseY
        const x = num() + baseX
        const y = num() + baseY
        flattenCubic(points, [cx, cy], [c1x, c1y], [c2x, c2y], [x, y])
        lastCtrl = [c2x, c2y]
        lastKind = 'C'
        cx = x
        cy = y
        break
      }
      case 'S': {
        const [rx, ry] = lastKind === 'C' || lastKind === 'S' ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy]
        const c2x = num() + baseX
        const c2y = num() + baseY
        const x = num() + baseX
        const y = num() + baseY
        flattenCubic(points, [cx, cy], [rx, ry], [c2x, c2y], [x, y])
        lastCtrl = [c2x, c2y]
        lastKind = 'S'
        cx = x
        cy = y
        break
      }
      case 'Q': {
        const qx = num() + baseX
        const qy = num() + baseY
        const x = num() + baseX
        const y = num() + baseY
        flattenQuad(points, [cx, cy], [qx, qy], [x, y])
        lastCtrl = [qx, qy]
        lastKind = 'Q'
        cx = x
        cy = y
        break
      }
      case 'T': {
        const [rx, ry] = lastKind === 'Q' || lastKind === 'T' ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy]
        const x = num() + baseX
        const y = num() + baseY
        flattenQuad(points, [cx, cy], [rx, ry], [x, y])
        lastCtrl = [rx, ry]
        lastKind = 'T'
        cx = x
        cy = y
        break
      }
      default:
        throw new Error(`path: unsupported command ${cmd}`)
    }
  }
  if (points.length > 2) subpaths.push(points)
  return subpaths.filter((sub) => sub.length > 2)
}

// ---- rasterization ----

/**
 * Scanline-fill the paths (nonzero winding) at `ss` supersample, then box
 * downsample to a W x H coverage map (0..255).
 */
function coverage(paths, W, H, { ss = 4, fill = 0.88 } = {}) {
  const sw = W * ss
  const sh = H * ss
  const bits = new Uint8Array(sw * sh)
  const scale = (Math.min(W, H) * fill) / VIEWBOX
  const scaleSS = scale * ss
  const offsetX = ((W - VIEWBOX * scale) / 2) * ss
  const offsetY = ((H - VIEWBOX * scale) / 2) * ss

  const edges = []
  for (const d of paths) {
    for (const sub of parsePath(d)) {
      const pts = sub.map(([x, y]) => [x * scaleSS + offsetX, y * scaleSS + offsetY])
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j]
        const b = pts[(j + 1) % pts.length]
        if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]])
      }
    }
  }

  const crossings = []
  for (let sy = 0; sy < sh; sy++) {
    const y = sy + 0.5
    crossings.length = 0
    for (const [x0, y0, x1, y1] of edges) {
      const ymin = Math.min(y0, y1)
      const ymax = Math.max(y0, y1)
      if (y < ymin || y >= ymax) continue
      const t = (y - y0) / (y1 - y0)
      crossings.push([x0 + t * (x1 - x0), y1 > y0 ? 1 : -1])
    }
    if (!crossings.length) continue
    crossings.sort((a, b) => a[0] - b[0])
    let wind = 0
    const row = sy * sw
    for (let k = 0; k < crossings.length - 1; k++) {
      wind += crossings[k][1]
      if (wind === 0) continue
      let start = Math.ceil(crossings[k][0] - 0.5)
      let end = Math.ceil(crossings[k + 1][0] - 0.5)
      if (start < 0) start = 0
      if (end > sw) end = sw
      for (let x = start; x < end; x++) bits[row + x] = 1
    }
  }

  const out = new Uint8Array(W * H)
  const area = ss * ss
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0
      for (let dy = 0; dy < ss; dy++) {
        const row = (y * ss + dy) * sw + x * ss
        for (let dx = 0; dx < ss; dx++) sum += bits[row + dx]
      }
      out[y * W + x] = Math.round((sum * 255) / area)
    }
  }
  return out
}

function compose(cov, W, H, fg, bg) {
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const a = cov[i] / 255
    const o = i * 4
    if (bg) {
      rgba[o] = Math.round(bg[0] * (1 - a) + fg[0] * a)
      rgba[o + 1] = Math.round(bg[1] * (1 - a) + fg[1] * a)
      rgba[o + 2] = Math.round(bg[2] * (1 - a) + fg[2] * a)
      rgba[o + 3] = 255
    } else {
      rgba[o] = fg[0]
      rgba[o + 1] = fg[1]
      rgba[o + 2] = fg[2]
      rgba[o + 3] = cov[i]
    }
  }
  return rgba
}

// ---- minimal PNG encoder ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(W, H, rgba) {
  const stride = W * 4
  const raw = Buffer.alloc((stride + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function writeIcon(name, W, H, { fg, bg = null, fill = 0.88, ss = 4 }) {
  const cov = coverage(BRAND_PATHS, W, H, { ss, fill })
  const png = encodePng(W, H, compose(cov, W, H, fg, bg))
  writeFileSync(join(publicDir, name), png)
  return name
}

// Favicons: black monogram on transparency.
// App / maskable icons: white monogram on solid black (opaque home-screen art).
// OG card: monogram on a near-black field.
const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const NEAR_BLACK = [10, 10, 11]

const written = [
  writeIcon('favicon-16x16.png', 16, 16, { fg: BLACK, fill: 0.92, ss: 6 }),
  writeIcon('favicon-32x32.png', 32, 32, { fg: BLACK, fill: 0.92, ss: 6 }),
  writeIcon('apple-icon.png', 180, 180, { fg: WHITE, bg: BLACK, fill: 0.7 }),
  writeIcon('icon-192.png', 192, 192, { fg: WHITE, bg: BLACK, fill: 0.7 }),
  writeIcon('icon-512.png', 512, 512, { fg: WHITE, bg: BLACK, fill: 0.7 }),
  writeIcon('maskable-512.png', 512, 512, { fg: WHITE, bg: BLACK, fill: 0.55 }),
  writeIcon('og-image.png', 1200, 630, { fg: WHITE, bg: NEAR_BLACK, fill: 0.42, ss: 2 }),
]

console.log(`icons: wrote ${written.length} files to public/ (${written.join(', ')})`)
