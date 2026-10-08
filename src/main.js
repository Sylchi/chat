import { initWorkspace } from './views/workspace.js'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app mount point')
initWorkspace(app)