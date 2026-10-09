// DOM smoke test for the workspace + S agent + model panel + emoji picker.
// Runs under Node with linkedom (no browser needed). Keeps accidental regressions
// out of the committed UI: every past-ui bug this file was written to catch is
// a regression in chat.js/workspace.js re-rendering, so keep assertions aligned.
import { parseHTML } from 'linkedom'

const { window, document } = parseHTML(
  '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
)

globalThis.window = window
globalThis.document = document
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.MouseEvent = window.MouseEvent
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.CSS = { escape: (value) => String(value).replace(/[^\w-]/g, (ch) => `\\${ch}`) }
globalThis.localStorage = {
  store: {},
  getItem(key) { return this.store[key] ?? null },
  setItem(key, value) { this.store[key] = String(value) },
  removeItem(key) { delete this.store[key] },
}

/* minimal IndexedDB so the REAL openIdbStore path is exercised (not a shim) */
;(() => {
  const databases = new Map()
  const enqueue = (fn) => queueMicrotask(fn)
  const request = () => ({ onsuccess: null, onerror: null, result: null, error: null })
  const run = (map, fn) => {
    const r = request()
    enqueue(() => {
      r.result = fn(map)
      if (r.onsuccess) r.onsuccess({ target: r })
    })
    return r
  }
  class FakeStore {
    constructor(map) { this.map = map }
    get(key) { return run(this.map, (m) => (m.has(key) ? m.get(key) : undefined)) }
    put(value, key) { return run(this.map, (m) => (m.set(key, value), key)) }
    delete(key) { return run(this.map, (m) => (m.delete(key), undefined)) }
    openCursor(range) {
      const r = request()
      const lower = range?.lower ?? ''
      const upper = range ? range.upper : '\uffff'
      const keys = [...this.map.keys()].filter((k) => k >= lower && k <= upper).sort()
      let i = 0
      const emit = () => {
        if (i >= keys.length) {
          r.result = null
          if (r.onsuccess) r.onsuccess({ target: r })
          return
        }
        const k = keys[i++]
        r.result = { key: k, value: this.map.get(k), continue: () => enqueue(emit) }
        if (r.onsuccess) r.onsuccess({ target: r })
      }
      enqueue(emit)
      return r
    }
  }
  class FakeDB {
    constructor() {
      this._stores = new Map()
      this.objectStoreNames = { contains: (name) => this._stores.has(name) }
    }
    createObjectStore(name) {
      const map = new Map()
      this._stores.set(name, map)
      return new FakeStore(map)
    }
    transaction() {
      return { objectStore: (name) => new FakeStore(this._stores.get(name)) }
    }
  }
  globalThis.indexedDB = {
    open(name, version) {
      const r = request()
      enqueue(() => {
        let db = databases.get(name)
        const isNew = !db
        if (isNew) {
          db = new FakeDB()
          databases.set(name, db)
        }
        r.result = db
        if (isNew && r.onupgradeneeded) r.onupgradeneeded({ target: r })
        if (r.onsuccess) r.onsuccess({ target: r })
      })
      return r
    },
  }
  globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) }
})()

/* linkedom gaps that real browsers provide */
const TA = window.HTMLTextAreaElement
if (!TA.prototype.setSelectionRange) TA.prototype.setSelectionRange = function (s, e) { this.__sel = [s, e] }
if (!Object.getOwnPropertyDescriptor(TA.prototype, 'selectionStart')) {
  Object.defineProperty(TA.prototype, 'selectionStart', { configurable: true, get() { return this.__sel?.[0] ?? this.value.length } })
  Object.defineProperty(TA.prototype, 'selectionEnd', { configurable: true, get() { return this.__sel?.[1] ?? this.value.length } })
}
if (!window.Element.prototype.focus) window.Element.prototype.focus = function () {}
const SEL = window.HTMLSelectElement
Object.defineProperty(SEL.prototype, 'value', {
  configurable: true,
  get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value },
  set(v) {
    for (const opt of this.querySelectorAll('option')) {
      if (opt.value === v) opt.setAttribute('selected', '')
      else opt.removeAttribute('selected')
    }
  },
})

