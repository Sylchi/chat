import { Code, FileText, GitBranch, LockKeyhole, Plus, RefreshCw, Save, Search, Trash2, Upload, X } from '../vendor/icons.js'
import { esc, icon } from '../dom.js'
import { showAuth } from '../store.js'
import { passkey } from '../passkey-store.js'
import { githubConfig, updateConfig } from '../files/config.js'
import { diffStats, lineDiff } from '../diff.js'
import {
  changeCount,
  createFile,
  deleteCurrent,
  deployState,
  diffFor,
  discardCurrent,
  discardPath,
  initSite,
  isConfigured,
  openFile,
  publishChanges,
  pullRepo,
  refreshDeploy,
  repoLabel,
  saveFile,
  siteState,
  updateBuffer,
} from '../site-store.js'

// Studio — edit the website's own source in the browser. The working copy is
// kept in IndexedDB (sealed with the vault key) and published straight to a git
// repository through the GitHub API; the repository is the source of truth.

function field(label, value, key, { type = 'text', placeholder = '' } = {}) {
  return `<label class="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">${esc(label)}
    <input data-studio-field="${esc(key)}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20" />
  </label>`
}

function configPanel(state) {
  const cfg = githubConfig()
  const error = state.error ? `<p class="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">${esc(state.error)}</p>` : ''
  return `<div class="m-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-5">
    <div class="flex items-center gap-2">${icon(GitBranch, 'size-4 text-primary')}<p class="text-sm font-semibold">Connect a repository</p></div>
    <p class="text-xs text-muted-foreground">Publishing commits to this repository through api.github.com. On GitHub Pages, a commit updates the live site. The token is stored sealed in your vault.</p>
    <div class="grid gap-2 sm:grid-cols-2">
      ${field('Owner', cfg.owner, 'owner', { placeholder: 'octocat' })}
      ${field('Repository', cfg.repo, 'repo', { placeholder: 'website' })}
      ${field('Branch', cfg.branch, 'branch', { placeholder: 'main' })}
      ${field('Token', cfg.token, 'token', { type: 'password' })}
    </div>
    ${error}
    <div class="flex gap-2">
      <button data-studio-save-config class="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Save</button>
      ${isConfigured() ? '<button data-studio-config-close class="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent">Cancel</button>' : ''}
    </div>
  </div>`
}

function lockPanel() {
  return `<div class="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center">
    ${icon(LockKeyhole, 'size-5 text-muted-foreground')}
    <div>
      <p class="text-sm font-medium">Unlock S to open the editor</p>
      <p class="mt-1 text-xs text-muted-foreground">The working copy and your GitHub token are sealed with your key, so they can only be read while unlocked.</p>
    </div>
    <button data-studio-unlock class="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Unlock</button>
  </div>`
}

function emptyPanel(state) {
  const error = state.error ? `<p class="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">${esc(state.error)}</p>` : ''
  if (state.files.length) {
    return `<div class="m-auto max-w-sm p-8 text-center">
      ${icon(FileText, 'mx-auto size-6 text-muted-foreground')}
      <p class="mt-3 text-sm font-medium">Select a file to edit</p>
      <p class="mt-1 text-xs text-muted-foreground">${state.files.length} files from ${esc(repoLabel())} are ready in the working copy.</p>
      ${error}
    </div>`
  }
  return `<div class="m-auto max-w-sm p-8 text-center">
    ${icon(Code, 'mx-auto size-6 text-muted-foreground')}
    <p class="mt-3 text-sm font-medium">No files loaded</p>
    <p class="mt-1 text-xs text-muted-foreground">Pull ${esc(repoLabel())} to start editing this site in the browser.</p>
    <button data-studio-pull class="mt-4 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Pull repository</button>
    ${error}
  </div>`
}

