const API = 'https://api.github.com'

// GitHub REST helpers. The connector is auth-provider agnostic: every call
// takes a token, so either a personal access token or an OAuth token (obtained
// elsewhere, e.g. a device-flow relay) plugs in the same way. api.github.com
// sends permissive CORS headers, unlike github.com/login/*.

const HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

export function encodePath(path) {
  return String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export async function gh(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 404) return null
  if (!response.ok) {
    let detail = String(response.status)
    try {
      detail = (await response.json()).message || detail
    } catch {
      /* non-JSON error body */
    }
    const error = new Error(`GitHub ${response.status}: ${detail}`)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export const getUser = (token) => gh('/user', { token })
export const getBranch = (token, repo, branch) => gh(`/repos/${repo}/branches/${encodeURIComponent(branch)}`, { token })
export const getTree = (token, repo, sha, recursive = true) => gh(`/repos/${repo}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`, { token })
export const getBlob = (token, repo, sha) => gh(`/repos/${repo}/git/blobs/${sha}`, { token })
export const listRepos = (token) => gh('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', { token })
export const listBranches = (token, repo) => gh(`/repos/${repo}/branches?per_page=100`, { token })
export const getContents = (token, repo, path, ref) => gh(`/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { token })
export const listWorkflows = (token, repo) => gh(`/repos/${repo}/actions/workflows?per_page=100`, { token })
export const listRuns = (token, repo) => gh(`/repos/${repo}/actions/runs?per_page=20`, { token })
export const dispatchWorkflow = (token, repo, id, ref, inputs) => gh(`/repos/${repo}/actions/workflows/${id}/dispatches`, { method: 'POST', token, body: { ref, inputs } })

export function fromBase64(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return btoa(binary)
}

export async function readFile(token, repo, entry) {
  if (entry.content) {
    const text = new TextDecoder().decode(fromBase64(entry.content))
    return { text, sha: entry.sha, name: entry.name, size: entry.size, binary: false }
  }
  const blob = await gh(`/repos/${repo}/git/blobs/${entry.sha}`, { token })
  if (!blob) throw new Error('Blob not found')
  return { base64: blob.content, sha: blob.sha, name: entry.name, size: blob.size, binary: true }
}

export function putFile(token, repo, path, { message, content, sha, branch }) {
  return gh(`/repos/${repo}/contents/${encodePath(path)}`, { method: 'PUT', token, body: { message, content, sha, branch } })
}

export function deleteFile(token, repo, path, { message, sha, branch }) {
  return gh(`/repos/${repo}/contents/${encodePath(path)}`, { method: 'DELETE', token, body: { message, sha, branch } })
}
