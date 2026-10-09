import { fromBase64Url, strOf, toBase64Url } from '../lib/crypto.js'
import { bytesOf, openSealed, sealTo } from '../lib/identity.js'

// ---------------------------------------------------------------------------
// Message envelope plumbing.
//
// A message body is sealed to a contact's three public keys with the layered
// scheme in lib/identity.js, then serialized to a portable JSON envelope that
// can be stored or sent over a mailbox. Opening requires the recipient's
// session (user + app + device private keys), i.e. an unlocked passkey.
//
// A contact's `ContactPub` (lib/keystore.js) is exactly the {userPub, appPub,
// devicePub, deviceId} shape sealTo() expects. The local user's own identity is
// `session.self`, so sealing-to-self is a ready-made round-trip target.
// ---------------------------------------------------------------------------

export function selfContact(session) {
  return session?.self ?? null
}

export async function sealMessage(text, contact) {
  if (!contact) throw new Error('no contact identity to seal to')
  const env = await sealTo(bytesOf(text), {
    userPub: contact.userPub,
    appPub: contact.appPub,
    devicePub: contact.devicePub,
    deviceId: contact.deviceId,
  })
  return encodeEnvelope(env)
}

export async function openMessage(envelope, session) {
  if (!session) throw new Error('unlock required to open a sealed message')
  const env = decodeEnvelope(envelope)
  const plain = await openSealed(env, {
    userPriv: session.userDec.priv,
    appPriv: session.appEnc.priv,
    devicePriv: session.devicePriv,
  })
  return strOf(plain)
}

export function encodeEnvelope(env) {
  return JSON.stringify({ ...env, body: toBase64Url(env.body) })
}

export function decodeEnvelope(envelope) {
  const raw = typeof envelope === 'string' ? JSON.parse(envelope) : envelope
  return { ...raw, body: fromBase64Url(raw.body) }
}
