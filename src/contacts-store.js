import { atom } from './vendor/store.js'
import { backend } from './device-store.js'
import { listContacts, saveContact } from '../lib/keystore.js'
import { createPeerIdentity } from '../lib/identity.js'
import { SEED_PEOPLE, syncChats } from './chats.js'

// Contact identities. Each record is a public "ContactPub" (user + app +
// device public keys) that sealTo() can address. Built-ins are seeded with a
// generated identity on first run so they are messageable straight away.

export const contacts = atom([])

export function contactByName(name) {
  return contacts.get().find((contact) => contact.name === name) ?? null
}

/** Reload contacts from the store and republish them to the atoms. */
async function publish(store) {
  const list = await listContacts(store)
  contacts.set(list)
  syncChats(list)
  return list
}

async function seed() {
  const store = await backend()
  const have = new Set((await listContacts(store)).map((contact) => contact.name))
  for (const name of SEED_PEOPLE) {
    if (have.has(name)) continue
    await saveContact(store, await createPeerIdentity(name))
  }
  return publish(store)
}

let seedPromise = null

/** Load persisted contacts and backfill identities for the built-in people. */
export function initContacts() {
  seedPromise ??= seed()
  return seedPromise
}

/** Create (or return) a contact identity and make it available as a chat. */
export async function addContact(name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Enter a name for this contact')
  const store = await backend()
  const existing = (await listContacts(store)).find((contact) => contact.name === trimmed)
  if (existing) return existing
  const record = await saveContact(store, await createPeerIdentity(trimmed))
  await publish(store)
  return record
}
