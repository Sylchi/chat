import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

// Dev server serves the repo root (so edits to src/lib are live, no bundler)
// and falls back to public/ for assets — this mirrors the production layout,
// where public/ is copied into the site root (manifest, icons, tor.wasm).
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function safeJoin(base, target) {
  const path = normalize(join(base, target))
  return path === resolve(base) || path.startsWith(resolve(base) + sep) ? path : null
}

async function readIfFile(path) {
  try {
    const info = await stat(path)
    if (info.isDirectory()) return readIfFile(join(path, 'index.html'))
    return { body: await readFile(path), path }
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    pathname = '/'
  }
  if (pathname.endsWith('/')) pathname += 'index.html'
  const candidates = [safeJoin(root, pathname), safeJoin(publicDir, pathname)].filter(Boolean)
  let found = null
  for (const candidate of candidates) {
    found = await readIfFile(candidate)
    if (found) break
  }
  if (!found) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }
  res.writeHead(200, {
    'content-type': MIME[extname(found.path)] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  res.end(found.body)
})

const tailwind = spawn('npx', ['@tailwindcss/cli', '-i', './src/styles.css', '-o', './styles.css', '--watch'], {
  cwd: root,
  stdio: 'inherit',
})

server.listen(3000, () => console.log('dev server on http://localhost:3000'))

let exiting = false
const shutdown = () => {
  if (exiting) return
  exiting = true
  tailwind.kill()
  server.close()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
tailwind.on('exit', (code) => {
  if (!exiting && code) process.exit(code)
})
