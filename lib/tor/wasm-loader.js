export async function loadTorWasm(wasmUrl) {
  const resp = await fetch(wasmUrl)
  const bytes = await resp.arrayBuffer()
  const mod = await WebAssembly.compile(bytes)
  let memRef = null
  const imports = {
    env: {
      __multi3: (out, aLo, aHi, bLo, bHi) => {
        if (!memRef) return
        const a = (BigInt(aLo) | (BigInt(aHi) << 64n)) & ((1n << 128n) - 1n)
        const b = (BigInt(bLo) | (BigInt(bHi) << 64n)) & ((1n << 128n) - 1n)
        const r = a * b
        const dv = new DataView(memRef.buffer)
        dv.setBigUint64(out, r & 0xffffffffffffffffn, true)
        dv.setBigUint64(out + 8, r >> 64n, true)
      },
    },
  }
  const inst = await WebAssembly.instantiate(mod, imports)
  memRef = inst.exports.memory
  return {
    memory: memRef,
    exports: inst.exports,
  }
}