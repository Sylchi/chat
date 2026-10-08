import { atom } from 'nanostores'

export type Message = { from: 'them' | 'me'; text: string; time: string }

export const activeNav = atom('Inbox')
export const activeChat = atom('Maya Chen')
export const draft = atom('')
export const messages = atom<Message[]>([
  { from: 'them', text: 'Hey! I just finished editing the gallery from Saturday.', time: '10:36' },
  { from: 'me', text: 'Oh nice, I can’t wait to see it. The light was perfect that day.', time: '10:37' },
  { from: 'them', text: 'The new photos are beautiful', time: '10:42' },
])
export const showAgent = atom(true)
export const showLink = atom(false)
export const showAuth = atom(false)
export const sharedFiles = atom<File[]>([])
export const sidebarCollapsed = atom(false)
export const mobileSidebarOpen = atom(false)
export const completedTasks = atom<string[]>([])