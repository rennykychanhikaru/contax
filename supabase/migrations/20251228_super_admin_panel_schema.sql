-- Super Admin Panel foundational schema (accounts, feature flags, overrides, audit log, memberships)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Accounts table with super admin + status fields
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth.users(id),
  disabled_reason TEXT
);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_id_fkey'
      AND conrelid = 'public.accounts'::regclass
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_id_fkey
      FOREIGN KEY (id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- Backfill accounts from existing organizations
INSERT INTO public.accounts (id, name, created_at, updated_at)
SELECT
  o.id,
  o.name,
  COALESCE(o.created_at, NOW()),
  COALESCE(o.updated_at, NOW())
FROM public.organizations o
ON CONFLICT (id) DO NOTHING;

-- Helper to touch updated_at columns
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_accounts_updated_at ON public.accounts;
CREATE TRIGGER set_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Keep accounts in sync with organizations table
CREATE OR REPLACE FUNCTION public.sync_accounts_from_organizations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.accounts (id, name, created_at, updated_at)
    VALUES (
      NEW.id,
      NEW.name,
      COALESCE(NEW.created_at, NOW()),
      COALESCE(NEW.updated_at, NOW())
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.accounts
    SET name = NEW.name
    WHERE id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.accounts
    WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organizations_sync_accounts_insert ON public.organizations;
CREATE TRIGGER organizations_sync_accounts_insert
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.sync_accounts_from_organizations();

DROP TRIGGER IF EXISTS organizations_sync_accounts_update ON public.organizations;
CREATE TRIGGER organizations_sync_accounts_update
AFTER UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.sync_accounts_from_organizations();

DROP TRIGGER IF EXISTS organizations_sync_accounts_delete ON public.organizations;
CREATE TRIGGER organizations_sync_accounts_delete
AFTER DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.sync_accounts_from_organizations();

-- Feature flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  flag_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  target_type TEXT NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'account', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER set_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Feature flag overrides table
CREATE TABLE IF NOT EXISTS public.feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flag_overrides_target_check CHECK (
    (account_id IS NOT NULL AND user_id IS NULL) OR
    (account_id IS NULL AND user_id IS NOT NULL)
  )
);

ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_feature_flag_overrides_updated_at ON public.feature_flag_overrides;
CREATE TRIGGER set_feature_flag_overrides_updated_at
BEFORE UPDATE ON public.feature_flag_overrides
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_overrides_account_unique
  ON public.feature_flag_overrides (feature_flag_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flag_overrides_user_unique
  ON public.feature_flag_overrides (feature_flag_id, user_id)
  WHERE user_id IS NOT NULL;

-- Admin audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_flag ON public.feature_flag_overrides(feature_flag_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_overrides_account ON public.feature_flag_overrides(account_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Account membership mapping table
CREATE TABLE IF NOT EXISTS public.account_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_user_account ON public.account_user(account_id);
CREATE INDEX IF NOT EXISTS idx_account_user_user ON public.account_user(user_id);

DROP TRIGGER IF EXISTS set_account_user_updated_at ON public.account_user;
CREATE TRIGGER set_account_user_updated_at
BEFORE UPDATE ON public.account_user
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill account_user from existing organization memberships
INSERT INTO public.account_user (account_id, user_id, email, role, created_at, updated_at)
SELECT
  om.organization_id AS account_id,
  om.user_id,
  au.email,
  om.role,
  COALESCE(om.created_at, NOW()),
  COALESCE(om.updated_at, NOW())
FROM public.organization_members om
JOIN auth.users au ON au.id = om.user_id
JOIN public.accounts acc ON acc.id = om.organization_id
ON CONFLICT (account_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      email = EXCLUDED.email,
      updated_at = NOW();

-- Trigger to keep account_user in sync with organization_members
CREATE OR REPLACE FUNCTION public.sync_account_user_from_org_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
    IF user_email IS NULL THEN
      user_email := '';
    END IF;

    INSERT INTO public.account_user (account_id, user_id, email, role, created_at, updated_at)
    VALUES (
      NEW.organization_id,
      NEW.user_id,
      user_email,
      NEW.role,
      COALESCE(NEW.created_at, NOW()),
      COALESCE(NEW.updated_at, NOW())
    )
    ON CONFLICT (account_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          email = EXCLUDED.email,
          updated_at = NOW();
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
    IF user_email IS NULL THEN
      user_email := '';
    END IF;

    IF NEW.organization_id <> OLD.organization_id OR NEW.user_id <> OLD.user_id THEN
      DELETE FROM public.account_user
      WHERE account_id = OLD.organization_id AND user_id = OLD.user_id;

      INSERT INTO public.account_user (account_id, user_id, email, role, created_at, updated_at)
      VALUES (
        NEW.organization_id,
        NEW.user_id,
        user_email,
        NEW.role,
        COALESCE(NEW.created_at, NOW()),
        NOW()
      )
      ON CONFLICT (account_id, user_id) DO UPDATE
        SET role = EXCLUDED.role,
            email = EXCLUDED.email,
            updated_at = NOW();
    ELSE
      UPDATE public.account_user
      SET role = NEW.role,
          email = user_email,
          updated_at = NOW()
      WHERE account_id = NEW.organization_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.account_user
    WHERE account_id = OLD.organization_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS organization_members_sync_account_user_insert ON public.organization_members;
CREATE TRIGGER organization_members_sync_account_user_insert
AFTER INSERT ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_account_user_from_org_members();

DROP TRIGGER IF EXISTS organization_members_sync_account_user_update ON public.organization_members;
CREATE TRIGGER organization_members_sync_account_user_update
AFTER UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_account_user_from_org_members();

DROP TRIGGER IF EXISTS organization_members_sync_account_user_delete ON public.organization_members;
CREATE TRIGGER organization_members_sync_account_user_delete
AFTER DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_account_user_from_org_members();

-- Indexes for account lookups
CREATE INDEX IF NOT EXISTS idx_accounts_super_admin ON public.accounts(is_super_admin) WHERE is_super_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_accounts_disabled ON public.accounts(is_disabled) WHERE is_disabled = TRUE;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies as per PRD
DROP POLICY IF EXISTS "Super admins can view all accounts" ON public.accounts;
CREATE POLICY "Super admins can view all accounts"
  ON public.accounts FOR SELECT
  USING (
    is_super_admin = TRUE
    OR id IN (
      SELECT account_id FROM public.account_user WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Super admins can manage accounts" ON public.accounts;
CREATE POLICY "Super admins can manage accounts"
  ON public.accounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins can manage feature flags" ON public.feature_flags;
CREATE POLICY "Super admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins can manage feature flag overrides" ON public.feature_flag_overrides;
CREATE POLICY "Super admins can manage feature flag overrides"
  ON public.feature_flag_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Super admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

DROP POLICY IF EXISTS "Super admins can insert audit log" ON public.admin_audit_log;
CREATE POLICY "Super admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

-- Helper functions for super admin logic
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.accounts a
    INNER JOIN public.account_user au ON a.id = au.account_id
    WHERE au.user_id = p_user_id AND a.is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  flag_key TEXT,
  check_account_id UUID DEFAULT NULL,
  check_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  flag_record RECORD;
  override_enabled BOOLEAN;
BEGIN
  SELECT * INTO flag_record FROM public.feature_flags WHERE feature_flags.flag_key = is_feature_enabled.flag_key;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF check_account_id IS NOT NULL THEN
    SELECT is_enabled INTO override_enabled
    FROM public.feature_flag_overrides
    WHERE feature_flag_id = flag_record.id AND account_id = check_account_id;

    IF FOUND THEN
      RETURN override_enabled;
    END IF;
  END IF;

  IF check_user_id IS NOT NULL THEN
    SELECT is_enabled INTO override_enabled
    FROM public.feature_flag_overrides
    WHERE feature_flag_id = flag_record.id AND user_id = check_user_id;

    IF FOUND THEN
      RETURN override_enabled;
    END IF;
  END IF;

  RETURN flag_record.is_enabled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.disable_account(
  target_account_id UUID,
  reason TEXT,
  admin_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_super_admin(admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: User is not a super admin';
  END IF;

  UPDATE public.accounts
  SET
    is_disabled = TRUE,
    disabled_at = NOW(),
    disabled_by = admin_user_id,
    disabled_reason = reason
  WHERE id = target_account_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id,
    action_type,
    target_type,
    target_id,
    metadata
  ) VALUES (
    admin_user_id,
    'ACCOUNT_DISABLED',
    'account',
    target_account_id,
    jsonb_build_object('reason', reason)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Break-glass overrides allow temporary access to disabled accounts
CREATE TABLE IF NOT EXISTS public.account_break_glass_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  UNIQUE (account_id, user_id, revoked_at)
);

CREATE INDEX IF NOT EXISTS idx_break_glass_account ON public.account_break_glass_overrides(account_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_user ON public.account_break_glass_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_active ON public.account_break_glass_overrides(account_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.account_break_glass_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage break glass overrides"
  ON public.account_break_glass_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

CREATE OR REPLACE FUNCTION public.has_break_glass_access(p_account_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.account_break_glass_overrides
    WHERE account_id = p_account_id
      AND user_id = p_user_id
      AND revoked_at IS NULL
      AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
