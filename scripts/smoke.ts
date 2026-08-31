/**
 * Harness smoke test — no network, no DB. Proves the reasoning ⇄ tool loop,
 * arg validation, guardrails, and trace assembly.
 *
 *   npx tsx scripts/smoke.ts
 */
import { runAgent } from '@/lib/harness'
import type { LLMClient, LLMResponse, RunAgentDeps } from '@/lib/harness/types'
import type { Skill, SkillContext } from '@/lib/skills/types'

let failures = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

const echoSkill: Skill = {
  name: 'get_business_hours',
  description: 'test',
  tier: 'answering',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['day'],
    properties: { day: { type: 'string', enum: ['monday', 'friday'] } },
  },
  async run(args) {
    return { ok: true, data: args, summary: `hours for ${args.day}` }
  },
}

/** Scripted LLM: first turn calls the tool, second turn answers. */
function scriptedLLM(toolArgs: string): LLMClient {
  let turn = 0
  return {
    async complete(): Promise<LLMResponse> {
      turn++
      if (turn === 1) {
        return {
          content: null,
          model: 'fake',
          toolCalls: [
            { id: 'c1', type: 'function', function: { name: 'get_business_hours', arguments: toolArgs } },
          ],
        }
      }
      return { content: 'We are open 9 to 5.', model: 'fake', toolCalls: [] }
    },
  }
}

function deps(llm: LLMClient): RunAgentDeps {
  return {
    llm,
    skills: [echoSkill],
    retrieve: async () => [{ content: 'Test business context.' }],
    makeContext: (): SkillContext => ({
      businessId: 'b1',
      // not used by echoSkill
      supabase: {} as never,
      config: {},
      contact: { channel: 'api', handle: null, name: null },
      log: () => {},
    }),
  }
}

async function main() {
  // 1. Happy path — valid tool args, tool runs, final answer returned.
  const ok = await runAgent(
    { channel: 'api', text: 'when do you open friday?', businessId: 'b1' },
    deps(scriptedLLM('{"day":"friday"}')),
  )
  check('final reply returned', ok.reply === 'We are open 9 to 5.')
  check('skill recorded as used', ok.usedSkills.includes('get_business_hours'))
  check('trace has a successful tool step', ok.trace.steps.some((s) => s.layer === 'tool' && s.ok))
  check('trace has retrieval step', ok.trace.steps.some((s) => s.layer === 'retrieval'))

  // 2. Bad args — enum violation must be caught by validation, not the skill.
  const bad = await runAgent(
    { channel: 'api', text: 'hours?', businessId: 'b1' },
    deps(scriptedLLM('{"day":"caturday"}')),
  )
  const toolStep = bad.trace.steps.find((s) => s.layer === 'tool')
  check('invalid enum arg rejected by validator', !!toolStep && toolStep.ok === false)
  check(
    'validation error surfaced',
    !!toolStep && toolStep.layer === 'tool' && (toolStep.detail.validationErrors?.length ?? 0) > 0,
  )
  check('still produced a reply after bad args', bad.reply.length > 0)

  // 3. Empty input short-circuits.
  const empty = await runAgent({ channel: 'api', text: '   ', businessId: 'b1' }, deps(scriptedLLM('{}')))
  check('empty input handled', empty.degraded === true && empty.reply.length > 0)

  console.log(`\n${failures === 0 ? 'all good' : failures + ' failing'}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
