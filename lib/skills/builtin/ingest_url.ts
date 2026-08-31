import type { Skill } from '../types'
import { chunkText } from '@/lib/chunking'
import { generateEmbedding } from '@/lib/embedding'

/**
 * Pull a public web page into the knowledge base: fetch → strip to text →
 * chunk → embed → insert into `documents`. Feeds RAG (menus, price lists,
 * policy pages). Ops-tier — meant for the business owner, not end customers.
 */
export const ingestUrlSkill: Skill = {
  name: 'ingest_url',
  description: 'Read a public web page and add its content to the business knowledge base.',
  tier: 'ops',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['url'],
    properties: { url: { type: 'string', description: 'Full https URL of the page.' } },
  },
  async run(args, ctx) {
    const url = String(args.url)
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'url must start with http(s)://', retryable: true }

    let html: string
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ai-agent-platform/1.0' } })
      if (!res.ok) return { ok: false, error: `fetch failed (${res.status})` }
      html = await res.text()
    } catch {
      return { ok: false, error: 'could not reach that URL' }
    }

    const text = htmlToText(html)
    if (text.length < 50) return { ok: false, error: 'no readable text found on that page' }

    const chunks = chunkText(text)
    let inserted = 0
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i])
        const { error } = await ctx.supabase.from('documents').insert({
          business_id: ctx.businessId,
          filename: url,
          chunk_index: i,
          content: chunks[i],
          embedding: `[${embedding.join(',')}]`,
          metadata: { source: 'ingest_url', url },
        })
        if (!error) inserted++
      } catch {
        /* skip a chunk that failed to embed */
      }
    }

    ctx.log('knowledge.ingested', { url, chunks: inserted })
    if (inserted === 0) return { ok: false, error: 'embedding failed for every chunk' }
    return {
      ok: true,
      data: { url, chunks: inserted },
      summary: `Added ${inserted} passages from ${url} to the knowledge base.`,
    }
  },
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}
