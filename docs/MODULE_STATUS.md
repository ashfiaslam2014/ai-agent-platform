# Module Status — Core Agent Build

Honest state of all 28 modules from `Project_Vault/Master_Plan_v2.md` after the
Core Agent Build session (branch `worktree-core-agent-build`).

Legend:
- **Working** — real code, wired end-to-end, needs your config/keys to switch on.
- **Partial** — core built, one clearly-marked seam left (usually an external service).
- **Pre-existing** — was already done in Phase 0, untouched this session.
- **Not built** — deliberately skipped. Approach noted so the next session starts fast.

---

## Phase 0 — Foundation

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 1 | Cloud Server | Pre-existing | Vercel + Supabase. |
| 2 | LLM Module | Working | `lib/harness/llm.ts` — Groq native function-calling, Gemini fallback on one failure. |
| 3 | Context / Memory (basic) | Pre-existing | Conversation + message history, passed into every harness run. |
| 4 | Vector DB | Pre-existing | pgvector, `documents` table, `match_documents` RPC (recreated in migration 003). |
| 5 | RAG | Working | Kept as a fixed retrieval pre-step feeding the reasoning layer; also exposed as the `search_knowledge` skill. |
| 6 | WhatsApp | Working | `app/api/whatsapp/webhook` rewritten: resolves business by `phone_number_id`, 24h conversation continuity, calls the harness, API version bumped to v25.0. |
| 7 | Dashboards (basic) | Working | New pages: Skills, Traces, Prompts, Analytics. Existing pages untouched. |
| 18 | Auth & Multi-Tenancy (basic) | Pre-existing + extended | Supabase auth kept. Webhook is now genuinely multi-tenant via `phone_number_id`. |

## Phase 1 — Skills & Harness  ← **the core deliverable**

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 10 | Skills / Tool Registry | Working | `lib/skills/` — flat skill contract (`name`, `description`, `parameters` JSON Schema, `run`), process registry, per-business enable/disable + config via `business_skills`. 5 skills shipped: `get_business_hours`, `search_knowledge`, `create_booking`, `capture_lead`, `generate_quote`. |
| 11 | Reasoning Model | Working | `lib/harness/index.ts` — 5 layers (input → retrieval → reasoning ⇄ tool-call → output → trace). Arg validation against each skill's schema before execution; per-turn tool-call budget; per-skill timeout; never claims an action without a tool result. |
| — | Observability | Working | `agent_traces` table — one row per message, every layer's step captured as JSON. Trace viewer at `/dashboard/traces`. This is also the fine-tuning dataset. |

**Phase 1 exit criteria (from the plan):** agent calls a real skill from a
WhatsApp message and the trace is inspectable in the dashboard — **met in code**,
pending your live WhatsApp test (see `USER_ACTIONS_SPEC.md`).

## Phase 2 — Business Actions

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 22 | Booking / Appointments | Working | `lib/actions/booking.ts` — slot generation from business `hours`, overlap conflict detection, `bookings` table. `create_booking` skill (check availability → confirm). |
| 19 | Notifications | Partial | `lib/actions/notifications.ts` — WhatsApp (Meta) + email (Resend), every send logged to `notifications_log`. **Wired only to booking confirmations.** Agent-initiated reminders/follow-ups = next session. |
| 23 | Document Generation | Partial | `lib/actions/documents.ts` — quote/invoice/receipt from line items, real AED totals, stored as print-ready HTML, served at `/documents/<id>`. **PDF output is a seam:** set `DOCUMENT_PDF_ENDPOINT` to an HTML→PDF service and `renderPdf()` uses it. |
| 21 | CRM / Lead Management | Working (data + skill) | `lib/actions/crm.ts` — contacts (upsert by phone), leads, 5-stage pipeline. `capture_lead` skill. **No dedicated dashboard page yet** — view in Supabase or add a page (small, follows the Traces page pattern). |

## Phase 3 — Intelligence & Learning

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 26 | Prompt Management | Working | `lib/intelligence/prompts.ts` + `/dashboard/prompts` — versioned per-business prompts, one active at a time (DB-enforced), one-click rollback. |
| 27 | Testing & Evaluation | Working | `lib/eval/` + `scripts/eval.ts` — JSON dataset of cases, asserts on reply text + which skills fired, prints a scorecard. `eval/dataset.example.json` included. |
| 3 | Context / Memory (advanced) | Not built | Long-term per-contact facts. Approach: a `contact_memory` table (`contact_id`, `key`, `value`, `updated_at`); a `remember_fact` skill; inject a contact's facts into the system prompt in `lib/harness/server.ts` next to the prompt lookup. ~1 session. |
| 25 | Analytics & Reporting | Working | `lib/intelligence/analytics.ts` + `/dashboard/analytics` — conversations, replies, skill usage, avg latency, degraded rate, daily volume chart. |

