// Chrome Direct Sockets API raw TCP service worker
const sockets = new Map()

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('message', async (e) => {
  const data = e.data || {}
  const port = e.ports && e.ports[0]
  
  if (data.type === 'open') {
    try {
      const socket = new TCPSocket(data.host, data.port, { useSecureTransport: false })
      await socket.opened
      sockets.set(data.requestId, { socket, port })
      port.postMessage({ type: 'opened', requestId: data.requestId })
      
      const reader = socket.readable.getReader()
      ;(async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            if (value && value.length) {
              port.postMessage({ type: 'data', requestId: data.requestId, bytes: value }, [value.buffer])
            }
          }
        } catch (err) {
          port.postMessage({ type: 'error', requestId: data.requestId, error: err.message })
        }
        sockets.delete(data.requestId)
        port.postMessage({ type: 'closed', requestId: data.requestId })
      })()
    } catch (err) {
      port.postMessage({ type: 'error', requestId: data.requestId, error: err.message })
    }
  } else if (data.type === 'send') {
    const s = sockets.get(data.requestId)
    if (s) {
      try {
        await s.socket.writable.getWriter().write(data.bytes)
      } catch (err) {
        port?.postMessage({ type: 'error', requestId: data.requestId, error: err.message })
      }
    }
  } else if (data.type === 'close') {
    const s = sockets.get(data.requestId)
    if (s) {
      try {
        s.socket.close()
      } catch (err) {}
      sockets.delete(data.requestId)
    }
  }
})
