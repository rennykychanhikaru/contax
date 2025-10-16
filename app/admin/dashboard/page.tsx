'use client';

import { useEffect, useMemo, useState } from 'react';

const numberFormatter = new Intl.NumberFormat('en-US');

function StatCard({ title, value, description }: { title: string; value: number | string; description: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  );
}

type UsageStats = {
  totals: {
    totalCalls: number;
    last7DaysCalls: number;
    last30DaysCalls: number;
    activeAccounts: number;
  };
  topAccounts: Array<{
    accountId: string;
    accountName: string;
    last30DaysCalls: number;
    totalCalls: number;
    lastCallAt: string | null;
  }>;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const response = await fetch('/api/admin/dashboard/usage', { cache: 'no-store' });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load usage metrics');
        }
        const payload = (await response.json()) as UsageStats;
        if (isMounted) {
          setStats(payload);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unexpected error');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = useMemo(() => {
    if (!stats) {
      return [
        { title: 'Total Calls', value: '—', description: 'Aggregated across all accounts' },
        { title: 'Calls (7 days)', value: '—', description: 'Engagement over the past week' },
        { title: 'Calls (30 days)', value: '—', description: 'Rolling 30-day usage' },
        { title: 'Active Accounts', value: '—', description: 'Accounts with calls in the last 30 days' },
      ];
    }

    return [
      {
        title: 'Total Calls',
        value: numberFormatter.format(stats.totals.totalCalls),
        description: 'Aggregated across all accounts',
      },
      {
        title: 'Calls (7 days)',
        value: numberFormatter.format(stats.totals.last7DaysCalls),
        description: 'Engagement over the past week',
      },
      {
        title: 'Calls (30 days)',
        value: numberFormatter.format(stats.totals.last30DaysCalls),
        description: 'Rolling 30-day usage',
      },
      {
        title: 'Active Accounts',
        value: numberFormatter.format(stats.totals.activeAccounts),
        description: 'Accounts with calls in the last 30 days',
      },
    ];
  }, [stats]);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">
          Overview of platform health, usage, and recent administrative actions.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-lg font-medium text-gray-900">Top accounts (30 days)</h3>
          <p className="mt-1 text-sm text-gray-500">
            Based on call volume across the last 30 days. Use this to identify high-traffic tenants.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Account</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Calls (30 days)</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Total calls</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Last call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={4}>
                    Loading usage data…
                  </td>
                </tr>
              ) : stats && stats.topAccounts.length > 0 ? (
                stats.topAccounts.map((account) => (
                  <tr key={account.accountId || account.accountName}>
                    <td className="px-4 py-3 text-gray-900">{account.accountName}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {numberFormatter.format(account.last30DaysCalls)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{numberFormatter.format(account.totalCalls)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {account.lastCallAt
                        ? new Date(account.lastCallAt).toLocaleString()
                        : 'No calls recorded'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={4}>
                    No call activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
