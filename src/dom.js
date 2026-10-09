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
// paths. Colored via currentColor, sized via the Tailwind size classes.
export function brandMark(klass = 'size-4') {
  return `<svg class="${klass}" viewBox="0 0 180 180" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z"/><path d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z"/></svg>`
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