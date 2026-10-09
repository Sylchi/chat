import { initDevices } from './device-store.js'
import { initPasskey, passkey } from './passkey-store.js'
import { initGate } from './views/gate.js'
import { initWorkspace } from './views/workspace.js'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app mount point')

// The workspace is only mounted once the passkey unlocks the at-rest vault, so
// decrypted data never reaches the DOM before authentication.
const gateRoot = document.createElement('div')
gateRoot.id = 'gate-root'
app.appendChild(gateRoot)
initGate(gateRoot)

let workspaceRoot = null
function mountWorkspace() {
  if (workspaceRoot) return
  workspaceRoot = document.createElement('div')
  workspaceRoot.id = 'workspace-root'
  app.appendChild(workspaceRoot)
  initWorkspace(workspaceRoot)
}

passkey.subscribe((state) => {
  const unlocked = state.status === 'unlocked'
  gateRoot.hidden = unlocked
  if (unlocked) mountWorkspace()
  if (workspaceRoot) workspaceRoot.hidden = !unlocked
})

initDevices().catch((error) => console.error('[S] device layer failed to initialize', error))
initPasskey().catch((error) => console.error('[S] passkey layer failed to initialize', error))
