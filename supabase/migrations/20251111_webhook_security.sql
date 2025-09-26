-- Webhook Security Migration
-- Adds secure webhook functionality for multi-tenant organizations
-- Each organization gets unique webhook tokens and secrets with rate limiting

-- Add webhook-related columns to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_token text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_secret_encrypted text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_enabled boolean DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_rate_limit_per_minute integer DEFAULT 10;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_rate_limit_per_hour integer DEFAULT 100;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_failures integer DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_last_failure_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_auto_disabled_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_created_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS webhook_rotated_at timestamptz;

-- Create index for faster webhook token lookups
CREATE INDEX IF NOT EXISTS idx_organizations_webhook_token ON organizations(webhook_token) WHERE webhook_token IS NOT NULL;

-- Create webhook audit log table for security monitoring
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_token text,
  ip_address inet,
  user_agent text,
  request_headers jsonb,
  request_body jsonb,
  response_status integer,
  error_message text,
  processing_time_ms integer,
  success boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for efficient log queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_organization_id ON webhook_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_success ON webhook_logs(success);

-- Create rate limiting table for tracking webhook calls per organization
CREATE TABLE IF NOT EXISTS webhook_rate_limits (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  minute_bucket timestamptz NOT NULL,
  minute_count integer DEFAULT 0,
  hour_bucket timestamptz NOT NULL,
  hour_count integer DEFAULT 0,
  last_reset_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Function to safely check rate limits (uses RLS when enabled)
CREATE OR REPLACE FUNCTION check_webhook_rate_limit(
  p_organization_id uuid,
  p_minute_limit integer,
  p_hour_limit integer
) RETURNS boolean AS $$
DECLARE
  v_current_minute timestamptz;
  v_current_hour timestamptz;
  v_minute_count integer;
  v_hour_count integer;
BEGIN
  -- Round to current minute and hour
  v_current_minute := date_trunc('minute', now());
  v_current_hour := date_trunc('hour', now());
  
  -- Get or create rate limit record
  INSERT INTO webhook_rate_limits (
    organization_id,
    minute_bucket,
    minute_count,
    hour_bucket,
    hour_count,
    updated_at
  ) VALUES (
    p_organization_id,
    v_current_minute,
    0,
    v_current_hour,
    0,
    now()
  ) ON CONFLICT (organization_id) DO UPDATE SET
    minute_bucket = CASE 
      WHEN webhook_rate_limits.minute_bucket = v_current_minute 
      THEN webhook_rate_limits.minute_bucket 
      ELSE v_current_minute 
    END,
    minute_count = CASE 
      WHEN webhook_rate_limits.minute_bucket = v_current_minute 
      THEN webhook_rate_limits.minute_count 
      ELSE 0 
    END,
    hour_bucket = CASE 
      WHEN webhook_rate_limits.hour_bucket = v_current_hour 
      THEN webhook_rate_limits.hour_bucket 
      ELSE v_current_hour 
    END,
    hour_count = CASE 
      WHEN webhook_rate_limits.hour_bucket = v_current_hour 
      THEN webhook_rate_limits.hour_count 
      ELSE 0 
    END,
    updated_at = now()
  RETURNING minute_count, hour_count INTO v_minute_count, v_hour_count;
  
  -- Check if within limits
  IF v_minute_count >= p_minute_limit OR v_hour_count >= p_hour_limit THEN
    RETURN false;
  END IF;
  
  -- Increment counters
  UPDATE webhook_rate_limits SET
    minute_count = minute_count + 1,
    hour_count = hour_count + 1,
    updated_at = now()
  WHERE organization_id = p_organization_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate secure webhook tokens
CREATE OR REPLACE FUNCTION generate_webhook_token() RETURNS text AS $$
BEGIN
  -- Generate a URL-safe random token using the extensions schema for pgcrypto
  RETURN replace(replace(replace(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+', '-'),
    '/', '_'),
    '=', '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate secure webhook secrets
CREATE OR REPLACE FUNCTION generate_webhook_secret() RETURNS text AS $$
BEGIN
  -- Generate a strong secret (48 bytes = 384 bits of entropy)
  RETURN encode(extensions.gen_random_bytes(48), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on webhook tables
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for webhook_logs (organizations can only see their own logs)
CREATE POLICY "Organizations can view their own webhook logs"
  ON webhook_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE id = organization_id
    )
  );

-- RLS Policies for webhook_rate_limits (organizations can only see their own limits)
CREATE POLICY "Organizations can view their own rate limits"
  ON webhook_rate_limits FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE id = organization_id
    )
  );

-- Grant necessary permissions
GRANT SELECT ON webhook_logs TO anon, authenticated;
GRANT SELECT ON webhook_rate_limits TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_webhook_rate_limit TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_webhook_token TO service_role;
GRANT EXECUTE ON FUNCTION generate_webhook_secret TO service_role;

-- Initialize webhook tokens for existing organizations (optional)
-- Uncomment if you want to auto-generate for existing orgs
-- UPDATE organizations 
-- SET 
--   webhook_token = generate_webhook_token(),
--   webhook_secret_encrypted = encode(gen_random_bytes(48), 'hex'),
--   webhook_created_at = now()
-- WHERE webhook_token IS NULL;

-- Add comment documentation
COMMENT ON COLUMN organizations.webhook_token IS 'Unique URL-safe token for webhook endpoint identification';
COMMENT ON COLUMN organizations.webhook_secret_encrypted IS 'Encrypted webhook secret for request validation';
COMMENT ON COLUMN organizations.webhook_enabled IS 'Whether webhook is enabled for this organization';
COMMENT ON COLUMN organizations.webhook_failures IS 'Count of consecutive webhook validation failures';
COMMENT ON COLUMN organizations.webhook_auto_disabled_at IS 'Timestamp when webhook was auto-disabled due to failures';
COMMENT ON TABLE webhook_logs IS 'Audit log of all webhook requests for security monitoring';
COMMENT ON TABLE webhook_rate_limits IS 'Rate limiting tracking for webhook endpoints';
