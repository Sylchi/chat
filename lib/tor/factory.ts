import { TorWasmInstance } from './instance.ts'
import { createTorCellTransport } from './cell-bridge.ts'
import type { Transport } from '../mesh.ts'

export interface TorIsolationSet {
  app: Transport
  device: Transport
  user: Transport
  instances: {
    app: TorWasmInstance
    device: TorWasmInstance
    user: TorWasmInstance
  }
}

export async function createIsolatedTorSet(wasmUrl = '/tor.wasm'): Promise<TorIsolationSet> {
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
