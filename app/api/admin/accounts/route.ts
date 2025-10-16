import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import type { Database } from '@/supabase/database.types';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

export const GET = withAdminTelemetry('GET /api/admin/accounts', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const respond = (response: Response, metadata?: Record<string, unknown>) =>
    respondWithTelemetry(response, {
      adminUserId: authResult.userId,
      metadata,
    });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const search = url.searchParams.get('search')?.trim();
  const statusParam = url.searchParams.get('status')?.toLowerCase();
  const legacyStatus = url.searchParams.get('isDisabled');
  const superAdminParam = url.searchParams.get('superAdmin');
  const createdAfterParam = url.searchParams.get('createdAfter');
  const createdBeforeParam = url.searchParams.get('createdBefore');
  const hasBreakGlassParam = url.searchParams.get('hasBreakGlass');

  const admin = getAdminClient();
  const fetchEnd = Math.min(page * limit + limit * 3, 500) - 1;

  let query = admin
    .from('accounts')
    .select(
      `
        id,
        name,
        is_super_admin,
        is_disabled,
        disabled_at,
        disabled_by,
        disabled_reason,
        created_at,
        updated_at,
        account_user (
          user_id,
          email,
          role
        ),
        break_glass_overrides:account_break_glass_overrides(id, expires_at, revoked_at)
      `,
      { count: 'exact' }
    )
    .range(0, fetchEnd)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  if (statusParam === 'active') {
    query = query.eq('is_disabled', false);
  } else if (statusParam === 'disabled') {
    query = query.eq('is_disabled', true);
  } else if (legacyStatus === 'true' || legacyStatus === 'false') {
    query = query.eq('is_disabled', legacyStatus === 'true');
  }

  if (superAdminParam === 'true') {
    query = query.eq('is_super_admin', true);
  } else if (superAdminParam === 'false') {
    query = query.eq('is_super_admin', false);
  }

  if (createdAfterParam) {
    const parsed = new Date(createdAfterParam);
    if (Number.isNaN(parsed.getTime())) {
      return respond(NextResponse.json({ error: 'Invalid createdAfter date' }, { status: 400 }));
    }
    query = query.gte('created_at', parsed.toISOString());
  }

  if (createdBeforeParam) {
    const parsed = new Date(createdBeforeParam);
    if (Number.isNaN(parsed.getTime())) {
      return respond(NextResponse.json({ error: 'Invalid createdBefore date' }, { status: 400 }));
    }
    parsed.setUTCHours(23, 59, 59, 999);
    query = query.lte('created_at', parsed.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return respond(NextResponse.json({ error: error.message }, { status: 500 }), {
      stage: 'fetch_accounts',
    });
  }

  type AccountRow = Database['public']['Tables']['accounts']['Row'] & {
    account_user: Database['public']['Tables']['account_user']['Row'][] | null;
    break_glass_overrides?: Array<{
      id: string;
      expires_at: string;
      revoked_at: string | null;
    }>;
  };

  const accountsWithFlags =
    (data as AccountRow[] | null)?.map(({ break_glass_overrides, ...rest }) => {
      const overrides = break_glass_overrides ?? [];
      const hasActiveBreakGlass = overrides.some(
        (override) =>
          (!override.revoked_at || override.revoked_at === null) &&
          new Date(override.expires_at).getTime() > Date.now()
      );
      return { ...rest, has_active_break_glass: hasActiveBreakGlass };
    }) ?? [];

  let filteredAccounts = accountsWithFlags;

  if (hasBreakGlassParam === 'true') {
    filteredAccounts = filteredAccounts.filter((account) => account.has_active_break_glass);
  } else if (hasBreakGlassParam === 'false') {
    filteredAccounts = filteredAccounts.filter((account) => !account.has_active_break_glass);
  }

  const offset = (page - 1) * limit;
  const paginatedAccounts = filteredAccounts.slice(offset, offset + limit);

  return respond(
    NextResponse.json({
      accounts: paginatedAccounts,
      pagination: {
        page,
        limit,
        total: filteredAccounts.length,
        totalPages: Math.ceil(filteredAccounts.length / limit),
      },
    }),
    {
      pagination: { page, limit, total: filteredAccounts.length },
      filters: {
        statusParam,
        superAdminParam,
        hasBreakGlassParam,
        createdAfterParam,
        createdBeforeParam,
        search,
      },
    }
  );
});

