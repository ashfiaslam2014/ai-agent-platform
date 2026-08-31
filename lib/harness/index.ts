import type { Skill } from '@/lib/skills/types'
import { normaliseInput } from './input'
import { TraceBuilder } from './trace'
import { validateArgs } from './validate'
import type {
  AgentInput,
  AgentOutput,
  HarnessConfig,
  LLMMessage,
  LLMTool,
  RawInbound,
  RunAgentDeps,
} from './types'

export const DEFAULT_CONFIG: HarnessConfig = {
  model: process.env.GROQ_MODEL_NAME ?? 'llama-3.3-70b-versatile',
  systemPrompt: 'You are a helpful customer service assistant.',
  maxToolCalls: 5,
  toolTimeoutMs: 12_000,
}

/**
 * The harness. input → retrieval → reasoning ⇄ tools → output, every stage
 * recorded in a trace.
 *
 * Deps are injected so this runs in a unit test with a fake LLM and no DB.
 * See app/api/chat for the production wiring.
 */
export async function runAgent(
  raw: RawInbound,
  deps: RunAgentDeps,
  configOverride: Partial<HarnessConfig> = {},
): Promise<AgentOutput> {
  const config = { ...DEFAULT_CONFIG, ...configOverride }
  const input = normaliseInput(raw)
  const trace = new TraceBuilder(input)

  trace.add({
    layer: 'input',
    ok: true,
    detail: { channel: input.channel, locale: input.locale, chars: input.text.length, historyTurns: input.history.length },
  })

  if (!input.text) {
    const reply = "Sorry, I didn't catch that — could you send that again as text?"
    trace.add({ layer: 'output', ok: false, detail: { reply, usedSkills: [] } })
    return finalize(reply, input, trace, deps, true)
  }

  // ---- Layer 2a: retrieval (RAG stays a fixed pre-step for now) ----
  let contextBlock = ''
  await trace.stage('retrieval', async () => {
    const t0 = Date.now()
    const hits = await deps.retrieve({ businessId: input.businessId, query: input.text })
    contextBlock = hits.map((h) => `---\n${h.content}`).join('\n')
    trace.add({ layer: 'retrieval', ok: true, detail: { query: input.text, hits: hits.length, ms: Date.now() - t0 } })
  })

  // ---- Layer 2b + Layer 3: reasoning ⇄ tool loop ----
  const tools = deps.skills.map(toLLMTool)
  const ctx = deps.makeContext(input)

  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(config.systemPrompt, contextBlock, input) },
    ...input.history.map((h) => ({ role: h.role, content: h.content }) as LLMMessage),
    { role: 'user', content: input.text },
  ]

  let finalText: string | null = null
  let toolCallCount = 0

  for (let turn = 0; turn < config.maxToolCalls + 1; turn++) {
    const t0 = Date.now()
    const res = await deps.llm.complete({ messages, tools, model: config.model }).catch((err: Error) => {
      trace.add({ layer: 'error', ok: false, detail: { message: err.message, where: 'reasoning' } })
      return null
    })
    if (!res) break

    trace.add({
      layer: 'reasoning',
      ok: true,
      detail: {
        model: res.model,
        toolCalls: res.toolCalls.map((tc) => ({ name: tc.function.name, args: safeParse(tc.function.arguments) })),
        text: res.content,
        ms: Date.now() - t0,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
      },
    })

    if (res.toolCalls.length === 0) {
      finalText = res.content
      break
    }

    // Record the assistant tool-call turn verbatim so the model keeps context.
    messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })

    for (const call of res.toolCalls) {
      if (toolCallCount >= config.maxToolCalls) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, error: 'tool call budget exhausted' }) })
        continue
      }
      toolCallCount++
      const outcome = await executeTool(call, deps.skills, ctx, config, trace)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) })
    }
  }

  if (finalText == null) {
    finalText =
      'Thanks for your message. I need to check on that and will get back to you shortly.'
    trace.add({ layer: 'error', ok: false, detail: { message: 'no final text produced', where: 'reasoning-loop' } })
  }

  trace.add({ layer: 'output', ok: true, detail: { reply: finalText, usedSkills: trace.usedSkills } })
  return finalize(finalText, input, trace, deps, finalText.includes('get back to you'))
}

async function executeTool(
  call: { id: string; function: { name: string; arguments: string } },
  skills: Skill[],
  ctx: import('@/lib/skills/types').SkillContext,
  config: HarnessConfig,
  trace: TraceBuilder,
): Promise<import('@/lib/skills/types').SkillResult> {
  const t0 = Date.now()
  const skill = skills.find((s) => s.name === call.function.name)
  if (!skill) {
    const result = { ok: false as const, error: `unknown skill "${call.function.name}"` }
    trace.add({ layer: 'tool', ok: false, detail: { name: call.function.name, args: null, result, ms: 0, error: result.error } })
    return result
  }

  const parsed = safeParse(call.function.arguments)
  const check = validateArgs(skill.parameters, parsed)
  if (!check.valid) {
    const result = { ok: false as const, error: `invalid arguments: ${check.errors.join('; ')}`, retryable: true }
    trace.add({
      layer: 'tool',
      ok: false,
      detail: { name: skill.name, args: parsed, result, ms: Date.now() - t0, validationErrors: check.errors },
    })
    return result
  }

  try {
    const result = await withTimeout(skill.run(check.value, ctx), config.toolTimeoutMs)
    trace.add({
      layer: 'tool',
      ok: result.ok,
      detail: { name: skill.name, args: check.value, result, ms: Date.now() - t0, error: result.ok ? undefined : result.error },
    })
    return result
  } catch (err) {
    const result = { ok: false as const, error: (err as Error).message }
    trace.add({
      layer: 'tool',
      ok: false,
      detail: { name: skill.name, args: check.value, result, ms: Date.now() - t0, error: result.error },
    })
    return result
  }
}

async function finalize(
  reply: string,
  input: AgentInput,
  trace: TraceBuilder,
  deps: RunAgentDeps,
  degraded: boolean,
): Promise<AgentOutput> {
  const built = trace.finish(reply)
  try {
    await deps.persistTrace?.(built)
  } catch {
    /* trace persistence is best-effort */
  }
  return { reply, usedSkills: built.usedSkills, conversationId: input.conversationId, trace: built, degraded }
}

function toLLMTool(skill: Skill): LLMTool {
  return {
    type: 'function',
    function: { name: skill.name, description: skill.description, parameters: skill.parameters },
  }
}

function buildSystemPrompt(base: string, context: string, input: AgentInput): string {
  const parts = [base]
  if (context) {
    parts.push(
      `\nUse the following business information to answer. If it does not cover the question, say you'll check and follow up — do not invent details.\n${context}\n---`,
    )
  }
  parts.push(
    '\nRules: call a tool when the user wants an action (booking, quote, checking a fact you can look up). ' +
      'Never claim an action succeeded unless a tool result confirms it. Keep replies short and friendly.',
  )
  if (input.locale === 'ar' || input.locale === 'mixed') {
    parts.push('\nThe customer is writing in Arabic or mixed Arabic-English. Reply in the same language they used.')
  }
  return parts.join('\n')
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`skill timed out after ${ms}ms`)), ms)),
  ])
}
