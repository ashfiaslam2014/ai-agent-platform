-- ============================================================================
-- 002_full_schema.sql
-- Complete schema for the AI Agent Platform. Idempotent (safe to re-run).
--
-- Supersedes the partial 001_create_conversations.sql. Covers:
--   Phase 0  — businesses, tenancy, conversations, messages, documents (RAG)
--   Harness  — business_skills, agent_traces
--   Actions  — bookings, contacts, leads, notifications_log, documents_generated
--   Intel    — prompt_versions
-- RLS + RPCs live in 003_rls_and_functions.sql.
-- ============================================================================

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Phase 0: businesses + multi-tenancy
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  system_prompt     text not null default '',
  -- WhatsApp Cloud API: inbound webhooks are matched to a business by this id.
  phone_number_id   text unique,
  -- Public embeddable widget authenticates with this key (see /api/public/chat).
  public_key        text unique default encode(gen_random_bytes(16), 'hex'),
  -- { "monday": {"open":"09:00","close":"18:00"}, "friday": "closed", ... }
  hours             jsonb,
  timezone          text default 'Asia/Dubai',
  is_default         boolean not null default false,
  created_at        timestamptz not null default now()
);

-- One user ⇢ many businesses. Row-level ownership check for the dashboard API.
create table if not exists user_businesses (
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- ---------------------------------------------------------------------------
-- Phase 0: conversations + messages
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  channel     text not null default 'whatsapp',
  contact_handle text,
  created_at  timestamptz not null default now()
);
-- 001 created a slimmer version; add anything missing.
alter table conversations add column if not exists business_id uuid references businesses(id) on delete cascade;
alter table conversations add column if not exists channel text not null default 'whatsapp';
alter table conversations add column if not exists contact_handle text;

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role            text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Phase 0: documents (RAG chunks)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title       text,
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   vector(768),
  created_at  timestamptz not null default now()
);
create index if not exists documents_business_idx on documents(business_id);
create index if not exists documents_embedding_idx
  on documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- Harness: per-business skill toggles + decision traces
-- ---------------------------------------------------------------------------
create table if not exists business_skills (
  business_id uuid not null references businesses(id) on delete cascade,
  skill_name  text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (business_id, skill_name)
);

create table if not exists agent_traces (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  channel         text,
  input           text,
  final_output    text,
  steps           jsonb not null default '[]'::jsonb,
  used_skills     text[] not null default '{}',
  duration_ms     integer,
  degraded        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists agent_traces_business_idx on agent_traces(business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Actions: bookings
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  service_name     text not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  duration_minutes integer not null,
  customer_name    text not null,
  customer_phone   text,
  notes            text,
  status           text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  calendar_event_id text,
  created_at       timestamptz not null default now()
);
create index if not exists bookings_business_time_idx on bookings(business_id, starts_at);

-- ---------------------------------------------------------------------------
-- Actions: CRM (contacts + leads)
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text,
  phone       text,
  email       text,
  channel     text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);

create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  summary     text not null,
  stage       text not null default 'new' check (stage in ('new','qualified','quoted','won','lost')),
  value_aed   numeric,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists leads_business_stage_idx on leads(business_id, stage);

-- ---------------------------------------------------------------------------
-- Actions: notifications log
-- ---------------------------------------------------------------------------
create table if not exists notifications_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  channel     text not null check (channel in ('whatsapp','email')),
  recipient   text not null,
  kind        text not null,
  body        text not null,
  status      text not null check (status in ('sent','failed')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_business_idx on notifications_log(business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Actions: generated documents (quotes / invoices / receipts)
-- ---------------------------------------------------------------------------
create table if not exists documents_generated (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  type            text not null check (type in ('quote','invoice','receipt')),
  number          text not null,
  customer_name   text not null,
  customer_contact text,
  items           jsonb not null default '[]'::jsonb,
  currency        text not null default 'AED',
  subtotal        numeric not null default 0,
  tax             numeric not null default 0,
  total           numeric not null default 0,
  notes           text,
  due_date        text,
  html            text not null,
  created_at      timestamptz not null default now(),
  unique (business_id, type, number)
);

-- ---------------------------------------------------------------------------
-- Intelligence: versioned per-business prompts
-- ---------------------------------------------------------------------------
create table if not exists prompt_versions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  version     integer not null,
  content     text not null,
  note        text,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (business_id, version)
);
create unique index if not exists prompt_versions_one_active
  on prompt_versions(business_id) where is_active;
