// Verify the SOCKS5 transport against a fake SOCKS5 proxy server (Node).
export {}

import { socks5Transport } from '../lib/transports/socks5.ts'
import * as net from 'node:net'

function startFakeProxy() {
  // the "target" the proxy pretends to reach — an echo service
  const target = net.createServer((s) => s.pipe(s))

  const proxy = net.createServer((conn) => {
    let buf = Buffer.alloc(0)
    let stage: 'greet' | 'connect' | 'piped' = 'greet'
    conn.on('data', (d) => {
      buf = Buffer.concat([buf, d])
      if (stage === 'greet') {
        if (buf.length < 3) return
        conn.write(Buffer.from([5, 0])) // greeting reply: no-auth
        buf = buf.slice(3)
        stage = 'connect'
      } else if (stage === 'connect') {
        if (buf.length < 7) return
        const atyp = buf[3]
        let host = ''
        let port = 0
        if (atyp === 1) {
          if (buf.length < 4 + 4 + 2) return
          host = [...buf.slice(4, 8)].join('.')
          port = buf.readUInt16BE(8)
          buf = buf.slice(10)
        } else if (atyp === 3) {
          const hl = buf[4]
          if (buf.length < 5 + hl + 2) return
          host = buf.slice(5, 5 + hl).toString()
          port = buf.readUInt16BE(5 + hl)
          buf = buf.slice(5 + hl + 2)
        } else {
          conn.destroy()
          return
        }
        console.log('proxy CONNECT', host, port)
        // success reply: ipv4 0.0.0.0:0
        conn.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
        const t = net.connect(port, host)
        t.on('connect', () => {
          stage = 'piped'
          if (buf.length) t.write(buf)
          conn.pipe(t)
          t.pipe(conn)
        })
        t.on('error', () => conn.destroy())
      }
    })
  })

  return new Promise<{ proxy: net.Server; target: net.Server; port: number }>((resolve) => {
    target.listen(0, () => {
      proxy.listen(0, () => {
        resolve({ proxy, target, port: (proxy.address() as net.AddressInfo).port })
      })
    })
  })
}

async function main() {
  let ok = true
  const check = (name: string, cond: boolean) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }

  const { proxy, target, port } = await startFakeProxy()
  try {
    const tr = socks5Transport({ host: '127.0.0.1', port })

    // 1) domain-type target
    const echoPort = (target.address() as net.AddressInfo).port
    const s = await tr.connect('127.0.0.1', echoPort)
    console.log(' -> connected (domain CONNECT)')

    const msg = new TextEncoder().encode('hello over socks5 @ ' + Date.now())
    const echo = new Promise<void>((resolve, reject) => {
      const off = s.onData((b) => {
        const got = Buffer.from(b)
        console.log('   echo rx:', got.toString())
        if (got.equals(Buffer.from(msg))) {
          off()
          resolve()
        }
      })
      setTimeout(() => reject(new Error('echo timeout')), 3000)
    })
    s.send(msg)
    await echo
    s.close()
  } finally {
    proxy.close()
    target.close()
  }

  console.log(ok ? '\nALL OK (socks5)' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})