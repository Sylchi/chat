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
  Zap,
} from 'lucide'
import { avatar, esc, icon, type View } from '../dom'
import { chatView } from './chat'
import { calendarView, contactsView, galleryView, tasksView, timelineView } from './panels'
import { devicesView } from './devices'
import {
  activeChat,
  activeNav,
  mobileSidebarOpen,
  sidebarCollapsed,
  showAgent,
  showAuth,
  showLink,
} from '../store'

const navItems = [
  { label: 'Inbox', icon: MessageCircle, count: 3 },
  { label: 'Contacts', icon: Contact },
  { label: 'Devices', icon: MonitorSmartphone },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Tasks', icon: ListTodo, count: 4 },
  { label: 'Gallery', icon: GalleryHorizontalEnd },
  { label: 'Timeline', icon: Clock3 },
]

const chats = [
  { name: 'Maya Chen', initials: 'MC', color: 'bg-amber-200 text-amber-900', text: 'The new photos are beautiful', time: '10:42', unread: 2, online: true },
  { name: 'Design crew', initials: 'DC', color: 'bg-violet-200 text-violet-900', text: 'You: Sent the final deck', time: '09:18', unread: 0, online: false },
  { name: 'Jordan Blake', initials: 'JB', color: 'bg-sky-200 text-sky-900', text: 'Video call · 23 min', time: 'Yesterday', unread: 0, online: false },
  { name: 'Saved messages', initials: 'SM', color: 'bg-muted text-muted-foreground', text: 'Your private notes', time: '', unread: 0, online: false },
]

