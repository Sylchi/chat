import { atom } from './vendor/store.js'
import { backend } from './device-store.js'
import { githubConfig } from './files/config.js'
import { openJson, sealJson } from './files/crypt.js'
import { baseName, isTextLike, pathKey } from './files/util.js'
import { sessionKey } from './vault.js'
import {
  deleteFile as ghDelete,
  fromBase64,
  getBlob,
  getBranch,
  getContents,
  getTree,
  listRuns,
  putFile,
  toBase64,
} from './github/api.js'

// In-browser website editor backed by a git repository.
//
// The repository is the source of truth (commit → GitHub Pages updates the live
// site). The editable working copy lives in IndexedDB, sealed with the vault
// session key, so nothing is readable while S is locked. GitHub is only talked
// to through api.github.com with the user's token (stored sealed in the vault).

const META = 'site/meta'
const WC = 'site/wc/'
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/
const MAX_TEXT = 512 * 1024

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const siteState = atom({
  status: 'idle',
  error: '',
  detail: '',
  files: [],
  current: null,
  content: '',
  baseline: '',
  dirty: false,
  changes: {},
  locked: false,
  meta: null,
})

function patch(next) {
  siteState.set({ ...siteState.get(), ...next })
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

export function isConfigured() {
  const cfg = githubConfig()
  return Boolean(cfg.token && cfg.owner && cfg.repo)
}

export function repoLabel() {
  const cfg = githubConfig()
  return cfg.owner && cfg.repo ? `${cfg.owner}/${cfg.repo} · ${cfg.branch}` : 'No repository'
}

export function changeCount() {
  return Object.keys(siteState.get().changes).length
}

function inRepo(path) {
  return siteState.get().files.some((file) => file.path === path)
}

async function readMeta(store) {
  const raw = await store.get(META)
  if (!raw) return null
  try {
    return await openJson(raw, 'site-meta')
  } catch {
    return null
  }
}

async function writeMeta(store, meta) {
  await store.set(META, await sealJson(meta, 'site-meta'))
}

async function readWorking(store, path) {
  const raw = await store.get(WC + pathKey(path))
  if (!raw) return null
  try {
    return await openJson(raw, 'site-file')
  } catch {
    return null
  }
}

async function writeWorking(store, path, text, base) {
  await store.set(WC + pathKey(path), await sealJson({ path, text, base }, 'site-file'))
}

async function dropWorking(store, path) {
  await store.del(WC + pathKey(path))
}

function textOf(blob) {
  if (!blob?.content) return ''
  return decoder.decode(fromBase64(String(blob.content).replace(/\s/g, '')))
}

export async function initSite() {
  if (!sessionKey()) {
    patch({ locked: true, status: 'idle' })
    return
  }
  const store = await backend()
  const meta = await readMeta(store)
  if (meta?.files) {
    patch({ locked: false, status: 'ready', meta, files: meta.files, detail: `${meta.files.length} files`, error: '' })
  } else {
    patch({ locked: false, status: 'idle', meta: null, files: [] })
  }
}

export async function pullRepo() {
  const cfg = githubConfig()
  if (!(cfg.token && cfg.owner && cfg.repo)) {
    patch({ status: 'error', error: 'Add a GitHub token, owner and repository first.' })
    return
  }
  if (!sessionKey()) {
    patch({ locked: true, status: 'idle' })
    return
  }
  patch({ status: 'loading', error: '', detail: 'Reading branch…' })
  const repo = `${cfg.owner}/${cfg.repo}`
  try {
    const branch = await getBranch(cfg.token, repo, cfg.branch)
    const treeSha = branch?.commit?.commit?.tree?.sha
    if (!treeSha) throw new Error(`Branch "${cfg.branch}" not found in ${repo}`)
    const tree = await getTree(cfg.token, repo, treeSha, true)
    const files = (tree?.tree ?? [])
      .filter((entry) => entry.type === 'blob' && isTextLike(entry.path) && !SKIP.test(entry.path) && (entry.size ?? 0) <= MAX_TEXT)
      .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size ?? 0 }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const store = await backend()
    const meta = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, files, updated: Date.now() }
    await writeMeta(store, meta)
    for (const row of await store.list(WC)) await store.del(row.key)
    patch({
      status: 'ready',
      meta,
      files,
      changes: {},
      current: null,
      content: '',
      baseline: '',
      dirty: false,
      detail: `${files.length} files`,
      error: '',
    })
    if (files.length) await openFile(files[0].path)
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}

