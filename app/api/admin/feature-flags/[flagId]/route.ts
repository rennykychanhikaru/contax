import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

const TARGET_TYPES = new Set(['global', 'account', 'user']);

export const PATCH = withAdminTelemetry('PATCH /api/admin/feature-flags/[flagId]', async (
  req: NextRequest,
  { params }: { params: Promise<{ flagId: string }> }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { flagId } = await params;
  const updates = await req.json().catch(() => null);

  if (!updates || typeof updates !== 'object') {
    return respondWithTelemetry(NextResponse.json({ error: 'Invalid body' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
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
      return respondWithTelemetry(NextResponse.json({ error: 'Invalid target_type' }, { status: 400 }), {
        adminUserId: authResult.userId,
        targetType: 'feature_flag',
        targetId: flagId,
      });
    }
    allowedUpdates.target_type = updates.target_type;
  }

  if (Object.keys(allowedUpdates).length === 0) {
    return respondWithTelemetry(NextResponse.json({ error: 'No valid fields provided' }, { status: 400 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
  }

  allowedUpdates.updated_at = new Date().toISOString();

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('feature_flags')
    .update(allowedUpdates)
    .eq('id', flagId)
    .select()
    .single();

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_UPDATED',
    target_type: 'feature_flag',
    target_id: flagId,
    metadata: allowedUpdates,
  });

  if (auditError) {
    return respondWithTelemetry(NextResponse.json({ error: auditError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
      metadata: allowedUpdates,
    });
  }

  const { error: analyticsError } = await admin.from('feature_flag_usage_events').insert({
    feature_flag_id: data.id,
    flag_key: data.flag_key,
    user_id: authResult.userId,
    was_enabled: data.is_enabled,
    source: 'admin:update',
    metadata: allowedUpdates,
  });

  if (analyticsError) {
    return respondWithTelemetry(NextResponse.json({ error: analyticsError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
  }

  return respondWithTelemetry(NextResponse.json({ flag: data }), {
    adminUserId: authResult.userId,
    targetType: 'feature_flag',
    targetId: flagId,
    metadata: allowedUpdates,
  });
});

export const DELETE = withAdminTelemetry('DELETE /api/admin/feature-flags/[flagId]', async (
  req: NextRequest,
  { params }: { params: Promise<{ flagId: string }> }
) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { flagId } = await params;
  const admin = getAdminClient();

  const { error } = await admin.from('feature_flags').delete().eq('id', flagId);

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_DELETED',
    target_type: 'feature_flag',
    target_id: flagId,
  });

  if (auditError) {
    return respondWithTelemetry(NextResponse.json({ error: auditError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: flagId,
    });
  }

  return respondWithTelemetry(NextResponse.json({ success: true }), {
    adminUserId: authResult.userId,
    targetType: 'feature_flag',
    targetId: flagId,
  });
});
