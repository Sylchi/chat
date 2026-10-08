'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Cable,
  Camera,
  CheckCircle2,
  Cpu,
  Gamepad2,
  Headphones,
  Keyboard,
  Mic,
  MonitorSmartphone,
  RefreshCw,
  Speaker,
  Usb,
} from 'lucide-react'

type Capability = { category: string; name: string; supported: boolean; detail?: string }

type DeviceCard = {
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  badge?: { text: string; tone: 'ok' | 'muted' }
  meta: { label: string; value: string }[]
}

type ScanResult = { capabilities: Capability[]; devices: DeviceCard[] }

const CATEGORY_ORDER = [
  'Compute & graphics',
  'Connectivity',
  'Media',
  'Sensors',
  'Input',
  'Security',
  'Storage',
  'System',
]

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function hexId(id?: number | null) {
  return id == null ? '—' : `0x${id.toString(16).padStart(4, '0')}`
}

function prettyPlatform(platform: string) {
  const map: Record<string, string> = {
    Win32: 'Windows',
    Win64: 'Windows',
    MacIntel: 'macOS',
    MacArm64: 'macOS',
    Linux: 'Linux',
    Android: 'Android',
    iPhone: 'iOS',
    iPad: 'iOS',
  }
  return map[platform] ?? platform
}

function detectBrowser(userAgentData: { brands?: { brand: string; version: string }[] } | undefined, userAgent: string) {
  const brands = userAgentData?.brands ?? []
  const match = brands.find((entry) => /chrom|edge|firefox|safari|opera/i.test(entry.brand) && !/not.?a.?brand/i.test(entry.brand))
  if (match) {
    const name = match.brand.replace(/\b\w/g, (letter) => letter.toUpperCase())
    return `${name} ${match.version.split('.')[0]}`
  }
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent)) return 'Opera'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'Unknown browser'
}

async function permissionState(name: string) {
  try {
    const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor)
    return status.state
  } catch {
    return undefined
  }
}

