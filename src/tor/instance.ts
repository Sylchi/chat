import type { ByteStream } from '../mesh.ts'
import type { TorCellFrame, TorCellInstance } from '../transports/tor-cell.ts'
import { loadTorWasm } from './wasm-loader.ts'

export class TorWasmInstance implements TorCellInstance {
  name: string
  private cellCbs: ((f: TorCellFrame) => void)[] = []

  constructor(name: string) {
    this.name = name
  }

  sendCell(frame: TorCellFrame): void {
    // Placeholder - cell-level send to wasm
    void frame
  }

  onCell(cb: (frame: TorCellFrame) => void): () => void {
    this.cellCbs.push(cb)
    return () => {
      const i = this.cellCbs.indexOf(cb)
      if (i >= 0) this.cellCbs.splice(i, 1)
    }
  }

  async connect(host: string, port: number): Promise<ByteStream> {
    // Placeholder - would use Tor circuit/stream APIs
    throw new Error('TorWasmInstance.connect not fully implemented')
  }

  close(): void {
    this.cellCbs = []
  }

  static async create(name: string, wasmUrl = '/tor.wasm'): Promise<TorWasmInstance> {
    const inst = new TorWasmInstance(name)
    await loadTorWasm(wasmUrl)
    return inst
  }
}
