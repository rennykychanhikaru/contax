import { Buffer } from 'buffer';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/db/admin';
import { isFeatureEnabledCached } from '@/lib/feature-flags/cache';

const SUPER_ADMIN_PANEL_FLAG_KEY = process.env.SUPER_ADMIN_PANEL_FLAG_KEY ?? 'super-admin-panel';
const REQUIRE_MFA =
  (process.env.SUPER_ADMIN_REQUIRE_MFA ?? 'true').toLowerCase() !== 'false';
const ALLOWED_MFA_METHODS = new Set(['webauthn', 'totp']);

function extractAccessToken(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith('base64-')) {
    try {
      const decoded = Buffer.from(raw.slice(7), 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as { access_token?: string } | null;
      return typeof parsed?.access_token === 'string' ? parsed.access_token : null;
    } catch {
      return null;
    }
  }
  return raw;
}

function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let payload = parts[1];
    const padLength = payload.length % 4;
    if (padLength) {
      payload += '='.repeat(4 - padLength);
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Guard utility to ensure the incoming request is from a super admin.
 * Returns a NextResponse on failure or null on success.
 */
export async function requireSuperAdmin(req: NextRequest): Promise<NextResponse | { userId: string }> {
  const accessToken =
    extractAccessToken(req.cookies.get('sb-access-token')?.value) ??
    extractAccessToken(req.cookies.get('sb-127-auth-token')?.value) ??
    extractAccessToken(
      req.cookies
        .getAll()
        .find((cookie) => cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token'))
        ?.value
    ) ??
    null;
  const payload = decodeJwtPayload(accessToken);
  const amrEntries = Array.isArray(payload?.amr) ? (payload!.amr as unknown[]) : [];
  const hasStepUpMfa = amrEntries.some((entry) => {
    if (typeof entry === 'string') {
      return ALLOWED_MFA_METHODS.has(entry);
    }
    if (entry && typeof entry === 'object' && 'method' in entry) {
      const method = (entry as { method?: unknown }).method;
      return typeof method === 'string' && ALLOWED_MFA_METHODS.has(method);
    }
    return false;
  });
  const userId = typeof payload?.sub === 'string' ? (payload.sub as string) : null;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (REQUIRE_MFA && !hasStepUpMfa) {
    return NextResponse.json(
      { error: 'Step-up MFA required', step_up_required: true },
      { status: 403 }
    );
  }

  const admin = getAdminClient();

  const { data: isSuperAdmin, error: superAdminError } = await admin.rpc('is_super_admin', {
    p_user_id: userId,
  });

  if (superAdminError) {
    return NextResponse.json({ error: superAdminError.message }, { status: 500 });
  }

  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden: Super admin access required' }, { status: 403 });
  }

  let panelEnabled = true;
  try {
    panelEnabled = await isFeatureEnabledCached(admin, SUPER_ADMIN_PANEL_FLAG_KEY);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!panelEnabled) {
    return NextResponse.json({ error: 'Super admin panel is not enabled' }, { status: 404 });
  }

  return { userId };
}
