import { CheckCircle2, MonitorSmartphone, RefreshCw, Usb } from 'lucide'
import type { IconNode } from 'lucide'
import { esc, icon, type View } from '../dom'
import { CATEGORY_ORDER, detectAll, type Capability, type DeviceCard, type ScanResult } from '../lib/detect'

function sectionHeading(title: string, meta?: string) {
  return `<div class="mb-3 flex flex-wrap items-center gap-2"><h3 class="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">${esc(title)}</h3>${
    meta ? `<span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">${esc(meta)}</span>` : ''
  }</div>`
}

function statTile(label: string, value: string, iconNode: IconNode) {
  return `<div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><div class="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">${icon(iconNode, 'size-4.5 text-muted-foreground')}</div><div class="min-w-0"><p class="text-lg font-semibold leading-tight">${esc(value)}</p><p class="text-xs text-muted-foreground">${esc(label)}</p></div></div>`
}

function deviceCard(device: DeviceCard, wide = false) {
  return `<article class="rounded-2xl border border-border bg-card p-4 ${wide ? 'sm:col-span-2' : ''}">
    <div class="flex items-start gap-3">
      <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">${icon(device.icon, 'size-4 text-muted-foreground')}</div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h4 class="truncate text-sm font-semibold">${esc(device.title)}</h4>
          ${device.badge ? `<span class="rounded-full px-2 py-1 text-[10px] ${device.badge.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}">${esc(device.badge.text)}</span>` : ''}
        </div>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">${esc(device.subtitle)}</p>
        <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
          ${device.meta.map((entry) => `<div class="min-w-0"><dt class="text-muted-foreground">${esc(entry.label)}</dt><dd class="truncate font-medium">${esc(entry.value)}</dd></div>`).join('')}
        </dl>
      </div>
    </div>
  </article>`
}

function capabilityCard(capability: Capability) {
  return `<div class="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-3">
    <span class="mt-1.5 size-2 shrink-0 rounded-full ${capability.supported ? 'bg-emerald-500' : 'bg-rose-400/60'}"></span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium">${esc(capability.name)}</p>
      <p class="mt-0.5 text-[11px] ${capability.supported ? 'text-muted-foreground' : 'text-rose-500/80'}">${esc(capability.detail ?? (capability.supported ? 'Supported' : 'Not supported in this browser'))}</p>
    </div>
  </div>`
}

function renderContent(result: ScanResult) {
  const current = result.devices.find((device) => device.id === 'current')
  const peripherals = result.devices.filter((device) => device.id !== 'current')
  const capabilities = result.capabilities
  const supportedCount = capabilities.filter((capability) => capability.supported).length
  const groups = capabilities.reduce<Record<string, Capability[]>>((acc, capability) => {
    ;(acc[capability.category] ??= []).push(capability)
    return acc
  }, {})
  const orderedCategories = CATEGORY_ORDER.filter((category) => groups[category]?.length)

  return `
    <div class="flex flex-col gap-7">
      <div class="grid gap-3 sm:grid-cols-3">
        ${statTile('Devices detected', String(result.devices.length), MonitorSmartphone)}
        ${statTile('Capabilities supported', `${supportedCount}/${capabilities.length}`, CheckCircle2)}
        ${statTile('Peripherals', String(peripherals.length), Usb)}
      </div>

      <section>
        ${sectionHeading('This device', current?.subtitle)}
        <div class="grid gap-3">
          ${current ? deviceCard(current, true) : '<div class="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Device details unavailable.</div>'}
        </div>
      </section>

      <section>
        ${sectionHeading('Connected peripherals', `${peripherals.length} detected`)}
        ${peripherals.length
          ? `<div class="grid gap-3 sm:grid-cols-2">${peripherals.map((device) => deviceCard(device)).join('')}</div>`
          : `<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
              ${icon(MonitorSmartphone, 'mx-auto size-5 text-muted-foreground')}
              <p class="mt-2 text-sm font-medium">No peripherals detected yet</p>
              <p class="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">Plug in a camera, headset, or gamepad and hit Rescan. Browsers only reveal hardware you grant permission for — USB, serial, HID, and Bluetooth devices appear here after you pair them once.</p>
            </div>`}
      </section>

      <section>
        ${sectionHeading('Web capabilities', capabilities.length ? `${supportedCount} of ${capabilities.length} supported` : undefined)}
        <div class="flex flex-col gap-5">
          ${orderedCategories
            .map((category) => {
              const items = groups[category]
              const categorySupported = items.filter((capability) => capability.supported).length
              return `<div>
                ${sectionHeading(category, `${categorySupported}/${items.length}`)}
                <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  ${items.map(capabilityCard).join('')}
                </div>
              </div>`
            })
            .join('')}
        </div>
      </section>
    </div>`
}

const state: {
  scanning: boolean
  result: ScanResult | null
  scannedAt: Date | null
  cleanups: Array<() => void>
} = { scanning: true, result: null, scannedAt: null, cleanups: [] }

export const devicesView: View = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Detected in this browser</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Devices</h2>
          <p class="mt-1 text-sm text-muted-foreground">Every device and web capability this browser can see right now.</p>
          <p id="dev-scanned-at" class="mt-1 text-[11px] text-muted-foreground"></p>
        </div>
        <button id="dev-scan" class="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60">
          <span id="dev-scan-icon">${icon(RefreshCw, 'size-3.5')}</span>
          <span id="dev-scan-label">Scanning…</span>
        </button>
      </div>
      <div id="dev-loading" class="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        ${icon(RefreshCw, 'size-4 animate-spin')} Probing this browser for hardware and web capabilities…
      </div>
      <div id="dev-content"></div>
    </div>`,
  init: (root) => {
    const scanBtn = root.querySelector<HTMLButtonElement>('#dev-scan')!
    const scanIcon = root.querySelector<HTMLElement>('#dev-scan-icon')!
    const scanLabel = root.querySelector<HTMLElement>('#dev-scan-label')!
    const loading = root.querySelector<HTMLElement>('#dev-loading')!
    const content = root.querySelector<HTMLElement>('#dev-content')!
    const scannedAt = root.querySelector<HTMLElement>('#dev-scanned-at')!

    const render = () => {
      scanBtn.disabled = state.scanning
      scanIcon.innerHTML = icon(RefreshCw, `size-3.5 ${state.scanning ? 'animate-spin' : ''}`)
      scanLabel.textContent = state.scanning ? 'Scanning…' : 'Rescan'
      loading.classList.toggle('hidden', state.result !== null)
      scannedAt.textContent = state.scannedAt
        ? `Last scan ${state.scannedAt.toLocaleTimeString()} · re-scans when hardware is plugged in or paired`
        : ''
      content.innerHTML = state.result ? renderContent(state.result) : ''
    }

    const runScan = async () => {
      state.scanning = true
      render()
      try {
        state.result = await detectAll()
        state.scannedAt = new Date()
      } catch {
        state.result = { capabilities: [], devices: [] }
      } finally {
        state.scanning = false
        if (content.isConnected) render()
      }
    }

    const refresh = () => {
      void runScan()
    }

    scanBtn.addEventListener('click', refresh)
    window.addEventListener('gamepadconnected', refresh)
    window.addEventListener('gamepaddisconnected', refresh)
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)

    state.cleanups.push(() => {
      scanBtn.removeEventListener('click', refresh)
      window.removeEventListener('gamepadconnected', refresh)
      window.removeEventListener('gamepaddisconnected', refresh)
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    })

    void runScan()
  },
  destroy: () => {
    for (const cleanup of state.cleanups) cleanup()
    state.cleanups = []
    state.result = null
  },
}