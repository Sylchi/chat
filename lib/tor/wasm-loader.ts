import type { TorWasmExports } from './types.ts'

export interface WasmInstance {
  memory: WebAssembly.Memory
  exports: TorWasmExports
}

export async function loadTorWasm(wasmUrl: string): Promise<WasmInstance> {
  const resp = await fetch(wasmUrl)
  const bytes = await resp.arrayBuffer()
  const mod = await WebAssembly.compile(bytes)
  let memRef: WebAssembly.Memory | null = null
  const imports = {
    env: {
      __multi3: (out: number, aLo: number, aHi: number, bLo: number, bHi: number) => {
        if (!memRef) return
        const a = (BigInt(aLo) | (BigInt(aHi) << 64n)) & ((1n << 128n) - 1n)
        const b = (BigInt(bLo) | (BigInt(bHi) << 64n)) & ((1n << 128n) - 1n)
        const r = a * b
        const dv = new DataView(memRef.buffer)
        dv.setBigUint64(out, r & 0xFFFFFFFFFFFFFFFFn, true)
        dv.setBigUint64(out + 8, r >> 64n, true)
      },
    },
  }
  const inst = await WebAssembly.instantiate(mod, imports)
  memRef = inst.exports.memory as WebAssembly.Memory
  return {
    memory: memRef,
    exports: inst.exports as unknown as TorWasmExports,
  }
}
