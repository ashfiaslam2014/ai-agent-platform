-- ============================================================================
-- 006_memory_audit_reminders.sql
-- Long-term contact memory, dashboard audit log, booking reminder flag.
-- Idempotent. Applied to qxhtiooitwvesnmnoeos via MCP.
-- ============================================================================

create table if not exists contact_memory (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  key         text not null,
  value       text not null,
  updated_at  timestamptz not null default now(),
  unique (contact_id, key)
);
create index if not exists contact_memory_contact_idx on contact_memory(contact_id);

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  actor       text,
  action      text not null,
  target      text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_business_idx on audit_log(business_id, created_at desc);

alter table bookings add column if not exists reminder_sent boolean not null default false;

alter table contact_memory enable row level security;
alter table audit_log enable row level security;

drop policy if exists contact_memory_owner_all on contact_memory;
create policy contact_memory_owner_all on contact_memory
  for all using (owns_business(business_id)) with check (owns_business(business_id));

drop policy if exists audit_log_owner_read on audit_log;
create policy audit_log_owner_read on audit_log
  for select using (owns_business(business_id));
