import {
  appKeysFromPRF,
  contactIdForUserPub,
  createDevice,
  registerPasskey,
  getPasskeyPRF,
  unwrapDevice,
  userKeysFromPRF,
} from './identity.js'
import { concatBytes, randomBytes } from './crypto.js'

// ---------------------------------------------------------------------------
// Keystore / session.
//
// Persisted material is deliberately NON-secret:
//   - user/salt  : public PRF salt (needed to re-derive I_U at unlock; leaking
//                  it changes nothing since I_U stays inside the passkey)
//   - user/credId: hint for which passkey to assert
//   - devices/*  : wrapped device secrets (AES-GCM under KW = f(I_U))
//   - contacts/* : public principal keys
//
// I_U and all derived master keys exist only in memory during an unlocked
// session and are wiped by lock(). Storage is pluggable (IndexedDB in the
// browser, anything else in tests) via Store.
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
 * @typedef {Object} StoredDevice
 * @property {string} id
 * @property {Uint8Array} pub
 * @property {Uint8Array} wrapped
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
const K_LOCAL = 'devices/local'
const K_DEV = 'devices/'
const K_CON = 'contacts/'

const str = (s) => new TextEncoder().encode(s)

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
  const local = await store.get(K_LOCAL)
  if (!local) throw new Error('no local device principal — register a device first')
  const dev = objectToStoredDevice(local)
  const devPriv = await unwrapDevice(dev.wrapped, prf)
  const rec = await loadUserRecord(store)
  const selfPk = rec?.self
  if (!selfPk) throw new Error('no self identity — re-enroll')
  return {
    userDec: user.dec,
    appEnc: app.enc,
    deviceId: dev.id,
    devicePriv: devPriv,
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
  const credentialId = await registerPasskey(displayName)
  const { prf } = await getPasskeyPRF(salt)
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
  const dev = await createDevice(prf)
  await store.set(K_DEV + dev.id, serializeDevice(dev))
  await store.set(K_LOCAL, serializeDevice(dev))

  const self = {
    id: await contactIdForUserPub(user.dec.pub),
    userPub: user.dec.pub,
    appPub: app.enc.pub,
    deviceId: dev.id,
    devicePub: dev.pub,
    added: Date.now(),
  }
  await store.set(K_SELF, serializeContactPub(self))

  return {
    session: {
      userDec: user.dec,
      appEnc: app.enc,
      deviceId: dev.id,
      devicePriv: dev.priv,
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

function serializeDevice(d) {
  const id = str(d.id)
  return concatBytes(encU32(id.length), id, d.pub, encU32(d.wrapped.length), d.wrapped)
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

function objectToStoredDevice(b) {
  const p = { off: 0 }
  const id = new TextDecoder().decode(field(b, p))
  const pub = raw(b, 32, p)
  const wrapped = field(b, p)
  return { id, pub, wrapped }
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

export { serializeDevice, serializeContactPub, concatBytes }