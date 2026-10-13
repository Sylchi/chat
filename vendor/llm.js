// Browser port of the LiteAgent LLMClient (agent/src/llm.js). The Node-only
// bits (process.env debug flag, node crypto) are replaced with browser
// equivalents; the OpenAI-compatible SSE streaming, pacing, retry/backoff and
// model-fallback logic are unchanged.
//
// fetch() is pluggable: the terminal agent uses global fetch, while the web app
// can route the request through Chrome's Direct Sockets API (see src/agent/net.js)
// by passing `fetchFn`.

const dbg = (...a) => {
  if (globalThis.S_DEBUG) {
    const t = new Date().toISOString().slice(11, 23)
    console.debug(`[${t}][llm]`, ...a)
  }
}

function sleep(ms, signal, onTick) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const start = Date.now()
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    const timer = setInterval(() => {
      const left = ms - (Date.now() - start)
      if (left <= 0) {
        cleanup()
        resolve()
        return
      }
      try { onTick?.(left) } catch { /* ignore */ }
    }, 1000)
    const overall = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const cleanup = () => {
      clearInterval(timer)
      clearTimeout(overall)
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try { onTick?.(ms) } catch { /* ignore */ }
  })
}

function abortError() {
  const e = new Error('aborted')
  e.name = 'AbortError'
  return e
}

function randomHex(len) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += (b % 16).toString(16)
  return s
}

class IdleTimeoutError extends Error {
  constructor(ms) {
    super(`no data from model for ${Math.round(ms / 1000)}s`)
    this.name = 'IdleTimeoutError'
  }
}

// Minimal Response/Headers shim so a transport that only yields raw bytes (the
// Direct Sockets HTTP client) can be fed to the exact same parser as a real
// fetch Response.
export class Headers {
  constructor(init = {}) {
    this._map = {}
    if (init instanceof Headers) {
      for (const [k, v] of init) this._map[k] = v
    } else if (Array.isArray(init)) {
      for (const [k, v] of init) this._map[String(k).toLowerCase()] = String(v)
    } else if (init && typeof init === 'object') {
      for (const [k, v] of Object.entries(init)) this._map[String(k).toLowerCase()] = String(v)
    }
  }
  get(name) {
    const v = this._map[String(name).toLowerCase()]
    return v === undefined ? null : v
  }
  has(name) {
    return Object.prototype.hasOwnProperty.call(this._map, String(name).toLowerCase())
  }
  *[Symbol.iterator]() {
    for (const [k, v] of Object.entries(this._map)) yield [k, v]
  }
}

export class MockResponse {
  constructor({ status = 200, headers = {}, body = [] } = {}) {
    this.status = status
    this.statusText = ''
    this.headers = headers instanceof Headers ? headers : new Headers(headers)
    this.body = body instanceof ReadableStream ? body : MockReadableStream(body)
    this.ok = status >= 200 && status < 300
  }
  async text() {
    const reader = this.body.getReader()
    const decoder = new TextDecoder()
    let out = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
    return out
  }
  async json() {
    return JSON.parse(await this.text())
  }
}

// Wrap an array/async-iterable of Uint8Array chunks as a ReadableStream, with a
// no-op cancel() so the parser's `reader.cancel()` is safe.
function MockReadableStream(chunks) {
  const iter = chunks[Symbol.asyncIterator] ? chunks : (async function* () { yield* chunks })()
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iter.next()
      if (done) controller.close()
      else controller.enqueue(value instanceof Uint8Array ? value : new TextEncoder().encode(String(value)))
    },
    cancel() {},
  })
}

export class LLMClient {
  constructor(cfg, hooks = {}) {
    this.cfg = cfg
    this.hooks = hooks
    this.fetchFn = cfg.fetchFn || globalThis.fetch.bind(globalThis)
    this.sessionId = `ses_${randomHex(26)}`
    this.paceMs = cfg.rateLimitMs
    this.triedModels = new Set([cfg.model])
    this.fallbackQueue = (cfg.fallbackModels || []).filter((m) => m !== cfg.model)
    this.lastRequestAt = 0
    this.stats = { requests: 0, retries: 0, promptTokens: 0, completionTokens: 0, started: Date.now() }
  }

  buildURL() {
    const url = new URL(this.cfg.baseURL.replace(/\/+$/, '') + '/chat/completions')
    if (this.cfg.referrer) url.searchParams.set('referrer', this.cfg.referrer)
    return url
  }

