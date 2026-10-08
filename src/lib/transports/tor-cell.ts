import type { ByteStream } from '../mesh.ts'

export interface TorCellFrame {
  circId: number
  cmd: number
  payload: Uint8Array
}

export interface TorCellTransport {
  name: string
  sendCell(frame: TorCellFrame): void
  onCell(cb: (frame: TorCellFrame) => void): () => void
  close(): void
}

export interface TorCellInstance {
  sendCell(frame: TorCellFrame): void
  onCell(cb: (frame: TorCellFrame) => void): () => void
  connect(host: string, port: number): Promise<ByteStream>
  close(): void
}
