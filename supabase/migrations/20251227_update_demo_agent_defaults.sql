-- Add fields to distinguish demo agents from production agents
ALTER TABLE public.agent_configurations 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

ALTER TABLE public.agent_configurations 
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'custom' CHECK (agent_type IN ('demo', 'custom', 'template'));

-- Update existing default agents to be demo agents (if any exist)
DO $$
BEGIN
  UPDATE public.agent_configurations ac
  SET 
    is_demo = true,
    agent_type = 'demo',
    display_name = 'Contax Demo Agent',
    description = 'This is your demo agent to show you what a phone call would look like on Contax',
    prompt = 'You are the Contax Demo Agent for ' || o.name || '. This is a demonstration of Contax''s voice AI capabilities.

You are demonstrating what a professional voice agent can do for scheduling and customer interactions. 

Key capabilities to showcase:
- Natural conversation flow
- Calendar availability checking
- Meeting scheduling
- Professional tone and manner
- Multi-language support

When someone calls, introduce yourself as the demo agent for their organization and explain that this is a demonstration of Contax capabilities. Be friendly, professional, and showcase the best of what Contax can offer.

Remember to:
- Mention this is a demo to set expectations
- Highlight the seamless scheduling capabilities
- Be enthusiastic about showing what''s possible with Contax
- Offer to schedule a demo meeting as an example',
    greeting = 'Hi! Welcome to Contax. I''m your demo AI assistant showing you what''s possible with voice-powered scheduling. This is a demonstration call. How can I help you explore our capabilities today?'
  FROM public.organizations o
  WHERE ac.organization_id = o.id 
    AND ac.name = 'default' 
    AND ac.is_default = true;
END $$;

-- Drop and recreate the trigger function with better demo defaults
DROP TRIGGER IF EXISTS on_organization_created_add_agent ON public.organizations;
DROP FUNCTION IF EXISTS public.create_default_agent_for_organization();

CREATE OR REPLACE FUNCTION public.create_default_agent_for_organization()
RETURNS TRIGGER AS $$
BEGIN
  -- Create demo agent for new organization
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
    is_default,
    is_demo,
    agent_type
  ) VALUES (
    NEW.id,
    'default',
    'Contax Demo Agent',
    'This is your demo agent to show you what a phone call would look like on Contax',
    'You are the Contax Demo Agent for ' || NEW.name || '. This is a demonstration of Contax''s voice AI capabilities.

You are demonstrating what a professional voice agent can do for scheduling and customer interactions. 

Key capabilities to showcase:
- Natural conversation flow
- Calendar availability checking
- Meeting scheduling
- Professional tone and manner
- Multi-language support

When someone calls, introduce yourself as the demo agent for their organization and explain that this is a demonstration of Contax capabilities. Be friendly, professional, and showcase the best of what Contax can offer.

Remember to:
- Mention this is a demo to set expectations
- Highlight the seamless scheduling capabilities
- Be enthusiastic about showing what''s possible with Contax
- Offer to schedule a demo meeting as an example',
    'Hi! Welcome to Contax. I''m your demo AI assistant for ' || NEW.name || ', showing you what''s possible with voice-powered scheduling. This is a demonstration call. How can I help you explore our capabilities today?',
    'en-US',
    0.7,
    500,
    'alloy',
    true,
    true,
    'demo'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_organization_created_add_agent
  AFTER INSERT ON public.organizations
  FOR EACH ROW 
  EXECUTE FUNCTION public.create_default_agent_for_organization();

-- Create view for easy access to demo agents
CREATE OR REPLACE VIEW public.organization_demo_agents AS
SELECT 
  ac.*,
  o.name as organization_name,
  o.phone_number as organization_phone,
  o.timezone as organization_timezone
FROM public.agent_configurations ac
JOIN public.organizations o ON o.id = ac.organization_id
WHERE ac.is_demo = true AND ac.is_default = true;

-- Grant permissions on the view
GRANT SELECT ON public.organization_demo_agents TO authenticated;

-- Add helpful comment
COMMENT ON TABLE public.agent_configurations IS 'Stores AI agent configurations for each organization. Demo agents are automatically created for new organizations.';
COMMENT ON COLUMN public.agent_configurations.is_demo IS 'Whether this is a demo agent (true) or production agent (false)';
COMMENT ON COLUMN public.agent_configurations.agent_type IS 'Type of agent: demo, custom, or template';