# Run-through — how it all works, and where to tweak it

Read this once. It follows a single WhatsApp message through the whole system,
then lists every "knob" — the file to open when you want to change a behaviour.

---

## 1. The lifecycle of one message

```
Customer sends WhatsApp message
        │
        ▼
app/api/whatsapp/webhook/route.ts   POST
  • messageToText(): text passes through; image → Gemini vision describes it;
    voice note → Groq Whisper transcribes it. Harness only ever sees text.
  • resolveBusinessId(): match change.metadata.phone_number_id → businesses row
    (fallbacks: ACTIVE_BUSINESS_ID env, then is_default business)
  • getOrCreateConversation(): reuse this contact's conversation if <24h old
  • save the inbound message row
        │
        ▼
lib/harness/server.ts   runAgentForBusiness()
  • load enabled skills for the business (business_skills table)
  • resolve system prompt: active prompt_versions row, else businesses.system_prompt
  • recall long-term facts about this contact (contact_memory) → appended to prompt
        │
        ▼
lib/harness/index.ts   runAgent()   ← the 5 layers
  1. input.ts        normalise text, detect en/ar/mixed
  2. retrieval       embed the message (Gemini), match_documents() → top 3 passages
                     injected into the system prompt
  3. reasoning loop  Groq llama-3.3-70b with the enabled skills as tools:
       • model returns tool call(s)
       • validate.ts checks the args against the skill's JSON Schema
       • skill.run() executes (timeout + per-turn call budget)
       • result goes back to the model → it answers or calls another tool
  4. output          { reply, usedSkills, conversationId, trace }
  5. trace.ts        every step recorded → agent_traces row (persistTrace)
        │
        ▼
webhook saves the assistant message row, sends the reply via Meta Graph API
        │
        ▼
you watch it in /dashboard/traces
```

`/api/chat` (dashboard tester) and `/api/public/chat` (web widget) do the same
thing — they all call `runAgentForBusiness()`. That's the whole point: one brain,
many doors.

---

## 2. The knobs — what to open when you want to change X

### Make the agent behave differently
| Want to… | Open |
|---|---|
| Change the agent's personality / rules for a business | `/dashboard/prompts` (versioned, rollback-able). Fallback text: `businesses.system_prompt` |
| Change the *global* rules baked into every prompt (e.g. "never invent prices") | `lib/harness/index.ts` → `buildSystemPrompt()` |
| Make it call tools more/less eagerly | tighten each skill's `description`, or edit `buildSystemPrompt()`'s "Rules:" line |
| Change how many tool calls one message may make | `lib/harness/index.ts` → `DEFAULT_CONFIG.maxToolCalls` (default 5) |
| Change the per-skill timeout | `DEFAULT_CONFIG.toolTimeoutMs` (default 12s) |
| Change the model | env `GROQ_MODEL_NAME`; fallback model in `lib/harness/llm.ts` (`geminiFallback`, currently `gemini-2.0-flash`) |
| Change temperature | `lib/harness/llm.ts` → `temperature: 0.3` (two places) |
| Change how many RAG passages are injected | `lib/harness/server.ts` → `match_count: 3` |

### Add or change a skill
1. New file in `lib/skills/builtin/<name>.ts` exporting a `Skill`
   (`name`, `description`, `tier`, `parameters` JSON Schema, `mutates?`, `run`).
2. Register it in `lib/skills/index.ts` (`ensureSkillsRegistered`).
3. It shows up automatically on `/dashboard/skills` for enable/disable + config.
4. Its `run(args, ctx)` gets `ctx.businessId`, `ctx.supabase`, `ctx.config`
   (the per-business JSON blob from that page), `ctx.contact`, `ctx.log`.
5. Return `{ ok: true, data, summary }` or `{ ok: false, error, retryable? }`.
   `summary` is what the model reads back — keep it short and factual.

Current skills: `get_business_hours`, `search_knowledge`, `create_booking`,
`cancel_booking`, `capture_lead`, `generate_quote`, `remember_fact`, `ingest_url`.

