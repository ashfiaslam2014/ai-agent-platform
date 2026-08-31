import type { AgentInput, RawInbound } from './types'

const AR = /[؀-ۿݐ-ݿ]/

/** Cheap script-based locale guess. Good enough for prompt steering; not NLP. */
export function detectLocale(text: string): AgentInput['locale'] {
  const arCount = (text.match(new RegExp(AR, 'g')) ?? []).length
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length
  if (arCount === 0) return 'en'
  if (latinCount === 0) return 'ar'
  return arCount > latinCount * 0.25 ? 'mixed' : 'en'
}

/** Layer 1 — normalise any channel payload into the shape reasoning expects. */
export function normaliseInput(raw: RawInbound): AgentInput {
  const text = (raw.text ?? '').replace(/\s+/g, ' ').trim()
  return {
    channel: raw.channel,
    text,
    businessId: raw.businessId,
    conversationId: raw.conversationId ?? null,
    history: (raw.history ?? []).slice(-20),
    contact: {
      channel: raw.channel,
      handle: raw.contact?.handle ?? null,
      name: raw.contact?.name ?? null,
    },
    locale: detectLocale(text),
    meta: raw.meta ?? {},
  }
}
