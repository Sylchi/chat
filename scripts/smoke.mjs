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

const app = document.getElementById('app')
initWorkspace(app)

/* 1. rail removed, agent is a chat now */
assert(!document.querySelector('#agent-rail'), 'agent rail overlay removed')
assert(document.querySelector('[data-chat="S agent"]'), 'S agent appears in chat list')
assert(document.querySelector('[data-desktop-sidebar] [data-nav-custom="agent"]'), 'sidebar has S agent button')
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
assert(document.getElementById('thread-messages').textContent.includes('The new photos are beautiful'), 'Maya thread renders')
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
  document.querySelector('[data-model-progress-text]')?.textContent.includes('50% · 242 MB / 483 MB'),
  'progress bar text shows MB progress',
)
assert(document.querySelector('[data-model-progress-bar]')?.style.width === '50%', 'progress bar width bound to state')
agentModel.set({ ...agentModel.get(), status: 'error', error: 'GPU ran out of memory' })
assert(document.querySelector('[data-model-error]')?.textContent === 'GPU ran out of memory', 'error surfaced in panel')

/* 10. sidebar agent button */
agentModel.set({ ...agentModel.get(), status: 'idle', error: '', percent: 0, total: 0, loaded: 0, file: '' })
click(document.querySelector('[data-desktop-sidebar] [data-nav-custom="agent"]'))
assert(document.getElementById('chat-title')?.textContent === 'S agent', 'sidebar button opens agent chat')

/* 11. contacts view still wires into chats */
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

/* 14. persistence to localStorage */
store.appendMessage('Priya Shah', { from: 'me', id: 'p-t', text: 'persisted!', time: 'Now' })
assert(
  JSON.parse(localStorage.getItem('s:threads'))['Priya Shah']?.some((m) => m.text === 'persisted!'),
  'threads persisted to localStorage',
)
store.draft.set('draft text')
assert(JSON.parse(localStorage.getItem('s:draft')) === 'draft text', 'draft persisted to localStorage')
store.activeChat.set('Ava Singh')
assert(JSON.parse(localStorage.getItem('s:active-chat')) === 'Ava Singh', 'active chat persisted to localStorage')
store.completedTasks.set([{ id: 't1' }])
assert(JSON.parse(localStorage.getItem('s:tasks')).length === 1, 'tasks persisted to localStorage')

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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed')
process.exit(failures ? 1 : 0)