let failures = 0
const assert = (cond, msg) => {
  if (cond) console.log(`ok   - ${msg}`)
  else { failures++; console.log(`FAIL - ${msg}`) }
}
const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const input = (el) => el.dispatchEvent(new window.Event('input', { bubbles: true }))
const key = (target, k) => {
  const event = new window.Event('keydown', { bubbles: true })
  Object.defineProperty(event, 'key', { value: k })
  target.dispatchEvent(event)
}
const type = (el, value) => { el.value = value; input(el) }

const { initWorkspace } = await import('../src/views/workspace.js')
const { agentBusy, agentModel } = await import('../src/agent/model.js')
const { AGENT_CHAT } = await import('../src/chats.js')
const { localKeyFromPRF } = await import('../lib/identity.js')
const { toBase64Url } = await import('../lib/crypto.js')
const vault = await import('../src/vault.js')

/* unlock the at-rest vault (no WebAuthn in this env) so persistence is sealed */
await vault.unlockVault(await localKeyFromPRF(new Uint8Array(32).fill(1)))

const app = document.getElementById('app')
initWorkspace(app)

/* 1. rail removed, agent is a chat now */
assert(!document.querySelector('#agent-rail'), 'agent rail overlay removed')
assert(document.querySelector('[data-chat="S agent"]'), 'S agent appears in chat list')
assert(document.querySelector('[data-desktop-sidebar] [data-nav="Inbox"]'), 'sidebar uses the single nav list')
assert(document.querySelector('[data-chat="S agent"] [data-agent-preview]'), 'agent chat list row has live preview')

/* 2. open agent chat */
click(document.querySelector('[data-chat="S agent"]'))
assert(document.getElementById('chat-title')?.textContent === 'S agent', 'header shows S agent')
assert(document.querySelector('[data-model-pill]')?.textContent === 'No model loaded', 'model status pill initial text')
assert(document.querySelectorAll('[data-suggest]').length === 3, 'three suggestion prompts render')
assert(document.body.textContent.includes('Private by design'), 'agent bio card renders')
assert(document.querySelector('[data-agent-hint]')?.textContent.includes('No model loaded'), 'composer hint shows no-model state')

/* 3. suggestion prefills composer */
const composer = document.getElementById('composer')
click(document.querySelector('[data-suggest]'))
assert(composer.value === 'Plan my week from my calendar', 'suggestion prefills composer')
assert(document.querySelector('[data-suggest]').dataset.suggest.length > 0, 'suggestion has text payload')

/* 4. sending without a model appends one CTA + opens panel */
type(composer, 'hello?')
const sendBtn = document.querySelector('[data-role="send"]')
click(sendBtn)
const thread = document.getElementById('thread-messages')
assert(thread.textContent.includes('Load a model'), 'CTA bubble shown when no model')
assert(!document.querySelector('[data-modal="model"]').classList.contains('hidden'), 'model panel opens on send')
const firstAssistant = thread.querySelectorAll('[data-action="open-model"]').length
type(composer, 'again?')
click(sendBtn)
assert(
  thread.querySelectorAll('[data-action="open-model"]').length === firstAssistant,
  'no duplicate CTA bubble on repeated send',
)

/* 5. escape closes model panel, then emoji picker */
key(document, 'Escape')
assert(document.querySelector('[data-modal="model"]').classList.contains('hidden'), 'escape closes model panel')

/* 6. model panel tabs */
click(document.querySelector('[data-role="model-panel"]'))
click(document.querySelector('[data-source-tab="local"]'))
assert(!document.querySelector('[data-local-pane]').classList.contains('hidden'), 'local tab shows local pane')
assert(document.querySelector('[data-hf-pane]').classList.contains('hidden'), 'local tab hides hf pane')
click(document.querySelector('[data-source-tab="hf"]'))
assert(!document.querySelector('[data-hf-pane]').classList.contains('hidden'), 'hf tab shows hf pane')
key(document, 'Escape')
assert(document.querySelector('[data-modal="model"]').classList.contains('hidden'), 'panel closed again')

