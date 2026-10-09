import { atom } from './vendor/store.js'

export const AGENT_CHAT = 'S agent'
export const SAVED_CHAT = 'Saved messages'

// Built-in people seeded with a generated identity on first run so every
// listed contact is immediately addressable with an end-to-end envelope.
export const SEED_PEOPLE = ['Maya Chen', 'Design crew', 'Jordan Blake', 'Priya Shah']

const KNOWN = {
  'Maya Chen': { initials: 'MC', color: 'bg-amber-200 text-amber-900' },
  'Design crew': { initials: 'DC', color: 'bg-violet-200 text-violet-900' },
  'Jordan Blake': { initials: 'JB', color: 'bg-sky-200 text-sky-900' },
  'Priya Shah': { initials: 'PS', color: 'bg-rose-200 text-rose-900' },
}

const PALETTE = [
  'bg-emerald-200 text-emerald-900',
  'bg-orange-200 text-orange-900',
  'bg-teal-200 text-teal-900',
  'bg-fuchsia-200 text-fuchsia-900',
  'bg-lime-200 text-lime-900',
]

const AGENT_META = { initials: 'S', color: 'bg-violet-200 text-violet-900' }
const SAVED_META = { initials: 'SM', color: 'bg-muted text-muted-foreground' }

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function hashOf(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return hash
}

export function chatMeta(name) {
  if (name === AGENT_CHAT) return { name, ...AGENT_META, online: true }
  if (name === SAVED_CHAT) return { name, ...SAVED_META, online: false }
  const known = KNOWN[name]
  if (known) return { name, ...known, online: false }
  return { name, initials: initialsOf(name), color: PALETTE[hashOf(name) % PALETTE.length], online: false }
}

function agentRow() {
  return {
    name: AGENT_CHAT,
    ...chatMeta(AGENT_CHAT),
    text: 'Running locally on this device',
    time: '',
    unread: 0,
    online: true,
    agent: true,
  }
}

function savedRow() {
  return { name: SAVED_CHAT, ...chatMeta(SAVED_CHAT), text: 'Your private notes', time: '', unread: 0, online: false }
}

function contactRow(contact) {
  return {
    name: contact.name,
    ...chatMeta(contact.name),
    text: 'Private chat · end-to-end encrypted',
    time: '',
    unread: 0,
    online: false,
  }
}

// Reactive chat list: [S agent] + one row per contact + [Saved messages].
// Seeded synchronously from SEED_PEOPLE to match the pre-load render, then
// replaced by syncChats() once real contact identities are loaded.
export const chats = atom([agentRow(), ...SEED_PEOPLE.map((name) => contactRow({ name })), savedRow()])

export function syncChats(contacts = []) {
  const rows = [agentRow()]
  for (const contact of contacts) {
    if (contact.name === AGENT_CHAT || contact.name === SAVED_CHAT) continue
    rows.push(contactRow(contact))
  }
  rows.push(savedRow())
  chats.set(rows)
}
