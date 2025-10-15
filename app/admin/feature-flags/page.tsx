'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type FeatureFlag = {
  id: string;
  flag_key: string;
  flag_name: string;
  description: string | null;
  target_type: 'global' | 'account' | 'user';
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type FeatureFlagOverride = {
  id: string;
  feature_flag_id: string;
  target_type: 'account' | 'user';
  account_id: string | null;
  account_name: string | null;
  user_id: string | null;
  user_email: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

const targetOptions: FeatureFlag['target_type'][] = ['global', 'account', 'user'];

const overrideTargets = [
  { value: 'account', label: 'Account (UUID)' },
  { value: 'user', label: 'User (email or UUID)' },
] as const;

const initialFlagForm = {
  flag_key: '',
  flag_name: '',
  description: '',
  target_type: 'global' as FeatureFlag['target_type'],
  is_enabled: false,
};

const initialOverrideForm = {
  target_type: 'account' as FeatureFlagOverride['target_type'],
  identifier: '',
  is_enabled: true,
};

type FeatureFlagAnalyticsPoint = {
  flag_key: string | null;
  bucket: string | null;
  total_checks: number | null;
  enabled_checks: number | null;
};

const analyticsDayOptions = [7, 30, 90] as const;

export default function AdminFeatureFlagsPage() {
  const [flagsState, setFlagsState] = useState<FetchState<FeatureFlag[]>>({ status: 'idle' });
  const [overridesState, setOverridesState] =
    useState<FetchState<FeatureFlagOverride[]>>({ status: 'idle' });
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flagForm, setFlagForm] = useState(initialFlagForm);
  const [overrideForm, setOverrideForm] = useState(initialOverrideForm);
  const [flagSubmitError, setFlagSubmitError] = useState<string | null>(null);
  const [overrideSubmitError, setOverrideSubmitError] = useState<string | null>(null);
  const [isCreatingFlag, setIsCreatingFlag] = useState(false);
  const [isCreatingOverride, setIsCreatingOverride] = useState(false);
  const [analyticsState, setAnalyticsState] =
    useState<FetchState<FeatureFlagAnalyticsPoint[]>>({ status: 'idle' });
  const [analyticsDays, setAnalyticsDays] =
    useState<(typeof analyticsDayOptions)[number]>(30);

  const fetchFlags = useCallback(async () => {
    setFlagsState({ status: 'loading' });
    try {
      const res = await fetch('/api/admin/feature-flags', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load feature flags');
      }
      const body = (await res.json()) as { flags: FeatureFlag[] };
      setFlagsState({ status: 'success', data: body.flags });
      if (!selectedFlagId && body.flags.length > 0) {
        setSelectedFlagId(body.flags[0].id);
      }
    } catch (error) {
      setFlagsState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }, [selectedFlagId]);

  useEffect(() => {
    if (flagsState.status === 'idle') {
      fetchFlags();
    }
  }, [fetchFlags, flagsState.status]);

  const selectedFlag = useMemo(() => {
    if (flagsState.status !== 'success' || !selectedFlagId) return null;
    return flagsState.data.find((flag) => flag.id === selectedFlagId) ?? null;
  }, [flagsState, selectedFlagId]);

  const selectedFlagKey = selectedFlag?.flag_key ?? null;

  const filteredFlags = useMemo(() => {
    if (flagsState.status !== 'success') return [];
    const term = search.trim().toLowerCase();
    const dataset = [...flagsState.data].sort((a, b) =>
      a.flag_name.localeCompare(b.flag_name)
    );
    if (!term) return dataset;
    return dataset.filter(
      (flag) =>
        flag.flag_name.toLowerCase().includes(term) ||
        flag.flag_key.toLowerCase().includes(term)
    );
  }, [flagsState, search]);

  const fetchOverrides = useCallback(async (flagId: string) => {
    setOverridesState({ status: 'loading' });
    try {
      const res = await fetch(`/api/admin/feature-flags/${flagId}/overrides`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load overrides');
      }
      const body = (await res.json()) as { overrides: FeatureFlagOverride[] };
      setOverridesState({ status: 'success', data: body.overrides });
    } catch (error) {
      setOverridesState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }, []);

  const fetchAnalytics = useCallback(async (flagKey: string, days: number) => {
    setAnalyticsState({ status: 'loading' });
    try {
      const params = new URLSearchParams({
        flagKey,
        days: String(days),
      });
      const res = await fetch(`/api/admin/feature-flags/analytics?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error ? String(payload.error) : 'Failed to load analytics for this flag'
        );
      }
      const summary = Array.isArray(payload?.summary)
        ? (payload.summary as FeatureFlagAnalyticsPoint[])
        : [];
      setAnalyticsState({ status: 'success', data: summary });
    } catch (error) {
      setAnalyticsState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }, []);

  useEffect(() => {
    if (selectedFlagId) {
      fetchOverrides(selectedFlagId);
    } else {
      setOverridesState({ status: 'idle' });
    }
  }, [selectedFlagId, fetchOverrides]);

  useEffect(() => {
    if (!selectedFlagKey) {
      setAnalyticsState({ status: 'idle' });
      return;
    }
    fetchAnalytics(selectedFlagKey, analyticsDays);
  }, [selectedFlagKey, analyticsDays, fetchAnalytics]);

  const analyticsTotals = useMemo(() => {
    if (analyticsState.status !== 'success') {
      return null;
    }
    return analyticsState.data.reduce(
      (acc, point) => {
        const total = point.total_checks ?? 0;
        const enabled = point.enabled_checks ?? 0;
        return {
          total: acc.total + total,
          enabled: acc.enabled + enabled,
        };
      },
      { total: 0, enabled: 0 }
    );
  }, [analyticsState]);

  const disabledTotal = analyticsTotals
    ? Math.max(analyticsTotals.total - analyticsTotals.enabled, 0)
    : 0;

  const handleAnalyticsRetry = useCallback(() => {
    if (!selectedFlagKey) return;
    fetchAnalytics(selectedFlagKey, analyticsDays);
  }, [selectedFlagKey, analyticsDays, fetchAnalytics]);

  const handleCreateFlag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingFlag(true);
    setFlagSubmitError(null);

    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flag_key: flagForm.flag_key.trim(),
          flag_name: flagForm.flag_name.trim(),
          description: flagForm.description.trim() || null,
          target_type: flagForm.target_type,
          is_enabled: flagForm.is_enabled,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to create feature flag');
      }

      const body = (await res.json()) as { flag: FeatureFlag };
      setFlagForm(initialFlagForm);
      setSelectedFlagId(body.flag.id);
      await fetchFlags();
    } catch (error) {
      setFlagSubmitError(error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setIsCreatingFlag(false);
    }
  };

  const handleCreateOverride = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFlagId) return;
    setIsCreatingOverride(true);
    setOverrideSubmitError(null);

    try {
      const payload: Record<string, unknown> = {
        target_type: overrideForm.target_type,
        is_enabled: overrideForm.is_enabled,
      };

      if (overrideForm.target_type === 'account') {
        payload.target_id = overrideForm.identifier.trim();
      } else {
        const trimmed = overrideForm.identifier.trim();
        if (trimmed.includes('@')) {
          payload.target_email = trimmed;
        } else {
          payload.target_id = trimmed;
        }
      }

      const res = await fetch(`/api/admin/feature-flags/${selectedFlagId}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to upsert override');
      }

      setOverrideForm(initialOverrideForm);
      await fetchOverrides(selectedFlagId);
    } catch (error) {
      setOverrideSubmitError(error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setIsCreatingOverride(false);
    }
  };

  const handleToggleOverride = async (override: FeatureFlagOverride) => {
    if (!selectedFlagId) return;
    try {
      const res = await fetch(
        `/api/admin/feature-flags/${selectedFlagId}/overrides/${override.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_enabled: !override.is_enabled }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to update override');
      }
      await fetchOverrides(selectedFlagId);
    } catch (error) {
      setOverrideSubmitError(error instanceof Error ? error.message : 'Unexpected error');
    }
  };

  const handleDeleteOverride = async (overrideId: string) => {
    if (!selectedFlagId) return;
    try {
      const res = await fetch(
        `/api/admin/feature-flags/${selectedFlagId}/overrides/${overrideId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to delete override');
      }
      await fetchOverrides(selectedFlagId);
    } catch (error) {
      setOverrideSubmitError(error instanceof Error ? error.message : 'Unexpected error');
    }
  };

  const renderStatusBadge = (enabled: boolean) => (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Feature Flags</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage platform toggles, scope overrides, and keep audit trails for every change.
        </p>
      </header>

      <form
        onSubmit={handleCreateFlag}
        className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h3 className="text-lg font-medium text-gray-900">Create Feature Flag</h3>
          <p className="text-sm text-gray-500">
            Keys should be stable (kebab-case recommended). Target controls the default scope.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Flag Key
            <input
              required
              value={flagForm.flag_key}
              onChange={(event) =>
                setFlagForm((prev) => ({ ...prev, flag_key: event.target.value }))
              }
              placeholder="super-admin-panel"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Display Name
            <input
              required
              value={flagForm.flag_name}
              onChange={(event) =>
                setFlagForm((prev) => ({ ...prev, flag_name: event.target.value }))
              }
              placeholder="Super Admin Panel"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Target Type
            <select
              value={flagForm.target_type}
              onChange={(event) =>
                setFlagForm((prev) => ({
                  ...prev,
                  target_type: event.target.value as FeatureFlag['target_type'],
                }))
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {targetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Enabled by Default
            <select
              value={flagForm.is_enabled ? 'true' : 'false'}
              onChange={(event) =>
                setFlagForm((prev) => ({ ...prev, is_enabled: event.target.value === 'true' }))
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Description
          <textarea
            value={flagForm.description}
            onChange={(event) =>
              setFlagForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Short context to help future operators."
            rows={3}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {flagSubmitError && <p className="text-sm text-red-600">{flagSubmitError}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isCreatingFlag}
            className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingFlag ? 'Creating…' : 'Create Flag'}
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Existing Flags</h3>
            <p className="text-sm text-gray-500">
              Click a row to view overrides. Use the search to filter by name or key.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search flags…"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64"
            />
            <button
              onClick={fetchFlags}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              type="button"
            >
              Refresh
            </button>
          </div>
        </header>

        {flagsState.status === 'loading' && (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Loading feature flags…</div>
        )}

        {flagsState.status === 'error' && (
          <div className="px-6 py-10 text-center text-sm text-red-600">{flagsState.message}</div>
        )}

        {flagsState.status === 'success' && filteredFlags.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No matching feature flags. Adjust your search or create a new flag above.
          </div>
        )}

        {flagsState.status === 'success' && filteredFlags.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Key
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Target
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Enabled
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Updated
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredFlags.map((flag) => {
                  const isSelected = flag.id === selectedFlagId;
                  return (
                    <tr
                      key={flag.id}
                      onClick={() => setSelectedFlagId(flag.id)}
                      className={`cursor-pointer px-6 transition hover:bg-indigo-50 ${
                        isSelected ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-900">
                        {flag.flag_key}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{flag.flag_name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{flag.target_type}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">{renderStatusBadge(flag.is_enabled)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {new Date(flag.updated_at || flag.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{flag.description || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedFlag && (
        <section className="grid gap-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <header className="space-y-1">
            <h3 className="text-lg font-medium text-gray-900">{selectedFlag.flag_name}</h3>
            <p className="text-sm text-gray-500">
              Managing overrides for <span className="font-mono text-gray-700">{selectedFlag.flag_key}</span>
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-gray-500">Target</p>
              <p className="text-sm text-gray-900">{selectedFlag.target_type}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Default status</p>
              <p className="text-sm text-gray-900">{renderStatusBadge(selectedFlag.is_enabled)}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs uppercase text-gray-500">Description</p>
              <p className="text-sm text-gray-900">{selectedFlag.description || '—'}</p>
            </div>
          </div>

          <form
            onSubmit={handleCreateOverride}
            className="grid gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4"
          >
            <div>
              <h4 className="text-sm font-medium text-gray-900">Add Override</h4>
              <p className="text-xs text-gray-500">
                Target a full account or an individual user. Email lookups use Supabase Auth.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-xs font-medium text-gray-700">
                Target Type
                <select
                  value={overrideForm.target_type}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({
                      ...prev,
                      target_type: event.target.value as FeatureFlagOverride['target_type'],
                      identifier: '',
                    }))
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {overrideTargets.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-gray-700 md:col-span-2">
                {overrideForm.target_type === 'account'
                  ? 'Account ID (UUID)'
                  : 'User email (preferred) or user UUID'}
                <input
                  required
                  value={overrideForm.identifier}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, identifier: event.target.value }))
                  }
                  placeholder={
                    overrideForm.target_type === 'account'
                      ? '624387dd-917e-497c-b7ea-7730429c064d'
                      : 'admin@example.com'
                  }
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-gray-700">
              Override Value
              <select
                value={overrideForm.is_enabled ? 'true' : 'false'}
                onChange={(event) =>
                  setOverrideForm((prev) => ({
                    ...prev,
                    is_enabled: event.target.value === 'true',
                  }))
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 md:w-48"
              >
                <option value="true">Enable</option>
                <option value="false">Disable</option>
              </select>
            </label>

            {overrideSubmitError && <p className="text-sm text-red-600">{overrideSubmitError}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isCreatingOverride}
                className="inline-flex items-center rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingOverride ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </form>

          <div className="rounded border border-gray-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Usage analytics</h4>
                <p className="text-xs text-gray-500">
                  Evaluations recorded during the past {analyticsDays} days.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={analyticsDays}
                  onChange={(event) =>
                    setAnalyticsDays(
                      Number(event.target.value) as (typeof analyticsDayOptions)[number]
                    )
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {analyticsDayOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} days
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAnalyticsRetry}
                  disabled={analyticsState.status === 'loading'}
                  className="rounded border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Refresh
                </button>
              </div>
            </div>

            {analyticsState.status === 'loading' && (
              <p className="mt-4 text-sm text-gray-500">Loading analytics&hellip;</p>
            )}

            {analyticsState.status === 'error' && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{analyticsState.message ?? 'Failed to load analytics for this flag.'}</p>
                <button
                  type="button"
                  onClick={handleAnalyticsRetry}
                  className="mt-3 inline-flex items-center rounded bg-red-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-1 focus:ring-red-500 focus:ring-offset-1"
                >
                  Retry
                </button>
              </div>
            )}

            {analyticsState.status === 'success' && analyticsState.data.length === 0 && (
              <p className="mt-4 text-sm text-gray-500">
                No usage recorded for this feature flag in the selected window.
              </p>
            )}

            {analyticsState.status === 'success' && analyticsState.data.length > 0 && (
              <>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded bg-indigo-50 p-3">
                    <dt className="text-xs uppercase text-indigo-800">Total checks</dt>
                    <dd className="text-lg font-semibold text-indigo-900">
                      {analyticsTotals?.total ?? 0}
                    </dd>
                  </div>
                  <div className="rounded bg-green-50 p-3">
                    <dt className="text-xs uppercase text-green-800">Enabled</dt>
                    <dd className="text-lg font-semibold text-green-900">
                      {analyticsTotals?.enabled ?? 0}
                    </dd>
                  </div>
                  <div className="rounded bg-gray-100 p-3">
                    <dt className="text-xs uppercase text-gray-600">Disabled</dt>
                    <dd className="text-lg font-semibold text-gray-800">{disabledTotal}</dd>
                  </div>
                </dl>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Date
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Total
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Enabled
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Disabled
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {analyticsState.data.map((point) => {
                        const total = point.total_checks ?? 0;
                        const enabled = point.enabled_checks ?? 0;
                        const disabled = Math.max(total - enabled, 0);
                        const key = `${point.flag_key ?? selectedFlag.flag_key}-${
                          point.bucket ?? 'bucket'
                        }`;
                        const dateLabel = point.bucket
                          ? new Date(point.bucket).toLocaleDateString()
                          : '—';
                        return (
                          <tr key={key}>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">{dateLabel}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-900">{total}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-900">{enabled}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-900">{disabled}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="rounded border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Overrides</h4>
                <p className="text-xs text-gray-500">
                  Account overrides take precedence over global flags. User overrides win last.
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectedFlagId && fetchOverrides(selectedFlagId)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                Refresh
              </button>
            </div>

            {overridesState.status === 'loading' && (
              <div className="px-6 py-8 text-center text-sm text-gray-500">Loading overrides…</div>
            )}

            {overridesState.status === 'error' && (
              <div className="px-6 py-8 text-center text-sm text-red-600">
                {overridesState.message}
              </div>
            )}

            {overridesState.status === 'success' && overridesState.data.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No overrides yet for this flag.
              </div>
            )}

            {overridesState.status === 'success' && overridesState.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Target
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Identifier
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Updated
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {overridesState.data.map((override) => (
                      <tr key={override.id}>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700">
                          {override.target_type}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {override.target_type === 'account' ? (
                            <div>
                              <div className="font-mono text-xs text-gray-700">{override.account_id}</div>
                              <div className="text-xs text-gray-500">{override.account_name ?? '—'}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-xs text-gray-700">{override.user_email ?? '—'}</div>
                              <div className="font-mono text-xs text-gray-500">{override.user_id}</div>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                          {renderStatusBadge(override.is_enabled)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                          {new Date(override.updated_at || override.created_at).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                          <button
                            type="button"
                            onClick={() => handleToggleOverride(override)}
                            className="mr-3 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                          >
                            {override.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOverride(override.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
