import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'src'), { recursive: true })

cpSync(join(root, 'index.html'), join(out, 'index.html'))
cpSync(join(root, 'bluetooth.html'), join(out, 'bluetooth.html'))
cpSync(join(root, 'public'), out, { recursive: true })
cpSync(join(root, 'src'), join(out, 'src'), {
  recursive: true,
  filter: (source) => !source.endsWith(`${sep}styles.css`),
})
cpSync(join(root, 'lib'), join(out, 'lib'), { recursive: true })

const result = spawnSync('npx', ['@tailwindcss/cli', '-i', './src/styles.css', '-o', './out/styles.css', '--minify'], {
  cwd: root,
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)