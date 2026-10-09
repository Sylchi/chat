import { importCards } from './contacts-store.js'

export function googleConfigured() {
  return typeof window !== 'undefined' && Boolean(window.S_GOOGLE_CLIENT_ID)
}

async function getAccessToken() {
  if (typeof window === 'undefined') {
    throw new Error('Google import is only supported in browser environments')
  }

  const clientId = window.S_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('Set window.S_GOOGLE_CLIENT_ID to enable Google import — or choose a .vcf file.')
  }

  if (window.google?.accounts?.oauth2) {
    return new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/contacts.readonly',
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error))
            } else if (response.access_token) {
              resolve(response.access_token)
            } else {
              reject(new Error('No access token returned from Google'))
            }
          },
          error_callback: (err) => {
            reject(new Error(err.message || 'Google authentication failed'))
          },
        })
        client.requestAccessToken({ prompt: 'consent' })
      } catch (err) {
        reject(err)
      }
    })
  }

  // Load Google Identity Services dynamically if not already loaded
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/contacts.readonly',
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error))
          } else if (response.access_token) {
            resolve(response.access_token)
          } else {
            reject(new Error('No access token returned from Google'))
          }
        },
        error_callback: (err) => {
          reject(new Error(err.message || 'Google authentication failed'))
        },
      })
      client.requestAccessToken({ prompt: 'consent' })
    } catch (err) {
      reject(err)
    }
  })
}

export async function importGoogleContacts() {
  const token = await getAccessToken()

  const res = await fetch(
    'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos,organizations,birthdays,nicknames&pageSize=1000',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!res.ok) {
    throw new Error(`Google Contacts request failed: ${res.statusText || res.status}`)
  }

  const data = await res.json()
  const connections = data.connections || []

  const cards = connections.map((person) => {
    const nameObj = person.names?.[0] || {}
    const fn =
      nameObj.displayName ||
      [nameObj.givenName, nameObj.familyName].filter(Boolean).join(' ') ||
      'Unnamed'
    const emails = (person.emailAddresses || []).map((e) => ({
      value: e.value,
      type: (e.type || 'HOME').toUpperCase(),
    }))
    const phones = (person.phoneNumbers || []).map((p) => ({
      value: p.value,
      type: (p.type || 'CELL').toUpperCase(),
    }))
    const org = person.organizations?.[0]?.name || ''
    const title = person.organizations?.[0]?.title || ''
    const nicknames = (person.nicknames || []).map((n) => n.value).filter(Boolean)
    const bdayObj = person.birthdays?.[0]?.date
    let bday = ''
    if (bdayObj) {
      const y = bdayObj.year ? String(bdayObj.year).padStart(4, '0') : '--'
      const m = String(bdayObj.month || 1).padStart(2, '0')
      const d = String(bdayObj.day || 1).padStart(2, '0')
      bday = `${y}-${m}-${d}`
    }
    const photo = person.photos?.[0]?.url || ''

    return {
      version: '4.0',
      fn,
      n: {
        family: nameObj.familyName || '',
        given: nameObj.givenName || '',
        additional: nameObj.middleName || '',
        prefix: nameObj.honorificPrefix || '',
        suffix: nameObj.honorificSuffix || '',
      },
      nickname: nicknames,
      org,
      title,
      note: '',
      bday,
      photo,
      url: [],
      tel: phones,
      email: emails,
      adr: [],
      extra: {},
    }
  })

  if (!cards.length) {
    return { added: 0, merged: 0 }
  }

  return importCards(cards)
}
