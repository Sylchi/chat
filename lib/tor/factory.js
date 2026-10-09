import { TorWasmInstance } from './instance.js'
import { createTorCellTransport } from './cell-bridge.js'

// One Tor instance is enough for now (was: three isolated app/device/user
// instances). Everything that needs a circuit shares this instance; per-
// principal isolation can come back once the wasm client is fully driven.
export async function createTorInstance(name = 'tor', wasmUrl = '/tor.wasm') {
  const instance = await TorWasmInstance.create(name, wasmUrl)
  return { instance, transport: createTorCellTransport(instance, `tor-cell:${name}`) }
}
