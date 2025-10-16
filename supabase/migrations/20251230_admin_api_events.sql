create table if not exists public.admin_api_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  method text not null,
  path text not null,
  status integer not null,
  duration_ms integer,
  admin_user_id uuid references auth.users(id),
  target_type text,
  target_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_admin_api_events_occurred_at on public.admin_api_events (occurred_at desc);
create index if not exists idx_admin_api_events_status on public.admin_api_events (status);
create index if not exists idx_admin_api_events_admin on public.admin_api_events (admin_user_id, occurred_at desc);
create index if not exists idx_admin_api_events_target on public.admin_api_events (target_type, target_id, occurred_at desc);

create table if not exists public.admin_api_aggregates (
  bucket timestamptz not null,
  method text not null,
  path text not null,
  total_requests integer not null,
  error_count integer not null,
  avg_duration_ms numeric not null,
  p95_duration_ms numeric not null,
  primary key (bucket, method, path)
);

create or replace view public.admin_api_latency_summary as
select
  date_trunc('hour', occurred_at) as bucket,
  method,
  path,
  count(*) as total_requests,
  sum(case when status >= 500 then 1 else 0 end) as error_count,
  avg(duration_ms) filter (where duration_ms is not null) as avg_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms) filter (where duration_ms is not null) as p95_duration_ms
from public.admin_api_events
group by bucket, method, path;

alter table public.admin_api_events enable row level security;
alter table public.admin_api_aggregates enable row level security;

drop policy if exists "Super admins log via service role" on public.admin_api_events;
create policy "Super admins log via service role"
  on public.admin_api_events
  for insert
  with check (true);

drop policy if exists "Super admins read admin api events" on public.admin_api_events;
create policy "Super admins read admin api events"
  on public.admin_api_events
  for select
  using (
    exists (
      select 1
      from public.accounts a
      inner join public.account_user au on a.id = au.account_id
      where au.user_id = auth.uid()
        and a.is_super_admin = true
    )
  );

drop policy if exists "Super admins read admin api aggregates" on public.admin_api_aggregates;
create policy "Super admins read admin api aggregates"
  on public.admin_api_aggregates
  for select
  using (
    exists (
      select 1
      from public.accounts a
      inner join public.account_user au on a.id = au.account_id
      where au.user_id = auth.uid()
        and a.is_super_admin = true
    )
  );
