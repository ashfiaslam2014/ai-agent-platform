-- ============================================================================
-- 003_rls_and_functions.sql
-- RLS policies + RAG match function. Idempotent.
--
-- Model: the app's server routes use the SERVICE ROLE key and bypass RLS.
-- RLS here is the backstop for the browser (anon key) dashboard and any
-- future direct-from-client access. Ownership flows through user_businesses.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RAG retrieval function (used by lib/embedding + search_knowledge skill)
-- ---------------------------------------------------------------------------
-- A Phase 0 match_documents() with different arg defaults may already exist.
drop function if exists match_documents(vector, integer, uuid);
drop function if exists match_documents(vector, int, uuid);

create function match_documents(
  query_embedding vector(768),
  match_count int,
  match_business_id uuid
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select d.id, d.content, d.metadata,
         1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where d.business_id = match_business_id
    and d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Helper: does the current user own this business?
-- ---------------------------------------------------------------------------
create or replace function owns_business(b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_businesses ub
    where ub.business_id = b and ub.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS + policies
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','user_businesses','conversations','messages','documents',
    'business_skills','agent_traces','bookings','contacts','leads',
    'notifications_log','documents_generated','prompt_versions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- businesses: owner can do everything
drop policy if exists businesses_owner_all on businesses;
create policy businesses_owner_all on businesses
  for all using (owns_business(id)) with check (owns_business(id));

-- user_businesses: user sees only their own membership rows
drop policy if exists user_businesses_self on user_businesses;
create policy user_businesses_self on user_businesses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Everything else: scoped by owns_business(business_id)
do $$
declare t text;
begin
  foreach t in array array[
    'conversations','documents','business_skills','agent_traces','bookings',
    'contacts','leads','notifications_log','documents_generated','prompt_versions'
  ]
  loop
    execute format('drop policy if exists %I_owner_all on %I', t, t);
    execute format(
      'create policy %I_owner_all on %I for all using (owns_business(business_id)) with check (owns_business(business_id))',
      t, t
    );
  end loop;
end $$;

-- messages: scoped through the parent conversation
drop policy if exists messages_owner_all on messages;
create policy messages_owner_all on messages
  for all using (
    exists (select 1 from conversations c where c.id = conversation_id and owns_business(c.business_id))
  ) with check (
    exists (select 1 from conversations c where c.id = conversation_id and owns_business(c.business_id))
  );