### Change a business action
| Action | File |
|---|---|
| Booking slot logic / conflict rules | `lib/actions/booking.ts` |
| Google Calendar sync | `lib/actions/calendar.ts` (config on the `create_booking` skill) |
| Notification wording / channels | `lib/actions/notifications.ts` |
| Invoice / quote layout | `lib/actions/documents.ts` → `renderHtml()` |
| PDF rendering | set `DOCUMENT_PDF_ENDPOINT`; logic in `documents.ts` → `renderPdf()` |
| CRM pipeline stages | `lib/actions/crm.ts` → `LEAD_STAGES` (also the DB check constraint) |
| Booking reminder timing / text | `app/api/cron/booking-reminders/route.ts` (12–36h window); schedule in `vercel.json` |

### Channels
| Channel | Entry point |
|---|---|
| WhatsApp | `app/api/whatsapp/webhook/route.ts` |
| Web widget | `public/widget.js` (the embed snippet) + `app/embed/[publicKey]/page.tsx` (UI) + `app/api/public/chat/route.ts` (backend, rate limit here) |
| Dashboard tester | `app/chat/page.tsx` + `app/api/chat/route.ts` |
| MCP (other agents call your skills) | `app/api/mcp/route.ts` — `Authorization: Bearer <API_SECRET_KEY>`, `X-Business-Id: <id>` |

### Memory & intelligence
| Want to… | Open |
|---|---|
| Change what long-term facts look like / how they're injected | `lib/intelligence/memory.ts` (`factsBlock()`) |
| Change prompt versioning behaviour | `lib/intelligence/prompts.ts` |
| Change analytics metrics | `lib/intelligence/analytics.ts` + `/api/analytics` + `/dashboard/analytics` |
| Add eval cases | `eval/dataset.example.json` (copy to `eval/dataset.json`), run `npm run eval <businessId>` |
| Change eval assertions available | `lib/eval/runner.ts` → `scoreCase()` |

### Data
- Schema: `supabase/migrations/002`–`006` (all idempotent). Apply new ones with
  the Supabase MCP or `supabase db push`.
- Types: `lib/database.types.ts` — regenerate after a migration
  (`supabase gen types typescript --project-id qxhtiooitwvesnmnoeos > lib/database.types.ts`).
  Note: the app uses the *untyped* client, so this file is reference only.
- RLS is on every table; server routes use the service-role key and bypass it.

### Auth
- Dashboard mutation routes gate on `lib/auth.ts` → `requireBusinessAccess()`
  (Supabase session token + `user_businesses` membership).
- `authedFetch()` in `app/dashboard/_components/api.ts` attaches the token.
- Older routes (`/api/businesses` GET, `/api/businesses/[id]`) are still open —
  add `requireBusinessAccess` there before onboarding a paying client.
- Every mutation writes to `audit_log` via `writeAudit()`.

---

## 3. The tuning loop (what to do after it's live)

1. **Run real traffic.** WhatsApp, or paste real customer messages into `/chat`.
2. **Open `/dashboard/traces`.** Every wrong answer shows its cause in the steps:
   - `reasoning` step made no tool call when it should have → skill `description` too vague, or global rules too weak
   - `tool` step `ok: false` with `validationErrors` → the model sent bad args; tighten the schema `description`s
   - `retrieval` step returned few hits → upload more/better documents, or raise `match_count`
   - reply invented a fact → strengthen the "don't invent" line in `buildSystemPrompt()`
   - slow → look at which step's `ms` is high (almost always the `reasoning` LLM call)
3. **Fix the cheapest cause.** Usually a one-line prompt or description change.
4. **Add the failing message to `eval/dataset.json`.** Run `npm run eval` — keep it green.
5. **Only then** try a bigger lever: different model (`GROQ_MODEL_NAME`), RAG as a
   tool call instead of a fixed step, a new skill.

---

## 4. What's NOT built (and roughly how, when you want it)

See `MODULE_STATUS.md` for the full table. Short version, none of these block
going live:

- **Stripe payments** — needs a Stripe account; `create_payment_link` skill + webhook. ~1 session.
- **Spoken replies (TTS)** — voice notes are transcribed *in*; replying *with* audio needs a TTS key.
- **PDF invoices** — HTML works today; wire `DOCUMENT_PDF_ENDPOINT` to a converter.
- **Arabic dialect / transliteration** — only script detection + "reply in their language" today.
- **Workflow automation engine, autonomous multi-step planner** — the harness has the
  foundation (bounded tool loops); these are extensions of `lib/harness/index.ts`.
- **Self-service onboarding wizard** — `user_businesses.role` exists; needs a `/onboard` flow.
