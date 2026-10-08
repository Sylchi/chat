import './styles.css'
import { initWorkspace } from './views/workspace'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app mount point')
initWorkspace(app)