/* 7. emoji picker */
const emojiBtn = document.querySelector('[data-role="emoji"]')
click(emojiBtn)
const picker = document.querySelector('[data-emoji-picker]')
assert(!picker.classList.contains('hidden'), 'emoji picker opens')
const search = document.querySelector('[data-emoji-search]')
type(search, 'pizza')
assert(picker.textContent.includes('🍕'), 'search finds pizza')
const pizza = picker.querySelector('[data-emoji="🍕"]')
assert(!!pizza, 'pizza button rendered')
click(pizza)
assert(composer.value.includes('🍕'), 'emoji inserted into composer at caret')
assert(JSON.parse(localStorage.getItem('s:recent-emoji')).includes('🍕'), 'recent emoji persisted')
type(search, 'zzzznotfound')
assert(picker.textContent.includes('No emoji found'), 'empty search state')

/* escape closes picker when panel is closed */
key(document, 'Escape')
assert(picker.classList.contains('hidden'), 'escape closes emoji picker')

/* 8. switching chats keeps threads separate */
click(document.querySelector('[data-chat="Maya Chen"]'))
assert(document.getElementById('chat-title')?.textContent === 'Maya Chen', 'header switches to Maya Chen')
assert(
  document.getElementById('thread-messages').textContent.includes('No messages yet'),
  'threads start empty and honest — no fabricated seed messages',
)
assert(!document.querySelector('[data-suggest]'), 'no agent suggestions in human chat')
assert(composer.placeholder === 'Write a message…', 'placeholder reverts for human chat')

type(composer, 'thanks!')
click(sendBtn)
assert(document.getElementById('thread-messages').textContent.includes('thanks!'), 'human message appended')

click(document.querySelector('[data-chat="S agent"]'))
assert(document.getElementById('chat-title')?.textContent === 'S agent', 'back to agent chat')
assert(composer.placeholder === 'Ask S anything…', 'agent composer placeholder')
assert(document.getElementById('thread-messages').textContent.includes('Load a model'), 'agent thread preserved across switches')
assert(!document.getElementById('thread-messages').textContent.includes('thanks!'), 'human message not leaked into agent thread')

/* 9. live model status drives pill, hint and chat-list preview */
agentModel.set({ ...agentModel.get(), status: 'ready', device: 'webgpu', percent: 100 })
assert(document.querySelector('[data-model-pill]')?.textContent === 'Ready · WebGPU', 'pill reflects ready state')
assert(document.querySelector('[data-agent-hint]')?.textContent.includes('Model ready'), 'hint reflects ready state')
assert(document.querySelector('[data-agent-preview]')?.textContent === 'Ready · WebGPU', 'chat list preview reflects ready state')

agentModel.set({ ...agentModel.get(), status: 'loading', total: 483000000, loaded: 241500000, percent: 50, file: 'onnx/model_q4f16.onnx' })
assert(document.querySelector('[data-model-pill]')?.textContent === 'Downloading 50%', 'pill shows download progress')
click(document.querySelector('[data-role="model-panel"]'))
assert(
  document.querySelector('[data-model-progress-text]')?.textContent.includes('50% · 230.3 MB / 460.6 MB'),
  'progress bar text shows MB progress',
)
assert(document.querySelector('[data-model-progress-bar]')?.style.width === '50%', 'progress bar width bound to state')
agentModel.set({ ...agentModel.get(), status: 'error', error: 'GPU ran out of memory' })
assert(document.querySelector('[data-model-error]')?.textContent === 'GPU ran out of memory', 'error surfaced in panel')

