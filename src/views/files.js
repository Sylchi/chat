import { Cloud, Download, File, FileText, Folder, FolderPlus, Github, HardDrive, LockKeyhole, RefreshCw, Trash2, Upload, X } from '../vendor/icons.js'
import { esc, formatBytes, icon } from '../dom.js'
import { showAuth } from '../store.js'
import { passkey } from '../passkey-store.js'
import { filesConfig, githubConfig, googleClientId, updateConfig } from '../files/config.js'
import { baseName, isTextLike, parentOf } from '../files/util.js'
import {
  activeProvider,
  connect,
  disconnect,
  downloadEntry,
  filesState,
  goUp,
  initFiles,
  navigate,
  newFolder,
  openEntry,
  providerList,
  readEntry,
  refresh,
  removeEntry,
  setProvider,
  uploadFiles,
} from '../files-store.js'

// File manager over pluggable storage providers. Local backends (File System
// Access, IndexedDB, localStorage) work out of the box; Google Drive and
// GitHub are cloud providers configured with user-supplied credentials.

const PROVIDER_ICON = { fsa: HardDrive, idb: HardDrive, localstorage: HardDrive, gdrive: Cloud, github: Github }

function crumbBar(path) {
  const parts = path.split('/').filter(Boolean)
  const crumbs = [`<button data-files-crumb="/" class="rounded-md px-1.5 py-0.5 hover:bg-accent">root</button>`]
  let walked = ''
  for (const part of parts) {
    walked += `/${part}`
    crumbs.push(`<span class="text-muted-foreground/60">/</span><button data-files-crumb="${esc(walked)}" class="rounded-md px-1.5 py-0.5 hover:bg-accent">${esc(part)}</button>`)
  }
  return `<nav class="flex flex-wrap items-center gap-0.5 font-mono text-[11px] text-muted-foreground">${crumbs.join('')}</nav>`
}

function providerTabs(active) {
  return providerList()
    .filter((provider) => provider.available)
    .map((provider) => {
      const on = provider.id === active
      const dot = provider.kind === 'cloud' ? `<span class="ml-1 inline-block size-1.5 rounded-full ${provider.connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}"></span>` : ''
      return `<button data-provider="${esc(provider.id)}" class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${on ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent hover:text-foreground'}">${icon(PROVIDER_ICON[provider.id] ?? HardDrive, 'size-3.5')}${esc(provider.label)}${dot}</button>`
    })
    .join('')
}

function entryIcon(entry) {
  if (entry.dir) return Folder
  return isTextLike(entry.name, entry.type) ? FileText : File
}

