import { atom } from '../vendor/store.js'

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1'
const DEFAULT_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct'
const PREF_KEY = 's:agent-model'
const HANDLE_KEY = 'model-dir'
const IDB_NAME = 's-agent'
const SYSTEM_PROMPT =
  'You are S, a private assistant that runs entirely on the user’s device. Never claim to send data anywhere. Be warm, concise and concrete.'

const DEFAULTS = {
  source: 'hf',
  modelId: DEFAULT_MODEL,
  localPath: './models/',
  dtype: 'q4f16',
  device: typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm',
}

function loadPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export const agentModel = atom({
  ...loadPrefs(),
  status: 'idle',
  percent: 0,
  loaded: 0,
  total: 0,
  file: '',
  error: '',
  folder: '',
})

export const agentBusy = atom(false)

let transformers = null
let generator = null
let localFiles = null
let shimActive = false
let shimInstalled = false
const LOCAL_PREFIX = 'local-model/'
const nativeFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null

function persist() {
  const { source, modelId, localPath, dtype, device } = agentModel.get()
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ source, modelId, localPath, dtype, device }))
  } catch {
    /* ignore quota errors */
  }
}

export function agentStatusText(state = agentModel.get()) {
  if (state.status === 'loading') return state.total ? `Downloading ${state.percent}%` : 'Loading model…'
  if (state.status === 'ready') return `Ready · ${state.device === 'webgpu' ? 'WebGPU' : 'WASM'}`
  if (state.status === 'error') return 'Model failed to load'
  return 'No model loaded'
}

export function agentPreviewText(state = agentModel.get()) {
  if (state.status === 'loading') return state.total ? `Downloading · ${state.percent}%` : 'Loading model…'
  if (state.status === 'ready') return `Ready · ${state.device === 'webgpu' ? 'WebGPU' : 'WASM'}`
  if (state.status === 'error') return 'Model failed to load'
  return 'Tap to load a local model'
}

/* ------------------------------------------------------------------ *
 * Local files: File System Access API → scoped fetch shim
 * ------------------------------------------------------------------ */

