export function torWasmTransport(opts = {}) {
  return {
    name: 'tor-wasm',
    async connect(host, port) {
      throw new Error('tor-wasm transport not yet implemented')
    },
  }
}