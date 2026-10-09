import { CalendarDays, Clock3, Download, Fingerprint, FolderOpen, GalleryHorizontalEnd, ListTodo, Plus, Trash2, X } from '../vendor/icons.js'
import { avatar, esc, formatBytes, helpWrap, icon } from '../dom.js'
import { chatMeta } from '../chats.js'
import { activeChat, activeNav, completedTasks, persistentAtom, showAuth, threads } from '../store.js'
import { addContact, contacts, exportCards, importText, removeContact } from '../contacts-store.js'
import { googleConfigured, importGoogleContacts } from '../google-contacts.js'
import { localDevice } from '../device-store.js'
import { lockPasskey, passkey } from '../passkey-store.js'
import { deleteMedia, getMedia, listMedia } from '../media-store.js'
import { hasCachedModel } from '../agent/model.js'

const DEFAULT_TASKS = [
  'Send final deck to design crew',
  'Choose favorites from Saturday gallery',
  'Book train for weekend trip',
  'Review privacy settings',
]

// Sample items seed a fresh install; the list is user-editable and persisted.
export const TASKS = DEFAULT_TASKS
export const taskList = persistentAtom('s:task-list', [...DEFAULT_TASKS], [])
export const calendarEvents = persistentAtom('s:calendar', [], [])

export function openTaskCount() {
  const done = completedTasks.get()
  return taskList.get().filter((task) => !done.includes(task)).length
}

function contactDetail(contact) {
  const bits = []
  const phone = contact.phones?.[0]?.value
  const email = contact.emails?.[0]?.value
  if (phone) bits.push(esc(phone))
  if (email) bits.push(esc(email))
  if (!bits.length && contact.org) bits.push(esc(contact.org))
  return bits.join(' · ')
}

function renderContacts() {
  const list = contacts.get()
  if (!list.length) {
    return '<p class="text-sm text-muted-foreground">No contacts yet — add someone or import your address book.</p>'
  }
  return list
    .map((contact) => {
      const { initials, color } = chatMeta(contact.name)
      const detail = contactDetail(contact)
      return `
        <article data-contact="${esc(contact.name)}" class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-start gap-3">
            ${avatar(initials, color, false)}
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-semibold">${esc(contact.name)}</h3>
              ${detail ? `<p class="truncate text-xs text-muted-foreground">${detail}</p>` : '<p class="text-xs text-muted-foreground">Private contact · end-to-end encrypted</p>'}
              <p class="mt-3 truncate rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground" title="${esc(contact.id)}">${esc(contact.id)}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1.5">
              <button data-message-contact="${esc(contact.name)}" class="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">Message</button>
              <button data-remove-contact="${esc(contact.id)}" aria-label="Remove ${esc(contact.name)}" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-rose-600">${icon(Trash2, 'size-3.5')}</button>
            </div>
          </div>
        </article>`
    })
    .join('')
}

let disposeContacts = null

