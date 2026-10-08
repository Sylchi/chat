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