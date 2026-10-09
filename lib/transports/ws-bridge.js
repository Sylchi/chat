// ---------------------------------------------------------------------------
// ws-bridge transport (browser + Node 22+).
//
// relay talks to the ws-bridge (a hand-rolled RFC6455<->SOCKS5 C daemon on
// the VPS). One WebSocket = one mailbox connection; the relay dials the onion
// through its Tor SocksPort and pipes frames <-> raw bytes.
// ---------------------------------------------------------------------------

function streamFromWebSocket(ws) {
  ws.binaryType = 'arraybuffer'
  return {
    send: (b) => ws.send(b),
    onData: (cb) => {
      const h = (e) => {
        if (typeof e.data === 'string') return
        cb(new Uint8Array(e.data))
      }
      ws.addEventListener('message', h)
      return () => ws.removeEventListener('message', h)
    },
    onClose: (cb) => {
      ws.addEventListener('close', cb)
      return () => ws.removeEventListener('close', cb)
    },
    close: () => ws.close(),
  }
}

export function wsBridgeTransport(endpoint) {
  return {
    name: 'ws-bridge',
    connect(host, port) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(endpoint)
        const stream = streamFromWebSocket(ws)
        let settled = false

        ws.onopen = () => ws.send(JSON.stringify({ cmd: 'connect', host, port }))
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') return // binary session data flows via onData
          let event
          try {
            event = JSON.parse(e.data)
          } catch {
            return // not a control frame
          }
          if (event.event === 'open') {
            settled = true
            resolve(stream)
          } else if (event.event === 'error') {
            settled = true
            reject(new Error(event.reason || 'bridge refused'))
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