import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

const TOP_LIMIT = 5;

type UsageRow = {
  account_id: string | null;
  name: string | null;
  total_calls: number | null;
  last_7d_calls: number | null;
  last_30d_calls: number | null;
  last_call_at: string | null;
};

function coerceNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export const GET = withAdminTelemetry('GET /api/admin/dashboard/usage', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdminClient();

  const { data, error } = await admin
    .from('admin_account_usage_summary')
    .select('account_id, name, total_calls, last_7d_calls, last_30d_calls, last_call_at');

  if (error) {
    return respondWithTelemetry(NextResponse.json({ error: error.message }, { status: 500 }), {
      adminUserId: authResult.userId,
      targetType: 'dashboard_usage',
    });
  }

  const rows: UsageRow[] = data ?? [];

  const totals = rows.reduce(
    (acc, row) => {
      const total = coerceNumber(row.total_calls);
      const last7 = coerceNumber(row.last_7d_calls);
      const last30 = coerceNumber(row.last_30d_calls);
      return {
        totalCalls: acc.totalCalls + total,
        last7DaysCalls: acc.last7DaysCalls + last7,
        last30DaysCalls: acc.last30DaysCalls + last30,
      };
    },
    { totalCalls: 0, last7DaysCalls: 0, last30DaysCalls: 0 }
  );

  const activeAccounts = rows.filter((row) => coerceNumber(row.last_30d_calls) > 0).length;

  const topAccounts = [...rows]
    .sort((a, b) => coerceNumber(b.last_30d_calls) - coerceNumber(a.last_30d_calls))
    .slice(0, TOP_LIMIT)
    .map((row) => ({
      accountId: row.account_id ?? '',
      accountName: row.name ?? 'Unknown account',
      last30DaysCalls: coerceNumber(row.last_30d_calls),
      totalCalls: coerceNumber(row.total_calls),
      lastCallAt: row.last_call_at,
    }));

  return respondWithTelemetry(
    NextResponse.json({
      totals: {
        totalCalls: totals.totalCalls,
        last7DaysCalls: totals.last7DaysCalls,
        last30DaysCalls: totals.last30DaysCalls,
        activeAccounts,
      },
      topAccounts,
    }),
    {
      adminUserId: authResult.userId,
      targetType: 'dashboard_usage',
      metadata: {
        rows: rows.length,
        topAccounts: topAccounts.length,
      },
    }
  );
});
