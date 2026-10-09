import { Fingerprint, KeyRound, ShieldCheck } from '../vendor/icons.js'
import { brandMark, icon } from '../dom.js'
import { enrollPasskey, passkey, unlockPasskey } from '../passkey-store.js'

// Full-screen gate shown until the passkey unlocks the at-rest vault. Without
// an unlock the workspace is never mounted, so no ciphertext is decrypted and
// no plaintext exists in the DOM.

const PROFILE_NAME = 'S user'

function webAuthnAvailable() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

const ICON = (iconNode, klass) => icon(iconNode, klass)

export function initGate(root) {
  root.innerHTML = `
    <div class="flex h-dvh items-center justify-center bg-background p-5 text-foreground">
      <div class="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-[0_24px_80px_-35px_rgba(15,23,42,0.35)]">
        <div class="flex items-center gap-2">
          <div class="grid size-9 place-items-center rounded-xl bg-brand text-brand-foreground">${brandMark('size-4')}</div>
          <span class="text-lg font-semibold tracking-tight">S</span>
        </div>
        <h1 data-gate-title class="mt-6 text-xl font-semibold tracking-tight">Locked</h1>
        <p data-gate-desc class="mt-1.5 text-sm leading-relaxed text-muted-foreground"></p>
        <div data-gate-error class="mt-4 hidden rounded-xl bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-600"></div>
        <button data-gate-action class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
          <span data-gate-action-icon>${ICON(Fingerprint, 'size-4')}</span>
          <span data-gate-action-label>Unlock</span>
        </button>
        <button data-gate-key class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-3 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60">
          ${ICON(KeyRound, 'size-4')}<span data-gate-key-label>Use a security key</span>
        </button>
        <div class="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          ${ICON(ShieldCheck, 'size-3.5 text-emerald-600')}End-to-end encrypted · key never leaves your device
        </div>
      </div>
    </div>`

  const title = root.querySelector('[data-gate-title]')
  const desc = root.querySelector('[data-gate-desc]')
  const errorBox = root.querySelector('[data-gate-error]')
  const action = root.querySelector('[data-gate-action]')
  const actionIcon = root.querySelector('[data-gate-action-icon]')
  const actionLabel = root.querySelector('[data-gate-action-label]')
  const keyBtn = root.querySelector('[data-gate-key]')

  const available = webAuthnAvailable()

  function render() {
    const state = passkey.get()
    const enrolled = state.enrolled
    const busy = state.status === 'busy'
    const unlocked = state.status === 'unlocked'
    if (unlocked) return

    title.textContent = enrolled ? 'Unlock S' : 'Create your passkey'
    desc.textContent = enrolled
      ? 'Authenticate with your passkey to decrypt your messages and data on this device.'
      : 'S is end-to-end encrypted. Your passkey derives the key that locks everything on this device. Nothing secret is stored — it can be re-derived on demand.'
    actionLabel.textContent = busy ? 'Waiting for authenticator…' : enrolled ? 'Unlock with passkey' : 'Create a passkey'
    action.disabled = busy || !available
    keyBtn.disabled = busy || !available
    keyBtn.classList.toggle('hidden', !available)
    if (!available) {
      title.textContent = 'WebAuthn unavailable'
      desc.textContent = 'This browser does not expose the WebAuthn/passkey APIs S needs to derive its encryption key. Open S in a browser with passkey support.'
    }

    errorBox.classList.toggle('hidden', !state.error)
    if (state.error) errorBox.textContent = state.error
    actionIcon.innerHTML = ICON(busy ? KeyRound : Fingerprint, 'size-4')
  }

  async function run(enroll) {
    if (passkey.get().status === 'busy') return
    const next = enroll ? await enrollPasskey(PROFILE_NAME) : await unlockPasskey()
    if (next.error) render()
  }

  action.addEventListener('click', () => void run(!passkey.get().enrolled))
  keyBtn.addEventListener('click', () => void run(!passkey.get().enrolled))
  passkey.subscribe(render)
}
