import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesOf,
  concatBytes,
  hkdf,
  randomBytes,
  sha256,
  toBase64Url,
  fromBase64Url,
  x25519Keypair,
  x25519SharedSecret,
} from './crypto.js'

// ---------------------------------------------------------------------------
// Identity / principals
//
// Three slots, three scopes, one seed. Nothing user-secret is ever stored:
// the passkey PRF output (I_U) is re-derived on demand when the user
// authenticates, and every key below it is a deterministic HKDF branch.
//
//   user   : passkey (WebAuthn) + PRF -> I_U. Signs via WebAuthn assertions.
//   app    : KDF(I_U, "luma/app/...") — same derivable constant on every
//            device; identical across all devices without ever syncing it.
//   device : (d_i, D_i) X25519 per profile, stored wrapped under
//            KW_i = KDF(I_U, "luma/devwrap/v1", info=D_i).
//
// A message sealed to contact R is wrapped in three independent AEAD layers,
// each bound to one of R's principal keys, each ECDH with a fresh ephemeral:
//
//   content -> [user :   ECDH(e_u, R.user.dec_pk)]   forward secret / msg
//   userEnv -> [app  :   ECDH(e_a, R.app.enc_pk)]    same app key on every device
//   appEnv  -> [dev  :   ECDH(e_d, R.device.pk)]     only R's device instance
//
// Opening requires all three private keys. The device key exists in the
// profile wrapped under KW_i (=f(I_U)), the app key is itself =f(I_U), and
// the user key =f(I_U, presence). Net: one-way-or-the-other the user must be
// present to open; a stolen device or app slot alone cannot.
// ---------------------------------------------------------------------------

export const RP_ID = 'sylchi.github.io'
const NS = 'luma/v1'

export const USER_DEC_INFO = `${NS}/user/dec/v1`
export const APP_ENC_INFO = `${NS}/app/enc/v1`
export const APP_SIG_INFO = `${NS}/app/sig/v2`
export const DEV_WRAP_INFO = `${NS}/devwrap/v1`
export const DEV_ENC_INFO = `${NS}/devenc/v1`
export const USER_MSG_INFO = `${NS}/usermsg/v1`
export const AUTH_INFO = `${NS}/auth/v1`
export const VERIFY_INFO = `${NS}/verify/v1`

const B32 = (b) => toBase64Url(b)
const B2U = (s) => fromBase64Url(s)

// ---- WebAuthn passkey + PRF (the user principal) ----

function supportsWebAuthn() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof window !== 'undefined' &&
    !!(window).PublicKeyCredential
  )
}

/**
 * Register a new passkey (the user's only root). PRF enabled so I_U is
 * re-derivable but never stored.
 */
export async function registerPasskey(displayName = 'S user') {
  if (!supportsWebAuthn()) throw new Error('WebAuthn unavailable')
  const userId = randomBytes(32)
  const createOptions = {
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'S', id: RP_ID },
      user: { id: userId, name: displayName, displayName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -8 },
        { type: 'public-key', alg: -7 },
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions: {
        prf: {},
      },
    },
  }
  const cred = await navigator.credentials.create(createOptions)
  const prf = cred.getClientExtensionResults().prf
  if (!prf || prf.enabled !== true) {
    throw new Error('passkey created without PRF; I_U cannot be re-derived')
  }
  return cred.id
}

/**
 * Authenticate and extract the PRF output for [salt]. The result is the
 * deterministic I_U anchor; it exists only for this call and must never be
 * persisted.
 */
export async function getPasskeyPRF(salt) {
  if (!supportsWebAuthn()) throw new Error('WebAuthn unavailable')
  const options = {
    publicKey: {
      challenge: randomBytes(32),
      rpId: RP_ID,
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: salt } },
      },
    },
  }
  const cred = await navigator.credentials.get(options)
  const first = cred.getClientExtensionResults().prf?.results?.first
  if (!first) throw new Error('PRF output missing from assertion')
  return { prf: new Uint8Array(first), credentialId: cred.id }
}

// ---- derivation helpers ----

async function deriveXFromPRF(prf, branch) {
  const kp = await x25519Keypair(await hkdf(prf, null, bytesOf(branch), 32))
  return { priv: kp.priv, pub: kp.pub }
}

// ---- user slot (presence-only derivation) ----

/**
 * Re-derive the user's decryption keypair from the PRF output. The returned
 * private key exists only in memory during this call.
 */
export async function userKeysFromPRF(prf) {
  const dec = await deriveXFromPRF(prf, USER_DEC_INFO)
  const verify = await sha256(prf) // deterministic check against stored vector
  return { dec, verify }
}

// ---- app slot (deterministic, same on every device) ----

export async function appKeysFromPRF(prf) {
  const enc = await deriveXFromPRF(prf, APP_ENC_INFO)
  const sigSeed = await hkdf(prf, null, bytesOf(APP_SIG_INFO), 32)
  return { enc, sigSeed }
}

