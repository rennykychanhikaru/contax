create or replace view public.admin_account_usage_summary as
with combined_calls as (
  select organization_id, created_at
  from public.calls
  union all
  select organization_id, created_at
  from public.call_logs
)
select
  a.id as account_id,
  a.name,
  count(c.created_at) as total_calls,
  count(c.created_at) filter (where c.created_at >= now() - interval '7 days') as last_7d_calls,
  count(c.created_at) filter (where c.created_at >= now() - interval '30 days') as last_30d_calls,
  max(c.created_at) as last_call_at
from public.accounts a
left join combined_calls c on c.organization_id = a.id
group by a.id, a.name;
