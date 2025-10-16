import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAnalytics } from '@/app/api/admin/feature-flags/analytics/route';
import { PATCH as patchFeatureFlag, DELETE as deleteFeatureFlag } from '@/app/api/admin/feature-flags/[flagId]/route';
import { GET as getNotifications } from '@/app/api/admin/notifications/route';
import { GET as exportAuditLog } from '@/app/api/admin/audit/export/route';
import { GET as getAccounts, POST as createAccount } from '@/app/api/admin/accounts/route';
import { GET as getDashboardUsage } from '@/app/api/admin/dashboard/usage/route';

type SupabaseResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

const supabaseQueues: Record<string, SupabaseResult[]> = {};

const querySpies = {
  from: vi.fn<(table: string) => void>(),
  select: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  insert: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  update: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  upsert: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  delete: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  eq: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  ilike: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  gte: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  lte: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  order: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  range: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
  limit: vi.fn<(payload: { table: string; args: unknown[] }) => void>(),
};

const adminAuth = {
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
  createUser: vi.fn(),
};

const requireSuperAdminMock = vi.fn(async () => ({ userId: 'admin-1' }));

function setSupabaseResult(table: string, result: SupabaseResult) {
  if (!supabaseQueues[table]) {
    supabaseQueues[table] = [];
  }
  supabaseQueues[table].push(result);
}

function consumeResult(table: string): SupabaseResult {
  const queue = supabaseQueues[table];
  if (!queue || queue.length === 0) {
    return { data: null, error: null, count: null };
  }
  return queue.shift()!;
}

class MockQuery {
  constructor(private readonly table: string) {}

  select(...args: unknown[]) {
    querySpies.select({ table: this.table, args });
    return this;
  }

  insert(...args: unknown[]) {
    querySpies.insert({ table: this.table, args });
    return this;
  }

  update(...args: unknown[]) {
    querySpies.update({ table: this.table, args });
    return this;
  }

  upsert(...args: unknown[]) {
    querySpies.upsert({ table: this.table, args });
    return this;
  }

  delete(...args: unknown[]) {
    querySpies.delete({ table: this.table, args });
    return this;
  }

  range(...args: unknown[]) {
    querySpies.range({ table: this.table, args });
    return this;
  }

  order(...args: unknown[]) {
    querySpies.order({ table: this.table, args });
    return this;
  }

  ilike(...args: unknown[]) {
    querySpies.ilike({ table: this.table, args });
    return this;
  }

  eq(...args: unknown[]) {
    querySpies.eq({ table: this.table, args });
    return this;
  }

  gte(...args: unknown[]) {
    querySpies.gte({ table: this.table, args });
    return this;
  }

  lte(...args: unknown[]) {
    querySpies.lte({ table: this.table, args });
    return this;
  }

  limit(...args: unknown[]) {
    querySpies.limit({ table: this.table, args });
    return this;
  }

  single() {
    return Promise.resolve(consumeResult(this.table));
  }

  maybeSingle() {
    return Promise.resolve(consumeResult(this.table));
  }

  then<TResult1 = SupabaseResult>(
    onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null
  ) {
    const result = consumeResult(this.table);
    if (!onfulfilled) {
      return Promise.resolve(result as unknown as TResult1);
    }
    return Promise.resolve(onfulfilled(result));
  }
}

function createMockClient() {
  return {
    from: (table: string) => {
      querySpies.from(table);
      return new MockQuery(table);
    },
    auth: {
      admin: adminAuth,
    },
  };
}

vi.mock('@/middleware/super-admin', () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdminMock(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => createMockClient()),
}));

vi.mock('@/lib/db/admin', () => ({
  getAdminClient: vi.fn(() => createMockClient()),
}));

beforeEach(() => {
  requireSuperAdminMock.mockReset();
  requireSuperAdminMock.mockResolvedValue({ userId: 'admin-1' });
  Object.values(querySpies).forEach((spy) => spy.mockReset());
  Object.values(adminAuth).forEach((fn) => fn.mockReset());
  adminAuth.listUsers.mockResolvedValue({ users: [], error: null });
  adminAuth.updateUserById.mockResolvedValue({ error: null });
  adminAuth.createUser.mockResolvedValue({ user: { id: 'new-user' }, error: null });
  Object.keys(supabaseQueues).forEach((key) => {
    delete supabaseQueues[key];
  });
});

describe('feature flag analytics route', () => {
  it('returns analytics summary for a given flag', async () => {
    const summary = [
      {
        flag_key: 'super-admin-panel',
        bucket: '2025-12-29T00:00:00.000Z',
        total_checks: 10,
        enabled_checks: 7,
      },
    ];

    setSupabaseResult('feature_flag_usage_summary', { data: summary, error: null });

    const response = await getAnalytics(
      new Request(
        'http://localhost/api/admin/feature-flags/analytics?flagKey=super-admin-panel&days=7'
      ) as unknown as Request
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ summary });
    expect(requireSuperAdminMock).toHaveBeenCalledTimes(1);
    expect(querySpies.eq).toHaveBeenCalledWith({
      table: 'feature_flag_usage_summary',
      args: ['flag_key', 'super-admin-panel'],
    });
    expect(querySpies.limit).toHaveBeenCalledWith({
      table: 'feature_flag_usage_summary',
      args: [12],
    });
  });

  it('omits eq filter when no flag key is provided', async () => {
    setSupabaseResult('feature_flag_usage_summary', { data: [], error: null });

    const response = await getAnalytics(
      new Request('http://localhost/api/admin/feature-flags/analytics') as unknown as Request
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ summary: [] });
    expect(querySpies.eq).not.toHaveBeenCalled();
  });

  it('returns 500 when Supabase reports an error', async () => {
    setSupabaseResult('feature_flag_usage_summary', {
      data: null,
      error: { message: 'view missing' },
    });

    const response = await getAnalytics(
      new Request('http://localhost/api/admin/feature-flags/analytics') as unknown as Request
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'view missing' });
  });
});

describe('admin notifications route', () => {
  it('returns recent audit events honoring limit parameter', async () => {
    const events = [
      {
        id: '1',
        action_type: 'FEATURE_FLAG_CREATED',
        target_type: 'feature_flag',
        target_id: 'flag-1',
        metadata: { flag_key: 'new-flag' },
        created_at: '2025-12-29T12:00:00.000Z',
      },
    ];

    setSupabaseResult('admin_audit_log', { data: events, error: null });

    const response = await getNotifications(
      new Request('http://localhost/api/admin/notifications?limit=3') as unknown as Request
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events });
    expect(querySpies.limit).toHaveBeenCalledWith({
      table: 'admin_audit_log',
      args: [3],
    });
  });

  it('surfaces errors from Supabase', async () => {
    setSupabaseResult('admin_audit_log', {
      data: null,
      error: { message: 'permission denied' },
    });

    const response = await getNotifications(
      new Request('http://localhost/api/admin/notifications') as unknown as Request
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'permission denied' });
  });
});

describe('admin audit export route', () => {
  it('returns CSV payload with expected headers', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_735_497_600_000);
    const rows = [
      {
        id: 'log-1',
        admin_user_id: 'admin-1',
        action_type: 'FEATURE_FLAG_CREATED',
        target_type: 'feature_flag',
        target_id: 'flag-1',
        metadata: { flag_key: 'beta-feature' },
        ip_address: '127.0.0.1',
        user_agent: 'Vitest',
        created_at: '2025-12-29T12:00:00.000Z',
      },
    ];

    setSupabaseResult('admin_audit_log', { data: rows, error: null });

    const response = await exportAuditLog(
      new Request('http://localhost/api/admin/audit/export?start=2025-12-01') as unknown as Request
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain(
      'admin-audit-log-1735497600000'
    );
    const body = await response.text();
    expect(body.split('\n')).toEqual([
      'id,admin_user_id,action_type,target_type,target_id,metadata,ip_address,user_agent,created_at',
      'log-1,admin-1,FEATURE_FLAG_CREATED,feature_flag,flag-1,"{""flag_key"":""beta-feature""}",127.0.0.1,Vitest,2025-12-29T12:00:00.000Z',
    ]);
    expect(querySpies.gte).toHaveBeenCalledWith({
      table: 'admin_audit_log',
      args: ['created_at', '2025-12-01T00:00:00.000Z'],
    });
    nowSpy.mockRestore();
  });

  it('rejects invalid start date', async () => {
    const response = await exportAuditLog(
      new Request('http://localhost/api/admin/audit/export?start=not-a-date') as unknown as Request
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid start date' });
  });

  it('propagates Supabase errors', async () => {
    setSupabaseResult('admin_audit_log', {
      data: null,
      error: { message: 'database error' },
    });

    const response = await exportAuditLog(
      new Request('http://localhost/api/admin/audit/export') as unknown as Request
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'database error' });
  });
});

describe('accounts route', () => {
  it('returns filtered accounts with break-glass metadata', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    setSupabaseResult('accounts', {
      data: [
        {
          id: 'acct-1',
          name: 'Acme',
          is_super_admin: false,
          is_disabled: false,
          disabled_at: null,
          disabled_by: null,
          disabled_reason: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
          account_user: [],
          break_glass_overrides: [
            {
              id: 'bg-1',
              expires_at: future,
              revoked_at: null,
            },
          ],
        },
      ],
      error: null,
      count: 1,
    });

    const response = await getAccounts(
      new Request('http://localhost/api/admin/accounts?limit=1&hasBreakGlass=true') as unknown as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accounts).toEqual([
      expect.objectContaining({
        id: 'acct-1',
        name: 'Acme',
        has_active_break_glass: true,
      }),
    ]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it('validates createdAfter date', async () => {
    const response = await getAccounts(
      new Request('http://localhost/api/admin/accounts?createdAfter=bad-date') as unknown as Request
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid createdAfter date' });
  });

  it('surfaces Supabase errors', async () => {
    setSupabaseResult('accounts', { data: null, error: { message: 'boom' }, count: null });

    const response = await getAccounts(
      new Request('http://localhost/api/admin/accounts') as unknown as Request
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'boom' });
  });

  it('creates a new account with a new owner', async () => {
    adminAuth.listUsers.mockResolvedValueOnce({ users: [], error: null });
    adminAuth.createUser.mockResolvedValueOnce({
      user: { id: 'user-123', user_metadata: {} },
      error: null,
    });

    setSupabaseResult('organization_members', { data: null, error: null });
    setSupabaseResult('organizations', {
      data: {
        id: 'org-1',
        name: 'Acme',
        timezone: 'America/New_York',
        business_hours: {},
        settings: {},
      },
      error: null,
    });
    setSupabaseResult('organization_members', { data: null, error: null });
    setSupabaseResult('users', { data: null, error: null });
    setSupabaseResult('admin_audit_log', { data: null, error: null });

    const randomSpy = vi
      .spyOn(crypto, 'randomBytes')
      .mockReturnValue(Buffer.from('temporary-pass!'));

    const response = await createAccount(
      new Request('http://localhost/api/admin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', ownerEmail: 'owner@example.com' }),
      }) as unknown as Request
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account).toEqual(
      expect.objectContaining({
        id: 'org-1',
        name: 'Acme',
      })
    );
    expect(body.owner).toEqual({
      id: 'user-123',
      email: 'owner@example.com',
      existingUser: false,
    });
    expect(typeof body.temporaryPassword).toBe('string');
    expect(adminAuth.createUser).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: expect.any(String),
      email_confirm: true,
      user_metadata: { force_password_reset: true },
    });
    randomSpy.mockRestore();
  });

  it('rejects payloads missing account name', async () => {
    const response = await createAccount(
      new Request('http://localhost/api/admin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerEmail: 'owner@example.com' }),
      }) as unknown as Request
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Account name is required' });
  });

  it('prevents creating an account when user already belongs to another org', async () => {
    adminAuth.listUsers.mockResolvedValueOnce({
      users: [{ id: 'user-789', user_metadata: {} }],
      error: null,
    });
    adminAuth.updateUserById.mockResolvedValueOnce({ error: null });

    setSupabaseResult('organization_members', {
      data: { organization_id: 'existing-org' },
      error: null,
    });

    const response = await createAccount(
      new Request('http://localhost/api/admin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', ownerEmail: 'owner@example.com' }),
      }) as unknown as Request
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'User already belongs to an organization. Invite them instead.',
    });
    expect(adminAuth.createUser).not.toHaveBeenCalled();
  });
});

describe('dashboard usage route', () => {
  it('aggregates usage metrics', async () => {
    setSupabaseResult('admin_account_usage_summary', {
      data: [
        {
          account_id: 'acct-1',
          name: 'Acme',
          total_calls: 20,
          last_7d_calls: 5,
          last_30d_calls: 15,
          last_call_at: '2025-12-29T10:00:00.000Z',
        },
        {
          account_id: 'acct-2',
          name: 'Globex',
          total_calls: 5,
          last_7d_calls: 2,
          last_30d_calls: 3,
          last_call_at: '2025-12-27T12:00:00.000Z',
        },
      ],
      error: null,
    });

    const response = await getDashboardUsage(
      new Request('http://localhost/api/admin/dashboard/usage') as unknown as Request
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      totals: { totalCalls: number; last7DaysCalls: number; last30DaysCalls: number; activeAccounts: number };
      topAccounts: Array<{ accountId: string; accountName: string; last30DaysCalls: number; totalCalls: number }>;
    };

    expect(body.totals.totalCalls).toBe(25);
    expect(body.totals.last7DaysCalls).toBe(7);
    expect(body.totals.last30DaysCalls).toBe(18);
    expect(body.totals.activeAccounts).toBe(2);
    expect(body.topAccounts[0].accountName).toBe('Acme');
    expect(body.topAccounts[0].last30DaysCalls).toBe(15);
  });

  it('surfaces errors from Supabase', async () => {
    setSupabaseResult('admin_account_usage_summary', {
      data: null,
      error: { message: 'usage error' },
    });

    const response = await getDashboardUsage(
      new Request('http://localhost/api/admin/dashboard/usage') as unknown as Request
    );

    expect(response.status).toBe(500);
  });
});

describe('feature flag detail route', () => {
  it('updates a feature flag and records analytics', async () => {
    const flag = {
      id: 'flag-1',
      flag_key: 'beta-mode',
      is_enabled: true,
    };

    setSupabaseResult('feature_flags', { data: flag, error: null });
    setSupabaseResult('admin_audit_log', { data: null, error: null });
    setSupabaseResult('feature_flag_usage_events', { data: null, error: null });

    const response = await patchFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flag_name: 'Beta Mode', is_enabled: false }),
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.flag).toEqual(flag);
    expect(querySpies.update).toHaveBeenCalledWith({
      table: 'feature_flags',
      args: [expect.objectContaining({ flag_name: 'Beta Mode', is_enabled: false, updated_at: expect.any(String) })],
    });
  });

  it('validates target_type values', async () => {
    const response = await patchFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_type: 'invalid' }),
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid target_type' });
  });

  it('propagates Supabase update errors', async () => {
    setSupabaseResult('feature_flags', {
      data: null,
      error: { message: 'update failed' },
    });

    const response = await patchFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flag_name: 'Beta Mode' }),
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'update failed' });
  });

  it('fails when analytics logging errors', async () => {
    const flag = {
      id: 'flag-1',
      flag_key: 'beta-mode',
      is_enabled: true,
    };

    setSupabaseResult('feature_flags', { data: flag, error: null });
    setSupabaseResult('admin_audit_log', { data: null, error: null });
    setSupabaseResult('feature_flag_usage_events', {
      data: null,
      error: { message: 'analytics failed' },
    });

    const response = await patchFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flag_name: 'Beta Mode' }),
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'analytics failed' });
  });

  it('deletes a feature flag and logs audit entry', async () => {
    setSupabaseResult('feature_flags', { data: null, error: null });
    setSupabaseResult('admin_audit_log', { data: null, error: null });

    const response = await deleteFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'DELETE',
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('returns 500 when delete fails', async () => {
    setSupabaseResult('feature_flags', {
      data: null,
      error: { message: 'delete failed' },
    });

    const response = await deleteFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'DELETE',
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'delete failed' });
  });

  it('returns 500 when audit logging fails during delete', async () => {
    setSupabaseResult('feature_flags', { data: null, error: null });
    setSupabaseResult('admin_audit_log', {
      data: null,
      error: { message: 'audit failed' },
    });

    const response = await deleteFeatureFlag(
      new Request('http://localhost/api/admin/feature-flags/flag-1', {
        method: 'DELETE',
      }) as unknown as Request,
      { params: { flagId: 'flag-1' } }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'audit failed' });
  });
});
