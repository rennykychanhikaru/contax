-- Add webhook configuration to agent_configurations table
ALTER TABLE public.agent_configurations
ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS webhook_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Create function to generate unique webhook token
CREATE OR REPLACE FUNCTION generate_webhook_token()
RETURNS TEXT AS $$
DECLARE
  token TEXT;
  done BOOLEAN DEFAULT false;
BEGIN
  WHILE NOT done LOOP
    -- Generate a random token (alphanumeric, 32 chars)
    token := encode(gen_random_bytes(16), 'hex');
    
    -- Check if token already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.agent_configurations 
      WHERE webhook_token = token
    ) THEN
      done := true;
    END IF;
  END LOOP;
  
  RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Update existing agents to have webhook tokens
UPDATE public.agent_configurations
SET webhook_token = generate_webhook_token()
WHERE webhook_token IS NULL;