import type { Skill } from '../types'
import { chunkText } from '@/lib/chunking'
import { generateEmbedding } from '@/lib/embedding'
import { readDriveFileText } from '@/lib/google/drive'
import { resolveGoogleConfig } from '@/lib/google/config'

/**
 * Pull a Google Drive file (Doc, or a .txt/.md/.csv) into the knowledge base:
 * read → chunk → embed → insert into `documents`. Same pipeline as ingest_url.
 * Ops-tier. Needs businesses.google_workspace (serviceAccountJson).
 */
export const ingestDriveFileSkill: Skill = {
  name: 'ingest_drive_file',
  description: 'Read a Google Drive document and add its text to the business knowledge base.',
  tier: 'ops',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['file_id'],
    properties: {
      file_id: { type: 'string', description: 'Google Drive file id (from the share URL).' },
    },
  },
  async run(args, ctx) {
    const cfg = resolveGoogleConfig(ctx)
    if (!cfg.serviceAccountJson) {
      return { ok: false, error: 'Google Drive is not connected for this business' }
    }

    const file = await readDriveFileText(cfg.serviceAccountJson, String(args.file_id))
    if (!file) return { ok: false, error: 'could not read that Drive file' }
    if (file.text.trim().length < 50) {
      return { ok: false, error: 'that file has no readable text' }
    }

    const chunks = chunkText(file.text)
    let inserted = 0
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i])
        const { error } = await ctx.supabase.from('documents').insert({
          business_id: ctx.businessId,
          filename: file.name,
          chunk_index: i,
          content: chunks[i],
          embedding: `[${embedding.join(',')}]`,
          metadata: { source: 'ingest_drive_file', fileId: args.file_id, name: file.name },
        })
        if (!error) inserted++
      } catch {
        /* skip a chunk that failed to embed */
      }
    }

    ctx.log('knowledge.ingested', { source: 'drive', fileId: args.file_id, chunks: inserted })
    if (inserted === 0) return { ok: false, error: 'embedding failed for every chunk' }
    return {
      ok: true,
      data: { name: file.name, chunks: inserted },
      summary: `Added ${inserted} passages from "${file.name}" to the knowledge base.`,
    }
  },
}
