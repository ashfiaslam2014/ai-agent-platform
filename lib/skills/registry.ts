import type { Skill } from './types'
import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Process-wide registry. Skills are registered once at module load
 * (see ./index.ts) and never mutated afterwards.
 */
const _skills = new Map<string, Skill>()

export function registerSkill(skill: Skill): void {
  if (_skills.has(skill.name)) {
    throw new Error(`Skill "${skill.name}" is already registered`)
  }
  if (!/^[a-z][a-z0-9_]*$/.test(skill.name)) {
    throw new Error(`Skill name "${skill.name}" must be snake_case`)
  }
  _skills.set(skill.name, skill)
}

export function getSkill(name: string): Skill | undefined {
  return _skills.get(name)
}

export function allSkills(): Skill[] {
  return [..._skills.values()]
}

/**
 * Resolve the skills enabled for one business.
 *
 * A skill is active when a row exists in `business_skills` with enabled = true.
 * If the table has no rows for the business at all (fresh tenant), we fall back
 * to every non-mutating skill so a new business can still answer questions.
 */
export async function skillsForBusiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ skills: Skill[]; configByName: Record<string, Record<string, unknown>> }> {
  const { data, error } = await supabase
    .from('business_skills')
    .select('skill_name, enabled, config')
    .eq('business_id', businessId)

  if (error) {
    // Table missing / transient error — safe default is read-only skills.
    return {
      skills: allSkills().filter((s) => !s.mutates),
      configByName: {},
    }
  }

  const rows = (data ?? []) as { skill_name: string; enabled: boolean; config: Record<string, unknown> | null }[]

  if (rows.length === 0) {
    return {
      skills: allSkills().filter((s) => !s.mutates),
      configByName: {},
    }
  }

  const enabledNames = new Set(rows.filter((r) => r.enabled).map((r) => r.skill_name))
  const configByName: Record<string, Record<string, unknown>> = {}
  for (const r of rows) configByName[r.skill_name] = r.config ?? {}

  return {
    skills: allSkills().filter((s) => enabledNames.has(s.name)),
    configByName,
  }
}
