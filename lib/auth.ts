import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

type Gate =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse }

/**
 * Validates the Supabase session bearer token. Use for routes that need a
 * signed-in user but have no single business to check membership against
 * (e.g. the businesses list).
 */
export async function requireUser(req: Request): Promise<Gate> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const {
    data: { user },
    error,
  } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { ok: true, userId: user.id, email: user.email ?? null }
}

/**
 * Gate for dashboard mutation routes. `requireUser` plus a check that the user
 * is a member of `user_businesses` for the target business.
 *
 * Usage:
 *   const gate = await requireBusinessAccess(req, businessId)
 *   if (!gate.ok) return gate.response
 *   // gate.userId, gate.email available
 */
export async function requireBusinessAccess(req: Request, businessId: string): Promise<Gate> {
  const gate = await requireUser(req)
  if (!gate.ok) return gate

  const { data: membership } = await getSupabaseAdmin()
    .from('user_businesses')
    .select('business_id')
    .eq('user_id', gate.userId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return gate
}

/** Best-effort audit trail for dashboard mutations. Never throws. */
export async function writeAudit(entry: {
  businessId: string | null
  actor: string | null
  action: string
  target?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('audit_log')
      .insert({
        business_id: entry.businessId,
        actor: entry.actor,
        action: entry.action,
        target: entry.target ?? null,
        meta: entry.meta ?? {},
      })
  } catch {
    /* audit is not allowed to break the request */
  }
}
