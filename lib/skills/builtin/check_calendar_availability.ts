import type { Skill } from '../types'
import { checkAvailability } from '@/lib/google/calendar'
import { resolveGoogleConfig } from '@/lib/google/config'

/**
 * Read free/busy from the business Google Calendar so the agent can answer
 * "are you free Thursday?" without touching the bookings table.
 * Needs businesses.google_workspace (serviceAccountJson + calendarId).
 */
export const checkCalendarAvailabilitySkill: Skill = {
  name: 'check_calendar_availability',
  description:
    "Check the business's Google Calendar for busy periods on a date (or date range) before offering the customer a time.",
  tier: 'answering',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['date'],
    properties: {
      date: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
      end_date: { type: 'string', description: 'Optional end date, YYYY-MM-DD. Defaults to date.' },
    },
  },
  async run(args, ctx) {
    const date = String(args.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'date must be YYYY-MM-DD', retryable: true }
    }
    const endDate = args.end_date ? String(args.end_date) : date

    const cfg = resolveGoogleConfig(ctx)
    if (!cfg.serviceAccountJson || !cfg.calendarId) {
      return { ok: false, error: 'Google Calendar is not connected for this business' }
    }

    const busy = await checkAvailability(
      { googleServiceAccountJson: cfg.serviceAccountJson, googleCalendarId: cfg.calendarId },
      { timeMinIso: `${date}T00:00:00Z`, timeMaxIso: `${endDate}T23:59:59Z` },
    )
    if (busy === null) return { ok: false, error: 'could not reach Google Calendar' }

    ctx.log('calendar.availability', { date, endDate, busy: busy.length })
    return {
      ok: true,
      data: { busy },
      summary: busy.length
        ? `Busy: ${busy
            .map((b) => `${b.start.slice(0, 16).replace('T', ' ')}–${b.end.slice(11, 16)}`)
            .join(', ')}`
        : `No events between ${date} and ${endDate} — fully open.`,
    }
  },
}
