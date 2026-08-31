import type { Skill } from '../types'
import { getContactByHandle, rememberFact } from '@/lib/intelligence/memory'
import { upsertContact } from '@/lib/actions/crm'

/**
 * Lets the agent save a durable fact about the person it's talking to
 * ("usual order", "allergy: nuts", "company: Al Noor Trading"). Recalled
 * automatically on the next conversation — see lib/harness/server.ts.
 */
export const rememberFactSkill: Skill = {
  name: 'remember_fact',
  description:
    "Save a lasting fact about this customer to recall next time (e.g. their usual order, an allergy, their company). Use only for stable facts, not one-off requests.",
  tier: 'ops',
  mutates: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'value'],
    properties: {
      key: { type: 'string', description: 'Short label, snake_case, e.g. "usual_order".' },
      value: { type: 'string', description: 'The fact itself.' },
    },
  },
  async run(args, ctx) {
    const handle = ctx.contact.handle
    if (!handle) return { ok: false, error: 'no contact handle to attach the memory to' }

    let contactId = await getContactByHandle(ctx.supabase, ctx.businessId, handle)
    if (!contactId) {
      const c = await upsertContact(ctx.supabase, {
        businessId: ctx.businessId,
        name: ctx.contact.name,
        phone: handle,
        channel: ctx.contact.channel,
      })
      if (!c.ok) return { ok: false, error: 'could not create a contact record' }
      contactId = c.contactId
    }

    const res = await rememberFact(ctx.supabase, ctx.businessId, contactId, String(args.key), String(args.value))
    if (!res.ok) return { ok: false, error: res.error ?? 'could not save' }
    ctx.log('memory.remembered', { key: args.key })
    return { ok: true, data: { key: args.key }, summary: `Noted: ${args.key} = ${args.value}` }
  },
}