export const contactsView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-7 flex items-end justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">People you trust</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Contacts</h2>
          <p class="mt-1 text-sm text-muted-foreground">Every person has a private S ID and their own encryption keys.</p>
        </div>
        <div class="flex items-center gap-2">
          <button data-import-contact class="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-accent">${icon(Download, 'size-4')}Import</button>
          <button data-add-contact class="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Plus, 'size-4')}Add contact</button>
        </div>
      </div>
      <div id="contacts-list" class="grid gap-3 sm:grid-cols-2">${renderContacts()}</div>
    </div>
    <div data-modal="contact" class="hidden fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="add-contact-title" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div class="flex items-start justify-between">
          <div>
            <p id="add-contact-title" class="text-lg font-semibold">Add a contact</p>
            <p class="mt-1 text-sm text-muted-foreground">S mints a fresh identity (user, app and device keys) so you can message them end-to-end.</p>
          </div>
          <button data-contact-close aria-label="Close add contact" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
        </div>
        <form data-contact-form class="mt-5">
          <label for="add-contact-name" class="text-[11px] font-medium text-muted-foreground">Name</label>
          <input id="add-contact-name" data-contact-name autocomplete="off" class="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/20" placeholder="e.g. Sam Rivera" />
          <p data-contact-error role="alert" class="mt-3 hidden rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-600"></p>
          <button type="button" data-contact-create class="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">Create identity &amp; chat</button>
        </form>
        <p class="mt-3 text-center text-[10px] text-muted-foreground">Public keys only · the private key never leaves their device</p>
      </div>
    </div>
    <div data-modal="import-contact" class="hidden fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="import-contact-title" class="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div class="flex items-start justify-between">
          <div>
            <p id="import-contact-title" class="text-lg font-semibold">Import contacts</p>
            <p class="mt-1 text-sm text-muted-foreground">Bring in vCards from Google, Apple, or any .vcf export. Anyone missing an identity gets one minted automatically.</p>
          </div>
          <button data-import-close aria-label="Close import" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">${icon(X)}</button>
        </div>
        <div class="mt-5 flex flex-col gap-3">
          <button data-import-google class="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium hover:bg-accent">${icon(Download, 'size-4')}Import from Google</button>
          <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium hover:bg-accent">
            ${icon(FolderOpen, 'size-4')}Choose a .vcf file
            <input data-import-file type="file" accept=".vcf,text/vcard,text/x-vcard" class="hidden" />
          </label>
          <div class="rounded-xl border border-border bg-background p-3">
            <label for="import-vcard-text" class="text-[11px] font-medium text-muted-foreground">Or paste vCard text</label>
            <textarea id="import-vcard-text" data-import-text rows="4" placeholder="BEGIN:VCARD&#10;FN:Amara Okafor&#10;END:VCARD" class="mt-1 w-full resize-none rounded-xl border border-border bg-muted/40 p-2.5 font-mono text-[10px] outline-none focus:ring-2 focus:ring-ring/20"></textarea>
            <button data-import-paste class="mt-2 w-full rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Import pasted contacts</button>
          </div>
          <p data-import-status role="status" class="hidden rounded-xl bg-emerald-500/10 p-2.5 text-[11px] text-emerald-600"></p>
          <p data-import-error role="alert" class="hidden rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-600"></p>
        </div>
        <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <button data-export-contact class="text-[11px] font-medium text-foreground underline underline-offset-4">Export all as .vcf</button>
          <span class="text-[10px] text-muted-foreground">vCard 4.0</span>
        </div>
      </div>
    </div>`,
  init: (root) => {
    const list = root.querySelector('#contacts-list')
    const modal = root.querySelector('[data-modal="contact"]')
    const importModal = root.querySelector('[data-modal="import-contact"]')
    const form = root.querySelector('[data-contact-form]')
    const nameInput = root.querySelector('[data-contact-name]')
    const errorBox = root.querySelector('[data-contact-error]')
    const createBtn = root.querySelector('[data-contact-create]')
    const importFile = root.querySelector('[data-import-file]')
    const importTextArea = root.querySelector('[data-import-text]')
    const importStatus = root.querySelector('[data-import-status]')
    const importError = root.querySelector('[data-import-error]')
    const cleanups = []
    let lastTrigger = null
    let creating = false

    const render = () => {
      list.innerHTML = renderContacts()
    }

    const open = (trigger) => {
      lastTrigger = trigger
      modal.classList.remove('hidden')
      errorBox.classList.add('hidden')
      nameInput.value = ''
      createBtn.disabled = false
      createBtn.textContent = 'Create identity & chat'
      nameInput.focus()
    }

    const close = () => {
      modal.classList.add('hidden')
      lastTrigger?.focus?.()
    }

    const openImport = (trigger) => {
      lastTrigger = trigger
      importModal.classList.remove('hidden')
      importStatus.classList.add('hidden')
      importError.classList.add('hidden')
    }

    const closeImport = () => {
      importModal.classList.add('hidden')
      lastTrigger?.focus?.()
    }

    const setImportStatus = (text) => {
      importStatus.textContent = text
      importStatus.classList.remove('hidden')
      importError.classList.add('hidden')
    }

    const setImportError = (error) => {
      importError.textContent = error instanceof Error ? error.message : String(error)
      importError.classList.remove('hidden')
      importStatus.classList.add('hidden')
    }

    const runImport = async (fn) => {
      try {
        const result = await fn()
        setImportStatus(`Imported ${result.added} new${result.merged ? ` · updated ${result.merged}` : ''}`)
      } catch (error) {
        setImportError(error)
      }
    }

    const onRootClick = (event) => {
      const target = event.target
      const messageBtn = target.closest('[data-message-contact]')
      if (messageBtn) {
        activeChat.set(messageBtn.dataset.messageContact ?? '')
        activeNav.set('Inbox')
        return
      }
      const removeBtn = target.closest('[data-remove-contact]')
      if (removeBtn) {
        void removeContact(removeBtn.dataset.removeContact)
        return
      }
      if (target.closest('[data-add-contact]')) {
        open(target.closest('[data-add-contact]'))
        return
      }
      if (target.closest('[data-import-contact]')) {
        openImport(target.closest('[data-import-contact]'))
        return
      }
      if (target.closest('[data-import-close]') || target === importModal) {
        closeImport()
        return
      }
      if (target.closest('[data-contact-close]') || target === modal) close()
    }

    const create = async () => {
      if (creating) return
      const trimmed = nameInput.value.trim()
      if (!trimmed) return
      creating = true
      createBtn.disabled = true
      createBtn.textContent = 'Creating…'
      try {
        const record = await addContact(trimmed)
        close()
        activeChat.set(record.name)
        activeNav.set('Inbox')
      } catch (error) {
        creating = false
        createBtn.disabled = false
        createBtn.textContent = 'Create identity & chat'
        errorBox.textContent = error instanceof Error ? error.message : String(error)
        errorBox.classList.remove('hidden')
        nameInput.focus()
      }
    }

    const onImportFile = async (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      setImportStatus('Reading…')
      try {
        const text = await file.text()
        await runImport(() => importText(text))
      } catch (error) {
        setImportError(error)
      }
      event.target.value = ''
    }

    const onImportPaste = () => {
      const text = importTextArea.value.trim()
      if (!text) {
        setImportError(new Error('Paste a vCard first'))
        return
      }
      void runImport(async () => {
        const result = await importText(text)
        importTextArea.value = ''
        return result
      })
    }

    const onImportGoogle = () => {
      if (!googleConfigured()) {
        setImportError(new Error('Set window.S_GOOGLE_CLIENT_ID to enable Google import — or choose a .vcf file.'))
        return
      }
      void runImport(() => {
        setImportStatus('Signing in to Google…')
        return importGoogleContacts()
      })
    }

    const onExport = () => {
      const text = exportCards()
      if (!text || typeof Blob === 'undefined') return
      const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 's-contacts.vcf'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    const onDocumentKeydown = (event) => {
      if (event.key !== 'Escape') return
      if (!importModal.classList.contains('hidden')) {
        event.stopPropagation()
        closeImport()
      } else if (!modal.classList.contains('hidden')) {
        event.stopPropagation()
        close()
      }
    }

    root.addEventListener('click', onRootClick)
    createBtn.addEventListener('click', (event) => {
      event.preventDefault()
      void create()
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void create()
    })
    importFile.addEventListener('change', onImportFile)
    importTextArea.addEventListener('input', () => importError.classList.add('hidden'))
    root.querySelector('[data-import-paste]').addEventListener('click', onImportPaste)
    root.querySelector('[data-import-google]').addEventListener('click', onImportGoogle)
    root.querySelector('[data-export-contact]').addEventListener('click', onExport)
    document.addEventListener('keydown', onDocumentKeydown, true)
    cleanups.push(
      contacts.subscribe(render),
      () => document.removeEventListener('keydown', onDocumentKeydown, true),
    )
    disposeContacts = () => { for (const cleanup of cleanups) cleanup() }
  },
  destroy: () => {
    disposeContacts?.()
    disposeContacts = null
  },
}

export const calendarView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Private calendar</p>
          <h2 class="mt-1 text-2xl font-semibold">Calendar</h2>
        </div>
        <button data-cal-new class="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Plus, 'size-4')}New event</button>
      </div>
      <div data-cal-form class="mb-4 hidden rounded-2xl border border-border bg-card p-4">
        <div class="flex flex-col gap-2 sm:flex-row">
          <input data-cal-title aria-label="Event title" placeholder="Event title" class="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20" />
          <input data-cal-when type="datetime-local" aria-label="When" class="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20" />
          <button data-cal-save class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Add</button>
        </div>
      </div>
      <div id="calendar-list" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${renderCalendar()}</div>
    </div>`,
  init: (root) => {
    const list = root.querySelector('#calendar-list')
    const form = root.querySelector('[data-cal-form]')
    const titleInput = root.querySelector('[data-cal-title]')
    const whenInput = root.querySelector('[data-cal-when]')
    const render = () => {
      list.innerHTML = renderCalendar()
    }
    render()
    disposeCal = calendarEvents.subscribe(render)
    root.querySelector('[data-cal-new]').addEventListener('click', () => {
      const opening = form.classList.toggle('hidden') === false
      if (opening) titleInput.focus()
    })
    root.querySelector('[data-cal-save]').addEventListener('click', () => {
      const title = titleInput.value.trim()
      if (!title) return
      const when = whenInput.value || new Date().toISOString()
      calendarEvents.set([...calendarEvents.get(), { id: `ev-${Date.now()}`, title, when }])
      titleInput.value = ''
      whenInput.value = ''
      form.classList.add('hidden')
    })
  },
  destroy: () => {
    disposeCal?.()
    disposeCal = null
  },
}

