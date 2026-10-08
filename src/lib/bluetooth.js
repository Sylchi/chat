import { peerPayload } from '../../lib/device.js'

// ---------------------------------------------------------------------------
// Bluetooth device pairing (src-side browser driver).
//
// Device-layer linking happens over a tiny WebBluetooth GATT service that
// exchanges device peer payloads (id/name/pubkey) in both directions. The
// crypto (seed keys, link secret, verify code) is all in lib/device.js; this
// file only drives navigator.bluetooth when present.
//
// Chrome is central-only (requestDevice), so the *advertising* device needs a
// small helper — a companion page/service on the other device running the same
// service UUID, or a pinned "Server starts scan" helper. Where Bluetooth is
// unavailable, the same payload exchanges through the Link a device modal's
// paste box (identical code path).
// ---------------------------------------------------------------------------

export const PAIR_SERVICE = '1f4a70c1-9e0f-4d3a-b2c1-0a6f6c65a1b0'
export const PAYLOAD_CHAR = '2f6a70c2-9e0f-4d3a-b2c1-0a6f6c65a1b0'

const enc = new TextEncoder()

export function bluetoothAvailable() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Advertise this device's payload on the S pairing service and await a peer's
 * payload. Chrome (central) scans once and the peer's helper advertises; this
 * resolves with the peer payload string (JSON) handed to
 * device-store #receivePeerPayload for verification.
 * @param {{id: string, name: string, pub: Uint8Array}} local
 * @returns {Promise<string>} peer payload JSON
 */
export async function collectPeerPayloadViaBluetooth(local) {
  if (!bluetoothAvailable()) {
    throw new Error('Web Bluetooth is unavailable in this browser')
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [PAIR_SERVICE] }],
    optionalServices: [PAIR_SERVICE],
  })
  const server = await device.gatt.connect()
  try {
    const service = await server.getPrimaryService(PAIR_SERVICE)
    const char = await service.getCharacteristic(PAYLOAD_CHAR)

    // 1. write our payload so the peer knows who we are
    await char.writeValueWithoutResponse(enc.encode(JSON.stringify(peerPayload(local))))

    // 2. read the peer's payload back
    const value = await char.readValue()
    return new TextDecoder().decode(new Uint8Array(value))
  } finally {
    try {
      server.disconnect()
    } catch {
      // already gone; explicit handshake failure surfaces from the read above
    }
  }
}