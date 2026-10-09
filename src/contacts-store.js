import { atom } from './vendor/store.js'
import { backend } from './device-store.js'
import { listContacts as listLegacyContacts } from '../lib/keystore.js'
import { createPeerIdentity, contactIdForUserPub } from '../lib/identity.js'
import { sha256, toBase64Url, fromBase64Url } from '../lib/crypto.js'
import { parseVcard, parseVcards, buildVcard, cardName } from '../lib/vcard.js'
import { SEED_PEOPLE, syncChats } from './chats.js'

// ---------------------------------------------------------------------------
// Contacts. The source of truth is a vCard per person, persisted as UTF-8
// bytes in the device store under `cards/`. vCard is the widely-supported
// interchange format for people (Google Contacts, Apple Contacts, Android,
// Thunderbird all read/write it), so imports and exports are lossless and
// portable. Our own crypto material rides in X-S-* properties, which every
// other reader ignores.
//
// For a person you add yourself we mint the full identity (user/app/device
// keys) locally, per the model: you create the contact and hand them the key.
// For an imported card without crypto we mint one too, so every contact is
// immediately addressable end-to-end.
// ---------------------------------------------------------------------------

const PREFIX = 'cards/'
const enc = new TextEncoder()
const dec = new TextDecoder()

export const contacts = atom([])

const lower = (value) => String(value ?? '').trim().toLowerCase()

function recordKey(record) {
  const email = record.emails?.[0]?.value
  if (email) return `e:${lower(email)}`
  return `n:${lower(record.name)}`
}

function contactById(id) {
  return contacts.get().find((contact) => contact.id === id) ?? null
}

export function contactByName(name) {
  const want = lower(name)
  return contacts.get().find((contact) => lower(contact.name) === want) ?? null
}

/** Every contact as vCard text, suitable for one .vcf export file. */
export function exportCards() {
  return contacts.get().map(recordToCard).map(buildVcard).join('')
}

function displayName(record) {
  return record.name || [record.firstName, record.lastName].filter(Boolean).join(' ') || 'Unnamed'
}

function recordToCard(record) {
  const extra = {
    'X-S-ID': record.id,
    'X-S-USERPUB': record.userPub ? toBase64Url(record.userPub) : '',
    'X-S-APPPUB': record.appPub ? toBase64Url(record.appPub) : '',
    'X-S-DEVICEID': record.deviceId || '',
    'X-S-DEVICEPUB': record.devicePub ? toBase64Url(record.devicePub) : '',
    'X-S-ONION': record.onion || '',
    'X-S-ADDED': String(record.added || Date.now()),
  }
  for (const key of Object.keys(extra)) if (!extra[key]) delete extra[key]
  return {
    version: '4.0',
    fn: displayName(record),
    n: { family: record.lastName || '', given: record.firstName || '', additional: '', prefix: '', suffix: '' },
    nickname: record.nickname || [],
    org: record.org || '',
    title: record.title || '',
    note: record.note || '',
    bday: record.bday || '',
    photo: record.photo || '',
    url: record.url || [],
    tel: record.phones || [],
    email: record.emails || [],
    adr: [],
    extra,
  }
}

async function recordFromCard(card) {
  const x = (key) => card.extra[key] || ''
  const decode = (value) => (value ? fromBase64Url(value) : null)
  const userPub = decode(x('X-S-USERPUB'))
  const appPub = decode(x('X-S-APPPUB'))
  const devicePub = decode(x('X-S-DEVICEPUB'))
  let id = x('X-S-ID')
  if (!id && userPub) id = await contactIdForUserPub(userPub)
  if (!id) id = `card:${toBase64Url((await sha256(enc.encode(cardName(card) + (card.email[0]?.value ?? '')))).slice(0, 6))}`
  return {
    id,
    name: cardName(card),
    firstName: card.n?.given || '',
    lastName: card.n?.family || '',
    nickname: card.nickname || [],
    phones: card.tel || [],
    emails: card.email || [],
    org: card.org || '',
    title: card.title || '',
    note: card.note || '',
    bday: card.bday || '',
    photo: card.photo || '',
    url: card.url || [],
    onion: x('X-S-ONION'),
    userPub,
    appPub,
    devicePub,
    deviceId: x('X-S-DEVICEID'),
    added: Number(x('X-S-ADDED')) || Date.now(),
  }
}

