'use client'

import { useEffect, useState } from 'react'
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Contact,
  Copy,
  FileImage,
  GalleryHorizontalEnd,
  Hash,
  KeyRound,
  LayoutGrid,
  Link2,
  ListTodo,
  LockKeyhole,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
  Wifi,
  X,
  Zap,
} from 'lucide-react'

const navItems = [
  { label: 'Inbox', icon: MessageCircle, count: 3 },
  { label: 'Contacts', icon: Contact },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Tasks', icon: ListTodo, count: 4 },
  { label: 'Gallery', icon: GalleryHorizontalEnd },
  { label: 'Timeline', icon: Clock3 },
]

const contacts = [
  { name: 'Maya Chen', id: 'luma_mc_7F2K', initials: 'MC', color: 'bg-amber-200 text-amber-900', status: 'Online now' },
  { name: 'Jordan Blake', id: 'luma_jb_19QA', initials: 'JB', color: 'bg-sky-200 text-sky-900', status: 'Last seen yesterday' },
  { name: 'Priya Shah', id: 'luma_ps_4N8D', initials: 'PS', color: 'bg-rose-200 text-rose-900', status: 'Online now' },
  { name: 'Design crew', id: 'luma_dc_2V6M', initials: 'DC', color: 'bg-violet-200 text-violet-900', status: '4 members' },
]

const chats = [
  { name: 'Maya Chen', initials: 'MC', color: 'bg-amber-200 text-amber-900', text: 'The new photos are beautiful', time: '10:42', unread: 2, online: true },
  { name: 'Design crew', initials: 'DC', color: 'bg-violet-200 text-violet-900', text: 'You: Sent the final deck', time: '09:18', unread: 0, online: false },
  { name: 'Jordan Blake', initials: 'JB', color: 'bg-sky-200 text-sky-900', text: 'Video call · 23 min', time: 'Yesterday', unread: 0, online: false },
  { name: 'Saved messages', initials: 'SM', color: 'bg-muted text-muted-foreground', text: 'Your private notes', time: '', unread: 0, online: false },
]

function Avatar({ initials, color, online = false, small = false }: { initials: string; color: string; online?: boolean; small?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span className={`grid place-items-center rounded-full font-semibold ${small ? 'size-8 text-[10px]' : 'size-10 text-xs'} ${color}`}>{initials}</span>
      {online && <span className="absolute -right-0.5 bottom-0 size-2.5 rounded-full border-2 border-card bg-emerald-500" />}
    </span>
  )
}

