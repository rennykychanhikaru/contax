-- Ensure per-org phone numbers are unique across agents
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_twilio_unique_org_phone
  ON public.agent_twilio_settings(organization_id, phone_number);

