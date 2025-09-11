-- Fix for existing organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing organizations with slugs
UPDATE public.organizations 
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-z0-9]+', '-', 'g')) || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8)
WHERE slug IS NULL;

-- Create index for slug
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- Update existing tables to be organization-scoped
ALTER TABLE public.twilio_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_tokens ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Migrate existing data to use first organization (temporary fix)
UPDATE public.twilio_settings 
SET organization_id = (SELECT id FROM public.organizations LIMIT 1)
WHERE organization_id IS NULL;

UPDATE public.webhook_tokens 
SET organization_id = (SELECT id FROM public.organizations LIMIT 1)
WHERE organization_id IS NULL;