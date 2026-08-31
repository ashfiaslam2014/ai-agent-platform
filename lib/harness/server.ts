import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embedding'
import { ensureSkillsRegistered, skillsForBusiness } from '@/lib/skills'
import { getActivePrompt } from '@/lib/intelligence/prompts'
import { getContactByHandle, recallFacts, factsBlock } from '@/lib/intelligence/memory'
import { runAgent } from './index'
import { createGroqLLM } from './llm'
import type { AgentInput, AgentOutput, RawInbound } from './types'
import type { SkillContext } from '@/lib/skills/types'

/**
 * Production wiring of the harness. Both /api/chat and the WhatsApp webhook
 * call this. Persistence of the user/assistant message rows stays in the route
 * (it owns the conversation lifecycle); this owns reasoning + the trace.
 */
export async function runAgentForBusiness(raw: RawInbound): Promise<AgentOutput> {
  ensureSkillsRegistered()
  const supabase = getSupabaseAdmin()
  const llm = createGroqLLM()

  const [{ skills, configByName }, basePrompt, memoryBlock] = await Promise.all([
    skillsForBusiness(supabase, raw.businessId),
    resolveSystemPrompt(supabase, raw.businessId),
    recallForContact(supabase, raw.businessId, raw.contact?.handle ?? null),
  ])
  const systemPrompt = basePrompt + memoryBlock

  const makeContext = (input: AgentInput): SkillContext => ({
    businessId: input.businessId,
    supabase,
    config: {},
    contact: input.contact,
    log: () => {},
  })

  // Per-skill config is looked up lazily so each skill sees only its own blob.
  const skillsWithConfig = skills.map((s) => ({
    ...s,
    run: (args: Record<string, unknown>, ctx: SkillContext) =>
      s.run(args, { ...ctx, config: configByName[s.name] ?? {} }),
  }))

  return runAgent(
    raw,
    {
      llm,
      skills: skillsWithConfig,
      retrieve: async ({ businessId, query }) => {
        try {
          const embedding = await generateEmbedding(query)
          const { data } = await supabase.rpc('match_documents', {
            query_embedding: `[${embedding.join(',')}]`,
            match_count: 3,
            match_business_id: businessId,
          })
          return ((data ?? []) as { content: string }[]).map((d) => ({ content: d.content }))
        } catch {
          return []
        }
      },
      persistTrace: async (trace) => {
        const { data } = await supabase
          .from('agent_traces')
          .insert({
            business_id: trace.businessId,
            conversation_id: trace.conversationId,
            channel: trace.channel,
            input: trace.input,
            final_output: trace.finalOutput,
            steps: trace.steps,
            used_skills: trace.usedSkills,
            duration_ms: trace.ms,
            degraded: trace.finalOutput.includes('get back to you'),
          })
          .select('id')
          .single()
        return data?.id ?? null
      },
      makeContext,
    },
    { systemPrompt },
  )
}

async function resolveSystemPrompt(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  businessId: string,
): Promise<string> {
  const active = await getActivePrompt(supabase, businessId)
  if (active) return active
  const { data } = await supabase.from('businesses').select('system_prompt').eq('id', businessId).single()
  return (data?.system_prompt as string) || 'You are a helpful customer service assistant.'
}

async function recallForContact(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  businessId: string,
  handle: string | null,
): Promise<string> {
  if (!handle) return ''
  try {
    const contactId = await getContactByHandle(supabase, businessId, handle)
    if (!contactId) return ''
    return factsBlock(await recallFacts(supabase, contactId))
  } catch {
    return ''
  }
}
