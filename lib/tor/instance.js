import { loadTorWasm } from './wasm-loader.js'

export class TorWasmInstance {
  constructor(name) {
    this.name = name
    this.cellCbs = []
  }

  sendCell(frame) {
    // Placeholder - cell-level send to wasm
    void frame
  }

  onCell(cb) {
    this.cellCbs.push(cb)
    return () => {
      const i = this.cellCbs.indexOf(cb)
      if (i >= 0) this.cellCbs.splice(i, 1)
    }
  }

  async connect(host, port) {
    // Placeholder - would use Tor circuit/stream APIs
    throw new Error('TorWasmInstance.connect not fully implemented')
  }

  close() {
    this.cellCbs = []
  }

  static async create(name, wasmUrl = new URL('../../tor.wasm', import.meta.url)) {
    const inst = new TorWasmInstance(name)
    await loadTorWasm(wasmUrl)
    return inst
  }
}