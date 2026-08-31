import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * A JSON Schema fragment describing a skill's parameters.
 * We deliberately support only the subset the reasoning model reliably
 * produces: object root, typed properties, `required`, `enum`, `items`.
 * See lib/harness/validate.ts for what is actually enforced.
 */
export type JSONSchema = {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
  description?: string
}

export type JSONSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: (string | number)[]
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  format?: string
}

/**
 * Everything a skill is allowed to touch. Skills never import the Supabase
 * client directly — they receive a business-scoped context so the harness
 * stays the single choke point for tenancy and logging.
 */
export type SkillContext = {
  businessId: string
  /** Service-role client. Skills are trusted server code; RLS is a backstop, not the gate. */
  supabase: SupabaseClient
  /** Per-business config blob from business_skills.config (skill decides its shape). */
  config: Record<string, unknown>
  /** End-user identity on the channel (WhatsApp number, widget session id, ...). */
  contact: { channel: string; handle: string | null; name: string | null }
  /** Structured logger — output lands in the agent trace. */
  log: (event: string, data?: Record<string, unknown>) => void
}

export type SkillResult =
  | { ok: true; data: unknown; /** short natural-language summary for the model */ summary?: string }
  | { ok: false; error: string; /** true = model may retry with different args */ retryable?: boolean }

export type Skill = {
  /** snake_case, stable, unique. This is the tool name the model calls. */
  name: string
  /** One sentence. The model reads this to decide when to call the skill. */
  description: string
  /** Which product tiers ship this skill by default. Informational only. */
  tier: 'answering' | 'action' | 'ops'
  parameters: JSONSchema
  /**
   * Side-effecting skills (booking, notifications, payments) set this.
   * The harness can require confirmation / dry-run for write skills later.
   */
  mutates?: boolean
  run: (args: Record<string, unknown>, ctx: SkillContext) => Promise<SkillResult>
}
