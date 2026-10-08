// ---------------------------------------------------------------------------
// socks5 transport (Node/desktop): connect straight to a local Tor instance
// (tor daemon SocksPort, or Tor Browser's tor). Uses a lazy `node:net`
// import so the module stays browser-safe (throws only when used).
// ---------------------------------------------------------------------------

const enc = new TextEncoder()

function bytesFrom(s) {
  return enc.encode(s)
}

function catBytes(...parts) {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function asUint8(d) {
  return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
}

export function socks5Transport(proxy) {
  return {
    name: `socks5:${proxy.host}:${proxy.port}`,
    async connect(host, port) {
      const net = await import('node:net')
      return await socksDial(net, proxy, host, port)
    },
  }
}

function socksDial(net, proxy, host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxy.port, proxy.host)
    const dataCbs = new Set()
    const closeCbs = new Set()
    let buf = new Uint8Array(0)
    let stage = 'greet'
    let done = false

    const finish = (err) => {
      if (done) return
      done = true
      if (err) sock.destroy()
    }

    sock.on('error', (e) => finish(new Error('socks5: ' + e.message)))
    sock.on('close', () => {
      for (const cb of closeCbs) cb()
      closeCbs.clear()
      if (stage !== 'done') finish(new Error('socks5: proxy closed'))
    })
    sock.on('data', (d) => {
      const data = asUint8(d)
      buf = catBytes(buf, data)
      if (stage === 'greet') {
        if (buf.length < 2) return
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          finish(new Error('socks5: server refused no-auth'))
          sock.destroy()
          return
        }
        const hb = bytesFrom(host)
        if (hb.length > 255) {
          finish(new Error('socks5: host too long'))
          sock.destroy()
          return
        }
        // CONNECT host:port (domain type)
        sock.write(catBytes(
          new Uint8Array([0x05, 0x01, 0x00, 0x03, hb.length]),
          hb,
          new Uint8Array([(port >> 8) & 0xff, port & 0xff]),
        ))
        buf = new Uint8Array(0)
        stage = 'connect'
      } else if (stage === 'connect') {
        if (buf.length < 4) return
        if (buf[1] !== 0x00) {
          finish(new Error('socks5: connect failed (code ' + buf[1] + ')'))
          sock.destroy()
          return
        }
        let skip = 4
        if (buf[3] === 0x01) skip += 4
        else if (buf[3] === 0x03) skip += 1 + buf[4]
        else if (buf[3] === 0x04) skip += 16
        if (buf.length < skip + 2) return
        const remainder = buf.slice(skip + 2)
        stage = 'done'
        sock.removeAllListeners('data')
        if (remainder.length) {
          for (const cb of dataCbs) cb(remainder)
        }
        sock.on('data', (dd) => {
          for (const cb of dataCbs) cb(asUint8(dd))
        })
        resolve({
          send: (b) => sock.write(asUint8(b)),
          onData: (cb) => {
            dataCbs.add(cb)
            return () => dataCbs.delete(cb)
          },
          onClose: (cb) => {
            closeCbs.add(cb)
            return () => closeCbs.delete(cb)
          },
          close: () => sock.end(),
        })
      }
    })
    sock.write(new Uint8Array([0x05, 0x01, 0x00])) // greeting: [ver][nmethods][no-auth]
  })
}