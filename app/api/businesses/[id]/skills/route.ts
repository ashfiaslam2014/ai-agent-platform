import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureSkillsRegistered, allSkills } from '@/lib/skills'
import { requireBusinessAccess, writeAudit } from '@/lib/auth'

/** GET — every known skill, merged with this business's enable/config state. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  ensureSkillsRegistered()

  const { data: rows } = await getSupabaseAdmin()
    .from('business_skills')
    .select('skill_name, enabled, config')
    .eq('business_id', id)

  const state = new Map(
    ((rows ?? []) as { skill_name: string; enabled: boolean; config: unknown }[]).map((r) => [r.skill_name, r]),
  )
  const noRows = state.size === 0

  const skills = allSkills().map((s) => ({
    name: s.name,
    description: s.description,
    tier: s.tier,
    mutates: !!s.mutates,
    // Default when the business has no rows yet: read-only skills on, write skills off.
    enabled: state.has(s.name) ? state.get(s.name)!.enabled : noRows ? !s.mutates : false,
    config: state.get(s.name)?.config ?? {},
  }))

  return NextResponse.json({ skills })
}

/** PUT — upsert one skill's state. Body: { skill_name, enabled, config? } */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireBusinessAccess(req, id)
  if (!gate.ok) return gate.response

  const { skill_name, enabled, config } = await req.json()
  if (!skill_name) return NextResponse.json({ error: 'skill_name required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('business_skills')
    .upsert(
      {
        business_id: id,
        skill_name,
        enabled: enabled ?? true,
        config: config ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,skill_name' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await writeAudit({
    businessId: id,
    actor: gate.email,
    action: 'skill.toggle',
    target: skill_name,
    meta: { enabled: enabled ?? true },
  })
  return NextResponse.json({ ok: true })
}
