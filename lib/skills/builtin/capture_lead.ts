import type { Skill } from '../types'
import { upsertContact, createLead } from '@/lib/actions/crm'

/**
 * Records an enquiry as a contact + lead so the business can follow up.
 * The model calls this once it has enough detail to be worth a callback.
 */
export const captureLeadSkill: Skill = {
  name: 'capture_lead',
  description:
    "Save a customer enquiry as a lead for the business to follow up (name, what they want, and a way to reach them).",
  tier: 'action',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['summary'],
    properties: {
      summary: { type: 'string', description: 'What the customer is asking for, one or two sentences.' },
      customer_name: { type: 'string' },
      customer_phone: { type: 'string' },
      customer_email: { type: 'string' },
      estimated_value_aed: { type: 'number', description: 'Rough job value in AED, if inferable.' },
    },
  },
  async run(args, ctx) {
    const phone = (args.customer_phone as string) ?? ctx.contact.handle ?? null
    const email = (args.customer_email as string) ?? null

    let contactId: string | null = null
    if (phone || email) {
      const c = await upsertContact(ctx.supabase, {
        businessId: ctx.businessId,
        name: (args.customer_name as string) ?? ctx.contact.name ?? null,
        phone,
        email,
        channel: ctx.contact.channel,
      })
      if (c.ok) contactId = c.contactId
    }

    const lead = await createLead(ctx.supabase, {
      businessId: ctx.businessId,
      contactId,
      summary: String(args.summary),
      valueAed: (args.estimated_value_aed as number) ?? null,
      source: ctx.contact.channel,
    })
    if (!lead.ok) return lead

    ctx.log('lead.captured', { leadId: lead.leadId })
    return {
      ok: true,
      data: { leadId: lead.leadId },
      summary: 'Enquiry saved. The team will follow up.',
    }
  },
}
