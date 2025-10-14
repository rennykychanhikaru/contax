# PRD: Super Admin Panel

## Overview

A comprehensive super admin panel that allows designated administrators to monitor and control the platform. Access is controlled via a database flag, ensuring secure and auditable administrative actions.

## Goals

1. Enable platform-wide visibility into user activity and system health
2. Provide granular control over features via feature flags
3. Allow account management (disable/enable accounts)
4. Create an extensible foundation for future administrative capabilities
5. Maintain security and audit trails for all admin actions

## Non-Goals

- User-facing analytics dashboard
- Automated account moderation
- Customer support ticketing system (may be added later)

## Technical Architecture

### Database Schema

```sql
-- Super admin flag on accounts table
ALTER TABLE public.accounts
ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE;

-- Feature flags table
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  flag_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT FALSE,
  target_type TEXT CHECK (target_type IN ('global', 'account', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feature flag overrides (account/user specific)
CREATE TABLE public.feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id UUID REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT feature_flag_overrides_target_check CHECK (
    (account_id IS NOT NULL AND user_id IS NULL) OR
    (account_id IS NULL AND user_id IS NOT NULL)
  )
);

-- Admin activity audit log
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Account status tracking
ALTER TABLE public.accounts
ADD COLUMN is_disabled BOOLEAN DEFAULT FALSE,
ADD COLUMN disabled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN disabled_by UUID REFERENCES auth.users(id),
ADD COLUMN disabled_reason TEXT;

-- Indexes for performance
CREATE INDEX idx_feature_flags_key ON public.feature_flags(flag_key);
CREATE INDEX idx_feature_flag_overrides_flag ON public.feature_flag_overrides(feature_flag_id);
CREATE INDEX idx_feature_flag_overrides_account ON public.feature_flag_overrides(account_id);
CREATE INDEX idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX idx_accounts_super_admin ON public.accounts(is_super_admin) WHERE is_super_admin = TRUE;
CREATE INDEX idx_accounts_disabled ON public.accounts(is_disabled) WHERE is_disabled = TRUE;
```

### RLS Policies

```sql
-- Super admin bypass for read operations
CREATE POLICY "Super admins can view all accounts"
  ON public.accounts FOR SELECT
  USING (
    is_super_admin = TRUE OR
    id IN (SELECT account_id FROM account_user WHERE user_id = auth.uid())
  );

-- Feature flags readable by super admins only
CREATE POLICY "Super admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

-- Audit log policies
CREATE POLICY "Super admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

CREATE POLICY "Super admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      INNER JOIN public.account_user au ON a.id = au.account_id
      WHERE au.user_id = auth.uid() AND a.is_super_admin = TRUE
    )
  );

-- Account management policies
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

-- Feature flag override policies
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

-- Guard against self-deprovisioning without audit
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
```

### Access Provisioning & Lifecycle

- Super admin status is granted through an internal approval workflow (requestor → manager → security) that flips `accounts.is_super_admin` via a privileged service. The workflow must record the ticket/reference ID in `admin_audit_log.metadata`.
- Canonical super-admin roster lives in security’s inventory; initial seed: `renny@getconvo.ai`. Any additions must go through the approval workflow.
- Enforce step-up MFA using WebAuthn security keys where supported; allow TOTP via Supabase Auth as a fallback (included in the free tier), and require re-authentication for sensitive actions (e.g., bulk account disable). Sessions lacking the `amr` claim for WebAuthn/TOTP are rejected.
- Where SSO is available, integrate with the IdP (e.g., Okta/Azure AD) and configure an `Admin` app profile that mandates hardware-key/WebAuthn plus phishing-resistant backup factors.
- Restrict admin panel access to trusted devices: route traffic through the corporate VPN or Zero Trust proxy (preferred: Cloudflare Access or Tailscale, both have generous free tiers) enforcing device posture checks (OS patch level, disk encryption, EDR), and maintain an IP allowlist as an interim safeguard.
- Maintain a locked-down break-glass service account with time-bound credentials in the security-owned secrets vault (existing org password manager, Bitwarden Teams, or 1Password all cover small teams at low/no cost); rotate after every use and emit high-priority alerts.
- Run monthly access reviews that enumerate `is_super_admin` accounts and revoke access for inactive admins or offboarded employees. Document offboarding runbooks.

