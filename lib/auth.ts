import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Gate for dashboard mutation routes. Validates the Supabase session bearer
 * token and confirms the user is a member of `user_businesses` for the target
 * business.
 *
 * Usage:
 *   const gate = await requireBusinessAccess(req, businessId)
 *   if (!gate.ok) return gate.response
 *   // gate.userId, gate.email available
 */
export async function requireBusinessAccess(
  req: Request,
  businessId: string,
): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse }
> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = getSupabaseAdmin()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: membership } = await supabase
    .from('user_businesses')
    .select('business_id')
    .eq('user_id', user.id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id, email: user.email ?? null }
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
