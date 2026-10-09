import { backend } from '../../device-store.js'
import { openBytes, openJson, sealBytes, sealJson } from '../crypt.js'
import { baseName, defaultType, fromPathKey, normalizePath, parentOf, pathKey } from '../util.js'

// IndexedDB provider — reuses the app's KV backend (same store the keystore and
// media blobs live in). Metadata and content are sealed with the session key.
//
//   files/idb/meta/<pk>  sealed JSON {name,dir,size,modified,type}
//   files/idb/data/<pk>  sealed content bytes

const META = 'files/idb/meta/'
const DATA = 'files/idb/data/'

async function readMeta(store, path) {
  const raw = await store.get(META + pathKey(path))
  if (!raw) return null
  try {
    return await openJson(raw, 'meta')
  } catch {
    return null
  }
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

export const idbProvider = {
  id: 'idb',
  label: 'IndexedDB',
  hint: 'On-device database, sealed with your key. Good for larger files.',
  kind: 'local',
  available: () => typeof indexedDB !== 'undefined',
  isConnected: () => true,
  requiresUnlock: true,

  async list(path) {
    const dir = normalizePath(path)
    const store = await backend()
    const rows = await store.list(META)
    const out = []
    for (const row of rows) {
      const meta = await openJson(row.value, 'meta').catch(() => null)
      if (!meta) continue
      const recordPath = fromPathKey(row.key.slice(META.length))
      if (parentOf(recordPath) === dir) out.push(entryFor(recordPath, meta))
    }
    return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  },

  async read(path) {
    const store = await backend()
    const meta = await readMeta(store, path)
    if (!meta || meta.dir) throw new Error('Not a file')
    const raw = await store.get(DATA + pathKey(path))
    if (!raw) throw new Error('File not found')
    const content = await openBytes(raw, 'data')
    return { name: meta.name, type: meta.type || defaultType(meta.name), size: content.length, blob: new Blob([content], { type: meta.type || 'application/octet-stream' }) }
  },

  async write(path, blob, name) {
    const norm = normalizePath(path)
    const store = await backend()
    const data = new Uint8Array(await blob.arrayBuffer())
    const meta = { name: name ?? baseName(norm), dir: false, size: data.length, modified: Date.now(), type: blob.type || defaultType(name ?? norm) }
    await store.set(META + pathKey(norm), await sealJson(meta, 'meta'))
    await store.set(DATA + pathKey(norm), await sealBytes(data, 'data'))
    return entryFor(norm, meta)
  },

  async mkdir(path) {
    const norm = normalizePath(path)
    const store = await backend()
    const meta = { name: baseName(norm), dir: true, size: 0, modified: Date.now() }
    await store.set(META + pathKey(norm), await sealJson(meta, 'meta'))
    return entryFor(norm, meta)
  },

  async remove(path) {
    const norm = normalizePath(path)
    const store = await backend()
    const meta = await readMeta(store, norm)
    if (meta?.dir) {
      const prefix = norm === '/' ? '/' : `${norm}/`
      for (const row of await store.list(META)) {
        const recordPath = fromPathKey(row.key.slice(META.length))
        if (recordPath === norm || recordPath.startsWith(prefix)) {
          await store.del(META + pathKey(recordPath))
          await store.del(DATA + pathKey(recordPath))
        }
      }
      return
    }
    await store.del(META + pathKey(norm))
    await store.del(DATA + pathKey(norm))
  },
}
