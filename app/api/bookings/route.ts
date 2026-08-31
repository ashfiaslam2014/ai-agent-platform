import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireBusinessAccess, writeAudit } from '@/lib/auth'
import { cancelBooking } from '@/lib/actions/booking'

/** GET ?business_id=&when=upcoming|all — bookings for a business. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id')
  const when = req.nextUrl.searchParams.get('when') ?? 'upcoming'
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  let q = getSupabaseAdmin()
    .from('bookings')
    .select('id, service_name, starts_at, ends_at, customer_name, customer_phone, status, notes, created_at')
    .eq('business_id', businessId)
    .order('starts_at', { ascending: true })
    .limit(200)

  if (when === 'upcoming') q = q.gte('starts_at', new Date().toISOString())

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookings: data ?? [] })
}

/** PATCH — cancel a booking. Body: { business_id, booking_id } */
export async function PATCH(req: NextRequest) {
  const { business_id, booking_id } = await req.json()
  if (!business_id || !booking_id) {
    return NextResponse.json({ error: 'business_id and booking_id required' }, { status: 400 })
  }
  const gate = await requireBusinessAccess(req, business_id)
  if (!gate.ok) return gate.response

  const result = await cancelBooking(getSupabaseAdmin(), business_id, booking_id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  await writeAudit({ businessId: business_id, actor: gate.email, action: 'booking.cancel', target: booking_id })
  return NextResponse.json({ ok: true })
}
