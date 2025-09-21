-- Update the function to create default agent to include webhook token generation
-- TODO: The prompt and greeting are currently hardcoded. This should be handled dynamically.
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
    is_default,
    webhook_token
  ) VALUES (
    NEW.id,
    'default',
    'AI Assistant',
    'Your helpful scheduling assistant',
    'You are a helpful scheduling assistant for ' || NEW.name || '. You call prospects that have signed up to a load form on the getconvo.ai website and your job is to schedule a call between them and the team.\n\nYou can do the following:\n- Check calendar availability\n- Schedule meetings\n- Provide information about available time slots\n\nBe professional, friendly, and efficient in your responses.',
    'Hi! Thanks for calling. I''s your AI assistant. How can I help you today?',
    'en-US',
    0.7,
    500,
    'alloy',
    true,
    generate_webhook_token()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing agents to have webhook tokens
UPDATE public.agent_configurations
SET webhook_token = generate_webhook_token()
WHERE webhook_token IS NULL;
