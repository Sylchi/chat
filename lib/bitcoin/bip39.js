import { WORDLIST } from './wordlist.js'

// BIP39 mnemonic (English, 2048 words). Uses WebCrypto for SHA-256 and
// PBKDF2-HMAC-SHA512 so it stays browser-native with no dependencies.

const encoder = new TextEncoder()
const WORD_INDEX = new Map(WORDLIST.map((word, index) => [word, index]))

function sha256(bytes) {
  return crypto.subtle.digest('SHA-256', bytes).then((buffer) => new Uint8Array(buffer))
}

function toBinary(bytes) {
  let out = ''
  for (const byte of bytes) out += byte.toString(2).padStart(8, '0')
  return out
}

function entropyToMnemonic(entropy, checksumBits) {
  const bits = toBinary(entropy) + checksumBits
  const words = []
  for (let i = 0; i < bits.length; i += 11) {
    words.push(WORDLIST[parseInt(bits.slice(i, i + 11), 2)])
  }
  return words.join(' ')
}

/** Generate a mnemonic from `entropyBits` (128 => 12 words, 256 => 24 words). */
export async function generateMnemonic(entropyBits = 128) {
  if (entropyBits % 32 !== 0 || entropyBits < 128 || entropyBits > 256) {
    throw new Error('entropy must be a multiple of 32 between 128 and 256')
  }
  const entropy = crypto.getRandomValues(new Uint8Array(entropyBits / 8))
  const checksum = (await sha256(entropy))[0].toString(2).padStart(8, '0').slice(0, entropyBits / 32)
  return entropyToMnemonic(entropy, checksum)
}

/** PBKDF2-HMAC-SHA512 (2048 rounds) per BIP39; returns the 64-byte seed. */
export async function mnemonicToSeed(mnemonic, passphrase = '') {
  const password = encoder.encode(mnemonic.normalize('NFKD'))
  const salt = encoder.encode(('mnemonic' + passphrase).normalize('NFKD'))
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 2048, hash: 'SHA-512' }, key, 512)
  return new Uint8Array(bits)
}

/** Validate word count, membership and the SHA-256 checksum. */
export async function validateMnemonic(mnemonic) {
  const words = mnemonic.normalize('NFKD').trim().split(/\s+/)
  if (![12, 15, 18, 21, 24].includes(words.length)) return false

  let bits = ''
  for (const word of words) {
    const index = WORD_INDEX.get(word)
    if (index === undefined) return false
    bits += index.toString(2).padStart(11, '0')
  }

  const entropyBits = (words.length * 32) / 3
  const checksumBits = entropyBits / 32
  const entropy = new Uint8Array(entropyBits / 8)
  for (let i = 0; i < entropy.length; i++) {
    entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }

  const hash = toBinary(await sha256(entropy))
  return bits.slice(entropyBits) === hash.slice(0, checksumBits)
}

/** Derive the seed and validate in one step for restore flows. */
export async function mnemonicToValidatedSeed(mnemonic, passphrase = '') {
  if (!(await validateMnemonic(mnemonic))) throw new Error('Invalid recovery phrase')
  return mnemonicToSeed(mnemonic, passphrase)
}
