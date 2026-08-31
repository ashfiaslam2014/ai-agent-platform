import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/** GET ?business_id=&limit= — recent agent decision traces. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 30), 100)
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('agent_traces')
    .select('id, channel, input, final_output, steps, used_skills, duration_ms, degraded, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ traces: data ?? [] })
}
