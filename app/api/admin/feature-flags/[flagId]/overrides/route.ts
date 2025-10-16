import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

type SupabaseOverrideRow = {
  id: string;
  feature_flag_id: string;
  account_id: string | null;
  user_id: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  accounts?: { name: string | null } | null;
};

async function enrichOverrides(rows: SupabaseOverrideRow[]) {
  const admin = getAdminClient();
  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter(Boolean) as string[])
  );

  const userEmailMap = new Map<string, string>();

  if (userIds.length > 0) {
    const batches = await Promise.allSettled(
      userIds.map((id) => admin.auth.admin.getUserById(id))
    );

    batches.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.user) {
        userEmailMap.set(userIds[index], result.value.user.email ?? '');
      }
    });
  }

  return rows.map((row) => ({
    id: row.id,
    feature_flag_id: row.feature_flag_id,
    target_type: row.account_id ? 'account' : 'user',
    account_id: row.account_id,
    account_name: row.accounts?.name ?? null,
    user_id: row.user_id,
    user_email: row.user_id ? userEmailMap.get(row.user_id) ?? null : null,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export const GET = withAdminTelemetry('GET /api/admin/feature-flags/[flagId]/overrides', async (
  req: NextRequest,
  { params }: { params: { flagId: string } }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('feature_flag_overrides')
    .select('id, feature_flag_id, account_id, user_id, is_enabled, created_at, updated_at, accounts(name)')
    .eq('feature_flag_id', params.flagId)
    .order('created_at', { ascending: false });

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: params.flagId,
    });
  }

  const overrides = await enrichOverrides(data ?? []);

  return respondWithTelemetry(NextResponse.json({ overrides }), {
    adminUserId: authResult.userId,
    targetType: 'feature_flag',
    targetId: params.flagId,
    metadata: { total: overrides.length },
  });
});

export const POST = withAdminTelemetry('POST /api/admin/feature-flags/[flagId]/overrides', async (
  req: NextRequest,
  { params }: { params: { flagId: string } }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);

  if (!payload || typeof payload !== 'object') {
    return respondWithTelemetry(NextResponse.json({ error: 'Invalid body' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: params.flagId,
    });
  }

  const {
    target_type,
    target_id,
    target_email,
    is_enabled,
  }: {
    target_type?: 'account' | 'user';
    target_id?: string;
    target_email?: string;
    is_enabled?: boolean;
  } = payload;

  if (!target_type || (target_type !== 'account' && target_type !== 'user')) {
    return respondWithTelemetry(NextResponse.json({ error: 'target_type must be account or user' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: params.flagId,
    });
  }

  if (typeof is_enabled !== 'boolean') {
    return respondWithTelemetry(
      NextResponse.json({ error: 'is_enabled must be provided as boolean' }, { status: 400 }),
      {
        adminUserId: authResult.userId,
        targetType: 'feature_flag',
        targetId: params.flagId,
      }
    );
  }

  const admin = getAdminClient();
  let accountId: string | null = null;
  let userId: string | null = null;

  if (target_type === 'account') {
    if (!target_id) {
      return respondWithTelemetry(
        NextResponse.json({ error: 'target_id is required for account overrides' }, { status: 400 }),
        {
          adminUserId: authResult.userId,
          targetType: 'feature_flag',
          targetId: params.flagId,
        }
      );
    }
    accountId = target_id;
  } else {
    if (target_id) {
      userId = target_id;
    } else if (target_email) {
      const { data: users, error } = await admin.auth.admin.listUsers({ email: target_email, perPage: 1 });
      if (error) {
        return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
          adminUserId: authResult.userId,
          targetType: 'feature_flag',
          targetId: params.flagId,
          metadata: { stage: 'fetch_user' },
        });
      }
      const match = users.users.find((entry) => entry.email?.toLowerCase() === target_email.toLowerCase());
      if (!match) {
        return respondWithTelemetry(NextResponse.json({ error: 'User not found for provided email' }, { status: 404 }), {
          adminUserId: authResult.userId,
          targetType: 'feature_flag',
          targetId: params.flagId,
        });
      }
      userId = match.id;
    } else {
      return respondWithTelemetry(
        NextResponse.json({ error: 'Provide target_id or target_email for user overrides' }, { status: 400 }),
        {
          adminUserId: authResult.userId,
          targetType: 'feature_flag',
          targetId: params.flagId,
        }
      );
    }
  }

  const conflictTarget =
    target_type === 'account' ? 'feature_flag_id,account_id' : 'feature_flag_id,user_id';

  const { data, error } = await admin
    .from('feature_flag_overrides')
    .upsert(
      {
        feature_flag_id: params.flagId,
        account_id: accountId,
        user_id: userId,
        is_enabled,
      },
      { onConflict: conflictTarget }
    )
    .select('id, feature_flag_id, account_id, user_id, is_enabled, created_at, updated_at, accounts(name)')
    .single();

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: params.flagId,
    });
  }

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_OVERRIDE_UPSERT',
    target_type: 'feature_flag',
    target_id: params.flagId,
    metadata: {
      override_id: data.id,
      target_type,
      account_id: accountId,
      user_id: userId,
      is_enabled,
    },
  });

  const enriched = await enrichOverrides([data]);

  return respondWithTelemetry(NextResponse.json({ override: enriched[0] }), {
    adminUserId: authResult.userId,
    targetType: 'feature_flag',
    targetId: params.flagId,
    metadata: {
      account_id: accountId,
      user_id: userId,
      is_enabled,
    },
  });
});
