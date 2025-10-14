import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';

  if (!reason) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }

  const admin = getAdminClient();

  const { error } = await admin.rpc('disable_account', {
    target_account_id: params.accountId,
    reason,
    admin_user_id: authResult.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
