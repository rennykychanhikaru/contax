-- Migration: Fix Multi-Tenant Signup Issue
-- This migration ensures proper organization setup for users

-- 1. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Users can manage memberships in their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update their organizations" ON public.organizations;

-- 2. Create organization_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS on organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies for organization_members
CREATE POLICY "Users can view their own organization memberships"
  ON public.organization_members
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage memberships in their organizations"
  ON public.organization_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- 3. Create function to automatically create organization for new users
CREATE OR REPLACE FUNCTION public.create_default_organization_for_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  user_name TEXT;
BEGIN
  -- Extract user name from metadata or email
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  
  -- Create a new organization for the user
  INSERT INTO public.organizations (
    id,
    name,
    timezone,
    business_hours,
    settings
  ) VALUES (
    uuid_generate_v4(),
    user_name || '''s Organization',
    'America/New_York',
    jsonb_build_object(
      'monday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
      'tuesday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
      'wednesday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
      'thursday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
      'friday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
      'saturday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', false),
      'sunday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', false)
    ),
    jsonb_build_object(
      'allowBooking', true,
      'bufferTime', 15,
      'maxAdvanceBooking', 30
    )
  ) RETURNING id INTO new_org_id;
  
  -- Add the user as owner of the organization
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    new_org_id,
    NEW.id,
    'owner'
  );
  
  -- Log the creation for debugging
  RAISE NOTICE 'Created organization % for user %', new_org_id, NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger to auto-create organization on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.create_default_organization_for_user();

-- 5. Fix existing users who don't have organizations
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
  user_name TEXT;
BEGIN
  -- Find all users without organizations
  FOR user_record IN 
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = u.id
    )
  LOOP
    -- Extract user name
    user_name := COALESCE(
      user_record.raw_user_meta_data->>'full_name',
      user_record.raw_user_meta_data->>'name',
      split_part(user_record.email, '@', 1)
    );
    
    -- Create organization for existing user
    INSERT INTO public.organizations (
      id,
      name,
      timezone,
      business_hours,
      settings
    ) VALUES (
      uuid_generate_v4(),
      user_name || '''s Organization',
      'America/New_York',
      jsonb_build_object(
        'monday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
        'tuesday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
        'wednesday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
        'thursday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
        'friday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', true),
        'saturday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', false),
        'sunday', jsonb_build_object('start', '09:00', 'end', '17:00', 'enabled', false)
      ),
      jsonb_build_object(
        'allowBooking', true,
        'bufferTime', 15,
        'maxAdvanceBooking', 30
      )
    ) RETURNING id INTO new_org_id;
    
    -- Add user as owner
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role
    ) VALUES (
      new_org_id,
      user_record.id,
      'owner'
    );
    
    RAISE NOTICE 'Created organization % for existing user %', new_org_id, user_record.email;
  END LOOP;
END;
$$;

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON public.organization_members(role);

-- 7. Update the organizations RLS policies to use the membership table
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations"
  ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update their organizations" ON public.organizations;
CREATE POLICY "Owners can update their organizations"
  ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- 8. Grant necessary permissions
GRANT ALL ON public.organization_members TO authenticated;
GRANT ALL ON public.organizations TO authenticated;

-- 9. Add helper function to get user's organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations(user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    om.role,
    om.created_at
  FROM public.organizations o
  INNER JOIN public.organization_members om ON o.id = om.organization_id
  WHERE om.user_id = get_user_organizations.user_id
  ORDER BY om.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Add function to get user's default organization
CREATE OR REPLACE FUNCTION public.get_user_default_organization(user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name
  FROM public.organizations o
  INNER JOIN public.organization_members om ON o.id = om.organization_id
  WHERE om.user_id = get_user_default_organization.user_id
  ORDER BY om.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration complete
-- This ensures every user has at least one organization and new users get one automatically