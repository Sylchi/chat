import {
  CalendarDays,
  Check,
  Download,
  FileImage,
  FolderOpen,
  GalleryHorizontalEnd,
  ListTodo,
  Mic,
  Paperclip,
  Send,
  Settings2,
  ShieldCheck,
  Smile,
  Sparkles,
  X,
  Zap,
} from '../vendor/icons.js'
import { batch } from '../vendor/store.js'
import { avatar, esc, formatBytes, icon } from '../dom.js'
import { AGENT_CHAT, chatMeta } from '../chats.js'
import { activeChat, appendMessage, draft, sharedFiles, threadFor, threads, updateMessage } from '../store.js'
import {
  agentBusy,
  agentModel,
  agentStatusText,
  DEFAULT_MODEL,
  generateAgentReply,
  hasCachedModel,
  loadModel,
  pickLocalDirectory,
  requestStop,
  restoreLocalDirectory,
  unloadModel,
} from '../agent/model.js'
import { EMOJI_CATEGORIES, pushRecentEmoji, readRecentEmoji, searchEmoji, splitEntry } from '../emoji.js'
import { contactByName } from '../contacts-store.js'
import { sealMessage } from '../messages.js'

const isAgent = (name = activeChat.get()) => name === AGENT_CHAT

const SUGGESTIONS = [
  { icon: CalendarDays, title: 'Plan my week', hint: 'Organize your calendar', text: 'Plan my week from my calendar' },
  { icon: ListTodo, title: 'Triage my tasks', hint: '4 items need attention', text: 'Triage my tasks and tell me what to do first' },
  { icon: GalleryHorizontalEnd, title: 'Find a memory', hint: 'Search your timeline', text: 'Help me find a memory from last weekend' },
]

const DOTS = `<span class="flex items-center gap-1 py-1"><span class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]"></span><span class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]"></span><span class="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]"></span></span>`

const emojiButton = (char, keywords) =>
  `<button type="button" data-emoji="${esc(char)}" title="${esc(keywords)}" class="rounded-lg p-1 text-lg leading-none hover:bg-accent">${char}</button>`

function renderMessage(message, meta) {
  const fromMe = message.from === 'me'
  const body = `<p${message.id ? ` data-msg-body="${esc(message.id)}"` : ''}>${message.pending ? DOTS : esc(message.text)}</p>`
  const action =
    message.action === 'load-model'
      ? `<button data-action="open-model" class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground">${icon(Download, 'size-3')}Load a model</button>`
      : ''
  const stats = message.stats ? ` · ${esc(message.stats)}` : ''
  return `
    <div class="flex items-end gap-2 ${fromMe ? 'justify-end' : ''}">
      ${fromMe ? '' : avatar(meta.initials, meta.color, meta.online)}
      <div class="max-w-[78%] rounded-2xl px-4 py-3 text-sm ${fromMe ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted'}">
        ${body}${action}
        <div class="mt-1.5 flex items-center justify-end gap-1 text-[10px] ${fromMe ? 'text-primary-foreground/65' : 'text-muted-foreground'}">
          ${esc(message.time)}${message.sealed ? icon(ShieldCheck, 'size-3') : ''}${fromMe ? icon(Check, 'size-3') : ''}${stats}
        </div>
      </div>
    </div>`
}

function renderSecurityPill() {
  return `
    <div class="mx-auto flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
      ${icon(ShieldCheck, 'size-3 text-emerald-600')}&#160;Messages are end-to-end encrypted
    </div>`
}

function renderAgentIntro() {
  return `
    <div class="mx-auto flex w-full max-w-md items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
      ${icon(Sparkles, 'size-3 text-violet-500')}&#160;S agent runs locally on this device — no cloud, no account
    </div>
    <div class="mx-auto w-full max-w-md rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 p-4 dark:from-violet-950/30 dark:to-indigo-950/30">
      <p class="text-sm font-medium leading-relaxed">“I’m here whenever you need me. Your data never leaves this device.”</p>
      <div class="mt-3 flex items-center gap-1.5 text-[10px] text-violet-700 dark:text-violet-300">${icon(Zap, 'size-3')}Private by design</div>
    </div>
    <div class="mx-auto grid w-full max-w-md gap-2">
      <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Suggested for you</p>
      ${SUGGESTIONS.map(
        (item) => `
        <button data-suggest="${esc(item.text)}" class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-accent">
          ${icon(item.icon, 'size-4 text-muted-foreground')}
          <span><span class="block font-medium">${esc(item.title)}</span><span class="text-[10px] text-muted-foreground">${esc(item.hint)}</span></span>
        </button>`,
      ).join('')}
    </div>`
}

