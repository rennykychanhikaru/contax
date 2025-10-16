import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

function formatCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const asString = String(value);
      if (asString.includes('"') || asString.includes(',') || asString.includes('\n')) {
        return `"${asString.replace(/"/g, '""')}"`;
      }
      return asString;
    })
    .join(',');
}

const HEADER = [
  'id',
  'admin_user_id',
  'action_type',
  'target_type',
  'target_id',
  'metadata',
  'ip_address',
  'user_agent',
  'created_at',
];

export const GET = withAdminTelemetry('GET /api/admin/audit/export', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const url = new URL(req.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const actionType = url.searchParams.get('actionType')?.trim();
  const adminId = url.searchParams.get('adminUserId')?.trim();
  const targetType = url.searchParams.get('targetType')?.trim();

  const respond = (response: Response, metadata?: Record<string, unknown>) =>
    respondWithTelemetry(response, {
      adminUserId: authResult.userId,
      metadata,
    });

  const admin = getAdminClient();

  let query = admin
    .from('admin_audit_log')
    .select('id, admin_user_id, action_type, target_type, target_id, metadata, ip_address, user_agent, created_at')
    .order('created_at', { ascending: false });

  if (start) {
    const parsed = new Date(start);
    if (Number.isNaN(parsed.getTime())) {
      return respond(NextResponse.json({ error: 'Invalid start date' }, { status: 400 }), {
        stage: 'validation',
      });
    }
    query = query.gte('created_at', parsed.toISOString());
  }

  if (end) {
    const parsed = new Date(end);
    if (Number.isNaN(parsed.getTime())) {
      return respond(NextResponse.json({ error: 'Invalid end date' }, { status: 400 }), {
        stage: 'validation',
      });
    }
    parsed.setUTCHours(23, 59, 59, 999);
    query = query.lte('created_at', parsed.toISOString());
  }

  if (actionType) {
    query = query.eq('action_type', actionType);
  }

  if (adminId) {
    query = query.eq('admin_user_id', adminId);
  }

  if (targetType) {
    query = query.eq('target_type', targetType);
  }

  const { data, error } = await query;

  if (error) {
    return respond(NextResponse.json({ error: error.message }, { status: 500 }), {
      stage: 'fetch_audit',
    });
  }

  const csvRows = [
    HEADER.join(','),
    ...(data ?? []).map((row) =>
      formatCsvRow([
        row.id,
        row.admin_user_id,
        row.action_type,
        row.target_type,
        row.target_id,
        row.metadata ? JSON.stringify(row.metadata) : '',
        row.ip_address,
        row.user_agent,
        row.created_at,
      ])
    ),
  ];

  const csvContent = csvRows.join('\n');

  return respond(
    new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="admin-audit-log-${Date.now()}.csv"`,
      },
    }),
    {
      start,
      end,
      actionType,
      adminId,
      targetType,
      rowCount: data?.length ?? 0,
    }
  );
});
