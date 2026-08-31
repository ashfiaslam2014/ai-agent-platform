-- ============================================================================
-- 005_analytics_rpc.sql
-- Daily conversation volume for the dashboard analytics chart. Idempotent.
-- ============================================================================

create or replace function daily_conversation_volume(b uuid, since_days int)
returns table (day text, conversations bigint)
language sql stable
as $$
  select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
         count(*) as conversations
  from conversations
  where business_id = b
    and created_at >= now() - make_interval(days => since_days)
  group by 1
  order by 1;
$$;
