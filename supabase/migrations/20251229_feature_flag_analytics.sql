-- Feature flag usage analytics schema
create table if not exists public.feature_flag_usage_events (
  id uuid primary key default gen_random_uuid(),
  feature_flag_id uuid references public.feature_flags(id) on delete set null,
  flag_key text not null,
  account_id uuid references public.accounts(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  was_enabled boolean not null,
  evaluated_at timestamptz not null default now(),
  source text not null default 'unknown',
  metadata jsonb
);

create index if not exists idx_feature_flag_usage_events_flag on public.feature_flag_usage_events(flag_key);
create index if not exists idx_feature_flag_usage_events_evaluated_at on public.feature_flag_usage_events(evaluated_at desc);

create or replace view public.feature_flag_usage_summary as
select
  flag_key,
  date_trunc('day', evaluated_at) as bucket,
  count(*) as total_checks,
  sum(case when was_enabled then 1 else 0 end) as enabled_checks
from public.feature_flag_usage_events
group by flag_key, bucket;

alter table public.feature_flag_usage_events enable row level security;

drop policy if exists "Super admins log feature flag usage" on public.feature_flag_usage_events;
create policy "Super admins log feature flag usage"
  on public.feature_flag_usage_events
  for insert
  with check (
    exists (
      select 1
      from public.accounts a
      inner join public.account_user au on a.id = au.account_id
      where au.user_id = auth.uid()
        and a.is_super_admin = true
    )
  );

drop policy if exists "Super admins view feature flag usage" on public.feature_flag_usage_events;
create policy "Super admins view feature flag usage"
  on public.feature_flag_usage_events
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

create or replace function public.is_feature_enabled(
  flag_key text,
  check_account_id uuid default null,
  check_user_id uuid default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  flag_record public.feature_flags%rowtype;
  override_enabled boolean;
  result boolean := false;
  override_scope text := null;
begin
  select *
  into flag_record
  from public.feature_flags
  where public.feature_flags.flag_key = is_feature_enabled.flag_key;

  if not found then
    insert into public.feature_flag_usage_events (
      feature_flag_id,
      flag_key,
      account_id,
      user_id,
      was_enabled,
      source,
      metadata
    )
    values (
      null,
      flag_key,
      check_account_id,
      check_user_id,
      false,
      'rpc:is_feature_enabled',
      jsonb_build_object('reason', 'missing_flag')
    );
    return false;
  end if;

  result := flag_record.is_enabled;

  if check_account_id is not null then
    select is_enabled
    into override_enabled
    from public.feature_flag_overrides
    where feature_flag_id = flag_record.id
      and account_id = check_account_id;

    if found then
      result := override_enabled;
      override_scope := 'account';
    end if;
  end if;

  if check_user_id is not null then
    select is_enabled
    into override_enabled
    from public.feature_flag_overrides
    where feature_flag_id = flag_record.id
      and user_id = check_user_id;

    if found then
      result := override_enabled;
      override_scope := 'user';
    end if;
  end if;

  insert into public.feature_flag_usage_events (
    feature_flag_id,
    flag_key,
    account_id,
    user_id,
    was_enabled,
    source,
    metadata
  )
  values (
    flag_record.id,
    flag_record.flag_key,
    check_account_id,
    check_user_id,
    result,
    'rpc:is_feature_enabled',
    case
      when override_scope is null then null
      else jsonb_build_object('override_scope', override_scope)
    end
  );

  return result;
end;
$$;
