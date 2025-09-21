-- Drop organization-level Twilio settings now that agent-level is required (unique version)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'twilio_settings'
  ) THEN
    DROP TABLE public.twilio_settings CASCADE;
  END IF;
END $$;