### Database Functions

```sql
-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.accounts a
    INNER JOIN public.account_user au ON a.id = au.account_id
    WHERE au.user_id = user_id AND a.is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check feature flag
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
  -- Get the feature flag
  SELECT * INTO flag_record FROM public.feature_flags WHERE feature_flags.flag_key = is_feature_enabled.flag_key;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check for account-specific override
  IF check_account_id IS NOT NULL THEN
    SELECT is_enabled INTO override_enabled
    FROM public.feature_flag_overrides
    WHERE feature_flag_id = flag_record.id AND account_id = check_account_id;

    IF FOUND THEN
      RETURN override_enabled;
    END IF;
  END IF;

  -- Check for user-specific override
  IF check_user_id IS NOT NULL THEN
    SELECT is_enabled INTO override_enabled
    FROM public.feature_flag_overrides
    WHERE feature_flag_id = flag_record.id AND user_id = check_user_id;

    IF FOUND THEN
      RETURN override_enabled;
    END IF;
  END IF;

  -- Return global flag value
  RETURN flag_record.is_enabled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disable account
CREATE OR REPLACE FUNCTION public.disable_account(
  target_account_id UUID,
  reason TEXT,
  admin_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if admin is super admin
  IF NOT public.is_super_admin(admin_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: User is not a super admin';
  END IF;

  -- Update account
  UPDATE public.accounts
  SET
    is_disabled = TRUE,
    disabled_at = NOW(),
    disabled_by = admin_user_id,
    disabled_reason = reason
  WHERE id = target_account_id;

  -- Log the action
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
```

## Implementation Details

### 1. Middleware for Super Admin Access Control

**File**: `apps/demo-web/middleware/super-admin.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function requireSuperAdmin(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is super admin
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
    user_id: user.id,
  });

  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Super admin access required' },
      { status: 403 },
    );
  }

  return null; // Access granted
}
```

### 2. Super Admin API Routes

**File**: `apps/demo-web/app/api/admin/accounts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

// Get all accounts with pagination and filters
export async function GET(req: NextRequest) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search');
  const isDisabled = searchParams.get('isDisabled');

  const supabase = await createClient();

  let query = supabase
    .from('accounts')
    .select('*, account_user!inner(user_id, email)', { count: 'exact' })
    .range((page - 1) * limit, page * limit - 1)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  if (isDisabled !== null) {
    query = query.eq('is_disabled', isDisabled === 'true');
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    accounts: data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}
```

**File**: `apps/demo-web/app/api/admin/accounts/[accountId]/disable/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } },
) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const { reason } = await req.json();

  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc('disable_account', {
    target_account_id: params.accountId,
    reason,
    admin_user_id: user!.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

**File**: `apps/demo-web/app/api/admin/accounts/[accountId]/enable/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } },
) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: updateError } = await supabase
    .from('accounts')
    .update({
      is_disabled: false,
      disabled_at: null,
      disabled_by: null,
      disabled_reason: null,
    })
    .eq('id', params.accountId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log the action
  await supabase.from('admin_audit_log').insert({
    admin_user_id: user!.id,
    action_type: 'ACCOUNT_ENABLED',
    target_type: 'account',
    target_id: params.accountId,
  });

  return NextResponse.json({ success: true });
}
```

**File**: `apps/demo-web/app/api/admin/feature-flags/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

// Get all feature flags
export async function GET(req: NextRequest) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flags: data });
}

