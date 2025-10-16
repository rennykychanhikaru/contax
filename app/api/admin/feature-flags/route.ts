import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

const TARGET_TYPES = new Set(['global', 'account', 'user']);

export const GET = withAdminTelemetry('GET /api/admin/feature-flags', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('feature_flags')
    .select('*')
    .order('flag_name', { ascending: true });

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
    });
  }

  return respondWithTelemetry(NextResponse.json({ flags: data }), {
    adminUserId: authResult.userId,
    metadata: { total: data?.length ?? 0 },
  });
});

export const POST = withAdminTelemetry('POST /api/admin/feature-flags', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);

  if (!payload || typeof payload !== 'object') {
    return respondWithTelemetry(NextResponse.json({ error: 'Invalid body' }, { status: 400 }), {
      adminUserId: authResult.userId,
    });
  }

  const { flag_key, flag_name, description, target_type = 'global', is_enabled = false } = payload;

  if (!flag_key || !flag_name || !TARGET_TYPES.has(target_type)) {
    return respondWithTelemetry(
      NextResponse.json(
        { error: 'flag_key, flag_name, and valid target_type are required' },
        { status: 400 }
      ),
      {
        adminUserId: authResult.userId,
        metadata: { flag_key, flag_name, target_type },
      }
    );
  }

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('feature_flags')
    .insert({
      flag_key,
      flag_name,
      description,
      target_type,
      is_enabled,
    })
    .select()
    .single();

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      metadata: { flag_key, flag_name, target_type },
    });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_CREATED',
    target_type: 'feature_flag',
    target_id: data.id,
    metadata: { flag_key, flag_name, target_type, is_enabled },
  });

  if (auditError) {
    return respondWithTelemetry(NextResponse.json({ error: auditError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: data.id,
      metadata: { flag_key },
    });
  }

  const { error: analyticsError } = await admin.from('feature_flag_usage_events').insert({
    feature_flag_id: data.id,
    flag_key: data.flag_key,
    user_id: authResult.userId,
    was_enabled: data.is_enabled,
    source: 'admin:create',
    metadata: { target_type: data.target_type },
  });

  if (analyticsError) {
    return respondWithTelemetry(NextResponse.json({ error: analyticsError.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'feature_flag',
      targetId: data.id,
      metadata: { flag_key: data.flag_key },
    });
  }

  return respondWithTelemetry(NextResponse.json({ flag: data }), {
    adminUserId: authResult.userId,
    targetType: 'feature_flag',
    targetId: data.id,
    metadata: { flag_key: data.flag_key },
  });
});
