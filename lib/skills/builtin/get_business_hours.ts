import type { Skill } from '../types'

type Hours = Record<string, { open: string; close: string } | 'closed'>

/**
 * Reads opening hours from businesses.hours (jsonb) — see migration 004.
 * Falls back to a friendly "not listed" so the model never fabricates times.
 */
export const getBusinessHours: Skill = {
  name: 'get_business_hours',
  description: "Get the business's opening hours, optionally for a specific day of the week.",
  tier: 'answering',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      day: {
        type: 'string',
        description: 'Day of week to check. Omit for the full week.',
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    },
  },
  async run(args, ctx) {
    const { data, error } = await ctx.supabase
      .from('businesses')
      .select('hours, timezone')
      .eq('id', ctx.businessId)
      .single()

    if (error) return { ok: false, error: 'could not load business hours' }

    const hours = (data?.hours ?? null) as Hours | null
    if (!hours || Object.keys(hours).length === 0) {
      return { ok: true, data: { hours: null }, summary: 'Opening hours are not listed for this business.' }
    }

    const day = args.day as string | undefined
    if (day) {
      const entry = hours[day]
      return {
        ok: true,
        data: { day, entry: entry ?? null, timezone: data?.timezone ?? null },
        summary: entry
          ? entry === 'closed'
            ? `Closed on ${day}.`
            : `${day}: ${entry.open}–${entry.close}`
          : `Hours for ${day} are not listed.`,
      }
    }

    const lines = Object.entries(hours).map(([d, e]) =>
      e === 'closed' ? `${d}: closed` : `${d}: ${e.open}–${e.close}`,
    )
    return { ok: true, data: { hours, timezone: data?.timezone ?? null }, summary: lines.join('; ') }
  },
}
