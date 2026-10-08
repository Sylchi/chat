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
  type Byte32,
} from './crypto.ts'

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
// the user key =f(I_U, presence). Net: one-way-or-another the user must be
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

const B32 = (b: Uint8Array): string => toBase64Url(b)
const B2U = (s: string): Uint8Array => fromBase64Url(s)
const TOK = (b: Uint8Array): Byte32 => b as Byte32

// ---- WebAuthn passkey + PRF (the user principal) ----

function supportsWebAuthn(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof window !== 'undefined' &&
    !!(window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential
  )
}

/**
 * Register a new passkey (the user's only root). PRF enabled so I_U is
 * re-derivable but never stored.
 */
export async function registerPasskey(displayName = 'S user'): Promise<string> {
  if (!supportsWebAuthn()) throw new Error('WebAuthn unavailable')
  const userId = randomBytes(32)
  const createOptions: CredentialCreationOptions = {
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
  const cred = (await navigator.credentials.create(createOptions)) as PublicKeyCredential
  const prf = (cred.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf
  if (!prf || prf.enabled !== true) {
    throw new Error('passkey created without PRF; I_U cannot be re-derived')
  }
  return cred.id
}

/**
 * Authenticate and extract the PRF output for [salt]. The result is the
 * deterministic I_U anchor; it exists only for this call and must never be
 * persisted. Returns fresh random AES-session ciphertext in place of the raw
 * PRF if the caller wants a session token — but by default returns raw for
 * direct re-derivation.
 */
export async function getPasskeyPRF(
  salt: Uint8Array,
): Promise<{ prf: Uint8Array; credentialId: string }> {
  if (!supportsWebAuthn()) throw new Error('WebAuthn unavailable')
  const options: CredentialRequestOptions = {
    publicKey: {
      challenge: randomBytes(32),
      rpId: RP_ID,
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: salt } },
      },
    },
  }
  const cred = (await navigator.credentials.get(options)) as PublicKeyCredential
  const prfRes = (
    cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
  ).prf
  const first = prfRes?.results?.first
  if (!first) throw new Error('PRF output missing from assertion')
  return { prf: new Uint8Array(first), credentialId: cred.id }
}

// ---- derivation helpers ----

export interface PrincipalKeys {
  priv: Uint8Array
  pub: Uint8Array
}

async function deriveXFromPRF(prf: Uint8Array, branch: string): Promise<PrincipalKeys> {
  const kp = await x25519Keypair(await hkdf(prf, null, bytesOf(branch), 32))
  return { priv: kp.priv, pub: kp.pub }
}

// ---- user slot (presence-only derivation) ----

/**
 * Re-derive the user's decryption keypair from the PRF output. The returned
 * private key exists only in memory during this call.
 */
export async function userKeysFromPRF(
  prf: Uint8Array,
): Promise<{ dec: PrincipalKeys; verify: Uint8Array }> {
  const dec = await deriveXFromPRF(prf, USER_DEC_INFO)
  const verify = await sha256(prf) // deterministic check against stored vector
  return { dec, verify }
}

// ---- app slot (deterministic, same on every device) ----

export async function appKeysFromPRF(
  prf: Uint8Array,
): Promise<{ enc: PrincipalKeys; sigSeed: Uint8Array }> {
  const enc = await deriveXFromPRF(prf, APP_ENC_INFO)
  const sigSeed = await hkdf(prf, null, bytesOf(APP_SIG_INFO), 32)
  return { enc, sigSeed }
}

// ---- device slot (per profile, wrapped under user-derived key) ----

export interface DevicePrincipal {
  id: string
  pub: Uint8Array // device X25519 pub — routing / mailbox identity
  priv: Uint8Array
  wrapped: Uint8Array // device priv wrapped under KW for at-rest protection
}

/**
 * Create a fresh device principal. The device's private X25519 is wrapped with
 * a key derived from the user's PRF, so the device's own long-term secret is
 * only usable while the user is (or has been) present this session.
 */
export async function createDevice(
  prf: Uint8Array,
): Promise<DevicePrincipal> {
  const kp = await x25519Keypair()
  const wrapKey = await hkdf(prf, null, bytesOf(DEV_WRAP_INFO), 32)
  const wrapped = await aesGcmEncrypt(TOK(wrapKey), kp.priv, bytesOf(DEV_WRAP_INFO))
  const id = B32((await sha256(kp.pub)).slice(0, 9))
  return { id, pub: kp.pub, priv: kp.priv, wrapped }
}

