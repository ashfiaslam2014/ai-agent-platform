import type { Skill } from '../types'
import { getGeneratedDocument, renderPdf } from '@/lib/actions/documents'
import { uploadToDrive } from '@/lib/google/drive'
import { resolveGoogleConfig } from '@/lib/google/config'

/**
 * Push an already-generated quote/invoice/receipt into the business Google
 * Drive folder as a PDF (or HTML if PDF rendering is unavailable) and return
 * the Drive link. Pair with generate_quote.
 * Needs businesses.google_workspace (serviceAccountJson; driveFolderId optional).
 */
export const saveDocumentToDriveSkill: Skill = {
  name: 'save_document_to_drive',
  description:
    'Save a previously generated document (quote, invoice, receipt) to Google Drive and return the link.',
  tier: 'action',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['document_id'],
    properties: {
      document_id: { type: 'string', description: 'The id returned by generate_quote.' },
    },
  },
  async run(args, ctx) {
    const cfg = resolveGoogleConfig(ctx)
    if (!cfg.serviceAccountJson) {
      return { ok: false, error: 'Google Drive is not connected for this business' }
    }

    const doc = await getGeneratedDocument(ctx.supabase, String(args.document_id))
    if (!doc) return { ok: false, error: 'no document with that id', retryable: true }

    const pdf = await renderPdf(doc.html)
    const file = pdf
      ? { name: `${doc.type}-${doc.number}.pdf`, mimeType: 'application/pdf', data: pdf }
      : {
          name: `${doc.type}-${doc.number}.html`,
          mimeType: 'text/html',
          data: new TextEncoder().encode(doc.html),
        }

    const uploaded = await uploadToDrive(cfg.serviceAccountJson, {
      ...file,
      folderId: cfg.driveFolderId ?? null,
    })
    if (!uploaded) return { ok: false, error: 'upload to Google Drive failed' }

    ctx.log('drive.saved', { documentId: args.document_id, fileId: uploaded.id, pdf: !!pdf })
    return {
      ok: true,
      data: { fileId: uploaded.id, link: uploaded.webViewLink },
      summary: `Saved ${doc.type} ${doc.number} to Drive: ${uploaded.webViewLink ?? uploaded.id}`,
    }
  },
}
