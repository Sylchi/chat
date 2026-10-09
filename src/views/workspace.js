import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Contact,
  Fingerprint,
  GalleryHorizontalEnd,
  KeyRound,
  Link2,
  ListTodo,
  Menu,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from '../vendor/icons.js'
import { avatar, brandMark, esc, icon } from '../dom.js'
import { atom } from '../vendor/store.js'
import { AGENT_CHAT, chats } from '../chats.js'
import { agentModel, agentPreviewText } from '../agent/model.js'
import { chatView } from './chat.js'
import { calendarView, contactsView, galleryView, openTaskCount, settingsView, taskList, tasksView, timelineView } from './panels.js'
import { devicesView } from './devices.js'
import {
  activeChat,
  activeNav,
  chatsDrawerOpen,
  completedTasks,
  mobileSidebarOpen,
  sidebarCollapsed,
  showAuth,
  showLink,
  threadFor,
} from '../store.js'
import {
  bluetoothAvailable,
  currentPeerPayload,
  initDevices,
  linked,
  localDevice,
  pairCode,
  pairError,
  pairFingerprint,
  pairState,
  pairViaBluetooth,
  receivePeerPayload,
} from '../device-store.js'
import { enrollPasskey, initPasskey, lockPasskey, passkey, unlockPasskey } from '../passkey-store.js'
import { initContacts } from '../contacts-store.js'

const PROFILE_NAME = 'Alex Rivera'

const navItems = [
  { label: 'Inbox', icon: MessageCircle, count: chats.get().reduce((total, chat) => total + (chat.unread || 0), 0) || 0 },
  { label: 'Contacts', icon: Contact },
  { label: 'Devices', icon: MonitorSmartphone },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Tasks', icon: ListTodo, count: 0 },
  { label: 'Gallery', icon: GalleryHorizontalEnd },
  { label: 'Timeline', icon: Clock3 },
]

const REGIONS = {
  Inbox: chatView,
  Contacts: contactsView,
  Devices: devicesView,
  Calendar: calendarView,
  Tasks: tasksView,
  Gallery: galleryView,
  Timeline: timelineView,
  Settings: settingsView,
}

function connectDevice() {
  showLink.set(true)
}

function renderAuth(authModal) {
  const state = passkey.get()
  const title = authModal.querySelector('[data-auth-title]')
  const desc = authModal.querySelector('[data-auth-desc]')
  const body = authModal.querySelector('[data-auth-body]')
  if (state.status === 'unlocked') {
    title.textContent = 'Identity unlocked'
    desc.textContent = 'Your user key is re-derived from the passkey and held in memory for this session.'
    body.innerHTML = `<div class="flex flex-col gap-3">
      <div class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
        ${icon(Fingerprint, 'size-5 text-primary')}
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">${esc(state.name || PROFILE_NAME)}</p>
          <p class="truncate font-mono text-[10px] text-muted-foreground">${esc(state.self?.id ?? '')}</p>
        </div>
        <span class="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">Unlocked</span>
      </div>
      <button data-auth-lock class="w-full rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-medium text-foreground hover:bg-accent">Lock</button>
    </div>`
    return
  }
  if (state.status === 'busy') {
    title.textContent = state.enrolled ? 'Unlocking…' : 'Creating your passkey…'
    desc.textContent = 'Complete the prompt in your browser or authenticator.'
    body.innerHTML = '<div class="rounded-2xl border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">Waiting for authenticator…</div>'
    return
  }
  title.textContent = state.enrolled ? 'Passwordless sign-in' : 'Create your passkey'
  desc.textContent = state.enrolled
    ? 'Use a passkey stored on this device.'
    : 'Your passkey is the root of your identity — it derives the user key for encrypted storage. Nothing secret is saved here.'
  const error = state.error
    ? `<div class="rounded-xl bg-rose-500/10 p-2.5 text-center text-[11px] text-rose-600">${esc(state.error)}</div>`
    : ''
  body.innerHTML = `<div class="flex flex-col gap-3">
    <button data-auth-platform class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-left hover:bg-accent">${icon(Fingerprint, 'size-5 text-primary')}<span><span class="block text-sm font-medium">${state.enrolled ? 'Unlock with passkey' : 'Create a passkey'}</span><span class="block text-xs text-muted-foreground">WebAuthn platform authenticator</span></span></button>
    <button data-auth-key class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-left hover:bg-accent">${icon(KeyRound, 'size-5 text-primary')}<span><span class="block text-sm font-medium">${state.enrolled ? 'Security key or authenticator' : 'Use a security key instead'}</span><span class="block text-xs text-muted-foreground">Hardware key or another device</span></span></button>
    ${error}
  </div>`
}

