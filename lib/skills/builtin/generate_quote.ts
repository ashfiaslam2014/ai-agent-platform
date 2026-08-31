import type { Skill } from '../types'
import { generateDocument } from '@/lib/actions/documents'

/**
 * Produces a quote / invoice / receipt from line items and returns a link the
 * customer can open. Real dirham totals; no PDF unless DOCUMENT_PDF_ENDPOINT is set.
 */
export const generateQuoteSkill: Skill = {
  name: 'generate_quote',
  description:
    'Create a quote, invoice or receipt from a list of line items for a customer and return a shareable link.',
  tier: 'action',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'customer_name', 'items'],
    properties: {
      type: { type: 'string', enum: ['quote', 'invoice', 'receipt'] },
      customer_name: { type: 'string' },
      customer_contact: { type: 'string', description: 'Phone or email for the header.' },
      items: {
        type: 'array',
        description: 'Line items.',
        items: {
          type: 'object',
          required: ['description', 'quantity', 'unit_price'],
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'number', description: 'Price per unit in AED.' },
          },
        },
      },
      tax_rate_pct: { type: 'number', description: 'e.g. 5 for UAE VAT. Omit for none.' },
      notes: { type: 'string' },
    },
  },
  async run(args, ctx) {
    const items = (args.items as { description: string; quantity: number; unit_price: number }[]).map((it) => ({
      description: String(it.description),
      quantity: Number(it.quantity),
      unitPrice: Number(it.unit_price),
    }))

    const result = await generateDocument(ctx.supabase, {
      businessId: ctx.businessId,
      type: args.type as 'quote' | 'invoice' | 'receipt',
      customerName: String(args.customer_name),
      customerContact: (args.customer_contact as string) ?? ctx.contact.handle ?? null,
      items,
      taxRatePct: (args.tax_rate_pct as number) ?? undefined,
      notes: (args.notes as string) ?? null,
    })
    if (!result.ok) return result

    const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const link = `${base}/documents/${result.doc.id}`
    ctx.log('document.generated', { id: result.doc.id, type: result.doc.type })
    return {
      ok: true,
      data: { id: result.doc.id, number: result.doc.number, total: result.doc.total, link },
      summary: `${result.doc.type} ${result.doc.number} created — total AED ${result.doc.total}. Link: ${link}`,
    }
  },
}
