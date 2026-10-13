import { directFetch } from '../agent/net.js'
import { directSwTransport } from '../net-direct-sw.js'
import { githubRelay } from '../files/config.js'

const DEVICE_CODE = 'https://github.com/login/device/code'
const ACCESS_TOKEN = 'https://github.com/login/oauth/access_token'
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

let direct = null

function directRequest() {
  direct ??= directFetch(directSwTransport(), { secure: true })
  return direct
}

function endpoint(kind) {
  const relay = githubRelay().replace(/\/+$/, '')
  const base = relay || 'https://github.com'
  return kind === 'code' ? `${base}/login/device/code` : `${base}/login/oauth/access_token`
}

async function post(kind, form) {
  const init = {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'S' },
    body: new URLSearchParams(form).toString(),
  }
  const url = endpoint(kind)
  let response
  if (githubRelay()) {
    response = await fetch(url, init)
  } else {
    try {
      response = await directRequest()(url, init)
    } catch (error) {
      throw new Error(`GitHub sign-in needs the service-worker network transport (or set a relay URL): ${error.message}`)
    }
  }
  const data = await response.json().catch(() => null)
  if (!data) throw new Error(`GitHub OAuth request failed (${response.status})`)
  return data
}

export async function startDeviceFlow(clientId, scope = 'repo read:user') {
  if (!clientId) throw new Error('No GitHub OAuth client id configured')
  const data = await post('code', { client_id: clientId, scope })
  if (data.error) throw new Error(data.error_description || data.error)
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://github.com/login/device',
    interval: (data.interval || 5) * 1000,
    expiresIn: (data.expires_in || 900) * 1000,
  }
}

export async function pollDeviceToken(clientId, deviceCode, { interval = 5000, expiresIn = 900000, signal } = {}) {
  const deadline = Date.now() + expiresIn
  let wait = interval
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, wait)
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
    const data = await post('token', { client_id: clientId, device_code: deviceCode, grant_type: GRANT })
    if (data.access_token) return data.access_token
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') { wait += 1000; continue }
    if (data.error === 'expired_token') throw new Error('Device code expired — try connecting again')
    if (data.error === 'access_denied') throw new Error('Authorization was denied')
    throw new Error(data.error_description || data.error || 'GitHub sign-in failed')
  }
  throw new Error('Device code expired — try connecting again')
}
