# AI Agent Platform

> **Status: Archived prototype (September 2026)** — the repository is preserved for technical reference but the generic platform direction is no longer being developed.

## What was built

This project explored a multi-tenant AI-agent platform using Next.js, TypeScript, Supabase, Gemini, and Groq. The prototype included work across:

- agent execution and evaluation harnesses
- reusable skills and business actions
- authentication and tenant-aware data storage
- memory, reminders, CRM, and media workflows
- Google Calendar, Drive, and Docs connectors
- PDF generation and browser-based document workflows
- deployment on Vercel

The detailed build plan, module status, run-through, action specifications, and use cases remain available in the [docs](./docs) folder.

## Why development stopped

The platform became broad before proving a sufficiently specific customer problem. A generic agent platform would require substantial product, reliability, security, and support work without a clear reason for a business to choose it.

The lasting product lesson is to begin with a real, repeated business problem, deliver the smallest useful automation, and generalize only after the solution has demonstrated value.

## What may be reused

The repository remains a reference for patterns such as authentication, tool execution, evaluations, Supabase integration, Google Workspace connectors, and document generation. Those components may be adapted when a focused project genuinely needs them.

## Maintenance

This repository is not actively maintained, is not offered as a hosted service, and should not be treated as production-ready. The linked deployment may be unavailable or incomplete.
