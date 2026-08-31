/**
 * Google Calendar sync via a service account (JWT → OAuth2 access token).
 *
 * No googleapis dependency: we mint the JWT with Web Crypto and call the REST
 * API directly. Requires a service-account key JSON and a calendar shared with
 * that service account's email.
 *
 * Config comes from business_skills.config for the `create_booking` skill:
 *   { "googleCalendarId": "...@group.calendar.google.com",
 *     "googleServiceAccountJson": "<the full JSON key, as a string>" }
 */

type CalConfig = { googleCalendarId?: string; googleServiceAccountJson?: string }

export async function syncBookingToCalendar(
  config: CalConfig,
  event: { summary: string; description: string; startIso: string; endIso: string },
): Promise<string | null> {
  if (!config.googleCalendarId || !config.googleServiceAccountJson) return null

  const key = JSON.parse(config.googleServiceAccountJson) as {
    client_email: string
    private_key: string
  }

  const token = await getAccessToken(key.client_email, key.private_key)
  if (!token) return null

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.googleCalendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startIso },
        end: { dateTime: event.endIso },
      }),
    },
  )
  if (!res.ok) {
    console.warn('[calendar] event create failed:', await res.text())
    return null
  }
  const data = await res.json()
  return data.id ?? null
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (obj: object) => base64url(JSON.stringify(obj))
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(claim)}`

  const keyData = pemToBytes(privateKeyPem)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${base64urlBytes(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    console.warn('[calendar] token exchange failed:', await res.text())
    return null
  }
  const data = await res.json()
  return data.access_token ?? null
}

function base64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function base64urlBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return new Uint8Array(Buffer.from(body, 'base64'))
}
