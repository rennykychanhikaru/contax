-- Add agent_id to calls for per-agent uniqueness and traceability
DO $$
BEGIN
  IF to_regclass('public.agent_configurations') IS NOT NULL THEN
    -- Add with foreign key when target table exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'agent_id'
    ) THEN
      ALTER TABLE public.calls ADD COLUMN agent_id UUID;
    END IF;
    -- Ensure FK exists
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'calls' AND c.conname = 'fk_calls_agent_id_agent_configurations'
    ) THEN
      ALTER TABLE public.calls 
        ADD CONSTRAINT fk_calls_agent_id_agent_configurations 
        FOREIGN KEY (agent_id) REFERENCES public.agent_configurations(id) ON DELETE SET NULL;
    END IF;
  ELSE
    -- Add the column now; defer FK until agent_configurations exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'agent_id'
    ) THEN
      ALTER TABLE public.calls ADD COLUMN agent_id UUID;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON public.calls(agent_id);

