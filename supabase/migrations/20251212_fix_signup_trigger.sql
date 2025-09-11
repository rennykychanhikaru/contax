-- Drop the existing trigger that's causing issues
DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
DROP FUNCTION IF EXISTS public.create_default_organization_for_user();

-- Create a simpler function that doesn't auto-create organizations
-- Instead, we'll handle organization creation in the application code
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Just create a basic user profile, no organization
  INSERT INTO public.users (
    id,
    display_name,
    onboarded,
    photo_url,
    created_at
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    false,
    NEW.raw_user_meta_data->>'avatar_url',
    NOW()
  ) ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user profile only
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.create_user_profile();

-- Add a function to create an organization with a custom name
CREATE OR REPLACE FUNCTION public.create_organization_for_user(
  user_id UUID,
  org_name TEXT
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create organization
  INSERT INTO public.organizations (
    id,
    name,
    timezone,
    business_hours,
    settings
  ) VALUES (
    uuid_generate_v4(),
    org_name,
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
    user_id,
    'owner'
  );
  
  -- Mark user as onboarded
  UPDATE public.users 
  SET onboarded = true 
  WHERE id = user_id;
  
  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_organization_for_user TO authenticated;