function renderThread() {
  const name = activeChat.get()
  const meta = chatMeta(name)
  const thread = threadFor(name)
  if (isAgent(name)) {
    const hasUser = thread.some((message) => message.from === 'me')
    return `${hasUser ? '' : renderAgentIntro()}${thread.map((message) => renderMessage(message, meta)).join('')}`
  }
  if (!thread.length) {
    return `${renderSecurityPill()}
      <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        ${avatar(meta.initials, meta.color, meta.online)}
        <p class="mt-2 text-sm font-medium">${esc(name)}</p>
        <p class="text-xs text-muted-foreground">No messages yet — say hi 👋</p>
      </div>`
  }
  return `${renderSecurityPill()}${thread.map((message) => renderMessage(message, meta)).join('')}`
}

function headerHtml() {
  const name = activeChat.get()
  const meta = chatMeta(name)
  if (isAgent(name)) {
    return `
      <div class="flex items-center gap-3">
        ${avatar(meta.initials, meta.color, true)}
        <div>
          <div class="flex items-center gap-2">
            <h2 id="chat-title" class="text-sm font-semibold">${esc(name)}</h2>
            <span data-model-pill class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">${esc(agentStatusText())}</span>
          </div>
          <p class="text-[11px] text-muted-foreground">Runs on this device · nothing is uploaded</p>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button data-role="model-panel" aria-label="Model settings" title="Model settings" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(Settings2)}</button>
      </div>`
  }
  return `
    <div class="flex items-center gap-3">
      ${avatar(meta.initials, meta.color, meta.online)}
      <div>
        <h2 id="chat-title" class="text-sm font-semibold">${esc(name)}</h2>
        <p class="text-[11px] text-muted-foreground">${meta.online ? 'online' : 'end-to-end encrypted'}</p>
      </div>
    </div>`
}

function modelModalHtml() {
  return `
    <div data-modal="model" class="hidden absolute inset-0 z-40 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="S model settings" class="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-lg font-semibold">S model</p>
            <p class="mt-1 text-sm text-muted-foreground">Loads on this device from Hugging Face or a local folder. Nothing is uploaded.</p>
          </div>
          <button data-model-close aria-label="Close model settings" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
        </div>

        <div class="mt-5 flex gap-1 rounded-xl bg-muted/60 p-1">
          <button data-source-tab="hf" class="flex-1 rounded-lg px-3 py-2 text-xs font-medium">Hugging Face</button>
          <button data-source-tab="local" class="flex-1 rounded-lg px-3 py-2 text-xs font-medium">Local folder</button>
        </div>

        <div class="mt-4 space-y-3">
          <label class="block">
            <span class="text-[11px] font-medium text-muted-foreground">Model id</span>
            <input data-model-id class="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20" placeholder="${DEFAULT_MODEL}" spellcheck="false" />
          </label>

          <div data-hf-pane class="rounded-xl bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Downloads once (~483&nbsp;MB for q4f16), then your browser caches it. Network is only needed the first time.
          </div>

          <div data-local-pane class="hidden space-y-3">
            <div class="rounded-xl border border-border bg-muted/40 p-3">
              <button data-pick-folder class="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent">${icon(FolderOpen, 'size-3.5')}Choose folder</button>
              <p data-folder-name class="mt-2 truncate text-[11px] text-muted-foreground">No folder chosen</p>
              <p class="mt-1 text-[10px] leading-relaxed text-muted-foreground">Pick the folder that holds <span class="font-mono">config.json</span> and <span class="font-mono">onnx/</span> — nothing leaves this device.</p>
            </div>
            <label class="block">
              <span class="text-[11px] font-medium text-muted-foreground">…or a path this site serves</span>
              <input data-local-path class="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/20" placeholder="./models/" spellcheck="false" />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-[11px] font-medium text-muted-foreground">Size</span>
              <select data-model-dtype class="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
                <option value="q4f16">q4f16 · smallest</option>
                <option value="q4">q4</option>
                <option value="int8">int8</option>
                <option value="fp32">fp32 · full quality</option>
                <option value="quantized">quantized · WASM</option>
              </select>
            </label>
            <label class="block">
              <span class="text-[11px] font-medium text-muted-foreground">Device</span>
              <select data-model-device class="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
                <option value="webgpu">WebGPU · GPU</option>
                <option value="wasm">WASM · CPU</option>
              </select>
            </label>
          </div>

          <div data-model-progress class="hidden">
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div data-model-progress-bar class="h-full w-0 rounded-full bg-primary transition-[width] duration-200"></div>
            </div>
            <p data-model-progress-text class="mt-1.5 text-[11px] text-muted-foreground"></p>
          </div>

          <p data-model-error class="hidden rounded-xl bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-600"></p>
        </div>

        <div class="mt-5 flex items-center justify-between gap-2">
          <button data-role="model-unload" class="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">Unload</button>
          <div class="flex items-center gap-2">
            <button data-model-close class="rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">Close</button>
            <button data-role="model-load" class="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">${icon(Download, 'size-3.5')}<span>Load model</span></button>
          </div>
        </div>
      </div>
    </div>`
}

