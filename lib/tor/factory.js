import { TorWasmInstance } from './instance.js'
import { createTorCellTransport } from './cell-bridge.js'

export async function createIsolatedTorSet(wasmUrl = '/tor.wasm') {
  const [appInst, deviceInst, userInst] = await Promise.all([
    TorWasmInstance.create('app', wasmUrl),
    TorWasmInstance.create('device', wasmUrl),
    TorWasmInstance.create('user', wasmUrl),
  ])
  return {
    app: createTorCellTransport(appInst, 'tor-cell:app'),
    device: createTorCellTransport(deviceInst, 'tor-cell:device'),
    user: createTorCellTransport(userInst, 'tor-cell:user'),
    instances: { app: appInst, device: deviceInst, user: userInst },
  }
}