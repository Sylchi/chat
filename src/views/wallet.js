import { wallet } from '../wallet-store.js'
import { icon } from '../dom.js'
import { Plus, Send, Wallet2 } from '../vendor/icons.js'
import { qrSvg } from '../qr.js'

export const walletView = {
  html() {
    return `
      <div class="flex flex-col gap-4 p-4 md:p-6">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            ${icon(Wallet2, 'size-5 text-primary')}
            <div>
              <h2 class="text-lg font-semibold">Wallet</h2>
              <p class="text-xs text-muted-foreground">Bitcoin wallet (minimal, no external deps)</p>
            </div>
          </div>
          <button data-wallet-init class="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Plus, 'size-4')}Create / Restore</button>
        </div>

        <div data-wallet-addr class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm hidden">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Receiving address (P2WPKH)</p>
              <p data-addr-text class="mt-1 break-all font-mono text-sm"></p>
            </div>
            <div class="flex items-center gap-2">
              <button data-addr-copy class="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">Copy</button>
              <button data-addr-refresh class="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">New address</button>
            </div>
          </div>
          <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div>Balance: <span data-balance>0</span> sats</div>
            <div>Derivation: <span data-path></span></div>
          </div>
          <div data-qr class="w-40 h-40"></div>
        </div>

        <div data-wallet-create class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm hidden">
          <p class="text-sm font-medium">Recovery phrase (seed)</p>
          <p class="text-xs text-muted-foreground">Write down these 12 words in order. They are the only way to recover your wallet.</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            ${Array.from({length:12}).map((_,i)=>`<div class="rounded-lg border border-border px-2 py-1.5 font-mono text-xs">#${i+1} <span data-mnemonic-${i}></span></div>`).join('')}
          </div>
          <p class="text-xs text-amber-700 dark:text-amber-500">Keep it offline and private. We cannot recover it if lost.</p>
          <div class="flex flex-wrap gap-2">
            <button data-mnemonic-ok class="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">I’ve secured it</button>
            <button data-mnemonic-new class="rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">Regenerate</button>
          </div>
        </div>

        <div data-wallet-send class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm hidden">
          <p class="text-sm font-medium">Send</p>
          <div class="flex flex-col gap-2">
            <input data-send-to class="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs" placeholder="bc1... or legacy address (mock)">
            <input data-send-amt class="rounded-xl border border-border bg-background px-3 py-2 text-xs" placeholder="Amount in sats" type="number">
            <button data-send-go class="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Send, 'size-4')}Mock send</button>
            <p data-send-msg class="text-xs text-muted-foreground"></p>
          </div>
        </div>

        <div class="rounded-2xl border border-border bg-card p-4 shadow-sm text-xs text-muted-foreground">
          <p class="font-medium text-foreground">Notes</p>
          <p class="mt-1">Canonical BIP39 (2048-word English) mnemonic. Real P2WPKH addresses (bech32), BIP32/BIP84 derivation, secp256k1 ECDSA with RFC6979, zero external dependencies.</p>
          <p class="mt-1">Vault encryption is used for persisted wallet state (same passkey unlock). Mnemonics are displayed only once on creation; keep them safe.</p>
        </div>
      </div>
    `
  },
  init(root) {
    wallet.init()

    const initBtn = root.querySelector('[data-wallet-init]')
    const addrBox = root.querySelector('[data-wallet-addr]')
    const createBox = root.querySelector('[data-wallet-create]')
    const sendBox = root.querySelector('[data-wallet-send]')

    function render() {
      const w = wallet.get()
      if (w && w.address) {
        addrBox.classList.remove('hidden')
        sendBox.classList.remove('hidden')
        root.querySelector('[data-addr-text]').textContent = w.address
        root.querySelector('[data-balance]').textContent = String(w.balance || 0)
        root.querySelector('[data-path]').textContent = w.path || 'm/84\'/0\'/0\'/0/0'
        const qr = root.querySelector('[data-qr]')
        qr.innerHTML = qrSvg(w.address, 160)
      } else {
        addrBox.classList.add('hidden')
        sendBox.classList.add('hidden')
      }
      if (w && w.mnemonic) {
        createBox.classList.remove('hidden')
        w.mnemonic.split(' ').forEach((word, i) => {
          const el = root.querySelector(`[data-mnemonic-${i}]`)
          if (el) el.textContent = word
        })
      } else {
        createBox.classList.add('hidden')
      }
    }

    initBtn.addEventListener('click', async () => {
      await wallet.create()
      render()
    })
    root.querySelector('[data-addr-refresh]').addEventListener('click', async () => {
      await wallet.newAddress()
      render()
    })
    root.querySelector('[data-addr-copy]').addEventListener('click', async () => {
      const w = wallet.get()
      if (w?.address) {
        try { await navigator.clipboard.writeText(w.address); } catch {}
      }
    })
    root.querySelector('[data-mnemonic-ok]').addEventListener('click', async () => {
      await wallet.confirmSeed()
      render()
    })
    root.querySelector('[data-mnemonic-new]').addEventListener('click', async () => {
      await wallet.create()
      render()
    })
    root.querySelector('[data-send-go]').addEventListener('click', async () => {
      const to = root.querySelector('[data-send-to]').value.trim()
      const amt = parseInt(root.querySelector('[data-send-amt]').value||'0')
      const msg = root.querySelector('[data-send-msg]')
      if (!to || !amt) { msg.textContent='Enter address and amount'; return }
      await wallet.mockSend(to, amt)
      msg.textContent = 'Sent (mock). Balance updated.'
      render()
    })

    render()
    wallet.subscribe(render)
  },
  destroy() {}
}
