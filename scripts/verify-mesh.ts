import {
  mailboxPut,
  mailboxGet,
  parseGetReply,
  readUntilClose,
  type ByteStream,
} from '../lib/mesh.js'
export {}

// ---- in-memory fake mailbox tunnel, mirroring mailbox.c framing ----

function fakeMailbox(serve: (req: Uint8Array, reply: (b: Uint8Array) => void, close: () => void) => void): ByteStream {
  const dataCbs = new Set<(b: Uint8Array) => void>()
  const closeCbs = new Set<() => void>()
  let buf: Uint8Array = new Uint8Array(0)
  const stream: ByteStream = {
    send(b) {
      buf = cat(buf, b)
      process()
    },
    onData(cb) {
      dataCbs.add(cb)
      return () => dataCbs.delete(cb)
    },
    onClose(cb) {
      closeCbs.add(cb)
      return () => closeCbs.delete(cb)
    },
    close() {
      for (const cb of closeCbs) cb()
      closeCbs.clear()
    },
  }
  let processed = false
  function process() {
    if (processed || buf.length === 0) return
    processed = true
    const req = buf
    buf = new Uint8Array(0)
    serve(req, (b) => {
      // async delivery, like a real websocket frame
      queueMicrotask(() => {
        for (const cb of dataCbs) cb(b)
      })
    }, () => {
      queueMicrotask(() => stream.close())
    })
  }
  return stream
}

const spool: Uint8Array[] = []
function serveMailbox(req: Uint8Array, reply: (b: Uint8Array) => void, close: () => void) {
  const head = req[0]
  if (head === 0x50) {
    const len = new DataView(req.buffer, req.byteOffset + 1, 4).getUint32(0, false)
    spool.push(req.slice(5, 5 + len))
    reply(new TextEncoder().encode('OK\n'))
    close()
  } else if (head === 0x47) {
    const out = new Uint8Array(4 + spool.reduce((a, m) => a + 4 + m.length, 0))
    new DataView(out.buffer).setUint32(0, spool.length, false)
    let o = 4
    for (const m of spool) {
      new DataView(out.buffer, o, 4).setUint32(0, m.length, false)
      o += 4
      out.set(m, o)
      o += m.length
    }
    spool.length = 0
    reply(out)
    close()
  } else {
    throw new Error('bad head ' + head)
  }
}

function cat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// fake in-memory Transport so mailboxPut/Get go through the real seam
const fakeTransport = {
  name: 'fake',
  connect(_host: string, _port: number): Promise<ByteStream> {
    return Promise.resolve(fakeMailbox(serveMailbox))
  },
}

async function main() {
  let ok = true
  const check = (name: string, cond: boolean) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }

  // pure: parseGetReply synthetic
  const m1 = new TextEncoder().encode('hello mailbox')
  const m2 = new TextEncoder().encode('second sealed blob')
  const synth = new Uint8Array(4 + (4 + m1.length) + (4 + m2.length))
  new DataView(synth.buffer).setUint32(0, 2, false)
  let o = 4
  for (const m of [m1, m2]) {
    new DataView(synth.buffer, o, 4).setUint32(0, m.length, false)
    o += 4
    synth.set(m, o)
    o += m.length
  }
  const parsed = parseGetReply(synth)
  check('parseGetReply count', parsed.length === 2)
  check('parseGetReply msg1', Buffer.from(parsed[0]).equals(Buffer.from(m1)))
  check('parseGetReply msg2', Buffer.from(parsed[1]).equals(Buffer.from(m2)))

  // end-to-end over the seam + fake daemon: PUT then GET returns FIFO
  {
    spool.length = 0
    await mailboxPut(fakeTransport, 'fake.onion', 80, cat(new Uint8Array([1, 2, 3])))
    await mailboxPut(fakeTransport, 'fake.onion', 80, cat(new Uint8Array([4, 5, 6])))
    const got = await mailboxGet(fakeTransport, 'fake.onion', 80)
    check('fake FIFO count', got.length === 2)
    check('fake FIFO order', Buffer.from(got[1]).equals(Buffer.from([4, 5, 6])))
    check('mailbox drained', spool.length === 0)
  }

  // readUntilClose resolves with accumulated data on close (no reply bytes missing)
  {
    const t = fakeMailbox((req, reply, close) => {
      reply(new TextEncoder().encode('partial'))
      setTimeout(() => {
        reply(new TextEncoder().encode('tail'))
        close()
      }, 10)
    })
    t.send(new Uint8Array([0x47]))
    const all = await readUntilClose(t)
    check('readUntilClose aggregates', Buffer.from(all).equals(Buffer.from('partialtail')))
  }

  console.log(ok ? '\nALL OK (mesh protocol)' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})