import { Fingerprint, ShieldCheck, Usb } from '../vendor/icons.js'
import { brandMark, icon } from '../dom.js'
import { enrollPasskey, passkey, unlockPasskey } from '../passkey-store.js'

// Full-screen gate shown until the passkey unlocks the at-rest vault. Without
// an unlock the workspace is never mounted, so no ciphertext is decrypted and
// no plaintext exists in the DOM.
//
// One action, one choice: the same passkey can live on the built-in
// authenticator (biometrics / device unlock, FIDO2 platform) or on a roaming
// security key (cross-platform). The gate defaults to whatever was configured
// at enrollment and lets the other be picked with the link underneath.

const PROFILE_NAME = 'S user'

function webAuthnAvailable() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

const ICON = (iconNode, klass) => icon(iconNode, klass)

export function initGate(root) {
  root.innerHTML = `
    <div class="flex h-dvh items-center justify-center bg-background p-5 text-foreground">
      <div class="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-[0_24px_80px_-35px_rgba(15,23,42,0.35)]">
        <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-brand-foreground">${brandMark('size-7')}</div>
        <h1 data-gate-title class="mt-6 text-2xl font-semibold tracking-tight">Welcome to S</h1>
        <p data-gate-desc class="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-muted-foreground"></p>
        <div data-gate-error class="mt-5 hidden rounded-xl bg-rose-500/10 p-3 text-left text-xs leading-relaxed text-rose-600"></div>
        <button data-gate-action class="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
          <span data-gate-action-icon>${ICON(Fingerprint, 'size-4')}</span>
          <span data-gate-action-label>Continue</span>
        </button>
        <button type="button" data-gate-key class="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60">
          <span data-gate-key-label>Use a security key instead</span>
        </button>
        <div class="mt-7 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          ${ICON(ShieldCheck, 'size-3.5 text-emerald-600')}End-to-end encrypted · keys stay on this device
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
  const keyLabel = root.querySelector('[data-gate-key-label]')

  const available = webAuthnAvailable()
  let chosen // undefined = follow the enrolled preference, 'platform' | 'cross-platform' once toggled

  function usesSecurityKey(state) {
    if (chosen !== undefined) return chosen === 'cross-platform'
    return state.attachment === 'cross-platform'
  }

  function render() {
    const state = passkey.get()
    if (state.status === 'unlocked') return
    const enrolled = state.enrolled
    const busy = state.status === 'busy'
    const securityKey = usesSecurityKey(state)

    errorBox.classList.toggle('hidden', !state.error)
    if (state.error) errorBox.textContent = state.error

    if (!available) {
      title.textContent = 'WebAuthn unavailable'
      desc.textContent = 'This browser does not expose the WebAuthn/passkey APIs S needs to derive its encryption key. Open S in a browser with passkey support.'
      actionLabel.textContent = enrolled ? 'Unlock with passkey' : 'Create a passkey'
      actionIcon.innerHTML = ICON(Fingerprint, 'size-4')
      action.disabled = true
      keyBtn.classList.add('hidden')
      return
    }

    keyBtn.classList.remove('hidden')
    keyBtn.disabled = busy
    keyLabel.textContent = securityKey ? 'Use biometrics instead' : 'Use a security key instead'
    action.disabled = busy
    actionIcon.innerHTML = ICON(securityKey ? Usb : Fingerprint, 'size-4')

    if (enrolled) {
      title.textContent = 'Welcome back'
      desc.textContent = securityKey
        ? 'Touch your security key to unlock S on this device.'
        : 'Use your fingerprint, face, or device unlock to open S.'
      actionLabel.textContent = busy ? 'Waiting for authenticator…' : securityKey ? 'Unlock with security key' : 'Unlock with biometrics'
    } else {
      title.textContent = 'Set up your passkey'
      desc.textContent = securityKey
        ? 'A security key will derive the key that locks your data on this device. Nothing secret is stored — it can be re-derived on demand.'
        : 'Your fingerprint, face, or device unlock derives the key that locks your data here. Nothing secret is stored — it can be re-derived on demand.'
      actionLabel.textContent = busy ? 'Waiting for authenticator…' : securityKey ? 'Set up a security key' : 'Create a passkey'
    }
  }

  async function run() {
    if (passkey.get().status === 'busy') return
    const state = passkey.get()
    const attachment = usesSecurityKey(state) ? 'cross-platform' : 'platform'
    const next = state.enrolled ? await unlockPasskey(attachment) : await enrollPasskey(PROFILE_NAME, attachment)
    if (next.error) render()
  }

  action.addEventListener('click', () => void run())
  keyBtn.addEventListener('click', () => {
    chosen = usesSecurityKey(passkey.get()) ? 'platform' : 'cross-platform'
    render()
  })
  passkey.subscribe(render)
}