  buildHeaders() {
    const headers = {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'user-agent': this.cfg.userAgent,
      'x-opencode-session': this.sessionId,
      'HTTP-Referer': 'https://github.com/anomalyco/opencode',
      'X-Title': 'LiteAgent',
      ...(this.cfg.extraHeaders || {}),
    }
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`
    return headers
  }

  async pace(signal) {
    const wait = this.lastRequestAt + this.paceMs - Date.now()
    if (wait > 0) {
      if (wait > 1500) this.hooks.onStatus?.(`rate limit — next request in ${Math.ceil(wait / 1000)}s`)
      await sleep(wait + 50, signal, (left) => {
        if (left > 1500) this.hooks.onStatus?.(`rate limit — next request in ${Math.ceil(left / 1000)}s`)
      })
      this.hooks.onStatus?.(null)
    }
  }

  #backoff(reason) {
    this.paceMs = Math.min(30000, Math.max(this.paceMs, 2000) * 2)
    dbg(`backoff after ${reason}: paceMs=${this.paceMs}`)
  }

  #nextModel() {
    while (this.fallbackQueue.length) {
      const m = this.fallbackQueue.shift()
      if (this.triedModels.has(m)) continue
      this.triedModels.add(m)
      this.cfg.model = m
      this.hooks.onStatus?.(`model unavailable — falling back to ${m}`)
      return true
    }
    return false
  }

  #settle() {
    if (this.paceMs > this.cfg.rateLimitMs) {
      this.paceMs = Math.max(this.cfg.rateLimitMs, Math.round(this.paceMs / 2))
      dbg(`pace decays to ${this.paceMs}`)
    }
  }

  async *stream(messages, tools, signal) {
    const body = { model: this.cfg.model, messages, stream: true, max_tokens: this.cfg.maxTokens }
    if (this.cfg.reasoningEffort) body.reasoning_effort = this.cfg.reasoningEffort
    if (tools && tools.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    let attempt = 0
    for (;;) {
      body.model = this.cfg.model
      await this.pace(signal)
      this.lastRequestAt = Date.now()
      this.stats.requests++
      dbg(`request #${this.stats.requests} attempt=${attempt} sending (${JSON.stringify(body).length} bytes)`)

      const ctrl = new AbortController()
      let deadlineHit = false
      const onUserAbort = () => ctrl.abort()
      signal?.addEventListener('abort', onUserAbort, { once: true })
      const deadline = setTimeout(() => {
        deadlineHit = true
        ctrl.abort()
      }, this.cfg.requestTimeoutMs)
      try {
        let res
        try {
          const headersTimer = setTimeout(() => ctrl.abort(), this.cfg.headersTimeoutMs)
          try {
            res = await this.fetchFn(this.buildURL(), {
              method: 'POST',
              headers: this.buildHeaders(),
              body: JSON.stringify(body),
              signal: ctrl.signal,
            })
          } finally {
            clearTimeout(headersTimer)
          }
        } catch (e) {
          dbg('fetch failed:', e.name, e.message, 'userAborted=', !!signal?.aborted, 'deadline=', deadlineHit)
          if (signal?.aborted) throw abortError()
          if (deadlineHit) {
            const err = new Error(`request exceeded requestTimeoutMs=${this.cfg.requestTimeoutMs}ms`)
            err.status = 504
            throw err
          }
          if (attempt >= this.cfg.maxRetries) throw e
          attempt++
          this.stats.retries++
          if (e.name === 'AbortError') this.#backoff('headers timeout')
          const wait = Math.min(8000, 1000 * 2 ** attempt) + Math.random() * 400
          const why = e.name === 'AbortError' ? 'timed out waiting for response headers' : e.message
          this.hooks.onStatus?.(`connection problem: ${why} — retry in ${Math.ceil(wait / 1000)}s`)
          await sleep(wait, signal)
          this.hooks.onStatus?.(null)
          continue
        }

        dbg('response headers:', res.status)
        if (res.ok) {
          this.#settle()
          try {
            yield* this.#parse(res, signal)
          } catch (e) {
            if (deadlineHit && e.name === 'AbortError') {
              const err = new Error(`request exceeded requestTimeoutMs=${this.cfg.requestTimeoutMs}ms`)
              err.status = 504
              throw err
            }
            throw e
          }
          dbg('parse finished normally')
          return
        }

        const retryable = res.status === 402 || res.status === 429 || res.status === 426 || res.status >= 500
        await res.body?.cancel?.().catch(() => {})
        if (retryable && attempt < this.cfg.maxRetries) {
          attempt++
          this.stats.retries++
          if (res.status === 429 || res.status === 426) this.#backoff(`HTTP ${res.status}`)
          const wait = res.status === 402 || res.status === 429 || res.status === 426
            ? this.paceMs
            : Math.min(8000, 500 * 2 ** attempt)
          this.hooks.onStatus?.(`HTTP ${res.status} from model API — retry in ${Math.ceil(wait / 1000)}s`)
          await sleep(wait, signal)
          this.hooks.onStatus?.(null)
          continue
        }

        const text = await res.text().catch(() => '')
        dbg('non-retryable HTTP error', res.status, text.slice(0, 200))
        if ((res.status === 401 || res.status === 404) && this.#nextModel()) {
          this.#backoff('model fallback')
          continue
        }
        let msg = `model API HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`
        if (res.status === 401) {
          msg += `\nhint: the API key was rejected. For OpenCode Zen this usually means the model "${this.cfg.model}" is deprecated/retired — pick a model marked [free].`
        } else if (res.status === 403) {
          msg += '\nhint: this looks like the OpenCode free-tier gate. liteagent sends the required request shape; if this persists the model may be restricted.'
        }
        const err = new Error(msg)
        err.status = res.status
        throw err
      } finally {
        clearTimeout(deadline)
        signal?.removeEventListener('abort', onUserAbort)
      }
    }
  }

  async *#parse(res, signal) {
    const usage = {}
    for (const [key, value] of res.headers) {
      if (key === 'x-usage-prompt-text-tokens') usage.prompt_tokens = Number(value)
      else if (key === 'x-usage-completion-text-tokens') usage.completion_tokens = Number(value)
      else if (key === 'x-usage-total-tokens') usage.total_tokens = Number(value)
    }

    let text = ''
    let reasoning = ''
    let finish = null
    let sawDone = false
    const toolCalls = new Map()

    const decoder = new TextDecoder()
    const reader = res.body.getReader()
    let buf = ''
    let lastActivity = Date.now()

    const readWithIdleTimeout = async () => {
      let timer
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new IdleTimeoutError(this.cfg.idleTimeoutMs)), this.cfg.idleTimeoutMs)
      })
      try {
        return await Promise.race([reader.read(), timeout])
      } finally {
        clearTimeout(timer)
      }
    }

    try {
      outer: for (;;) {
        const { value, done } = await readWithIdleTimeout()
        if (done) break
        lastActivity = Date.now()
        buf += decoder.decode(value, { stream: true })

        let idx
        while ((idx = buf.indexOf('\n')) !== -1) {
          const rawLine = buf.slice(0, idx).replace(/\r$/, '')
          buf = buf.slice(idx + 1)
          if (!rawLine.startsWith('data:')) continue
          const data = rawLine.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            sawDone = true
            dbg('got [DONE]')
            break outer
          }

          let chunk
          try { chunk = JSON.parse(data) } catch { continue }
          if (chunk.usage) Object.assign(usage, chunk.usage)

          const choice = chunk.choices?.[0]
          if (!choice) continue
          const delta = choice.delta || {}

          const reason = delta.reasoning ?? delta.reasoning_content
          if (reason) {
            reasoning += reason
            yield { type: 'reasoning', text: reason }
          }
          if (delta.content) {
            text += delta.content
            yield { type: 'text', text: delta.content }
          }
          for (const tc of delta.tool_calls || []) {
            const i = tc.index ?? 0
            let cur = toolCalls.get(i)
            if (!cur) {
              cur = { index: i, id: '', name: '', args: '' }
              toolCalls.set(i, cur)
            }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name += tc.function.name
            if (tc.function?.arguments) cur.args += tc.function.arguments
          }
          if (choice.finish_reason) finish = choice.finish_reason
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    dbg(`stream end: sawDone=${sawDone} finish=${finish} textLen=${text.length} tools=${toolCalls.size}`)
    if (!sawDone && !finish && !text && !toolCalls.size) {
      throw new Error('model returned an empty response')
    }

    const stripMarkers = (s) => s.replace(/<\|[^|<>]*\|>/g, '').replace(/\bto=functions\./g, '')
    const calls = [...toolCalls.values()].map((tc, i) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      name: stripMarkers(tc.name).trim(),
      arguments: stripMarkers(tc.args || '{}'),
    }))

    this.stats.promptTokens += usage.prompt_tokens || 0
    this.stats.completionTokens += usage.completion_tokens || 0

    yield {
      type: 'done',
      text,
      reasoning,
      toolCalls: calls,
      finish,
      usage,
    }
  }
}
