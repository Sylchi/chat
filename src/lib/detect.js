import {
  Cable,
  Camera,
  Gamepad2,
  Headphones,
  Keyboard,
  Mic,
  MonitorSmartphone,
  Speaker,
  Usb,
} from '../vendor/icons.js'

export const CATEGORY_ORDER = [
  'Compute & graphics',
  'Connectivity',
  'Media',
  'Sensors',
  'Input',
  'Security',
  'Storage',
  'System',
]

// Lightweight WebGPU probe, reused by the agent model loader (S agent needs a
// real adapter, not just `navigator.gpu`, to avoid failing late in a download).
export async function detectWebGPU() {
  const nav = typeof navigator === 'undefined' ? null : navigator
  if (!nav || !('gpu' in nav)) return { supported: false, adapter: null, info: null }
  try {
    const adapter = await nav.gpu.requestAdapter()
    if (!adapter) return { supported: false, adapter: null, info: null }
    const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null)
    return { supported: true, adapter, info }
  } catch {
    return { supported: false, adapter: null, info: null }
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function hexId(id) {
  return id == null ? '—' : `0x${id.toString(16).padStart(4, '0')}`
}

function prettyPlatform(platform) {
  const map = {
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

function detectBrowser(userAgentData, userAgent) {
  const brands = userAgentData?.brands ?? []
  const match = brands.find(
    (entry) => /chrom|edge|firefox|safari|opera/i.test(entry.brand) && !/not.?a.?brand/i.test(entry.brand),
  )
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

async function permissionState(name) {
  try {
    const status = await navigator.permissions.query({ name })
    return status.state
  } catch {
    return undefined
  }
}

export async function detectAll() {
  const w = window
  const nav = navigator
  const capabilities = []
  const devices = []
  const add = (category, name, supported, detail) => capabilities.push({ category, name, supported, detail })

  add('Compute & graphics', 'WebAssembly', typeof WebAssembly !== 'undefined')
  add('Compute & graphics', 'Web Workers', typeof Worker !== 'undefined')
  let webgl
  try {
    const canvas = document.createElement('canvas')
    webgl = canvas.getContext('webgl2') ? 'WebGL 2' : canvas.getContext('webgl') ? 'WebGL 1' : undefined
  } catch {
    webgl = undefined
  }
  add('Compute & graphics', 'WebGL', Boolean(webgl), webgl)
  let gpuSupported = 'gpu' in nav
  let gpuDetail
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
  let xrDetail
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

  const media = nav.mediaDevices ?? {}
  const canGetUserMedia = typeof media.getUserMedia === 'function'
  const cameraPerm = canGetUserMedia ? await permissionState('camera') : undefined
  const micPerm = canGetUserMedia ? await permissionState('microphone') : undefined
  add('Media', 'Camera & microphone capture', canGetUserMedia, canGetUserMedia ? `camera ${cameraPerm ?? 'prompt'} · mic ${micPerm ?? 'prompt'}` : undefined)
  add('Media', 'Screen capture', typeof media.getDisplayMedia === 'function')
  const mediaDevices = typeof media.enumerateDevices === 'function' ? await media.enumerateDevices().catch(() => []) : []
  add('Media', 'Device enumeration', mediaDevices.length > 0 || typeof media.enumerateDevices === 'function', mediaDevices.length ? `${mediaDevices.length} device${mediaDevices.length === 1 ? '' : 's'} reported` : 'No devices reported yet')
  add('Media', 'Media Capabilities API', 'mediaCapabilities' in nav)
  add('Media', 'Web MIDI', 'requestMIDIAccess' in nav)
  add('Media', 'Speech recognition', 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w)
  add('Media', 'Speech synthesis', 'speechSynthesis' in nav)

  add('Sensors', 'Accelerometer', 'Accelerometer' in w)
  add('Sensors', 'Gyroscope', 'Gyroscope' in w)
  add('Sensors', 'Magnetometer', 'Magnetometer' in w)
  add('Sensors', 'Ambient light sensor', 'AmbientLightSensor' in w)
  add('Sensors', 'Device motion', 'DeviceMotionEvent' in w)
  add('Sensors', 'Device orientation', 'DeviceOrientationEvent' in w)
  const geoPerm = 'geolocation' in nav ? await permissionState('geolocation') : undefined
  add('Sensors', 'Geolocation', 'geolocation' in nav, geoPerm ? `permission: ${geoPerm}` : undefined)
  add('Sensors', 'Vibration', typeof nav.vibrate === 'function')

  const touchPoints = nav.maxTouchPoints ?? 0
  add('Input', 'Touch input', touchPoints > 0, touchPoints > 0 ? `${touchPoints} touch points` : 'No touch surface reported')
  const pads = typeof nav.getGamepads === 'function' ? Array.from(nav.getGamepads() ?? []).filter(Boolean) : []
  add('Input', 'Gamepad API', typeof nav.getGamepads === 'function', typeof nav.getGamepads === 'function' ? (pads.length ? `${pads.length} connected` : 'None connected') : undefined)
  add('Input', 'Pointer events', typeof w.PointerEvent !== 'undefined')
  add('Input', 'Clipboard access', Boolean(nav.clipboard))

  add('Security', 'Web Crypto', Boolean(nav.crypto?.subtle), nav.crypto?.subtle ? 'AES-GCM, RSA, ECDSA available' : 'Requires a secure context')
  const hasWebAuthn = 'PublicKeyCredential' in w
  let passkeyDetail
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

  add('Storage', 'File System Access', 'showOpenFilePicker' in w)
  let storageDetail
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

  let batteryDetail
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

  const counts = { videoinput: 0, audioinput: 0, audiooutput: 0 }
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

  pads.forEach((pad, index) => {
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

  usbDevices.forEach((device, index) => {
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

  hidDevices.forEach((device, index) => {
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