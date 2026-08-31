/**
 * Run the eval dataset against a real business through the live harness.
 *
 *   npx tsx scripts/eval.ts <businessId> [path/to/dataset.json]
 *
 * Needs the same env as the app (GROQ_API_KEY, GEMINI_API_KEY, SUPABASE_*).
 * Load it however you normally do, e.g.  `set -a && source .env.local && set +a`.
 */
import { readFileSync } from 'node:fs'
import { runAgentForBusiness } from '@/lib/harness/server'
import { scoreCase, tally, type EvalCase } from '@/lib/eval/runner'

async function main() {
  const businessId = process.argv[2]
  const datasetPath = process.argv[3] ?? 'eval/dataset.example.json'
  if (!businessId) {
    console.error('usage: npx tsx scripts/eval.ts <businessId> [dataset.json]')
    process.exit(1)
  }

  const cases = JSON.parse(readFileSync(datasetPath, 'utf8')) as EvalCase[]
  const results = []

  for (const c of cases) {
    const out = await runAgentForBusiness({
      channel: 'api',
      text: c.message,
      businessId,
      history: c.history ?? [],
    })
    const r = scoreCase(c, { reply: out.reply, usedSkills: out.usedSkills, ms: out.trace.ms })
    results.push(r)
    const mark = r.passed ? 'PASS' : 'FAIL'
    console.log(`${mark}  ${r.name}  (${r.ms}ms)`)
    if (!r.passed) r.failures.forEach((f) => console.log(`      - ${f}`))
    console.log(`      reply: ${r.reply.slice(0, 120)}`)
  }

  const card = tally(results)
  console.log(`\n${card.passed}/${card.total} passed  (${Math.round(card.passRate * 100)}%)`)
  process.exit(card.passed === card.total ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
