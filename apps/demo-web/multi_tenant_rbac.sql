-- Multi-tenant RBAC Schema for Contax
-- This migration sets up organizations, roles, permissions, and agent configurations

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations (Teams)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles per organization (flexible, customizable)
CREATE TABLE IF NOT EXISTS public.organization_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Organization members with roles
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.organization_roles(id),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Agent configurations per organization
CREATE TABLE IF NOT EXISTS public.agent_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  greeting_message TEXT NOT NULL,
  voice_settings JSONB DEFAULT '{"language": "en-US", "voice": "default"}',
  tools_enabled JSONB DEFAULT '["calendar", "scheduling"]',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Audit log for tracking changes
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX idx_agent_configurations_org_id ON public.agent_configurations(organization_id);
CREATE INDEX idx_audit_logs_org_id ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_organizations_slug ON public.organizations(slug);

-- Function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_org_id UUID,
  p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  -- Get user's permissions from their role
  SELECT r.permissions INTO v_permissions
  FROM public.organization_members m
  JOIN public.organization_roles r ON m.role_id = r.id
  WHERE m.user_id = p_user_id 
    AND m.organization_id = p_org_id;
  
  -- Check if user has wildcard permission (full access)
  IF v_permissions ? '*' THEN
    RETURN TRUE;
  END IF;
  
  -- Check for specific permission
  RETURN v_permissions ? p_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id UUID)
RETURNS UUID AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE user_id = p_user_id 
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to create default roles when organization is created
CREATE OR REPLACE FUNCTION public.create_default_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Owner role (full access)
  INSERT INTO public.organization_roles (organization_id, name, description, permissions, is_system)
  VALUES (
    NEW.id,
    'owner',
    'Full access to all organization resources',
    '["*"]'::jsonb,
    true
  );
  
  -- Admin role
  INSERT INTO public.organization_roles (organization_id, name, description, permissions, is_system)
  VALUES (
    NEW.id,
    'admin',
    'Can manage agents, settings, and members',
    '[
      "agents.create", "agents.read", "agents.update", "agents.delete",
      "members.invite", "members.read", "members.update", "members.remove",
      "settings.read", "settings.update",
      "webhooks.create", "webhooks.read", "webhooks.update", "webhooks.delete",
      "calendar.read", "calendar.write",
      "twilio.read", "twilio.write"
    ]'::jsonb,
    true
  );
  
  -- Editor role
  INSERT INTO public.organization_roles (organization_id, name, description, permissions, is_system)
  VALUES (
    NEW.id,
    'editor',
    'Can modify agents and settings',
    '[
      "agents.read", "agents.update",
      "settings.read", "settings.update",
      "calendar.read", "calendar.write",
      "webhooks.read",
      "twilio.read"
    ]'::jsonb,
    true
  );
  
  -- Viewer role
  INSERT INTO public.organization_roles (organization_id, name, description, permissions, is_system)
  VALUES (
    NEW.id,
    'viewer',
    'Read-only access',
    '[
      "agents.read",
      "members.read",
      "settings.read",
      "calendar.read",
      "webhooks.read",
      "twilio.read"
    ]'::jsonb,
    true
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default roles
CREATE TRIGGER create_org_default_roles
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_roles();

-- Function to create organization and assign owner on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_owner_role_id UUID;
  v_org_name TEXT;
  v_org_slug TEXT;
BEGIN
  -- Generate organization name and slug from user email
  v_org_name := COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Organization'
  );
  
  -- Generate unique slug
  v_org_slug := LOWER(REGEXP_REPLACE(v_org_name, '[^a-z0-9]+', '-', 'g'));
  v_org_slug := v_org_slug || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
  
  -- Create organization
  INSERT INTO public.organizations (name, slug)
  VALUES (v_org_name, v_org_slug)
  RETURNING id INTO v_org_id;
  
  -- Get owner role ID
  SELECT id INTO v_owner_role_id
  FROM public.organization_roles
  WHERE organization_id = v_org_id AND name = 'owner';
  
  -- Add user as owner
  INSERT INTO public.organization_members (organization_id, user_id, role_id)
  VALUES (v_org_id, NEW.id, v_owner_role_id);
  
  -- Create default agent configuration
  INSERT INTO public.agent_configurations (
    organization_id,
    name,
    description,
    system_prompt,
    greeting_message,
    is_default,
    created_by
  ) VALUES (
    v_org_id,
    'Default Assistant',
    'Your friendly AI scheduling assistant',
    'You are a friendly receptionist. Greet the caller, ask if they want to schedule an appointment, collect a preferred date/time, and confirm. Keep responses concise.',
    'Hi! Thanks for calling. I''m your AI receptionist. I''d be happy to help you schedule an appointment. What date and time works best for you?',
    true,
    NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their organizations with permission"
  ON public.organizations FOR UPDATE
  USING (
    public.has_permission(auth.uid(), id, 'settings.update')
  );

-- RLS Policies for organization_roles
CREATE POLICY "Users can view roles in their organizations"
  ON public.organization_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_roles.organization_id 
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage roles with permission"
  ON public.organization_roles FOR ALL
  USING (
    public.has_permission(auth.uid(), organization_id, 'roles.manage')
  );

-- RLS Policies for organization_members
CREATE POLICY "Users can view members with permission"
  ON public.organization_members FOR SELECT
  USING (
    public.has_permission(auth.uid(), organization_id, 'members.read')
  );

CREATE POLICY "Users can invite members with permission"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    public.has_permission(auth.uid(), organization_id, 'members.invite')
  );

CREATE POLICY "Users can update members with permission"
  ON public.organization_members FOR UPDATE
  USING (
    public.has_permission(auth.uid(), organization_id, 'members.update')
  );

CREATE POLICY "Users can remove members with permission"
  ON public.organization_members FOR DELETE
  USING (
    public.has_permission(auth.uid(), organization_id, 'members.remove')
  );

-- RLS Policies for agent_configurations
CREATE POLICY "Users can view agents with permission"
  ON public.agent_configurations FOR SELECT
  USING (
    public.has_permission(auth.uid(), organization_id, 'agents.read')
  );

CREATE POLICY "Users can create agents with permission"
  ON public.agent_configurations FOR INSERT
  WITH CHECK (
    public.has_permission(auth.uid(), organization_id, 'agents.create')
  );

CREATE POLICY "Users can update agents with permission"
  ON public.agent_configurations FOR UPDATE
  USING (
    public.has_permission(auth.uid(), organization_id, 'agents.update')
  );

CREATE POLICY "Users can delete agents with permission"
  ON public.agent_configurations FOR DELETE
  USING (
    public.has_permission(auth.uid(), organization_id, 'agents.delete')
  );

-- RLS Policies for audit_logs
CREATE POLICY "Users can view audit logs with permission"
  ON public.audit_logs FOR SELECT
  USING (
    public.has_permission(auth.uid(), organization_id, 'audit.read')
  );

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Update existing tables to be organization-scoped
ALTER TABLE public.twilio_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_tokens ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Update RLS for existing tables
CREATE POLICY "Users can manage Twilio settings with permission"
  ON public.twilio_settings FOR ALL
  USING (
    public.has_permission(auth.uid(), organization_id, 'twilio.write')
  );

CREATE POLICY "Users can manage webhooks with permission"
  ON public.webhook_tokens FOR ALL
  USING (
    public.has_permission(auth.uid(), organization_id, 'webhooks.write')
  );