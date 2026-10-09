import { createPeerIdentity, contactIdForUserPub } from '../lib/identity.js'
import { memoryStore, saveContact, listContacts, contactById } from '../lib/keystore.js'
import { sealMessage } from '../src/messages.js'
import { toBase64Url } from '../lib/crypto.js'
import { check, run } from './harness.js'

async function main() {
  const a = await createPeerIdentity('Amara Okafor')
  const b = await createPeerIdentity('Bilal Khan')
  check(
    'identity has three 32-byte public keys',
    a.userPub.length === 32 && a.appPub.length === 32 && a.devicePub.length === 32,
  )
  check('identity id derives from the user pub', a.id === (await contactIdForUserPub(a.userPub)))
  check('two identities differ', toBase64Url(a.userPub) !== toBase64Url(b.userPub))

  const store = memoryStore()
  await saveContact(store, a)
  await saveContact(store, b)
  const list = await listContacts(store)
  check(
    'contacts persist with names',
    list.length === 2 && new Set(list.map((c) => c.name)).size === 2,
  )
  const loaded = await contactById(store, a.id)
  check(
    'contact roundtrips its keys',
    !!loaded && toBase64Url(loaded.userPub) === toBase64Url(a.userPub) && loaded.deviceId === a.deviceId,
  )

  const envelope = JSON.parse(await sealMessage('hello amara', a))
  check('message seals to the contact identity', envelope.v === 1 && envelope.to.user === toBase64Url(a.userPub))
  check('sealed body is ciphertext', typeof envelope.body === 'string' && envelope.body.length > 0)

  let rejected = false
  try {
    await sealMessage('x', null)
  } catch {
    rejected = true
  }
  check('sealing without an identity is rejected', rejected)
}

run(main)
