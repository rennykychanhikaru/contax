-- Agent-level Twilio settings
-- Creates agent_twilio_settings table with org + agent FKs, encrypted token, RLS, and indexes

create extension if not exists "uuid-ossp";

-- 1) Table definition
create table if not exists public.agent_twilio_settings (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agent_configurations(id) on delete cascade,
  account_sid text not null,
  auth_token_encrypted text not null,
  phone_number text not null,
  encryption_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id)
  -- Optional: prevent number collisions within an org
  -- , unique (organization_id, phone_number)
);

-- 2) Row Level Security
alter table public.agent_twilio_settings enable row level security;

-- Read access for organization members
create policy "Members can read agent twilio settings"
  on public.agent_twilio_settings
  for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_twilio_settings.organization_id
      and om.user_id = auth.uid()
    )
  );

-- Manage access for admins/owners
create policy "Admins can manage agent twilio settings"
  on public.agent_twilio_settings
  for all
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_twilio_settings.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_twilio_settings.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin')
    )
  );

-- 3) Helpful indexes
create index if not exists idx_agent_twilio_agent_id on public.agent_twilio_settings(agent_id);
create index if not exists idx_agent_twilio_org_id on public.agent_twilio_settings(organization_id);
create index if not exists idx_agent_twilio_phone on public.agent_twilio_settings(phone_number);
