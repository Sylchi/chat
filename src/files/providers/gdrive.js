import { googleClientId } from '../config.js'
import { baseName, defaultType, joinPath, normalizePath, parentOf, segments } from '../util.js'

// Google Drive provider. Uses Google Identity Services (loaded on demand) with
// a user-supplied OAuth Client ID — the app ships no secrets. The access token
// is held in memory only.

const FOLDER = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

let token = null
let gisPromise = null
const idByPath = new Map()

function loadGis() {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
  return gisPromise
}

async function getToken() {
  if (token) return token
  const clientId = googleClientId()
  if (!clientId) throw new Error('Add a Google OAuth Client ID in Drive settings to connect.')
  await loadGis()
  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive',
        callback: (response) => {
          if (response.access_token) {
            token = response.access_token
            resolve(token)
          } else {
            reject(new Error(response.error_description || response.error || 'Google sign-in failed'))
          }
        },
        error_callback: (error) => reject(new Error(error?.message || 'Google sign-in failed')),
      })
      client.requestAccessToken({ prompt: '' })
    } catch (error) {
      reject(error)
    }
  })
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { Authorization: `Bearer ${await getToken()}`, ...(options.headers || {}) },
  })
  if (!response.ok) throw new Error(`Drive request failed: ${response.status} ${(await response.text()).slice(0, 180)}`)
  return response.status === 204 ? null : response.json()
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findChild(parentId, name, mimeType) {
  const filters = [`name = '${escapeQuery(name)}'`, `'${parentId}' in parents`, 'trashed = false']
  if (mimeType) filters.push(`mimeType = '${mimeType}'`)
  const query = encodeURIComponent(filters.join(' and '))
  const data = await api(`/files?q=${query}&pageSize=1&fields=files(id,name,mimeType)`)
  return data.files?.[0] ?? null
}

async function resolveDir(path) {
  const norm = normalizePath(path)
  if (norm === '/') return 'root'
  const cached = idByPath.get(norm)
  if (cached) return cached
  let id = 'root'
  let walked = ''
  for (const segment of segments(norm)) {
    walked = joinPath(walked || '/', segment)
    const cachedId = idByPath.get(walked)
    if (cachedId) {
      id = cachedId
      continue
    }
    const found = await findChild(id, segment, FOLDER)
    if (!found) throw new Error(`Folder not found: ${walked}`)
    id = found.id
    idByPath.set(walked, id)
  }
  return id
}

async function findFile(path) {
  const parentId = await resolveDir(parentOf(path))
  const found = await findChild(parentId, baseName(path))
  return found ? { ...found, parentId } : null
}

function entryFor(path, file) {
  const dir = file.mimeType === FOLDER
  return {
    name: file.name,
    path,
    dir,
    size: dir ? 0 : Number(file.size || 0),
    modified: file.modifiedTime ? Date.parse(file.modifiedTime) : 0,
    type: dir ? '' : file.mimeType || defaultType(file.name),
  }
}

export const gdriveProvider = {
  id: 'gdrive',
  label: 'Google Drive',
  hint: 'Your Drive files. Needs a Google OAuth Client ID; token stays in memory.',
  kind: 'cloud',
  available: () => typeof window !== 'undefined' && typeof fetch === 'function',
  isConnected: () => token !== null,
  configured: () => Boolean(googleClientId()),

  async connect() {
    await getToken()
    const about = await api('/about?fields=user(emailAddress)')
    return { detail: about?.user?.emailAddress || 'Google Drive' }
  },

  disconnect() {
    token = null
  },

  async list(path) {
    const dir = normalizePath(path)
    const parentId = await resolveDir(dir)
    const query = encodeURIComponent(`'${parentId}' in parents and trashed = false`)
    const data = await api(`/files?q=${query}&pageSize=200&orderBy=folder,name&fields=files(id,name,mimeType,size,modifiedTime)`)
    return (data.files || []).map((file) => {
      const record = entryFor(joinPath(dir, file.name), file)
      if (record.dir) idByPath.set(record.path, file.id)
      return record
    })
  },

  async read(path) {
    const file = await findFile(path)
    if (!file || file.mimeType === FOLDER) throw new Error('Not a file')
    const response = await fetch(`${API}/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${await getToken()}` } })
    if (!response.ok) throw new Error(`Drive download failed: ${response.status}`)
    const blob = await response.blob()
    return { name: file.name, type: file.mimeType || defaultType(file.name), size: blob.size, blob }
  },

  async write(path, blob, name) {
    const norm = normalizePath(path)
    const fileName = name ?? baseName(norm)
    const parentId = await resolveDir(parentOf(norm), true)
    const existing = await findChild(parentId, fileName)
    const type = blob.type || defaultType(fileName)

    if (existing) {
      const response = await fetch(`${UPLOAD}/files/${existing.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': type },
        body: blob,
      })
      if (!response.ok) throw new Error(`Drive update failed: ${response.status}`)
      return entryFor(norm, { ...existing, modifiedTime: new Date().toISOString() })
    }

    const boundary = `s${Date.now().toString(36)}`
    const metadata = JSON.stringify({ name: fileName, parents: [parentId] })
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ])
    const response = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!response.ok) throw new Error(`Drive upload failed: ${response.status}`)
    return entryFor(norm, await response.json())
  },

  async mkdir(path) {
    const norm = normalizePath(path)
    const parentId = await resolveDir(parentOf(norm), true)
    const name = baseName(norm)
    const existing = await findChild(parentId, name, FOLDER)
    const created = existing ? { ...existing } : await api('/files?fields=id,name,mimeType,modifiedTime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
    })
    idByPath.set(norm, created.id)
    return entryFor(norm, created)
  },

  async remove(path) {
    const norm = normalizePath(path)
    const file = await findFile(norm)
    if (!file) return
    await api(`/files/${file.id}`, { method: 'DELETE' })
    idByPath.delete(norm)
  },
}
