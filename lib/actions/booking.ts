import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'
import { syncBookingToCalendar } from '@/lib/google/calendar'

/**
 * Booking engine — slot math + conflict detection over the `bookings` table.
 * Calendar sync is best-effort and never blocks a booking (see lib/google/calendar).
 */

export type BookingInput = {
  businessId: string
  serviceName: string
  startsAt: string // ISO 8601
  durationMinutes: number
  customerName: string
  customerPhone: string | null
  notes?: string | null
}

export type Booking = BookingInput & {
  id: string
  endsAt: string
  status: 'confirmed' | 'cancelled'
  calendarEventId: string | null
  createdAt: string
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

type Hours = Record<string, { open: string; close: string } | 'closed'>

export async function listOpenSlots(
  supabase: SupabaseClient,
  businessId: string,
  opts: { date: string; durationMinutes: number; stepMinutes?: number },
): Promise<string[]> {
  const step = opts.stepMinutes ?? 30
  const { data: biz } = await supabase
    .from('businesses')
    .select('hours, timezone')
    .eq('id', businessId)
    .single()

  const hours = (biz?.hours ?? null) as Hours | null
  const dow = DAY_KEYS[new Date(`${opts.date}T00:00:00`).getUTCDay()]
  const window = hours?.[dow]
  if (!window || window === 'closed') return []

  const dayStart = toDate(opts.date, window.open)
  const dayEnd = toDate(opts.date, window.close)

  const { data: existing } = await supabase
    .from('bookings')
    .select('starts_at, ends_at')
    .eq('business_id', businessId)
    .eq('status', 'confirmed')
    .gte('starts_at', `${opts.date}T00:00:00Z`)
    .lte('starts_at', `${opts.date}T23:59:59Z`)

  const taken = ((existing ?? []) as { starts_at: string; ends_at: string }[]).map((r) => ({
    start: new Date(r.starts_at).getTime(),
    end: new Date(r.ends_at).getTime(),
  }))

  const slots: string[] = []
  for (let t = dayStart.getTime(); t + opts.durationMinutes * 60_000 <= dayEnd.getTime(); t += step * 60_000) {
    const slotEnd = t + opts.durationMinutes * 60_000
    const clashes = taken.some((b) => t < b.end && slotEnd > b.start)
    if (!clashes) slots.push(new Date(t).toISOString())
  }
  return slots
}

export async function createBooking(
  supabase: SupabaseClient,
  input: BookingInput,
  config: { googleCalendarId?: string; googleServiceAccountJson?: string } = {},
): Promise<{ ok: true; booking: Booking } | { ok: false; error: string; retryable?: boolean }> {
  const start = new Date(input.startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'startsAt is not a valid date/time', retryable: true }
  if (start.getTime() < Date.now()) return { ok: false, error: 'that time is in the past', retryable: true }

  const endsAt = new Date(start.getTime() + input.durationMinutes * 60_000).toISOString()

  // Conflict check — overlapping confirmed booking for the same business.
  const { data: clashes } = await supabase
    .from('bookings')
    .select('id')
    .eq('business_id', input.businessId)
    .eq('status', 'confirmed')
    .lt('starts_at', endsAt)
    .gt('ends_at', input.startsAt)

  if (clashes && clashes.length > 0) {
    return { ok: false, error: 'that slot is already taken', retryable: true }
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      business_id: input.businessId,
      service_name: input.serviceName,
      starts_at: input.startsAt,
      ends_at: endsAt,
      duration_minutes: input.durationMinutes,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      notes: input.notes ?? null,
      status: 'confirmed',
    })
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: 'could not save the booking' }

  let calendarEventId: string | null = null
  if (config.googleCalendarId && config.googleServiceAccountJson) {
    calendarEventId = await syncBookingToCalendar(config, {
      summary: `${input.serviceName} — ${input.customerName}`,
      description: input.notes ?? '',
      startIso: input.startsAt,
      endIso: endsAt,
    }).catch(() => null)
    if (calendarEventId) {
      await supabase.from('bookings').update({ calendar_event_id: calendarEventId }).eq('id', data.id)
    }
  }

  return { ok: true, booking: rowToBooking(data, calendarEventId) }
}

export async function cancelBooking(
  supabase: SupabaseClient,
  businessId: string,
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('business_id', businessId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

function rowToBooking(r: Record<string, unknown>, calendarEventId: string | null): Booking {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    serviceName: r.service_name as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    durationMinutes: r.duration_minutes as number,
    customerName: r.customer_name as string,
    customerPhone: (r.customer_phone as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: r.status as 'confirmed' | 'cancelled',
    calendarEventId: calendarEventId ?? ((r.calendar_event_id as string) ?? null),
    createdAt: r.created_at as string,
  }
}

function toDate(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm.length === 5 ? hhmm : '09:00'}:00Z`)
}
