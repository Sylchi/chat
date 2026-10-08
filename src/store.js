import { atom } from './vendor/store.js'

export const activeNav = atom('Inbox')
export const activeChat = atom('Maya Chen')
export const draft = atom('')

export const threads = atom({
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
export const sidebarCollapsed = atom(false)
export const mobileSidebarOpen = atom(false)
export const completedTasks = atom([])
