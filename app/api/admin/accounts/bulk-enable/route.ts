import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

const MAX_ACCOUNTS_PER_BATCH = 10;
const MAX_BULK_ENABLES_PER_HOUR = 3;

type BulkEnablePayload = {
  accountIds?: string[];
};

const bulkEnableRateLimit = new Map<string, number[]>();

function recordBulkEnable(userId: string) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const existing = bulkEnableRateLimit.get(userId) ?? [];
  const filtered = existing.filter((ts) => ts > hourAgo);
  filtered.push(now);
  bulkEnableRateLimit.set(userId, filtered);
  return filtered.length;
}

export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: BulkEnablePayload;
  try {
    payload = (await req.json()) as BulkEnablePayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const accountIds = Array.isArray(payload.accountIds)
    ? Array.from(new Set(payload.accountIds.filter((id) => typeof id === 'string' && id.trim())))
    : [];

  if (accountIds.length === 0) {
    return NextResponse.json({ error: 'accountIds array is required' }, { status: 400 });
  }

  if (accountIds.length > MAX_ACCOUNTS_PER_BATCH) {
    return NextResponse.json(
      { error: `Cannot enable more than ${MAX_ACCOUNTS_PER_BATCH} accounts per request` },
      { status: 400 }
    );
  }

  const actionCount = recordBulkEnable(authResult.userId);
  if (actionCount > MAX_BULK_ENABLES_PER_HOUR) {
    return NextResponse.json(
      { error: `Bulk enable limit exceeded. Try again later.` },
      { status: 429 }
    );
  }

  const admin = getAdminClient();
  const succeeded: string[] = [];
  const failed: { accountId: string; error: string }[] = [];

  for (const accountId of accountIds) {
    try {
      const { data, error } = await admin
        .from('accounts')
        .update({
          is_disabled: false,
          disabled_at: null,
          disabled_by: null,
          disabled_reason: null,
        })
        .eq('id', accountId)
        .select('id')
        .maybeSingle();

      if (error || !data) {
        throw new Error(error?.message ?? 'Account not found');
      }

      const { error: auditError } = await admin.from('admin_audit_log').insert({
        admin_user_id: authResult.userId,
        action_type: 'ACCOUNT_ENABLED',
        target_type: 'account',
        target_id: accountId,
        metadata: {
          bulk: true,
        },
      });

      if (auditError) {
        throw new Error(auditError.message);
      }

      succeeded.push(accountId);
    } catch (err) {
      failed.push({
        accountId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    succeeded,
    failed,
  });
}