/* 10. reopening the agent chat from the chat list */
agentModel.set({ ...agentModel.get(), status: 'idle', error: '', percent: 0, total: 0, loaded: 0, file: '' })
click(document.querySelector('[data-chat="S agent"]'))
assert(document.getElementById('chat-title')?.textContent === 'S agent', 'chat list opens the agent chat')

/* 11. contacts view still wires into chats */
const contactsStore = await import('../src/contacts-store.js')
await contactsStore.initContacts()
click(document.querySelector('[data-nav="Contacts"]'))
const messageBtn = document.querySelector('[data-message-contact="Priya Shah"]')
if (messageBtn) {
  click(messageBtn)
  assert(document.getElementById('chat-title')?.textContent === 'Priya Shah', 'contact Message button opens chat with derived avatar meta')
  assert(document.getElementById('thread-messages').textContent.includes('No messages yet'), 'empty state for unknown contact')
}

/* 12. streaming bubble contract (pending anchor + finalize) */
const store = await import('../src/store.js')
click(document.querySelector('[data-chat="S agent"]'))
store.appendMessage('S agent', { from: 'agent', id: 'm-test', pending: true, text: '', time: 'Now' })
assert(!!document.querySelector('[data-msg-body="m-test"]'), 'pending bubble renders streaming anchor')
store.updateMessage('S agent', 'm-test', { pending: false, text: 'streamed reply', time: 'Now' })
assert(document.getElementById('thread-messages').textContent.includes('streamed reply'), 'streamed reply finalized in thread')

/* 13. mobile chat drawer (below lg) */
const chatDrawer = document.querySelector('[data-chat-drawer]')
const chatOverlay = document.querySelector('[data-chat-overlay]')
assert(!!chatDrawer && chatDrawer.classList.contains('translate-x-full'), 'chat drawer starts closed')
click(document.querySelector('[data-role="chats"]'))
assert(chatDrawer.classList.contains('translate-x-0'), 'chats button opens drawer')
assert(!chatOverlay.classList.contains('hidden'), 'drawer overlay visible')
click(chatDrawer.querySelector('[data-chat="Jordan Blake"]'))
assert(chatDrawer.classList.contains('translate-x-full'), 'picking a chat closes drawer')
assert(document.getElementById('chat-title')?.textContent === 'Jordan Blake', 'drawer chat selection navigates')
click(document.querySelector('[data-role="chats"]'))
assert(chatDrawer.classList.contains('translate-x-0'), 'drawer opens again')
key(document, 'Escape')
assert(chatDrawer.classList.contains('translate-x-full'), 'escape closes chat drawer')

/* 13b. M1 honest-data panels: honest device copy, calendar, tasks, settings */
const syncSpan = document.querySelector('[data-device-count]')
assert(!!syncSpan && syncSpan.textContent === 'This device', 'device copy is honest (no fake “synced” claims)')
assert(
  !document.querySelector('[data-desktop-sidebar] [data-side-row="profile"]'),
  'no fake profile row in the sidebar',
)
assert(!!document.getElementById('header-greeting'), 'header shows a neutral greeting, not a fake name')

click(document.querySelector('[data-role="account"]'))
const accountMenu = document.querySelector('[data-account-menu]')
assert(!accountMenu.hidden, 'account avatar opens the context menu')
assert(!!accountMenu.querySelector('[data-account-device]'), 'account menu surfaces this device')
click(accountMenu.querySelector('[data-theme-option="dark"]'))
assert(document.documentElement.classList.contains('dark'), 'appearance > Dark applies the dark class')
click(accountMenu.querySelector('[data-theme-option="system"]'))
assert(!document.documentElement.classList.contains('dark'), 'appearance > System returns to the OS theme')
click(accountMenu.querySelector('[data-account-action="settings"]'))
assert(document.body.textContent.includes('At-rest encryption'), 'Settings view renders')
assert(
  document.querySelector('[data-settings-device]').textContent.includes('Initializing device…') ||
    document.querySelector('[data-settings-device]').textContent.includes('Device ID'),
  'Settings shows device facts',
)
assert(!!document.querySelector('[data-settings-lock]'), 'Settings offers Lock S now')

