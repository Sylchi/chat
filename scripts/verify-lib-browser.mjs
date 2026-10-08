// Browser-compat check for lib/: assert lib code never touches Node-only APIs
// (Buffer, node: built-ins), that every module imports cleanly as plain ESM,
// and that the pure crypto/identity/keystore/onion/mesh paths round-trip in a
// browser-shaped environment (global Buffer disabled).
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const libRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')

let failures = 0
const check = (name, cond) => {
  console.log(name, cond ? 'OK' : 'FAIL')
  if (!cond) failures++
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) walk(full, out)
    else if (name.name.endsWith('.js')) out.push(full)
  }
  return out
}

const files = walk(libRoot)
check(`lib has JS modules (${files.length})`, files.length > 0)

for (const file of files) {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const rel = relative(process.cwd(), file)
  if (/\bBuffer\b/.test(code)) check(`${rel}: no Buffer`, false)
  if (/from\s+['"]node:/.test(code)) check(`${rel}: no static node: import`, false)
}
// dynamic node: import allowed only for the lazy socks5 transport
const socksCode = readFileSync(join(libRoot, 'transports', 'socks5.js'), 'utf8')
const dynamicNet = (socksCode.match(/import\('node:net'\)/g) ?? []).length
check('socks5 lazy node:net import (dynamic, 1x)', dynamicNet === 1)

// ---- load every module with Buffer disabled (browser-shaped) ----
globalThis.Buffer = undefined

const cryptoMod = await import('../lib/crypto.js')
const keystoreMod = await import('../lib/keystore.js')
const identityMod = await import('../lib/identity.js')
const onionMod = await import('../lib/onion.js')
const meshMod = await import('../lib/mesh.js')
const sockMod = await import('../lib/transports/socks5.js')
const bridgeMod = await import('../lib/transports/ws-bridge.js')
const torWasmm = await import('../lib/transports/tor-wasm.js')
const torCellMod = await import('../lib/transports/tor-cell.js')
const cellBridgeMod = await import('../lib/tor/cell-bridge.js')
const torFactoryMod = await import('../lib/tor/factory.js')
const torInstanceMod = await import('../lib/tor/instance.js')

const bytesOf = (s) => cryptoMod.bytesOf(s)

// base64url round-trip via atob/btoa (no Buffer)
const b64 = cryptoMod.toBase64Url(bytesOf('mesh round-trip 🧅'))
check('toBase64Url', b64 === 'bWVzaCByb3VuZC10cmlwIPCfp4U')
check('fromBase64Url round-trip', cryptoMod.strOf(cryptoMod.fromBase64Url(b64)) === 'mesh round-trip 🧅')

// keystore enroll -> unlock mirrors identical device key (pure PRF path)
const salt = new Uint8Array(32).fill(4)
const credId = 'c' + 'b'.repeat(43)
const prf = await cryptoMod.hkdf(bytesOf('browser passkey'), salt, bytesOf('prf'), 32)
const store = keystoreMod.memoryStore()
const { session, self } = await keystoreMod.enrollFromPrf(store, salt, credId, 'browser user', prf)
check('keystore enroll', session.deviceId.length > 0 && self.id.length > 0)
const session2 = await keystoreMod.unlockFromPrf(store, prf)
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
check('keystore unlock mirrors device key', eq(session2.devicePriv, session.devicePriv))

// full layered envelope: seal to self's three principals, open with session keys
const env = await identityMod.sealTo(
  bytesOf('secret note 🔐'),
  { userPub: self.userPub, appPub: self.appPub, devicePub: self.devicePub, deviceId: self.deviceId },
)
const opened = await identityMod.openSealed(env, {
  userPriv: session.userDec.priv,
  appPriv: session.appEnc.priv,
  devicePriv: session.devicePriv,
})
check('sealTo/openSealed round-trip', cryptoMod.strOf(opened) === 'secret note 🔐')

// onion address round-trip
const pub = new Uint8Array(32).fill(7)
const addr = onionMod.onionAddress(pub)
check('onion address shape', /^[a-z2-7]{56}\.onion$/.test(addr))
const parsed = onionMod.onionAddressFromBase32(addr)
check('onion address reverse-parse', !!parsed && eq(parsed.pub, pub))

// mesh framing
const reply = meshMod.parseGetReply((() => {
  const u32be = (n) => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, false)
    return b
  }
  const a = bytesOf('m1')
  const b = bytesOf('m2')
  const header = u32be(2)
  const out = new Uint8Array(4 + 4 + a.length + 4 + b.length)
  out.set(header, 0)
  out.set(u32be(a.length), 4); out.set(a, 8)
  out.set(u32be(b.length), 8 + a.length); out.set(b, 12 + a.length)
  return out
})())
check('mesh parseGetReply', reply.length === 2 && cryptoMod.strOf(reply[1]) === 'm2')

// transports construct without touching Node-only APIs
const t1 = sockMod.socks5Transport({ host: '127.0.0.1', port: 9050 })
const t2 = bridgeMod.wsBridgeTransport('ws://127.0.0.1:9002')
const t3 = torWasmm.torWasmTransport()
const fakeInst = { connect: async () => { throw new Error('no') } }
const t4 = cellBridgeMod.createTorCellTransport(fakeInst, 'x')
check('socks5/ws/tor-wasm transports construct', t1.name.startsWith('socks5') && t2.name === 'ws-bridge' && t3.name === 'tor-wasm' && t4.name === 'x')

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall lib modules browser-ready')
process.exit(failures ? 1 : 0)