function emojiPickerHtml() {
  return `
    <div data-emoji-picker class="absolute bottom-full right-0 z-30 mb-2 hidden w-[300px] rounded-2xl border border-border bg-card p-3 shadow-xl">
      <input data-emoji-search type="search" placeholder="Search emoji" class="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20" />
      <div data-emoji-recent class="mt-3 hidden">
        <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Recent</p>
        <div data-emoji-recent-grid class="flex flex-wrap gap-1"></div>
      </div>
      <div data-emoji-list class="mt-3 max-h-52 overflow-y-auto pr-1"></div>
    </div>`
}

function renderChips() {
  const files = sharedFiles.get()
  const chips = files
    .map(
      (file) =>
        `<span class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2 py-1 text-[10px] text-accent-foreground">${icon(FileImage, 'size-3')}${esc(file.name)}</span>`,
    )
    .join('')
  return `<div data-role="chips" class="mt-2 flex flex-wrap gap-2${files.length ? '' : ' hidden'}">${chips}</div>`
}

async function chooseFiles() {
  try {
    if ('showOpenFilePicker' in window) {
      const picker = window.showOpenFilePicker.bind(window)
      const handles = await picker({ multiple: true })
      sharedFiles.set(await Promise.all(handles.map((handle) => handle.getFile())))
      return
    }
  } catch {
    return
  }
  document.getElementById('s-file-picker')?.click()
}

function handleFiles(files) {
  sharedFiles.set(Array.from(files ?? []))
}

function pillClass(status) {
  if (status === 'ready') return 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600'
  if (status === 'loading') return 'rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600'
  if (status === 'error') return 'rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500'
  return 'rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground'
}

let disposeChat = null

