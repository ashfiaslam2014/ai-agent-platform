import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Long-term memory keyed to a contact (not a conversation). Small key→value
 * facts the agent learns and should recall next time: "usual_order",
 * "allergy", "preferred_stylist", "company_name".
 */

export async function getContactByHandle(
  supabase: SupabaseClient,
  businessId: string,
  handle: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('business_id', businessId)
    .eq('phone', handle)
    .maybeSingle()
  return (data?.id as string) ?? null
}

export async function recallFacts(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{ key: string; value: string }[]> {
  const { data } = await supabase
    .from('contact_memory')
    .select('key, value')
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(20)
  return (data ?? []) as { key: string; value: string }[]
}

export async function rememberFact(
  supabase: SupabaseClient,
  businessId: string,
  contactId: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('contact_memory').upsert(
    { business_id: businessId, contact_id: contactId, key: key.slice(0, 60), value: value.slice(0, 500), updated_at: new Date().toISOString() },
    { onConflict: 'contact_id,key' },
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** One-line block for the system prompt. Empty string when nothing is known. */
export function factsBlock(facts: { key: string; value: string }[]): string {
  if (!facts.length) return ''
  return `\nWhat you know about this customer from past chats:\n${facts
    .map((f) => `- ${f.key}: ${f.value}`)
    .join('\n')}`
}
