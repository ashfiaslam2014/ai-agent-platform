import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Lightweight CRM: upsert a contact by phone, attach leads, move them along a
 * fixed pipeline. The dashboard is the client's CRM view; the agent feeds it.
 */

export type ContactInput = {
  businessId: string
  name?: string | null
  phone?: string | null
  email?: string | null
  channel?: string | null
  notes?: string | null
}

export async function upsertContact(
  supabase: SupabaseClient,
  input: ContactInput,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  if (!input.phone && !input.email) return { ok: false, error: 'a phone or email is required' }

  if (input.phone) {
    const { data, error } = await supabase
      .from('contacts')
      .upsert(
        {
          business_id: input.businessId,
          name: input.name ?? null,
          phone: input.phone,
          email: input.email ?? null,
          channel: input.channel ?? null,
          notes: input.notes ?? null,
        },
        { onConflict: 'business_id,phone' },
      )
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: 'could not save contact' }
    return { ok: true, contactId: data.id as string }
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      business_id: input.businessId,
      name: input.name ?? null,
      email: input.email,
      channel: input.channel ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'could not save contact' }
  return { ok: true, contactId: data.id as string }
}

export type LeadInput = {
  businessId: string
  contactId?: string | null
  summary: string
  valueAed?: number | null
  source?: string | null
}

export async function createLead(
  supabase: SupabaseClient,
  input: LeadInput,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('leads')
    .insert({
      business_id: input.businessId,
      contact_id: input.contactId ?? null,
      summary: input.summary,
      value_aed: input.valueAed ?? null,
      source: input.source ?? null,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'could not create lead' }
  return { ok: true, leadId: data.id as string }
}

export const LEAD_STAGES = ['new', 'qualified', 'quoted', 'won', 'lost'] as const

export async function moveLead(
  supabase: SupabaseClient,
  businessId: string,
  leadId: string,
  stage: (typeof LEAD_STAGES)[number],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('business_id', businessId)
  return error ? { ok: false, error: error.message } : { ok: true }
}
