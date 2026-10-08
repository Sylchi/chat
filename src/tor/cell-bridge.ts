import type { ByteStream, Transport } from '../mesh.ts'
import type { TorCellFrame, TorCellInstance } from '../transports/tor-cell.ts'

export function createTorCellTransport(instance: TorCellInstance, name = 'tor-cell'): Transport {
  return {
    name,
    async connect(host: string, port: number): Promise<ByteStream> {
      return instance.connect(host, port)
    },
  }
}
