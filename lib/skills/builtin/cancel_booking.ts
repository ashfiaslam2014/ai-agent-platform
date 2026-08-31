import type { Skill } from '../types'
import { cancelBooking } from '@/lib/actions/booking'
import { sendNotification } from '@/lib/actions/notifications'

/**
 * Cancels the caller's upcoming booking. Matches on the contact's phone and the
 * next confirmed future booking, so the customer doesn't need a reference number.
 */
export const cancelBookingSkill: Skill = {
  name: 'cancel_booking',
  description: "Cancel the customer's upcoming booking.",
  tier: 'action',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      customer_phone: { type: 'string', description: 'Defaults to the number they are messaging from.' },
      starts_at: { type: 'string', description: 'ISO datetime, if they have several bookings and named one.' },
    },
  },
  async run(args, ctx) {
    const phone = (args.customer_phone as string) ?? ctx.contact.handle
    if (!phone) return { ok: false, error: 'need the phone number the booking was made with', retryable: true }

    let q = ctx.supabase
      .from('bookings')
      .select('id, service_name, starts_at')
      .eq('business_id', ctx.businessId)
      .eq('customer_phone', phone)
      .eq('status', 'confirmed')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)

    if (args.starts_at) q = ctx.supabase
      .from('bookings')
      .select('id, service_name, starts_at')
      .eq('business_id', ctx.businessId)
      .eq('customer_phone', phone)
      .eq('status', 'confirmed')
      .eq('starts_at', String(args.starts_at))
      .limit(1)

    const { data } = await q
    const booking = (data ?? [])[0] as { id: string; service_name: string; starts_at: string } | undefined
    if (!booking) return { ok: false, error: 'no upcoming booking found for that number' }

    const res = await cancelBooking(ctx.supabase, ctx.businessId, booking.id)
    if (!res.ok) return { ok: false, error: res.error ?? 'could not cancel' }

    const when = new Date(booking.starts_at).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })
    await sendNotification(ctx.supabase, {
      businessId: ctx.businessId,
      channel: 'whatsapp',
      to: phone,
      kind: 'booking_cancelled',
      body: `Your ${booking.service_name} booking on ${when} has been cancelled.`,
    }).catch(() => {})

    ctx.log('booking.cancelled', { id: booking.id })
    return { ok: true, data: { bookingId: booking.id }, summary: `Cancelled the ${booking.service_name} booking on ${when}.` }
  },
}
