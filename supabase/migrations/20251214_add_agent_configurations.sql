-- Create agent_configurations table for multi-tenant agent settings
CREATE TABLE IF NOT EXISTS public.agent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Ensure agent calendar integration objects exist (in case earlier migration was skipped)
-- Create a table for additional calendars (future extensibility)
CREATE TABLE IF NOT EXISTS public.agent_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_configurations(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT,
  calendar_email TEXT,
  is_primary BOOLEAN DEFAULT false,
  access_role TEXT,
  background_color TEXT,
  foreground_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, calendar_id)
);

-- Indexes for agent_calendars
CREATE INDEX IF NOT EXISTS idx_agent_calendars_agent_id ON public.agent_calendars(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_calendars_primary ON public.agent_calendars(agent_id, is_primary) WHERE is_primary = true;

-- Enable RLS on agent_calendars
ALTER TABLE public.agent_calendars ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_calendars
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_calendars' AND policyname = 'Users can view calendars for their organization''s agents'
  ) THEN
    CREATE POLICY "Users can view calendars for their organization's agents"
      ON public.agent_calendars
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.agent_configurations ac
          JOIN public.organization_members om ON om.organization_id = ac.organization_id
          WHERE ac.id = agent_calendars.agent_id
          AND om.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_calendars' AND policyname = 'Users can manage calendars for their organization''s agents'
  ) THEN
    CREATE POLICY "Users can manage calendars for their organization's agents"
      ON public.agent_calendars
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.agent_configurations ac
          JOIN public.organization_members om ON om.organization_id = ac.organization_id
          WHERE ac.id = agent_calendars.agent_id
          AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Helper function to encrypt Google tokens with agent-specific key
CREATE OR REPLACE FUNCTION encrypt_google_token(
  token TEXT,
  agent_id UUID
) RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  SELECT encode(digest(agent_id::TEXT || current_setting('app.jwt_secret', true), 'sha256'), 'hex')
  INTO encryption_key;
  RETURN encode(pgp_sym_encrypt(token, encryption_key)::bytea, 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to decrypt Google tokens with agent-specific key
CREATE OR REPLACE FUNCTION decrypt_google_token(
  encrypted_token TEXT,
  agent_id UUID
) RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  IF encrypted_token IS NULL THEN RETURN NULL; END IF;
  SELECT encode(digest(agent_id::TEXT || current_setting('app.jwt_secret', true), 'sha256'), 'hex')
  INTO encryption_key;
  RETURN pgp_sym_decrypt(decode(encrypted_token, 'base64')::bytea, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to store agent Google tokens (encrypted)
CREATE OR REPLACE FUNCTION store_agent_google_tokens(
  p_agent_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER,
  p_email TEXT DEFAULT NULL,
  p_calendar_id TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_expiry BIGINT;
BEGIN
  v_expiry := EXTRACT(EPOCH FROM NOW()) + p_expires_in;
  UPDATE public.agent_configurations
  SET 
    google_calendar_access_token_encrypted = encrypt_google_token(p_access_token, p_agent_id),
    google_calendar_refresh_token_encrypted = encrypt_google_token(p_refresh_token, p_agent_id),
    google_calendar_token_expiry = v_expiry,
    google_calendar_email = p_email,
    google_calendar_id = p_calendar_id,
    google_calendar_connected = true,
    google_calendar_connected_at = NOW(),
    updated_at = NOW()
  WHERE id = p_agent_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retrieve agent Google tokens (decrypted)
CREATE OR REPLACE FUNCTION get_agent_google_tokens(
  p_agent_id UUID
) RETURNS TABLE (
  access_token TEXT,
  refresh_token TEXT,
  token_expiry BIGINT,
  is_expired BOOLEAN,
  calendar_email TEXT,
  calendar_id TEXT,
  connected BOOLEAN
) AS $$
DECLARE
  v_agent RECORD;
  v_current_time BIGINT;
BEGIN
  v_current_time := EXTRACT(EPOCH FROM NOW());
  SELECT * INTO v_agent FROM public.agent_configurations WHERE id = p_agent_id;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT 
    decrypt_google_token(v_agent.google_calendar_access_token_encrypted, p_agent_id),
    decrypt_google_token(v_agent.google_calendar_refresh_token_encrypted, p_agent_id),
    v_agent.google_calendar_token_expiry,
    CASE WHEN v_agent.google_calendar_token_expiry IS NULL THEN true WHEN v_agent.google_calendar_token_expiry <= v_current_time THEN true ELSE false END,
    v_agent.google_calendar_email,
    v_agent.google_calendar_id,
    v_agent.google_calendar_connected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disconnect agent Google Calendar
CREATE OR REPLACE FUNCTION disconnect_agent_google_calendar(
  p_agent_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.agent_configurations
  SET 
    google_calendar_access_token_encrypted = NULL,
    google_calendar_refresh_token_encrypted = NULL,
    google_calendar_token_expiry = NULL,
    google_calendar_email = NULL,
    google_calendar_id = NULL,
    google_calendar_connected = false,
    google_calendar_connected_at = NULL,
    google_calendar_last_sync = NULL,
    updated_at = NOW()
  WHERE id = p_agent_id;
  DELETE FROM public.agent_calendars WHERE agent_id = p_agent_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION encrypt_google_token TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_google_token TO authenticated;
GRANT EXECUTE ON FUNCTION store_agent_google_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_google_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_agent_google_calendar TO authenticated;

-- Backfill FK on calls.agent_id to agent_configurations if not present
DO $$
BEGIN
  IF to_regclass('public.calls') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'calls' AND c.conname = 'fk_calls_agent_id_agent_configurations'
    ) THEN
      -- Only add FK constraint if column exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'agent_id'
      ) THEN
        ALTER TABLE public.calls 
          ADD CONSTRAINT fk_calls_agent_id_agent_configurations 
          FOREIGN KEY (agent_id) REFERENCES public.agent_configurations(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END $$;

-- Backfill FK on agent_twilio_settings.agent_id to agent_configurations if not present
DO $$
BEGIN
  IF to_regclass('public.agent_twilio_settings') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'agent_twilio_settings' AND c.conname = 'fk_agent_twilio_agent_id_configurations'
    ) THEN
      ALTER TABLE public.agent_twilio_settings
        ADD CONSTRAINT fk_agent_twilio_agent_id_configurations
        FOREIGN KEY (agent_id) REFERENCES public.agent_configurations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
