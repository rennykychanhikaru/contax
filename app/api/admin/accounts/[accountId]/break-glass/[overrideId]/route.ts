import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

type BreakGlassRow = {
  id: string;
  account_id: string;
  user_id: string;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export const DELETE = withAdminTelemetry('DELETE /api/admin/accounts/[accountId]/break-glass/[overrideId]', async (
  req: NextRequest,
  context: { params: Promise<{ accountId: string; overrideId: string }> }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { accountId, overrideId } = await context.params;

  const admin = getAdminClient();

  const { data: override, error: fetchError } = await admin
    .from<BreakGlassRow>('account_break_glass_overrides')
    .select('id, account_id, user_id, reason, expires_at, created_at, revoked_at')
    .eq('id', overrideId)
    .maybeSingle();

  if (fetchError) {
    return respondWithTelemetry(NextResponse.json({ error: fetchError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { overrideId },
    });
  }

  if (!override || override.account_id !== accountId) {
    return respondWithTelemetry(NextResponse.json({ error: 'Override not found' }, { status: 404 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { overrideId },
    });
  }

  if (override.revoked_at) {
    return respondWithTelemetry(NextResponse.json({ success: true }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { overrideId, already_revoked: true },
    });
  }

  const { error: revokeError } = await admin
    .from('account_break_glass_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: authResult.userId,
    })
    .eq('id', overrideId);

  if (revokeError) {
    return respondWithTelemetry(NextResponse.json({ error: revokeError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
      metadata: { overrideId },
    });
  }

  await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'BREAK_GLASS_REVOKED',
    target_type: 'account',
    target_id: accountId,
    metadata: {
      override_id: overrideId,
      target_user_id: override.user_id,
      reason: override.reason,
    },
  });

  return respondWithTelemetry(NextResponse.json({ success: true }), {
    adminUserId: authResult.userId,
    targetType: 'account',
    targetId: accountId,
    metadata: { overrideId, target_user_id: override.user_id },
  });
});