// Create new feature flag
export async function POST(req: NextRequest) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const { flag_key, flag_name, description, target_type, is_enabled } =
    await req.json();

  if (!flag_key || !flag_name || !target_type) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('feature_flags')
    .insert({
      flag_key,
      flag_name,
      description,
      target_type,
      is_enabled: is_enabled || false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the action
  await supabase.from('admin_audit_log').insert({
    admin_user_id: user!.id,
    action_type: 'FEATURE_FLAG_CREATED',
    target_type: 'feature_flag',
    target_id: data.id,
    metadata: { flag_key, flag_name },
  });

  return NextResponse.json({ flag: data });
}
```

**File**: `apps/demo-web/app/api/admin/feature-flags/[flagId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

// Update feature flag
export async function PATCH(
  req: NextRequest,
  { params }: { params: { flagId: string } },
) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const updates = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('feature_flags')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.flagId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the action
  await supabase.from('admin_audit_log').insert({
    admin_user_id: user!.id,
    action_type: 'FEATURE_FLAG_UPDATED',
    target_type: 'feature_flag',
    target_id: params.flagId,
    metadata: updates,
  });

  return NextResponse.json({ flag: data });
}

// Delete feature flag
export async function DELETE(
  req: NextRequest,
  { params }: { params: { flagId: string } },
) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('feature_flags')
    .delete()
    .eq('id', params.flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the action
  await supabase.from('admin_audit_log').insert({
    admin_user_id: user!.id,
    action_type: 'FEATURE_FLAG_DELETED',
    target_type: 'feature_flag',
    target_id: params.flagId,
  });

  return NextResponse.json({ success: true });
}
```

**File**: `apps/demo-web/app/api/admin/activity/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

// Get activity across all accounts
export async function GET(req: NextRequest) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const accountId = searchParams.get('accountId');
  const actionType = searchParams.get('actionType');

  const supabase = await createClient();

  let query = supabase
    .from('admin_audit_log')
    .select('*, accounts(*)', { count: 'exact' })
    .range((page - 1) * limit, page * limit - 1)
    .order('created_at', { ascending: false });

  if (accountId) {
    query = query.eq('target_id', accountId);
  }

  if (actionType) {
    query = query.eq('action_type', actionType);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    activity: data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}
```

**File**: `apps/demo-web/app/api/admin/stats/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

// Get platform statistics
export async function GET(req: NextRequest) {
  const authError = await requireSuperAdmin(req);
  if (authError) return authError;

  const supabase = await createClient();

  // Get account counts
  const { count: totalAccounts } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true });

  const { count: disabledAccounts } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('is_disabled', true);

  // Get user count
  const { count: totalUsers } = await supabase
    .from('account_user')
    .select('*', { count: 'exact', head: true });

  // Get recent activity count (last 24 hours)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentActivity } = await supabase
    .from('admin_audit_log')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', yesterday);

  return NextResponse.json({
    stats: {
      totalAccounts: totalAccounts || 0,
      activeAccounts: (totalAccounts || 0) - (disabledAccounts || 0),
      disabledAccounts: disabledAccounts || 0,
      totalUsers: totalUsers || 0,
      recentActivity: recentActivity || 0,
    },
  });
}
```

### 3. Frontend Components

**File**: `apps/demo-web/components/admin/AdminLayout.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/admin/check-access')
        if (res.status === 403 || res.status === 401) {
          router.push('/')
          return
        }
        setIsSuperAdmin(true)
      } catch (error) {
        router.push('/')
      }
    }
    checkAccess()
  }, [router])

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-800">Super Admin</h1>
        </div>
        <nav className="mt-6">
          <Link
            href="/admin/dashboard"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/accounts"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Accounts
          </Link>
          <Link
            href="/admin/feature-flags"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Feature Flags
          </Link>
          <Link
            href="/admin/activity"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Activity Log
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
```

**File**: `apps/demo-web/components/admin/AccountsTable.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface Account {
  id: string
  name: string
  is_disabled: boolean
  disabled_reason?: string
  created_at: string
}

