import { atom } from './vendor/store.js'

// Atom that mirrors its value to localStorage on every set. Corrupt or
// unavailable storage falls back to the in-memory value without crashing.
export function persistentAtom(key, initial) {
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) value = JSON.parse(raw)
  } catch {
    value = initial
  }
  const store = atom(value)
  const originalSet = store.set.bind(store)
  store.set = (next) => {
    originalSet(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // storage full / unavailable — keep in-memory state
    }
  }
  return store
}

export const activeNav = persistentAtom('s:active-nav', 'Inbox')
export const activeChat = persistentAtom('s:active-chat', 'Maya Chen')
export const draft = persistentAtom('s:draft', '')

export const threads = persistentAtom('s:threads', {
  'Maya Chen': [
    { from: 'them', text: 'Hey! I just finished editing the gallery from Saturday.', time: '10:36' },
    { from: 'me', text: 'Oh nice, I can’t wait to see it. The light was perfect that day.', time: '10:37' },
    { from: 'them', text: 'The new photos are beautiful', time: '10:42' },
  ],
})

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
export const completedTasks = persistentAtom('s:tasks', [])
