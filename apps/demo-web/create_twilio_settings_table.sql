-- Create twilio_settings table for storing Twilio configuration per organization
CREATE TABLE IF NOT EXISTS twilio_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_sid TEXT NOT NULL,
    auth_token TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_twilio_settings_organization_id ON twilio_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_twilio_settings_user_id ON twilio_settings(user_id);

-- Enable RLS
ALTER TABLE twilio_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view twilio settings for their organization
CREATE POLICY "Users can view their organization's twilio settings" ON twilio_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = twilio_settings.organization_id
            AND om.user_id = auth.uid()
        )
    );

-- RLS Policy: Users with twilio.write permission can insert twilio settings
CREATE POLICY "Users can insert twilio settings with permission" ON twilio_settings
    FOR INSERT
    WITH CHECK (
        has_permission(auth.uid(), organization_id, 'twilio.write')
    );

-- RLS Policy: Users with twilio.write permission can update twilio settings
CREATE POLICY "Users can update twilio settings with permission" ON twilio_settings
    FOR UPDATE
    USING (
        has_permission(auth.uid(), organization_id, 'twilio.write')
    )
    WITH CHECK (
        has_permission(auth.uid(), organization_id, 'twilio.write')
    );

-- RLS Policy: Users with twilio.write permission can delete twilio settings
CREATE POLICY "Users can delete twilio settings with permission" ON twilio_settings
    FOR DELETE
    USING (
        has_permission(auth.uid(), organization_id, 'twilio.write')
    );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_twilio_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_twilio_settings_timestamp
    BEFORE UPDATE ON twilio_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_twilio_settings_updated_at();