export function AccountsTable() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled'>('all')

  useEffect(() => {
    async function fetchAccounts() {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })

      if (search) params.set('search', search)
      if (filter !== 'all') params.set('isDisabled', (filter === 'disabled').toString())

      const res = await fetch(`/api/admin/accounts?${params}`)
      const data = await res.json()

      setAccounts(data.accounts)
      setTotalPages(data.pagination.totalPages)
      setLoading(false)
    }

    fetchAccounts()
  }, [page, search, filter])

  async function handleDisableAccount(accountId: string, reason: string) {
    const res = await fetch(`/api/admin/accounts/${accountId}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })

    if (res.ok) {
      // Refresh accounts
      setAccounts(accounts.map(acc =>
        acc.id === accountId ? { ...acc, is_disabled: true, disabled_reason: reason } : acc
      ))
    }
  }

  async function handleEnableAccount(accountId: string) {
    const res = await fetch(`/api/admin/accounts/${accountId}/enable`, {
      method: 'POST',
    })

    if (res.ok) {
      // Refresh accounts
      setAccounts(accounts.map(acc =>
        acc.id === accountId ? { ...acc, is_disabled: false, disabled_reason: undefined } : acc
      ))
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border rounded-md flex-1"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-4 py-2 border rounded-md"
        >
          <option value="all">All Accounts</option>
          <option value="active">Active Only</option>
          <option value="disabled">Disabled Only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Account Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{account.name}</div>
                  <div className="text-sm text-gray-500">{account.id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {account.is_disabled ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                      Disabled
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDistanceToNow(new Date(account.created_at), { addSuffix: true })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {account.is_disabled ? (
                    <button
                      onClick={() => handleEnableAccount(account.id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Enable
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const reason = prompt('Reason for disabling:')
                        if (reason) handleDisableAccount(account.id, reason)
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex justify-between items-center">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className="px-4 py-2 border rounded-md disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
          className="px-4 py-2 border rounded-md disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

**File**: `apps/demo-web/components/admin/FeatureFlagsManager.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'

interface FeatureFlag {
  id: string
  flag_key: string
  flag_name: string
  description?: string
  is_enabled: boolean
  target_type: 'global' | 'account' | 'user'
}

export function FeatureFlagsManager() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchFlags()
  }, [])

  async function fetchFlags() {
    const res = await fetch('/api/admin/feature-flags')
    const data = await res.json()
    setFlags(data.flags)
    setLoading(false)
  }

  async function toggleFlag(flagId: string, currentState: boolean) {
    await fetch(`/api/admin/feature-flags/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !currentState }),
    })

    setFlags(flags.map(flag =>
      flag.id === flagId ? { ...flag, is_enabled: !currentState } : flag
    ))
  }

  async function createFlag(flagData: Partial<FeatureFlag>) {
    const res = await fetch('/api/admin/feature-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flagData),
    })

    if (res.ok) {
      await fetchFlags()
      setShowCreateModal(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Feature Flags</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Flag
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Flag Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {flags.map((flag) => (
              <tr key={flag.id}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{flag.flag_name}</div>
                  {flag.description && (
                    <div className="text-sm text-gray-500">{flag.description}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                  {flag.flag_key}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {flag.target_type}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      flag.is_enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {flag.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleFlag(flag.id, flag.is_enabled)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Toggle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal - simplified for brevity */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Create Feature Flag</h3>
            {/* Form fields here */}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded-md"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-md"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 4. Feature Flag Utility Hook

**File**: `apps/demo-web/hooks/useFeatureFlag.ts`

```typescript
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useFeatureFlag(
  flagKey: string,
  accountId?: string,
  userId?: string,
) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkFlag() {
      const supabase = createClient();

      const { data, error } = await supabase.rpc('is_feature_enabled', {
        flag_key: flagKey,
        check_account_id: accountId || null,
        check_user_id: userId || null,
      });

      if (!error && data !== null) {
        setIsEnabled(data);
      }

      setLoading(false);
    }

    checkFlag();
  }, [flagKey, accountId, userId]);

  return { isEnabled, loading };
}
```

## Milestones

### Milestone 1: Database Foundation

**Tasks:**

- [ ] Create database migration with all tables (accounts columns, feature_flags, feature_flag_overrides, admin_audit_log)
- [ ] Add indexes for performance optimization
- [ ] Implement RLS policies for super admin access
- [ ] Create database functions (is_super_admin, is_feature_enabled, disable_account)
- [ ] Test all database functions and RLS policies
- [ ] Generate TypeScript types with `npm run typegen`

**Acceptance Criteria:**

- All tables created successfully
- RLS policies prevent non-super-admin access
- Database functions execute correctly
- Types are generated without errors

### Milestone 2: API Layer

**Tasks:**

- [ ] Create super admin middleware (`middleware/super-admin.ts`)
- [ ] Implement accounts API routes (GET, disable, enable)
- [ ] Implement feature flags API routes (GET, POST, PATCH, DELETE)
- [ ] Implement activity log API route (GET)
- [ ] Implement stats API route (GET)
- [ ] Create check-access API endpoint
- [ ] Add comprehensive error handling to all routes
- [ ] Write unit tests for API routes

**Acceptance Criteria:**

- All API routes return correct data
- Middleware properly blocks non-super-admin access
- Audit logs are created for all admin actions
- Error handling covers edge cases
- Tests pass with >80% coverage

### Milestone 3: Frontend Components

**Tasks:**

- [ ] Create AdminLayout component with navigation
- [ ] Build AccountsTable component with pagination and filters
- [ ] Build FeatureFlagsManager component with CRUD operations
- [ ] Create ActivityLog component with filtering
- [ ] Build Dashboard component with stats overview
- [ ] Implement useFeatureFlag hook
- [ ] Add loading and error states to all components
- [ ] Implement responsive design for mobile

**Acceptance Criteria:**

- All components render without errors
- Pagination works correctly
- Filters update data appropriately
- Real-time updates work for flag toggles
- Mobile layout is usable

### Milestone 4: Security & Access Control

**Tasks:**

- [ ] Implement route guards for admin pages
- [ ] Add IP address and user agent tracking to audit log
- [ ] Create automated tests for RLS bypass attempts
- [ ] Add rate limiting to admin API routes
- [ ] Implement CSRF protection for admin actions
- [ ] Add security headers to admin routes
- [ ] Create security audit documentation
- [ ] Enforce MFA-at-sign-in for all super admin identities
- [ ] Configure IP allowlisting or device posture enforcement for admin panel access
- [ ] Instrument alerts for break-glass account usage
- [ ] Document quarterly super admin access review and offboarding procedures

**Acceptance Criteria:**

- Non-super-admins cannot access admin routes
- All admin actions are logged with IP and user agent
- RLS policies cannot be bypassed
- Rate limits prevent abuse
- Security tests pass
- MFA claims are required for admin sessions
- Break-glass access generates real-time alerts
- Access review checklist is published and adopted

### Milestone 5: Advanced Features

**Tasks:**

- [ ] Implement feature flag overrides (account/user specific)
- [ ] Create override management UI
- [ ] Add bulk account operations (multi-select disable/enable)
- [ ] Implement export functionality for audit logs (CSV)
- [ ] Add real-time notifications for admin actions
- [ ] Create feature flag analytics (usage tracking)
- [ ] Add account search with advanced filters

**Acceptance Criteria:**

- Overrides work correctly at account and user level
- Bulk operations complete successfully
- Exported data is accurate and complete
- Real-time updates work across sessions
- Analytics provide useful insights

### Milestone 6: Testing & Documentation

**Tasks:**

- [ ] Write integration tests for complete admin workflows
- [ ] Create E2E tests using Playwright
- [ ] Document all API endpoints (OpenAPI spec)
- [ ] Write admin user guide
- [ ] Create runbook for common admin tasks
- [ ] Add JSDoc comments to all functions
- [ ] Create video walkthrough of admin panel

**Acceptance Criteria:**

- Integration tests cover all workflows
- E2E tests pass in CI/CD
- API documentation is complete
- User guide covers all features
- Runbook has clear step-by-step instructions

### Milestone 7: Production Readiness

**Tasks:**

- [ ] Implement logging and monitoring
- [ ] Add performance metrics tracking
- [ ] Create alerting for suspicious admin activity
- [ ] Optimize database queries for scale
- [ ] Add caching layer for feature flags
- [ ] Implement graceful error handling
- [ ] Create rollback procedures
- [ ] Conduct security review
- [ ] Define staged rollout plan (dev → staging → prod) with feature flag gating
- [ ] Implement automated backups and PITR validation for admin data
- [ ] Publish incident response runbook (detection, containment, communications)
- [ ] Test disaster recovery and rollback drills quarterly

**Acceptance Criteria:**

- Logging captures all admin actions
- Metrics dashboard shows performance
- Alerts trigger for anomalies
- Queries execute in <100ms
- Feature flag checks are cached
- Error states don't expose sensitive data
- Rollback procedures are documented and tested
- Production deployments follow staged rollout checklist
- Backup restore can be completed within RTO/RPO targets
- Incident response drill sign-off is recorded

## Security Considerations

1. **Authentication & Authorization**
   - Super admin flag is stored securely in database
   - Middleware validates on every request
   - WebAuthn hardware keys are the primary factor; Supabase TOTP is an approved backup, with forced step-up MFA for sensitive flows
   - No client-side admin checks (server-side only)
   - SSO integration (Okta/Azure AD) must enforce phishing-resistant factors and scoped admin app policies

2. **Audit Logging**
   - All admin actions logged with timestamp, user, IP, and user agent
   - Logs are immutable (INSERT only, no UPDATE/DELETE)
   - Retention policy for compliance

3. **Data Protection**
   - RLS prevents data leakage
   - Sensitive data masked in logs
   - Account data encrypted at rest

4. **Rate Limiting**
   - Prevent brute force access attempts
   - Limit bulk operations to prevent abuse

5. **Session & Network Hardening**
   - Funnel admin traffic through corporate Zero Trust proxy (Cloudflare Access/Tailscale free tiers) or VPN; reject non-compliant devices
   - Use short-lived sessions with idle timeouts and secure cookies
   - Monitor for unusual session durations or geographic anomalies

6. **Access Lifecycle**
   - Quarterly access reviews for all `is_super_admin` accounts
   - Time-bound credentials for break-glass users and just-in-time elevation
   - Automated deprovisioning pipeline tied to HR/offboarding events

## Operational Considerations

1. **Release & Environments**
   - Admin panel ships behind a feature flag with dev → staging → prod promotion and smoke tests at each stage
   - Migration playbooks include rollback/roll-forward steps and expected data drift checks
   - Configuration is managed via code (IaC) to keep RLS, policies, and Supabase functions in sync across environments

2. **Incident Response**
   - Runbook defines detection thresholds, classification, communication channels, and RACI
   - Require on-call rotation coverage for admin-specific alerts and define escalation timelines
   - Tabletop exercises twice per year to validate response to compromised admin credentials

3. **Compliance & Governance**
   - Map audit requirements (SOC2/ISO) to admin logging and retention policies
   - Ensure data exports and deletions respect regional privacy rules (GDPR/CCPA)
   - Document data retention windows and secure archival strategy for `admin_audit_log`

## Cost & Tooling Notes

- `Supabase Auth` ships TOTP MFA and WebAuthn support on the free tier; no third-party MFA subscription is required to secure admin accounts.
- Cloudflare Access (up to 50 users) and Tailscale (up to 3 users) offer free Zero Trust/VPN plans that can gate the admin panel without new spend.
- Break-glass credentials can be stored in existing org password managers; Bitwarden Teams and 1Password Families provide low-cost shared vaults suitable for a small security group.
- Preferred logging/monitoring stack should leverage current observability tooling; avoid net-new vendors unless unmet requirements arise.

## Open Questions

- Which roles (team names) must approve super admin elevation requests, and what SLA applies?
- How long should admin audit logs be retained to satisfy compliance without incurring excessive storage?
- Who owns the Zero Trust/device posture policies, and how will compliance drift be monitored?
- Who is accountable for the break-glass vault audits and quarterly access attestations?
- Should the admin panel surface configuration differences across environments (dev/staging/prod) to prevent drift?

## Future Enhancements

1. **Advanced Analytics**
   - User activity heatmaps
   - Feature usage analytics
   - Account health scores

2. **Automation**
   - Scheduled reports
   - Automated account cleanup
   - Anomaly detection

3. **Communication**
   - In-app messaging to accounts
   - Email notifications for disabled accounts
   - Admin alerts for critical events

4. **Multi-Admin Management**
   - Role-based admin access (read-only, operator, super)
   - Admin activity approval workflows
   - Admin delegation

## Success Metrics

- **Performance**: Admin panel loads in <2s
- **Reliability**: 99.9% uptime for admin endpoints
- **Security**: Zero unauthorized access incidents
- **Usability**: Admins can complete common tasks in <5 clicks
- **Audit**: 100% of admin actions logged
