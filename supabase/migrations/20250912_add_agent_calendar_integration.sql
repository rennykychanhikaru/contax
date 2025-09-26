-- Migration: Add agent-specific Google Calendar integration (compatibility shim)
-- Description: Earlier, this migration added calendar columns/tables/functions.
-- To avoid ordering issues on fresh databases, full calendar objects are ensured
-- in 20251214_add_agent_configurations.sql. This file now only adds columns and
-- indexes when the base table already exists.

DO $block$
BEGIN
  IF to_regclass('public.agent_configurations') IS NOT NULL THEN
    -- Add calendar integration columns to agent_configurations table
    ALTER TABLE public.agent_configurations
      ADD COLUMN IF NOT EXISTS google_calendar_access_token_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_refresh_token_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_token_expiry BIGINT,
      ADD COLUMN IF NOT EXISTS google_calendar_email TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
      ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS google_calendar_last_sync TIMESTAMPTZ;

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_google_connected 
      ON public.agent_configurations(google_calendar_connected) 
      WHERE google_calendar_connected = true;

    CREATE INDEX IF NOT EXISTS idx_agent_configurations_google_email 
      ON public.agent_configurations(google_calendar_email) 
      WHERE google_calendar_email IS NOT NULL;
  END IF;
END
$block$;

