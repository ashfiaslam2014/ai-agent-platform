import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Read-only rollups for the client-facing dashboard. Pure aggregate queries
 * over existing tables — no new storage. `sinceDays` bounds every metric.
 */

export type Analytics = {
  sinceDays: number
  conversations: number
  messages: number
  agentReplies: number
  skillRuns: number
  skillBreakdown: { skill: string; count: number }[]
  avgResponseMs: number | null
  degradedRate: number | null
  dailyVolume: { day: string; conversations: number }[]
}

export async function getAnalytics(
  supabase: SupabaseClient,
  businessId: string,
  sinceDays = 30,
): Promise<Analytics> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const [{ count: conversations }, { count: agentReplies }, tracesRes, dailyRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', since),
    supabase
      .from('messages')
      .select('id, conversations!inner(business_id)', { count: 'exact', head: true })
      .eq('role', 'assistant')
      .eq('conversations.business_id', businessId)
      .gte('created_at', since),
    supabase
      .from('agent_traces')
      .select('used_skills, duration_ms, degraded')
      .eq('business_id', businessId)
      .gte('created_at', since),
    supabase.rpc('daily_conversation_volume', { b: businessId, since_days: sinceDays }),
  ])

  const traces = (tracesRes.data ?? []) as { used_skills: string[]; duration_ms: number | null; degraded: boolean }[]

  const skillCounts = new Map<string, number>()
  let msSum = 0
  let msN = 0
  let degraded = 0
  for (const t of traces) {
    for (const s of t.used_skills ?? []) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1)
    if (typeof t.duration_ms === 'number') {
      msSum += t.duration_ms
      msN++
    }
    if (t.degraded) degraded++
  }

  return {
    sinceDays,
    conversations: conversations ?? 0,
    messages: 0,
    agentReplies: agentReplies ?? 0,
    skillRuns: [...skillCounts.values()].reduce((a, b) => a + b, 0),
    skillBreakdown: [...skillCounts.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count),
    avgResponseMs: msN ? Math.round(msSum / msN) : null,
    degradedRate: traces.length ? +(degraded / traces.length).toFixed(3) : null,
    dailyVolume: ((dailyRes.data ?? []) as { day: string; conversations: number }[]) ?? [],
  }
}