// ---- device slot (per profile, wrapped under user-derived key) ----

/**
 * Create a fresh device principal. The device's private X25519 is wrapped with
 * a key derived from the user's PRF, so the device's own long-term secret is
 * only usable while the user is (or has been) present this session.
 * @returns {Promise<{id: string, pub: Uint8Array, priv: Uint8Array, wrapped: Uint8Array}>}
 */
export async function createDevice(prf) {
  const kp = await x25519Keypair()
  const wrapKey = await hkdf(prf, null, bytesOf(DEV_WRAP_INFO), 32)
  const wrapped = await aesGcmEncrypt(wrapKey, kp.priv, bytesOf(DEV_WRAP_INFO))
  const id = B32((await sha256(kp.pub)).slice(0, 9))
  return { id, pub: kp.pub, priv: kp.priv, wrapped }
}

/**
 * Unwrap a device's private key. Requires I_U (user present); without it the
 * blob stays sealed.
 * @returns {Promise<Uint8Array>}
 */
export async function unwrapDevice(wrapped, prf) {
  const wrapKey = await hkdf(prf, null, bytesOf(DEV_WRAP_INFO), 32)
  return aesGcmDecrypt(wrapKey, wrapped, bytesOf(DEV_WRAP_INFO))
}

// ---- layered sealing ----

/**
 * @typedef {Object} SealEnvelope
 * @property {number} v
 * @property {{user: string, app: string, device: string}} to
 * @property {{user: string, app: string, device: string}} e
 * @property {string} devId
 * @property {Uint8Array} body
 */

async function layerEncrypt(theirPub, info, inner, aad) {
  const eph = await x25519Keypair()
  const shared = await x25519SharedSecret(eph.priv, theirPub)
  const key = await hkdf(shared, null, bytesOf(info), 32)
  const ct = await aesGcmEncrypt(key, inner, aad)
  return { ct, ephPub: eph.pub }
}

async function layerDecrypt(myPriv, ephPub, info, blob, aad) {
  const shared = await x25519SharedSecret(myPriv, ephPub)
  const key = await hkdf(shared, null, bytesOf(info), 32)
  return aesGcmDecrypt(key, blob, aad)
}

/**
 * Seal a payload for recipient's three principals. Per-message ephemerals give
 * forward secrecy at every layer.
 * @return {Promise<SealEnvelope>}
 */
export async function sealTo(
  content,
  recipient,
) {
  const aad = bytesOf(`luma/v2|to=${recipient.deviceId}`)

  const userEph = await x25519Keypair()
  const userLayer = await x25519SharedSecret(userEph.priv, recipient.userPub)
  const userKey = await hkdf(userLayer, null, bytesOf(USER_MSG_INFO), 32)
  const userCt = await aesGcmEncrypt(userKey, content, aad)

  const app = await layerEncrypt(recipient.appPub, APP_ENC_INFO, userCt, aad)
  const dev = await layerEncrypt(recipient.devicePub, DEV_ENC_INFO, app.ct, aad)

  return {
    v: 1,
    to: { user: B32(recipient.userPub), app: B32(recipient.appPub), device: B32(recipient.devicePub) },
    e: { user: B32(userEph.pub), app: B32(app.ephPub), device: B32(dev.ephPub) },
    devId: recipient.deviceId,
    body: dev.ct,
  }
}

/**
 * Open a layered envelope. Requires ALL three private keys: device (this
 * session), app (derived from I_U), user (present). Any missing principal
 * aborts.
 * @param {SealEnvelope} env
 * @param {{userPriv: Uint8Array, appPriv: Uint8Array, devicePriv: Uint8Array}} keys
 * @returns {Promise<Uint8Array>}
 */
export async function openSealed(env, keys) {
  const aad = bytesOf(`luma/v2|to=${env.devId}`)

  const appCt = await layerDecrypt(keys.devicePriv, B2U(env.e.device), DEV_ENC_INFO, env.body, aad)
  const userCt = await layerDecrypt(keys.appPriv, B2U(env.e.app), APP_ENC_INFO, appCt, aad)
  const content = await layerDecrypt(keys.userPriv, B2U(env.e.user), USER_MSG_INFO, userCt, aad)
  return content
}

// ---- contact / mailbox records ----

/**
 * @typedef {Object} Contact
 * @property {string} id    on-user identity derived from user pub
 * @property {string} name
 * @property {string} onion
 * @property {string} devId
 * @property {string} userPub
 * @property {string} appPub
 * @property {string} devicePub
 * @property {number} added
 */

export async function contactIdForUserPub(userPub) {
  return B32((await sha256(userPub)).slice(0, 9))
}

export { concatBytes, hkdf, randomBytes, sha256, toBase64Url, fromBase64Url, bytesOf }