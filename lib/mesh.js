// ---------------------------------------------------------------------------
// Mesh: transport-agnostic byte streams + mailbox protocol on top of Tor.
//
// The app never talks to the Tor network directly. A Transport produces a
// ByteStream to an arbitrary host (usually an .onion):port. Concrete
// transports are pluggable and interchangeable:
//
//   ws-bridge  (browser) -> WebSocket relay on the VPS that dials SOCKS5 tor
//   socks5     (desktop) -> connect straight to a local tor SOCKS port
//   wasm-tor   (browser) -> future: Arti compiled to wasm in a Web Worker,
//                           so the page runs its own Tor, hidden services
//                           only alive while the user is present
//
// The mailbox daemon speaks one tiny protocol per connection:
//   PUT: 'P' <u32be len> <bytes>   -> "OK\n"              (append to spool)
//   GET: 'G'                       -> 4B count, then per msg 4B len <bytes>
//   (server closes the socket after exactly one command)
//
// All crypto happens *above* this layer: every blob is already a sealed
// envelope (user->app->device) before it reaches here. This file is pure I/O.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ByteStream
 * @property {(b: Uint8Array) => void} send
 * @property {(cb: (b: Uint8Array) => void) => () => void} onData
 * @property {(cb: () => void) => () => void} onClose
 * @property {() => void} close
 */

/**
 * @typedef {Object} Transport
 * @property {string} name
 * @property {(host: string, port: number) => Promise<ByteStream>} connect  Dial host:port (host may be a v3 onion)
 */

// ---- mailbox wire framing ----

function u32be(n) {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, n >>> 0, false)
  return out
}
function getU32be(b, off) {
  return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, false)
}
function cat(...parts) {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Read reply bytes from the stream until the far end closes the connection. */
export function readUntilClose(s, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    const timer = setTimeout(() => reject(new Error('mailbox reply timeout')), timeoutMs)
    const offD = s.onData((b) => {
      chunks.push(b)
      total += b.length
    })
    const offC = s.onClose(() => {
      clearTimeout(timer)
      offD()
      offC()
      const out = new Uint8Array(total)
      let o = 0
      for (const c of chunks) {
        out.set(c, o)
        o += c.length
      }
      resolve(out)
    })
  })
}

/** PUT one sealed blob into a mailbox reachable at host:port. */
export async function mailboxPut(tr, host, port, blob) {
  if (!blob.length || blob.length > 512 * 1024) throw new Error('blob must be 1..512KiB')
  const s = await tr.connect(host, port)
  try {
    const replyP = readUntilClose(s)
    s.send(cat(Uint8Array.of(0x50), u32be(blob.length), blob))
    const reply = await replyP
    if (new TextDecoder().decode(reply) !== 'OK\n') {
      throw new Error('mailbox PUT rejected')
    }
  } finally {
    s.close()
  }
}

/** GET (drain) a mailbox reachable at host:port; messages in FIFO order. */
export async function mailboxGet(tr, host, port) {
  const s = await tr.connect(host, port)
  try {
    const replyP = readUntilClose(s)
    s.send(Uint8Array.of(0x47)) // 'G'
    return parseGetReply(await replyP)
  } finally {
    s.close()
  }
}

export function parseGetReply(reply) {
  if (reply.length < 4) throw new Error('short GET reply')
  const count = getU32be(reply, 0)
  const msgs = []
  let off = 4
  for (let i = 0; i < count; i++) {
    if (off + 4 > reply.length) throw new Error('GET reply truncated')
    const len = getU32be(reply, off)
    off += 4
    if (off + len > reply.length) throw new Error('GET message truncated')
    msgs.push(reply.slice(off, off + len))
    off += len
  }
  return msgs
}