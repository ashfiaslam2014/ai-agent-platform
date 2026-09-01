# ai-agent-platform — Project Memory

## What This Is
Multi-tenant SaaS that deploys RAG-powered WhatsApp AI customer service
agents for UAE small businesses. Solo developer (Ashfaque). Build fast,
ship working over perfect.

## Your Role: Sole Developer
Claude Code is the only coding agent on this project — Antigravity and
Gemini CLI are no longer used. There's no frontend agent to delegate to;
you own backend, frontend, and anything that touches the truth of the
system. You make architectural judgment calls.

YOU HANDLE:
- All backend routes (app/api/**), server-side logic, DB queries
- Supabase: migrations, schema, RLS policies, Edge Functions
- RAG pipeline internals (chunking, embedding, retrieval)
- Frontend/UI code (pages, components, styles)
- Integration and end-to-end testing
- Vault updates in Project_Vault/01-Projects/ai-agent-platform/ — run the
  `vault-sync` skill (`~/.claude/skills/vault-sync/`). It supersedes the old
  `Project_Vault/03-Patterns/skills/Claude/SKILL-update-vault.md`.
- Git: **commit freely** — branch first if on `main` — so work isn't lost.
  No permission needed to commit. **Push ONLY when Ashfaque explicitly says
  to push, that session.** Never push autonomously; a push to `main`
  auto-deploys Vercel production. No force-push, no PR merges, no history
  rewrites.

> DEPRECATED — do not act on it: the earlier line "YOU DO NOT: Commit or push
> without explicit per-push approval" is dead. Committing is allowed and
> encouraged. Only the *push* is gated on an explicit ask. This matches
> `~/.claude` memory `git_policy.md` and `Project_Vault/Master_Plan_v2.md`
> rule 15. Do not cite the old wording as a reason not to commit.

Note: the vault's old multi-tool team docs (team-alignment.md,
antigravity-role.md, gemini-cli-role.md) live in
Project_Vault/06-Archive/antigravity-era/06-Team-Config/, marked
`status: superseded` — this file supersedes them.

## Tech Stack
- Next.js 15 (TypeScript, App Router)
- Supabase (pgvector 0.8.0)
- Groq (llama-3.3-70b-versatile) for LLM
- Gemini (gemini-embedding-001, 768 dims) for embeddings ONLY
- Vercel deployment
- WhatsApp: Meta Business API (direct, not Twilio)
- Live: https://ai-agent-platform-ashen.vercel.app

## Hard Rules
1. Next.js 15: dynamic route params are async — ALWAYS use
   `const { id } = await params` in route handlers.
2. Env vars: update .env.local AND Vercel together. NEXT_PUBLIC_ vars
   bake in at build time — redeploy after any change.
3. Both API_SECRET_KEY and NEXT_PUBLIC_API_SECRET_KEY must exist (same
   value, different access contexts).
4. NEVER edit ~/.bashrc — it has a "MANUALLY MANAGED" comment. Env vars
   misbehaving? Check .bashrc first, but do not edit it.
5. Provider switching: switch LLM/embedding provider after ONE failed
   attempt, not multiple retries.
6. NEVER commit secrets, API keys, or tokens.
7. WhatsApp API is on v25.0 — flag any hardcoded v21.0 strings.

## Scope Discipline
Current model: `Project_Vault/Master_Plan_v2.md` — a Phase 0–5 build sequence
plus 6 parallel tracks. **Build complete before selling:** Phase 2 (Business
Actions) is the first genuinely sellable build; client demos stay on hold
until then. Build to the current Phase; if asked to jump ahead of it, flag it.

> DEPRECATED — do not act on it: "Currently Wave 1 … DO NOT build Wave 2
> features until a Wave 1 client is actively using the product" is retired,
> along with the entire Wave 1–7 framework (see `Master_Plan_v2.md` rule 6 and
> `Project_Vault/CURRENT-ARCHITECTURE.md`). Do NOT gate build work on having a
> client — that ordering was reversed.

## Working Style
- Terminal guidance: beginner level. One command at a time, no scripts.
- 20-minute stuck rule: if blocked 20 min, stop and escalate to
  Ashfaque rather than grinding.
- Explain the "why" on non-obvious decisions.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
