import { Check, FileImage, Mic, MoreHorizontal, Paperclip, Phone, Send, ShieldCheck, Video } from '../vendor/icons.js'
import { batch } from '../vendor/store.js'
import { avatar, esc, icon } from '../dom.js'
import { activeChat, draft, messages, sharedFiles } from '../store.js'

function renderMessage(message) {
  const fromMe = message.from === 'me'
  return `
    <div class="flex items-end gap-2 ${fromMe ? 'justify-end' : ''}">
      ${fromMe ? '' : avatar('MC', 'bg-amber-200 text-amber-900', false, true)}
      <div class="max-w-[78%] rounded-2xl px-4 py-3 text-sm ${fromMe ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted'}">
        <p>${esc(message.text)}</p>
        <div class="mt-1.5 flex items-center justify-end gap-1 text-[10px] ${fromMe ? 'text-primary-foreground/65' : 'text-muted-foreground'}">
          ${esc(message.time)}${fromMe ? icon(Check, 'size-3') : ''}
        </div>
      </div>
    </div>`
}

function renderThread() {
  return `
    <div class="mx-auto flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
      ${icon(ShieldCheck, 'size-3 text-emerald-600')}&#160;Messages are end-to-end encrypted
    </div>
    ${messages.get().map(renderMessage).join('')}`
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

let disposeChat = null

export const chatView = {
  html: () => `
    <section class="flex min-w-0 flex-1 flex-col">
      <div class="flex h-[68px] items-center justify-between border-b border-border px-4 sm:px-6">
        <div class="flex items-center gap-3">
          ${avatar('MC', 'bg-amber-200 text-amber-900', true)}
          <div>
            <h2 id="chat-title" class="text-sm font-semibold">${esc(activeChat.get())}</h2>
            <p class="text-[11px] text-muted-foreground">online · messages are encrypted</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(Phone)}</button>
          <button class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(Video)}</button>
          <button class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(MoreHorizontal)}</button>
        </div>
      </div>
      <div id="thread-messages" class="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-auto p-4 sm:p-6">
        ${renderThread()}
      </div>
      <div class="border-t border-border p-4 sm:p-5">
        <div class="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 p-2 focus-within:ring-2 focus-within:ring-ring/20">
          <input id="s-file-picker" type="file" multiple class="sr-only" />
          <button data-role="attach" aria-label="Attach files" class="rounded-xl p-2 text-muted-foreground hover:bg-accent">${icon(Paperclip)}</button>
          <textarea id="composer" rows="1" placeholder="Write a message…" class="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground">${esc(draft.get())}</textarea>
          <button class="rounded-xl p-2 text-muted-foreground hover:bg-accent">${icon(Mic)}</button>
          <button data-role="send" aria-label="Send message" class="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform hover:scale-105">${icon(Send)}</button>
        </div>
        ${renderChips()}
        <p class="mt-2 text-center text-[10px] text-muted-foreground">Free forever · No ads · No tracking</p>
      </div>
    </section>`,
  init: (root) => {
    const fileInput = root.querySelector('#s-file-picker')
    const attachBtn = root.querySelector('[data-role="attach"]')
    const sendBtn = root.querySelector('[data-role="send"]')
    const composer = root.querySelector('#composer')
    const thread = root.querySelector('#thread-messages')
    const chips = root.querySelector('[data-role="chips"]')
    const cleanups = []

    const scrollToBottom = () => {
      thread.scrollTop = thread.scrollHeight
    }
    const renderMessagesInto = () => {
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

    const send = () => {
      const text = draft.get().trim()
      if (!text) return
      batch(() => {
        messages.set([...messages.get(), { from: 'me', text, time: 'Now' }])
        draft.set('')
      })
    }
    const onInput = () => draft.set(composer.value)
    const onKeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault()
        send()
      }
    }
    const onClickSend = () => send()
    const onClickAttach = () => void chooseFiles()
    const onFileChange = () => handleFiles(fileInput.files)

    composer.addEventListener('input', onInput)
    composer.addEventListener('keydown', onKeydown)
    sendBtn.addEventListener('click', onClickSend)
    attachBtn.addEventListener('click', onClickAttach)
    fileInput.addEventListener('change', onFileChange)

    cleanups.push(
      () => composer.removeEventListener('input', onInput),
      () => composer.removeEventListener('keydown', onKeydown),
      () => sendBtn.removeEventListener('click', onClickSend),
      () => attachBtn.removeEventListener('click', onClickAttach),
      () => fileInput.removeEventListener('change', onFileChange),
    )
    cleanups.push(
      draft.subscribe((value) => {
        if (composer.value !== value) composer.value = value
      }),
      messages.subscribe(renderMessagesInto),
      sharedFiles.subscribe(renderChipsInto),
    )

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