async function detectAll(): Promise<ScanResult> {
  const w = window as any
  const nav = navigator as any
  const capabilities: Capability[] = []
  const devices: DeviceCard[] = []
  const add = (category: string, name: string, supported: boolean, detail?: string) =>
    capabilities.push({ category, name, supported, detail })

  // Compute & graphics
  add('Compute & graphics', 'WebAssembly', typeof WebAssembly !== 'undefined')
  add('Compute & graphics', 'Web Workers', typeof Worker !== 'undefined')
  let webgl: string | undefined
  try {
    const canvas = document.createElement('canvas')
    webgl = canvas.getContext('webgl2') ? 'WebGL 2' : canvas.getContext('webgl') ? 'WebGL 1' : undefined
  } catch {
    webgl = undefined
  }
  add('Compute & graphics', 'WebGL', Boolean(webgl), webgl)
  let gpuSupported = 'gpu' in nav
  let gpuDetail: string | undefined
  if (gpuSupported) {
    try {
      const adapter = await nav.gpu.requestAdapter()
      if (!adapter) {
        gpuSupported = false
        gpuDetail = 'No compatible graphics adapter'
      } else {
        const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null)
        const parts = [info?.vendor, info?.architecture, info?.description].filter(Boolean)
        if (parts.length) gpuDetail = parts.join(' · ')
      }
    } catch {
      gpuDetail = 'Adapter unavailable in this context'
    }
  }
  add('Compute & graphics', 'WebGPU', gpuSupported, gpuDetail)
  add('Compute & graphics', 'WebCodecs', 'VideoEncoder' in w && 'VideoDecoder' in w)
  const hasAudioContext = typeof w.AudioContext !== 'undefined' || typeof w.webkitAudioContext !== 'undefined'
  add('Compute & graphics', 'Web Audio API', hasAudioContext)
  let xrDetail: string | undefined
  const hasXr = 'xr' in nav
  if (hasXr && typeof nav.xr.isSessionSupported === 'function') {
    try {
      const [vr, ar] = await Promise.all([
        nav.xr.isSessionSupported('immersive-vr').catch(() => false),
        nav.xr.isSessionSupported('immersive-ar').catch(() => false),
      ])
      const modes = [vr && 'immersive VR', ar && 'immersive AR'].filter(Boolean)
      xrDetail = modes.length ? `Sessions: ${modes.join(' + ')}` : 'API present · no immersive headset'
    } catch {
      xrDetail = 'Session support unknown'
    }
  }
  add('Compute & graphics', 'WebXR', hasXr, xrDetail)

  // Connectivity
  add('Connectivity', 'Web Bluetooth', 'bluetooth' in nav, 'bluetooth' in nav ? 'Pairing asks for permission on demand' : undefined)
  const usbDevices = nav.usb?.getDevices ? await nav.usb.getDevices().catch(() => []) : []
  add(
    'Connectivity',
    'WebUSB',
    'usb' in nav,
    'usb' in nav ? (usbDevices.length ? `${usbDevices.length} paired device${usbDevices.length === 1 ? '' : 's'}` : 'No devices paired yet') : undefined,
  )
  const serialPorts = nav.serial?.getPorts ? await nav.serial.getPorts().catch(() => []) : []
  add(
    'Connectivity',
    'Web Serial',
    'serial' in nav,
    'serial' in nav ? (serialPorts.length ? `${serialPorts.length} permitted port${serialPorts.length === 1 ? '' : 's'}` : 'No ports permitted yet') : undefined,
  )
  const hidDevices = nav.hid?.getDevices ? await nav.hid.getDevices().catch(() => []) : []
  add(
    'Connectivity',
    'WebHID',
    'hid' in nav,
    'hid' in nav ? (hidDevices.length ? `${hidDevices.length} permitted device${hidDevices.length === 1 ? '' : 's'}` : 'No devices permitted yet') : undefined,
  )
  add('Connectivity', 'Web NFC', 'NDEFReader' in w)
  add('Connectivity', 'WebRTC peer connections', 'RTCPeerConnection' in w)
  const connection = nav.connection
  add(
    'Connectivity',
    'Network Information',
    Boolean(connection),
    connection
      ? [connection.effectiveType && connection.effectiveType.toUpperCase(), connection.downlink && `${connection.downlink} Mb/s`, connection.rtt != null && `${connection.rtt} ms RTT`]
          .filter(Boolean)
          .join(' · ')
      : undefined,
  )
  add('Connectivity', 'WebSocket', typeof w.WebSocket !== 'undefined')
  add('Connectivity', 'Web Share', typeof nav.share === 'function')

  // Media
  const media = nav.mediaDevices ?? {}
  const canGetUserMedia = typeof media.getUserMedia === 'function'
  const cameraPerm = canGetUserMedia ? await permissionState('camera') : undefined
  const micPerm = canGetUserMedia ? await permissionState('microphone') : undefined
  add('Media', 'Camera & microphone capture', canGetUserMedia, canGetUserMedia ? `camera ${cameraPerm ?? 'prompt'} · mic ${micPerm ?? 'prompt'}` : undefined)
  add('Media', 'Screen capture', typeof media.getDisplayMedia === 'function')
  const mediaDevices: MediaDeviceInfo[] = typeof media.enumerateDevices === 'function' ? await media.enumerateDevices().catch(() => []) : []
  add('Media', 'Device enumeration', mediaDevices.length > 0 || typeof media.enumerateDevices === 'function', mediaDevices.length ? `${mediaDevices.length} device${mediaDevices.length === 1 ? '' : 's'} reported` : 'No devices reported yet')
  add('Media', 'Media Capabilities API', 'mediaCapabilities' in nav)
  add('Media', 'Web MIDI', 'requestMIDIAccess' in nav)
  add('Media', 'Speech recognition', 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w)
  add('Media', 'Speech synthesis', 'speechSynthesis' in nav)

  // Sensors
  add('Sensors', 'Accelerometer', 'Accelerometer' in w)
  add('Sensors', 'Gyroscope', 'Gyroscope' in w)
  add('Sensors', 'Magnetometer', 'Magnetometer' in w)
  add('Sensors', 'Ambient light sensor', 'AmbientLightSensor' in w)
  add('Sensors', 'Device motion', 'DeviceMotionEvent' in w)
  add('Sensors', 'Device orientation', 'DeviceOrientationEvent' in w)
  const geoPerm = 'geolocation' in nav ? await permissionState('geolocation') : undefined
  add('Sensors', 'Geolocation', 'geolocation' in nav, geoPerm ? `permission: ${geoPerm}` : undefined)
  add('Sensors', 'Vibration', typeof nav.vibrate === 'function')

  // Input
  const touchPoints = nav.maxTouchPoints ?? 0
  add('Input', 'Touch input', touchPoints > 0, touchPoints > 0 ? `${touchPoints} touch points` : 'No touch surface reported')
  const pads = typeof nav.getGamepads === 'function' ? Array.from(nav.getGamepads() ?? []).filter(Boolean) : []
  add('Input', 'Gamepad API', typeof nav.getGamepads === 'function', typeof nav.getGamepads === 'function' ? (pads.length ? `${pads.length} connected` : 'None connected') : undefined)
  add('Input', 'Pointer events', typeof w.PointerEvent !== 'undefined')
  add('Input', 'Clipboard access', Boolean(nav.clipboard))

  // Security
  add('Security', 'Web Crypto', Boolean(nav.crypto?.subtle), nav.crypto?.subtle ? 'AES-GCM, RSA, ECDSA available' : 'Requires a secure context')
  const hasWebAuthn = 'PublicKeyCredential' in w
  let passkeyDetail: string | undefined
  if (hasWebAuthn && typeof w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      const available = await w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      passkeyDetail = available ? 'Platform authenticator available (fingerprint, Face ID, PIN)' : 'External security keys only'
    } catch {
      passkeyDetail = 'Platform authenticator status unknown'
    }
  }
  add('Security', 'Passkeys (WebAuthn)', hasWebAuthn, passkeyDetail)
  add('Security', 'Secure context', w.isSecureContext, w.isSecureContext ? window.location.protocol : 'Not HTTPS — many APIs are disabled')
  add('Security', 'Permissions API', 'permissions' in nav)

  // Storage
  add('Storage', 'File System Access', 'showOpenFilePicker' in w)
  let storageDetail: string | undefined
  if (nav.storage?.estimate) {
    try {
      const { usage = 0, quota = 0 } = await nav.storage.estimate()
      storageDetail = `${formatBytes(usage)} used of ${formatBytes(quota)}`
    } catch {
      storageDetail = 'Estimate unavailable'
    }
  }
  add('Storage', 'Storage estimate', Boolean(nav.storage?.estimate), storageDetail)
  add('Storage', 'IndexedDB', typeof w.indexedDB !== 'undefined')
  add('Storage', 'Cache API', 'caches' in w)

  // System
  let batteryDetail: string | undefined
  const hasBattery = typeof nav.getBattery === 'function'
  if (hasBattery) {
    try {
      const battery = await nav.getBattery()
      batteryDetail = `${Math.round(battery.level * 100)}% · ${battery.charging ? 'charging' : 'on battery'}`
    } catch {
      batteryDetail = 'Status unavailable'
    }
  }
  add('System', 'Battery status', hasBattery, batteryDetail)
  add('System', 'Screen Wake Lock', 'wakeLock' in nav)
  add('System', 'Notifications', 'Notification' in w, 'Notification' in w ? `permission: ${Notification.permission}` : undefined)
  add('System', 'WebOTP autofill', 'OTPCredential' in w)
  add('System', 'Contacts picker', 'contacts' in nav)
  add('System', 'Web Locks', 'locks' in nav)
  add('System', 'Barcode detection', 'BarcodeDetector' in w)

  // The devices themselves
  const userAgentData = nav.userAgentData
  const platform = prettyPlatform(userAgentData?.platform ?? nav.platform ?? 'Unknown')
  const browser = detectBrowser(userAgentData, nav.userAgent)
  devices.push({
    id: 'current',
    title: 'This device',
    subtitle: `${browser} on ${platform}`,
    icon: MonitorSmartphone,
    badge: { text: 'Current', tone: 'ok' },
    meta: [
      { label: 'Processor', value: `${nav.hardwareConcurrency ?? '—'} logical cores` },
      { label: 'Memory', value: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'Not exposed' },
      { label: 'GPU', value: gpuDetail ?? (gpuSupported ? 'WebGPU ready' : 'WebGPU unavailable') },
      { label: 'Display', value: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}×` },
      { label: 'Touch points', value: String(touchPoints) },
      { label: 'Language', value: nav.language ?? '—' },
      { label: 'Time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
      ...(batteryDetail ? [{ label: 'Battery', value: batteryDetail }] : []),
      ...(connection?.effectiveType ? [{ label: 'Network', value: connection.effectiveType.toUpperCase() }] : []),
    ],
  })

  const counts: Record<string, number> = { videoinput: 0, audioinput: 0, audiooutput: 0 }
  for (const device of mediaDevices) {
    if (!(device.kind in counts)) continue
    counts[device.kind] += 1
    const identified = Boolean(device.label)
    const label =
      device.label ||
      (device.kind === 'videoinput'
        ? `Camera ${counts.videoinput}`
        : device.kind === 'audioinput'
          ? `Microphone ${counts.audioinput}`
          : `Audio output ${counts.audiooutput}`)
    const isHeadset = /head|ear|airpod|headset/i.test(label)
    devices.push({
      id: `media-${device.deviceId || counts[device.kind]}`,
      title: label,
      subtitle:
        device.kind === 'videoinput' ? 'Camera' : device.kind === 'audioinput' ? 'Microphone' : 'Audio output',
      icon: device.kind === 'videoinput' ? Camera : device.kind === 'audioinput' ? Mic : isHeadset ? Headphones : Speaker,
      badge: identified ? { text: 'Identified', tone: 'ok' } : { text: 'Permission needed', tone: 'muted' },
      meta: [
        { label: 'Kind', value: device.kind },
        { label: 'Device ID', value: device.deviceId ? `${device.deviceId.slice(0, 12)}…` : 'Not exposed' },
        { label: 'Group', value: device.groupId ? `${device.groupId.slice(0, 12)}…` : 'Not exposed' },
      ],
    })
  }

  pads.forEach((pad: any, index: number) => {
    if (!pad) return
    devices.push({
      id: `gamepad-${index}`,
      title: pad.id || `Gamepad ${index + 1}`,
      subtitle: `Gamepad · ${pad.mapping === 'standard' ? 'standard mapping' : 'custom mapping'}`,
      icon: Gamepad2,
      badge: pad.connected ? { text: 'Connected', tone: 'ok' } : { text: 'Disconnected', tone: 'muted' },
      meta: [
        { label: 'Buttons', value: String(pad.buttons?.length ?? 0) },
        { label: 'Axes', value: String(pad.axes?.length ?? 0) },
        ...(pad.vibrationActuator ? [{ label: 'Haptics', value: 'Vibration supported' }] : []),
      ],
    })
  })

  usbDevices.forEach((device: any, index: number) => {
    devices.push({
      id: `usb-${index}`,
      title: device.productName || device.manufacturerName || `USB device ${index + 1}`,
      subtitle: 'USB peripheral · paired with this origin',
      icon: Usb,
      badge: { text: 'Paired', tone: 'ok' },
      meta: [
        { label: 'Vendor ID', value: hexId(device.vendorId) },
        { label: 'Product ID', value: hexId(device.productId) },
        ...(device.serialNumber ? [{ label: 'Serial', value: device.serialNumber }] : []),
      ],
    })
  })

  hidDevices.forEach((device: any, index: number) => {
    devices.push({
      id: `hid-${index}`,
      title: device.productName || `HID device ${index + 1}`,
      subtitle: 'Human interface device · paired with this origin',
      icon: Keyboard,
      badge: { text: device.opened ? 'Open' : 'Paired', tone: 'ok' },
      meta: [
        { label: 'Vendor ID', value: hexId(device.vendorId) },
        { label: 'Product ID', value: hexId(device.productId) },
        { label: 'Collections', value: String(device.collections?.length ?? 0) },
      ],
    })
  })

  for (const port of serialPorts) {
    const info = port.getInfo?.() ?? {}
    devices.push({
      id: `serial-${devices.length}`,
      title: info.usbVendorId || info.usbProductId ? `Serial port ${hexId(info.usbVendorId)}:${hexId(info.usbProductId)}` : 'Serial port',
      subtitle: 'Serial port · permitted for this origin',
      icon: Cable,
      badge: { text: 'Permitted', tone: 'ok' },
      meta: [
        { label: 'Vendor ID', value: hexId(info.usbVendorId) },
        { label: 'Product ID', value: hexId(info.usbProductId) },
      ],
    })
  }

  return { capabilities, devices }
}

function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{title}</h3>
      {meta && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{meta}</span>}
    </div>
  )
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
        <Icon className="size-4.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function DeviceCardView({ device, wide = false }: { device: DeviceCard; wide?: boolean }) {
  const Icon = device.icon
  return (
    <article className={`rounded-2xl border border-border bg-card p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold">{device.title}</h4>
            {device.badge && (
              <span className={`rounded-full px-2 py-1 text-[10px] ${device.badge.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                {device.badge.text}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{device.subtitle}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
            {device.meta.map((entry) => (
              <div key={entry.label} className="min-w-0">
                <dt className="text-muted-foreground">{entry.label}</dt>
                <dd className="truncate font-medium">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  )
}

function CapabilityCard({ capability }: { capability: Capability }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-3">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${capability.supported ? 'bg-emerald-500' : 'bg-rose-400/60'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{capability.name}</p>
        <p className={`mt-0.5 text-[11px] ${capability.supported ? 'text-muted-foreground' : 'text-rose-500/80'}`}>
          {capability.detail ?? (capability.supported ? 'Supported' : 'Not supported in this browser')}
        </p>
      </div>
    </div>
  )
}

export function DevicesPanel() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(true)
  const [scannedAt, setScannedAt] = useState<Date | null>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const data = await detectAll()
      setResult(data)
      setScannedAt(new Date())
    } catch {
      setResult({ capabilities: [], devices: [] })
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    scan()
  }, [scan])

  useEffect(() => {
    const refresh = () => scan()
    const media = navigator.mediaDevices
    window.addEventListener('gamepadconnected', refresh)
    window.addEventListener('gamepaddisconnected', refresh)
    media?.addEventListener?.('devicechange', refresh)
    return () => {
      window.removeEventListener('gamepadconnected', refresh)
      window.removeEventListener('gamepaddisconnected', refresh)
      media?.removeEventListener?.('devicechange', refresh)
    }
  }, [scan])

  const current = result?.devices.find((device) => device.id === 'current')
  const peripherals = result?.devices.filter((device) => device.id !== 'current') ?? []
  const capabilities = result?.capabilities ?? []
  const supportedCount = capabilities.filter((capability) => capability.supported).length
  const groups = capabilities.reduce<Record<string, Capability[]>>((acc, capability) => {
    ;(acc[capability.category] ??= []).push(capability)
    return acc
  }, {})
  const orderedCategories = CATEGORY_ORDER.filter((category) => groups[category]?.length)

  return (
    <div className="flex-1 overflow-auto p-5 sm:p-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Detected in this browser</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Devices</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every device and web capability this browser can see right now.</p>
          {scannedAt && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last scan {scannedAt.toLocaleTimeString()} · re-scans when hardware is plugged in or paired
            </p>
          )}
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {!result && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Probing this browser for hardware and web capabilities…
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Devices detected" value={String(result.devices.length)} icon={MonitorSmartphone} />
            <StatTile
              label="Capabilities supported"
              value={`${supportedCount}/${capabilities.length}`}
              icon={CheckCircle2}
            />
            <StatTile label="Peripherals" value={String(peripherals.length)} icon={Usb} />
          </div>

          <section>
            <SectionHeading title="This device" meta={current?.subtitle} />
            <div className="grid gap-3">
              {current && <DeviceCardView device={current} wide />}
              {!current && <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Device details unavailable.</div>}
            </div>
          </section>

          <section>
            <SectionHeading title="Connected peripherals" meta={`${peripherals.length} detected`} />
            {peripherals.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {peripherals.map((device) => (
                  <DeviceCardView key={device.id} device={device} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <MonitorSmartphone className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No peripherals detected yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Plug in a camera, headset, or gamepad and hit Rescan. Browsers only reveal hardware you grant
                  permission for — USB, serial, HID, and Bluetooth devices appear here after you pair them once.
                </p>
              </div>
            )}
          </section>

          <section>
            <SectionHeading
              title="Web capabilities"
              meta={capabilities.length ? `${supportedCount} of ${capabilities.length} supported` : undefined}
            />
            <div className="flex flex-col gap-5">
              {orderedCategories.map((category) => {
                const items = groups[category]
                const categorySupported = items.filter((capability) => capability.supported).length
                return (
                  <div key={category}>
                    <SectionHeading title={category} meta={`${categorySupported}/${items.length}`} />
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((capability) => (
                        <CapabilityCard key={capability.name} capability={capability} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
