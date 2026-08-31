import type { Skill } from '../types'
import { generateEmbedding } from '@/lib/embedding'

/**
 * Explicit RAG-as-a-tool. The harness already injects top matches into the
 * system prompt, but exposing search as a skill lets the model deliberately
 * look something up mid-conversation ("let me check the menu again").
 */
export const searchKnowledge: Skill = {
  name: 'search_knowledge',
  description:
    "Search the business's documents (menu, price list, policies, FAQs) for information to answer a customer question.",
  tier: 'answering',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'What to look up, in the customer\'s own words.' },
      max_results: { type: 'integer', description: 'How many passages to return (1–5).' },
    },
  },
  async run(args, ctx) {
    const query = String(args.query)
    const k = Math.min(Math.max(Number(args.max_results ?? 3), 1), 5)

    let embedding: number[]
    try {
      embedding = await generateEmbedding(query)
    } catch {
      return { ok: false, error: 'search is temporarily unavailable', retryable: false }
    }

    const { data, error } = await ctx.supabase.rpc('match_documents', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: k,
      match_business_id: ctx.businessId,
    })

    if (error) return { ok: false, error: 'document search failed' }

    const passages = ((data ?? []) as { content: string }[]).map((d) => d.content)
    return {
      ok: true,
      data: { passages },
      summary: passages.length ? passages.join('\n---\n') : 'No matching information found in the business documents.',
    }
  },
}
