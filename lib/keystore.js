import {
  appKeysFromPRF,
  contactIdForUserPub,
  registerPasskey,
  getPasskeyPRF,
  userKeysFromPRF,
} from './identity.js'
import {
  concatBytes,
  randomBytes,
} from './crypto.js'
import {
  createDevicePrincipal,
  deviceLinkSecret,
  pairingCode,
  devIdFor,
  deviceFingerprint,
  keypairFromSeed,
  unwrapDeviceSeed,
  wrapDeviceSeed,
} from './device.js'

// ---------------------------------------------------------------------------
// Keystore / session.
//
// LAYERING (devices FIRST, user/app on top):
//   1. Device layer — every instance owns a device principal whose SEED stays
//      on-device: the private key is derived from it, wrapped at rest under a
//      random device root key (`devices/rootkey`, in IndexedDB). Peers keep
//      only this device's public key as the seed for that link.
//   2. User/app layer — optional passkey enrollment derives user (present-only)
//      and app (same across devices) principals from WebAuthn PRF on top of
//      the device layer. Until a user enrolls, 1 is fully operational.
//
// Persisted material is deliberately NON-secret:
//   - devices/rootkey    : random 32B (wipes on user enrollment, devices stay)
//   - devices/local      : id/name/pub + AES-GCM-wrapped device seed
//   - devices/linked/<id>: a peer's public public-key record (id/name/pub)
//   - user/salt, user/credId, user/name, user/self : passkey enrollment facts
//
// Session keys (userDec/appEnc, unwrapped device priv) exist only in memory.
// Storage is pluggable (IndexedDB in the browser, memoryStore in tests).
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} KVStore
 * @property {(key: string) => Promise<Uint8Array|null>} get
 * @property {(key: string, value: Uint8Array) => Promise<void>} set
 * @property {(key: string) => Promise<void>} del
 * @property {(prefix: string) => Promise<Array<{key: string, value: Uint8Array}>>} list
 */

// ---- IndexedDB backend (browser) ----

const DB_NAME = 's-keystore'
const DB_VERSION = 1
const KV = 'kv'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('keystore upgrade blocked'))
  })
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(KV, mode)
    const req = fn(t.objectStore(KV))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db, key) {
  return tx(db, 'readonly', (s) => s.get(key))
}
function idbSet(db, key, value) {
  return tx(db, 'readwrite', (s) => s.put(value, key))
}
function idbDel(db, key) {
  return tx(db, 'readwrite', (s) => s.delete(key))
}

export async function openIdbStore() {
  const db = await openDB()
  return {
    async get(key) {
      const v = await idbGet(db, key)
      return v instanceof Uint8Array ? v : null
    },
    async set(key, value) {
      await idbSet(db, key, value)
    },
    async del(key) {
      await idbDel(db, key)
    },
    async list(prefix) {
      const out = []
      return new Promise((resolve, reject) => {
        const t = db.transaction(KV, 'readonly')
        const req = t.objectStore(KV).openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
        req.onsuccess = () => {
          const cur = req.result
          if (cur) {
            out.push({ key: String(cur.key), value: cur.value })
            cur.continue()
          } else resolve(out)
        }
        req.onerror = () => reject(req.error)
      })
    },
  }
}

export function memoryStore() {
  const m = new Map()
  return {
    async get(k) {
      return m.get(k) ?? null
    },
    async set(k, v) {
      m.set(k, v)
    },
    async del(k) {
      m.delete(k)
    },
    async list(prefix) {
      return [...m.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, value]) => ({ key, value }))
    },
  }
}

// ---- persisted records ----

/**
 * @typedef {Object} UserRecord
 * @property {Uint8Array} salt
 * @property {string} credId
 * @property {string} name
 * @property {Object|null} self  ContactPub
 */

/**
 * @typedef {Object} LocalPrincipal
 * @property {string} id
 * @property {string} name
 * @property {Uint8Array} pub
 * @property {Uint8Array} wrappedSeed   AES-GCM under devices/rootkey, bound to id
 */

