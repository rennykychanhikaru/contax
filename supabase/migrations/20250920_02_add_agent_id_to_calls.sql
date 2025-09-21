-- Add agent_id to calls for per-agent uniqueness and traceability
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agent_configurations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON public.calls(agent_id);

