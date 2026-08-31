import type { Skill } from '@/lib/skills/types'

/** Raw message arriving from any channel, before normalisation (Layer 1). */
export type RawInbound = {
  channel: 'whatsapp' | 'web' | 'api' | 'voice'
  text: string
  businessId: string
  conversationId?: string | null
  /** Prior turns, oldest first. */
  history?: { role: 'user' | 'assistant'; content: string }[]
  contact?: { handle?: string | null; name?: string | null }
  /** Channel-specific extras (media ids, widget metadata). */
  meta?: Record<string, unknown>
}

/** Normalised input the reasoning layer consumes. */
export type AgentInput = {
  channel: RawInbound['channel']
  text: string
  businessId: string
  conversationId: string | null
  history: { role: 'user' | 'assistant'; content: string }[]
  contact: { channel: string; handle: string | null; name: string | null }
  locale: 'ar' | 'en' | 'mixed'
  meta: Record<string, unknown>
}

export type TraceStep =
  | { layer: 'input'; ok: boolean; detail: Record<string, unknown> }
  | { layer: 'retrieval'; ok: boolean; detail: { query: string; hits: number; ms: number } }
  | {
      layer: 'reasoning'
      ok: boolean
      detail: { model: string; toolCalls: { name: string; args: unknown }[]; text: string | null; ms: number; promptTokens?: number; completionTokens?: number }
    }
  | {
      layer: 'tool'
      ok: boolean
      detail: { name: string; args: unknown; result: unknown; ms: number; error?: string; validationErrors?: string[] }
    }
  | { layer: 'output'; ok: boolean; detail: { reply: string; usedSkills: string[] } }
  | { layer: 'error'; ok: false; detail: { message: string; where: string } }

export type AgentTrace = {
  input: string
  channel: string
  businessId: string
  conversationId: string | null
  steps: TraceStep[]
  usedSkills: string[]
  finalOutput: string
  startedAt: string
  ms: number
}

/** Structured contract every channel receives (Layer 4). */
export type AgentOutput = {
  reply: string
  usedSkills: string[]
  conversationId: string | null
  trace: AgentTrace
  /** Set when the agent could not produce a real answer. */
  degraded?: boolean
}

/** ---- LLM abstraction so the harness is testable without a network call ---- */

export type LLMTool = {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

export type LLMMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: LLMToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

export type LLMToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type LLMResponse = {
  content: string | null
  toolCalls: LLMToolCall[]
  model: string
  promptTokens?: number
  completionTokens?: number
}

export type LLMClient = {
  complete: (args: { messages: LLMMessage[]; tools: LLMTool[]; model?: string }) => Promise<LLMResponse>
}

export type Retriever = (args: { businessId: string; query: string }) => Promise<{ content: string }[]>

export type RunAgentDeps = {
  llm: LLMClient
  retrieve: Retriever
  skills: Skill[]
  /** persistence hook; returns the stored trace id or null */
  persistTrace?: (trace: AgentTrace) => Promise<string | null>
  makeContext: (input: AgentInput) => import('@/lib/skills/types').SkillContext
}

export type HarnessConfig = {
  model: string
  systemPrompt: string
  maxToolCalls: number
  toolTimeoutMs: number
}
