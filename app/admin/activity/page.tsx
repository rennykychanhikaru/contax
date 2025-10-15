'use client';

import { useState } from 'react';

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);
const defaultEnd = toDateInputValue(new Date());
const defaultStart = toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

export default function AdminActivityPage() {
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [actionType, setActionType] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [targetType, setTargetType] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadCsv = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      if (actionType.trim()) params.set('actionType', actionType.trim());
      if (adminUserId.trim()) params.set('adminUserId', adminUserId.trim());
      if (targetType.trim()) params.set('targetType', targetType.trim());

      const res = await fetch(`/api/admin/audit/export?${params.toString()}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to export audit log');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `admin-audit-log-${Date.now()}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Activity Log</h2>
        <p className="mt-1 text-sm text-gray-600">
          Export audit history, then drill into the raw CSV for deeper analysis and alerting.
        </p>
      </header>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900">Export Audit Log (CSV)</h3>
        <p className="mt-1 text-sm text-gray-600">
          Choose a date range and optional filters. Results include action metadata and user
          identifiers.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium text-gray-700">
            Start Date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            End Date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              min={startDate || undefined}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Action Type
            <input
              value={actionType}
              onChange={(event) => setActionType(event.target.value)}
              placeholder="e.g., ACCOUNT_DISABLED"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Admin User ID
            <input
              value={adminUserId}
              onChange={(event) => setAdminUserId(event.target.value)}
              placeholder="UUID"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Target Type
            <input
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              placeholder="e.g., account"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setStartDate(defaultStart);
              setEndDate(defaultEnd);
              setActionType('');
              setAdminUserId('');
              setTargetType('');
              setError(null);
            }}
            className="inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={isDownloading}
            className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDownloading ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </div>
    </section>
  );
}