/**
 * @typedef {Object} LinkedPeer
 * @property {string} id
 * @property {string} name
 * @property {Uint8Array} pub          the peer's public key (their "seed" here)
 * @property {number} added
 */

/**
 * @typedef {Object} ContactPub
 * @property {string} id
 * @property {Uint8Array} userPub
 * @property {Uint8Array} appPub
 * @property {string} deviceId
 * @property {Uint8Array} devicePub
 * @property {number} added
 */

const K_SALT = 'user/salt'
const K_CRED = 'user/credId'
const K_NAME = 'user/name'
const K_SELF = 'user/self'
const K_ROOT = 'devices/rootkey'
const K_LOCAL = 'devices/local'
const K_LINKED = 'devices/linked/'

const str = (s) => new TextEncoder().encode(s)

// ---- device layer (devices-first, user-independent) ----

async function getRootKey(store) {
  const existing = await store.get(K_ROOT)
  if (existing && existing.length === 32) return existing
  const key = randomBytes(32)
  await store.set(K_ROOT, key)
  return key
}

/**
 * Read this device's principal from the store.
 * @param {KVStore} store
 * @returns {Promise<LocalPrincipal|null>}
 */
export async function getLocalPrincipal(store) {
  const blob = await store.get(K_LOCAL)
  if (!blob) return null
  return objectToLocalPrincipal(blob)
}

/**
 * Create (once) this device's principal and persist it. Devices-first: never
 * requires a user/passkey; the seed is wrapped under the device root key.
 * @param {KVStore} store
 * @param {string} [name]
 * @returns {Promise<LocalPrincipal>}
 */
export async function ensureLocalPrincipal(store, name = 'S device') {
  const existing = await getLocalPrincipal(store)
  if (existing) return existing
  const rootKey = await getRootKey(store)
  const principal = await createDevicePrincipal(name)
  const wrappedSeed = await wrapDeviceSeed(rootKey, principal.id, principal.seed)
  await store.set(K_LOCAL, serializeLocalPrincipal({ id: principal.id, name, pub: principal.pub, wrappedSeed }))
  return { id: principal.id, name, pub: principal.pub, wrappedSeed }
}

/**
 * Full device keypair for this instance (unwraps the stored seed).
 * @returns {Promise<{id: string, name: string, pub: Uint8Array, priv: Uint8Array}>}
 */
export async function localDeviceKeypair(store) {
  const local = await getLocalPrincipal(store)
  if (!local) throw new Error('no local device principal — initDevices() failed?')
  const rootKey = await getRootKey(store)
  const seed = await unwrapDeviceSeed(rootKey, local.id, local.wrappedSeed)
  const kp = await keypairFromSeed(seed)
  return { id: local.id, name: local.name, pub: local.pub, priv: kp.priv }
}

/**
 * Keep a peer's public key as this device's seed for that link.
 * @param {KVStore} store
 * @param {{id: string, name: string, pub: Uint8Array}} peer
 * @returns {Promise<LinkedPeer>}
 */
export async function linkDevice(store, peer) {
  if (peer.pub.length !== 32) throw new Error('peer pub must be 32 bytes')
  const id = await devIdFor(peer.pub)
  if (id !== peer.id) throw new Error('peer id does not match pubkey')
  const local = await getLocalPrincipal(store)
  if (local && local.id === id) throw new Error('cannot link this device to itself')
  const record = { id: peer.id, name: peer.name, pub: peer.pub, added: Date.now() }
  await store.set(K_LINKED + peer.id, serializeLinkedPeer(record))
  return record
}

/**
 * @param {KVStore} store
 * @returns {Promise<LinkedPeer[]>}
 */
export async function linkedDevices(store) {
  const rows = await store.list('devices/linked/')
  return rows
    .map(({ value }) => objectToLinkedPeer(value))
    .sort((a, b) => a.added - b.added)
}

