import { fromBase64Url, toBase64Url } from '../../lib/crypto.js'

// Small path / encoding helpers shared by the file providers. Paths are always
// POSIX-style, absolute within a provider, with '/' as the root.

export function normalizePath(path) {
  const parts = String(path ?? '/')
    .split('/')
    .filter((part) => part && part !== '.')
  return '/' + parts.join('/')
}

export function joinPath(base, name) {
  return normalizePath(`${base === '/' ? '' : base}/${name}`)
}

export function parentOf(path) {
  const norm = normalizePath(path)
  if (norm === '/') return '/'
  return normalizePath(norm.slice(0, norm.lastIndexOf('/')))
}

export function baseName(path) {
  const norm = normalizePath(path)
  return norm === '/' ? '/' : norm.slice(norm.lastIndexOf('/') + 1)
}

export function segments(path) {
  return normalizePath(path).split('/').filter(Boolean)
}

export function pathKey(path) {
  return toBase64Url(new TextEncoder().encode(normalizePath(path)))
}

export function fromPathKey(key) {
  return new TextDecoder().decode(fromBase64Url(key))
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function isTextLike(name, type = '') {
  if (type && (type.startsWith('text/') || type === 'application/json')) return true
  return /\.(txt|md|markdown|json|js|mjs|cjs|ts|tsx|jsx|css|html|htm|csv|tsv|xml|yml|yaml|toml|ini|log|sh|py|rb|go|rs|java|c|h|cpp|sql|svg)$/i.test(name)
}

export function defaultType(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const types = {
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
  }
  return types[ext] ?? 'application/octet-stream'
}