function WorkspacePanel({ activeNav, onSelectChat }: { activeNav: string; onSelectChat: (name: string) => void }) {
  const [completedTasks, setCompletedTasks] = useState<string[]>([])
  const [showAddContact, setShowAddContact] = useState(false)

  const panelData = {
    Calendar: { title: 'Calendar', description: 'Your week at a glance', icon: CalendarDays },
    Tasks: { title: 'Tasks', description: 'Keep momentum on what matters', icon: ListTodo },
    Gallery: { title: 'Gallery', description: 'Shared moments, kept private', icon: GalleryHorizontalEnd },
    Timeline: { title: 'Timeline', description: 'A private record of your life in luma', icon: Clock3 },
  }[activeNav as 'Calendar' | 'Tasks' | 'Gallery' | 'Timeline']

  if (activeNav === 'Contacts') return <div className="flex-1 overflow-auto p-5 sm:p-8"><div className="mb-7 flex items-end justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">People you trust</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Contacts</h2><p className="mt-1 text-sm text-muted-foreground">Every person has a private luma ID for secure linking.</p></div><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Add contact</button></div><div className="grid gap-3 sm:grid-cols-2">{contacts.map((contact) => <article key={contact.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-start gap-3"><Avatar initials={contact.initials} color={contact.color} online={contact.status === 'Online now'} /><div className="min-w-0 flex-1"><h3 className="font-semibold">{contact.name}</h3><p className="text-xs text-muted-foreground">{contact.status}</p><p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">{contact.id}</p></div><button onClick={() => onSelectChat(contact.name)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">Message</button></div></article>)}</div></div>

  if (activeNav === 'Calendar') return <div className="flex-1 overflow-auto p-5 sm:p-8"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">October 2026</p><h2 className="mt-1 text-2xl font-semibold">Calendar</h2></div><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">New event</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['Today · 11:00 — Team sync','Tomorrow · 14:30 — Call with Maya','Friday · 18:00 — Gallery review','Mon, Oct 12 · 09:00 — Plan the week','Tue, Oct 13 · 16:00 — Design crew','Sat, Oct 17 · All day — Weekend trip'].map((event) => <div key={event} className="rounded-2xl border border-border bg-card p-4"><CalendarDays className="mb-4 size-4 text-primary" /><p className="text-sm font-medium">{event}</p><p className="mt-1 text-xs text-muted-foreground">Private event · synced across 2 devices</p></div>)}</div></div>

  if (activeNav === 'Tasks') return <div className="flex-1 overflow-auto p-5 sm:p-8"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">4 open items</p><h2 className="mt-1 text-2xl font-semibold">Tasks</h2></div><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Add task</button></div><div className="flex flex-col gap-3">{['Send final deck to design crew','Choose favorites from Saturday gallery','Book train for weekend trip','Review privacy settings'].map((task, index) => <label key={task} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><input type="checkbox" checked={completedTasks.includes(task)} onChange={() => setCompletedTasks((current) => current.includes(task) ? current.filter((item) => item !== task) : [...current, task])} className="size-4 accent-primary" /><span className="flex-1 text-sm font-medium">{task}</span><span className="text-xs text-muted-foreground">{index < 2 ? 'Today' : 'This week'}</span></label>)}</div></div>

  return <div className="flex-1 overflow-auto p-5 sm:p-8"><div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{activeNav}</p><h2 className="mt-1 text-2xl font-semibold">{panelData?.title}</h2><p className="mt-1 text-sm text-muted-foreground">{panelData?.description}</p></div>{activeNav === 'Gallery' ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{['Saturday light','Maya · portrait set','Design crew · final deck','Weekend notes','Golden hour','Shared references'].map((item, index) => <div key={item} className={`flex aspect-square items-end rounded-2xl border border-border p-4 ${['bg-amber-100','bg-sky-100','bg-violet-100','bg-emerald-100','bg-rose-100','bg-orange-100'][index]}`}><span className="text-sm font-medium text-foreground/75">{item}</span></div>)}</div> : <div className="flex flex-col gap-3">{['New photo set added to Gallery','Maya replied to your message','Task completed: Review privacy settings','Device synced via WebBluetooth'].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><div className="grid size-9 place-items-center rounded-xl bg-muted"><Clock3 className="size-4 text-muted-foreground" /></div><div><p className="text-sm font-medium">{item}</p><p className="text-xs text-muted-foreground">Private activity · just now</p></div></div>)}</div>}</div>
}

export function Workspace() {
  const [activeNav, setActiveNav] = useState('Inbox')
  const [activeChat, setActiveChat] = useState('Maya Chen')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    { from: 'them', text: 'Hey! I just finished editing the gallery from Saturday.', time: '10:36' },
    { from: 'me', text: 'Oh nice, I can’t wait to see it. The light was perfect that day.', time: '10:37' },
    { from: 'them', text: 'The new photos are beautiful', time: '10:42' },
  ])
  const [showAgent, setShowAgent] = useState(true)
  const [showLink, setShowLink] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!showLink) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowLink(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showLink])

  function sendMessage() {
    if (!draft.trim()) return
    setMessages((current) => [...current, { from: 'me', text: draft.trim(), time: 'Now' }])
    setDraft('')
  }

  return (
    <main className="min-h-screen bg-[#f4f5f7] p-3 text-foreground sm:p-5 lg:p-7">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1480px] overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_80px_-35px_rgba(15,23,42,0.35)]">
        <aside className={`hidden shrink-0 flex-col border-r border-border bg-muted/30 p-3 transition-[width] duration-200 md:flex ${sidebarCollapsed ? 'w-[72px]' : 'w-[236px]'}`}>
          <div className={`mb-8 flex items-center gap-2 ${sidebarCollapsed ? 'justify-center' : 'px-2'}`}>
            <div className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground"><LockKeyhole className="size-4" /></div>
            {!sidebarCollapsed && <span className="text-[17px] font-semibold tracking-tight">luma<span className="text-muted-foreground">/</span></span>}
          </div>
          <div className={`mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm ${sidebarCollapsed ? 'justify-center' : ''}`} title={sidebarCollapsed ? 'Alex Rivera · Personal space' : undefined}>
            <Avatar initials="AR" color="bg-cyan-200 text-cyan-900" online />
            {!sidebarCollapsed && <><div className="min-w-0"><p className="truncate text-sm font-semibold">Alex Rivera</p><p className="text-[11px] text-muted-foreground">Personal space</p></div><ChevronDown className="ml-auto size-3.5 text-muted-foreground" /></>}
          </div>
          <nav className="flex flex-col gap-1" aria-label="Main navigation">
            {navItems.map(({ label, icon: Icon, count }) => <button key={label} title={sidebarCollapsed ? label : undefined} onClick={() => setActiveNav(label)} className={`flex items-center gap-3 rounded-xl py-2.5 text-sm transition-colors ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${activeNav === label ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><Icon className="size-4" />{!sidebarCollapsed && <span>{label}</span>}{!sidebarCollapsed && count && <span className={`ml-auto rounded-full px-1.5 text-[10px] ${activeNav === label ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>{count}</span>}</button>)}
          </nav>
          <div className="mt-auto flex flex-col gap-1">
            <button onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"><Menu className="size-4" />{!sidebarCollapsed && 'Collapse sidebar'}</button>
            <button onClick={() => setShowLink(true)} title={sidebarCollapsed ? 'Link a device' : undefined} className={`flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'}`}><Link2 className="size-4" />{!sidebarCollapsed && 'Link a device'}</button>
            <button title={sidebarCollapsed ? 'Settings' : undefined} className={`flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'}`}><Settings2 className="size-4" />{!sidebarCollapsed && 'Settings'}</button>
            {!sidebarCollapsed && <div className="mt-3 flex items-center gap-2 border-t border-border px-2 pt-4 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-600" />End-to-end encrypted</div>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[72px] items-center justify-between border-b border-border px-4 sm:px-6">
            <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-accent md:hidden"><Menu className="size-5" /></button><div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{activeNav}</p><h1 className="text-lg font-semibold tracking-tight">Good morning, Alex</h1></div></div>
            <div className="flex items-center gap-2"><button className="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:flex"><Search className="size-3.5" />Search <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button><button className="relative rounded-xl p-2.5 text-muted-foreground hover:bg-accent"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500" /></button><Avatar initials="AR" color="bg-cyan-200 text-cyan-900" small /></div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="hidden w-[268px] shrink-0 border-r border-border lg:block">
              <div className="flex items-center justify-between px-4 py-4"><p className="text-sm font-semibold">Recent chats</p><button className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><Plus className="size-4" /></button></div>
              <div className="flex flex-col gap-1 px-2">{chats.map((chat) => <button key={chat.name} onClick={() => setActiveChat(chat.name)} className={`flex items-center gap-3 rounded-xl p-3 text-left ${activeChat === chat.name ? 'bg-accent' : 'hover:bg-muted/60'}`}><Avatar initials={chat.initials} color={chat.color} online={chat.online} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{chat.name}</span><span className="text-[10px] text-muted-foreground">{chat.time}</span></span><span className="flex items-center justify-between gap-2"><span className="truncate text-xs text-muted-foreground">{chat.text}</span>{chat.unread > 0 && <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">{chat.unread}</span>}</span></span></button>)}</div>
              <div className="mx-4 mt-8 rounded-2xl border border-border bg-muted/40 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Wifi className="size-3.5 text-emerald-600" /> 2 devices synced</div><p className="text-[11px] leading-relaxed text-muted-foreground">Your messages, files and calls stay yours. No passwords. No third-party account.</p><button onClick={() => setShowLink(true)} className="mt-3 text-[11px] font-medium text-foreground underline underline-offset-4">Manage devices</button></div>
            </div>

            {activeNav !== 'Inbox' ? <WorkspacePanel activeNav={activeNav} onSelectChat={(name) => { setActiveChat(name); setActiveNav('Inbox') }} /> : <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-[68px] items-center justify-between border-b border-border px-4 sm:px-6"><div className="flex items-center gap-3"><Avatar initials="MC" color="bg-amber-200 text-amber-900" online /><div><h2 className="text-sm font-semibold">{activeChat}</h2><p className="text-[11px] text-muted-foreground">online · messages are encrypted</p></div></div><div className="flex items-center gap-1"><button className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Phone className="size-4" /></button><button className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Video className="size-4" /></button><button className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><MoreHorizontal className="size-4" /></button></div></div>
              <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-auto p-4 sm:p-6"><div className="mx-auto flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="size-3 text-emerald-600" /> Messages are end-to-end encrypted</div>{messages.map((message, index) => <div key={`${message.text}-${index}`} className={`flex items-end gap-2 ${message.from === 'me' ? 'justify-end' : ''}`}>{message.from === 'them' && <Avatar initials="MC" color="bg-amber-200 text-amber-900" small />}<div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${message.from === 'me' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted'}`}><p>{message.text}</p><div className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${message.from === 'me' ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{message.time}{message.from === 'me' && <Check className="size-3" />}</div></div></div>)}</div>
              <div className="border-t border-border p-4 sm:p-5"><div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2 focus-within:ring-2 focus-within:ring-ring/20"><button className="rounded-xl p-2 text-muted-foreground hover:bg-accent"><Paperclip className="size-4" /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage() } }} rows={1} placeholder="Write a message…" className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground" /><button className="rounded-xl p-2 text-muted-foreground hover:bg-accent"><Mic className="size-4" /></button><button onClick={sendMessage} aria-label="Send message" className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105"><Send className="size-4" /></button></div><p className="mt-2 text-center text-[10px] text-muted-foreground">Free forever · No ads · No tracking</p></div>
            </section>}
          </div>
        </section>

        {showAgent && <aside className="hidden w-[284px] shrink-0 border-l border-border bg-muted/20 xl:flex xl:flex-col"><div className="flex items-center justify-between border-b border-border px-5 py-5"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-xl bg-violet-100 text-violet-700"><Sparkles className="size-4" /></div><div><p className="text-sm font-semibold">Luma agent</p><p className="text-[10px] text-emerald-600">Running locally · WebGPU</p></div></div><button onClick={() => setShowAgent(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button></div><div className="flex-1 p-5"><div className="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 p-4 dark:from-violet-950/30 dark:to-indigo-950/30"><p className="text-sm font-medium leading-relaxed">“I’m here whenever you need me. Your data never leaves this device.”</p><div className="mt-3 flex items-center gap-1.5 text-[10px] text-violet-700 dark:text-violet-300"><Zap className="size-3" /> Private by design</div></div><p className="mb-3 mt-7 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suggested for you</p><div className="flex flex-col gap-2"><button className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent"><CalendarDays className="size-4 text-muted-foreground" /><span><span className="block font-medium">Plan my week</span><span className="text-[10px] text-muted-foreground">Organize your calendar</span></span></button><button className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent"><ListTodo className="size-4 text-muted-foreground" /><span><span className="block font-medium">Triage my tasks</span><span className="text-[10px] text-muted-foreground">4 items need attention</span></span></button><button className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent"><GalleryHorizontalEnd className="size-4 text-muted-foreground" /><span><span className="block font-medium">Find a memory</span><span className="text-[10px] text-muted-foreground">Search your timeline</span></span></button></div></div><div className="border-t border-border p-5"><button className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-xs font-medium hover:bg-accent"><MessageCircle className="size-3.5" /> Ask Luma anything</button></div></aside>}
      </div>

      {showLink && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-lg font-semibold">Link a device</p><p className="mt-1 text-sm text-muted-foreground">Use your phone to securely add another device.</p></div><button onClick={() => setShowLink(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button></div><div className="mx-auto my-7 grid size-44 place-items-center rounded-2xl border-8 border-muted bg-background"><QrCode className="size-28 text-foreground" /></div><div className="rounded-xl bg-muted/50 p-3 text-center text-xs text-muted-foreground"><KeyRound className="mx-auto mb-2 size-4 text-emerald-600" />This code expires in 04:58 and can only be used once.</div><button onClick={() => setShowLink(false)} className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">Scan with phone</button><p className="mt-3 text-center text-[10px] text-muted-foreground">WebBluetooth handshake · Forward secrecy enabled</p></div></div>}
    </main>
  )
}
