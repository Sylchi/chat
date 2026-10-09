import { atom } from './vendor/store.js'
import { persist, registerEntry } from './vault.js'

// Atom whose value is sealed at rest by src/vault.js. While locked, sealed
// blobs are left untouched and the atom holds [locked] (never plaintext).
// Plaintext blobs from before encryption existed are loaded and re-sealed on
// the next unlock.
function readPlaintext(key, fallback, locked) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    if (parsed && parsed.__s === 1) return locked
    return parsed
  } catch {
    return fallback
  }
}

export function persistentAtom(key, initial, locked = initial) {
  const store = atom(readPlaintext(key, initial, locked))
  const apply = store.set.bind(store)
  store.set = (next) => {
    apply(next)
    void persist(key, next)
  }
  registerEntry(key, { apply, lockedValue: () => locked })
  return store
}

export const activeNav = persistentAtom('s:active-nav', 'Inbox')
export const activeChat = persistentAtom('s:active-chat', 'Maya Chen')
export const draft = persistentAtom('s:draft', '')

const SEED_THREADS = {
  'Maya Chen': [
    { from: 'them', text: 'Hey! I just finished editing the gallery from Saturday.', time: '10:36' },
    { from: 'me', text: 'Oh nice, I can’t wait to see it. The light was perfect that day.', time: '10:37' },
    { from: 'them', text: 'The new photos are beautiful', time: '10:42' },
  ],
}
export const threads = persistentAtom('s:threads', SEED_THREADS, {})

export function threadFor(chat) {
  return threads.get()[chat] ?? []
}

export function appendMessage(chat, message) {
  const current = threads.get()
  threads.set({ ...current, [chat]: [...(current[chat] ?? []), message] })
}

export function updateMessage(chat, id, patch) {
  const current = threads.get()
  const list = current[chat] ?? []
  threads.set({ ...current, [chat]: list.map((message) => (message.id === id ? { ...message, ...patch } : message)) })
}

export const showLink = atom(false)
export const showAuth = atom(false)
export const sharedFiles = atom([])
export const sidebarCollapsed = persistentAtom('s:sidebar-collapsed', false)
export const mobileSidebarOpen = atom(false)
export const chatsDrawerOpen = atom(false)
export const completedTasks = persistentAtom('s:tasks', [], [])
