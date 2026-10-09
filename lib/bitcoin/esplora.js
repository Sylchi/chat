// Minimal Esplora (Blockstream-compatible) REST client.
//
// `base` defaults to the public Blockstream endpoint; callers can point it at
// any Esplora instance.

const DEFAULT_BASE = 'https://blockstream.info/api'

function endpoint(base, path) {
  return `${(base || DEFAULT_BASE).replace(/\/+$/, '')}${path}`
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Esplora request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

function sum(stats) {
  if (!stats) return 0
  return (stats.funded_txo_sum || 0) - (stats.spent_txo_sum || 0)
}

/** Confirmed + mempool balance in satoshis. */
export async function addressBalance(address, base) {
  const data = await getJson(endpoint(base, `/address/${encodeURIComponent(address)}`))
  return sum(data.chain_stats) + sum(data.mempool_stats)
}

/** Raw UTXO list: [{ txid, vout, value, status }, ...]. */
export async function addressUtxos(address, base) {
  return getJson(endpoint(base, `/address/${encodeURIComponent(address)}/utxo`))
}

/** Confirmed + mempool transaction history. */
export async function addressTransactions(address, base) {
  return getJson(endpoint(base, `/address/${encodeURIComponent(address)}/txs`))
}

/** Broadcast a raw transaction (hex); returns the txid. */
export async function broadcastTransaction(hex, base) {
  const response = await fetch(endpoint(base, '/tx'), { method: 'POST', body: hex })
  if (!response.ok) throw new Error(`Broadcast failed: ${response.status} ${response.statusText}`)
  return response.text()
}
