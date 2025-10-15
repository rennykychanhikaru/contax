import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 5;

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = await createClient();
  const url = new URL(req.url);
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? `${DEFAULT_LIMIT}`, 10);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 20)) : DEFAULT_LIMIT;

  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, action_type, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
