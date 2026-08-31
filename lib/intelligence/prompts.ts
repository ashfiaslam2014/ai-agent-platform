import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Versioned per-business system prompts. One version is active at a time
 * (enforced by a partial unique index). Editing creates a new version rather
 * than mutating — so a bad prompt change is one click to roll back.
 */

export async function getActivePrompt(
  supabase: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('prompt_versions')
    .select('content')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle()
  return (data?.content as string) ?? null
}

export async function listPromptVersions(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from('prompt_versions')
    .select('id, version, note, is_active, created_at')
    .eq('business_id', businessId)
    .order('version', { ascending: false })
  return data ?? []
}

export async function createPromptVersion(
  supabase: SupabaseClient,
  businessId: string,
  content: string,
  note: string | null,
  activate = true,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const { data: last } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('business_id', businessId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = ((last?.version as number) ?? 0) + 1

  if (activate) {
    await supabase.from('prompt_versions').update({ is_active: false }).eq('business_id', businessId).eq('is_active', true)
  }

  const { error } = await supabase.from('prompt_versions').insert({
    business_id: businessId,
    version,
    content,
    note,
    is_active: activate,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, version }
}

export async function activatePromptVersion(
  supabase: SupabaseClient,
  businessId: string,
  version: number,
): Promise<{ ok: boolean; error?: string }> {
  await supabase.from('prompt_versions').update({ is_active: false }).eq('business_id', businessId).eq('is_active', true)
  const { error } = await supabase
    .from('prompt_versions')
    .update({ is_active: true })
    .eq('business_id', businessId)
    .eq('version', version)
  return error ? { ok: false, error: error.message } : { ok: true }
}
