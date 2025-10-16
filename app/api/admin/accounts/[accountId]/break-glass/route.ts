import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

type BreakGlassRow = {
  id: string;
  account_id: string;
  user_id: string;
  issued_by: string;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

type EnrichedOverride = {
  id: string;
  userId: string;
  userEmail: string | null;
  issuedByEmail: string | null;
  reason: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
};

async function enrichOverrides(
  rows: BreakGlassRow[],
  admin: ReturnType<typeof getAdminClient>
): Promise<EnrichedOverride[]> {
  const userIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        [row.user_id, row.issued_by, row.revoked_by].filter(
          (value): value is string => Boolean(value)
        )
      )
    )
  );

  const emailMap = new Map<string, string>();

  if (userIds.length > 0) {
    const results = await Promise.allSettled(
      userIds.map((id) => admin.auth.admin.getUserById(id))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.user) {
        emailMap.set(userIds[index], result.value.user.email ?? '');
      }
    });
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: emailMap.get(row.user_id) ?? null,
    issuedByEmail: emailMap.get(row.issued_by) ?? null,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

export const GET = withAdminTelemetry('GET /api/admin/accounts/[accountId]/break-glass', async (
  _req: NextRequest,
  context: { params: Promise<{ accountId: string }> }
) => {
  const authResult = await requireSuperAdmin(_req);
  if (authResult instanceof NextResponse) return authResult;

  const { accountId } = await context.params;

  const admin = getAdminClient();

  const { data, error } = await admin
    .from<BreakGlassRow>('account_break_glass_overrides')
    .select('id, account_id, user_id, issued_by, reason, expires_at, created_at, revoked_at, revoked_by')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  const overrides = await enrichOverrides(data ?? [], admin);

  return respondWithTelemetry(NextResponse.json({ overrides }), {
    adminUserId: authResult.userId,
    targetType: 'account',
    targetId: accountId,
    metadata: { total: overrides.length },
  });
});

export const POST = withAdminTelemetry('POST /api/admin/accounts/[accountId]/break-glass', async (
  req: NextRequest,
  context: { params: Promise<{ accountId: string }> }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { accountId } = await context.params;

  const payload = await req.json().catch(() => null);
  const userEmail =
    typeof payload?.userEmail === 'string'
      ? payload.userEmail.trim().toLowerCase()
      : '';
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
  const durationMinutesRaw = Number(payload?.durationMinutes ?? 120);
  const durationMinutes = Number.isFinite(durationMinutesRaw)
    ? Math.max(5, Math.min(durationMinutesRaw, 720))
    : 120;
  const customPassword =
    typeof payload?.temporaryPassword === 'string'
      ? payload.temporaryPassword.trim()
      : '';

  if (!userEmail || !userEmail.includes('@')) {
    return respondWithTelemetry(NextResponse.json({ error: 'Valid user email is required' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  if (!reason) {
    return respondWithTelemetry(NextResponse.json({ error: 'Reason is required' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  const admin = getAdminClient();

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, is_disabled')
    .eq('id', accountId)
    .maybeSingle();

  if (accountError) {
    return respondWithTelemetry(NextResponse.json({ error: accountError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { stage: 'fetch_account' },
    });
  }

  if (!account) {
    return respondWithTelemetry(NextResponse.json({ error: 'Account not found' }, { status: 404 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  const { data: members, error: memberFetchError } = await admin
    .from<{ user_id: string; email: string | null }>('account_user')
    .select('user_id, email')
    .eq('account_id', accountId);

  if (memberFetchError) {
    return respondWithTelemetry(NextResponse.json({ error: memberFetchError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { stage: 'fetch_members' },
    });
  }

  const match = (members ?? []).find(
    (member) => member.email?.trim().toLowerCase() === userEmail
  );

  if (!match) {
    return respondWithTelemetry(
      NextResponse.json({ error: 'User not found on this account' }, { status: 404 }),
      {
        adminUserId: authResult.userId,
        targetType: 'account',
        targetId: accountId,
      }
    );
  }

  const userId = match.user_id;

  const { data: targetUserData, error: getUserError } =
    await admin.auth.admin.getUserById(userId);

  if (getUserError || !targetUserData?.user) {
    return respondWithTelemetry(NextResponse.json({ error: getUserError?.message || 'User not found' }, { status: 404 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { stage: 'fetch_target_user' },
    });
  }
  const targetUser = targetUserData.user;

  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const temporaryPassword =
    customPassword ||
    crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

  if (temporaryPassword.length < 8) {
    return respondWithTelemetry(
      NextResponse.json({ error: 'Temporary password must be at least 8 characters if provided' }, { status: 400 }),
      {
        adminUserId: authResult.userId,
        targetType: 'account',
        targetId: accountId,
      }
    );
  }

  const { error: passwordUpdateError } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
    user_metadata: {
      ...(targetUser.user_metadata ?? {}),
      force_password_reset: true,
    },
  });

  if (passwordUpdateError) {
    return respondWithTelemetry(NextResponse.json({ error: passwordUpdateError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { stage: 'update_user_password' },
    });
  }

  await admin
    .from('account_break_glass_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: authResult.userId,
    })
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .is('revoked_at', null);

  const { data: inserted, error: insertError } = await admin
    .from<BreakGlassRow>('account_break_glass_overrides')
    .insert({
      account_id: accountId,
      user_id: userId,
      issued_by: authResult.userId,
      reason,
      expires_at: expiresAt,
    })
    .select('id, account_id, user_id, issued_by, reason, expires_at, created_at, revoked_at, revoked_by')
    .single();

  if (insertError || !inserted) {
    return respondWithTelemetry(
      NextResponse.json({ error: insertError?.message || 'Failed to create override' }, { status: 500 }),
      {
        adminUserId: authResult.userId,
        targetType: 'account',
        targetId: accountId,
        metadata: { stage: 'insert_override' },
      }
    );
  }

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'BREAK_GLASS_GRANTED',
    target_type: 'account',
    target_id: accountId,
    metadata: {
      target_user_id: userId,
      target_user_email: userEmail,
      reason,
      expires_at: expiresAt,
    },
  });

  const [override] = await enrichOverrides([inserted], admin);

  return respondWithTelemetry(
    NextResponse.json({
      override,
      temporaryPassword,
    }),
    {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { userEmail, durationMinutes },
    }
  );
});