click(document.querySelector('[data-nav="Calendar"]'))
click(document.querySelector('[data-cal-new]'))
const calForm = document.querySelector('[data-cal-form]')
assert(!calForm.classList.contains('hidden'), 'calendar new-event form opens')
type(calForm.querySelector('[data-cal-title]'), 'Call with Maya')
type(calForm.querySelector('[data-cal-when]'), '2026-10-09T14:30')
click(calForm.querySelector('[data-cal-save]'))
assert(calForm.classList.contains('hidden'), 'calendar form closes after save')
assert(
  [...document.querySelectorAll('#calendar-list p')].some((p) => p.textContent.includes('Call with Maya')),
  'new calendar event renders',
)

click(document.querySelector('[data-nav="Tasks"]'))
click(document.querySelector('[data-task-new]'))
const taskForm = document.querySelector('[data-task-form]')
assert(!taskForm.classList.contains('hidden'), 'tasks add form opens')
type(taskForm.querySelector('[data-task-input]'), 'Ship the honest-data pass')
taskForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
assert(
  [...document.querySelectorAll('#tasks-list span')].some((s) => s.textContent.includes('Ship the honest-data pass')),
  'new task renders in the list',
)
assert(document.querySelector('[data-tasks-open]').textContent.includes('5 open items'), 'open task count reflects additions')

const searchEl = document.querySelector('[data-search]')
type(searchEl, 'zzz-nomatch')
assert(
  [...document.querySelectorAll('[data-chat-rows]')].some((rows) => rows.textContent.includes('No matches')),
  'search filters chats and shows an empty state',
)
type(searchEl, 'Maya')
assert(
  [...document.querySelectorAll('[data-chat-rows]')].some((rows) => rows.textContent.includes('Maya Chen')),
  'search matches a contact by name',
)
type(searchEl, '')
assert(
  [...document.querySelectorAll('[data-chat-rows]')].every((rows) => !rows.textContent.includes('No matches')),
  'clearing the search restores all chats',
)

/* 14. persistence is sealed at rest: readable in memory, ciphertext on disk */
const sealed = (key) => {
  const raw = localStorage.getItem(key)
  return !!raw && JSON.parse(raw).__s === 1
}
store.appendMessage('Priya Shah', { from: 'me', id: 'p-t', text: 'persisted!', time: 'Now' })
store.draft.set('draft text')
store.activeChat.set('Ava Singh')
store.completedTasks.set([{ id: 't1' }])
await vault.settled()
assert(store.threadFor('Priya Shah').some((m) => m.text === 'persisted!'), 'threads persisted in memory')
assert(sealed('s:threads') && !localStorage.getItem('s:threads').includes('persisted!'), 'threads sealed at rest (no plaintext)')
assert(sealed('s:draft') && !localStorage.getItem('s:draft').includes('draft text'), 'draft sealed at rest')
assert(store.activeChat.get() === 'Ava Singh' && sealed('s:active-chat'), 'active chat persisted sealed')
assert(sealed('s:tasks') && !localStorage.getItem('s:tasks').includes('t1'), 'tasks sealed at rest')

/* 15. agent: stop, cached resume, generation stats */
click(document.querySelector('[data-chat="S agent"]'))
const sendButton = document.querySelector('[data-role="send"]')
agentBusy.set(true)
assert(sendButton.getAttribute('aria-label') === 'Stop generating', 'send button turns into stop while busy')
const beforeStop = store.threadFor(AGENT_CHAT).length
type(composer, 'should not send while busy')
click(sendButton)
assert(store.threadFor(AGENT_CHAT).length === beforeStop, 'stop click does not enqueue a message')
agentBusy.set(false)
assert(sendButton.getAttribute('aria-label') === 'Send message', 'send button restored after generation')