function entryRow(entry) {
  return `<div class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
    ${icon(entryIcon(entry), `size-4 ${entry.dir ? 'text-amber-500' : 'text-muted-foreground'}`)}
    <button data-entry="${esc(entry.path)}" class="min-w-0 flex-1 text-left">
      <span class="block truncate text-sm ${entry.dir ? 'font-medium' : ''}">${esc(entry.name)}</span>
      <span class="block truncate text-[11px] text-muted-foreground">${entry.dir ? 'Folder' : `${formatBytes(entry.size)} · ${esc(entry.type || 'file')}`}</span>
    </button>
    <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      ${entry.dir ? '' : `<button data-entry-download="${esc(entry.path)}" aria-label="Download ${esc(entry.name)}" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">${icon(Download, 'size-3.5')}</button>`}
      <button data-entry-delete="${esc(entry.path)}" aria-label="Delete ${esc(entry.name)}" class="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-rose-600">${icon(Trash2, 'size-3.5')}</button>
    </div>
  </div>`
}

function field(label, value, key, { type = 'text', placeholder = '' } = {}) {
  return `<label class="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">${esc(label)}
    <input data-files-field="${esc(key)}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" class="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20" />
  </label>`
}

function connectPanel(provider, state) {
  const iconNode = PROVIDER_ICON[provider.id] ?? HardDrive
  const error = state.error ? `<p class="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">${esc(state.error)}</p>` : ''
  const busy = state.status === 'busy'

  if (provider.id === 'gdrive') {
    return `<div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div class="flex items-center gap-2">${icon(iconNode, 'size-4 text-primary')}<p class="text-sm font-medium">Connect Google Drive</p></div>
      <p class="text-xs text-muted-foreground">Drive needs an OAuth Client ID from a Google Cloud project (enable the Drive API, add this origin as an authorized JavaScript origin). The token stays in memory.</p>
      ${field('OAuth Client ID', filesConfig.get().gdrive.clientId || googleClientId(), 'gdrive.clientId', { placeholder: 'xxxxxxxx.apps.googleusercontent.com' })}
      <div class="flex gap-2">
        <button data-files-config="gdrive" class="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent">Save</button>
        <button data-files-connect class="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Connect Drive'}</button>
      </div>
      ${error}
    </div>`
  }

  if (provider.id === 'github') {
    const cfg = githubConfig()
    return `<div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div class="flex items-center gap-2">${icon(iconNode, 'size-4 text-primary')}<p class="text-sm font-medium">Connect GitHub</p></div>
      <p class="text-xs text-muted-foreground">Use a personal access token with contents read/write on one repository. The token is stored sealed in your vault.</p>
      <div class="grid gap-2 sm:grid-cols-2">
        ${field('Owner', cfg.owner, 'github.owner', { placeholder: 'octocat' })}
        ${field('Repository', cfg.repo, 'github.repo', { placeholder: 'notes' })}
        ${field('Branch', cfg.branch, 'github.branch', { placeholder: 'main' })}
        ${field('Token', cfg.token, 'github.token', { type: 'password' })}
      </div>
      <div class="flex gap-2">
        <button data-files-config="github" class="rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent">Save</button>
        <button data-files-connect class="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Connect GitHub'}</button>
      </div>
      ${error}
    </div>`
  }

  if (provider.id === 'fsa') {
    return `<div class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div class="flex items-center gap-2">${icon(iconNode, 'size-4 text-primary')}<p class="text-sm font-medium">Open a folder on this device</p></div>
      <p class="text-xs text-muted-foreground">${esc(provider.hint)} The browser will ask which folder to share. Only Chromium browsers support this.</p>
      <button data-files-connect class="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60" ${busy ? 'disabled' : ''}>${busy ? 'Waiting…' : 'Choose folder'}</button>
      ${error}
    </div>`
  }

  return error
}

function toolbar(state, provider) {
  if (!state.connected) return ''
  const busy = state.status === 'busy'
  return `<div class="flex flex-wrap items-center gap-2">
    <button data-files-up class="rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40" ${state.path === '/' ? 'disabled' : ''}>Up</button>
    ${crumbBar(state.path)}
    <div class="ml-auto flex items-center gap-2">
      <button data-files-newfolder class="flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent ${busy ? 'opacity-60' : ''}">${icon(FolderPlus, 'size-3.5')}Folder</button>
      <label class="flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 ${busy ? 'opacity-60' : ''}">${icon(Upload, 'size-3.5')}Upload<input data-files-input type="file" multiple class="hidden" /></label>
      <button data-files-refresh aria-label="Refresh" class="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">${icon(RefreshCw, 'size-3.5')}</button>
      ${provider.kind === 'cloud' ? `<button data-files-disconnect class="rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">Disconnect</button>` : ''}
    </div>
  </div>`
}

function listBody(state, provider) {
  if (!provider.available()) {
    return `<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">This provider is not available in this browser.</div>`
  }
  if (provider.requiresUnlock && state.locked) {
    return `<div class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
      ${icon(LockKeyhole, 'size-5 text-muted-foreground')}
      <div>
        <p class="text-sm font-medium">Unlock S to open on-device storage</p>
        <p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Files stored here are sealed with your key, so they can only be read while your identity is unlocked.</p>
      </div>
      <button data-files-unlock class="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">Unlock</button>
    </div>`
  }
  if (!state.connected) return connectPanel(provider, state)
  if (state.status === 'loading') {
    return `<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Loading…</div>`
  }
  if (!state.entries.length) {
    return `<div class="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
      ${icon(Folder, 'mx-auto size-5 text-muted-foreground')}
      <p class="mt-2 text-sm font-medium">Empty folder</p>
      <p class="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Upload a file${provider.id === 'github' ? ' (empty GitHub folders are kept with a hidden .gitkeep)' : ''}.</p>
    </div>`
  }
  return `<div class="flex flex-col gap-1.5">${state.entries.map(entryRow).join('')}</div>`
}

