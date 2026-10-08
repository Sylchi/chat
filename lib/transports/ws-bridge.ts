import type { ByteStream, Transport } from '../mesh.ts'

// ---------------------------------------------------------------------------
// ws-bridge transport (browser + Node 22+).
//
// relay talks to the ws-bridge (a hand-rolled RFC6455<->SOCKS5 C daemon on
// the VPS). One WebSocket = one mailbox connection; the relay dials the onion
// through its Tor SocksPort and pipes frames <-> raw bytes.
// ---------------------------------------------------------------------------

function streamFromWebSocket(ws: WebSocket): ByteStream {
  ws.binaryType = 'arraybuffer'
  return {
    send: (b) => ws.send(b),
    onData: (cb) => {
      const h = (e: MessageEvent) => {
        if (typeof e.data === 'string') return
        cb(new Uint8Array(e.data as ArrayBuffer))
      }
      ws.addEventListener('message', h as EventListener)
      return () => ws.removeEventListener('message', h as EventListener)
    },
    onClose: (cb) => {
      ws.addEventListener('close', cb as EventListener)
      return () => ws.removeEventListener('close', cb as EventListener)
    },
    close: () => ws.close(),
  }
}

export function wsBridgeTransport(endpoint: string): Transport {
  return {
    name: 'ws-bridge',
    connect(host, port) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(endpoint)
        const stream = streamFromWebSocket(ws)
        let settled = false

        ws.onopen = () => ws.send(JSON.stringify({ cmd: 'connect', host, port }))
        ws.onmessage = (e: MessageEvent) => {
          if (typeof e.data !== 'string') return // binary session data flows via onData
          const t = e.data as string
          if (t.includes('"event":"open"')) {
            settled = true
            resolve(stream)
          } else if (t.includes('"event":"error"')) {
            const m = /"reason":"([^"]*)"/.exec(t)
            settled = true
            reject(new Error(m ? m[1] : 'bridge refused'))
          }
        }
        ws.onerror = () => {
          if (!settled) {
            settled = true
            reject(new Error('bridge ws error'))
          }
        }
        ws.onclose = () => {
          if (!settled) {
            settled = true
            reject(new Error('bridge closed before open'))
          }
        }
      })
    },
  }
}