function recordFromContactPub(contact) {
  return {
    id: contact.id,
    name: contact.name || '',
    firstName: '',
    lastName: '',
    nickname: [],
    phones: [],
    emails: [],
    org: '',
    title: '',
    note: '',
    bday: '',
    photo: '',
    url: [],
    onion: '',
    userPub: contact.userPub,
    appPub: contact.appPub,
    devicePub: contact.devicePub,
    deviceId: contact.deviceId,
    added: contact.added || Date.now(),
  }
}

async function ensureIdentity(record) {
  if (record.userPub && record.appPub && record.devicePub) return record
  const minted = await createPeerIdentity(record.name || 'Contact')
  return {
    ...record,
    id: minted.id,
    userPub: minted.userPub,
    appPub: minted.appPub,
    devicePub: minted.devicePub,
    deviceId: minted.deviceId,
  }
}

async function saveRecord(store, record) {
  await store.set(PREFIX + record.id, enc.encode(buildVcard(recordToCard(record))))
  return record
}

async function loadRecords(store) {
  const rows = await store.list(PREFIX)
  const records = []
  for (const row of rows) {
    const card = parseVcard(typeof row.value === 'string' ? row.value : dec.decode(row.value))
    if (card) records.push(await recordFromCard(card))
  }
  return records.sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

async function publish(store) {
  const list = await loadRecords(store)
  contacts.set(list)
  syncChats(list)
  return list
}

async function migrateLegacy(store) {
  if ((await store.list(PREFIX)).length) return
  for (const contact of await listLegacyContacts(store)) {
    await saveRecord(store, recordFromContactPub(contact))
  }
}

async function seed() {
  const store = await backend()
  await migrateLegacy(store)
  const have = new Set((await loadRecords(store)).map((record) => lower(displayName(record))))
  for (const name of SEED_PEOPLE) {
    if (have.has(lower(name))) continue
    await saveRecord(store, recordFromContactPub(await createPeerIdentity(name)))
  }
  return publish(store)
}

let seedPromise = null

export function initContacts() {
  seedPromise ??= seed()
  return seedPromise
}

/** Reload contacts from disk and republish them to the atoms. */
export async function refreshContacts() {
  return publish(await backend())
}

/** Create (or return) a contact identity and make it available as a chat. */
export async function addContact(name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Enter a name for this contact')
  const store = await backend()
  const existing = contactByName(trimmed)
  if (existing) return existing
  const record = recordFromContactPub(await createPeerIdentity(trimmed))
  await saveRecord(store, record)
  await publish(store)
  return record
}

/**
 * Import parsed vCards. Cards without our crypto get a minted identity; cards
 * matching an existing contact merge their standard fields but keep the
 * identity we already issued, so a re-import never forks someone's keys.
 * @returns {Promise<{added:number, merged:number}>}
 */
export async function importCards(cards) {
  const store = await backend()
  const index = new Map((await loadRecords(store)).map((record) => [recordKey(record), record]))
  let added = 0
  let merged = 0
  for (const card of cards ?? []) {
    const record = await ensureIdentity(await recordFromCard(card))
    const prior = index.get(recordKey(record))
    if (prior) {
      const kept = {
        ...prior,
        ...record,
        id: prior.id,
        userPub: prior.userPub,
        appPub: prior.appPub,
        devicePub: prior.devicePub,
        deviceId: prior.deviceId,
        added: prior.added,
      }
      await saveRecord(store, kept)
      merged++
    } else {
      await saveRecord(store, record)
      index.set(recordKey(record), record)
      added++
    }
  }
  await publish(store)
  return { added, merged }
}

/** Import raw vCard text (a .vcf file or a pasted block). */
export async function importText(text) {
  const cards = parseVcards(text)
  if (!cards.length) throw new Error('No contacts found in that vCard')
  return importCards(cards)
}

export async function removeContact(id) {
  const store = await backend()
  await store.del(PREFIX + id)
  await publish(store)
}

export { contactById }