export const filesView = {
  html: () => `
    <div class="flex-1 overflow-auto p-5 sm:p-8">
      <div class="mb-5">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Storage</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Files</h2>
        <p class="mt-1 text-sm text-muted-foreground">Local folders and cloud drives in one place. Local contents are sealed with your key.</p>
      </div>
      <div data-files-tabs class="mb-4 flex flex-wrap gap-2"></div>
      <div data-files-body class="flex flex-col gap-4"></div>
      <div data-files-preview class="fixed inset-0 z-50 hidden place-items-center bg-foreground/40 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" class="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div class="flex items-center justify-between gap-3 border-b border-border p-4">
            <p data-files-preview-name class="truncate text-sm font-semibold"></p>
            <div class="flex items-center gap-1">
              <button data-files-preview-download aria-label="Download" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(Download, 'size-4')}</button>
              <button data-files-preview-close aria-label="Close" class="rounded-lg p-2 text-muted-foreground hover:bg-accent">${icon(X)}</button>
            </div>
          </div>
          <div data-files-preview-body class="overflow-auto bg-muted/40 p-4"></div>
        </div>
      </div>
    </div>`,
  init(root) {
    const tabs = root.querySelector('[data-files-tabs]')
    const body = root.querySelector('[data-files-body]')
    const modal = root.querySelector('[data-files-preview]')
    const previewName = root.querySelector('[data-files-preview-name]')
    const previewBody = root.querySelector('[data-files-preview-body]')
    let previewEntry = null
    let closed = false

    const render = () => {
      if (closed) return
      const state = filesState.get()
      const provider = activeProvider()
      tabs.innerHTML = providerTabs(state.provider)
      const banner = state.error && state.connected ? `<p class="rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600">${esc(state.error)}</p>` : ''
      body.innerHTML = `${banner}${toolbar(state, provider)}${listBody(state, provider)}`
    }

    const openPreview = async (entry) => {
      try {
        const record = await readEntry(entry)
        previewEntry = entry
        previewName.textContent = record.name || baseName(entry.path)
        const type = record.type || entry.type || ''
        if (type.startsWith('image/')) {
          const url = URL.createObjectURL(record.blob)
          previewBody.innerHTML = `<img src="${url}" alt="${esc(entry.name)}" class="mx-auto max-h-[70vh] rounded-xl object-contain" />`
        } else if (type.startsWith('video/')) {
          const url = URL.createObjectURL(record.blob)
          previewBody.innerHTML = `<video src="${url}" controls class="mx-auto max-h-[70vh] rounded-xl"></video>`
        } else {
          const text = await record.blob.text()
          previewBody.innerHTML = `<pre class="whitespace-pre-wrap break-words font-mono text-xs text-foreground">${esc(text.slice(0, 200000))}</pre>`
        }
        modal.classList.remove('hidden')
        modal.classList.add('grid')
      } catch (error) {
        filesState.set({ ...filesState.get(), error: error instanceof Error ? error.message : String(error) })
      }
    }

    const closePreview = () => {
      modal.classList.add('hidden')
      modal.classList.remove('grid')
      previewBody.innerHTML = ''
      previewEntry = null
    }

    root.addEventListener('click', async (event) => {
      const target = event.target
      const tab = target.closest('[data-provider]')
      if (tab) { void setProvider(tab.dataset.provider); return }
      if (target.closest('[data-files-up]')) { void goUp(); return }
      if (target.closest('[data-files-refresh]')) { void refresh(); return }
      if (target.closest('[data-files-connect]')) { void connect(); return }
      if (target.closest('[data-files-disconnect]')) { void disconnect(); return }
      if (target.closest('[data-files-unlock]')) { showAuth.set(true); return }
      const crumb = target.closest('[data-files-crumb]')
      if (crumb) { void navigate(crumb.dataset.filesCrumb); return }
      if (target.closest('[data-files-newfolder]')) {
        const name = window.prompt('New folder name')
        if (name) { await newFolder(name).catch(() => {}) }
        return
      }
      const configSave = target.closest('[data-files-config]')
      if (configSave) {
        const section = configSave.dataset.filesConfig
        const patch = {}
        for (const input of body.querySelectorAll('[data-files-field]')) {
          const key = input.dataset.filesField
          if (key.startsWith(section + '.')) patch[key.slice(section.length + 1)] = input.value.trim()
        }
        updateConfig(section, patch)
        render()
        return
      }
      const entryBtn = target.closest('[data-entry]')
      if (entryBtn) {
        const entry = filesState.get().entries.find((item) => item.path === entryBtn.dataset.entry)
        if (entry?.dir) void openEntry(entry)
        else if (entry) void openPreview(entry)
        return
      }
      const downloadBtn = target.closest('[data-entry-download]')
      if (downloadBtn) {
        const entry = filesState.get().entries.find((item) => item.path === downloadBtn.dataset.entryDownload)
        if (entry) void downloadEntry(entry)
        return
      }
      const deleteBtn = target.closest('[data-entry-delete]')
      if (deleteBtn) {
        const entry = filesState.get().entries.find((item) => item.path === deleteBtn.dataset.entryDelete)
        if (entry && window.confirm(`Delete ${entry.name}?`)) void removeEntry(entry)
        return
      }
      if (target.closest('[data-files-preview-close]') || target === modal) { closePreview(); return }
      if (target.closest('[data-files-preview-download]') && previewEntry) { void downloadEntry(previewEntry); return }
    })

    body.addEventListener('change', (event) => {
      const input = event.target.closest('[data-files-input]')
      if (input?.files?.length) {
        void uploadFiles(input.files)
        input.value = ''
      }
    })

    const onKey = (event) => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
        event.stopPropagation()
        closePreview()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const off = filesState.subscribe(render)
    let wasUnlocked = passkey.get().status === 'unlocked'
    const offPasskey = passkey.subscribe((state) => {
      const unlocked = state.status === 'unlocked'
      if (unlocked && !wasUnlocked) void refresh()
      wasUnlocked = unlocked
    })
    void initFiles()

    filesView.destroy = () => {
      closed = true
      off()
      offPasskey()
      document.removeEventListener('keydown', onKey, true)
      for (const image of previewBody.querySelectorAll('img,video')) {
        if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src)
      }
    }
  },
  destroy() {},
}
