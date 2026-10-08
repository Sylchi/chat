import {
  appKeysFromPRF,
  contactIdForUserPub,
  createDevice,
  registerPasskey,
  getPasskeyPRF,
  unwrapDevice,
  userKeysFromPRF,
  type PrincipalKeys,
} from './identity.ts'
import { concatBytes, randomBytes, type Byte32 } from './crypto.ts'

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

export interface KVStore {
  get(key: string): Promise<Uint8Array | null>
  set(key: string, value: Uint8Array): Promise<void>
  del(key: string): Promise<void>
  list(prefix: string): Promise<Array<{ key: string; value: Uint8Array }>>
}

// ---- IndexedDB backend (browser) ----

const DB_NAME = 's-keystore'
const DB_VERSION = 1
const KV = 'kv'

function openDB(): Promise<IDBDatabase> {
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

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(KV, mode)
    const req = fn(t.objectStore(KV))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return tx(db, 'readonly', (s) => s.get(key))
}
function idbSet(db: IDBDatabase, key: string, value: Uint8Array): Promise<IDBValidKey> {
  return tx(db, 'readwrite', (s) => s.put(value, key))
}
function idbDel(db: IDBDatabase, key: string): Promise<undefined> {
  return tx(db, 'readwrite', (s) => s.delete(key))
}

export async function openIdbStore(): Promise<KVStore> {
  const db = await openDB()
  return {
    async get(key) {
      const v = (await idbGet(db, key)) as Uint8Array | undefined
      return v instanceof Uint8Array ? v : null
    },
    async set(key, value) {
      await idbSet(db, key, value)
    },
    async del(key) {
      await idbDel(db, key)
    },
    async list(prefix) {
      const out: Array<{ key: string; value: Uint8Array }> = []
      return new Promise((resolve, reject) => {
        const t = db.transaction(KV, 'readonly')
        const req = t.objectStore(KV).openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
        req.onsuccess = () => {
          const cur = req.result
          if (cur) {
            out.push({ key: String(cur.key), value: cur.value as Uint8Array })
            cur.continue()
          } else resolve(out)
        }
        req.onerror = () => reject(req.error)
      })
    },
  }
}

