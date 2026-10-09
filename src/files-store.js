import { atom } from './vendor/store.js'
import { getProvider, PROVIDERS, restoreLocalProviders } from './files/index.js'
import { filesPrefs } from './files/config.js'
import { baseName, joinPath, normalizePath, parentOf } from './files/util.js'
import { isUnlocked } from './vault.js'

// File-manager state. `path` is the current directory within the active
// provider; providers expose a uniform list/read/write/remove/mkdir interface.

export const filesState = atom({
  provider: filesPrefs.get().provider || 'idb',
  path: '/',
  entries: [],
  status: 'idle', // idle | loading | busy | error
  error: null,
  connected: false,
  locked: false,
  detail: '',
})

function patch(next) {
  filesState.set({ ...filesState.get(), ...next })
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

export function activeProvider() {
  return getProvider(filesState.get().provider)
}

export function providerList() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    available: provider.available(),
    connected: provider.isConnected(),
    configured: provider.configured ? provider.configured() : true,
    requiresUnlock: Boolean(provider.requiresUnlock),
    hint: provider.hint,
  }))
}

export async function initFiles() {
  const preferred = filesPrefs.get().provider
  if (filesState.get().provider !== preferred) patch({ provider: preferred, path: '/', entries: [] })
  await restoreLocalProviders()
  await refresh()
}

export async function setProvider(id) {
  filesPrefs.set({ ...filesPrefs.get(), provider: id })
  patch({ provider: id, path: '/', entries: [], error: null, detail: '' })
  await refresh()
}

export async function refresh() {
  const provider = activeProvider()
  if (provider.requiresUnlock && !isUnlocked()) {
    patch({ entries: [], connected: false, locked: true, status: 'idle', error: null })
    return
  }
  patch({ locked: false })
  if (!provider.isConnected()) {
    patch({ entries: [], connected: false, status: 'idle' })
    return
  }
  patch({ status: 'loading', error: null })
  try {
    const entries = await provider.list(filesState.get().path)
    patch({ entries, status: 'idle', connected: true })
  } catch (error) {
    patch({ status: 'error', error: message(error), connected: false })
  }
}

export async function connect() {
  const provider = activeProvider()
  patch({ status: 'busy', error: null })
  try {
    const info = await provider.connect()
    patch({ status: 'idle', connected: true, detail: info?.detail ?? '' })
    await refresh()
    return true
  } catch (error) {
    patch({ status: 'error', error: message(error) })
    return false
  }
}

export async function disconnect() {
  activeProvider().disconnect?.()
  patch({ connected: false, entries: [], detail: '', error: null, status: 'idle' })
}

export async function navigate(path) {
  patch({ path: normalizePath(path) })
  await refresh()
}

export async function openEntry(entry) {
  if (entry?.dir) await navigate(entry.path)
}

export async function goUp() {
  await navigate(parentOf(filesState.get().path))
}

export async function uploadFiles(fileList) {
  const provider = activeProvider()
  const files = [...fileList]
  if (!files.length) return
  patch({ status: 'busy', error: null })
  try {
    for (const file of files) {
      await provider.write(joinPath(filesState.get().path, file.name), file, file.name)
    }
    await refresh()
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}

export async function newFolder(name) {
  const provider = activeProvider()
  const clean = String(name || '').trim()
  if (!clean || clean.includes('/')) throw new Error('Enter a folder name without slashes')
  patch({ status: 'busy', error: null })
  try {
    await provider.mkdir(joinPath(filesState.get().path, clean))
    await refresh()
  } catch (error) {
    patch({ status: 'error', error: message(error) })
    throw error
  }
}

export async function removeEntry(entry) {
  const provider = activeProvider()
  patch({ status: 'busy', error: null })
  try {
    await provider.remove(entry.path)
    await refresh()
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}

export async function readEntry(entry) {
  return activeProvider().read(entry.path)
}

export async function downloadEntry(entry) {
  const { blob, name } = await readEntry(entry)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name || baseName(entry.path)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
