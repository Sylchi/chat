import { fsaProvider } from './providers/fsa.js'
import { githubProvider } from './providers/github.js'
import { gdriveProvider } from './providers/gdrive.js'
import { idbProvider } from './providers/idb.js'
import { localStorageProvider } from './providers/localstorage.js'

// Storage backends behind the Files view. Local ones work out of the box;
// cloud ones need credentials supplied by the user (stored sealed in the vault).
export const PROVIDERS = [fsaProvider, idbProvider, localStorageProvider, gdriveProvider, githubProvider]

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id) ?? idbProvider
}

/** Re-open the last chosen folder on this device if the browser still allows it. */
export function restoreLocalProviders() {
  return fsaProvider.restore().catch(() => false)
}
