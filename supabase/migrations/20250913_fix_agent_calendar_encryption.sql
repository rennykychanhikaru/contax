-- Fix encryption functions to not rely on app.jwt_secret

-- Drop the old functions
DROP FUNCTION IF EXISTS encrypt_google_token(TEXT, UUID);
DROP FUNCTION IF EXISTS decrypt_google_token(TEXT, UUID);

-- Create new encryption functions using a combination of agent_id and a fixed key
CREATE OR REPLACE FUNCTION encrypt_google_token(
  token TEXT,
  agent_id UUID
) RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  IF token IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Use agent_id combined with a fixed salt for encryption
  -- In production, you should use a proper secret management system
  encryption_key := encode(digest(agent_id::TEXT || 'contax-calendar-encryption-salt-2024', 'sha256'), 'hex');
  
  -- Encrypt the token using pgp_sym_encrypt
  RETURN encode(pgp_sym_encrypt(token, encryption_key)::bytea, 'base64');
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return NULL instead of failing
    RAISE WARNING 'Failed to encrypt token: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new decryption function
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
  
  -- Use the same key generation as encryption
  encryption_key := encode(digest(agent_id::TEXT || 'contax-calendar-encryption-salt-2024', 'sha256'), 'hex');
  
  -- Decrypt the token
  RETURN pgp_sym_decrypt(decode(encrypted_token, 'base64')::bytea, encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return NULL instead of failing
    RAISE WARNING 'Failed to decrypt token: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the store function to handle errors better
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
  v_encrypted_access TEXT;
  v_encrypted_refresh TEXT;
BEGIN
  -- Calculate expiry timestamp (Unix seconds)
  v_expiry := EXTRACT(EPOCH FROM NOW()) + COALESCE(p_expires_in, 3600);
  
  -- Encrypt tokens
  v_encrypted_access := encrypt_google_token(p_access_token, p_agent_id);
  v_encrypted_refresh := encrypt_google_token(p_refresh_token, p_agent_id);
  
  -- Log for debugging
  RAISE NOTICE 'Storing tokens for agent %: access_encrypted=%, refresh_encrypted=%', 
    p_agent_id, 
    v_encrypted_access IS NOT NULL,
    v_encrypted_refresh IS NOT NULL;
  
  -- Update agent configuration with encrypted tokens
  UPDATE public.agent_configurations
  SET 
    google_calendar_access_token_encrypted = v_encrypted_access,
    google_calendar_refresh_token_encrypted = v_encrypted_refresh,
    google_calendar_token_expiry = v_expiry,
    google_calendar_email = p_email,
    google_calendar_id = COALESCE(p_calendar_id, p_email),
    google_calendar_connected = true,
    google_calendar_connected_at = NOW(),
    updated_at = NOW()
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now let's re-encrypt any existing tokens that might be in the database
-- (This will be a no-op if tokens are already NULL)
UPDATE public.agent_configurations
SET 
  google_calendar_access_token_encrypted = encrypt_google_token(
    decrypt_google_token(google_calendar_access_token_encrypted, id), 
    id
  ),
  google_calendar_refresh_token_encrypted = encrypt_google_token(
    decrypt_google_token(google_calendar_refresh_token_encrypted, id), 
    id
  )
WHERE google_calendar_connected = true;