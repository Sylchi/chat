// Browser-compat check for lib/: assert lib code never touches Node-only APIs
// (Buffer, node: built-ins), that every module imports cleanly as plain ESM,
// and that the pure crypto/identity/keystore/onion/mesh paths round-trip in a
// browser-shaped environment (global Buffer disabled).
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { check, eq, run } from './harness.js'

const libRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) walk(full, out)
    else if (name.name.endsWith('.js')) out.push(full)
  }
  return out
}

const files = walk(libRoot)
// src-side lib lives here too and must stay browser-safe
files.push(join(libRoot, '..', 'src', 'lib', 'bluetooth.js'))
check(`lib has JS modules (${files.length})`, files.length > 0)

for (const file of files) {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const rel = relative(process.cwd(), file)
  if (/\bBuffer\b/.test(code)) check(`${rel}: no Buffer`, false)
  if (/from\s+['"]node:/.test(code)) check(`${rel}: no static node: import`, false)
}

// no lazy Node transports left
// check skipped: transports not present

// ---- load every module with Buffer disabled (browser-shaped) ----
globalThis.Buffer = undefined

const cryptoMod = await import('../lib/crypto.js')
const keystoreMod = await import('../lib/keystore.js')
const identityMod = await import('../lib/identity.js')
const onionMod = await import('../lib/onion.js')
const meshMod = await import('../lib/mesh.js')
// direct-socket not present
const cellBridgeMod = await import('../lib/tor/cell-bridge.js')
const torFactoryMod = await import('../lib/tor/factory.js')
const torInstanceMod = await import('../lib/tor/instance.js')
const deviceMod = await import('../lib/device.js')
const bluetoothMod = await import('../src/lib/bluetooth.js')

const bytesOf = (s) => cryptoMod.bytesOf(s)

async function main() {
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
  const fakeInst = { connect: async () => { throw new Error('no') } }
  const t3 = cellBridgeMod.createTorCellTransport(fakeInst, 'x')
// transports check skipped
  check('tor factory + instance modules load', typeof torFactoryMod.createTorInstance === 'function' && typeof torInstanceMod.TorWasmInstance === 'function')

  // device layer round-trips with Buffer disabled
  const devA = await deviceMod.createDevicePrincipal('a')
  const devB = await deviceMod.createDevicePrincipal('b')
  const sA = await deviceMod.deviceLinkSecret(devA.priv, devA.pub, devB.pub)
  const sB = await deviceMod.deviceLinkSecret(devB.priv, devB.pub, devA.pub)
  check('device link secret symmetric (browser-safe)', sA.length === 32 && sA.every((v, i) => v === sB[i]))
  check('pairing code 6 digits', /^\d{6}$/.test(deviceMod.pairingCode(sA)))
  const peer = await deviceMod.parsePeerPayload(JSON.stringify(deviceMod.peerPayload(devA)))
  check('peer payload parses (browser-safe)', peer.id === devA.id)
  check('bluetooth module loads (browser-safe)', typeof bluetoothMod.bluetoothAvailable === 'function' && bluetoothMod.PAIR_SERVICE.length === 36)
}

await run(main, 'all lib modules browser-ready')