export const POST = withAdminTelemetry('POST /api/admin/accounts', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const respond = (response: Response, metadata?: Record<string, unknown>) =>
    respondWithTelemetry(response, {
      adminUserId: authResult.userId,
      targetType: 'account',
      metadata,
    });

  const payload = await req.json().catch(() => null);

  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const ownerEmail =
    typeof payload?.ownerEmail === 'string' ? payload.ownerEmail.trim().toLowerCase() : '';
  const providedPassword =
    typeof payload?.temporaryPassword === 'string' ? payload.temporaryPassword.trim() : '';

  if (!name) {
    return respond(NextResponse.json({ error: 'Account name is required' }, { status: 400 }));
  }

  if (!ownerEmail || !ownerEmail.includes('@')) {
    return respond(NextResponse.json({ error: 'Valid owner email is required' }, { status: 400 }));
  }

  const admin = getAdminClient();

  const password =
    providedPassword ||
    crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

  let ownerUserId: string | null = null;
  let userExisting = false;

  const existingUsers = await admin.auth.admin.listUsers({ email: ownerEmail, perPage: 1 });

  if (existingUsers.error) {
    return respond(NextResponse.json({ error: existingUsers.error.message }, { status: 500 }), {
      ownerEmail,
      step: 'list_users',
    });
  }

  if (existingUsers.users.length > 0) {
    userExisting = true;
    ownerUserId = existingUsers.users[0].id;

    const updateRes = await admin.auth.admin.updateUserById(ownerUserId, {
      password,
      user_metadata: {
        ...(existingUsers.users[0].user_metadata ?? {}),
        force_password_reset: true,
      },
    });

    if (updateRes.error) {
      return respond(NextResponse.json({ error: updateRes.error.message }, { status: 500 }), {
        ownerEmail,
        step: 'update_user',
      });
    }
  } else {
    const createRes = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
      user_metadata: {
        force_password_reset: true,
      },
    });

    if (createRes.error || !createRes.user) {
      return respond(
        NextResponse.json(
          { error: createRes.error?.message || 'Failed to create user' },
          { status: 500 }
        ),
        {
          ownerEmail,
          step: 'create_user',
        }
      );
    }

    ownerUserId = createRes.user.id;
  }

  if (!ownerUserId) {
    return respond(NextResponse.json({ error: 'Unable to determine owner user ID' }, { status: 500 }), {
      ownerEmail,
      step: 'determine_owner_id',
    });
  }

  const { data: existingMembership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (membershipError) {
    return respond(NextResponse.json({ error: membershipError.message }, { status: 500 }), {
      ownerEmail,
      ownerUserId,
      step: 'check_membership',
    });
  }

  if (existingMembership) {
    return respond(
      NextResponse.json(
        { error: 'User already belongs to an organization. Invite them instead.' },
        { status: 400 }
      ),
      {
        ownerEmail,
        ownerUserId,
        step: 'membership_conflict',
      }
    );
  }

  const defaultBusinessHours = {
    monday: { start: '09:00', end: '17:00', enabled: true },
    tuesday: { start: '09:00', end: '17:00', enabled: true },
    wednesday: { start: '09:00', end: '17:00', enabled: true },
    thursday: { start: '09:00', end: '17:00', enabled: true },
    friday: { start: '09:00', end: '17:00', enabled: true },
    saturday: { start: '09:00', end: '17:00', enabled: false },
    sunday: { start: '09:00', end: '17:00', enabled: false },
  };

  const defaultSettings = {
    allowBooking: true,
    bufferTime: 15,
    maxAdvanceBooking: 30,
  };

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name,
      timezone: 'America/New_York',
      business_hours: defaultBusinessHours,
      settings: defaultSettings,
    })
    .select()
    .single();

  if (orgError || !org) {
    return respond(
      NextResponse.json({ error: orgError?.message || 'Failed to create organization' }, { status: 500 }),
      {
        ownerEmail,
        ownerUserId,
        step: 'create_org',
      }
    );
  }

  const { error: memberError } = await admin.from('organization_members').insert({
    organization_id: org.id,
    user_id: ownerUserId,
    role: 'owner',
  });

  if (memberError) {
    return respond(NextResponse.json({ error: memberError.message }, { status: 500 }), {
      ownerEmail,
      ownerUserId,
      organizationId: org.id,
      step: 'insert_member',
    });
  }

  await admin
    .from('users')
    .upsert(
      {
        id: ownerUserId,
        onboarded: true,
      },
      { onConflict: 'id' }
    );

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'ACCOUNT_CREATED',
    target_type: 'account',
    target_id: org.id,
    metadata: {
      name,
      owner_email: ownerEmail,
      owner_existing: userExisting,
    },
  });

  return respond(
    NextResponse.json({
      account: org,
      owner: {
        id: ownerUserId,
        email: ownerEmail,
        existingUser: userExisting,
      },
      temporaryPassword: password,
    }),
    {
      ownerEmail,
      ownerUserId,
      organizationId: org.id,
      ownerExisting: userExisting,
    }
  );
});
