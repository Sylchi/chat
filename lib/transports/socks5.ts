import type { ByteStream, Transport } from '../mesh.ts'

// ---------------------------------------------------------------------------
// socks5 transport (Node/desktop): connect straight to a local Tor instance
// (tor daemon SocksPort, or Tor Browser's tor). Uses a lazy `node:net`
// import so the module stays browser-bundle-safe (throws only when used).
// ---------------------------------------------------------------------------

export interface SocksProxy {
  host: string
  port: number
}

export function socks5Transport(proxy: SocksProxy): Transport {
  return {
    name: `socks5:${proxy.host}:${proxy.port}`,
    async connect(host, port) {
      const net = await import('node:net')
      return await socksDial(net, proxy, host, port)
    },
  }
}

function socksDial(
  net: typeof import('node:net'),
  proxy: SocksProxy,
  host: string,
  port: number,
): Promise<ByteStream> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxy.port, proxy.host)
    const dataCbs = new Set<(b: Uint8Array) => void>()
    const closeCbs = new Set<() => void>()
    let buf = Buffer.alloc(0)
    let stage: 'greet' | 'connect' | 'done' = 'greet'
    let done = false

    const finish = (err?: Error) => {
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
      buf = Buffer.concat([buf, d])
      if (stage === 'greet') {
        if (buf.length < 2) return
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          finish(new Error('socks5: server refused no-auth'))
          sock.destroy()
          return
        }
        const hb = Buffer.from(host)
        if (hb.length > 255) {
          finish(new Error('socks5: host too long'))
          sock.destroy()
          return
        }
        // CONNECT host:port (domain type)
        sock.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hb.length]),
          hb,
          Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        ]))
        buf = Buffer.alloc(0)
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
        sock.on('data', (dd: Buffer) => {
          for (const cb of dataCbs) cb(dd)
        })
        resolve({
          send: (b) => sock.write(Buffer.from(b)),
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
    sock.write(Buffer.from([0x05, 0x01, 0x00])) // greeting: [ver][nmethods][no-auth]
  })
}