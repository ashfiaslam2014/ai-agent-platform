import type { Skill } from '../types'
import { listOpenSlots, createBooking } from '@/lib/actions/booking'
import { sendNotification } from '@/lib/actions/notifications'

/**
 * Booking skill. Two shapes in one tool so the model can either check
 * availability or commit — it must check before it books.
 *
 * config (business_skills.config):
 *   { "defaultDurationMinutes": 60,
 *     "googleCalendarId": "...", "googleServiceAccountJson": "..." }
 */
export const createBookingSkill: Skill = {
  name: 'create_booking',
  description:
    'Check open appointment slots for a date, or confirm a booking once the customer has chosen a time. Always check availability before confirming.',
  tier: 'action',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'service_name'],
    properties: {
      action: { type: 'string', enum: ['check_availability', 'confirm'] },
      service_name: { type: 'string', description: 'The service being booked.' },
      date: { type: 'string', description: 'Target date, YYYY-MM-DD.' },
      starts_at: { type: 'string', description: 'ISO 8601 datetime — required when action is "confirm".' },
      duration_minutes: { type: 'integer', description: 'Defaults to the business default if omitted.' },
      customer_name: { type: 'string' },
      customer_phone: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  async run(args, ctx) {
    const duration =
      Number(args.duration_minutes) || Number(ctx.config.defaultDurationMinutes) || 60

    if (args.action === 'check_availability') {
      if (!args.date) return { ok: false, error: 'date is required to check availability', retryable: true }
      const slots = await listOpenSlots(ctx.supabase, ctx.businessId, {
        date: String(args.date),
        durationMinutes: duration,
      })
      ctx.log('booking.availability', { date: args.date, count: slots.length })
      return {
        ok: true,
        data: { slots },
        summary: slots.length
          ? `Open times on ${args.date}: ${slots.map((s) => new Date(s).toISOString().slice(11, 16)).join(', ')}`
          : `No open slots on ${args.date}.`,
      }
    }

    // action === 'confirm'
    if (!args.starts_at || !args.customer_name) {
      return { ok: false, error: 'starts_at and customer_name are required to confirm', retryable: true }
    }

    const result = await createBooking(
      ctx.supabase,
      {
        businessId: ctx.businessId,
        serviceName: String(args.service_name),
        startsAt: String(args.starts_at),
        durationMinutes: duration,
        customerName: String(args.customer_name),
        customerPhone: (args.customer_phone as string) ?? ctx.contact.handle ?? null,
        notes: (args.notes as string) ?? null,
      },
      {
        googleCalendarId: ctx.config.googleCalendarId as string | undefined,
        googleServiceAccountJson: ctx.config.googleServiceAccountJson as string | undefined,
      },
    )

    if (!result.ok) return result

    const when = new Date(result.booking.startsAt).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })
    const phone = result.booking.customerPhone
    if (phone) {
      await sendNotification(ctx.supabase, {
        businessId: ctx.businessId,
        channel: 'whatsapp',
        to: phone,
        kind: 'booking_confirmation',
        body: `Your booking for ${result.booking.serviceName} on ${when} is confirmed. Reply here to change it.`,
      }).catch(() => {})
    }

    ctx.log('booking.confirmed', { id: result.booking.id })
    return {
      ok: true,
      data: { bookingId: result.booking.id, startsAt: result.booking.startsAt },
      summary: `Booked ${result.booking.serviceName} for ${result.booking.customerName} on ${when}.`,
    }
  },
}