const searchTerm = atom('')

function navButton(item) {
  const active = item.label === activeNav.get()
  return `<button data-nav="${esc(item.label)}" data-side-row="btn" data-side-title="${esc(item.label)}"${
    active ? ' aria-current="page"' : ''
  } class="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }">
    ${icon(item.icon)}
    <span data-side-hide>${esc(item.label)}</span>
    ${'count' in item ? `<span data-nav-count class="ml-auto rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-background text-muted-foreground'}">${item.count}</span>` : ''}
  </button>`
}

const bottomItems = [
  { label: 'S agent', custom: 'agent', icon: Sparkles },
  { label: 'Devices', custom: 'devices', icon: MonitorSmartphone },
  { label: 'Passkeys', custom: 'auth', icon: Fingerprint },
  { label: 'Link a device', custom: 'link', icon: Link2 },
  { label: 'Settings', custom: 'settings', icon: Settings2 },
]

function bottomButton(item) {
  return `<button data-nav-custom="${item.custom}" data-side-row="btn" data-side-title="${esc(item.label)}" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
    ${icon(item.icon)}
    <span data-side-hide>${esc(item.label)}</span>
  </button>`
}

function encryptedNote(extraClass = '') {
  return `<div data-side-hide class="flex items-center gap-2 px-2 text-[11px] text-muted-foreground ${extraClass}">${icon(ShieldCheck, 'size-3.5 text-emerald-600')}End-to-end encrypted</div>`
}

function chatButton(chat) {
  const active = chat.name === activeChat.get()
  return `<button data-chat="${esc(chat.name)}" class="flex items-center gap-3 rounded-xl p-3 text-left ${active ? 'bg-accent' : 'hover:bg-muted/60'}">
    ${avatar(chat.initials, chat.color, chat.online)}
    <span class="min-w-0 flex-1">
      <span class="flex items-center justify-between gap-2"><span class="truncate text-sm font-medium">${esc(chat.name)}</span><span class="text-[10px] text-muted-foreground">${esc(chat.time)}</span></span>
      <span class="flex items-center justify-between gap-2"><span class="truncate text-xs text-muted-foreground"${chat.agent ? ' data-agent-preview' : ''}>${esc(chat.text)}</span>${chat.unread > 0 ? `<span class="grid size-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">${chat.unread}</span>` : ''}</span>
    </span>
  </button>`
}

