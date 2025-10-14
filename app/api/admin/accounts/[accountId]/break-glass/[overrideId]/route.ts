import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

type BreakGlassRow = {
  id: string;
  account_id: string;
  user_id: string;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ accountId: string; overrideId: string }> }
) {
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
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!override || override.account_id !== accountId) {
    return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  }

  if (override.revoked_at) {
    return NextResponse.json({ success: true });
  }

  const { error: revokeError } = await admin
    .from('account_break_glass_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: authResult.userId,
    })
    .eq('id', overrideId);

  if (revokeError) {
    return NextResponse.json({ error: revokeError.message }, { status: 500 });
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

  return NextResponse.json({ success: true });
}
