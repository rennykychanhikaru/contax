-- Compatibility shim: only update tokens when prerequisites exist.
DO $$
BEGIN
  -- Run only if agent_configurations table exists, the webhook_token column exists,
  -- and the generate_webhook_token() function is available.
  IF to_regclass('public.agent_configurations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns 
       WHERE table_schema='public' AND table_name='agent_configurations' AND column_name='webhook_token'
     )
     AND to_regprocedure('generate_webhook_token()') IS NOT NULL THEN
    UPDATE public.agent_configurations
    SET webhook_token = generate_webhook_token()
    WHERE webhook_token IS NULL;
  END IF;
END $$;