const REGIONS: Record<string, View> = {
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

function navButton(item: (typeof navItems)[number]) {
  const active = item.label === activeNav.get()
  return `<button data-nav="${esc(item.label)}" data-side-row="btn" data-side-title="${esc(item.label)}" class="flex items-center gap-3 rounded-xl py-2.5 text-sm transition-colors px-3 ${
    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }">
    ${icon(item.icon)}
    <span data-side-hide>${esc(item.label)}</span>
    ${item.count ? `<span data-nav-count data-side-hide class="ml-auto rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-background text-muted-foreground'}">${item.count}</span>` : ''}
  </button>`
}

function mobileNavButton(item: (typeof navItems)[number]) {
  const active = item.label === activeNav.get()
  return `<button data-nav="${esc(item.label)}" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  }">
    ${icon(item.icon)}
    <span>${esc(item.label)}</span>
    ${item.count ? `<span class="ml-auto rounded-full bg-background/70 px-1.5 text-[10px]">${item.count}</span>` : ''}
  </button>`
}

function bottomButton(label: string, custom: string, iconNode: (typeof navItems)[number]['icon']) {
  return `<button data-nav-custom="${custom}" data-side-row="btn" data-side-title="${esc(label)}" class="flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground px-3">
    ${icon(iconNode)}
    <span data-side-hide>${esc(label)}</span>
  </button>`
}

function chatButton(chat: (typeof chats)[number]) {
  const active = chat.name === activeChat.get()
  return `<button data-chat="${esc(chat.name)}" class="flex items-center gap-3 rounded-xl p-3 text-left ${active ? 'bg-accent' : 'hover:bg-muted/60'}">
    ${avatar(chat.initials, chat.color, chat.online)}
    <span class="min-w-0 flex-1">
      <span class="flex items-center justify-between gap-2"><span class="truncate text-sm font-medium">${esc(chat.name)}</span><span class="text-[10px] text-muted-foreground">${esc(chat.time)}</span></span>
      <span class="flex items-center justify-between gap-2"><span class="truncate text-xs text-muted-foreground">${esc(chat.text)}</span>${chat.unread > 0 ? `<span class="grid size-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">${chat.unread}</span>` : ''}</span>
    </span>
  </button>`
}

export function initWorkspace(root: HTMLElement) {
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

        <aside id="agent-rail" class="hidden min-h-0 w-[284px] shrink-0 border-l border-border bg-muted/20 xl:flex xl:flex-col">
          <div class="flex items-center justify-between border-b border-border px-5 py-5">
            <div class="flex items-center gap-2">
              <div class="grid size-8 place-items-center rounded-xl bg-violet-100 text-violet-700">${icon(Sparkles)}</div>
              <div><p class="text-sm font-semibold">S agent</p><p class="text-[10px] text-emerald-600">Running locally · WebGPU</p></div>
            </div>
            <button data-agent-close class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
          </div>
          <div class="flex-1 overflow-y-auto p-5">
            <div class="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 p-4 dark:from-violet-950/30 dark:to-indigo-950/30">
              <p class="text-sm font-medium leading-relaxed">“I’m here whenever you need me. Your data never leaves this device.”</p>
              <div class="mt-3 flex items-center gap-1.5 text-[10px] text-violet-700 dark:text-violet-300">${icon(Zap, 'size-3')}Private by design</div>
            </div>
            <p class="mb-3 mt-7 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suggested for you</p>
            <div class="flex flex-col gap-2">
              <button class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent">${icon(CalendarDays, 'size-4 text-muted-foreground')}<span><span class="block font-medium">Plan my week</span><span class="text-[10px] text-muted-foreground">Organize your calendar</span></span></button>
              <button class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent">${icon(ListTodo, 'size-4 text-muted-foreground')}<span><span class="block font-medium">Triage my tasks</span><span class="text-[10px] text-muted-foreground">4 items need attention</span></span></button>
              <button class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent">${icon(GalleryHorizontalEnd, 'size-4 text-muted-foreground')}<span><span class="block font-medium">Find a memory</span><span class="text-[10px] text-muted-foreground">Search your timeline</span></span></button>
            </div>
          </div>
          <div class="border-t border-border p-5"><button class="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-xs font-medium hover:bg-accent">${icon(MessageCircle, 'size-3.5')}Ask S anything</button></div>
        </aside>
      </div>

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

  const sidebar = root.querySelector<HTMLElement>('[data-desktop-sidebar]')!
  const region = root.querySelector<HTMLElement>('[data-role="region"]')!
  const agentRail = root.querySelector<HTMLElement>('#agent-rail')!
  const authModal = root.querySelector<HTMLElement>('[data-modal="auth"]')!
  const linkModal = root.querySelector<HTMLElement>('[data-modal="link"]')!
  const mobileNav = root.querySelector<HTMLElement>('[data-mobile-sidebar]')!
  const mobileOverlay = root.querySelector<HTMLElement>('[data-mobile-overlay]')!

  function applyCollapsed(collapsed: boolean) {
    sidebar.classList.toggle('w-[72px]', collapsed)
    sidebar.classList.toggle('w-[236px]', !collapsed)
    for (const node of sidebar.querySelectorAll<HTMLElement>('[data-side-row="logo"]')) {
      node.classList.toggle('justify-center', collapsed)
      node.classList.toggle('px-2', !collapsed)
    }
    for (const node of sidebar.querySelectorAll<HTMLElement>('[data-side-row="profile"]')) {
      node.classList.toggle('justify-center', collapsed)
    }
    for (const node of sidebar.querySelectorAll<HTMLElement>('[data-side-row="btn"]')) {
      node.classList.toggle('justify-center', collapsed)
      node.classList.toggle('px-2', collapsed)
      node.classList.toggle('px-3', !collapsed)
    }
    for (const node of sidebar.querySelectorAll<HTMLElement>('[data-side-hide]')) {
      node.classList.toggle('hidden', collapsed)
    }
    for (const node of sidebar.querySelectorAll<HTMLElement>('[data-side-title]')) {
      node.title = collapsed ? (node.dataset.sideTitle ?? '') : ''
    }
    const collapseBtn = sidebar.querySelector<HTMLButtonElement>('[data-role="collapse"]')
    if (collapseBtn) {
      const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
      collapseBtn.title = label
      collapseBtn.setAttribute('aria-label', label)
    }
  }

  function syncNav() {
    const current = activeNav.get()
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-nav]')) {
      const active = btn.dataset.nav === current
      const isMobile = btn.closest('[data-nav-root="mobile"]') != null
      btn.classList.toggle('bg-primary', active)
      btn.classList.toggle('text-primary-foreground', active)
      btn.classList.toggle('shadow-sm', !isMobile && active)
      btn.classList.toggle('text-muted-foreground', !active)
      btn.classList.toggle('hover:bg-accent', !active)
      btn.classList.toggle('hover:text-foreground', !active)
      const badge = btn.querySelector<HTMLElement>('[data-nav-count]')
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
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-chat]')) {
      const active = btn.dataset.chat === current
      btn.classList.toggle('bg-accent', active)
      btn.classList.toggle('hover:bg-muted/60', !active)
    }
    const title = document.getElementById('chat-title')
    if (title) title.textContent = current
  }

  function applyMobile(open: boolean) {
    mobileOverlay.classList.toggle('hidden', !open)
    mobileNav.classList.toggle('-translate-x-full', !open)
    mobileNav.classList.toggle('translate-x-0', open)
  }

  let activeRegion: View | null = null
  function renderRegion() {
    activeRegion?.destroy?.()
    const view = REGIONS[activeNav.get()] ?? chatView
    region.innerHTML = view.html()
    activeRegion = view
    view.init?.(region)
  }

  sidebar.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLElement>('[data-role="collapse"], [data-nav], [data-nav-custom]')
    if (!button || !sidebar.contains(button)) return
    if (button.dataset.role === 'collapse') {
      sidebarCollapsed.set(!sidebarCollapsed.get())
      return
    }
    if (button.dataset.nav) {
      activeNav.set(button.dataset.nav)
      return
    }
    if (button.dataset.navCustom === 'devices') activeNav.set('Devices')
    else if (button.dataset.navCustom === 'auth') showAuth.set(true)
    else if (button.dataset.navCustom === 'link') void connectDevice()
  })

  mobileNav.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLElement>('[data-nav], [data-nav-custom]')
    if (!button) return
    const custom = button.dataset.navCustom
    if (button.dataset.nav || custom === 'link') mobileSidebarOpen.set(false)
    if (button.dataset.nav) activeNav.set(button.dataset.nav)
    else if (custom === 'link') void connectDevice()
  })

  mobileOverlay.addEventListener('click', () => mobileSidebarOpen.set(false))
  mobileNav.querySelector('[data-mobile-close]')!.addEventListener('click', () => mobileSidebarOpen.set(false))
  root.querySelector('[data-role="menu"]')!.addEventListener('click', () => mobileSidebarOpen.set(true))

  const chatList = root.querySelector('[data-chat-list]')
  chatList?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const chatBtn = target.closest<HTMLElement>('[data-chat]')
    if (chatBtn) {
      activeChat.set(chatBtn.dataset.chat ?? '')
      return
    }
    const devicesBtn = target.closest<HTMLElement>('[data-nav-custom="devices"]')
    if (devicesBtn) activeNav.set('Devices')
  })

  agentRail.querySelector('[data-agent-close]')!.addEventListener('click', () => showAgent.set(false))

  authModal.querySelector('[data-auth-close]')!.addEventListener('click', () => showAuth.set(false))
  authModal.querySelector('[data-auth-key]')!.addEventListener('click', () => showAuth.set(false))
  authModal.querySelector('[data-auth-platform]')!.addEventListener('click', () => void authenticate())

  linkModal.querySelector('[data-link-close]')!.addEventListener('click', () => showLink.set(false))
  linkModal.querySelector('[data-link-scan]')!.addEventListener('click', () => showLink.set(false))

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (mobileSidebarOpen.get()) mobileSidebarOpen.set(false)
    else if (showLink.get()) showLink.set(false)
    else if (showAuth.get()) showAuth.set(false)
  })

  sidebarCollapsed.subscribe(applyCollapsed)
  mobileSidebarOpen.subscribe(applyMobile)
  showAgent.subscribe((visible) => agentRail.classList.toggle('hidden', !visible))
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