export async function unlinkDevice(store, id) {
  await store.del(K_LINKED + id)
}

/**
 * Derive the (symmetric) device-link secret with a linked peer + its
 * out-of-band verification code. Requires this device's private key.
 * @returns {Promise<{secret: Uint8Array, code: string, fingerprint: string}}>
 */
export async function deviceLinkWith(store, peerId) {
  const self = await localDeviceKeypair(store)
  const linked = await linkedDevices(store)
  const peer = linked.find((item) => item.id === peerId)
  if (!peer) throw new Error('device not linked: ' + peerId)
  const secret = await deviceLinkSecret(self.priv, self.pub, peer.pub)
  return { secret, code: pairingCode(secret), fingerprint: await deviceFingerprint(peer.pub) }
}

// ---- user/app layer (sits on top of the device layer) ----

export async function loadUserRecord(store) {
  const salt = await store.get(K_SALT)
  const credId = await store.get(K_CRED)
  const name = await store.get(K_NAME)
  const self = await store.get(K_SELF)
  if (!salt || !credId || !name) return null
  let parsedSelf = null
  if (self) {
    try {
      parsedSelf = objectToContactPub(self)
    } catch {
      parsedSelf = null
    }
  }
  return { salt, credId: new TextDecoder().decode(credId), name: new TextDecoder().decode(name), self: parsedSelf }
}

/**
 * Browser unlock: prompt for the passkey, get I_U via PRF, then derive
 * everything into an in-memory session. Returns null (no session) if the
 * user/cancel (credential not found) — caller shows the locking UI.
 * Throws if no passkey registered yet.
 * @param {KVStore} store
 */
export async function unlock(store) {
  const rec = await loadUserRecord(store)
  if (!rec) throw new Error('no user registered — open the identity screen first')
  const { prf } = await getPasskeyPRF(rec.salt)
  return unlockFromPrf(store, prf)
}

/**
 * @typedef {Object} Session
 * @property {{priv: Uint8Array, pub: Uint8Array}} userDec
 * @property {{priv: Uint8Array, pub: Uint8Array}} appEnc
 * @property {string} deviceId
 * @property {Uint8Array} devicePriv
 * @property {ContactPub|null} self
 * @property {number} createdAt
 */

/**
 * Derive a session from I_U. Pure (testable without WebAuthn).
 * @param {KVStore} store
 * @param {Uint8Array} prf
 * @returns {Promise<Session>}
 */
export async function unlockFromPrf(store, prf) {
  const user = await userKeysFromPRF(prf)
  const app = await appKeysFromPRF(prf)
  const device = await localDeviceKeypair(store)
  const rec = await loadUserRecord(store)
  const selfPk = rec?.self
  if (!selfPk) throw new Error('no self identity — re-enroll')
  return {
    userDec: user.dec,
    appEnc: app.enc,
    deviceId: device.id,
    devicePriv: device.priv,
    self: selfPk,
    createdAt: Date.now(),
  }
}

/**
 * First-run onboarding: register a passkey, derive a fresh local device, and
 * derive the self (user-level) identity the user shares with contacts.
 * Returns the session and the derived ContactPub (the user for pairing).
 * @param {KVStore} store
 * @param {string} displayName
 */
export async function enroll(store, displayName) {
  const salt = randomBytes(32)
  // get FIRST: if a discoverable passkey already exists on this RP (records
  // wiped, second enrollment), assert it instead of creating a duplicate —
  // only fall back to create() when the authenticator reports no credential.
  let credentialId
  let prf
  try {
    ;({ prf, credentialId } = await getPasskeyPRF(salt))
  } catch (error) {
    if (error?.name !== 'NotFoundError') throw error
    credentialId = await registerPasskey(displayName)
    ;({ prf } = await getPasskeyPRF(salt))
  }
  const { session, self } = await enrollFromPrf(store, salt, credentialId, displayName, prf)
  return { credentialId, session, self }
}

