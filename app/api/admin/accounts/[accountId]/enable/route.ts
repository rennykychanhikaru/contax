import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'ACCOUNT_ENABLED',
    target_type: 'account',
    target_id: params.accountId,
  });

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
