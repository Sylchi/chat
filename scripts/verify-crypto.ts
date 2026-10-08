import { ed25519Keypair, x25519Keypair, x25519SharedSecret, hkdf, aesGcmEncrypt, aesGcmDecrypt, ed25519Sign, toBase64Url, fromBase64Url, u8, bytesOf } from '../lib/crypto.ts'
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as nodeSign, verify as nodeVerify, diffieHellman } from 'node:crypto'

async function main() {
  let ok = true
  const check = (name: string, cond: boolean) => {
    console.log(name, cond ? 'OK' : 'FAIL')
    if (!cond) ok = false
  }

  // HKDF RFC5869 test case 1
  const ikm = new Uint8Array(Buffer.from('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b', 'hex'))
  const salt = new Uint8Array(Buffer.from('000102030405060708090a0b0c', 'hex'))
  const info = new Uint8Array(Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex'))
  const okm = await hkdf(ikm, salt, info, 42)
  const expect = '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
  check('hkdf rfc5869 #1', Buffer.from(okm).toString('hex') === expect)

  // Ed25519 deterministic: same seed -> same keypair
  const seed = new Uint8Array(32).fill(7)
  const kp1 = await ed25519Keypair(seed)
  const kp2 = await ed25519Keypair(seed)
  check('ed25519 deterministic pub', Buffer.from(kp1.pub).toString('hex') === Buffer.from(kp2.pub).toString('hex'))
  check('ed25519 seed == priv', Buffer.from(kp1.priv).toString('hex') === Buffer.from(seed).toString('hex'))

  // ed25519 signature verifies in node
  const sig = await ed25519Sign(kp1.priv, bytesOf('hello'))
  const pk = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: toBase64Url(kp1.pub) }, format: 'jwk' })
  const v = nodeVerify(null, Buffer.from('hello'), pk, Buffer.from(sig))
  check('ed25519 sign verifies (node)', v)

  // X25519 ECDH symmetry
  const a = await x25519Keypair()
  const b = await x25519Keypair()
  const s1 = await x25519SharedSecret(a.priv, b.pub)
  const s2 = await x25519SharedSecret(b.priv, a.pub)
  check('x25519 ECDH symmetric', Buffer.from(s1).equals(Buffer.from(s2)) && s1.length === 32)

  // x25519 cross-check vs node
  const nodeBob = generateKeyPairSync('x25519')
  const bobJwk = nodeBob.publicKey.export({ format: 'jwk' })
  const ourPriv = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: toBase64Url(a.priv), x: toBase64Url(a.pub) }, format: 'jwk' })
  const sharedNode = diffieHellman({ privateKey: ourPriv as never, publicKey: nodeBob.publicKey })
  const sharedOurs = await x25519SharedSecret(a.priv, fromBase64Url(bobJwk.x as string) as never)
  check('x25519 cross-check vs node', Buffer.from(sharedOurs).equals(Buffer.from(sharedNode)))

  // x25519 deterministic from seed
  const xseed = new Uint8Array(32).fill(11)
  const x1 = await x25519Keypair(xseed)
  const x2 = await x25519Keypair(xseed)
  check('x25519 deterministic', Buffer.from(x1.pub).equals(Buffer.from(x2.pub)) && Buffer.from(x1.priv).equals(Buffer.from(x2.priv)))

  // AES-GCM roundtrip with aad
  const msg = bytesOf('top secret sealed payload')
  const key = u8(32)
  key.fill(9)
  const ct = await aesGcmEncrypt(key, msg, bytesOf('header'))
  const pt = await aesGcmDecrypt(key, ct, bytesOf('header'))
  check('aes-gcm roundtrip', Buffer.from(pt).equals(Buffer.from(msg)))
  let tampered = false
  try { await aesGcmDecrypt(key, ct, bytesOf('wrong-header')) } catch { tampered = true }
  check('aes-gcm aad tamper rejected', tampered)

  console.log(ok ? '\nALL OK' : '\nFAILURES PRESENT')
  process.exit(ok ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })