import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/middleware/super-admin';
import { getAdminClient } from '@/lib/db/admin';

const MAX_ACCOUNTS_PER_BATCH = 10;
const MAX_BULK_ACTIONS_PER_HOUR = 3;

type BulkDisablePayload = {
  accountIds?: string[];
  reason?: string;
};

const bulkDisableRateLimit = new Map<string, number[]>();

function recordBulkAction(userId: string) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const existing = bulkDisableRateLimit.get(userId) ?? [];
  const filtered = existing.filter((ts) => ts > hourAgo);
  filtered.push(now);
  bulkDisableRateLimit.set(userId, filtered);
  return filtered.length;
}

export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: BulkDisablePayload;
  try {
    payload = (await req.json()) as BulkDisablePayload;
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
      { error: `Cannot disable more than ${MAX_ACCOUNTS_PER_BATCH} accounts per request` },
      { status: 400 }
    );
  }

  const reason = payload.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: 'Reason is required for bulk disable' }, { status: 400 });
  }

  const actionCount = recordBulkAction(authResult.userId);
  if (actionCount > MAX_BULK_ACTIONS_PER_HOUR) {
    return NextResponse.json(
      { error: `Bulk disable limit exceeded. Try again later.` },
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
          is_disabled: true,
          disabled_at: new Date().toISOString(),
          disabled_by: authResult.userId,
          disabled_reason: reason,
        })
        .eq('id', accountId)
        .select('id')
        .maybeSingle();

      if (error || !data) {
        throw new Error(error?.message ?? 'Account not found');
      }

      const { error: auditError } = await admin.from('admin_audit_log').insert({
        admin_user_id: authResult.userId,
        action_type: 'ACCOUNT_DISABLED',
        target_type: 'account',
        target_id: accountId,
        metadata: {
          bulk: true,
          reason,
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
