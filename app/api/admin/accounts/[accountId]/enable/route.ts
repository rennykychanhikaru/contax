import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

export const POST = withAdminTelemetry('POST /api/admin/accounts/[accountId]/enable', async (
  req: NextRequest,
  { params }: { params: { accountId: string } }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('accounts')
    .update({
      is_disabled: false,
      disabled_at: null,
      disabled_by: null,
      disabled_reason: null,
    })
    .eq('id', params.accountId)
    .select('id')
    .maybeSingle();

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: params.accountId,
    });
  }

  if (!data) {
    return respondWithTelemetry(NextResponse.json({ error: 'Account not found' }, { status: 404 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: params.accountId,
    });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'ACCOUNT_ENABLED',
    target_type: 'account',
    target_id: params.accountId,
  });

  if (auditError) {
    return respondWithTelemetry(NextResponse.json({ error: auditError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: params.accountId,
    });
  }

  return respondWithTelemetry(NextResponse.json({ success: true }), {
    adminUserId: authResult.userId,
    targetType: 'account',
    targetId: params.accountId,
  });
});
