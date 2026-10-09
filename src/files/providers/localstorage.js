import { fromBase64Url, toBase64Url } from '../../../lib/crypto.js'
import { openBytes, openJson, sealBytes, sealJson } from '../crypt.js'
import { baseName, defaultType, fromPathKey, normalizePath, parentOf, pathKey } from '../util.js'

// localStorage provider — tiny, synchronous storage for small text/file entries.
// Values are sealed with the session key, so keys leak paths only (like the
// rest of the app's localStorage atoms) while contents stay encrypted.
//
//   s:files-ls:m:<pk>  base64url(sealed meta)
//   s:files-ls:d:<pk>  base64url(sealed content)   (files only)

const META = 's:files-ls:m:'
const DATA = 's:files-ls:d:'
const LIMIT = 1_500_000 // localStorage is ~5MB; base64 inflates, so cap per file.

function ls() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function pack(bytes) {
  return toBase64Url(bytes)
}

function unpack(value) {
  return fromBase64Url(value)
}

async function readMeta(key) {
  const raw = ls()?.getItem(META + key)
  if (!raw) return null
  try {
    return await openJson(unpack(raw), 'meta')
  } catch {
    return null
  }
}

async function writeMeta(key, meta) {
  ls().setItem(META + key, pack(await sealJson(meta, 'meta')))
}

function keys() {
  const store = ls()
  if (!store) return []
  const out = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(META)) out.push(k.slice(META.length))
  }
  return out
}

async function allMeta() {
  const out = []
  for (const key of keys()) {
    const meta = await readMeta(key)
    if (meta) out.push({ key, path: fromPathKey(key), ...meta })
  }
  return out
}

function entryFor(path, meta) {
  return {
    name: meta.name ?? baseName(path),
    path,
    dir: !!meta.dir,
    size: meta.size ?? 0,
    modified: meta.modified ?? 0,
    type: meta.type ?? '',
  }
}

export const localStorageProvider = {
  id: 'localstorage',
  label: 'Browser storage',
  hint: 'Small files kept in localStorage, sealed with your key.',
  kind: 'local',
  available: () => typeof localStorage !== 'undefined',
  isConnected: () => true,
  requiresUnlock: true,

  async list(path) {
    const dir = normalizePath(path)
    const metas = await allMeta()
    return metas
      .filter((meta) => parentOf(meta.path) === dir)
      .map((meta) => entryFor(meta.path, meta))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  },

  async read(path) {
    const key = pathKey(path)
    const meta = await readMeta(key)
    if (!meta || meta.dir) throw new Error('Not a file')
    const raw = ls().getItem(DATA + key)
    if (!raw) throw new Error('File not found')
    const content = await openBytes(unpack(raw), 'data')
    return { name: meta.name, type: meta.type || defaultType(meta.name), size: content.length, blob: new Blob([content], { type: meta.type || 'application/octet-stream' }) }
  },

  async write(path, blob, name) {
    const norm = normalizePath(path)
    const data = new Uint8Array(await blob.arrayBuffer())
    if (data.length > LIMIT) throw new Error(`Too large for browser storage (max ${Math.round(LIMIT / 1000)} KB) — use IndexedDB or Drive.`)
    const key = pathKey(norm)
    const meta = { name: name ?? baseName(norm), dir: false, size: data.length, modified: Date.now(), type: blob.type || defaultType(name ?? norm) }
    await writeMeta(key, meta)
    ls().setItem(DATA + key, pack(await sealBytes(data, 'data')))
    return entryFor(norm, meta)
  },

  async mkdir(path) {
    const norm = normalizePath(path)
    const meta = { name: baseName(norm), dir: true, size: 0, modified: Date.now() }
    await writeMeta(pathKey(norm), meta)
    return entryFor(norm, meta)
  },

  async remove(path) {
    const norm = normalizePath(path)
    const key = pathKey(norm)
    const meta = await readMeta(key)
    if (meta?.dir) {
      const prefix = norm === '/' ? '/' : `${norm}/`
      for (const record of await allMeta()) {
        if (record.key === key || record.path.startsWith(prefix)) {
          ls().removeItem(META + record.key)
          ls().removeItem(DATA + record.key)
        }
      }
      return
    }
    ls().removeItem(META + key)
    ls().removeItem(DATA + key)
  },
}
