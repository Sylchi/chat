import { CalendarDays, Clock3, GalleryHorizontalEnd, ListTodo, Plus, X } from '../vendor/icons.js'
import { avatar, esc, icon } from '../dom.js'
import { chatMeta } from '../chats.js'
import { activeChat, activeNav, completedTasks } from '../store.js'
import { addContact, contacts } from '../contacts-store.js'

const DEMO_STATUS = {
  'Maya Chen': 'Online now',
  'Jordan Blake': 'Last seen yesterday',
  'Priya Shah': 'Online now',
  'Design crew': '4 members',
}

export const TASKS = [
  'Send final deck to design crew',
  'Choose favorites from Saturday gallery',
  'Book train for weekend trip',
  'Review privacy settings',
]

function openTaskCount() {
  const done = completedTasks.get()
  return TASKS.filter((task) => !done.includes(task)).length
}

function renderContacts() {
  const list = contacts.get()
  if (!list.length) {
    return '<p class="text-sm text-muted-foreground">No contacts yet — add someone to start a private chat.</p>'
  }
  return list
    .map((contact) => {
      const { initials, color } = chatMeta(contact.name)
      const status = DEMO_STATUS[contact.name] ?? 'Private contact'
      return `
        <article data-contact="${esc(contact.name)}" class="rounded-2xl border border-border bg-card p-4">
          <div class="flex items-start gap-3">
            ${avatar(initials, color, status === 'Online now')}
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold">${esc(contact.name)}</h3>
              <p class="text-xs text-muted-foreground">${esc(status)}</p>
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
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">October 2026</p>
          <h2 class="mt-1 text-2xl font-semibold">Calendar</h2>
        </div>
        <button class="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">New event</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${[
          'Today · 11:00 — Team sync',
          'Tomorrow · 14:30 — Call with Maya',
          'Friday · 18:00 — Gallery review',
          'Mon, Oct 12 · 09:00 — Plan the week',
          'Tue, Oct 13 · 16:00 — Design crew',
          'Sat, Oct 17 · All day — Weekend trip',
        ]
          .map(
            (event) => `
              <div class="rounded-2xl border border-border bg-card p-4">
                ${icon(CalendarDays, 'mb-4 size-4 text-primary')}
                <p class="text-sm font-medium">${esc(event)}</p>
                <p class="mt-1 text-xs text-muted-foreground">Private event · synced across 2 devices</p>
              </div>`,
          )
          .join('')}
      </div>
    </div>`,
}

export const tasksView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p data-tasks-open class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">${openTaskCount()} open items</p>
          <h2 class="mt-1 text-2xl font-semibold">Tasks</h2>
        </div>
        <button class="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Add task</button>
      </div>
      <div id="tasks-list" class="flex flex-col gap-3">${renderTasks()}</div>
    </div>`,
  init: (root) => {
    completedTasks.subscribe(() => {
      const list = root.querySelector('#tasks-list')
      if (list) list.innerHTML = renderTasks()
      const open = root.querySelector('[data-tasks-open]')
      if (open) {
        const count = openTaskCount()
        open.textContent = `${count} open item${count === 1 ? '' : 's'}`
      }
    })
    root.querySelector('#tasks-list')?.addEventListener('change', (event) => {
      const input = event.target.closest('input[data-task]')
      if (!input) return
      const task = input.dataset.task ?? ''
      const current = completedTasks.get()
      completedTasks.set(current.includes(task) ? current.filter((item) => item !== task) : [...current, task])
    })
  },
}

function renderTasks() {
  const done = completedTasks.get()
  return TASKS.map(
    (task, index) => `
      <label class="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <input type="checkbox" data-task="${esc(task)}" ${done.includes(task) ? 'checked' : ''} class="size-4 accent-primary" />
        <span class="flex-1 text-sm font-medium">${esc(task)}</span>
        <span class="text-xs text-muted-foreground">${index < 2 ? 'Today' : 'This week'}</span>
      </label>`,
  ).join('')
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