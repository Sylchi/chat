import type { ByteStream, Transport } from '../mesh.ts'

export interface TorWasmOptions {
  wasmUrl?: string
}

export function torWasmTransport(opts: TorWasmOptions = {}): Transport {
  return {
    name: 'tor-wasm',
    async connect(host: string, port: number): Promise<ByteStream> {
      throw new Error('tor-wasm transport not yet implemented')
    },
  }
}
