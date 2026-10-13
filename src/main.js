import { initDevices } from './device-store.js'
import { initPasskey } from './passkey-store.js'
import { initWorkspace } from './views/workspace.js'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app mount point')

// No auth gate: S is a client for your own device and your own services. It
// boots straight into an in-memory (ephemeral) session. Unlocking a passkey is
// an optional way to persist state on this device, not a requirement to use it.
const workspaceRoot = document.createElement('div')
workspaceRoot.id = 'workspace-root'
app.appendChild(workspaceRoot)
initWorkspace(workspaceRoot)

initDevices().catch((error) => console.error('[S] device layer failed to initialize', error))
initPasskey().catch((error) => console.error('[S] passkey layer failed to initialize', error))
