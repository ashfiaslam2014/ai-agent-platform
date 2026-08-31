import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendNotification } from '@/lib/actions/notifications'

/**
 * Sends a WhatsApp reminder for confirmed bookings starting in the next
 * ~12–36h that haven't been reminded yet.
 *
 * Trigger: Vercel Cron (GET). Runs daily — see vercel.json.
 * Auth: Vercel sets `x-vercel-cron: 1` on scheduled calls; a manual call must
 * pass `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const auth = req.headers.get('authorization')
  const okSecret = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isVercelCron && !okSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = Date.now()
  const from = new Date(now + 12 * 3600_000).toISOString()
  const to = new Date(now + 36 * 3600_000).toISOString()

  const { data: due } = await supabase
    .from('bookings')
    .select('id, business_id, service_name, starts_at, customer_name, customer_phone')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .not('customer_phone', 'is', null)
    .limit(200)

  let sent = 0
  for (const b of (due ?? []) as {
    id: string
    business_id: string
    service_name: string
    starts_at: string
    customer_name: string
    customer_phone: string
  }[]) {
    const when = new Date(b.starts_at).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })
    const res = await sendNotification(supabase, {
      businessId: b.business_id,
      channel: 'whatsapp',
      to: b.customer_phone,
      kind: 'booking_reminder',
      body: `Reminder: your ${b.service_name} booking is on ${when}. Reply here to change or cancel.`,
    })
    if (res.ok) {
      await supabase.from('bookings').update({ reminder_sent: true }).eq('id', b.id)
      sent++
    }
  }

  return NextResponse.json({ checked: due?.length ?? 0, sent })
}
