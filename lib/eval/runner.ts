import { runAgent } from '@/lib/harness'
import type { RunAgentDeps } from '@/lib/harness/types'

/**
 * Tiny eval harness. A case sends one message through the agent and asserts on
 * the reply text and which skills fired. Run it after a prompt or model change
 * to see what moved. Not a benchmark suite — a regression trip-wire.
 */

export type EvalCase = {
  name: string
  message: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  expect: {
    usesSkill?: string
    noSkill?: boolean
    replyIncludes?: string[]
    replyExcludes?: string[]
  }
}

export type CaseResult = {
  name: string
  passed: boolean
  reply: string
  usedSkills: string[]
  failures: string[]
  ms: number
}

export type Scorecard = {
  total: number
  passed: number
  passRate: number
  results: CaseResult[]
}

/** Assert one case against an agent output. Shared by runEval and scripts/eval.ts. */
export function scoreCase(
  c: EvalCase,
  out: { reply: string; usedSkills: string[]; ms: number },
): CaseResult {
  const failures: string[] = []

  if (c.expect.usesSkill && !out.usedSkills.includes(c.expect.usesSkill)) {
    failures.push(`expected skill "${c.expect.usesSkill}", got [${out.usedSkills.join(', ') || 'none'}]`)
  }
  if (c.expect.noSkill && out.usedSkills.length > 0) {
    failures.push(`expected no skill, got [${out.usedSkills.join(', ')}]`)
  }
  for (const s of c.expect.replyIncludes ?? []) {
    if (!out.reply.toLowerCase().includes(s.toLowerCase())) failures.push(`reply missing "${s}"`)
  }
  for (const s of c.expect.replyExcludes ?? []) {
    if (out.reply.toLowerCase().includes(s.toLowerCase())) failures.push(`reply should not contain "${s}"`)
  }

  return { name: c.name, passed: failures.length === 0, reply: out.reply, usedSkills: out.usedSkills, failures, ms: out.ms }
}

export function tally(results: CaseResult[]): Scorecard {
  const passed = results.filter((r) => r.passed).length
  return { total: results.length, passed, passRate: results.length ? passed / results.length : 0, results }
}

/** In-process eval with injected deps — for unit tests, no network. */
export async function runEval(
  cases: EvalCase[],
  deps: RunAgentDeps,
  businessId: string,
): Promise<Scorecard> {
  const results: CaseResult[] = []
  for (const c of cases) {
    const out = await runAgent(
      { channel: 'api', text: c.message, businessId, history: c.history ?? [] },
      deps,
    )
    results.push(scoreCase(c, { reply: out.reply, usedSkills: out.usedSkills, ms: out.trace.ms }))
  }
  return tally(results)
}
