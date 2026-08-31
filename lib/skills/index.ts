import { registerSkill, allSkills } from './registry'
import { getBusinessHours } from './builtin/get_business_hours'
import { searchKnowledge } from './builtin/search_knowledge'
import { createBookingSkill } from './builtin/create_booking'
import { captureLeadSkill } from './builtin/capture_lead'
import { generateQuoteSkill } from './builtin/generate_quote'

let registered = false

/** Idempotent — safe to call from every request path. */
export function ensureSkillsRegistered(): void {
  if (registered) return
  ;[getBusinessHours, searchKnowledge, createBookingSkill, captureLeadSkill, generateQuoteSkill].forEach(
    registerSkill,
  )
  registered = true
}

export { allSkills, registerSkill }
export { getSkill, skillsForBusiness } from './registry'
export type { Skill, SkillContext, SkillResult } from './types'
