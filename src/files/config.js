import { persistentAtom } from '../store.js'

// File-manager configuration (cloud credentials + last-used provider). Sealed
// at rest by the vault like every other persistent atom.

const DEFAULT = {
  gdrive: { clientId: '' },
  github: { token: '', owner: '', repo: '', branch: 'main' },
}

export const filesConfig = persistentAtom('s:files-config', DEFAULT, { gdrive: { clientId: '' }, github: { token: '', owner: '', repo: '', branch: 'main' } })

export const filesPrefs = persistentAtom('s:files-prefs', { provider: 'idb' }, { provider: 'idb' })

export function updateConfig(section, patch) {
  const current = filesConfig.get()
  filesConfig.set({ ...current, [section]: { ...current[section], ...patch } })
}

export function googleClientId() {
  const stored = filesConfig.get()?.gdrive?.clientId
  if (stored) return stored
  return typeof window !== 'undefined' ? window.S_GOOGLE_CLIENT_ID || '' : ''
}

export function githubConfig() {
  const cfg = filesConfig.get()?.github ?? {}
  return { token: cfg.token || '', owner: cfg.owner || '', repo: cfg.repo || '', branch: cfg.branch || 'main' }
}
