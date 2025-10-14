import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

const TARGET_TYPES = new Set(['global', 'account', 'user']);

export async function PATCH(req: NextRequest, { params }: { params: { flagId: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const updates = await req.json().catch(() => null);

  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const allowedUpdates: Record<string, unknown> = {};

  if (typeof updates.flag_name === 'string') {
    allowedUpdates.flag_name = updates.flag_name;
  }
  if (typeof updates.description === 'string' || updates.description === null) {
    allowedUpdates.description = updates.description;
  }
  if (typeof updates.is_enabled === 'boolean') {
    allowedUpdates.is_enabled = updates.is_enabled;
  }
  if (updates.target_type !== undefined) {
    if (!TARGET_TYPES.has(updates.target_type)) {
      return NextResponse.json({ error: 'Invalid target_type' }, { status: 400 });
    }
    allowedUpdates.target_type = updates.target_type;
  }

  if (Object.keys(allowedUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
  }

  allowedUpdates.updated_at = new Date().toISOString();

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('feature_flags')
    .update(allowedUpdates)
    .eq('id', params.flagId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_UPDATED',
    target_type: 'feature_flag',
    target_id: params.flagId,
    metadata: allowedUpdates,
  });

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  return NextResponse.json({ flag: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { flagId: string } }) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();

  const { error } = await admin.from('feature_flags').delete().eq('id', params.flagId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_DELETED',
    target_type: 'feature_flag',
    target_id: params.flagId,
  });

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
