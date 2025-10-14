import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

type QueryStringBoolean = 'true' | 'false';

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10))
  );
  const search = url.searchParams.get('search')?.trim();
  const status = url.searchParams.get('isDisabled') as QueryStringBoolean | null;

  const admin = getAdminClient();

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
        )
      `,
      { count: 'exact' }
    )
    .range((page - 1) * limit, page * limit - 1)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  if (status === 'true' || status === 'false') {
    query = query.eq('is_disabled', status === 'true');
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    accounts: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: count ? Math.ceil(count / limit) : 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);

  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const ownerEmail = typeof payload?.ownerEmail === 'string' ? payload.ownerEmail.trim().toLowerCase() : '';
  const providedPassword =
    typeof payload?.temporaryPassword === 'string' ? payload.temporaryPassword.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
  }

  if (!ownerEmail || !ownerEmail.includes('@')) {
    return NextResponse.json({ error: 'Valid owner email is required' }, { status: 400 });
  }

  const admin = getAdminClient();

  const password =
    providedPassword ||
    crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

  // Create or update the owner user
  let ownerUserId: string | null = null;
  let userExisting = false;

  const existingUsers = await admin.auth.admin.listUsers({ email: ownerEmail, perPage: 1 });

  if (existingUsers.error) {
    return NextResponse.json({ error: existingUsers.error.message }, { status: 500 });
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
      return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
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
      return NextResponse.json(
        { error: createRes.error?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    ownerUserId = createRes.user.id;
  }

  if (!ownerUserId) {
    return NextResponse.json({ error: 'Unable to determine owner user ID' }, { status: 500 });
  }

  // Ensure the user is not already tied to another organization
  const { data: existingMembership, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (existingMembership) {
    return NextResponse.json(
      { error: 'User already belongs to an organization. Invite them instead.' },
      { status: 400 }
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
    return NextResponse.json(
      { error: orgError?.message || 'Failed to create organization' },
      { status: 500 }
    );
  }

  const { error: memberError } = await admin.from('organization_members').insert({
    organization_id: org.id,
    user_id: ownerUserId,
    role: 'owner',
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
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

  return NextResponse.json({
    account: org,
    owner: {
      id: ownerUserId,
      email: ownerEmail,
      existingUser: userExisting,
    },
    temporaryPassword: password,
  });
}
