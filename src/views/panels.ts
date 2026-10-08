import { CalendarDays, Clock3, GalleryHorizontalEnd, ListTodo } from 'lucide'
import { avatar, esc, icon, type View } from '../dom'
import { activeChat, activeNav, completedTasks } from '../store'

const contacts = [
  { name: 'Maya Chen', id: 's_mc_7F2K', initials: 'MC', color: 'bg-amber-200 text-amber-900', status: 'Online now' },
  { name: 'Jordan Blake', id: 's_jb_19QA', initials: 'JB', color: 'bg-sky-200 text-sky-900', status: 'Last seen yesterday' },
  { name: 'Priya Shah', id: 's_ps_4N8D', initials: 'PS', color: 'bg-rose-200 text-rose-900', status: 'Online now' },
  { name: 'Design crew', id: 's_dc_2V6M', initials: 'DC', color: 'bg-violet-200 text-violet-900', status: '4 members' },
]

const TASKS = [
  'Send final deck to design crew',
  'Choose favorites from Saturday gallery',
  'Book train for weekend trip',
  'Review privacy settings',
]

export const contactsView: View = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-7 flex items-end justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">People you trust</p>
          <h2 class="mt-1 text-2xl font-semibold tracking-tight">Contacts</h2>
          <p class="mt-1 text-sm text-muted-foreground">Every person has a private S ID for secure linking.</p>
        </div>
        <button class="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Add contact</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        ${contacts
          .map(
            (contact) => `
              <article data-contact="${esc(contact.name)}" class="rounded-2xl border border-border bg-card p-4">
                <div class="flex items-start gap-3">
                  ${avatar(contact.initials, contact.color, contact.status === 'Online now')}
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold">${esc(contact.name)}</h3>
                    <p class="text-xs text-muted-foreground">${esc(contact.status)}</p>
                    <p class="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">${esc(contact.id)}</p>
                  </div>
                  <button data-message-contact="${esc(contact.name)}" class="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">Message</button>
                </div>
              </article>`,
          )
          .join('')}
      </div>
    </div>`,
  init: (root) => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-message-contact]')) {
      button.addEventListener('click', () => {
        activeChat.set(button.dataset.messageContact ?? '')
        activeNav.set('Inbox')
      })
    }
  },
}

export const calendarView: View = {
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

export const tasksView: View = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">4 open items</p>
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
    })
    root.querySelector('#tasks-list')?.addEventListener('change', (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-task]')
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

export const galleryView: View = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Gallery</p>
        <h2 class="mt-1 text-2xl font-semibold">Gallery</h2>
        <p class="mt-1 text-sm text-muted-foreground">Shared moments, kept private</p>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        ${(
          [
            'Saturday light',
            'Maya · portrait set',
            'Design crew · final deck',
            'Weekend notes',
            'Golden hour',
            'Shared references',
          ] as const
        )
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

export const timelineView: View = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
        <h2 class="mt-1 text-2xl font-semibold">Timeline</h2>
        <p class="mt-1 text-sm text-muted-foreground">A private record of your life in S</p>
      </div>
      <div class="flex flex-col gap-3">
        ${(
          [
            'New photo set added to Gallery',
            'Maya replied to your message',
            'Task completed: Review privacy settings',
            'Device synced via WebBluetooth',
          ] as const
        )
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