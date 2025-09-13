-- Migration: Add agent-specific Google Calendar integration
-- Description: Enables each agent to have its own calendar integration
-- instead of account-level integration

-- Add calendar integration columns to agent_configurations table
ALTER TABLE public.agent_configurations
ADD COLUMN IF NOT EXISTS google_calendar_access_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_token_expiry BIGINT,
ADD COLUMN IF NOT EXISTS google_calendar_email TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS google_calendar_last_sync TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_configurations_google_connected 
ON public.agent_configurations(google_calendar_connected) 
WHERE google_calendar_connected = true;

CREATE INDEX IF NOT EXISTS idx_agent_configurations_google_email 
ON public.agent_configurations(google_calendar_email) 
WHERE google_calendar_email IS NOT NULL;

-- Create a table for additional calendars (future extensibility)
CREATE TABLE IF NOT EXISTS public.agent_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.agent_configurations(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT,
  calendar_email TEXT,
  is_primary BOOLEAN DEFAULT false,
  access_role TEXT, -- owner, reader, writer, freeBusyReader
  background_color TEXT,
  foreground_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, calendar_id)
);

-- Create indexes for agent_calendars
CREATE INDEX IF NOT EXISTS idx_agent_calendars_agent_id ON public.agent_calendars(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_calendars_primary ON public.agent_calendars(agent_id, is_primary) WHERE is_primary = true;

-- Enable RLS on agent_calendars
ALTER TABLE public.agent_calendars ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_calendars (inherit from agent_configurations)
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

-- Helper function to encrypt Google tokens with agent-specific key
CREATE OR REPLACE FUNCTION encrypt_google_token(
  token TEXT,
  agent_id UUID
) RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Use agent_id + JWT secret as encryption key
  SELECT encode(digest(agent_id::TEXT || current_setting('app.jwt_secret', true), 'sha256'), 'hex')
  INTO encryption_key;
  
  -- Encrypt the token using pgp_sym_encrypt
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
  IF encrypted_token IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Use agent_id + JWT secret as encryption key
  SELECT encode(digest(agent_id::TEXT || current_setting('app.jwt_secret', true), 'sha256'), 'hex')
  INTO encryption_key;
  
  -- Decrypt the token using pgp_sym_decrypt
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
  -- Calculate expiry timestamp (Unix seconds)
  v_expiry := EXTRACT(EPOCH FROM NOW()) + p_expires_in;
  
  -- Update agent configuration with encrypted tokens
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
  -- Get current Unix timestamp
  v_current_time := EXTRACT(EPOCH FROM NOW());
  
  -- Fetch agent configuration
  SELECT * INTO v_agent
  FROM public.agent_configurations
  WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Return decrypted tokens and metadata
  RETURN QUERY
  SELECT 
    decrypt_google_token(v_agent.google_calendar_access_token_encrypted, p_agent_id),
    decrypt_google_token(v_agent.google_calendar_refresh_token_encrypted, p_agent_id),
    v_agent.google_calendar_token_expiry,
    CASE 
      WHEN v_agent.google_calendar_token_expiry IS NULL THEN true
      WHEN v_agent.google_calendar_token_expiry <= v_current_time THEN true
      ELSE false
    END,
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
  -- Clear all calendar-related fields
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
  
  -- Also delete any associated calendars
  DELETE FROM public.agent_calendars WHERE agent_id = p_agent_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION encrypt_google_token TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_google_token TO authenticated;
GRANT EXECUTE ON FUNCTION store_agent_google_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_google_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_agent_google_calendar TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN public.agent_configurations.google_calendar_access_token_encrypted IS 'Encrypted Google Calendar access token for this agent';
COMMENT ON COLUMN public.agent_configurations.google_calendar_refresh_token_encrypted IS 'Encrypted Google Calendar refresh token for this agent';
COMMENT ON COLUMN public.agent_configurations.google_calendar_token_expiry IS 'Unix timestamp (seconds) when the access token expires';
COMMENT ON COLUMN public.agent_configurations.google_calendar_email IS 'Email address of the connected Google account';
COMMENT ON COLUMN public.agent_configurations.google_calendar_id IS 'Primary Google Calendar ID for this agent';
COMMENT ON COLUMN public.agent_configurations.google_calendar_connected IS 'Whether this agent has an active Google Calendar connection';
COMMENT ON COLUMN public.agent_configurations.google_calendar_connected_at IS 'When the Google Calendar was connected';
COMMENT ON COLUMN public.agent_configurations.google_calendar_last_sync IS 'Last time calendar data was synchronized';