localStorage.setItem('s:agent-model-loaded', '1')
agentModel.set({ ...agentModel.get() })
assert(document.querySelector('[data-agent-hint-text]')?.textContent.includes('cached'), 'idle hint shows cached model')
assert(document.querySelector('[data-role="model-load"] span')?.textContent === 'Load cached model', 'load button labels cached model')
assert(!document.querySelector('[data-action="load-cached"]').classList.contains('hidden'), 'load-now link visible when cached')
localStorage.removeItem('s:agent-model-loaded')
agentModel.set({ ...agentModel.get() })
assert(document.querySelector('[data-agent-hint-text]')?.textContent.includes('No model loaded'), 'hint returns to no-model state')

store.appendMessage(AGENT_CHAT, { from: 'agent', text: 'done', time: 'Now', stats: '42 tokens · 12 tok/s' })
assert(document.getElementById('thread-messages').textContent.includes('42 tokens · 12 tok/s'), 'generation stats render under message')

/* 16. device layer: IndexedDB principal, link modal, symmetric pairing code */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
/* crypto.subtle hops the threadpool, so single-tick flushes are racy — poll. */
const waitFor = async (cond, ticks = 200) => {
  for (let i = 0; i < ticks && !cond(); i++) await flush()
  return cond()
}
/* 15b. add a contact (mints an identity) from the Contacts view */
click(document.querySelector('[data-nav="Contacts"]'))
click(document.querySelector('[data-add-contact]'))
const contactModal = document.querySelector('[data-modal="contact"]')
assert(!contactModal.classList.contains('hidden'), 'Add contact modal opens')
key(document, 'Escape')
assert(contactModal.classList.contains('hidden'), 'escape closes the add-contact modal')
click(document.querySelector('[data-add-contact]'))
assert(!contactModal.classList.contains('hidden'), 'add-contact modal reopens')
type(contactModal.querySelector('[data-contact-name]'), 'Sam Rivera')
click(contactModal.querySelector('[data-contact-create]'))
const addedSam = await waitFor(() => contactsStore.contactByName('Sam Rivera'))
assert(!!addedSam && addedSam.userPub.length === 32, 'Add contact mints a full identity')
assert(!!document.querySelector('[data-chat="Sam Rivera"]'), 'new contact appears in the chat list')

/* 15b2. import contacts from vCard text (Google/Apple export format) */
click(document.querySelector('[data-nav="Contacts"]'))
click(document.querySelector('[data-import-contact]'))
const importModal = document.querySelector('[data-modal="import-contact"]')
assert(!importModal.classList.contains('hidden'), 'Import contacts modal opens')
const vcard = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Nadia Okafor',
  'N:Okafor;Nadia;;;',
  'EMAIL;TYPE=HOME:nadia@example.com',
  'TEL;TYPE=CELL:+1-555-0142',
  'END:VCARD',
].join('\r\n')
type(importModal.querySelector('[data-import-text]'), vcard)
click(importModal.querySelector('[data-import-paste]'))
const imported = await waitFor(() => contactsStore.contactByName('Nadia Okafor'))
assert(!!imported && imported.userPub.length === 32, 'imported vCard gets a minted S identity')
assert(imported.emails[0].value === 'nadia@example.com', 'imported vCard keeps standard fields')
assert(!!document.querySelector('[data-chat="Nadia Okafor"]'), 'imported contact appears in the chat list')
key(document, 'Escape')
assert(importModal.classList.contains('hidden'), 'escape closes the import modal')
assert(contactsStore.exportCards().includes('Nadia Okafor'), 'export produces vCard text for imported contacts')
click(document.querySelector('[data-nav="Inbox"]'))

/* 15c. outgoing messages to a contact are sealed end-to-end */
const composer2 = document.getElementById('composer')
const sendBtn2 = document.querySelector('[data-role="send"]')
type(composer2, 'sealed hello')
click(sendBtn2)
const sent = await waitFor(() => store.threadFor('Sam Rivera').find((m) => m.text === 'sealed hello' && m.sealed))
assert(!!sent?.sealed, 'outgoing contact message carries a sealed envelope')
const envelope = sent ? JSON.parse(sent.sealed) : null
assert(envelope?.v === 1 && envelope.to.user === toBase64Url(addedSam.userPub), 'envelope is addressed to the contact identity')

