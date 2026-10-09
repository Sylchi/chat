import { sha3_256, base32Encode, onionAddress, onionAddressFromBase32 } from '../lib/onion.js'
import { createHash } from 'node:crypto'
import { check, run } from './harness.js'

async function main() {
  const vectors: [string, string][] = [
    ['', 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'],
    ['abc', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '41c0dba2a9d6240849100376a8235e2c82e1b9998a999e21db32dd97496d3376'],
  ]
  for (const [msg, expect] of vectors) {
    const got = Buffer.from(sha3_256(Buffer.from(msg))).toString('hex')
    check(`sha3_256(${JSON.stringify(msg)})${got === expect ? '' : ' got ' + got}`, got === expect)
  }
  const rnd = Buffer.from('deadbeef'.repeat(8), 'hex')
  const expectNode = createHash('sha3-256').update(rnd).digest('hex')
  const gotNode = Buffer.from(sha3_256(rnd)).toString('hex')
  check('sha3_256 cross-check vs node-crypto', expectNode === gotNode)

  const b32 = base32Encode(Buffer.from('foobar'))
  check(`base32(foobar)=${b32}`, b32 === 'mzxw6ytboi')

  const pub = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex')
  const addr = onionAddress(pub)
  const parsed = onionAddressFromBase32(addr)
  const rt = parsed !== null && Buffer.from(parsed.pub).equals(pub) && parsed.version === 3
  check(`onion roundtrip addr=${addr}`, rt)

  // negative: corrupted checksum
  const bad = onionAddressFromBase32(addr.slice(0, 4) + (addr[3] === 'a' ? 'b' : 'a') + addr.slice(5))
  check('corrupt onion rejected', bad === null)
}

run(main)
