-- ElevenLabs premium voice foundation schema
-- Introduces organization-scoped feature flag overrides, subscription add-ons,
-- voice usage logging, and extended agent configuration to support premium voices.

--------------------------------------------------------------------------------
-- 1. Ensure feature flag overrides support metadata for org-level flags
--------------------------------------------------------------------------------

ALTER TABLE public.feature_flag_overrides
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

--------------------------------------------------------------------------------
-- 2. Seed ElevenLabs flag if missing
--------------------------------------------------------------------------------

INSERT INTO public.feature_flags (flag_key, flag_name, description, is_enabled)
SELECT 'elevenlabs_voices', 'ElevenLabs Premium Voices', 'Enables premium ElevenLabs voice provider', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE flag_key = 'elevenlabs_voices'
);

--------------------------------------------------------------------------------
-- 3. Organization feature flag overrides
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, feature_flag_id)
);

ALTER TABLE public.organization_feature_flags ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_organization_feature_flags_updated_at ON public.organization_feature_flags;
CREATE TRIGGER set_organization_feature_flags_updated_at
BEFORE UPDATE ON public.organization_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_org_feature_flags_org
  ON public.organization_feature_flags (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_feature_flags_flag
  ON public.organization_feature_flags (feature_flag_id);

--------------------------------------------------------------------------------
-- 4. Subscription add-ons
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  billing_status TEXT CHECK (billing_status IN ('paid', 'trial', 'overdue')),
  trial_ends_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_subscription_addons_updated_at ON public.subscription_addons;
CREATE TRIGGER set_subscription_addons_updated_at
BEFORE UPDATE ON public.subscription_addons
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_subscription_addons_org
  ON public.subscription_addons (organization_id, addon_type);

--------------------------------------------------------------------------------
-- 5. Voice usage logging
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agent_configurations(id) ON DELETE SET NULL,
  voice_provider TEXT NOT NULL CHECK (voice_provider IN ('openai', 'elevenlabs')),
  voice_id TEXT,
  session_id TEXT,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  character_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.voice_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_voice_usage_org_date
  ON public.voice_usage_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_usage_provider
  ON public.voice_usage_logs (voice_provider, created_at DESC);

--------------------------------------------------------------------------------
-- 6. Extend agent configuration for voice providers
--------------------------------------------------------------------------------

ALTER TABLE public.agent_configurations
  ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'openai' CHECK (voice_provider IN ('openai', 'elevenlabs')),
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_settings JSONB DEFAULT '{"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_fallback_enabled BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_agent_voice_provider
  ON public.agent_configurations (voice_provider, organization_id);

--------------------------------------------------------------------------------
-- 7. Row level security policies
--------------------------------------------------------------------------------

-- Organization feature flags: allow members to manage their organization's overrides.
DROP POLICY IF EXISTS "Members manage org feature flags" ON public.organization_feature_flags;
CREATE POLICY "Members manage org feature flags"
  ON public.organization_feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = organization_feature_flags.organization_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = organization_feature_flags.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Subscription add-ons: members can manage add-ons for their organization.
DROP POLICY IF EXISTS "Members manage subscription addons" ON public.subscription_addons;
CREATE POLICY "Members manage subscription addons"
  ON public.subscription_addons
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = subscription_addons.organization_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = subscription_addons.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Voice usage logs: members can view usage for their organization.
DROP POLICY IF EXISTS "Members view voice usage" ON public.voice_usage_logs;
CREATE POLICY "Members view voice usage"
  ON public.voice_usage_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = voice_usage_logs.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Ensure service role retains ability to log voice usage.
DROP POLICY IF EXISTS "Service role logs voice usage" ON public.voice_usage_logs;
CREATE POLICY "Service role logs voice usage"
  ON public.voice_usage_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
