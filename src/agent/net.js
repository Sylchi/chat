// Minimal HTTP/1.1-over-a-ByteStream client: turns any mesh Transport (e.g. the
// Direct Sockets service-worker transport) into a `fetch`-shaped function so the
// LLM client can talk to a plain HTTPS API from a browser tab.
//
// This is deliberately small: one request per connection, `Connection: close`,
// and just enough framing (Content-Length / chunked / close-delimited) to read
// an SSE response as a stream.

const encoder = new TextEncoder()

/** Buffer incoming ByteStream chunks so they can be consumed on demand. */
class StreamBuf {
  constructor(stream) {
    this.chunks = []
    this.len = 0
    this.closed = false
    this._waiters = []
    this._offD = stream.onData((b) => {
      this.chunks.push(b)
      this.len += b.length
      this._wake()
    })
    this._offC = stream.onClose(() => {
      this.closed = true
      this._wake()
    })
  }

  _wake() {
    const w = this._waiters
    this._waiters = []
    for (const fn of w) fn()
  }

  _wait() {
    return new Promise((resolve) => this._waiters.push(resolve))
  }

  _take(n) {
    const out = new Uint8Array(n)
    let o = 0
    while (o < n && this.chunks.length) {
      const head = this.chunks[0]
      const need = n - o
      if (head.length <= need) {
        out.set(head, o)
        o += head.length
        this.len -= head.length
        this.chunks.shift()
      } else {
        out.set(head.subarray(0, need), o)
        this.chunks[0] = head.subarray(need)
        this.len -= need
        o += need
      }
    }
    return o === n ? out : out.subarray(0, o)
  }

  async readSome(max) {
    if (this.len === 0 && !this.closed) await this._wait()
    if (this.len === 0) return null
    return this._take(Math.min(max, this.len))
  }

  async readExactly(n) {
    while (this.len < n && !this.closed) await this._wait()
    return this._take(Math.min(n, this.len))
  }

  _findNewline() {
    let base = 0
    for (const chunk of this.chunks) {
      const idx = chunk.indexOf(0x0a)
      if (idx !== -1) return base + idx
      base += chunk.length
    }
    return -1
  }

  async readLine(max = 65536) {
    for (;;) {
      const idx = this._findNewline()
      if (idx !== -1) {
        const line = this._take(idx + 1)
        return line.subarray(0, line.length - 1).subarray(0, Math.max(0, line.length - 1 - (line[line.length - 2] === 0x0d ? 1 : 0)))
      }
      if (this.closed || this.len > max) return this._take(this.len)
      await this._wait()
    }
  }
}

function parseStatus(line) {
  const m = /^HTTP\/\d\.\d\s+(\d{3})\s*(.*)$/.exec(line)
  if (!m) throw new Error(`bad status line: ${line}`)
  return { status: Number(m[1]), statusText: m[2] }
}

async function readHead(buf) {
  let line = await buf.readLine()
  while (line.length === 0 && !buf.closed) line = await buf.readLine()
  let { status, statusText } = parseStatus(new TextDecoder().decode(line))
  // skip any 1xx informational responses
  while (status >= 100 && status < 200) {
    for (;;) {
      const l = await buf.readLine()
      if (l.length === 0) break
    }
    line = await buf.readLine()
    ;({ status, statusText } = parseStatus(new TextDecoder().decode(line)))
  }
  const headers = new Headers()
  for (;;) {
    const l = await buf.readLine()
    if (l.length === 0) break
    const text = new TextDecoder().decode(l)
    const colon = text.indexOf(':')
    if (colon === -1) continue
    headers.append(text.slice(0, colon).trim(), text.slice(colon + 1).trim())
  }
  return { status, statusText, headers }
}