/**
 * Persist the enrollment records derived from I_U. Pure (testable without
 * WebAuthn); assumes the passkey was already created/asserted.
 * @param {KVStore} store
 * @param {Uint8Array} salt
 * @param {string} credentialId
 * @param {string} displayName
 * @param {Uint8Array} prf
 */
export async function enrollFromPrf(store, salt, credentialId, displayName, prf) {
  await store.set(K_SALT, salt)
  await store.set(K_CRED, str(credentialId))
  await store.set(K_NAME, str(displayName))

  const user = await userKeysFromPRF(prf)
  const app = await appKeysFromPRF(prf)
  const local = await ensureLocalPrincipal(store, displayName + ' device')
  const kp = await keypairFromSeed(await unwrapDeviceSeed(await getRootKey(store), local.id, local.wrappedSeed))

  const self = {
    id: await contactIdForUserPub(user.dec.pub),
    userPub: user.dec.pub,
    appPub: app.enc.pub,
    deviceId: local.id,
    devicePub: kp.pub,
    added: Date.now(),
  }
  await store.set(K_SELF, serializeContactPub(self))

  return {
    session: {
      userDec: user.dec,
      appEnc: app.enc,
      deviceId: local.id,
      devicePriv: kp.priv,
      self,
      createdAt: Date.now(),
    },
    self,
  }
}

export async function contactIds(store) {
  const rec = await loadUserRecord(store)
  if (!rec) return []
  return [rec.self]
}

// ---- binary serialization for KV blobs (u32 length-prefixed fields) ----

function encU32(n) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, false)
  return b
}
function encU64(n) {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, BigInt(n), false)
  return b
}
function field(b, p) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const len = d.getUint32(p.off, false)
  const start = p.off + 4
  p.off = start + len
  return b.slice(start, start + len)
}
function raw(b, n, p) {
  const s = p.off
  p.off += n
  return b.slice(s, s + n)
}
function fieldU64(b, p) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const v = Number(d.getBigUint64(p.off, false))
  p.off += 8
  return v
}

function serializeLocalPrincipal(d) {
  const id = str(d.id)
  const name = str(d.name)
  return concatBytes(
    encU32(name.length), name,
    encU32(id.length), id,
    d.pub,
    encU32(d.wrappedSeed.length), d.wrappedSeed,
  )
}

function serializeLinkedPeer(p) {
  const id = str(p.id)
  const name = str(p.name)
  return concatBytes(
    encU32(id.length), id,
    encU32(name.length), name,
    p.pub,
    encU64(p.added),
  )
}

function serializeContactPub(c) {
  const id = str(c.id)
  const devId = str(c.deviceId)
  return concatBytes(
    encU32(id.length), id,
    c.userPub, c.appPub,
    encU32(devId.length), devId,
    c.devicePub,
    encU64(c.added),
  )
}

function objectToLocalPrincipal(b) {
  const p = { off: 0 }
  const name = new TextDecoder().decode(field(b, p))
  const id = new TextDecoder().decode(field(b, p))
  const pub = raw(b, 32, p)
  const wrappedSeed = field(b, p)
  return { id, name, pub, wrappedSeed }
}

function objectToLinkedPeer(b) {
  const p = { off: 0 }
  const id = new TextDecoder().decode(field(b, p))
  const name = new TextDecoder().decode(field(b, p))
  const pub = raw(b, 32, p)
  const added = fieldU64(b, p)
  return { id, name, pub, added }
}

function objectToContactPub(b) {
  const p = { off: 0 }
  const id = new TextDecoder().decode(field(b, p))
  const userPub = raw(b, 32, p)
  const appPub = raw(b, 32, p)
  const deviceId = new TextDecoder().decode(field(b, p))
  const devicePub = raw(b, 32, p)
  const added = fieldU64(b, p)
  return { id, userPub, appPub, deviceId, devicePub, added }
}

export {
  serializeLocalPrincipal,
  serializeLinkedPeer,
  serializeContactPub,
  concatBytes,
}