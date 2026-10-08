export interface TorWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  tor_init(): void
  tor_get_last_error(): number
}