function mimeOf(name) {
  if (name.endsWith('.json')) return 'application/json; charset=utf-8'
  if (name.endsWith('.txt') || name.endsWith('.model')) return 'text/plain; charset=utf-8'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

function normalizePath(url) {
  let path = String(url).split(/[?#]/)[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    /* keep raw */
  }
  return path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/^\.?\//, '')
}

function matchLocalFile(url) {
  if (!localFiles || !shimActive) return null
  const path = normalizePath(url)
  if (!path.startsWith(LOCAL_PREFIX)) return null
  const rest = path.slice(LOCAL_PREFIX.length)
  if (localFiles.has(rest)) return rest
  for (const key of localFiles.keys()) if (rest.endsWith('/' + key)) return key
  return null
}

function installFetchShim() {
  if (shimInstalled || !nativeFetch) return
  shimInstalled = true
  globalThis.fetch = (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || ''
    const key = matchLocalFile(url)
    if (key) {
      return localFiles.get(key).getFile().then(
        (file) => new Response(file, { headers: { 'Content-Type': mimeOf(file.name), 'Content-Length': String(file.size) } }),
        () => new Response('Not found', { status: 404 }),
      )
    }
    return nativeFetch(input, init)
  }
}

async function collectDirectory(dir, prefix, map, depth) {
  if (depth > 6) return
  for await (const name of dir.keys()) {
    if (name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${name}` : name
    try {
      const handle = await dir.getFileHandle(name)
      map.set(path, handle)
    } catch {
      try {
        await collectDirectory(await dir.getDirectoryHandle(name), path, map, depth + 1)
      } catch {
        /* skip unreadable entries */
      }
    }
  }
}

function useDirectoryHandle(handle) {
  const map = new Map()
  return collectDirectory(handle, '', map, 0).then(() => {
    localFiles = map
    installFetchShim()
    agentModel.set({ ...agentModel.get(), folder: handle.name, error: '' })
    return map
  })
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveHandle(handle) {
  try {
    const db = await openHandleDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite')
      tx.objectStore('handles').put(handle, HANDLE_KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* handle persistence is best-effort */
  }
}

async function savedHandle() {
  try {
    const db = await openHandleDb()
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly')
      const request = tx.objectStore('handles').get(HANDLE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return handle ?? null
  } catch {
    return null
  }
}

export async function pickLocalDirectory() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('This browser has no folder picker — use a local path served by this site instead.')
  }
  const handle = await window.showDirectoryPicker({ mode: 'read' })
  await saveHandle(handle)
  await useDirectoryHandle(handle)
  return handle.name
}

export async function restoreLocalDirectory() {
  try {
    const handle = await savedHandle()
    if (!handle) return null
    let permission = await handle.queryPermission?.({ mode: 'read' })
    if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
      permission = await handle.requestPermission({ mode: 'read' })
    }
    if (permission !== 'granted') return null
    await useDirectoryHandle(handle)
    return handle.name
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

const fileProgress = new Map()
let progressTimer = null
let currentFile = ''

function flushProgress() {
  let loaded = 0
  let total = 0
  for (const entry of fileProgress.values()) {
    loaded += entry.loaded
    total += entry.total
  }
  const state = agentModel.get()
  agentModel.set({
    ...state,
    loaded,
    total,
    file: currentFile,
    percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : state.percent,
  })
}

function onProgress(event) {
  if (!event || event.status !== 'progress' || !event.total) return
  currentFile = event.file ?? event.name ?? currentFile
  fileProgress.set(currentFile, {
    loaded: event.loaded ?? 0,
    total: event.total,
  })
  if (progressTimer) return
  progressTimer = setTimeout(() => {
    progressTimer = null
    flushProgress()
  }, 150)
}

function friendlyError(error, device) {
  const message = error?.message ?? String(error)
  if (/webgpu|adapter|device lost|out of memory/i.test(message)) {
    return device === 'webgpu'
      ? 'The GPU could not run this model — try dtype q4, a smaller model, or switch the device to WASM.'
      : message
  }
  if (/fetch|network|failed to load|cors/i.test(message)) {
    return 'Could not download the model — check your connection, or load it from a local folder.'
  }
  return message.slice(0, 300)
}

export async function loadModel(options = {}) {
  const previous = agentModel.get()
  if (previous.status === 'loading') return
  const next = { ...previous, ...options, status: 'loading', percent: 0, loaded: 0, total: 0, file: '', error: '' }
  agentModel.set(next)
  persist()
  fileProgress.clear()

  const device = next.device === 'webgpu' && navigator.gpu ? 'webgpu' : 'wasm'
  let dtype = next.dtype
  if (device === 'wasm' && (dtype === 'q4f16' || dtype === 'q4')) dtype = 'quantized'

  try {
    transformers ??= await import(TRANSFORMERS_URL)
    const { env, pipeline } = transformers

    if (next.source === 'local') {
      if (!localFiles) await restoreLocalDirectory()
      env.allowLocalModels = true
      shimActive = Boolean(localFiles)
      if (localFiles) {
        env.localModelPath = LOCAL_PREFIX
      } else {
        env.localModelPath = next.localPath || './models/'
      }
    } else {
      shimActive = false
      env.allowLocalModels = false
      env.allowRemoteModels = true
    }

    generator = await pipeline('text-generation', next.modelId, {
      dtype,
      ...(device === 'webgpu' ? { device: 'webgpu' } : {}),
      progress_callback: onProgress,
    })
    flushProgress()
    agentModel.set({ ...agentModel.get(), status: 'ready', device, dtype, percent: 100, error: '' })
  } catch (error) {
    generator = null
    agentModel.set({ ...agentModel.get(), status: 'error', error: friendlyError(error, device) })
  }
}

export async function unloadModel() {
  try {
    generator?.model?.dispose?.()
  } catch {
    /* disposal is best-effort */
  }
  generator = null
  fileProgress.clear()
  agentModel.set({ ...agentModel.get(), status: 'idle', percent: 0, loaded: 0, total: 0, file: '', error: '' })
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

function extractReply(output) {
  let entry = Array.isArray(output) ? output[0] : output
  let generated = entry?.generated_text
  if (generated && !Array.isArray(generated) && typeof generated === 'object') {
    generated = [generated]
  }
  if (typeof generated === 'string') return generated.trim()
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1]
    if (typeof last === 'string') return last.trim()
    if (typeof last?.content === 'string') return last.content.trim()
  }
  return ''
}

export async function generateAgentReply(history, { onToken } = {}) {
  if (agentModel.get().status !== 'ready' || !generator) throw new Error('No model is loaded yet.')
  agentBusy.set(true)
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((entry) => ({ role: entry.role, content: entry.text })),
    ]
    const base = {
      max_new_tokens: 320,
      temperature: 0.7,
      do_sample: true,
      top_p: 0.95,
      repetition_penalty: 1.1,
    }
    let output = null
    if (onToken) {
      try {
        const { TextStreamer } = transformers
        const streamer = new TextStreamer(generator.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (chunk) => {
            if (chunk) onToken(chunk)
          },
        })
        output = await generator(messages, { ...base, streamer })
      } catch (error) {
        if (!/streamer/i.test(error?.message ?? '')) throw error
        output = null
      }
    }
    output ??= await generator(messages, base)
    return extractReply(output)
  } finally {
    agentBusy.set(false)
  }
}
