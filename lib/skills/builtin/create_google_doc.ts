import type { Skill } from '../types'
import { createGoogleDoc } from '@/lib/google/docs'
import { resolveGoogleConfig } from '@/lib/google/config'

/**
 * Create a Google Doc from plain text — proposals, meeting notes, call
 * summaries. Ops-tier: meant for the business owner, not end customers.
 * Needs businesses.google_workspace (serviceAccountJson; driveFolderId optional).
 */
export const createGoogleDocSkill: Skill = {
  name: 'create_google_doc',
  description: 'Create a Google Doc with a title and body text and return a link to it.',
  tier: 'ops',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'body'],
    properties: {
      title: { type: 'string', description: 'Document title.' },
      body: { type: 'string', description: 'Full document text. Newlines are kept.' },
    },
  },
  async run(args, ctx) {
    const cfg = resolveGoogleConfig(ctx)
    if (!cfg.serviceAccountJson) {
      return { ok: false, error: 'Google Workspace is not connected for this business' }
    }

    const doc = await createGoogleDoc(cfg.serviceAccountJson, {
      title: String(args.title),
      body: String(args.body),
      folderId: cfg.driveFolderId ?? null,
    })
    if (!doc) return { ok: false, error: 'could not create the Google Doc' }

    ctx.log('gdoc.created', { id: doc.id })
    return { ok: true, data: { url: doc.url }, summary: `Created Google Doc: ${doc.url}` }
  },
}
