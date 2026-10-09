import { CircleHelp } from './vendor/icons.js'

const SVG_PROPS =
  'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

function nodeToString([tag, attrs]) {
  const { children, ...rest } = attrs
  const props = Object.entries(rest)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ')
  const inner = children ? children.map(nodeToString).join('') : ''
  return `<${tag}${props ? ` ${props}` : ''}>${inner}</${tag}>`
}

export function icon(iconNode, klass = 'size-4', attrs = '') {
  return `<svg ${attrs} class="${klass}" ${SVG_PROPS} aria-hidden="true">${iconNode.map(nodeToString).join('')}</svg>`
}

// In-app "S" monogram (the same mark as public/icon.svg), drawn with two fill
// paths. Colored via currentColor, sized via the Tailwind size classes. The raw
// path data is exported so the build-time icon generator can rasterize it with
// no external dependencies.
export const BRAND_PATHS = [
  'M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z',
  'M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z',
]

export function brandMark(klass = 'size-4') {
  return `<svg class="${klass}" viewBox="0 0 180 180" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${BRAND_PATHS.map((d) => `<path d="${d}"/>`).join('')}</svg>`
}

export function avatar(initials, color, online = false, small = false) {
  return `<span class="relative inline-flex shrink-0"><span class="grid place-items-center rounded-full font-semibold ${small ? 'size-8 text-[10px]' : 'size-10 text-xs'} ${color}">${esc(initials)}</span>${
    online
      ? '<span class="absolute -right-0.5 bottom-0 size-2.5 rounded-full border-2 border-card bg-emerald-500"></span>'
      : ''
  }</span>`
}

export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  )
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

/**
 * Inline help popover. Renders a small "?" toggle + an anchored bubble; wire
 * interactions once per container with initHelp(). Accessible: the toggle
 * carries aria-expanded + aria-controls, the bubble is a labelled region that
 * closes on Escape, focus-out, or outside click.
 */
export function helpWrap(id, body, label = 'Help', align = 'center') {
  const alignClass = align === 'left' ? 'left-0 -translate-x-0' : 'left-1/2 -translate-x-1/2'
  return `<span class="relative inline-flex">
    <button type="button" data-help-toggle="${esc(id)}" aria-expanded="false" aria-controls="${esc(id)}" aria-label="${esc(label)}" class="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">${icon(CircleHelp, 'size-4')}</button>
    <div id="${esc(id)}" data-help-panel="${esc(id)}" role="region" aria-label="${esc(label)}" aria-hidden="true" class="absolute top-full z-30 mt-2 hidden w-64 max-w-[85vw] rounded-2xl border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-xl ${alignClass}">${body}</div>
  </span>`
}

/** Wire the popover behaviour for a container (add on each view mount). */
export function initHelp(root = document) {
  const close = (panel) => {
    panel.classList.add('hidden')
    panel.setAttribute('aria-hidden', 'true')
    const toggle = root.querySelector(`[data-help-toggle="${panel.dataset.helpPanel}"]`)
    toggle?.setAttribute('aria-expanded', 'false')
  }
  root.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-help-toggle]')
    if (toggle) {
      event.stopPropagation()
      const panel = root.querySelector(`[data-help-panel="${toggle.dataset.helpToggle}"]`)
      if (!panel) return
      const opening = panel.classList.contains('hidden')
      for (const p of root.querySelectorAll('[data-help-panel]')) close(p)
      if (opening) {
        panel.classList.remove('hidden')
        panel.setAttribute('aria-hidden', 'false')
        toggle.setAttribute('aria-expanded', 'true')
      }
      return
    }
    if (!event.target.closest('[data-help-panel]')) {
      for (const p of root.querySelectorAll('[data-help-panel]')) close(p)
    }
  })
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    for (const p of root.querySelectorAll('[data-help-panel]')) {
      if (!p.classList.contains('hidden')) {
        event.stopPropagation()
        close(p)
      }
    }
  })
}