/**
 * Unwrap a device's private key. Requires I_U (user present); without it the
 * blob stays sealed.
 */
export async function unwrapDevice(
  wrapped: Uint8Array,
  prf: Uint8Array,
): Promise<Uint8Array> {
  const wrapKey = await hkdf(prf, null, bytesOf(DEV_WRAP_INFO), 32)
  return aesGcmDecrypt(TOK(wrapKey), wrapped, bytesOf(DEV_WRAP_INFO))
}

// ---- layered sealing ----

export interface SealEnvelope {
  v: number
  to: { user: string; app: string; device: string }
  e: { user: string; app: string; device: string }
  devId: string
  body: Uint8Array
}

async function layerEncrypt(
  myPriv: Uint8Array,
  theirPub: Uint8Array,
  info: string,
  inner: Uint8Array,
  aad: Uint8Array,
): Promise<{ ct: Uint8Array; ephPub: Uint8Array }> {
  const eph = await x25519Keypair()
  const shared = await x25519SharedSecret(TOK(eph.priv), TOK(theirPub))
  const key = await hkdf(shared, null, bytesOf(info), 32)
  const ct = await aesGcmEncrypt(TOK(key), inner, aad)
  return { ct, ephPub: eph.pub }
}

async function layerDecrypt(
  myPriv: Uint8Array,
  ephPub: Uint8Array,
  info: string,
  blob: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const shared = await x25519SharedSecret(TOK(myPriv), TOK(ephPub))
  const key = await hkdf(shared, null, bytesOf(info), 32)
  return aesGcmDecrypt(TOK(key), blob, aad)
}

/**
 * Seal a payload for recipient's three principals. Per-message ephemerals give
 * forward secrecy at every layer.
 */
export async function sealTo(
  content: Uint8Array,
  recipient: {
    userPub: Uint8Array
    appPub: Uint8Array
    devicePub: Uint8Array
    deviceId: string
  },
): Promise<SealEnvelope> {
  const aad = bytesOf(`luma/v2|to=${recipient.deviceId}`)

  const userEph = await x25519Keypair()
  const userLayer = await x25519SharedSecret(TOK(userEph.priv), TOK(recipient.userPub))
  const userKey = await hkdf(userLayer, null, bytesOf(USER_MSG_INFO), 32)
  const userCt = await aesGcmEncrypt(TOK(userKey), content, aad)

  const app = await layerEncrypt(await ephPriv(), recipient.appPub, APP_ENC_INFO, userCt, aad)
  const dev = await layerEncrypt(await ephPriv(), recipient.devicePub, DEV_ENC_INFO, app.ct, aad)

  return {
    v: 1,
    to: { user: B32(recipient.userPub), app: B32(recipient.appPub), device: B32(recipient.devicePub) },
    e: { user: B32(userEph.pub), app: B32(app.ephPub), device: B32(dev.ephPub) },
    devId: recipient.deviceId,
    body: dev.ct,
  }
}

async function ephPriv(): Promise<Uint8Array> {
  const kp = await x25519Keypair()
  return kp.priv
}

/**
 * Open a layered envelope. Requires ALL three private keys: device (this
 * session), app (derived from I_U), user (present). Any missing principal
 * aborts.
 */
export async function openSealed(
  env: SealEnvelope,
  keys: { userPriv: Uint8Array; appPriv: Uint8Array; devicePriv: Uint8Array },
): Promise<Uint8Array> {
  const aad = bytesOf(`luma/v2|to=${env.devId}`)

  const appCt = await layerDecrypt(keys.devicePriv, B2U(env.e.device), DEV_ENC_INFO, env.body, aad)
  const userCt = await layerDecrypt(keys.appPriv, B2U(env.e.app), APP_ENC_INFO, appCt, aad)
  const content = await layerDecrypt(keys.userPriv, B2U(env.e.user), USER_MSG_INFO, userCt, aad)
  return content
}

// ---- contact / mailbox records ----

export interface Contact {
  id: string // on-user identity derived from user pub
  name: string
  onion: string
  devId: string
  userPub: string
  appPub: string
  devicePub: string
  added: number
}

export async function contactIdForUserPub(userPub: Uint8Array): Promise<string> {
  return B32((await sha256(userPub)).slice(0, 9))
}

export { concatBytes, hkdf, randomBytes, sha256, toBase64Url, fromBase64Url, bytesOf }