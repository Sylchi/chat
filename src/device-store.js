import { atom } from './vendor/store.js'
import {
  ensureLocalPrincipal,
  getLocalPrincipal,
  linkDevice,
  linkedDevices,
  deviceLinkWith,
  unlinkDevice,
  openIdbStore,
  memoryStore,
} from '../lib/keystore.js'
import { deviceFingerprint, parsePeerPayload, peerPayload } from '../lib/device.js'
import { collectPeerPayloadViaBluetooth } from './lib/bluetooth.js'

// App-level device layer: boot the local device principal (devices-first,
// no user/passkey required), keep its linked peers, and drive the pairing
// flow in the Link modal. Persistence is IndexedDB when available (browser),
// otherwise the in-memory KV store (tests).

let storePromise = null
export function backend() {
  storePromise ??= typeof indexedDB !== 'undefined' ? openIdbStore() : memoryStore()
  return storePromise
}

export const localDevice = atom(null) // {id,name,pub, fingerprint}
export const linked = atom([]) // LinkedPeer[]
export const pairState = atom('idle') // idle | code | ready | error
export const pairCode = atom(null)
export const pairFingerprint = atom(null)
export const pairError = atom(null)

export async function initDevices() {
  const store = await backend()
  const principal = await ensureLocalPrincipal(store, 'S device')
  localDevice.set({
    id: principal.id,
    name: principal.name,
    pub: principal.pub,
    fingerprint: await deviceFingerprint(principal.pub),
  })
  await refreshLinked()
  return store
}

export async function refreshLinked() {
  const store = await backend()
  linked.set(await linkedDevices(store))
  return linked.get()
}

/** The JSON payload this device advertises so a peer can link back. */
export async function currentPeerPayload() {
  const store = await backend()
  const principal = await getLocalPrincipal(store)
  if (!principal) throw new Error('device not initialized')
  return JSON.stringify(peerPayload(principal))
}

export async function pairViaBluetooth() {
  pairState.set('code')
  pairError.set(null)
  try {
    const json = await collectPeerPayloadViaBluetooth(localDevice.get())
    return await receivePeerPayload(json)
  } catch (error) {
    pairError.set(error instanceof Error ? error.message : String(error))
    pairState.set('error')
    return null
  }
}

/**
 * Validate an incoming peer payload, persist the link, and derive the shared
 * verification code both devices should match.
 */
export async function receivePeerPayload(json) {
  const store = await backend()
  const peer = await parsePeerPayload(json)
  await linkDevice(store, peer)
  const { code, fingerprint } = await deviceLinkWith(store, peer.id)
  pairCode.set(code)
  pairFingerprint.set(fingerprint)
  pairState.set('ready')
  await refreshLinked()
  return peer
}

export async function removeLinkedDevice(id) {
  const store = await backend()
  await unlinkDevice(store, id)
  await refreshLinked()
}

export async function pairSummary(peerId) {
  const store = await backend()
  return deviceLinkWith(store, peerId)
}

export { bluetoothAvailable } from './lib/bluetooth.js'