export function initWorkspace(root) {
  root.innerHTML = `
    <main class="h-dvh overflow-hidden bg-background p-3 text-foreground sm:p-5 lg:p-7">
      <div class="mx-auto flex h-full max-w-[1480px] overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_80px_-35px_rgba(15,23,42,0.35)]">

        <aside data-desktop-sidebar id="sidebar" aria-label="Sidebar" class="hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 transition-[width] duration-200 md:flex">
          <div data-side-row="logo" class="mb-6 flex items-center gap-2 px-2">
            <div class="grid size-8 place-items-center rounded-xl bg-brand text-brand-foreground">${brandMark('size-4')}</div>
            <span data-side-hide class="text-[17px] font-semibold tracking-tight">S</span>
          </div>
          <div data-side-row="profile" data-side-title="Alex Rivera · Personal space" class="mb-5 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-card p-3 shadow-sm">
            ${avatar('AR', 'bg-cyan-200 text-cyan-900', true)}
            <div data-side-hide class="min-w-0">
              <p class="truncate text-sm font-semibold">Alex Rivera</p>
              <p class="text-[11px] text-muted-foreground">Personal space</p>
            </div>
            ${icon(ChevronDown, 'ml-auto size-3.5 text-muted-foreground', 'data-side-hide')}
          </div>
          <nav class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain" aria-label="Main navigation">
            ${navItems.map(navButton).join('')}
          </nav>
          <div class="flex shrink-0 flex-col gap-1 border-t border-sidebar-border pt-3">
            <button data-role="collapse" data-side-row="btn" data-side-title="Collapse sidebar" aria-label="Collapse sidebar" aria-controls="sidebar" aria-expanded="true" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              ${icon(Menu)}
              <span data-side-hide>Collapse sidebar</span>
              <kbd data-side-hide class="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">⌘B</kbd>
            </button>
            ${bottomItems.map(bottomButton).join('')}
            ${encryptedNote('mt-3 px-2 pt-3')}
          </div>
        </aside>

        <div data-mobile-overlay class="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm md:hidden hidden"></div>
        <aside data-mobile-sidebar id="mobile-sidebar" aria-label="Navigation" inert aria-hidden="true" class="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] flex-col border-r border-sidebar-border bg-sidebar p-4 shadow-2xl transition-transform duration-200 md:hidden -translate-x-full">
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-2"><div class="grid size-8 place-items-center rounded-xl bg-brand text-brand-foreground">${brandMark('size-4')}</div><span class="text-[17px] font-semibold tracking-tight">S</span></div>
            <button data-mobile-close aria-label="Close navigation" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <nav class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain" aria-label="Main navigation">
            ${navItems.map(navButton).join('')}
          </nav>
          <div class="flex shrink-0 flex-col gap-1 border-t border-sidebar-border pt-3">
            ${bottomItems.map(bottomButton).join('')}
            ${encryptedNote('mt-3 px-2 pt-1')}
          </div>
        </aside>

        <section class="flex min-h-0 min-w-0 flex-1 flex-col">
          <header class="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
            <div class="flex items-center gap-3">
              <button data-role="menu" aria-label="Open navigation" aria-controls="mobile-sidebar" aria-expanded="false" class="rounded-lg p-2 hover:bg-accent md:hidden">${icon(Menu, 'size-5')}</button>
              <div><p id="header-overline" class="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">${esc(activeNav.get())}</p><h1 class="text-lg font-semibold tracking-tight">Good morning, Alex</h1></div>
            </div>
            <div class="flex items-center gap-2">
              <button data-role="chats" aria-label="Open chats" aria-controls="chats-drawer" aria-expanded="false" class="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-accent lg:hidden">${icon(MessageCircle, 'size-3.5')}<span class="hidden sm:inline">Chats</span></button>
              <div class="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 py-2 pl-3 pr-2 text-xs text-muted-foreground focus-within:ring-2 focus-within:ring-ring/20 sm:flex">${icon(Search, 'size-3.5')}<input data-search aria-label="Search chats" placeholder="Search chats" autocomplete="off" class="w-32 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" /><kbd class="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">⌘K</kbd></div>
              ${avatar('AR', 'bg-cyan-200 text-cyan-900', false, true)}
            </div>
          </header>

          <div class="flex min-h-0 flex-1">
            <div data-chat-list class="hidden w-[268px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex lg:min-h-0">
              <div class="flex items-center justify-between px-4 py-4"><p class="text-sm font-semibold">Recent chats</p><button data-new-chat aria-label="New chat" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(Plus)}</button></div>
              <div class="flex-1 overflow-y-auto px-2"><div data-chat-rows class="flex flex-col gap-1"></div></div>
              <div class="mx-4 mt-8 shrink-0 rounded-2xl border border-border bg-muted/40 p-3">
                <div class="mb-2 flex items-center gap-2 text-xs font-medium">${icon(Wifi, 'size-3.5 text-emerald-600')}&#160;<span data-device-count>Sync status</span></div>
                <p class="text-[11px] leading-relaxed text-muted-foreground">Your messages, files and calls stay yours. No passwords. No third-party account.</p>
                <button data-nav-custom="devices" class="mt-3 text-[11px] font-medium text-foreground underline underline-offset-4">Manage devices</button>
              </div>
            </div>

            <div data-role="region" class="flex min-h-0 flex-1"></div>
          </div>
        </section>

      </div>

      <div data-chat-overlay class="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm hidden lg:hidden"></div>
      <aside data-chat-drawer id="chats-drawer" aria-label="Recent chats" inert aria-hidden="true" class="fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-[320px] flex-col border-l border-sidebar-border bg-sidebar p-4 shadow-2xl transition-transform duration-200 translate-x-full lg:hidden">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm font-semibold">Recent chats</p>
          <button data-chat-close aria-label="Close chats" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
        </div>
        <div class="flex-1 overflow-y-auto"><div data-chat-rows class="flex flex-col gap-1"></div></div>
        <button data-nav-custom="devices" class="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-left text-[11px] text-muted-foreground hover:bg-accent">
          <span class="flex items-center gap-2 text-xs font-medium text-foreground">${icon(Wifi, 'size-3.5 text-emerald-600')}<span data-device-count>Sync status</span></span>
          <span class="mt-1 block">Your messages, files and calls stay yours.</span>
        </button>
      </aside>

      <div data-modal="auth" class="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm hidden">
        <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div><p data-auth-title class="text-lg font-semibold">Passwordless sign-in</p><p data-auth-desc class="mt-1 text-sm text-muted-foreground">Use a passkey stored on this device.</p></div>
            <button data-auth-close aria-label="Close passkeys" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <div data-auth-body class="mt-6 flex flex-col gap-3"></div>
          <p class="mt-5 text-center text-[10px] text-muted-foreground">No password stored · Credential stays on your device</p>
        </div>
      </div>

      <div data-modal="link" class="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm hidden">
        <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div><p class="text-lg font-semibold">Link a device</p><p class="mt-1 text-sm text-muted-foreground">Pair a second device over Bluetooth so it can decode messages sealed for it.</p></div>
            <button data-link-close aria-label="Close link device" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <div data-link-body id="link-body" class="mt-5 flex flex-col gap-3"></div>
          <p class="mt-4 text-center text-[10px] text-muted-foreground">Bluetooth handshake · private key never leaves its device · peer keeps only its public key</p>
        </div>
      </div>
    </main>
  `

  const sidebar = root.querySelector('[data-desktop-sidebar]')
  const region = root.querySelector('[data-role="region"]')
  const authModal = root.querySelector('[data-modal="auth"]')
  const linkModal = root.querySelector('[data-modal="link"]')
  const mobileNav = root.querySelector('[data-mobile-sidebar]')
  const mobileOverlay = root.querySelector('[data-mobile-overlay]')
  const chatOverlay = root.querySelector('[data-chat-overlay]')
  const chatDrawer = root.querySelector('[data-chat-drawer]')
  const menuBtn = root.querySelector('[data-role="menu"]')
  const chatsBtn = root.querySelector('[data-role="chats"]')
  const mobileCloseBtn = mobileNav.querySelector('[data-mobile-close]')
  const chatCloseBtn = chatDrawer.querySelector('[data-chat-close]')

  // Geometry and label hiding for the rail live in CSS, keyed off [data-collapsed].
  function applyCollapsed(collapsed) {
    sidebar.toggleAttribute('data-collapsed', collapsed)
    for (const node of sidebar.querySelectorAll('[data-side-title]')) {
      node.title = collapsed ? (node.dataset.sideTitle ?? '') : ''
    }
    const collapseBtn = sidebar.querySelector('[data-role="collapse"]')
    if (collapseBtn) {
      const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
      collapseBtn.title = label
      collapseBtn.setAttribute('aria-label', label)
      collapseBtn.setAttribute('aria-expanded', String(!collapsed))
    }
  }

  function syncNav() {
    const current = activeNav.get()
    for (const btn of root.querySelectorAll('[data-nav]')) {
      const active = btn.dataset.nav === current
      btn.classList.toggle('bg-primary', active)
      btn.classList.toggle('text-primary-foreground', active)
      btn.classList.toggle('shadow-sm', active)
      btn.classList.toggle('text-muted-foreground', !active)
      btn.classList.toggle('hover:bg-accent', !active)
      btn.classList.toggle('hover:text-foreground', !active)
      if (active) btn.setAttribute('aria-current', 'page')
      else btn.removeAttribute('aria-current')
      const badge = btn.querySelector('[data-nav-count]')
      if (badge) {
        badge.classList.toggle('bg-primary-foreground/15', active)
        badge.classList.toggle('text-primary-foreground', active)
        badge.classList.toggle('bg-background', !active)
        badge.classList.toggle('text-muted-foreground', !active)
      }
    }
    const overline = document.getElementById('header-overline')
    if (overline) overline.textContent = current
  }

  function syncChatList() {
    const current = activeChat.get()
    for (const btn of root.querySelectorAll('[data-chat]')) {
      const active = btn.dataset.chat === current
      btn.classList.toggle('bg-accent', active)
      btn.classList.toggle('hover:bg-muted/60', !active)
    }
  }

  function renderChatRows() {
    const q = searchTerm.get().trim().toLowerCase()
    const rows = q
      ? chats.get().filter((chat) => {
          if ((chat.name || '').toLowerCase().includes(q)) return true
          return threadFor(chat.name).some((m) => String(m.text ?? '').toLowerCase().includes(q))
        })
      : chats.get()
    const html = rows.map(chatButton).join('')
    for (const node of root.querySelectorAll('[data-chat-rows]')) {
      node.innerHTML = html || '<p class="px-3 py-2 text-xs text-muted-foreground">No matches</p>'
    }
  }

  function syncInboxBadge() {
    const total = chats.get().reduce((sum, chat) => sum + (chat.unread || 0), 0)
    for (const badge of root.querySelectorAll('[data-nav="Inbox"] [data-nav-count]')) {
      badge.textContent = String(total)
      badge.classList.toggle('hidden', total === 0)
    }
  }

  function syncDeviceCount() {
    const total = 1 + linked.get().length
    const text = total === 1 ? 'This device' : `${total} linked devices`
    for (const node of root.querySelectorAll('[data-device-count]')) node.textContent = text
  }

  function syncTaskBadge() {
    const count = openTaskCount()
    for (const badge of root.querySelectorAll('[data-nav="Tasks"] [data-nav-count]')) {
      badge.textContent = String(count)
      badge.classList.toggle('hidden', count === 0)
    }
  }

  // Off-canvas drawers stay inert while closed so their controls are never
  // tabbable, and focus moves in on open / back to the trigger on close.
  let mobileWasOpen = false
  function applyMobile(open) {
    mobileOverlay.classList.toggle('hidden', !open)
    mobileNav.classList.toggle('-translate-x-full', !open)
    mobileNav.classList.toggle('translate-x-0', open)
    mobileNav.toggleAttribute('inert', !open)
    mobileNav.setAttribute('aria-hidden', String(!open))
    menuBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      mobileWasOpen = true
      mobileCloseBtn.focus()
    } else if (mobileWasOpen) {
      mobileWasOpen = false
      menuBtn.focus()
    }
  }

  let chatsWasOpen = false
  function applyChatDrawer(open) {
    chatOverlay.classList.toggle('hidden', !open)
    chatDrawer.classList.toggle('translate-x-full', !open)
    chatDrawer.classList.toggle('translate-x-0', open)
    chatDrawer.toggleAttribute('inert', !open)
    chatDrawer.setAttribute('aria-hidden', String(!open))
    chatsBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      chatsWasOpen = true
      chatCloseBtn.focus()
    } else if (chatsWasOpen) {
      chatsWasOpen = false
      chatsBtn.focus()
    }
  }

  let activeRegion = null
  function renderRegion() {
    activeRegion?.destroy?.()
    const view = REGIONS[activeNav.get()] ?? chatView
    region.innerHTML = view.html()
    activeRegion = view
    view.init?.(region)
  }

  function openAgentChat() {
    activeChat.set(AGENT_CHAT)
    activeNav.set('Inbox')
  }

  sidebar.addEventListener('click', (event) => {
    const target = event.target
    const button = target.closest('[data-role="collapse"], [data-nav], [data-nav-custom]')
    if (!button || !sidebar.contains(button)) return
    if (button.dataset.role === 'collapse') {
      sidebarCollapsed.set(!sidebarCollapsed.get())
      return
    }
    if (button.dataset.nav) {
      activeNav.set(button.dataset.nav)
      return
    }
    if (button.dataset.navCustom === 'agent') openAgentChat()
    else if (button.dataset.navCustom === 'devices') activeNav.set('Devices')
    else if (button.dataset.navCustom === 'auth') showAuth.set(true)
    else if (button.dataset.navCustom === 'settings') activeNav.set('Settings')
    else if (button.dataset.navCustom === 'link') connectDevice()
  })

  mobileNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav], [data-nav-custom]')
    if (!button) return
    mobileSidebarOpen.set(false)
    const custom = button.dataset.navCustom
    if (button.dataset.nav) activeNav.set(button.dataset.nav)
    else if (custom === 'agent') openAgentChat()
    else if (custom === 'devices') activeNav.set('Devices')
    else if (custom === 'auth') showAuth.set(true)
    else if (custom === 'settings') activeNav.set('Settings')
    else if (custom === 'link') connectDevice()
  })

  mobileOverlay.addEventListener('click', () => mobileSidebarOpen.set(false))
  mobileCloseBtn.addEventListener('click', () => mobileSidebarOpen.set(false))
  menuBtn.addEventListener('click', () => mobileSidebarOpen.set(true))

  chatsBtn.addEventListener('click', () => {
    mobileSidebarOpen.set(false)
    chatsDrawerOpen.set(true)
  })
  chatOverlay.addEventListener('click', () => chatsDrawerOpen.set(false))
  chatCloseBtn.addEventListener('click', () => chatsDrawerOpen.set(false))
  chatDrawer.addEventListener('click', (event) => {
    const chatBtn = event.target.closest('[data-chat]')
    if (chatBtn) {
      activeChat.set(chatBtn.dataset.chat ?? '')
      activeNav.set('Inbox')
      chatsDrawerOpen.set(false)
      return
    }
    if (event.target.closest('[data-nav-custom="devices"]')) {
      activeNav.set('Devices')
      chatsDrawerOpen.set(false)
    }
  })

  const chatList = root.querySelector('[data-chat-list]')
  chatList?.addEventListener('click', (event) => {
    const target = event.target
    const chatBtn = target.closest('[data-chat]')
    if (chatBtn) {
      activeChat.set(chatBtn.dataset.chat ?? '')
      activeNav.set('Inbox')
      return
    }
    const devicesBtn = target.closest('[data-nav-custom="devices"]')
    if (devicesBtn) activeNav.set('Devices')
    const newChatBtn = target.closest('[data-new-chat]')
    if (newChatBtn) activeNav.set('Contacts')
  })

  authModal.addEventListener('click', (event) => {
    const target = event.target
    if (target.closest('[data-auth-close]')) showAuth.set(false)
    else if (target.closest('[data-auth-lock]')) lockPasskey()
    else if (target.closest('[data-auth-platform], [data-auth-key]')) {
      if (passkey.get().enrolled) void unlockPasskey()
      else void enrollPasskey(PROFILE_NAME)
    }
  })

  // ---- link a device (device layer, Bluetooth-first) ----
  const linkBody = linkModal.querySelector('[data-link-body]')

  function linkDeviceCard(device) {
    return `<div class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3">
      ${icon(MonitorSmartphone, 'size-4 text-primary')}
      <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">${esc(device.name) || 'S device'}</p><p class="truncate font-mono text-[10px] text-muted-foreground">${esc(device.id)}</p></div>
      ${device.fingerprint ? `<span class="rounded-md bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">${esc(device.fingerprint)}</span>` : ''}
    </div>`
  }

  async function renderLinkBody() {
    const local = localDevice.get()
    const peers = linked.get()
    const state = pairState.get()
    if (!local) {
      linkBody.innerHTML = '<div class="text-sm text-muted-foreground">Initializing this device…</div>'
      return
    }
    const rows = [linkDeviceCard(local)]
    if (state === 'ready' && pairCode.get()) {
      rows.push(
        `<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
          <p class="text-[10px] uppercase tracking-[0.14em] text-emerald-600">Verify on both devices</p>
          <p class="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">${esc(pairCode.get())}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">fingerprint ${esc(pairFingerprint.get() ?? '')}</p>
        </div>`,
      )
    }
    if (state === 'error') {
      rows.push(`<div class="rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-600">${esc(pairError.get() ?? 'pairing failed')}</div>`)
    }
    rows.push(
      `<div class="flex flex-col gap-2">
        <button data-link-bt ${bluetoothAvailable() ? '' : 'disabled class="disabled:opacity-50 cursor-not-allowed"'} class="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">${bluetoothAvailable() ? 'Link via Bluetooth' : 'Web Bluetooth unavailable here'}</button>
        <div class="my-1 flex items-center gap-2 text-[10px] text-muted-foreground"><span class="h-px flex-1 bg-border"></span>or copy the payload<span class="h-px flex-1 bg-border"></span></div>
        <textarea data-link-payload rows="2" placeholder='Paste the other device payload (JSON like {"v":1,"id":…,"pub":…})' class="w-full resize-none rounded-xl border border-border bg-background p-2.5 font-mono text-[10px] outline-none placeholder:text-muted-foreground/60"></textarea>
        <button data-link-complete class="w-full rounded-xl border border-border bg-muted/40 py-2.5 text-sm font-medium text-foreground hover:bg-accent">Verify &amp; link</button>
      </div>`,
    )
    rows.push(
      peers.length
        ? `<div><p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Linked devices (${peers.length})</p><div class="flex flex-col gap-2">${peers.map((peer) => `<div class="flex items-center gap-2 rounded-xl border border-border bg-background p-2.5"><span class="size-2 rounded-full bg-emerald-500"></span><p class="min-w-0 flex-1 truncate text-xs font-medium">${esc(peer.name)}</p><p class="truncate font-mono text-[9px] text-muted-foreground">${esc(peer.id)}</p></div>`).join('')}</div></div>`
        : '',
    )
    linkBody.innerHTML = rows.join('')
  }

  async function submitPeerPayload() {
    const input = linkBody.querySelector('[data-link-payload]')
    const value = input?.value?.trim()
    if (!value) return
    try {
      await receivePeerPayload(value)
      input.value = ''
      renderLinkBody()
    } catch (error) {
      pairError.set(error instanceof Error ? error.message : String(error))
      pairState.set('error')
      renderLinkBody()
    }
  }

  linkModal.querySelector('[data-link-close]').addEventListener('click', () => showLink.set(false))
  linkModal.addEventListener('click', (event) => {
    const target = event.target
    if (target.closest('[data-link-bt]') && bluetoothAvailable()) {
      void pairViaBluetooth().then(renderLinkBody)
    } else if (target.closest('[data-link-complete]')) {
      void submitPeerPayload()
    }
  })
  linked.subscribe(() => {
    renderLinkBody()
    syncDeviceCount()
  })
  void initDevices()
    .then(renderLinkBody)
    .catch((error) => console.error('[S] device layer failed to initialize', error))

  window.addEventListener('keydown', (event) => {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
    if (key === 'b' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
      const target = event.target
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (!typing) {
        event.preventDefault()
        sidebarCollapsed.set(!sidebarCollapsed.get())
      }
      return
    }
    if (key === 'k' && (event.metaKey || event.ctrlKey)) {
      const searchInput = root.querySelector('[data-search]')
      if (searchInput) {
        event.preventDefault()
        searchInput.focus()
        searchInput.select()
      }
      return
    }
    if (event.key !== 'Escape') return
    const searchInput = root.querySelector('[data-search]')
    if (searchInput && document.activeElement === searchInput && searchTerm.get()) {
      searchTerm.set('')
      searchInput.value = ''
      renderChatRows()
      event.preventDefault()
      return
    }
    if (searchInput && document.activeElement === searchInput) {
      searchInput.blur()
      return
    }
    if (chatsDrawerOpen.get()) chatsDrawerOpen.set(false)
    else if (mobileSidebarOpen.get()) mobileSidebarOpen.set(false)
    else if (showLink.get()) showLink.set(false)
    else if (showAuth.get()) showAuth.set(false)
  })

  const searchInputEl = root.querySelector('[data-search]')
  searchInputEl?.addEventListener('input', () => {
    searchTerm.set(searchInputEl.value)
    renderChatRows()
  })
  searchInputEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const q = searchTerm.get().trim().toLowerCase()
    const match = chats.get().find((chat) => {
      if ((chat.name || '').toLowerCase().includes(q)) return true
      return threadFor(chat.name).some((m) => String(m.text ?? '').toLowerCase().includes(q))
    })
    if (match) {
      activeChat.set(match.name)
      activeNav.set('Inbox')
    }
  })

  sidebarCollapsed.subscribe(applyCollapsed)
  mobileSidebarOpen.subscribe(applyMobile)
  chatsDrawerOpen.subscribe(applyChatDrawer)
  agentModel.subscribe((state) => {
    const text = agentPreviewText(state)
    for (const node of root.querySelectorAll('[data-agent-preview]')) node.textContent = text
  })
  showLink.subscribe((visible) => {
    linkModal.classList.toggle('hidden', !visible)
    if (visible) void renderLinkBody()
  })
  showAuth.subscribe((visible) => {
    authModal.classList.toggle('hidden', !visible)
    if (visible) renderAuth(authModal)
  })
  passkey.subscribe(() => {
    if (!authModal.classList.contains('hidden')) renderAuth(authModal)
  })
  chats.subscribe(() => {
    renderChatRows()
    syncChatList()
    syncInboxBadge()
  })
  taskList.subscribe(syncTaskBadge)
  completedTasks.subscribe(syncTaskBadge)
  syncTaskBadge()
  void initContacts().catch((error) => console.error('[S] contacts failed to initialize', error))
  activeChat.subscribe(syncChatList)
  // subscribe() fires immediately, so this is also the initial render.
  activeNav.subscribe(() => {
    syncNav()
    renderRegion()
  })
}