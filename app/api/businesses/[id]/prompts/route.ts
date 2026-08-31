import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireBusinessAccess, writeAudit } from '@/lib/auth'
import {
  listPromptVersions,
  createPromptVersion,
  activatePromptVersion,
  getActivePrompt,
} from '@/lib/intelligence/prompts'

/** GET — version history + the active prompt text. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getSupabaseAdmin()
  const [versions, active] = await Promise.all([
    listPromptVersions(supabase, id),
    getActivePrompt(supabase, id),
  ])
  return NextResponse.json({ versions, active })
}

/** POST — save a new version. Body: { content, note?, activate? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireBusinessAccess(req, id)
  if (!gate.ok) return gate.response

  const { content, note, activate } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const result = await createPromptVersion(getSupabaseAdmin(), id, content, note ?? null, activate ?? true)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  await writeAudit({ businessId: id, actor: gate.email, action: 'prompt.new_version', target: `v${result.version}`, meta: { note: note ?? null } })
  return NextResponse.json(result)
}

/** PATCH — activate an existing version. Body: { version } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireBusinessAccess(req, id)
  if (!gate.ok) return gate.response

  const { version } = await req.json()
  const result = await activatePromptVersion(getSupabaseAdmin(), id, Number(version))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  await writeAudit({ businessId: id, actor: gate.email, action: 'prompt.activate', target: `v${version}` })
  return NextResponse.json({ ok: true })
}
