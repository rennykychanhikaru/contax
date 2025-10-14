import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

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

async function fetchOverride(
  admin: ReturnType<typeof getAdminClient>,
  overrideId: string
) {
  const { data, error } = await admin
    .from('feature_flag_overrides')
    .select('id, feature_flag_id, account_id, user_id, is_enabled, created_at, updated_at, accounts(name)')
    .eq('id', overrideId)
    .maybeSingle();

  if (error) {
    return { error };
  }

  return { data };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { flagId: string; overrideId: string } }
) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);

  if (!payload || typeof payload !== 'object' || typeof payload.is_enabled !== 'boolean') {
    return NextResponse.json({ error: 'is_enabled boolean is required' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { data: existing, error: fetchError } = await fetchOverride(admin, params.overrideId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!existing || existing.feature_flag_id !== params.flagId) {
    return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('feature_flag_overrides')
    .update({ is_enabled: payload.is_enabled })
    .eq('id', params.overrideId)
    .eq('feature_flag_id', params.flagId)
    .select('id, feature_flag_id, account_id, user_id, is_enabled, created_at, updated_at, accounts(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_OVERRIDE_UPDATED',
    target_type: 'feature_flag',
    target_id: params.flagId,
    metadata: {
      override_id: data.id,
      is_enabled: data.is_enabled,
    },
  });

  const [override] = await enrichOverrides([data]);

  return NextResponse.json({ override });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { flagId: string; overrideId: string } }
) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();

  const { data: existing, error: fetchError } = await fetchOverride(admin, params.overrideId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!existing || existing.feature_flag_id !== params.flagId) {
    return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  }

  const { error } = await admin
    .from('feature_flag_overrides')
    .delete()
    .eq('id', params.overrideId)
    .eq('feature_flag_id', params.flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_OVERRIDE_DELETED',
    target_type: 'feature_flag',
    target_id: params.flagId,
    metadata: {
      override_id: params.overrideId,
      account_id: existing.account_id,
      user_id: existing.user_id,
    },
  });

  return NextResponse.json({ success: true });
}
