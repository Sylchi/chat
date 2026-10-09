import { CalendarDays, Clock3, GalleryHorizontalEnd, ListTodo, Plus, X } from '../vendor/icons.js'
import { avatar, esc, icon } from '../dom.js'
import { chatMeta } from '../chats.js'
import { activeChat, activeNav, completedTasks, persistentAtom, threads } from '../store.js'
import { addContact, contacts } from '../contacts-store.js'
import { localDevice } from '../device-store.js'
import { lockPasskey } from '../passkey-store.js'
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

function renderContacts() {
  const list = contacts.get()
  if (!list.length) {
    return '<p class="text-sm text-muted-foreground">No contacts yet — add someone to start a private chat.</p>'
  }
  return list
    .map((contact) => {
      const { initials, color } = chatMeta(contact.name)
      return `
        <article data-contact="${esc(contact.name)}" class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-start gap-3">
            ${avatar(initials, color, false)}
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold">${esc(contact.name)}</h3>
              <p class="text-xs text-muted-foreground">Private contact · end-to-end encrypted</p>
              <p class="mt-3 truncate rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground" title="${esc(contact.id)}">${esc(contact.id)}</p>
            </div>
            <button data-message-contact="${esc(contact.name)}" class="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">Message</button>
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
        <button data-add-contact class="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">${icon(Plus, 'size-4')}Add contact</button>
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
    </div>`,
  init: (root) => {
    const list = root.querySelector('#contacts-list')
    const modal = root.querySelector('[data-modal="contact"]')
    const form = root.querySelector('[data-contact-form]')
    const nameInput = root.querySelector('[data-contact-name]')
    const errorBox = root.querySelector('[data-contact-error]')
    const createBtn = root.querySelector('[data-contact-create]')
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

    const onRootClick = (event) => {
      const messageBtn = event.target.closest('[data-message-contact]')
      if (messageBtn) {
        activeChat.set(messageBtn.dataset.messageContact ?? '')
        activeNav.set('Inbox')
        return
      }
      if (event.target.closest('[data-add-contact]')) {
        open(event.target.closest('[data-add-contact]'))
        return
      }
      if (event.target.closest('[data-contact-close]') || event.target === modal) close()
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

    const onDocumentKeydown = (event) => {
      if (event.key !== 'Escape') return
      if (!modal.classList.contains('hidden')) {
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
          <h3 class="text-sm font-semibold">This device</h3>
          <div data-settings-device class="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground"></div>
        </section>
        <section class="rounded-2xl border border-border bg-card p-4">
          <h3 class="text-sm font-semibold">At-rest encryption</h3>
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
    renderDevice()
    renderStats()
    offs.push(localDevice.subscribe(renderDevice), threads.subscribe(renderStats), contacts.subscribe(renderStats))
    root.querySelector('[data-settings-lock]').addEventListener('click', () => lockPasskey())
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
        <h2 class="mt-1 text-2xl font-semibold">Gallery</h2>
        <p class="mt-1 text-sm text-muted-foreground">Shared moments, kept private</p>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        ${['Saturday light', 'Maya · portrait set', 'Design crew · final deck', 'Weekend notes', 'Golden hour', 'Shared references']
          .map(
            (item, index) => `
              <div class="flex aspect-square items-end rounded-2xl border border-border p-4 ${['bg-amber-100', 'bg-sky-100', 'bg-violet-100', 'bg-emerald-100', 'bg-rose-100', 'bg-orange-100'][index]}">
                <span class="text-sm font-medium text-foreground/75">${esc(item)}</span>
              </div>`,
          )
          .join('')}
      </div>
    </div>`,
}

export const timelineView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
        <h2 class="mt-1 text-2xl font-semibold">Timeline</h2>
        <p class="mt-1 text-sm text-muted-foreground">A private record of your life in S</p>
      </div>
      <div class="flex flex-col gap-3">
        ${['New photo set added to Gallery', 'Maya replied to your message', 'Task completed: Review privacy settings', 'Device synced via WebBluetooth']
          .map(
            (item) => `
              <div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <div class="grid size-9 place-items-center rounded-xl bg-muted">${icon(Clock3, 'size-4 text-muted-foreground')}</div>
                <div>
                  <p class="text-sm font-medium">${esc(item)}</p>
                  <p class="text-xs text-muted-foreground">Private activity · just now</p>
                </div>
              </div>`,
          )
          .join('')}
      </div>
    </div>`,
}