export const chatView = {
  html: () => `
    <section class="relative flex min-w-0 flex-1 flex-col">
      <div id="chat-header" class="flex h-[68px] items-center justify-between border-b border-border px-4 sm:px-6">${headerHtml()}</div>
      <div id="thread-messages" class="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-auto p-4 sm:p-6">
        ${renderThread()}
      </div>
      <div class="border-t border-border p-4 sm:p-5">
        <div class="relative">
          <div class="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2 focus-within:ring-2 focus-within:ring-ring/20">
            <input id="s-file-picker" type="file" multiple class="sr-only" />
            <button data-role="attach" aria-label="Attach files" class="rounded-xl p-2 text-muted-foreground hover:bg-accent">${icon(Paperclip)}</button>
            <textarea id="composer" rows="1" placeholder="${isAgent() ? 'Ask S anything…' : 'Write a message…'}" class="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground">${esc(draft.get())}</textarea>
            <button data-role="emoji" aria-label="Insert emoji" class="rounded-xl p-2 text-muted-foreground hover:bg-accent">${icon(Smile)}</button>
            <button class="rounded-xl p-2 text-muted-foreground hover:bg-accent">${icon(Mic)}</button>
            <button data-role="send" aria-label="Send message" class="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105"><span data-send-icon>${icon(Send)}</span><span data-send-stop class="hidden">${icon(X, 'size-4')}</span></button>
          </div>
          ${emojiPickerHtml()}
        </div>
        ${renderChips()}
        <div data-agent-hint class="mt-2 hidden flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <span data-agent-hint-text></span>
          <button data-action="load-cached" class="hidden rounded-xl bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">Load now</button>
          <button data-action="open-model" class="font-medium text-foreground underline underline-offset-4">Manage model</button>
        </div>
        <p class="mt-2 text-center text-[10px] text-muted-foreground">Free forever · No ads · No tracking</p>
      </div>
      ${modelModalHtml()}
    </section>`,
  init: (root) => {
    const fileInput = root.querySelector('#s-file-picker')
    const attachBtn = root.querySelector('[data-role="attach"]')
    const sendBtn = root.querySelector('[data-role="send"]')
    const emojiBtn = root.querySelector('[data-role="emoji"]')
    const composer = root.querySelector('#composer')
    const thread = root.querySelector('#thread-messages')
    const header = root.querySelector('#chat-header')
    const chips = root.querySelector('[data-role="chips"]')
    const modelModal = root.querySelector('[data-modal="model"]')
    const picker = root.querySelector('[data-emoji-picker]')
    const pickerList = root.querySelector('[data-emoji-list]')
    const pickerSearch = root.querySelector('[data-emoji-search]')
    const recentBox = root.querySelector('[data-emoji-recent]')
    const recentGrid = root.querySelector('[data-emoji-recent-grid]')
    const hint = root.querySelector('[data-agent-hint]')
    const hintText = root.querySelector('[data-agent-hint-text]')
    const cleanups = []
    let uiSource = agentModel.get().source

    /* ---------------- header / thread ---------------- */

    const renderHeader = () => {
      header.innerHTML = headerHtml()
    }

    const scrollToBottom = (force = true) => {
      if (!force) {
        const near = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160
        if (!near) return
      }
      thread.scrollTop = thread.scrollHeight
    }

    const renderThreadInto = () => {
      thread.innerHTML = renderThread()
      scrollToBottom()
    }

    const renderChipsInto = () => {
      if (!document.contains(chips)) return
      const files = sharedFiles.get()
      chips.classList.toggle('hidden', files.length === 0)
      chips.innerHTML = files
        .map(
          (file) =>
            `<span class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2 py-1 text-[10px] text-accent-foreground">${icon(FileImage, 'size-3')}${esc(file.name)}</span>`,
        )
        .join('')
    }

    /* ---------------- model panel ---------------- */

    const modelField = (selector) => root.querySelector(selector)

    const syncModelUi = () => {
      const state = agentModel.get()
      const agent = isAgent()

      hint?.classList.toggle('hidden', !agent)
      if (agent && hintText) {
        hintText.textContent =
          state.status === 'ready'
            ? `Model ready · replies are generated on this device`
            : state.status === 'loading'
              ? agentStatusText(state)
              : state.status === 'error'
                ? 'Model failed to load'
                : hasCachedModel()
                  ? 'Model is cached on this device — loads fast'
                  : 'No model loaded — load one to get replies'
      }
      const loadNow = root.querySelector('[data-action="load-cached"]')
      if (loadNow) loadNow.classList.toggle('hidden', state.status !== 'idle' || !hasCachedModel())

      const pill = root.querySelector('[data-model-pill]')
      if (pill) {
        pill.textContent = agentStatusText(state)
        pill.className = pillClass(state.status)
      }

      for (const tab of root.querySelectorAll('[data-source-tab]')) {
        const active = tab.dataset.sourceTab === uiSource
        tab.classList.toggle('bg-background', active)
        tab.classList.toggle('text-foreground', active)
        tab.classList.toggle('shadow-sm', active)
        tab.classList.toggle('text-muted-foreground', !active)
      }
      root.querySelector('[data-hf-pane]')?.classList.toggle('hidden', uiSource !== 'hf')
      root.querySelector('[data-local-pane]')?.classList.toggle('hidden', uiSource !== 'local')

      const progress = root.querySelector('[data-model-progress]')
      const bar = root.querySelector('[data-model-progress-bar]')
      const progressText = root.querySelector('[data-model-progress-text]')
      if (progress) {
        const loading = state.status === 'loading'
        progress.classList.toggle('hidden', !loading)
        if (loading) {
          const percent = state.total ? state.percent : 0
          bar.style.width = `${percent}%`
          progressText.textContent = state.total
            ? `${state.percent}% · ${formatBytes(state.loaded)} / ${formatBytes(state.total)}${state.file ? ` · ${state.file.split('/').pop()}` : ''}`
            : 'Loading model…'
        }
      }

      const errorBox = root.querySelector('[data-model-error]')
      if (errorBox) {
        errorBox.classList.toggle('hidden', state.status !== 'error')
        errorBox.textContent = state.error
      }

      const loadBtn = root.querySelector('[data-role="model-load"]')
      if (loadBtn) {
        loadBtn.disabled = state.status === 'loading'
        loadBtn.classList.toggle('opacity-60', state.status === 'loading')
        const label = loadBtn.querySelector('span')
        if (label) {
          label.textContent = state.status === 'loading' ? 'Loading…' : hasCachedModel() ? 'Load cached model' : 'Load model'
        }
      }
      root.querySelector('[data-role="model-unload"]')?.classList.toggle('hidden', state.status !== 'ready')
    }

    const openModelPanel = () => {
      if (!isAgent()) return
      const state = agentModel.get()
      uiSource = state.source
      const idInput = modelField('[data-model-id]')
      const pathInput = modelField('[data-local-path]')
      const dtypeSelect = modelField('[data-model-dtype]')
      const deviceSelect = modelField('[data-model-device]')
      if (idInput && document.activeElement !== idInput) idInput.value = state.modelId
      if (pathInput) pathInput.value = state.localPath
      if (dtypeSelect) dtypeSelect.value = state.dtype
      if (deviceSelect) deviceSelect.value = navigator.gpu ? state.device : 'wasm'
      const gpuOption = deviceSelect?.querySelector('option[value="webgpu"]')
      if (gpuOption) gpuOption.disabled = !navigator.gpu
      modelModal.classList.remove('hidden')
      syncModelUi()
    }

    const closeModelPanel = () => modelModal.classList.add('hidden')

    /* ---------------- emoji picker ---------------- */

    const renderRecent = () => {
      const list = readRecentEmoji()
      recentBox.classList.toggle('hidden', list.length === 0)
      recentGrid.innerHTML = list.map((char) => emojiButton(char, char)).join('')
    }

    const renderEmojiList = (query = '') => {
      const matches = searchEmoji(query)
      if (matches) {
        pickerList.innerHTML = matches.length
          ? `<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Results</p>
             <div class="grid grid-cols-8 gap-0.5">${matches.map((entry) => emojiButton(entry.char, entry.keywords)).join('')}</div>`
          : `<p class="py-4 text-center text-xs text-muted-foreground">No emoji found</p>`
        return
      }
      pickerList.innerHTML = EMOJI_CATEGORIES.map(
        (category) => `
        <div class="mb-3">
          <p class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">${esc(category.name)}</p>
          <div class="grid grid-cols-8 gap-0.5">${category.items.map((item) => { const { char, keywords } = splitEntry(item); return emojiButton(char, keywords) }).join('')}</div>
        </div>`,
      ).join('')
    }

    const closePicker = () => picker.classList.add('hidden')

    const togglePicker = () => {
      const opening = picker.classList.contains('hidden')
      picker.classList.toggle('hidden', !opening)
      if (opening) {
        pickerSearch.value = ''
        renderEmojiList()
        renderRecent()
        pickerSearch.focus()
      }
    }

    const insertEmoji = (char) => {
      const start = composer.selectionStart ?? composer.value.length
      const end = composer.selectionEnd ?? start
      const value = composer.value.slice(0, start) + char + composer.value.slice(end)
      composer.value = value
      draft.set(value)
      pushRecentEmoji(char)
      renderRecent()
      composer.focus()
      composer.setSelectionRange(start + char.length, start + char.length)
    }

    /* ---------------- sending ---------------- */

    const updateStream = (id, text) => {
      const body = document.querySelector(`[data-msg-body="${CSS.escape(id)}"]`)
      if (!body) return
      body.textContent = text
      scrollToBottom(false)
    }

    const runAgentReply = async () => {
      const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      appendMessage(AGENT_CHAT, { from: 'agent', id, pending: true, text: '', time: 'Now' })
      scrollToBottom()
      const history = threadFor(AGENT_CHAT)
        .filter((message) => !message.pending && !message.action && message.text)
        .map((message) => ({ role: message.from === 'me' ? 'user' : 'assistant', text: message.text }))
        .slice(-12)
      let streamed = ''
      let stats = null
      try {
        const reply = await generateAgentReply(history, {
          onToken: (chunk) => {
            streamed += chunk
            updateStream(id, streamed)
          },
          onDone: ({ tokens, seconds }) => {
            stats = `${tokens} tokens · ${Math.round(tokens / seconds)} tok/s`
          },
        })
        updateMessage(AGENT_CHAT, id, { pending: false, text: reply || streamed || '…', time: 'Now', stats })
      } catch (error) {
        updateMessage(AGENT_CHAT, id, {
          pending: false,
          text: `I couldn’t reply: ${error?.message ?? error}`,
          time: 'Now',
        })
      }
    }

    const send = () => {
      const name = activeChat.get()
      const text = draft.get().trim()
      if (!text || agentBusy.get()) return

      if (isAgent(name)) {
        const state = agentModel.get()
        if (state.status === 'loading') {
          openModelPanel()
          return
        }
        if (state.status !== 'ready') {
          const current = threadFor(name)
          const last = current[current.length - 1]
          if (!last?.action) {
            appendMessage(name, {
              from: 'agent',
              time: 'Now',
              action: 'load-model',
              text:
                state.status === 'error'
                  ? `I couldn’t start: ${state.error}`
                  : 'Load a model first — it runs on this device and never leaves it.',
            })
          }
          openModelPanel()
          return
        }
        batch(() => {
          appendMessage(name, { from: 'me', text, time: 'Now' })
          draft.set('')
          composer.value = ''
        })
        void runAgentReply()
        return
      }

      const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      batch(() => {
        appendMessage(name, { from: 'me', id, text, time: 'Now' })
        draft.set('')
        composer.value = ''
      })
      void sealInto(name, id, text)
    }

    // Seal the outgoing text to the contact's identity and attach the envelope.
    // The plaintext is kept locally for rendering; the envelope is the E2E
    // artifact that would travel over a mailbox.
    const sealInto = async (name, id, text) => {
      const contact = contactByName(name)
      if (!contact) return
      try {
        updateMessage(name, id, { sealed: await sealMessage(text, contact) })
      } catch (error) {
        console.error('[S] failed to seal outgoing message', error)
      }
    }

    /* ---------------- listeners ---------------- */

    const onInput = () => draft.set(composer.value)
    const onKeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault()
        send()
      }
    }
    const onClickSend = () => {
      if (agentBusy.get()) {
        requestStop()
        return
      }
      send()
    }
    const onClickAttach = () => void chooseFiles()
    const onFileChange = () => handleFiles(fileInput.files)
    const onClickEmoji = (event) => {
      event.stopPropagation()
      togglePicker()
    }
    const onEmojiSearch = () => renderEmojiList(pickerSearch.value)
    const onDocumentClick = (event) => {
      if (picker.classList.contains('hidden')) return
      if (picker.contains(event.target) || emojiBtn.contains(event.target)) return
      closePicker()
    }
    const onDocumentKeydown = (event) => {
      if (event.key !== 'Escape') return
      if (!modelModal.classList.contains('hidden')) {
        closeModelPanel()
        event.stopPropagation()
        return
      }
      if (!picker.classList.contains('hidden')) {
        closePicker()
        event.stopPropagation()
      }
    }

    composer.addEventListener('input', onInput)
    composer.addEventListener('keydown', onKeydown)
    sendBtn.addEventListener('click', onClickSend)
    attachBtn.addEventListener('click', onClickAttach)
    fileInput.addEventListener('change', onFileChange)
    emojiBtn.addEventListener('click', onClickEmoji)
    pickerSearch.addEventListener('input', onEmojiSearch)
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown, true)

    picker.addEventListener('click', (event) => {
      const target = event.target.closest('[data-emoji]')
      if (!target) return
      insertEmoji(target.dataset.emoji ?? '')
    })

    thread.addEventListener('click', (event) => {
      const suggest = event.target.closest('[data-suggest]')
      if (suggest) {
        const text = suggest.dataset.suggest ?? ''
        composer.value = text
        draft.set(text)
        composer.focus()
        composer.setSelectionRange(text.length, text.length)
        return
      }
      if (event.target.closest('[data-action="open-model"]')) openModelPanel()
    })

    header.addEventListener('click', (event) => {
      if (event.target.closest('[data-role="model-panel"]')) openModelPanel()
    })

    modelModal.addEventListener('click', (event) => {
      const target = event.target
      if (target === modelModal || target.closest('[data-model-close]')) {
        closeModelPanel()
        return
      }
      const tab = target.closest('[data-source-tab]')
      if (tab) {
        uiSource = tab.dataset.sourceTab === 'local' ? 'local' : 'hf'
        syncModelUi()
        return
      }
      if (target.closest('[data-pick-folder]')) {
        const label = root.querySelector('[data-folder-name]')
        void pickLocalDirectory().then(
          (name) => {
            if (label) {
              label.textContent = `Chosen: ${name}`
              label.className = 'mt-2 truncate text-[11px] text-emerald-600'
            }
            uiSource = 'local'
            syncModelUi()
          },
          (error) => {
            if (label) {
              label.textContent = error?.message ?? String(error)
              label.className = 'mt-2 truncate text-[11px] text-rose-500'
            }
          },
        )
        return
      }
      if (target.closest('[data-role="model-load"]')) {
        void loadModel({
          source: uiSource,
          modelId: modelField('[data-model-id]')?.value.trim() || DEFAULT_MODEL,
          localPath: modelField('[data-local-path]')?.value.trim() || './models/',
          dtype: modelField('[data-model-dtype]')?.value || 'q4f16',
          device: modelField('[data-model-device]')?.value || 'wasm',
        }).then(syncModelUi)
        return
      }
      if (target.closest('[data-role="model-unload"]')) {
        void unloadModel().then(syncModelUi)
      }
    })

    hint?.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="load-cached"]')) {
        void loadModel({}).then(syncModelUi)
        return
      }
      if (event.target.closest('[data-action="open-model"]')) openModelPanel()
    })

    cleanups.push(
      () => composer.removeEventListener('input', onInput),
      () => composer.removeEventListener('keydown', onKeydown),
      () => sendBtn.removeEventListener('click', onClickSend),
      () => attachBtn.removeEventListener('click', onClickAttach),
      () => fileInput.removeEventListener('change', onFileChange),
      () => emojiBtn.removeEventListener('click', onClickEmoji),
      () => pickerSearch.removeEventListener('input', onEmojiSearch),
      () => document.removeEventListener('click', onDocumentClick),
      () => document.removeEventListener('keydown', onDocumentKeydown, true),
    )
    cleanups.push(
      draft.subscribe((value) => {
        if (composer.value !== value) composer.value = value
      }),
      threads.subscribe(renderThreadInto),
      sharedFiles.subscribe(renderChipsInto),
      activeChat.subscribe(() => {
        composer.placeholder = isAgent() ? 'Ask S anything…' : 'Write a message…'
        renderHeader()
        renderThreadInto()
        uiSource = agentModel.get().source
        syncModelUi()
        closeModelPanel()
        closePicker()
      }),
      agentModel.subscribe(syncModelUi),
      agentBusy.subscribe((busy) => {
        sendBtn.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message')
        sendBtn.querySelector('[data-send-icon]')?.classList.toggle('hidden', busy)
        sendBtn.querySelector('[data-send-stop]')?.classList.toggle('hidden', !busy)
      }),
    )

    if (isAgent() && agentModel.get().source === 'local') {
      void restoreLocalDirectory().then((name) => {
        if (!name) return
        const label = root.querySelector('[data-folder-name]')
        if (label) {
          label.textContent = `Chosen: ${name}`
          label.className = 'mt-2 truncate text-[11px] text-emerald-600'
        }
      }).catch(() => {})
    }

    renderHeader()
    renderThreadInto()
    syncModelUi()
    scrollToBottom()

    disposeChat = () => {
      for (const cleanup of cleanups) cleanup()
    }
  },
  destroy: () => {
    disposeChat?.()
    disposeChat = null
  },
}
