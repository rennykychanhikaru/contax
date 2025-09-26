-- Agent-level Twilio settings
-- Creates agent_twilio_settings table with org + agent FKs, encrypted token, RLS, and indexes

create extension if not exists "uuid-ossp";

-- 1) Table definition
create table if not exists public.agent_twilio_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- agent_id references agent_configurations, which may be created later.
  -- Create the column now; add the FK constraint later once the table exists.
  agent_id uuid not null,
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
DO $$
BEGIN
  -- Create policies only if organization_members exists
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_twilio_settings' AND policyname='Members can read agent twilio settings'
    ) THEN
      CREATE POLICY "Members can read agent twilio settings"
        ON public.agent_twilio_settings
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = agent_twilio_settings.organization_id
              AND om.user_id = auth.uid()
          )
        );
    END IF;
  END IF;
END $$;

-- Manage access for admins/owners
DO $$
BEGIN
  -- Create policies only if organization_members exists
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_twilio_settings' AND policyname='Admins can manage agent twilio settings'
    ) THEN
      CREATE POLICY "Admins can manage agent twilio settings"
        ON public.agent_twilio_settings
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = agent_twilio_settings.organization_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner','admin')
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = agent_twilio_settings.organization_id
              AND om.user_id = auth.uid()
              AND om.role IN ('owner','admin')
          )
        );
    END IF;
  END IF;
END $$;

-- 3) Helpful indexes
create index if not exists idx_agent_twilio_agent_id on public.agent_twilio_settings(agent_id);
create index if not exists idx_agent_twilio_org_id on public.agent_twilio_settings(organization_id);
create index if not exists idx_agent_twilio_phone on public.agent_twilio_settings(phone_number);

-- Ensure per-org phone numbers are unique across agents
create unique index if not exists idx_agent_twilio_unique_org_phone
  on public.agent_twilio_settings(organization_id, phone_number);

-- Attempt to add FK to agent_configurations if it exists now (safe no-op otherwise)
DO $$
BEGIN
  IF to_regclass('public.agent_configurations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'agent_twilio_settings' AND c.conname = 'fk_agent_twilio_agent_id_configurations'
    ) THEN
      ALTER TABLE public.agent_twilio_settings
        ADD CONSTRAINT fk_agent_twilio_agent_id_configurations
        FOREIGN KEY (agent_id) REFERENCES public.agent_configurations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
