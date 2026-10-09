// Browser-safe vCard (RFC 6350 / RFC 2426) parser and generator.
// No Buffer, no node: built-ins, works in all modern browsers and Node 16+.

function unescapeVcard(text) {
  return String(text ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function escapeVcard(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function unfoldLines(text) {
  return String(text ?? '')
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/)
}

function parseParams(paramStr) {
  const params = {}
  if (!paramStr) return params
  const parts = paramStr.split(';')
  for (const part of parts) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq === -1) {
      // e.g. "HOME" in "EMAIL;HOME:..." (vCard 2.1/3.0 style)
      const key = part.trim().toUpperCase()
      params.TYPE = params.TYPE ? `${params.TYPE},${key}` : key
    } else {
      const key = part.slice(0, eq).trim().toUpperCase()
      const val = part.slice(eq + 1).trim()
      params[key] = val
    }
  }
  return params
}

export function cardName(card) {
  if (!card) return 'Unnamed'
  if (card.fn && typeof card.fn === 'string' && card.fn.trim()) return card.fn.trim()
  if (card.n) {
    const given = card.n.given || ''
    const family = card.n.family || ''
    const full = [given, family].filter(Boolean).join(' ').trim()
    if (full) return full
  }
  if (card.org && typeof card.org === 'string' && card.org.trim()) return card.org.trim()
  if (Array.isArray(card.email) && card.email[0]?.value) return card.email[0].value
  return 'Unnamed'
}

export function parseVcard(text) {
  if (!text) return null
  const lines = unfoldLines(text)
  let inCard = false
  const card = {
    version: '4.0',
    fn: '',
    n: { family: '', given: '', additional: '', prefix: '', suffix: '' },
    nickname: [],
    org: '',
    title: '',
    note: '',
    bday: '',
    photo: '',
    url: [],
    tel: [],
    email: [],
    adr: [],
    extra: {},
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue

    const prop = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    const semi = prop.indexOf(';')
    const name = (semi === -1 ? prop : prop.slice(0, semi)).trim().toUpperCase()
    const paramStr = semi === -1 ? '' : prop.slice(semi + 1)
    const params = parseParams(paramStr)
    const unescapedVal = unescapeVcard(value)

    if (name === 'BEGIN') {
      if (unescapedVal.toUpperCase() === 'VCARD') inCard = true
      continue
    }
    if (name === 'END') {
      if (unescapedVal.toUpperCase() === 'VCARD') break
      continue
    }

    switch (name) {
      case 'VERSION':
        card.version = unescapedVal
        break
      case 'FN':
        card.fn = unescapedVal
        break
      case 'N': {
        const parts = value.split(';').map(unescapeVcard)
        card.n = {
          family: parts[0] || '',
          given: parts[1] || '',
          additional: parts[2] || '',
          prefix: parts[3] || '',
          suffix: parts[4] || '',
        }
        break
      }
      case 'EMAIL': {
        const type = (params.TYPE || '').replace(/['"]/g, '').trim()
        card.email.push({ value: unescapedVal, type })
        break
      }
      case 'TEL': {
        const type = (params.TYPE || '').replace(/['"]/g, '').trim()
        card.tel.push({ value: unescapedVal, type })
        break
      }
      case 'ORG':
        card.org = unescapedVal
        break
      case 'TITLE':
        card.title = unescapedVal
        break
      case 'NOTE':
        card.note = unescapedVal
        break
      case 'BDAY':
        card.bday = unescapedVal
        break
      case 'PHOTO':
        card.photo = unescapedVal
        break
      case 'URL':
        card.url.push(unescapedVal)
        break
      case 'NICKNAME': {
        const nicks = unescapedVal.split(',').map((s) => s.trim()).filter(Boolean)
        card.nickname.push(...nicks)
        break
      }
      default:
        // Handle custom and extra properties (such as X-S-*, etc.)
        card.extra[prop.slice(0, semi === -1 ? undefined : semi)] = unescapedVal
        break
    }
  }

  if (!card.fn && !card.n.given && !card.n.family && !card.org && !card.email.length && Object.keys(card.extra).length === 0) {
    return null
  }
  if (!card.fn) card.fn = cardName(card)
  return card
}

export function parseVcards(text) {
  if (!text) return []
  const cards = []
  const rawCards = String(text).split(/(?=BEGIN:VCARD)/i)
  for (const raw of rawCards) {
    if (!/BEGIN:VCARD/i.test(raw)) continue
    const card = parseVcard(raw)
    if (card) cards.push(card)
  }
  return cards
}

export function buildVcard(card) {
  if (!card) return ''
  const lines = ['BEGIN:VCARD', `VERSION:${card.version || '4.0'}`]
  const fn = card.fn || cardName(card)
  lines.push(`FN:${escapeVcard(fn)}`)

  if (card.n) {
    const n = card.n
    lines.push(
      `N:${escapeVcard(n.family || '')};${escapeVcard(n.given || '')};${escapeVcard(n.additional || '')};${escapeVcard(n.prefix || '')};${escapeVcard(n.suffix || '')}`,
    )
  }
  if (Array.isArray(card.nickname) && card.nickname.length) {
    lines.push(`NICKNAME:${card.nickname.map(escapeVcard).join(',')}`)
  }
  if (card.org) lines.push(`ORG:${escapeVcard(card.org)}`)
  if (card.title) lines.push(`TITLE:${escapeVcard(card.title)}`)
  if (card.note) lines.push(`NOTE:${escapeVcard(card.note)}`)
  if (card.bday) lines.push(`BDAY:${escapeVcard(card.bday)}`)
  if (card.photo) lines.push(`PHOTO:${card.photo}`)

  if (Array.isArray(card.email)) {
    for (const item of card.email) {
      if (typeof item === 'string') {
        lines.push(`EMAIL:${escapeVcard(item)}`)
      } else if (item && item.value) {
        const typeParam = item.type ? `;TYPE=${item.type}` : ''
        lines.push(`EMAIL${typeParam}:${escapeVcard(item.value)}`)
      }
    }
  }

  if (Array.isArray(card.tel)) {
    for (const item of card.tel) {
      if (typeof item === 'string') {
        lines.push(`TEL:${escapeVcard(item)}`)
      } else if (item && item.value) {
        const typeParam = item.type ? `;TYPE=${item.type}` : ''
        lines.push(`TEL${typeParam}:${escapeVcard(item.value)}`)
      }
    }
  }

  if (Array.isArray(card.url)) {
    for (const item of card.url) {
      const val = typeof item === 'string' ? item : item?.value
      if (val) lines.push(`URL:${escapeVcard(val)}`)
    }
  }

  if (card.extra && typeof card.extra === 'object') {
    for (const [key, val] of Object.entries(card.extra)) {
      if (val != null && val !== '') {
        lines.push(`${key}:${escapeVcard(String(val))}`)
      }
    }
  }

  lines.push('END:VCARD')
  return lines.join('\r\n') + '\r\n'
}
