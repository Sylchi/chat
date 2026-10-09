/**
 * @typedef {Object} TorWasmExports
 * @property {WebAssembly.Memory} memory
 * @property {() => void} tor_init
 * @property {() => number} tor_get_last_error
 */

/**
 * @typedef {Object} TorCellFrame
 * @property {number} circId
 * @property {number} cmd
 * @property {Uint8Array} payload
 */

/**
 * @typedef {Object} TorCellTransport
 * @property {string} name
 * @property {(frame: TorCellFrame) => void} sendCell
 * @property {(cb: (frame: TorCellFrame) => void) => () => void} onCell
 * @property {() => void} close
 */

/**
 * @typedef {Object} TorCellInstance
 * @property {(frame: TorCellFrame) => void} sendCell
 * @property {(cb: (frame: TorCellFrame) => void) => () => void} onCell
 * @property {(host: string, port: number) => Promise<import('../mesh.js').ByteStream>} connect
 * @property {() => void} close
 */

export {} // keep this file a module for the typedefs