function bodyStream(buf, headers, status) {
  const noBody = status === 204 || status === 304
  if (noBody) return new ReadableStream({ start(c) { c.close() } })

  const chunked = /\bchunked\b/i.test(headers.get('transfer-encoding') || '')
  const lengthHeader = headers.get('content-length')
  let remaining = lengthHeader != null ? Number(lengthHeader) : -1
  let chunkRemaining = 0
  let first = chunked

  return new ReadableStream({
    async pull(controller) {
      try {
        if (chunked) {
          if (chunkRemaining === 0) {
            const line = await buf.readLine()
            const size = parseInt(new TextDecoder().decode(line).trim().split(';')[0], 16)
            if (!Number.isFinite(size)) throw new Error('bad chunk size')
            if (size === 0) {
              for (;;) {
                const l = await buf.readLine()
                if (l.length === 0) break
              }
              controller.close()
              return
            }
            chunkRemaining = size
          }
          const part = await buf.readSome(Math.min(chunkRemaining, 65536))
          if (!part) { controller.close(); return }
          chunkRemaining -= part.length
          controller.enqueue(part)
          if (chunkRemaining === 0) await buf.readExactly(2)
          return
        }
        if (first && remaining >= 0) {
          first = false
        }
        if (remaining === 0) { controller.close(); return }
        const part = await buf.readSome(remaining >= 0 ? Math.min(remaining, 65536) : 65536)
        if (!part) { controller.close(); return }
        if (remaining > 0) remaining -= part.length
        controller.enqueue(part)
      } catch (e) {
        controller.error(e)
      }
    },
    cancel() {
      buf._offD?.()
      buf._offC?.()
    },
  })
}

/**
 * Perform one HTTP/1.1 request over `transport` and resolve to a Response whose
 * body streams straight off the socket.
 *
 * @param {{connect:(host:string,port:number)=>Promise<any>}} transport
 * @param {{secure?:boolean, signal?:AbortSignal}} [opts]
 */
export async function fetchOverTransport(transport, url, init = {}, opts = {}) {
  const u = new URL(url)
  const host = u.hostname
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80

  const bodyBytes = init.body == null
    ? null
    : init.body instanceof Uint8Array
      ? init.body
      : encoder.encode(typeof init.body === 'string' ? init.body : JSON.stringify(init.body))

  const headers = { ...(init.headers || {}) }
  headers.host = u.host
  headers.connection = 'close'
  if (bodyBytes) headers['content-length'] = String(bodyBytes.length)

  const method = (init.method || 'GET').toUpperCase()
  const path = `${u.pathname}${u.search}`
  let head = `${method} ${path} HTTP/1.1\r\n`
  for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`
  head += '\r\n'
  const headBytes = encoder.encode(head)

  const stream = await transport.connect(host, port, opts.secure ? { secure: true } : undefined)

  let closed = false
  const onAbort = () => {
    if (closed) return
    closed = true
    try { stream.close() } catch { /* ignore */ }
  }
  init.signal?.addEventListener('abort', onAbort, { once: true })

  const request = new Uint8Array(headBytes.length + (bodyBytes ? bodyBytes.length : 0))
  request.set(headBytes, 0)
  if (bodyBytes) request.set(bodyBytes, headBytes.length)
  stream.send(request)

  const buf = new StreamBuf(stream)
  const head2 = await readHead(buf)
  const res = new Response(bodyStream(buf, head2.headers, head2.status), {
    status: head2.status,
    statusText: head2.statusText,
    headers: head2.headers,
  })
  const wrapCancel = () => {
    init.signal?.removeEventListener('abort', onAbort)
  }
  res.body.cancel = ((orig) => function (reason) {
    wrapCancel()
    try { stream.close() } catch { /* ignore */ }
    return orig.call(this, reason)
  })(res.body.cancel.bind(res.body))
  return res
}

/**
 * Build a `fetch`-shaped function bound to a transport. Any call whose method is
 * not GET uses a fresh connection; each call is independent (one request/conn).
 */
export function directFetch(transport, opts = {}) {
  return (url, init = {}) => fetchOverTransport(transport, url, init, opts)
}
