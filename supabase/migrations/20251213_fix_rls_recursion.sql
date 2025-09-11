-- Fix RLS recursion issue for organization_members table

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can manage memberships in their organizations" ON public.organization_members;

-- Create a simpler, non-recursive policy for managing memberships
CREATE POLICY "Users can manage their own memberships"
  ON public.organization_members
  FOR ALL
  USING (auth.uid() = user_id);

-- Allow service role to bypass RLS (this is already the default, but making it explicit)
-- Service role operations will work regardless of these policies

-- Also ensure organizations table has proper policies without recursion
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update their organizations" ON public.organizations;

-- Simpler policy: users can view organizations they are members of
CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Simpler policy: users with owner role can update their organizations  
CREATE POLICY "Owners can update their organizations"
  ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'owner'
    )
  );

-- Allow authenticated users to insert organizations (they become owner automatically)
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);