-- Initial schema for local demo (Phase 1)
-- Organizations, Calls, Appointments, and Settings

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number text,
  timezone text default 'America/New_York',
  business_hours jsonb default '{}',
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  call_sid text,
  caller_phone text not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  duration_seconds integer,
  status text default 'in_progress',
  recording_url text,
  transcript jsonb,
  ai_summary text,
  appointment_booked boolean default false,
  created_at timestamptz default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  call_id uuid references calls(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text default 'confirmed',
  google_event_id text,
  notes text,
  created_at timestamptz default now(),
  -- prevent double booking per organization
  exclude using gist (
    organization_id with =,
    tstzrange(scheduled_start, scheduled_end) with &&
  ) where (status <> 'cancelled')
);

-- Optional: simple org-level settings for slot durations (minutes)
create table if not exists organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  default_slot_minutes integer not null default 60,
  buffer_minutes integer not null default 0
);

-- RLS can be added later as needed for auth flows