## Phase 4 — Channels & Interfaces

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 8 | Web Application / widget | Working | `public/widget.js` (floating button + iframe) → `/embed/<publicKey>` chat UI → `/api/public/chat` (public-key auth, in-memory rate limit, CORS). One `<script>` tag to install. |
| 15 | Voice Control | Not built | STT+TTS over WhatsApp voice notes. Approach: in the webhook, detect `messageObj.type === 'audio'`, download media via Meta Graph API, STT (Groq Whisper `whisper-large-v3` — already on Groq, no new vendor), run text through the harness, TTS the reply (Google TTS or ElevenLabs free tier), upload + send as audio. ~1–2 sessions. Needs: nothing new if using Groq Whisper for STT; a TTS key for spoken replies. |
| 14 | Image Recognition | Not built | Photo queries (menu, product, damage). Approach: detect `messageObj.type === 'image'`, download media, send to a vision model (Groq `llama-3.2-90b-vision` or Gemini) with the caption as the prompt, feed the description into the harness as the user turn. ~1 session, no new vendor. |
| 17 | Arabic / Multilingual NLP | Partial | `detectLocale()` in `lib/harness/input.ts` (script-based en/ar/mixed) and a system-prompt instruction to reply in the customer's language. Dialect handling, transliteration, Arabic voice = later. |

## Phase 5 — Platform Hardening

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 18 | Auth & Multi-Tenancy (advanced) | Not built | RBAC, self-service onboarding. Approach: `user_businesses.role` already exists — add a `requireRole()` helper in a shared `lib/auth.ts`, gate the dashboard API routes with it (they're currently open, matching the existing Phase 0 routes). Onboarding = a `/onboard` wizard that creates the business row + `user_businesses` link + seeds `business_skills`. |
| 28 | Security & Data Privacy | Not built | Audit log, PII handling, UAE residency. Approach: `audit_log` table (`actor`, `action`, `target`, `meta`, `at`); write to it from the dashboard mutation routes; Supabase is already in `ap-*` regions. |
| 12 | MCP | Not built | Expose skills as MCP tools. Approach: the skill contract is already MCP-shaped (`name`/`description`/`parameters`). A thin `app/api/mcp/route.ts` speaking MCP-over-HTTP that lists `allSkills()` and dispatches `tools/call` into `skill.run()` with a service context. ~1 session. |
| 13 | Autonomous Agents | Partial (foundation) | The harness already does bounded multi-step tool loops. "Autonomous" = raise `maxToolCalls`, add a planning step that writes a checklist to the trace, and a per-run cost ceiling. Extends `lib/harness/index.ts`, no new infra. |
| 20 | Workflow Automation | Not built | n8n/Make-style triggers. Approach: a `workflows` table (trigger event + action steps as JSON) and an event bus — emit events from the harness (`booking.created`, `lead.captured`) and a runner that matches workflows. Bigger; 2–3 sessions. |
| 24 | Web Scraping / Data Collection | Not built | Feeds RAG (menus, catalogues, competitor prices). Approach: a `scrape_url` server action (fetch + readability extract) → chunk → embed → insert into `documents`. Small standalone; ~1 session. |
| 9 | Online Payments | Not built | Stripe. Approach: `stripe` SDK, a `create_payment_link` skill (mutating, config holds the restricted key), `app/api/stripe/webhook` to mark invoices paid in `documents_generated`. ~1 session; needs a Stripe account. |
| 16 | Mobile Application | Not built | Track 6, not part of Core Agent Build. |

---

## What changed in pre-existing files (kept minimal)

- `lib/supabase.ts` — added an exported `AppSupabaseClient` type alias; client stays untyped as before.
- `app/api/chat/route.ts` — replaced the inline RAG+Groq steps with `runAgentForBusiness()`; auth + persistence unchanged.
- `app/api/whatsapp/webhook/route.ts` — rewritten (multi-tenancy, continuity, harness, v25.0).
- `app/api/businesses/[id]/route.ts` — `PATCH` also syncs the new `is_default` column.
- `components/NavBar.tsx` — 4 new nav links.
- `supabase/migrations/001` — left as-is (historical); 002 supersedes it idempotently.
