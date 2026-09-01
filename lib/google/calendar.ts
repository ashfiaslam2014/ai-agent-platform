/**
 * Google Calendar — write confirmed bookings as events, and read free/busy so
 * the agent can answer "are you free Thursday afternoon?".
 *
 * Auth is a service account (see ./auth). The target calendar must be shared
 * with the service-account email.
 *
 * Config comes either from a business's `google_workspace` column or, for
 * backward compatibility, from the `create_booking` skill's own config:
 *   { "googleCalendarId": "...@group.calendar.google.com",
 *     "googleServiceAccountJson": "<the full JSON key, as a string>" }
 */

import { getGoogleAccessToken } from './auth'

type CalConfig = { googleCalendarId?: string; googleServiceAccountJson?: string }

const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events'
const SCOPE_READONLY = 'https://www.googleapis.com/auth/calendar.readonly'

/** Create an event. Returns the Google event id, or null on any failure (best-effort). */
export async function syncBookingToCalendar(
  config: CalConfig,
  event: { summary: string; description: string; startIso: string; endIso: string },
): Promise<string | null> {
  if (!config.googleCalendarId || !config.googleServiceAccountJson) return null

  const token = await getGoogleAccessToken(config.googleServiceAccountJson, [SCOPE_EVENTS])
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
  return (data.id as string) ?? null
}

export type BusyBlock = { start: string; end: string }

/**
 * Free/busy for a window. Returns the busy blocks (empty array = fully free),
 * or null when Calendar isn't configured / the call fails.
 */
export async function checkAvailability(
  config: CalConfig,
  window: { timeMinIso: string; timeMaxIso: string },
): Promise<BusyBlock[] | null> {
  if (!config.googleCalendarId || !config.googleServiceAccountJson) return null

  const token = await getGoogleAccessToken(config.googleServiceAccountJson, [SCOPE_READONLY])
  if (!token) return null

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: window.timeMinIso,
      timeMax: window.timeMaxIso,
      items: [{ id: config.googleCalendarId }],
    }),
  })
  if (!res.ok) {
    console.warn('[calendar] freeBusy failed:', await res.text())
    return null
  }
  const data = await res.json()
  const busy = data.calendars?.[config.googleCalendarId]?.busy ?? []
  return (busy as { start: string; end: string }[]).map((b) => ({ start: b.start, end: b.end }))
}
