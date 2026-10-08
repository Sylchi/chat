import { initDevices } from './device-store.js'
import { initPasskey } from './passkey-store.js'
import { initWorkspace } from './views/workspace.js'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app mount point')
void initDevices()
void initPasskey()
initWorkspace(app)