import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAnalytics } from '@/lib/intelligence/analytics'

/** GET ?business_id=&days= — dashboard rollups. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id')
  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? 30), 180)
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  try {
    const analytics = await getAnalytics(getSupabaseAdmin(), businessId, days)
    return NextResponse.json(analytics)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
