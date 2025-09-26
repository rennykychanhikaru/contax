-- Create call_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agent_configurations(id) ON DELETE SET NULL,
  call_sid TEXT UNIQUE,
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  status TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  duration INTEGER,
  webhook_triggered BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_call_logs_organization_id ON public.call_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON public.call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for call_logs
CREATE POLICY "Users can view their organization's call logs"
  ON public.call_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = call_logs.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert call logs"
  ON public.call_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update call logs"
  ON public.call_logs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
