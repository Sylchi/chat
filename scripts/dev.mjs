import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const tailwind = spawn('npx', ['@tailwindcss/cli', '-i', './src/styles.css', '-o', './styles.css', '--watch'], {
  cwd: root,
  stdio: 'inherit',
})
const server = spawn('python3', ['-m', 'http.server', '5173'], { cwd: root, stdio: 'inherit' })

let exiting = false
const shutdown = () => {
  if (exiting) return
  exiting = true
  tailwind.kill()
  server.kill()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
tailwind.on('exit', (code) => {
  if (!exiting && code) process.exit(code)
})
server.on('exit', shutdown)