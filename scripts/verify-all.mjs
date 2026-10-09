// Runs every lib verify script (crypto, identity, keystore, onion, mesh,
// socks5) under Node's native TypeScript type-stripping, plus the browser-compat
// check, plus the smoke test.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

function run(label, file) {
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`${label} FAILED: ${file.split(/[\\/]/).pop()}`)
    return 1
  }
  console.log(`${label} ok: ${file.split(/[\\/]/).pop()}`)
  return 0
}

let failed = 0
const tsFiles = readdirSync(dir)
  .filter((f) => f.startsWith('verify-') && f.endsWith('.ts'))
  .sort()
for (const file of tsFiles) failed += run('verify', join(dir, file))
failed += run('verify', join(dir, 'verify-lib-browser.mjs'))

console.log(
  failed
    ? `${failed} verify step(s) failed`
    : `all ${tsFiles.length + 1} verify scripts passed`,
)
process.exit(failed ? 1 : 0)
