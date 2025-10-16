import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { respondWithTelemetry, withAdminTelemetry } from '@/lib/monitoring/telemetry';

export const GET = withAdminTelemetry('GET /api/admin/check-access', async (req: NextRequest) => {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  return respondWithTelemetry(NextResponse.json({ ok: true }), {
    adminUserId: authResult.userId,
  });
});