const devStore = await import('../src/device-store.js')
const device = await import('../lib/device.js')
const keystore = await import('../lib/keystore.js')

const devDB = await devStore.initDevices()
assert(!!devStore.localDevice.get(), 'device principal boots (devices-first)')
assert(!!devStore.localDevice.get().fingerprint, 'local device has fingerprint')
assert(
  localStorage.getItem('devices/local') === null && localStorage.getItem('devices/rootkey') === null,
  'device material lives in IndexedDB, not localStorage',
)

/* open the Link a device modal from the Devices view */
click(document.querySelector('[data-nav="Devices"]'))
await flush()
click(document.querySelector('#dev-link'))
await flush()
const linkModal = document.querySelector('[data-modal="link"]')
assert(!linkModal.classList.contains('hidden'), 'Link a device modal opens')
assert(await waitFor(() => !!linkModal.querySelector('[data-link-copy]')), 'link modal shows a copyable link code')

/* a second physical device pairing over the paste path */
const peerB = await device.createDevicePrincipal('laptop')
const localKp = await keystore.localDeviceKeypair(devDB)
const localPub = (await keystore.getLocalPrincipal(devDB)).pub
const myCode = device.pairingCode(await device.deviceLinkSecret(localKp.priv, localKp.pub, peerB.pub))
const theirCode = device.pairingCode(await device.deviceLinkSecret(peerB.priv, peerB.pub, localPub))
assert(myCode === theirCode && /^\d{6}$/.test(myCode), 'link secret symmetric on both devices')

type(linkModal.querySelector('[data-link-payload]'), JSON.stringify(device.peerPayload(peerB)))
click(linkModal.querySelector('[data-link-complete]'))
assert(await waitFor(() => devStore.pairCode.get() === myCode), 'pair code derived for the new peer')

const linkedList = await devStore.refreshLinked()
assert(linkedList.length === 1 && linkedList[0].id === peerB.id, 'peer persisted under devices/linked/')
assert(devStore.pairCode.get() === myCode, 'pair code matches the keystore-derived secret')
assert(linkModal.querySelector('[data-link-body]').textContent.includes(myCode), 'modal renders the 6-digit verify code')
assert(linkModal.querySelector('[data-link-body]').textContent.includes('Linked devices (1)'), 'linked list rendered in modal')

/* Trusted devices section derives the per-peer code */
click(document.querySelector('[data-nav="Devices"]'))
await flush()
const trustedId = document.querySelector('[data-device-link-id]')
assert(!!trustedId && trustedId.textContent.length > 0, 'trusted device row rendered')
assert(
  await waitFor(() =>
    [...document.querySelectorAll('[data-device-link-code]')].some((cell) => cell.textContent === myCode),
  ),
  'trusted device shows the same symmetric code',
)

/* error paths: malformed payload + self-link rejected */
if (linkModal.classList.contains('hidden')) {
  click(document.querySelector('#dev-link'))
  await flush()
}
type(linkModal.querySelector('[data-link-payload]'), 'not json')
click(linkModal.querySelector('[data-link-complete]'))
assert(
  await waitFor(() => linkModal.querySelector('[data-link-body]').textContent.includes('valid JSON')),
  'malformed payload surfaces an error',
)

const selfJson = JSON.stringify(device.peerPayload({ id: devStore.localDevice.get().id, name: 'self', pub: devStore.localDevice.get().pub }))
/* the body re-renders on every error, so re-query the textarea each time */
type(linkModal.querySelector('[data-link-payload]'), selfJson)
click(linkModal.querySelector('[data-link-complete]'))
assert(
  await waitFor(() => linkModal.querySelector('[data-link-body]').textContent.includes('cannot link')),
  'self-link rejected',
)

