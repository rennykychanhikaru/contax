-- Create agent_configurations table for multi-tenant agent settings
CREATE TABLE IF NOT EXISTS public.agent_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'default',
  display_name TEXT,
  description TEXT,
  prompt TEXT NOT NULL,
  greeting TEXT NOT NULL,
  language TEXT DEFAULT 'en-US',
  temperature NUMERIC(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens INTEGER DEFAULT 500,
  voice TEXT DEFAULT 'alloy',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Enable RLS
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for agent_configurations
CREATE POLICY "Users can view their organization's agents"
  ON public.agent_configurations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_configurations.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create agents for their organization"
  ON public.agent_configurations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_configurations.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their organization's agents"
  ON public.agent_configurations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_configurations.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their organization's agents"
  ON public.agent_configurations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_configurations.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'owner'
    )
  );

-- Create indexes for performance
CREATE INDEX idx_agent_configurations_org_id ON public.agent_configurations(organization_id);
CREATE INDEX idx_agent_configurations_org_name ON public.agent_configurations(organization_id, name);

-- Function to create default agent for new organizations
CREATE OR REPLACE FUNCTION public.create_default_agent_for_organization()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.agent_configurations (
    organization_id,
    name,
    display_name,
    description,
    prompt,
    greeting,
    language,
    temperature,
    max_tokens,
    voice,
    is_default
  ) VALUES (
    NEW.id,
    'default',
    'AI Assistant',
    'Your helpful scheduling assistant',
    'You are a helpful scheduling assistant for ' || NEW.name || '. You call prospects that have signed up to a load form on the getconvo.ai website and your job is to schedule a call between them and the team.

You can do the following:
- Check calendar availability
- Schedule meetings
- Provide information about available time slots

Be professional, friendly, and efficient in your responses.',
    'Hi! Thanks for calling. I''m your AI assistant. How can I help you today?',
    'en-US',
    0.7,
    500,
    'alloy',
    true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to add default agent when organization is created
CREATE TRIGGER on_organization_created_add_agent
  AFTER INSERT ON public.organizations
  FOR EACH ROW 
  EXECUTE FUNCTION public.create_default_agent_for_organization();

-- Add default agents for existing organizations
INSERT INTO public.agent_configurations (
  organization_id,
  name,
  display_name,
  description,
  prompt,
  greeting,
  is_default
)
SELECT 
  o.id,
  'default',
  'AI Assistant',
  'Your helpful scheduling assistant',
  'You are a helpful scheduling assistant for ' || o.name || '. You call prospects that have signed up to a load form on the getconvo.ai website and your job is to schedule a call between them and the team.

You can do the following:
- Check calendar availability
- Schedule meetings
- Provide information about available time slots

Be professional, friendly, and efficient in your responses.',
  'Hi! Thanks for calling. I''m your AI assistant. How can I help you today?',
  true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_configurations ac
  WHERE ac.organization_id = o.id
  AND ac.name = 'default'
);

-- Grant permissions
GRANT ALL ON public.agent_configurations TO authenticated;