function row(state, file) {
  const change = state.changes[file.path]
  const active = file.path === state.current
  const badge = change
    ? `<span class="shrink-0 rounded px-1 text-[9px] font-semibold ${change === 'deleted' ? 'bg-rose-500/15 text-rose-600' : change === 'added' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}">${change[0].toUpperCase()}</span>`
    : ''
  return `<button data-studio-file="${esc(file.path)}" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-[11px] ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'}">
    ${icon(FileText, 'size-3.5 shrink-0')}
    <span class="min-w-0 flex-1 truncate ${change === 'deleted' ? 'line-through opacity-60' : ''}">${esc(file.path)}</span>
    ${badge}
  </button>`
}

export const studioView = {
  html: () => `
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div data-studio-head class="flex shrink-0 flex-col gap-2 border-b border-border p-4"></div>
      <div data-studio-main class="flex min-h-0 flex-1"></div>
    </div>`,
  init(root) {
    const head = root.querySelector('[data-studio-head]')
    const main = root.querySelector('[data-studio-main]')
    let closed = false
    let editor = null
    let editorCreating = false
    let lastPath = null
    let lastApplied = null
    let fromEditor = false
    let configOpen = false
    let query = ''

    main.innerHTML = `
      <aside data-studio-list class="hidden w-[280px] shrink-0 flex-col border-r border-border bg-sidebar">
        <div class="flex items-center gap-2 border-b border-border p-3 text-muted-foreground">${icon(Search, 'size-3.5')}<input data-studio-search placeholder="Filter files" autocomplete="off" spellcheck="false" class="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" /></div>
        <div data-studio-rows class="min-h-0 flex-1 overflow-y-auto p-2"></div>
      </aside>
      <div data-studio-pane class="flex min-w-0 flex-1 flex-col">
        <div data-studio-overlay class="flex min-h-0 flex-1 overflow-auto"></div>
        <div data-studio-editor class="hidden min-h-0 flex-1 overflow-hidden"></div>
      </div>
      <div data-studio-review class="fixed inset-0 z-50 hidden place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" class="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div class="flex items-center justify-between gap-3 border-b border-border p-4">
            <p class="text-sm font-semibold">Changes against the repository <span data-studio-review-count class="font-normal text-muted-foreground"></span></p>
            <div class="flex items-center gap-1">
              <button data-studio-review-publish class="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">${icon(Upload, 'size-3.5')}Publish all</button>
              <button data-studio-review-close aria-label="Close review" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(X, 'size-4')}</button>
            </div>
          </div>
          <div data-studio-review-body class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"></div>
        </div>
      </div>`

    const listEl = main.querySelector('[data-studio-list]')
    const rowsEl = main.querySelector('[data-studio-rows]')
    const overlay = main.querySelector('[data-studio-overlay]')
    const editorHost = main.querySelector('[data-studio-editor]')
    const searchEl = main.querySelector('[data-studio-search]')
    const review = main.querySelector('[data-studio-review]')
    const reviewBody = main.querySelector('[data-studio-review-body]')
    const reviewCount = main.querySelector('[data-studio-review-count]')
    let reviewOpen = false

    async function ensureEditor() {
      if (editor || editorCreating) return
      editorCreating = true
      editor = await createEditor(editorHost, (text) => {
        fromEditor = true
        updateBuffer(text)
      })
      editorCreating = false
      if (!closed) render()
    }

    function renderHead(state) {
      const configured = isConfigured()
      const count = changeCount()
      const busy = state.status === 'busy' || state.status === 'loading'
      const statusText = state.error ? state.error : state.detail || (state.dirty ? 'Unsaved changes' : '')
      const statusClass = state.error ? 'text-rose-600' : 'text-muted-foreground'
      const actions = configured
        ? `<button data-studio-pull class="flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent ${busy ? 'opacity-60' : ''}">${icon(RefreshCw, 'size-3.5')}Pull</button>
           <button data-studio-new class="flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">${icon(Plus, 'size-3.5')}File</button>
           <button data-studio-save class="flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent ${state.current ? '' : 'opacity-40'}" ${state.current ? '' : 'disabled'}>${icon(Save, 'size-3.5')}Save</button>
           <button data-studio-discard class="rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent ${state.current ? '' : 'opacity-40'}" ${state.current ? '' : 'disabled'}>Discard</button>
           <button data-studio-delete class="rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-rose-600 ${state.current ? '' : 'opacity-40'}" ${state.current ? '' : 'disabled'}>${icon(Trash2, 'size-3.5')}</button>
           <button data-studio-review-open class="flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent ${count ? '' : 'opacity-40'}" ${count ? '' : 'disabled'}>Review${count ? ` ${count}` : ''}</button>
           <button data-studio-publish class="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" ${count && !busy ? '' : 'disabled'}>${icon(Upload, 'size-3.5')}Publish</button>`
        : ''
      head.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Source</p>
            <h2 class="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">Studio <button data-studio-config aria-label="Repository settings" class="rounded-lg p-1 text-muted-foreground hover:bg-accent">${icon(GitBranch, 'size-4')}</button></h2>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">${actions}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[11px]"><span class="truncate font-mono text-muted-foreground">${esc(repoLabel())}</span>${statusText ? `<span class="truncate ${statusClass}">· ${esc(statusText)}</span>` : ''}${deployBadge()}</div>`
    }

    function renderRows(state) {
      const q = query.trim().toLowerCase()
      const rows = q ? state.files.filter((file) => file.path.toLowerCase().includes(q)) : state.files
      rowsEl.innerHTML = rows.length
        ? rows.map((file) => row(state, file)).join('')
        : `<p class="px-3 py-6 text-center text-xs text-muted-foreground">No files</p>`
    }

    function syncEditor(state) {
      if (!editor) return
      if (state.current !== lastPath) {
        lastPath = state.current
        lastApplied = state.content
        fromEditor = false
        editor.set(state.content)
        editor.focus?.()
      } else if (!fromEditor && state.content !== lastApplied) {
        lastApplied = state.content
        editor.set(state.content)
      }
      fromEditor = false
    }

    function deployBadge() {
      const { run, loading, error } = deployState.get()
      if (error) return `<button data-studio-deploy class="truncate text-rose-600">Deploy · ${esc(error)}</button>`
      if (loading) return `<span class="truncate text-muted-foreground">Deploy · checking…</span>`
      if (!run) return `<button data-studio-deploy class="truncate text-muted-foreground underline underline-offset-4">Check deploy</button>`
      const phase = run.status === 'completed' ? run.conclusion : run.status
      const tone = phase === 'success' ? 'text-emerald-600' : phase === 'failure' || phase === 'cancelled' ? 'text-rose-600' : 'text-amber-600'
      return `<a data-studio-deploy href="${esc(run.html_url)}" target="_blank" rel="noreferrer" class="flex items-center gap-1 truncate ${tone}">${icon(GitBranch, 'size-3')}Deploy · ${esc(phase ?? 'unknown')}</a>`
    }

    function diffCard(item) {
      if (item.error) {
        return `<div class="rounded-2xl border border-border p-3"><p class="font-mono text-[11px] text-foreground">${esc(item.path)}</p><p class="mt-1 text-[11px] text-rose-600">${esc(item.error)}</p></div>`
      }
      const rows = lineDiff(item.base, item.current)
      const stats = diffStats(rows)
      const capped = rows.length > 3000 ? rows.slice(0, 3000) : rows
      const note = rows.length > capped.length ? `<p class="px-3 py-1 text-[10px] text-muted-foreground">Diff truncated (${rows.length} lines).</p>` : ''
      const body = capped
        .map((row) => {
          const sign = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '
          const tone = row.type === 'add' ? 'text-emerald-600' : row.type === 'del' ? 'text-rose-600' : 'text-muted-foreground'
          return `<div class="${tone}">${sign} ${esc(row.text)}</div>`
        })
        .join('')
      const kind = item.deleted ? 'deleted' : item.added ? 'added' : 'modified'
      return `<div class="flex flex-col rounded-2xl border border-border">
        <div class="flex items-center gap-2 border-b border-border p-3">
          <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">${esc(item.path)}</span>
          <span class="shrink-0 text-[10px] ${kind === 'deleted' ? 'text-rose-600' : kind === 'added' ? 'text-emerald-600' : 'text-amber-600'}">${kind}</span>
          <span class="shrink-0 text-[10px] text-emerald-600">+${stats.added}</span>
          <span class="shrink-0 text-[10px] text-rose-600">-${stats.removed}</span>
          <button data-studio-revert="${esc(item.path)}" class="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] font-medium hover:bg-accent">Revert</button>
        </div>
        <div class="max-h-80 overflow-auto p-3 font-mono text-[11px] leading-relaxed">${body}</div>
        ${note}
      </div>`
    }

    async function openReview() {
      reviewOpen = true
      review.classList.remove('hidden')
      review.classList.add('grid')
      await renderReview()
    }

    function closeReview() {
      reviewOpen = false
      review.classList.add('hidden')
      review.classList.remove('grid')
    }

    async function renderReview() {
      const state = siteState.get()
      const paths = Object.keys(state.changes)
      reviewCount.textContent = paths.length ? `· ${paths.length}` : ''
      if (!paths.length) {
        reviewBody.innerHTML = '<p class="p-6 text-center text-sm text-muted-foreground">No changes to review.</p>'
        return
      }
      reviewBody.innerHTML = '<p class="p-6 text-center text-sm text-muted-foreground">Loading diffs…</p>'
      const items = await Promise.all(
        paths.map(async (path) => {
          try {
            return { path, ...(await diffFor(path)) }
          } catch (error) {
            return { path, error: error instanceof Error ? error.message : String(error) }
          }
        }),
      )
      if (closed || !reviewOpen) return
      reviewBody.innerHTML = items.map(diffCard).join('')
    }

    let lastSig = ''

    function render() {
      if (closed) return
      const state = siteState.get()
      const configured = isConfigured()
      const editorVisible = configured && !configOpen && !state.locked && Boolean(state.current)
      const deploy = deployState.get()
      const sig = [
        state.status,
        state.error,
        state.detail,
        state.locked,
        state.current,
        state.dirty,
        state.files.length,
        Object.keys(state.changes).join(','),
        configured,
        configOpen,
        deploy.loading,
        deploy.error,
        deploy.run?.id,
      ].join('|')

      if (sig !== lastSig) {
        lastSig = sig
        renderHead(state)

        const showList = configured && !configOpen && !state.locked
        listEl.classList.toggle('hidden', !showList)
        listEl.classList.toggle('flex', showList)
        if (showList) renderRows(state)

        let overlayHtml = ''
        if (state.locked) overlayHtml = lockPanel()
        else if (!configured || configOpen) overlayHtml = configPanel(state)
        else if (!state.current) overlayHtml = emptyPanel(state)

        editorHost.classList.toggle('hidden', !editorVisible)
        editorHost.classList.toggle('flex', editorVisible)
        overlay.classList.toggle('hidden', editorVisible)
        overlay.classList.toggle('flex', !editorVisible)
        if (!editorVisible) {
          overlay.innerHTML = overlayHtml
          lastPath = null
        } else {
          overlay.innerHTML = ''
        }
      }

      if (editorVisible) {
        void ensureEditor()
        syncEditor(state)
      }
    }

    root.addEventListener('click', (event) => {
      const target = event.target
      if (target.closest('[data-studio-unlock]')) { showAuth.set(true); return }
      if (target.closest('[data-studio-config]')) { configOpen = !configOpen; render(); return }
      if (target.closest('[data-studio-config-close]')) { configOpen = false; render(); return }
      if (target.closest('[data-studio-save-config]')) {
        const patch = {}
        for (const input of head.querySelectorAll('[data-studio-field]')) patch[input.dataset.studioField] = input.value.trim()
        updateConfig('github', patch)
        configOpen = false
        render()
        return
      }
      if (target.closest('[data-studio-pull]')) { void pullRepo(); return }
      if (target.closest('[data-studio-save]')) { void saveFile(); return }
      if (target.closest('[data-studio-discard]')) { void discardCurrent(); return }
      if (target.closest('[data-studio-delete]')) {
        if (siteState.get().current && window.confirm(`Delete ${siteState.get().current}?`)) void deleteCurrent()
        return
      }
      if (target.closest('[data-studio-publish]')) { void publishChanges(); return }
      if (target.closest('[data-studio-review-open]')) { void openReview(); return }
      if (target.closest('[data-studio-review-close]') || target === review) { closeReview(); return }
      if (target.closest('[data-studio-review-publish]')) { void publishChanges().then(renderReview); return }
      if (target.closest('[data-studio-deploy]')) {
        const deploy = target.closest('[data-studio-deploy]')
        if (deploy.tagName !== 'A') { void refreshDeploy(); return }
        return
      }
      const revertBtn = target.closest('[data-studio-revert]')
      if (revertBtn) { void discardPath(revertBtn.dataset.studioRevert).then(renderReview); return }
      if (target.closest('[data-studio-new]')) {
        const path = window.prompt('New file path (e.g. src/views/page.js)')
        if (path) void createFile(path).then(render).catch((error) => siteState.set({ ...siteState.get(), error: error.message }))
        return
      }
      const fileBtn = target.closest('[data-studio-file]')
      if (fileBtn) {
        const path = fileBtn.dataset.studioFile
        if (path !== siteState.get().current) void openFile(path)
      }
    })

    searchEl.addEventListener('input', () => {
      query = searchEl.value
      renderRows(siteState.get())
    })

    const onKey = (event) => {
      if (event.key === 'Escape' && reviewOpen) {
        event.stopPropagation()
        closeReview()
      }
    }
    document.addEventListener('keydown', onKey, true)

    const offState = siteState.subscribe(render)
    const offDeploy = deployState.subscribe(render)
    let wasUnlocked = passkey.get().status === 'unlocked'
    const offPasskey = passkey.subscribe((state) => {
      const unlocked = state.status === 'unlocked'
      if (unlocked && !wasUnlocked) {
        void initSite().then(() => {
          if (isConfigured()) void refreshDeploy()
        })
      }
      wasUnlocked = unlocked
    })
    void initSite().then(() => {
      if (isConfigured()) void refreshDeploy()
    })

    studioView.destroy = () => {
      closed = true
      offState()
      offDeploy()
      offPasskey()
      document.removeEventListener('keydown', onKey, true)
      editor?.destroy?.()
      editor = null
    }
  },
  destroy() {},
}

async function createEditor(host, onChange) {
  try {
    const mod = await import('https://esm.sh/codemirror@6.0.1')
    const { EditorView, basicSetup } = mod
    const view = new EditorView({
      doc: '',
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'var(--card)', color: 'var(--foreground)', fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'var(--font-mono)' },
          '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none' },
          '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(view.state.doc.toString())
        }),
      ],
      parent: host,
    })
    return {
      set(value) {
        if (view.state.doc.toString() === value) return
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
      },
      get() { return view.state.doc.toString() },
      focus() { view.focus() },
      destroy() { view.destroy() },
    }
  } catch {
    const area = document.createElement('textarea')
    area.spellcheck = false
    area.className = 'h-full w-full resize-none bg-card p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none'
    area.addEventListener('input', () => onChange(area.value))
    area.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end')
      onChange(area.value)
    })
    host.appendChild(area)
    return {
      set(value) { area.value = value },
      get() { return area.value },
      focus() { area.focus() },
      destroy() { area.remove() },
    }
  }
}
