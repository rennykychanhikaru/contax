import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

export const POST = withAdminTelemetry('POST /api/admin/accounts/[accountId]/disable', async (
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { accountId } = await params;
  const payload = await req.json().catch(() => null);
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';

  if (!reason) {
    return respondWithTelemetry(NextResponse.json({ error: 'Reason is required' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  const admin = getAdminClient();

  const { error } = await admin.rpc('disable_account', {
    target_account_id: accountId,
    reason,
    admin_user_id: authResult.userId,
  });

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'account',
      targetId: accountId,
    });
  }

  return respondWithTelemetry(NextResponse.json({ success: true }), {
    adminUserId: authResult.userId,
    targetType: 'account',
    targetId: accountId,
    metadata: { reason },
  });
});
