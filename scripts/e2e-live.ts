// Live end-to-end: browser-style WebSocket -> ws-bridge -> Tor -> hidden
// service mailbox on the VPS. Uses Node's global WebSocket (Node 22+).
export {}

import { mailboxPut, mailboxGet } from '../lib/mesh.ts'
import { wsBridgeTransport } from '../lib/transports/ws-bridge.ts'

const ENDPOINT = 'ws://172.245.67.49:9002'
const ONION = 'iuo7ihvk3amugvqswhlaewgmyhrl5dnk6cmb757dyxslocrcco4xjpad.onion'

async function main() {
  const bridge = wsBridgeTransport(ENDPOINT)
  const blob = new TextEncoder().encode(
    'mesh e2e ' + Date.now() + ' ' + Math.random().toString(36).slice(2),
  )

  console.log('PUT via ' + bridge.name + '...')
  await mailboxPut(bridge, ONION, 80, blob)
  console.log('   OK')

  console.log('GET...')
  const msgs = await mailboxGet(bridge, ONION, 80)
  console.log(`   drained ${msgs.length} message(s)`)

  const found = msgs.some((m) => Buffer.from(m).equals(Buffer.from(blob)))
  console.log('roundtrip match:', found ? 'OK' : 'FAIL')
  process.exit(found ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})