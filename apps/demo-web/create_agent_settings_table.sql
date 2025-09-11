-- Create agent_settings table for storing AI agent configuration per organization
CREATE TABLE IF NOT EXISTS agent_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'default',
    display_name TEXT DEFAULT 'AI Assistant',
    prompt TEXT NOT NULL,
    greeting TEXT,
    language VARCHAR(10) DEFAULT 'en',
    voice_model VARCHAR(50),
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 150,
    phone_call_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    sms_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(organization_id, name)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_settings_organization_id ON agent_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_settings_name ON agent_settings(name);

-- Enable RLS
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view agent settings for their organization
CREATE POLICY "Users can view their organization's agent settings" ON agent_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = agent_settings.organization_id
            AND om.user_id = auth.uid()
        )
    );

-- RLS Policy: Users with appropriate permissions can insert agent settings
CREATE POLICY "Users can insert agent settings with permission" ON agent_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN organization_roles r ON r.id = om.role_id
            WHERE om.organization_id = agent_settings.organization_id
            AND om.user_id = auth.uid()
            AND r.name = 'owner'
        )
    );

-- RLS Policy: Users with appropriate permissions can update agent settings
CREATE POLICY "Users can update agent settings with permission" ON agent_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN organization_roles r ON r.id = om.role_id
            WHERE om.organization_id = agent_settings.organization_id
            AND om.user_id = auth.uid()
            AND r.name = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN organization_roles r ON r.id = om.role_id
            WHERE om.organization_id = agent_settings.organization_id
            AND om.user_id = auth.uid()
            AND r.name = 'owner'
        )
    );

-- RLS Policy: Users with appropriate permissions can delete agent settings
CREATE POLICY "Users can delete agent settings with permission" ON agent_settings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN organization_roles r ON r.id = om.role_id
            WHERE om.organization_id = agent_settings.organization_id
            AND om.user_id = auth.uid()
            AND r.name = 'owner'
        )
    );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_agent_settings_timestamp
    BEFORE UPDATE ON agent_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_settings_updated_at();