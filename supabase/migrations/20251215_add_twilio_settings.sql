-- Create twilio_settings table
CREATE TABLE IF NOT EXISTS public.twilio_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.twilio_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for twilio_settings
CREATE POLICY "Users can view their organization's Twilio settings"
  ON public.twilio_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = twilio_settings.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their organization's Twilio settings"
  ON public.twilio_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = twilio_settings.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = twilio_settings.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
    )
  );

-- Create simplified has_permission function (always returns true for now)
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_org_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- For now, just check if user is a member of the organization
  -- In the future, this can be expanded to check specific permissions
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = p_user_id
    AND organization_id = p_org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for audit_logs
CREATE POLICY "Users can view their organization's audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = audit_logs.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);