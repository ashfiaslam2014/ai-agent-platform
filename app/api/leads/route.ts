import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireBusinessAccess, writeAudit } from '@/lib/auth'
import { moveLead, LEAD_STAGES } from '@/lib/actions/crm'

/** GET ?business_id= — leads with their contact, newest first. */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .select('id, summary, stage, value_aed, source, created_at, contacts(name, phone, email)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [] })
}

/** PATCH — move a lead's stage. Body: { business_id, lead_id, stage } */
export async function PATCH(req: NextRequest) {
  const { business_id, lead_id, stage } = await req.json()
  if (!business_id || !lead_id || !LEAD_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'business_id, lead_id and a valid stage are required' }, { status: 400 })
  }
  const gate = await requireBusinessAccess(req, business_id)
  if (!gate.ok) return gate.response

  const result = await moveLead(getSupabaseAdmin(), business_id, lead_id, stage)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  await writeAudit({ businessId: business_id, actor: gate.email, action: 'lead.move', target: lead_id, meta: { stage } })
  return NextResponse.json({ ok: true })
}