function renderCalendar() {
  const list = calendarEvents.get()
  if (!list.length) {
    return '<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">No events yet — add one to plan something.</div>'
  }
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return list
    .map((event) => {
      const when = new Date(event.when)
      const date = Number.isNaN(when.getTime())
        ? esc(event.when)
        : esc(
            `${days[when.getDay()]} ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
          )
      return `
        <div class="rounded-2xl border border-border bg-card p-4">
          ${icon(CalendarDays, 'mb-4 size-4 text-primary')}
          <p class="text-sm font-medium">${esc(event.title)}</p>
          <p class="mt-1 text-xs text-muted-foreground">${date}</p>
        </div>`
    })
    .join('')
}

export const tasksView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p data-tasks-open class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">${openTaskCount()} open items</p>
          <h2 class="mt-1 text-2xl font-semibold">Tasks</h2>
        </div>
        <button data-task-new class="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Plus, 'size-4')}Add task</button>
      </div>
      <form data-task-form class="mb-4 hidden items-center gap-2 rounded-2xl border border-border bg-card p-4">
        <input data-task-input aria-label="New task" placeholder="What needs doing?" class="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20" />
        <button data-task-save class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Add</button>
      </form>
      <div id="tasks-list" class="flex flex-col gap-3">${renderTasks()}</div>
    </div>`,
  init: (root) => {
    const list = root.querySelector('#tasks-list')
    const form = root.querySelector('[data-task-form]')
    const input = root.querySelector('[data-task-input]')
    const offs = []
    const render = () => {
      list.innerHTML = renderTasks()
      const open = root.querySelector('[data-tasks-open]')
      if (open) {
        const count = openTaskCount()
        open.textContent = `${count} open item${count === 1 ? '' : 's'}`
      }
    }
    offs.push(taskList.subscribe(render), completedTasks.subscribe(render))
    list.addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[data-task]')
      if (!checkbox) return
      const task = checkbox.dataset.task ?? ''
      const current = completedTasks.get()
      completedTasks.set(current.includes(task) ? current.filter((item) => item !== task) : [...current, task])
    })
    root.querySelector('[data-task-new]').addEventListener('click', () => {
      const opening = form.classList.toggle('hidden') === false
      if (opening) input.focus()
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const title = input.value.trim()
      if (!title) return
      taskList.set([...taskList.get(), title])
      input.value = ''
      form.classList.add('hidden')
    })
    disposeTasks = () => { for (const off of offs) off() }
  },
  destroy: () => {
    disposeTasks?.()
    disposeTasks = null
  },
}

function renderTasks() {
  const done = completedTasks.get()
  return taskList
    .get()
    .map(
      (task, index) => `
      <label class="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <input type="checkbox" data-task="${esc(task)}" ${done.includes(task) ? 'checked' : ''} class="size-4 accent-primary" />
        <span class="flex-1 text-sm font-medium">${esc(task)}</span>
        <span class="text-xs text-muted-foreground">${index < 2 ? 'Today' : 'This week'}</span>
      </label>`,
    )
    .join('')
}

let disposeCal = null
let disposeTasks = null
let disposeSettings = null
let disposeGallery = null
let disposeTimeline = null

export const settingsView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-7">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Security & identity</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Settings</h2>
        <p class="mt-1 text-sm text-muted-foreground">This device, your key, and how S stores it.</p>
      </div>
      <div class="flex max-w-xl flex-col gap-3">
        <section class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-center gap-1.5"><h3 class="text-sm font-semibold">This device</h3>${helpWrap('help-settings-device', 'The device you are using right now. Its key stays here — other devices you add each get their own.', 'About this device')}</div>
          <div data-settings-device class="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground"></div>
        </section>
        <section class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-center gap-1.5"><h3 class="text-sm font-semibold">Security</h3>${helpWrap('help-settings-security', 'A passkey is how you unlock S. It is stored by your device or password manager and is never sent to us.', 'About passkeys')}</div>
          <button data-settings-passkeys class="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-left hover:bg-accent">
            ${icon(Fingerprint, 'size-5 text-primary')}
            <span class="min-w-0 flex-1"><span class="block text-sm font-medium">Passkeys</span><span data-settings-passkey-status class="block text-xs text-muted-foreground">…</span></span>
          </button>
        </section>
        <section class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-center gap-1.5"><h3 class="text-sm font-semibold">At-rest encryption</h3>${helpWrap('help-settings-atrest', 'Your key lives only in memory while S is unlocked. Locking S throws it away, so nothing on disk can be read until you unlock again.', 'About at-rest encryption')}</div>
          <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">Everything stored on this device is sealed with a key derived from your passkey. While S is locked, nothing stored here is readable — not even the media you send.</p>
          <button data-settings-lock class="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Lock S now</button>
        </section>
        <section class="rounded-2xl border border-border bg-card p-4">
          <h3 class="text-sm font-semibold">About</h3>
          <div class="mt-1.5 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <p>S · a private space for everything</p>
            <p data-settings-stats></p>
          </div>
        </section>
      </div>
    </div>`,
  init: (root) => {
    const deviceBox = root.querySelector('[data-settings-device]')
    const stats = root.querySelector('[data-settings-stats]')
    const passkeyStatus = root.querySelector('[data-settings-passkey-status]')
    const offs = []
    const renderDevice = () => {
      const dev = localDevice.get()
      deviceBox.innerHTML = dev
        ? `<div class="flex items-center justify-between gap-3"><span>Name</span><span class="font-medium text-foreground">${esc(dev.name)}</span></div>
           <div class="flex items-center justify-between gap-3"><span>Device ID</span><span class="font-mono text-[10px]">${esc(dev.id)}</span></div>
           <div class="flex items-center justify-between gap-3"><span>Fingerprint</span><span class="font-mono">${esc(dev.fingerprint)}</span></div>`
        : '<p>Initializing device…</p>'
    }
    const renderStats = () => {
      const count = Object.keys(threads.get()).length
      stats.textContent = `${contacts.get().length} contacts · ${count} chat${count === 1 ? '' : 's'} · local agent model ${hasCachedModel() ? 'cached' : 'not loaded'}`
    }
    const renderPasskey = () => {
      passkeyStatus.textContent = passkey.get().enrolled ? 'Set up · tap to manage' : 'Not set up yet · tap to create'
    }
    renderDevice()
    renderStats()
    renderPasskey()
    offs.push(
      localDevice.subscribe(renderDevice),
      threads.subscribe(renderStats),
      contacts.subscribe(renderStats),
      passkey.subscribe(renderPasskey),
    )
    root.querySelector('[data-settings-lock]').addEventListener('click', () => lockPasskey())
    root.querySelector('[data-settings-passkeys]').addEventListener('click', () => showAuth.set(true))
    disposeSettings = () => { for (const off of offs) off() }
  },
  destroy: () => {
    disposeSettings?.()
    disposeSettings = null
  },
}

export const galleryView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Gallery</p>
        <div class="mt-1 flex items-center gap-1.5"><h2 class="text-2xl font-semibold">Gallery</h2>${helpWrap('help-gallery', 'Photos, videos and voice notes you send in a chat are stored here, sealed with your key. They are unreadable while S is locked.', 'About the gallery')}</div>
        <p class="mt-1 text-sm text-muted-foreground">Shared moments, kept private</p>
      </div>
      <div id="gallery-grid" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"></div>
      <div data-gallery-modal class="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm hidden">
        <div role="dialog" aria-modal="true" class="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div class="flex items-center justify-between gap-3 border-b border-border p-4">
            <div class="min-w-0"><p data-gallery-title class="truncate text-sm font-semibold"></p><p data-gallery-meta class="text-xs text-muted-foreground"></p></div>
            <div class="flex items-center gap-1">
              <button data-gallery-delete aria-label="Delete media" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(Trash2, 'size-4')}</button>
              <button data-gallery-close aria-label="Close media" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(X)}</button>
            </div>
          </div>
          <div data-gallery-view class="grid max-h-[70vh] place-items-center overflow-auto bg-muted/40 p-3"></div>
        </div>
      </div>
    </div>`,
  init: (root) => {
    const grid = root.querySelector('#gallery-grid')
    const modal = root.querySelector('[data-gallery-modal]')
    const view = root.querySelector('[data-gallery-view]')
    const titleEl = root.querySelector('[data-gallery-title]')
    const metaEl = root.querySelector('[data-gallery-meta]')
    const urls = new Set()
    let activeId = null
    let closed = false

    const releaseUrls = () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }

    const openMedia = async (id) => {
      const record = await getMedia(id)
      if (!record || closed) return
      const url = URL.createObjectURL(record.blob)
      urls.add(url)
      activeId = id
      titleEl.textContent = record.name
      metaEl.textContent = `${record.type || 'file'} · ${formatBytes(record.size)}`
      view.innerHTML = record.type.startsWith('image/')
        ? `<img src="${url}" alt="${esc(record.name)}" class="max-h-[65vh] w-auto rounded-xl object-contain" />`
        : record.type.startsWith('video/')
          ? `<video src="${url}" controls class="max-h-[65vh] w-auto rounded-xl"></video>`
          : `<audio src="${url}" controls class="w-full"></audio>`
      modal.classList.remove('hidden')
    }

    const render = async () => {
      const items = await listMedia()
      if (closed) return
      releaseUrls()
      if (!items.length) {
        grid.innerHTML = `<div class="col-span-full rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          ${icon(GalleryHorizontalEnd, 'mx-auto size-5 text-muted-foreground')}
          <p class="mt-2 text-sm font-medium">Nothing here yet</p>
          <p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Attach a photo or record a voice note in a chat and it will show up here.</p>
        </div>`
        return
      }
      grid.innerHTML = items
        .map((item) => {
          const isImage = String(item.type).startsWith('image/')
          return `<button data-gallery-item="${esc(item.id)}" class="group relative flex aspect-square items-end overflow-hidden rounded-2xl border border-border bg-muted/40 p-3 text-left hover:ring-2 hover:ring-ring/30">
            ${isImage ? `<img data-gallery-thumb="${esc(item.id)}" alt="" class="absolute inset-0 size-full object-cover" />` : `<span class="absolute inset-0 grid place-items-center text-muted-foreground">${icon(GalleryHorizontalEnd, 'size-6')}</span>`}
            <span class="relative z-10 max-w-full truncate rounded-lg bg-background/80 px-2 py-1 text-[11px] font-medium">${esc(item.name)}</span>
          </button>`
        })
        .join('')
      for (const item of items) {
        if (!String(item.type).startsWith('image/')) continue
        const record = await getMedia(item.id)
        if (closed || !record) continue
        const url = URL.createObjectURL(record.blob)
        urls.add(url)
        const thumb = grid.querySelector(`[data-gallery-thumb="${item.id}"]`)
        if (thumb) thumb.src = url
      }
    }

    root.addEventListener('click', (event) => {
      const itemBtn = event.target.closest('[data-gallery-item]')
      if (itemBtn) {
        void openMedia(itemBtn.dataset.galleryItem)
        return
      }
      if (event.target.closest('[data-gallery-close]') || event.target === modal) {
        modal.classList.add('hidden')
        activeId = null
        return
      }
      if (event.target.closest('[data-gallery-delete]')) {
        void deleteMedia(activeId).then(() => {
          modal.classList.add('hidden')
          activeId = null
          return render()
        })
      }
    })

    const onKey = (event) => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
        event.stopPropagation()
        modal.classList.add('hidden')
      }
    }
    document.addEventListener('keydown', onKey, true)
    void render()
    disposeGallery = () => {
      closed = true
      releaseUrls()
      document.removeEventListener('keydown', onKey, true)
    }
  },
  destroy: () => {
    disposeGallery?.()
    disposeGallery = null
  },
}

export const timelineView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
        <h2 class="mt-1 text-2xl font-semibold">Timeline</h2>
        <p class="mt-1 text-sm text-muted-foreground">A private record of your life in S</p>
      </div>
      <div id="timeline-list" class="flex flex-col gap-3">${renderTimeline()}</div>
    </div>`,
  init: (root) => {
    const list = root.querySelector('#timeline-list')
    const render = () => {
      list.innerHTML = renderTimeline()
    }
    disposeTimeline = calendarEvents.subscribe(render)
  },
  destroy: () => {
    disposeTimeline?.()
    disposeTimeline = null
  },
}

function renderTimeline() {
  const events = calendarEvents.get()
  if (!events.length) {
    return `<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Nothing on your timeline yet — add an event on the Calendar and it will appear here.</div>`
  }
  return [...events]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .map((event) => {
      const when = new Date(event.when)
      const label = Number.isNaN(when.getTime()) ? event.when : when.toLocaleString()
      return `
        <div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <div class="grid size-9 place-items-center rounded-xl bg-muted">${icon(Clock3, 'size-4 text-muted-foreground')}</div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">${esc(event.title)}</p>
            <p class="text-xs text-muted-foreground">${esc(label)}</p>
          </div>
        </div>`
    })
    .join('')
}