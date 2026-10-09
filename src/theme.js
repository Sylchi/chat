import { atom } from './vendor/store.js'

export const THEMES = ['system', 'light', 'dark']
const STORAGE_KEY = 's:theme'

function systemPrefersDark() {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      Boolean(window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  } catch {
    return false
  }
}

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (THEMES.includes(saved)) return saved
  } catch {}
  return 'system'
}

export const themeChoice = atom(readInitialTheme())

function applyTheme(mode) {
  if (typeof document === 'undefined' || !document.documentElement) return
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', Boolean(dark))
  if (document.documentElement.style) {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }
}

export function setTheme(mode) {
  const choice = THEMES.includes(mode) ? mode : 'system'
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {}
  themeChoice.set(choice)
  applyTheme(choice)
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', () => {
      if (themeChoice.get() === 'system') {
        applyTheme('system')
      }
    })
  } catch {}
}

applyTheme(themeChoice.get())
