import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  Contact,
  Fingerprint,
  GalleryHorizontalEnd,
  KeyRound,
  Link2,
  ListTodo,
  LockKeyhole,
  Menu,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  QrCode,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from '../vendor/icons.js'
import { avatar, esc, icon } from '../dom.js'
import { AGENT_CHAT, chats } from '../chats.js'
import { agentModel, agentPreviewText } from '../agent/model.js'
import { chatView } from './chat.js'
import { calendarView, contactsView, galleryView, tasksView, timelineView } from './panels.js'
import { devicesView } from './devices.js'
import {
  activeChat,
  activeNav,
  chatsDrawerOpen,
  mobileSidebarOpen,
  sidebarCollapsed,
  showAuth,
  showLink,
} from '../store.js'

const navItems = [
  { label: 'Inbox', icon: MessageCircle, count: 3 },
  { label: 'Contacts', icon: Contact },
  { label: 'Devices', icon: MonitorSmartphone },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Tasks', icon: ListTodo, count: 4 },
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
}

async function connectDevice() {
  try {
    if (!('bluetooth' in navigator)) throw new Error('WebBluetooth is unavailable in this browser')
    await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    showLink.set(true)
  } catch {
    showLink.set(true)
  }
}

async function authenticate() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('WebAuthn is unavailable in this browser')
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    await navigator.credentials.get({
      publicKey: { challenge, rpId: window.location.hostname, userVerification: 'required', timeout: 60000 },
    })
    showAuth.set(false)
  } catch {
    showAuth.set(false)
  }
}

function navButton(item) {
  const active = item.label === activeNav.get()
  return `<button data-nav="${esc(item.label)}" data-side-row="btn" data-side-title="${esc(item.label)}" class="flex items-center gap-3 rounded-xl py-2.5 text-sm transition-colors px-3 ${
    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }">
    ${icon(item.icon)}
    <span data-side-hide>${esc(item.label)}</span>
    ${item.count ? `<span data-nav-count data-side-hide class="ml-auto rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-background text-muted-foreground'}">${item.count}</span>` : ''}
  </button>`
}

function mobileNavButton(item) {
  const active = item.label === activeNav.get()
  return `<button data-nav="${esc(item.label)}" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }">
    ${icon(item.icon)}
    <span>${esc(item.label)}</span>
    ${item.count ? `<span class="ml-auto rounded-full bg-background/70 px-1.5 text-[10px]">${item.count}</span>` : ''}
  </button>`
}

