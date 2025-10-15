import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { createClient } from '@/lib/supabase/server';

const MAX_DAYS = 180;

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const supabase = await createClient();
  const url = new URL(req.url);
  const flagKey = url.searchParams.get('flagKey');
  const daysParam = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(daysParam, MAX_DAYS)) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('feature_flag_usage_summary')
    .select('*')
    .gte('bucket', since)
    .order('bucket', { ascending: true })
    .limit(days + 5);

  if (flagKey) {
    query = query.eq('flag_key', flagKey);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summary: data ?? [] });
}
