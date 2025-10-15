import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

const TARGET_TYPES = new Set(['global', 'account', 'user']);

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('feature_flags')
    .select('*')
    .order('flag_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flags: data });
}

export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = await req.json().catch(() => null);

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { flag_key, flag_name, description, target_type = 'global', is_enabled = false } = payload;

  if (!flag_key || !flag_name || !TARGET_TYPES.has(target_type)) {
    return NextResponse.json(
      { error: 'flag_key, flag_name, and valid target_type are required' },
      { status: 400 }
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_user_id: authResult.userId,
    action_type: 'FEATURE_FLAG_CREATED',
    target_type: 'feature_flag',
    target_id: data.id,
    metadata: { flag_key, flag_name, target_type, is_enabled },
  });

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
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
    return NextResponse.json({ error: analyticsError.message }, { status: 500 });
  }

  return NextResponse.json({ flag: data });
}