await devStore.removeLinkedDevice(peerB.id)
assert((await devStore.refreshLinked()).length === 0, 'unlink removes the peer')

/* 17. passkey layer: enrollment facts drive the modal, errors are surfaced */
const passkeyStore = await import('../src/passkey-store.js')
const passkeyKeystore = await import('../lib/keystore.js')
const passkeyCrypto = await import('../lib/crypto.js')

const pkStore = await devStore.backend()
await passkeyKeystore.enrollFromPrf(
  pkStore,
  passkeyCrypto.randomBytes(32),
  'fake-cred-id',
  'Alex Rivera',
  passkeyCrypto.randomBytes(32),
)
await passkeyStore.initPasskey()
assert(
  passkeyStore.passkey.get().enrolled && passkeyStore.passkey.get().status === 'locked',
  'initPasskey reads enrollment facts from the store',
)

click(document.querySelector('[data-nav="Settings"]'))
await flush()
click(document.querySelector('[data-settings-passkeys]'))
await flush()
const authModal = document.querySelector('[data-modal="auth"]')
assert(!authModal.classList.contains('hidden'), 'Passkeys modal opens')
assert(
  authModal.querySelector('[data-auth-platform]')?.textContent.includes('Unlock with passkey'),
  'enrolled modal offers unlock',
)

click(authModal.querySelector('[data-auth-platform]'))
await flush()
await flush()
assert(
  authModal.querySelector('[data-auth-body]').textContent.includes('WebAuthn unavailable'),
  'WebAuthn failure surfaced in the modal instead of a silent close',
)
assert(!authModal.classList.contains('hidden'), 'modal stays open after a failed unlock')
assert(passkeyStore.passkey.get().status === 'locked', 'failed unlock returns to locked')

await passkeyStore.enrollPasskey('second root')
assert(
  passkeyStore.passkey.get().error?.includes('Already enrolled'),
  'enrollment is refused once a root exists',
)
assert(passkeyStore.passkey.get().status === 'locked', 'refused enrollment keeps the locked state')

/* Escape goes to the topmost open layer — close the link modal first */
click(linkModal.querySelector('[data-link-close]'))
key(document, 'Escape')
assert(authModal.classList.contains('hidden'), 'escape closes the passkeys modal')

/* 18. lock gate tracks passkey state (WebAuthn absent in this env) */
const { initGate } = await import('../src/views/gate.js')
const gateEl = document.createElement('div')
initGate(gateEl)
await flush()
assert(gateEl.querySelector('[data-gate-action-label]').textContent === 'Unlock with passkey', 'gate offers unlock when enrolled + locked')
assert(gateEl.querySelector('[data-gate-title]').textContent === 'WebAuthn unavailable', 'gate warns when WebAuthn is missing')
assert(gateEl.querySelector('[data-gate-key]').classList.contains('hidden'), 'security-key fallback hidden without WebAuthn')

passkeyStore.passkey.set({ ...passkeyStore.passkey.get(), status: 'unknown', enrolled: false })
assert(gateEl.querySelector('[data-gate-action-label]').textContent === 'Create a passkey', 'gate shows onboarding when unenrolled')

/* 19. Lock S now locks the vault and stops future plaintext reaching disk */
const { completedTasks } = await import('../src/store.js')
const { taskList } = await import('../src/views/panels.js')
click(document.querySelector('[data-nav="Settings"]'))
click(document.querySelector('[data-settings-lock]'))
assert(vault.isUnlocked() === false, 'Lock S now locks the at-rest vault')
assert(taskList.get().length === 0, 'locking blanks the task list atoms (no plaintext lingers)')
assert(completedTasks.get().length === 0, 'locking blanks the completed list atom')
store.draft.set('locked secrets')
await vault.settled()
const draftRaw = localStorage.getItem('s:draft')
assert(!!draftRaw && !draftRaw.includes('locked secrets'), 'no post-lock plaintext reaches disk')

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed')
process.exit(failures ? 1 : 0)