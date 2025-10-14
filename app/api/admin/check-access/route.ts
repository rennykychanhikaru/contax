import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ ok: true });
}
