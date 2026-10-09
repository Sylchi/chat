import { baseName, defaultType, normalizePath, parentOf, segments } from '../util.js'

// Browser File System Access provider (Chromium only). A chosen directory
// handle is persisted in a tiny dedicated IndexedDB so the same folder can be
// re-opened in later sessions (the browser still re-confirms permission).

const DB_NAME = 's-files'
const STORE = 'handles'
const ROOT_KEY = 'fsa-root'

let root = null

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function handleTx(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dirHandle(path, create = false) {
  if (!root) throw new Error('Choose a folder to connect first')
  let handle = root
  for (const segment of segments(path)) handle = await handle.getDirectoryHandle(segment, { create })
  return handle
}

export const fsaProvider = {
  id: 'fsa',
  label: 'This device',
  hint: 'A folder on your computer, opened with the File System Access API (Chromium).',
  kind: 'local',
  available: () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function',
  isConnected: () => root !== null,

  /** Re-open the previously chosen folder without prompting (if still granted). */
  async restore() {
    if (!this.available() || root) return root !== null
    const saved = await handleTx('readonly', (store) => store.get(ROOT_KEY)).catch(() => null)
    if (!saved) return false
    const permission = await saved.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return false
    root = saved
    return true
  },

  async connect() {
    if (!this.available()) throw new Error('This browser does not support the File System Access API')
    if (!root) {
      root = await handleTx('readonly', (store) => store.get(ROOT_KEY)).catch(() => null)
    }
    if (root) {
      let permission = await root.queryPermission({ mode: 'readwrite' })
      if (permission !== 'granted') permission = await root.requestPermission({ mode: 'readwrite' })
      if (permission === 'granted') return { detail: root.name }
      root = null
    }
    root = await window.showDirectoryPicker({ mode: 'readwrite' })
    await handleTx('readwrite', (store) => store.put(root, ROOT_KEY))
    return { detail: root.name }
  },

  disconnect() {
    root = null
  },

  async list(path) {
    const dir = await dirHandle(path)
    const out = []
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') {
        out.push({ name, path: normalizePath(`${path}/${name}`), dir: true, size: 0, modified: 0, type: '' })
      } else {
        const file = await handle.getFile()
        out.push({ name, path: normalizePath(`${path}/${name}`), dir: false, size: file.size, modified: file.lastModified, type: file.type || defaultType(name) })
      }
    }
    return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  },

  async read(path) {
    const dir = await dirHandle(parentOf(path))
    const handle = await dir.getFileHandle(baseName(path))
    const file = await handle.getFile()
    return { name: file.name, type: file.type || defaultType(file.name), size: file.size, blob: file }
  },

  async write(path, blob, name) {
    const dir = await dirHandle(parentOf(path), true)
    const handle = await dir.getFileHandle(name ?? baseName(path), { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    const file = await handle.getFile()
    return { name: file.name, path: normalizePath(path), dir: false, size: file.size, modified: file.lastModified, type: file.type || defaultType(file.name) }
  },

  async mkdir(path) {
    await dirHandle(path, true)
    return { name: baseName(path), path: normalizePath(path), dir: true, size: 0, modified: Date.now(), type: '' }
  },

  async remove(path) {
    const dir = await dirHandle(parentOf(path))
    await dir.removeEntry(baseName(path), { recursive: true })
  },
}
