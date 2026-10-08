import {
  bytesOf,
  concatBytes,
  x25519Keypair,
  x25519SharedSecret,
  aesGcmEncrypt,
  aesGcmDecrypt,
  hkdf,
  randomBytes,
  sha256,
  toBase64Url,
  fromBase64Url,
  bytesToHex,
} from './crypto.js'

// ---------------------------------------------------------------------------
// Device layer — the FIRST encryption layer, set up before any user/passkey.
//
// Model ("my seed"):
//   Each device owns ONE seed. Its private key stays on that device; only the
//   public key ever leaves it, and the peer keeps that public key as the seed
//   for that link. Devices pair over Bluetooth (src/lib/bluetooth.js) or by
//   exchanging a peer payload out-of-band.
//
//   local   : { seed, priv(keyed by store), pub }            never exported
//   linked  : { id, name, pub }                              exported to peers
//
//   link secret between A and B is ECDH(A.priv, B.pub) bound to the ordered
//   pair (A.pub,B.pub), so both sides derive the SAME value and can compare a
//   6-digit verification code out-of-band. The user/app layer (passkey →
//   I_U → user/app keys) sits ON TOP of this in lib/identity.js + keystore.
// ---------------------------------------------------------------------------

export const DEVICE_NS = 'luma/v1'
export const DEVICE_SEED_INFO = `${DEVICE_NS}/devseed/v1`
export const DEVICE_LINK_INFO = `${DEVICE_NS}/devlink/v1`

export async function devIdFor(pub) {
  if (pub.length !== 32) throw new Error('device pubkey must be 32 bytes')
  return toBase64Url((await sha256(pub)).slice(0, 9))
}

export async function deviceFingerprint(pub) {
  if (pub.length !== 32) throw new Error('device pubkey must be 32 bytes')
  return bytesToHex((await sha256(pub)).slice(0, 4)).toUpperCase()
}

/**
 * Create a fresh device principal from a random seed. The seed IS the private
 * material: `priv` is derived deterministically, so persisting the (wrapped)
 * seed is sufficient to restore the device after reload.
 * @returns {Promise<{id: string, name: string, seed: Uint8Array, pub: Uint8Array, priv: Uint8Array}>}
 */
export async function createDevicePrincipal(name = 'S device') {
  const seed = randomBytes(32)
  const kp = await x25519Keypair(seed)
  return { id: await devIdFor(kp.pub), name, seed, pub: kp.pub, priv: kp.priv }
}

/** Deterministic keypair from a device seed. */
export async function keypairFromSeed(seed) {
  if (seed.length !== 32) throw new Error('device seed must be 32 bytes')
  return x25519Keypair(seed)
}

// ---- seed at rest: wrapped under the device root key, bound to its id ----

function seedAad(id) {
  return concatBytes(bytesOf(DEVICE_SEED_INFO), bytesOf('|'), bytesOf(id ?? '?'))
}

export async function wrapDeviceSeed(masterKey, id, seed) {
  return aesGcmEncrypt(masterKey, seed, seedAad(id))
}

export async function unwrapDeviceSeed(masterKey, id, wrapped) {
  return aesGcmDecrypt(masterKey, wrapped, seedAad(id))
}

// ---- pair binding (symmetric in the two devices) ----

export function pairBinding(pubA, pubB) {
  if (pubA.length !== 32 || pubB.length !== 32) throw new Error('device pubkeys must be 32 bytes')
  let lo = pubA
  let hi = pubB
  for (let i = 0; i < 32; i++) {
    if (pubA[i] !== pubB[i]) {
      if (pubA[i] > pubB[i]) [lo, hi] = [pubB, pubA]
      break
    }
  }
  return concatBytes(lo, hi)
}

/**
 * The device-layer secret for a single link. Both sides derive the same value:
 *   A: deviceLinkSecret(A.priv, A.pub, B.pub)
 *   B: deviceLinkSecret(B.priv, B.pub, A.pub)
 * ECDH gives the shared IKM; the symmetric pair binding prevents relaying the
 * same secret across two different links.
 */
export async function deviceLinkSecret(ownPriv, ownPub, peerPub) {
  const shared = await x25519SharedSecret(ownPriv, peerPub)
  return hkdf(
    shared,
    null,
    concatBytes(bytesOf(DEVICE_LINK_INFO), pairBinding(ownPub, peerPub)),
    32,
  )
}

/** Short, user-comparable code derived from a device link secret. */
export function pairingCode(secret) {
  if (secret.length < 3) throw new Error('link secret too short')
  const value = ((secret[0] << 16) | (secret[1] << 8) | secret[2]) % 1_000_000
  return String(value).padStart(6, '0')
}

// ---- peer payloads (what actually crosses Bluetooth / the paste box) ----

/**
 * @typedef {Object} DevicePeerPayload
 * @property {number} v
 * @property {string} id
 * @property {string} name
 * @property {string} pub   base64url of the 32-byte public key
 */

export function peerPayload(lp) {
  return { v: 1, id: lp.id, name: lp.name ?? 'S device', pub: toBase64Url(lp.pub) }
}

/** Validate + normalize an incoming peer payload; recomputes id from pub. */
export async function parsePeerPayload(json) {
  /** @type {DevicePeerPayload} */
  let raw
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('link payload must be valid JSON')
  }
  if (!raw || raw.v !== 1 || typeof raw.name !== 'string' || typeof raw.pub !== 'string') {
    throw new Error('malformed link payload')
  }
  const pub = fromBase64Url(raw.pub)
  if (pub.length !== 32) throw new Error('link payload pubkey must be 32 bytes')
  const id = await devIdFor(pub)
  if (raw.id !== id) throw new Error('link payload id does not match pubkey')
  return { id, name: raw.name.slice(0, 64), pub }
}