export const AGENT_CHAT = 'S agent'

const KNOWN = {
  'Maya Chen': { initials: 'MC', color: 'bg-amber-200 text-amber-900' },
  'Design crew': { initials: 'DC', color: 'bg-violet-200 text-violet-900' },
  'Jordan Blake': { initials: 'JB', color: 'bg-sky-200 text-sky-900' },
  'Priya Shah': { initials: 'PS', color: 'bg-rose-200 text-rose-900' },
  'Saved messages': { initials: 'SM', color: 'bg-muted text-muted-foreground' },
}

const PALETTE = [
  'bg-emerald-200 text-emerald-900',
  'bg-orange-200 text-orange-900',
  'bg-teal-200 text-teal-900',
  'bg-fuchsia-200 text-fuchsia-900',
  'bg-lime-200 text-lime-900',
]

export const chats = [
  { name: AGENT_CHAT, initials: 'S', color: 'bg-violet-200 text-violet-900', text: 'Running locally on this device', time: '', unread: 0, online: true, agent: true },
  { name: 'Maya Chen', initials: 'MC', color: 'bg-amber-200 text-amber-900', text: 'The new photos are beautiful', time: '10:42', unread: 2, online: true },
  { name: 'Design crew', initials: 'DC', color: 'bg-violet-200 text-violet-900', text: 'You: Sent the final deck', time: '09:18', unread: 0, online: false },
  { name: 'Jordan Blake', initials: 'JB', color: 'bg-sky-200 text-sky-900', text: 'Video call · 23 min', time: 'Yesterday', unread: 0, online: false },
  { name: 'Saved messages', initials: 'SM', color: 'bg-muted text-muted-foreground', text: 'Your private notes', time: '', unread: 0, online: false },
]

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
  const fromList = chats.find((chat) => chat.name === name)
  if (fromList) return fromList
  const known = KNOWN[name]
  if (known) return { name, ...known, online: false }
  return { name, initials: initialsOf(name), color: PALETTE[hashOf(name) % PALETTE.length], online: false }
}
