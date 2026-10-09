import { atom } from './vendor/store.js'
import { persistentAtom } from './store.js'
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '../lib/bitcoin/bip39.js'
import { fromSeed, derivePath } from '../lib/bitcoin/bip32.js'
import { p2wpkhAddress } from '../lib/bitcoin/address.js'
import { addressBalance, addressUtxos } from '../lib/bitcoin/esplora.js'

export const walletState = persistentAtom('s:wallet', {
  mnemonic: null,
  confirmed: true, // derived deterministically from the app's unlock identity; no external backup needed
  address: null,
  path: "m/84'/0'/0'/0/0",
  balance: 0,
  utxos: [],
}, { mnemonic: null, confirmed: true, address: null, path: "m/84'/0'/0'/0/0", balance: 0, utxos: [] })

export const wallet = {
  state: walletState,
  subscribe(fn) { return this.state.subscribe(fn) },
  get() { return this.state.get() },
  async init() {},
  async ensure() {
    const w = this.get()
    if (w.address && w.confirmed) return w
    const mnemonic = await generateMnemonic(128)
    const seed = await mnemonicToSeed(mnemonic)
    const master = await fromSeed(seed)
    const child = await derivePath(master, w.path || "m/84'/0'/0'/0/0")
    const address = await p2wpkhAddress(child.publicKey)
    this.state.set({ ...w, mnemonic, confirmed: true, address })
    await this.refresh()
    return this.get()
  },
  async create() {
    return this.ensure()
  },
  async confirmSeed() {
    await this.ensure()
    return this.get()
  },
  async newAddress() {
    await this.ensure()
    const w = this.get()
    const seed = await mnemonicToSeed(w.mnemonic)
    const master = await fromSeed(seed)
    const child = await derivePath(master, w.path || "m/84'/0'/0'/0/0")
    const address = await p2wpkhAddress(child.publicKey)
    this.state.set({ ...w, address })
    await this.refresh()
    return this.get()
  },
  async refresh(base) {
    const w = this.get()
    if (!w?.address) return w
    try {
      const balance = await addressBalance(w.address, base)
      const utxos = await addressUtxos(w.address, base)
      this.state.set({ ...w, balance, utxos })
    } catch {}
    return this.get()
  },
  async mockSend(to, amt) {
    const w = this.get()
    if (!w) return w
    const bal = Math.max(0, (w.balance||0) - (amt||0))
    this.state.set({ ...w, balance: bal })
    return this.get()
  }
}