function bottomButton(label, custom, iconNode) {
  return `<button data-nav-custom="${custom}" data-side-row="btn" data-side-title="${esc(label)}" class="flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground px-3">
    ${icon(iconNode)}
    <span data-side-hide>${esc(label)}</span>
  </button>`
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

        <aside data-desktop-sidebar aria-label="Sidebar" class="hidden shrink-0 flex-col border-r border-border bg-muted/30 p-3 transition-[width] duration-200 md:flex w-[236px]">
          <div data-side-row="logo" class="mb-8 flex items-center gap-2 px-2">
            <div class="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">${icon(LockKeyhole)}</div>
            <span data-side-hide class="text-[17px] font-semibold tracking-tight">S<span class="text-muted-foreground">/</span></span>
          </div>
          <div data-side-row="profile" data-side-title="Alex Rivera · Personal space" class="mb-5 flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            ${avatar('AR', 'bg-cyan-200 text-cyan-900', true)}
            <div data-side-hide class="min-w-0">
              <p class="truncate text-sm font-semibold">Alex Rivera</p>
              <p class="text-[11px] text-muted-foreground">Personal space</p>
            </div>
            ${icon(ChevronDown, 'ml-auto size-3.5 text-muted-foreground', 'data-side-hide')}
          </div>
          <nav class="flex flex-col gap-1" aria-label="Main navigation" data-nav-root="desktop">
            ${navItems.map(navButton).join('')}
          </nav>
          <div class="mt-auto flex flex-col gap-1">
            <button data-role="collapse" data-side-row="btn" aria-label="Collapse sidebar" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              ${icon(Menu)}
              <span data-side-hide>Collapse sidebar</span>
            </button>
            ${bottomButton('S agent', 'agent', Sparkles)}
            ${bottomButton('Devices', 'devices', MonitorSmartphone)}
            ${bottomButton('Passkeys', 'auth', Fingerprint)}
            ${bottomButton('Link a device', 'link', Link2)}
            ${bottomButton('Settings', '', Settings2)}
            <div data-side-hide class="mt-3 flex items-center gap-2 border-t border-border px-2 pt-4 text-[11px] text-muted-foreground">${icon(ShieldCheck, 'size-3.5 text-emerald-600')}End-to-end encrypted</div>
          </div>
        </aside>

        <div data-mobile-overlay class="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm md:hidden hidden"></div>
        <aside data-mobile-sidebar aria-label="Mobile navigation" data-nav-root="mobile" class="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] flex-col border-r border-border bg-card p-4 shadow-2xl transition-transform duration-200 md:hidden -translate-x-full">
          <div class="mb-8 flex items-center justify-between">
            <div class="flex items-center gap-2"><div class="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">${icon(LockKeyhole)}</div><span class="text-[17px] font-semibold tracking-tight">S<span class="text-muted-foreground">/</span></span></div>
            <button data-mobile-close aria-label="Close navigation" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <nav class="flex flex-col gap-1" aria-label="Mobile main navigation">
            ${navItems.map(mobileNavButton).join('')}
          </nav>
          <div class="mt-auto border-t border-border pt-4">
            <button data-nav-custom="agent" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">${icon(Sparkles)}<span>S agent</span></button>
            <button data-nav-custom="link" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">${icon(Link2)}<span>Link a device</span></button>
            <div class="mt-3 flex items-center gap-2 px-3 text-[11px] text-muted-foreground">${icon(ShieldCheck, 'size-3.5 text-emerald-600')}End-to-end encrypted</div>
          </div>
        </aside>

        <section class="flex min-h-0 min-w-0 flex-1 flex-col">
          <header class="flex h-[72px] items-center justify-between border-b border-border px-4 sm:px-6">
            <div class="flex items-center gap-3">
              <button data-role="menu" aria-label="Open navigation" class="rounded-lg p-2 hover:bg-accent md:hidden">${icon(Menu, 'size-5')}</button>
              <div><p id="header-overline" class="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">${esc(activeNav.get())}</p><h1 class="text-lg font-semibold tracking-tight">Good morning, Alex</h1></div>
            </div>
            <div class="flex items-center gap-2">
              <button data-role="chats" aria-label="Open chats" class="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-accent lg:hidden">${icon(MessageCircle, 'size-3.5')}<span class="hidden sm:inline">Chats</span></button>
              <button class="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:flex">${icon(Search, 'size-3.5')}Search <kbd class="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
              <button class="relative rounded-xl p-2.5 text-muted-foreground hover:bg-accent">${icon(Bell)}<span class="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500"></span></button>
              ${avatar('AR', 'bg-cyan-200 text-cyan-900', false, true)}
            </div>
          </header>

          <div class="flex min-h-0 flex-1">
            <div data-chat-list class="hidden w-[268px] shrink-0 flex-col border-r border-border lg:flex lg:min-h-0">
              <div class="flex items-center justify-between px-4 py-4"><p class="text-sm font-semibold">Recent chats</p><button class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(Plus)}</button></div>
              <div class="flex-1 overflow-y-auto px-2"><div class="flex flex-col gap-1">
                ${chats.map(chatButton).join('')}
              </div></div>
              <div class="mx-4 mt-8 shrink-0 rounded-2xl border border-border bg-muted/40 p-3">
                <div class="mb-2 flex items-center gap-2 text-xs font-medium">${icon(Wifi, 'size-3.5 text-emerald-600')}&#160;2 devices synced</div>
                <p class="text-[11px] leading-relaxed text-muted-foreground">Your messages, files and calls stay yours. No passwords. No third-party account.</p>
                <button data-nav-custom="devices" class="mt-3 text-[11px] font-medium text-foreground underline underline-offset-4">Manage devices</button>
              </div>
            </div>

            <div data-role="region" class="flex min-h-0 flex-1"></div>
          </div>
        </section>

      </div>

      <div data-chat-overlay class="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm hidden lg:hidden"></div>
      <aside data-chat-drawer aria-label="Recent chats" class="fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-[320px] flex-col border-l border-border bg-card p-4 shadow-2xl transition-transform duration-200 translate-x-full lg:hidden">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm font-semibold">Recent chats</p>
          <button data-chat-close aria-label="Close chats" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
        </div>
        <div class="flex-1 overflow-y-auto"><div class="flex flex-col gap-1">
          ${chats.map(chatButton).join('')}
        </div></div>
        <button data-nav-custom="devices" class="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-left text-[11px] text-muted-foreground hover:bg-accent">
          <span class="flex items-center gap-2 text-xs font-medium text-foreground">${icon(Wifi, 'size-3.5 text-emerald-600')}2 devices synced</span>
          <span class="mt-1 block">Your messages, files and calls stay yours.</span>
        </button>
      </aside>

      <div data-modal="auth" class="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm hidden">
        <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div><p class="text-lg font-semibold">Passwordless sign-in</p><p class="mt-1 text-sm text-muted-foreground">Use a passkey stored on this device.</p></div>
            <button data-auth-close aria-label="Close passkeys" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <div class="mt-6 flex flex-col gap-3">
            <button data-auth-platform class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-left hover:bg-accent">${icon(Fingerprint, 'size-5 text-primary')}<span><span class="block text-sm font-medium">Fingerprint or Face ID</span><span class="block text-xs text-muted-foreground">WebAuthn platform authenticator</span></span></button>
            <button data-auth-key class="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-left hover:bg-accent">${icon(KeyRound, 'size-5 text-primary')}<span><span class="block text-sm font-medium">Security key or authenticator</span><span class="block text-xs text-muted-foreground">Use a hardware key or another device</span></span></button>
          </div>
          <p class="mt-5 text-center text-[10px] text-muted-foreground">No password stored · Credential stays on your device</p>
        </div>
      </div>

      <div data-modal="link" class="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm hidden">
        <div role="dialog" aria-modal="true" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div><p class="text-lg font-semibold">Link a device</p><p class="mt-1 text-sm text-muted-foreground">Use your phone to securely add another device.</p></div>
            <button data-link-close aria-label="Close link device" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <div class="mx-auto my-7 grid size-44 place-items-center rounded-2xl border-8 border-muted bg-background">${icon(QrCode, 'size-28 text-foreground')}</div>
          <div class="rounded-xl bg-muted/50 p-3 text-center text-xs text-muted-foreground">${icon(KeyRound, 'mx-auto mb-2 size-4 text-emerald-600')}This code expires in 04:58 and can only be used once.</div>
          <button data-link-scan class="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">Scan with phone</button>
          <p class="mt-3 text-center text-[10px] text-muted-foreground">WebBluetooth handshake · Forward secrecy enabled</p>
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

  function applyCollapsed(collapsed) {
    sidebar.classList.toggle('w-[72px]', collapsed)
    sidebar.classList.toggle('w-[236px]', !collapsed)
    for (const node of sidebar.querySelectorAll('[data-side-row="logo"]')) {
      node.classList.toggle('justify-center', collapsed)
      node.classList.toggle('px-2', !collapsed)
    }
    for (const node of sidebar.querySelectorAll('[data-side-row="profile"]')) {
      node.classList.toggle('justify-center', collapsed)
    }
    for (const node of sidebar.querySelectorAll('[data-side-row="btn"]')) {
      node.classList.toggle('justify-center', collapsed)
      node.classList.toggle('px-2', collapsed)
      node.classList.toggle('px-3', !collapsed)
    }
    for (const node of sidebar.querySelectorAll('[data-side-hide]')) {
      node.classList.toggle('hidden', collapsed)
    }
    for (const node of sidebar.querySelectorAll('[data-side-title]')) {
      node.title = collapsed ? (node.dataset.sideTitle ?? '') : ''
    }
    const collapseBtn = sidebar.querySelector('[data-role="collapse"]')
    if (collapseBtn) {
      const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
      collapseBtn.title = label
      collapseBtn.setAttribute('aria-label', label)
    }
  }

  function syncNav() {
    const current = activeNav.get()
    for (const btn of document.querySelectorAll('[data-nav]')) {
      const active = btn.dataset.nav === current
      const isMobile = btn.closest('[data-nav-root="mobile"]') != null
      btn.classList.toggle('bg-primary', active)
      btn.classList.toggle('text-primary-foreground', active)
      btn.classList.toggle('shadow-sm', !isMobile && active)
      btn.classList.toggle('text-muted-foreground', !active)
      btn.classList.toggle('hover:bg-accent', !active)
      btn.classList.toggle('hover:text-foreground', !active)
      const badge = btn.querySelector('[data-nav-count]')
      if (badge && !isMobile) {
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
    for (const btn of document.querySelectorAll('[data-chat]')) {
      const active = btn.dataset.chat === current
      btn.classList.toggle('bg-accent', active)
      btn.classList.toggle('hover:bg-muted/60', !active)
    }
  }

  function applyMobile(open) {
    mobileOverlay.classList.toggle('hidden', !open)
    mobileNav.classList.toggle('-translate-x-full', !open)
    mobileNav.classList.toggle('translate-x-0', open)
  }

  const chatOverlay = root.querySelector('[data-chat-overlay]')
  const chatDrawer = root.querySelector('[data-chat-drawer]')

  function applyChatDrawer(open) {
    chatOverlay.classList.toggle('hidden', !open)
    chatDrawer.classList.toggle('translate-x-full', !open)
    chatDrawer.classList.toggle('translate-x-0', open)
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
    else if (button.dataset.navCustom === 'link') void connectDevice()
  })

  mobileNav.addEventListener('click', (event) => {
    const target = event.target
    const button = target.closest('[data-nav], [data-nav-custom]')
    if (!button) return
    const custom = button.dataset.navCustom
    if (button.dataset.nav || custom === 'agent' || custom === 'link') mobileSidebarOpen.set(false)
    if (button.dataset.nav) activeNav.set(button.dataset.nav)
    else if (custom === 'agent') openAgentChat()
    else if (custom === 'link') void connectDevice()
  })

  mobileOverlay.addEventListener('click', () => mobileSidebarOpen.set(false))
  mobileNav.querySelector('[data-mobile-close]').addEventListener('click', () => mobileSidebarOpen.set(false))
  root.querySelector('[data-role="menu"]').addEventListener('click', () => mobileSidebarOpen.set(true))

  root.querySelector('[data-role="chats"]').addEventListener('click', () => {
    mobileSidebarOpen.set(false)
    chatsDrawerOpen.set(true)
  })
  chatOverlay.addEventListener('click', () => chatsDrawerOpen.set(false))
  chatDrawer.querySelector('[data-chat-close]').addEventListener('click', () => chatsDrawerOpen.set(false))
  chatDrawer.addEventListener('click', (event) => {
    const chatBtn = event.target.closest('[data-chat]')
    if (!chatBtn) return
    activeChat.set(chatBtn.dataset.chat ?? '')
    activeNav.set('Inbox')
    chatsDrawerOpen.set(false)
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
  })

  authModal.querySelector('[data-auth-close]').addEventListener('click', () => showAuth.set(false))
  authModal.querySelector('[data-auth-key]').addEventListener('click', () => showAuth.set(false))
  authModal.querySelector('[data-auth-platform]').addEventListener('click', () => void authenticate())

  linkModal.querySelector('[data-link-close]').addEventListener('click', () => showLink.set(false))
  linkModal.querySelector('[data-link-scan]').addEventListener('click', () => showLink.set(false))

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (chatsDrawerOpen.get()) chatsDrawerOpen.set(false)
    else if (mobileSidebarOpen.get()) mobileSidebarOpen.set(false)
    else if (showLink.get()) showLink.set(false)
    else if (showAuth.get()) showAuth.set(false)
  })

  sidebarCollapsed.subscribe(applyCollapsed)
  mobileSidebarOpen.subscribe(applyMobile)
  chatsDrawerOpen.subscribe(applyChatDrawer)
  agentModel.subscribe((state) => {
    const preview = chatList?.querySelector('[data-agent-preview]')
    if (preview) preview.textContent = agentPreviewText(state)
  })
  showLink.subscribe((visible) => linkModal.classList.toggle('hidden', !visible))
  showAuth.subscribe((visible) => authModal.classList.toggle('hidden', !visible))
  activeChat.subscribe(syncChatList)
  activeNav.subscribe((nav) => {
    syncNav()
    renderRegion()
  })

  applyCollapsed(sidebarCollapsed.get())
  renderRegion()
}