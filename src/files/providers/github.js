import { githubConfig } from '../config.js'
import { base64ToBytes, baseName, bytesToBase64, defaultType, normalizePath, parentOf, segments } from '../util.js'

// GitHub provider (personal access token). Reads and writes files through the
// repository contents API. The token is supplied by the user and stored sealed
// in the vault; nothing is sent anywhere except api.github.com.

const API = 'https://api.github.com'

function config() {
  const cfg = githubConfig()
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    throw new Error('Add a GitHub token, owner and repository in GitHub settings.')
  }
  return cfg
}

function encoded(path) {
  return segments(path).map((segment) => encodeURIComponent(segment)).join('/')
}

async function request(path, options = {}) {
  const cfg = config()
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${cfg.token}`,
      ...(options.headers || {}),
    },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${(await response.text()).slice(0, 180)}`)
  return response.status === 204 ? null : response.json()
}

function contentsUrl(path) {
  const cfg = config()
  const suffix = path && path !== '/' ? `/${encoded(path)}` : ''
  return `/repos/${cfg.owner}/${cfg.repo}/contents${suffix}?ref=${encodeURIComponent(cfg.branch)}`
}

function entryFor(dir, item) {
  return {
    name: item.name,
    path: normalizePath(`${dir}/${item.name}`),
    dir: item.type === 'dir',
    size: item.size || 0,
    modified: 0,
    type: item.type === 'dir' ? '' : defaultType(item.name),
  }
}

export const githubProvider = {
  id: 'github',
  label: 'GitHub',
  hint: 'A repository you own. Needs a personal access token with repo contents access.',
  kind: 'cloud',
  available: () => typeof fetch !== 'undefined',
  isConnected: () => {
    const cfg = githubConfig()
    return Boolean(cfg.token && cfg.owner && cfg.repo)
  },
  configured: () => {
    const cfg = githubConfig()
    return Boolean(cfg.token && cfg.owner && cfg.repo)
  },

  async connect() {
    const cfg = config()
    const repo = await request(`/repos/${cfg.owner}/${cfg.repo}`)
    if (!repo) throw new Error(`Repository ${cfg.owner}/${cfg.repo} not found`)
    return { detail: `${repo.full_name} @ ${cfg.branch}` }
  },

  disconnect() {
    /* token lives in config; nothing to drop */
  },

  async list(path) {
    const dir = normalizePath(path)
    const data = await request(contentsUrl(dir))
    if (!data) throw new Error(`Path not found: ${dir}`)
    const items = Array.isArray(data) ? data : [data]
    return items
      .filter((item) => item.name !== '.gitkeep')
      .map((item) => entryFor(dir, item))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  },

  async read(path) {
    const data = await request(contentsUrl(path))
    if (!data || Array.isArray(data)) throw new Error('Not a file')
    if (data.download_url && !data.content) {
      const response = await fetch(data.download_url)
      const blob = await response.blob()
      return { name: data.name, type: defaultType(data.name), size: blob.size, blob }
    }
    const bytes = base64ToBytes((data.content || '').replace(/\s/g, ''))
    return { name: data.name, type: defaultType(data.name), size: bytes.length, blob: new Blob([bytes], { type: defaultType(data.name) }) }
  },

  async write(path, blob, name) {
    const cfg = config()
    const norm = normalizePath(path)
    const fileName = name ?? baseName(norm)
    const target = normalizePath(`${parentOf(norm)}/${fileName}`)
    const existing = await request(contentsUrl(target))
    const data = new Uint8Array(await blob.arrayBuffer())
    const body = {
      message: `${existing ? 'Update' : 'Add'} ${fileName} via S`,
      content: bytesToBase64(data),
      branch: cfg.branch,
      ...(existing?.sha ? { sha: existing.sha } : {}),
    }
    const result = await request(`/repos/${cfg.owner}/${cfg.repo}/contents/${encoded(target)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return {
      name: fileName,
      path: target,
      dir: false,
      size: data.length,
      modified: Date.now(),
      type: defaultType(fileName),
      sha: result?.content?.sha,
    }
  },

  async mkdir(path) {
    const marker = normalizePath(`${path}/.gitkeep`)
    await this.write(marker, new Blob([], { type: 'text/plain' }), '.gitkeep')
    return { name: baseName(path), path: normalizePath(path), dir: true, size: 0, modified: Date.now(), type: '' }
  },

  async remove(path) {
    const cfg = config()
    const norm = normalizePath(path)
    const item = await request(contentsUrl(norm))
    if (!item) return
    const targets = Array.isArray(item) ? item : [item]
    for (const target of targets) {
      await request(`/repos/${cfg.owner}/${cfg.repo}/contents/${encoded(norm)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${target.name} via S`, sha: target.sha, branch: cfg.branch }),
      })
    }
  },
}