export async function openFile(path) {
  const cfg = githubConfig()
  const repo = `${cfg.owner}/${cfg.repo}`
  patch({ status: 'busy', error: '' })
  try {
    const store = await backend()
    const cached = await readWorking(store, path)
    let text = cached?.text ?? null
    if (text == null) {
      const entry = siteState.get().files.find((file) => file.path === path)
      if (!entry?.sha) throw new Error(`No content for ${path}`)
      const blob = await getBlob(cfg.token, repo, entry.sha)
      text = textOf(blob)
      await writeWorking(store, path, text, text)
    }
    patch({ status: 'ready', current: path, content: text, baseline: text, dirty: false })
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}

export function updateBuffer(text) {
  patch({ content: text, dirty: text !== siteState.get().baseline })
}

export async function saveFile() {
  const { current, content } = siteState.get()
  if (!current) return
  try {
    const store = await backend()
    const existing = await readWorking(store, current)
    await writeWorking(store, current, content, existing?.base ?? null)
    const changes = { ...siteState.get().changes }
    if (inRepo(current)) {
      if (changes[current] !== 'added') changes[current] = 'modified'
    } else {
      changes[current] = 'added'
    }
    patch({ changes, baseline: content, dirty: false, status: 'ready', error: '' })
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}

export async function createFile(path) {
  const clean = String(path || '').trim().replace(/^\/+/, '')
  if (!clean) throw new Error('Enter a file path')
  if (siteState.get().files.some((file) => file.path === clean)) {
    await openFile(clean)
    return
  }
  const store = await backend()
  await writeWorking(store, clean, '', null)
  const files = [...siteState.get().files, { path: clean, sha: null, size: 0 }].sort((a, b) => a.path.localeCompare(b.path))
  const changes = { ...siteState.get().changes, [clean]: 'added' }
  patch({ files, changes, current: clean, content: '', baseline: '', dirty: false, status: 'ready', error: '' })
}

export async function deleteCurrent() {
  const { current, changes } = siteState.get()
  if (!current) return
  const store = await backend()
  await dropWorking(store, current)
  const next = { ...changes }
  const tracked = inRepo(current)
  if (tracked) next[current] = 'deleted'
  else delete next[current]
  const files = tracked ? siteState.get().files : siteState.get().files.filter((file) => file.path !== current)
  const nextCurrent = files.find((file) => file.path !== current)?.path ?? null
  patch({ files, changes: next, current: nextCurrent, content: '', baseline: '', dirty: false })
  if (nextCurrent) await openFile(nextCurrent)
}

export async function discardPath(path) {
  if (!path) return
  const store = await backend()
  await dropWorking(store, path)
  const next = { ...siteState.get().changes }
  const wasAdded = !inRepo(path)
  if (wasAdded) {
    const files = siteState.get().files.filter((file) => file.path !== path)
    delete next[path]
    patch({ files, changes: next, current: siteState.get().current === path ? files[0]?.path ?? null : siteState.get().current, content: '', baseline: '', dirty: false })
  } else {
    delete next[path]
    patch({ changes: next })
  }
  if (siteState.get().current === path) await openFile(path)
  else if (wasAdded && siteState.get().current) await openFile(siteState.get().current)
}

export async function discardCurrent() {
  await discardPath(siteState.get().current)
}

export async function diffFor(path) {
  const state = siteState.get()
  const kind = state.changes[path]
  const store = await backend()
  const record = await readWorking(store, path)
  const entry = state.files.find((file) => file.path === path)
  let base = record?.base ?? null
  if (base == null && entry?.sha) {
    const cfg = githubConfig()
    const repo = `${cfg.owner}/${cfg.repo}`
    const blob = await getBlob(cfg.token, repo, entry.sha)
    base = textOf(blob)
  }
  const current = kind === 'deleted' ? '' : state.current === path ? state.content : record?.text ?? ''
  return { kind, base: base ?? '', current, added: base == null, deleted: kind === 'deleted' }
}

export const deployState = atom({ run: null, loading: false, error: '' })

export async function refreshDeploy() {
  const cfg = githubConfig()
  if (!(cfg.token && cfg.owner && cfg.repo)) return
  deployState.set({ ...deployState.get(), loading: true, error: '' })
  try {
    const data = await listRuns(cfg.token, `${cfg.owner}/${cfg.repo}`)
    const runs = (data?.workflow_runs ?? []).filter((run) => run.head_branch === cfg.branch)
    deployState.set({ run: runs[0] ?? null, loading: false, error: '' })
  } catch (error) {
    deployState.set({ run: null, loading: false, error: message(error) })
  }
}


export async function publishChanges() {
  const cfg = githubConfig()
  if (!(cfg.token && cfg.owner && cfg.repo)) {
    patch({ status: 'error', error: 'Repository not configured.' })
    return
  }
  const repo = `${cfg.owner}/${cfg.repo}`
  const changes = siteState.get().changes
  const paths = Object.keys(changes)
  if (!paths.length) return
  patch({ status: 'busy', error: '', detail: 'Publishing…' })
  try {
    const store = await backend()
    let files = [...siteState.get().files]
    for (const path of paths) {
      const kind = changes[path]
      if (kind === 'deleted') {
        const entry = files.find((file) => file.path === path)
        let sha = entry?.sha
        if (!sha) {
          const current = await getContents(cfg.token, repo, path, cfg.branch)
          sha = current?.sha
        }
        await ghDelete(cfg.token, repo, path, { message: `Delete ${baseName(path)}`, sha, branch: cfg.branch })
        files = files.filter((file) => file.path !== path)
      } else {
        const record = await readWorking(store, path)
        const text = siteState.get().current === path ? siteState.get().content : record?.text ?? ''
        const content = toBase64(encoder.encode(text))
        const entry = files.find((file) => file.path === path)
        let sha = kind === 'modified' ? entry?.sha : undefined
        if (kind === 'modified' && !sha) {
          const current = await getContents(cfg.token, repo, path, cfg.branch)
          sha = current?.sha
        }
        const result = await putFile(cfg.token, repo, path, {
          message: `${kind === 'added' ? 'Add' : 'Update'} ${baseName(path)}`,
          content,
          sha,
          branch: cfg.branch,
        })
        const updated = { path, sha: result?.content?.sha ?? entry?.sha ?? null, size: encoder.encode(text).length }
        files = entry ? files.map((file) => (file.path === path ? { ...file, ...updated } : file)) : [...files, updated]
      }
    }
    files.sort((a, b) => a.path.localeCompare(b.path))
    const meta = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, files, updated: Date.now() }
    await writeMeta(store, meta)
    const current = siteState.get().current
    const keep = files.some((file) => file.path === current)
    patch({
      status: 'ready',
      meta,
      files,
      changes: {},
      detail: 'Published',
      error: '',
      current: keep ? current : null,
      content: keep ? siteState.get().content : '',
      baseline: keep ? siteState.get().baseline : '',
    })
    void refreshDeploy()
  } catch (error) {
    patch({ status: 'error', error: message(error) })
  }
}
