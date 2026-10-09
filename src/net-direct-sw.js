// Transport using Service Worker + Direct Sockets API
export function directSwTransport() {
  let sw = null
  let requestId = 0
  const pending = new Map()

  async function init() {
    if (sw) return sw
    if (!('serviceWorker' in navigator)) throw new Error('No service worker support')
    sw = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url))
    await navigator.serviceWorker.ready
    return sw
  }

  return {
    name: 'direct-socket-sw',
    async connect(host, port) {
      await init()
      const id = ++requestId
      const { port: msgPort, closeCbs, dataCbs, opened } = await new Promise((resolve, reject) => {
        const channel = new MessageChannel()
        const mp = channel.port1
        const closeCbs = new Set()
        const dataCbs = new Set()
        let opened = false
        mp.onmessage = (e) => {
          const d = e.data || {}
          if (d.requestId !== id) return
          if (d.type === 'opened') {
            opened = true
            resolve({ port: mp, closeCbs, dataCbs, opened: true })
          } else if (d.type === 'data') {
            const bytes = d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(d.bytes)
            for (const cb of dataCbs) cb(bytes)
          } else if (d.type === 'closed') {
            for (const cb of closeCbs) cb()
            closeCbs.clear()
            dataCbs.clear()
          } else if (d.type === 'error') {
            if (!opened) reject(new Error(d.error))
            else {
              for (const cb of closeCbs) cb()
              closeCbs.clear()
            }
          }
        }
        const swReg = navigator.serviceWorker.controller || sw.active
        if (!swReg) return reject(new Error('no controller'))
        swReg.postMessage({ type: 'open', requestId: id, host, port }, [channel.port2])
      })

      return {
        send: (b) => {
          const swReg = navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(r => r.active).then(a => {
            a.postMessage({ type: 'send', requestId: id, bytes: b }, [b.buffer])
          }).catch(() => {})
          if (swReg instanceof Promise) swReg
          else {
            const ch = new MessageChannel()
            swReg.postMessage({ type: 'send', requestId: id, bytes: b }, [ch.port2, b.buffer])
          }
        },
        onData: (cb) => { dataCbs.add(cb); return () => dataCbs.delete(cb) },
        onClose: (cb) => { closeCbs.add(cb); return () => closeCbs.delete(cb) },
        close: () => {
          const swReg = navigator.serviceWorker.controller || sw.active
          if (swReg) swReg.postMessage({ type: 'close', requestId: id })
          msgPort.close()
        }
      }
    }
  }
}
