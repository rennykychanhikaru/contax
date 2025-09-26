-- Ensure per-org phone numbers are unique across agents (guarded if table missing)
DO $$
BEGIN
  IF to_regclass('public.agent_twilio_settings') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_twilio_unique_org_phone
      ON public.agent_twilio_settings(organization_id, phone_number);
  END IF;
END $$;