export function memoryStore(): KVStore {
  const m = new Map<string, Uint8Array>()
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

export interface UserRecord {
  salt: Uint8Array
  credId: string
  name: string
  self: ContactPub
}

export interface StoredDevice {
  id: string
  pub: Uint8Array
  wrapped: Uint8Array
}

export interface ContactPub {
  id: string
  userPub: Uint8Array
  appPub: Uint8Array
  deviceId: string
  devicePub: Uint8Array
  added: number
}

const K_SALT = 'user/salt'
const K_CRED = 'user/credId'
const K_NAME = 'user/name'
const K_SELF = 'user/self'
const K_LOCAL = 'devices/local'
const K_DEV = 'devices/'
const K_CON = 'contacts/'

const str = (s: string): Uint8Array => new TextEncoder().encode(s)
const b64 = (b: Uint8Array): string => {
  let x = b
  return Buffer.from(x).toString('base64')
}

export async function loadUserRecord(store: KVStore): Promise<UserRecord | null> {
  const salt = await store.get(K_SALT)
  const credId = await store.get(K_CRED)
  const name = await store.get(K_NAME)
  const self = await store.get(K_SELF)
  if (!salt || !credId || !name) return null
  let parsedSelf: ContactPub | null = null
  if (self) {
    try {
      parsedSelf = objectToContactPub(self)
    } catch {
      parsedSelf = null
    }
  }
  return { salt, credId: new TextDecoder().decode(credId), name: new TextDecoder().decode(name), self: parsedSelf! }
}

/**
 * Browser unlock: prompt for the passkey, get I_U via PRF, then derive
 * everything into an in-memory session. Returns null (no session) if the
 * user/cancel (credential not found) — caller shows the locking UI.
 * Throws if no passkey registered yet.
 */
export async function unlock(store: KVStore): Promise<Session | null> {
  const rec = await loadUserRecord(store)
  if (!rec) throw new Error('no user registered — open the identity screen first')
  const { prf } = await getPasskeyPRF(rec.salt)
  return unlockFromPrf(store, prf)
}

export interface Session {
  userDec: PrincipalKeys
  appEnc: PrincipalKeys
  deviceId: string
  devicePriv: Byte32
  self: ContactPub
  createdAt: number
}

/**
 * Derive a session from I_U. Pure (testable without WebAuthn).
 */
export async function unlockFromPrf(store: KVStore, prf: Uint8Array): Promise<Session> {
  const user = await userKeysFromPRF(prf)
  const app = await appKeysFromPRF(prf)
  const local = await store.get(K_LOCAL)
  if (!local) throw new Error('no local device principal — register a device first')
  const dev = objectToStoredDevice(local)
  const devPriv = (await unwrapDevice(dev.wrapped, prf)) as Byte32
  const rec = await loadUserRecord(store)
  const selfPk = rec?.self
  if (!selfPk) throw new Error('no self identity — re-enroll')
  const session: Session = {
    userDec: user.dec,
    appEnc: app.enc,
    deviceId: dev.id,
    devicePriv: devPriv,
    self: selfPk,
    createdAt: Date.now(),
  }
  return session
}

/**
 * First-run onboarding: register a passkey, derive a fresh local device, and
 * derive the self (user-level) identity the user shares with contacts.
 * Returns the session and the derived ContactPub (the user for pairing).
 */
export async function enroll(
  store: KVStore,
  displayName: string,
): Promise<{ credentialId: string; session: Session; self: ContactPub }> {
  const salt = randomBytes(32)
  const credentialId = await registerPasskey(displayName)
  const { prf } = await getPasskeyPRF(salt)
  const { session, self } = await enrollFromPrf(store, salt, credentialId, displayName, prf)
  return { credentialId, session, self }
}

/**
 * Persist the enrollment records derived from I_U. Pure (testable without
 * WebAuthn); assumes the passkey was already created/asserted.
 */
export async function enrollFromPrf(
  store: KVStore,
  salt: Uint8Array,
  credentialId: string,
  displayName: string,
  prf: Uint8Array,
): Promise<{ session: Session; self: ContactPub }> {
  await store.set(K_SALT, salt)
  await store.set(K_CRED, str(credentialId))
  await store.set(K_NAME, str(displayName))

  const user = await userKeysFromPRF(prf)
  const app = await appKeysFromPRF(prf)
  const dev = await createDevice(prf)
  await store.set(K_DEV + dev.id, serializeDevice(dev))
  await store.set(K_LOCAL, serializeDevice(dev))

  const self: ContactPub = {
    id: await contactIdForUserPub(user.dec.pub),
    userPub: user.dec.pub,
    appPub: app.enc.pub,
    deviceId: dev.id,
    devicePub: dev.pub,
    added: Date.now(),
  }
  await store.set(K_SELF, serializeContactPub(self))

  const session: Session = {
    userDec: user.dec,
    appEnc: app.enc,
    deviceId: dev.id,
    devicePriv: dev.priv as Byte32,
    self,
    createdAt: Date.now(),
  }
  return { session, self }
}

export async function contactIds(store: KVStore): Promise<ContactPub[]> {
  const rec = await loadUserRecord(store)
  if (!rec) return []
  return [rec.self]
}

// ---- binary serialization for KV blobs (u32 length-prefixed fields) ----

function encU32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, false)
  return b
}
function encU64(n: number): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, BigInt(n), false)
  return b
}
function field(b: Uint8Array, p: { off: number }): Uint8Array {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const len = d.getUint32(p.off, false)
  const start = p.off + 4
  p.off = start + len
  return b.slice(start, start + len)
}
function raw(b: Uint8Array, n: number, p: { off: number }): Uint8Array {
  const s = p.off
  p.off += n
  return b.slice(s, s + n)
}
function fieldU64(b: Uint8Array, p: { off: number }): number {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const v = Number(d.getBigUint64(p.off, false))
  p.off += 8
  return v
}

function serializeDevice(d: {
  id: string
  pub: Uint8Array
  wrapped: Uint8Array
}): Uint8Array {
  const id = str(d.id)
  return concatBytes(encU32(id.length), id, d.pub, encU32(d.wrapped.length), d.wrapped)
}

function serializeContactPub(c: ContactPub): Uint8Array {
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

function objectToStoredDevice(b: Uint8Array): StoredDevice {
  const p = { off: 0 }
  const id = new TextDecoder().decode(field(b, p))
  const pub = raw(b, 32, p)
  const wrapped = field(b, p)
  return { id, pub, wrapped }
}

function objectToContactPub(b: Uint8Array): ContactPub {
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