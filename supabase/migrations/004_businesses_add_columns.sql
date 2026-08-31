-- ============================================================================
-- 004_businesses_add_columns.sql
-- The Phase 0 `businesses` table pre-existed with only (id, name,
-- system_prompt, created_at). 002's `create table if not exists` skipped it,
-- so the columns the harness + channels need are added here. Idempotent.
-- ============================================================================

alter table businesses add column if not exists phone_number_id text;
alter table businesses add column if not exists public_key text;
alter table businesses add column if not exists hours jsonb;
alter table businesses add column if not exists timezone text default 'Asia/Dubai';
alter table businesses add column if not exists is_default boolean not null default false;

update businesses set public_key = encode(gen_random_bytes(16), 'hex') where public_key is null;
alter table businesses alter column public_key set default encode(gen_random_bytes(16), 'hex');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_phone_number_id_key') then
    alter table businesses add constraint businesses_phone_number_id_key unique (phone_number_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_public_key_key') then
    alter table businesses add constraint businesses_public_key_key unique (public_key);
  end if;
end $$;

-- Mark the oldest business as the WhatsApp default if none is set.
update businesses set is_default = true
where id = (select id from businesses order by created_at nulls first limit 1)
  and not exists (select 1 from businesses where is_default);
