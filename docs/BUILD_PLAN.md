# Core Agent Build — what was built and how it hangs together

Branch: `worktree-core-agent-build`
Scope: `Master_Plan_v2.md` Track 2 (Core Agent Build). Goal stated by Ashfaque:
ship the end product fast, then learn how it's used.

## The one idea

Everything routes through **one function**:

```
runAgent(rawMessage, deps) -> { reply, usedSkills, trace }
```

WhatsApp, the dashboard tester, the web widget, and the eval runner all call it.
No channel has its own reasoning logic. Adding a client is config + a skill,
never a core edit.

## The five layers (`lib/harness/`)

```
raw message
   │
   ▼
1 input.ts      normalise text, detect locale (en/ar/mixed), clamp history
   │
   ▼
2 retrieval     RAG: embed the message, match_documents(), inject top 3 as context
   │
   ▼
2/3 index.ts    reasoning ⇄ tools loop:
   │              - Groq llama-3.3-70b native function-calling
   │              - model picks a skill → validate args against its JSON Schema
   │                (lib/harness/validate.ts) → run it (timeout + per-turn budget)
   │              - tool result goes back to the model → repeat or answer
   │
   ▼
4 output        structured contract { reply, usedSkills, conversationId, trace }
   │
   ▼
5 trace.ts      one row in agent_traces: every layer's step as JSON
```

Guardrails that make tool-calling trustworthy (the plan's thesis):
- args are schema-checked before a skill ever runs; bad args come back as a
  retryable error, not a crash
- a skill can't run longer than `toolTimeoutMs`
- a run can't call more than `maxToolCalls` tools
- the system prompt forbids claiming an action happened without a tool result

## Skills (`lib/skills/`)

A skill is one file exporting `{ name, description, parameters, run, mutates? }`.
`parameters` **is** the Groq tool schema — no adapter. The registry
(`registry.ts`) resolves which skills a business gets from the `business_skills`
table (enable/disable + a `config` blob per skill).

Shipped:

| skill | mutates | what it does |
|-------|---------|--------------|
| `get_business_hours` | no | reads `businesses.hours` |
| `search_knowledge` | no | RAG search as an explicit tool |
| `create_booking` | yes | check open slots / confirm a booking (+ optional Google Calendar, + WhatsApp confirmation) |
| `capture_lead` | yes | upsert contact + create a lead |
| `generate_quote` | yes | quote/invoice/receipt HTML from line items, returns a link |

## Business actions (`lib/actions/`)

- `booking.ts` — slot math from opening hours, overlap conflict detection
- `calendar.ts` — Google Calendar via service-account JWT (no `googleapis` dep)
- `notifications.ts` — WhatsApp + email (Resend), every send logged
- `documents.ts` — line items → totals → print-ready HTML; `renderPdf()` seam
- `crm.ts` — contacts, leads, 5-stage pipeline

## Intelligence (`lib/intelligence/`, `lib/eval/`)

- `prompts.ts` — versioned per-business system prompts, one active, rollback
- `analytics.ts` — conversations, replies, skill usage, latency, degraded rate, daily volume
- `eval/runner.ts` + `scripts/eval.ts` — JSON case list → run through the agent →
  assert on reply text + skills fired → scorecard

## Channels

- **WhatsApp** (`app/api/whatsapp/webhook`) — rewritten: business resolved by
  `phone_number_id`, 24h conversation continuity per contact, harness, Meta API v25.0
- **Dashboard tester** (`app/api/chat`) — unchanged auth/persistence, harness swapped in
- **Web widget** — `public/widget.js` (script tag) → `/embed/<publicKey>` → `/api/public/chat`

## Data (migrations `002`–`005`, applied via Supabase MCP)

New tables: `business_skills`, `agent_traces`, `bookings`, `contacts`, `leads`,
`notifications_log`, `documents_generated`, `prompt_versions`.
`businesses` gained: `phone_number_id`, `public_key`, `hours`, `timezone`, `is_default`.
RLS on everything (owner via `user_businesses`); server routes use the service role.
RPCs: `match_documents` (recreated), `daily_conversation_volume`.

## Dashboard pages added

`/dashboard/skills` · `/dashboard/traces` · `/dashboard/prompts` · `/dashboard/analytics`

## Curriculum coverage (after both build passes)

| Phase | State |
|-------|-------|
| 1 Skills & Harness | ✅ complete in code (pending your live WhatsApp test) |
| 2 Business Actions | Booking ✅ (create + cancel) · CRM ✅ (skill + dashboard) · Notifications ✅ (confirm/cancel/reminder cron) · Documents ⚠️ HTML only, PDF is a seam |
| 3 Intelligence | Prompt mgmt ✅ · Eval ✅ · Analytics ✅ · long-term contact memory ✅ |
| 4 Channels | Web widget ✅ · Image (Gemini vision) ✅ · Voice notes in (Whisper) ✅ · spoken replies ✗ · Arabic = script detect only |
| 5 Hardening | MCP ✅ · web-scrape→RAG ✅ (basic) · auth+audit ⚠️ new routes only · autonomous foundation only · Stripe ✗ · onboarding wizard ✗ |

Full per-module detail: `MODULE_STATUS.md`. What you must do: `USER_ACTIONS_SPEC.md`.
How it works + every tuning knob: `RUN_THROUGH.md`. Scenarios: `USE_CASES.md`.

## Second build pass added

Skills: `cancel_booking`, `remember_fact`, `ingest_url`.
`lib/channels/whatsapp-media.ts` (image→Gemini, voice→Whisper), webhook wired.
`lib/intelligence/memory.ts` + `contact_memory` table + auto-recall in the harness.
`lib/auth.ts` (`requireBusinessAccess`, `writeAudit`) on skills/prompts/leads/bookings routes.
`app/api/mcp/route.ts` (MCP-over-HTTP). `app/api/cron/booking-reminders` + `vercel.json`.
Dashboard: `/dashboard/leads`, `/dashboard/bookings`; Businesses page gains
phone_number_id / hours / timezone / public_key fields.
Migration `006` (contact_memory, audit_log, bookings.reminder_sent) applied via MCP.

## Verification done this session

- `npx tsc --noEmit` — clean
- `npx next build` — see commit message / your run
- migrations `002`–`005` applied and schema confirmed via MCP
- no pre-existing file changed beyond the minimal list in `MODULE_STATUS.md`
