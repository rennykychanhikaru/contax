'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type AccountMember = {
  user_id: string;
  email: string | null;
  role: string;
};

type Account = {
  id: string;
  name: string;
  is_super_admin: boolean;
  is_disabled: boolean;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
  account_user: AccountMember[] | null;
};

type AccountsResponse = {
  accounts: Account[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T };

type StatusFilter = 'all' | 'active' | 'disabled';

export default function AdminAccountsPage() {
  const [accountsState, setAccountsState] =
    useState<FetchState<AccountsResponse>>({ status: 'idle' });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  type DialogState =
    | {
        mode: 'disable';
        account: Account;
        reason: string;
        submitting: boolean;
        error: string | null;
      }
    | {
        mode: 'enable';
        account: Account;
        submitting: boolean;
        error: string | null;
      }
    | {
        mode: 'create';
        name: string;
        ownerEmail: string;
        customPassword: string;
        submitting: boolean;
        error: string | null;
        result?: {
          accountId: string;
          accountName: string;
          ownerEmail: string;
          temporaryPassword: string;
          ownerExisting: boolean;
        };
      }
    | null;

  const [dialog, setDialog] = useState<DialogState>(null);

  const fetchAccounts = useCallback(async () => {
    setAccountsState({ status: 'loading' });
    const params = new URLSearchParams({ limit: '100' });
    if (searchTerm) params.set('search', searchTerm);
    if (statusFilter !== 'all') {
      params.set('isDisabled', statusFilter === 'disabled' ? 'true' : 'false');
    }

    try {
      const res = await fetch(`/api/admin/accounts?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load accounts');
      }
      const body = (await res.json()) as AccountsResponse;
      setAccountsState({ status: 'success', data: body });
    } catch (error) {
      setAccountsState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }, [searchTerm, statusFilter]);

  const fetchBreakGlassOverrides = useCallback(async (accountId: string) => {
    setDialog((prev) =>
      prev && prev.mode === 'breakglass' && prev.account.id === accountId
        ? { ...prev, loadingOverrides: true, error: null }
        : prev
    );

    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/break-glass`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load overrides');
      }
      const body = (await res.json()) as { overrides: BreakGlassOverride[] };
      setDialog((prev) =>
        prev && prev.mode === 'breakglass' && prev.account.id === accountId
          ? { ...prev, overrides: body.overrides, loadingOverrides: false }
          : prev
      );
    } catch (error) {
      setDialog((prev) =>
        prev && prev.mode === 'breakglass' && prev.account.id === accountId
          ? {
              ...prev,
              loadingOverrides: false,
              error: error instanceof Error ? error.message : 'Unexpected error',
            }
          : prev
      );
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (searchInput.trim() === '' && searchTerm !== '') {
      setSearchTerm('');
    }
  }, [searchInput, searchTerm]);

  const stats = useMemo(() => {
    if (accountsState.status !== 'success') {
      return { total: 0, disabled: 0 };
    }
    const data = accountsState.data.accounts;
    return {
      total: accountsState.data.pagination.total ?? data.length,
      disabled: data.filter((account) => account.is_disabled).length,
    };
  }, [accountsState]);

  const openDisableDialog = (account: Account) => {
    setDialog({
      mode: 'disable',
      account,
      reason: '',
      submitting: false,
      error: null,
    });
  };

  const openEnableDialog = (account: Account) => {
    setDialog({
      mode: 'enable',
      account,
      submitting: false,
      error: null,
    });
  };

  const openBreakGlassDialog = (account: Account) => {
    setDialog({
      mode: 'breakglass',
      account,
      userEmail: '',
      reason: '',
      durationMinutes: 120,
      submitting: false,
      error: null,
      overrides: [],
      loadingOverrides: true,
    });
    fetchBreakGlassOverrides(account.id);
  };

  const openCreateDialog = () => {
    setDialog({
      mode: 'create',
      name: '',
      ownerEmail: '',
      customPassword: '',
      submitting: false,
      error: null,
    });
  };

  const submitBreakGlass = async () => {
    if (!dialog || dialog.mode !== 'breakglass') return;

    const email = dialog.userEmail.trim();
    const reason = dialog.reason.trim();

    if (!email || !email.includes('@')) {
      setDialog((prev) =>
        prev && prev.mode === 'breakglass'
          ? { ...prev, error: 'Valid user email is required.' }
          : prev
      );
      return;
    }

    if (!reason) {
      setDialog((prev) =>
        prev && prev.mode === 'breakglass'
          ? { ...prev, error: 'Reason is required.' }
          : prev
      );
      return;
    }

    const accountId = dialog.account.id;

    setDialog((prev) =>
      prev && prev.mode === 'breakglass'
        ? { ...prev, submitting: true, error: null, result: undefined }
        : prev
    );

    const durationMinutes = Number.isFinite(dialog.durationMinutes)
      ? Math.max(5, Math.min(dialog.durationMinutes, 720))
      : 120;

    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/break-glass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: email,
          reason,
          durationMinutes,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to create override');
      }

      const body = (await res.json()) as {
        override: BreakGlassOverride;
        temporaryPassword: string;
      };

      await fetchBreakGlassOverrides(accountId);

      setDialog((prev) =>
        prev && prev.mode === 'breakglass' && prev.account.id === accountId
          ? {
              ...prev,
              submitting: false,
              userEmail: '',
              reason: '',
              error: null,
              durationMinutes,
              result: {
                userEmail: body.override.userEmail ?? email,
                temporaryPassword: body.temporaryPassword,
                expiresAt: body.override.expiresAt,
                existingUser: true,
              },
            }
          : prev
      );
    } catch (error) {
      setDialog((prev) =>
        prev && prev.mode === 'breakglass'
          ? {
              ...prev,
              submitting: false,
              error: error instanceof Error ? error.message : 'Unexpected error',
            }
          : prev
      );
    }
  };

  const revokeBreakGlass = async (overrideId: string) => {
    if (!dialog || dialog.mode !== 'breakglass') return;

    const accountId = dialog.account.id;

    setDialog((prev) =>
      prev && prev.mode === 'breakglass'
        ? { ...prev, submitting: true, error: null }
        : prev
    );

    try {
      const res = await fetch(
        `/api/admin/accounts/${accountId}/break-glass/${overrideId}`,
        { method: 'DELETE', credentials: 'include' }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to revoke override');
      }

      await fetchBreakGlassOverrides(accountId);

      setDialog((prev) =>
        prev && prev.mode === 'breakglass'
          ? { ...prev, submitting: false, error: null }
          : prev
      );
    } catch (error) {
      setDialog((prev) =>
        prev && prev.mode === 'breakglass'
          ? {
              ...prev,
              submitting: false,
              error: error instanceof Error ? error.message : 'Unexpected error',
            }
          : prev
      );
    }
  };

  const closeDialog = () => {
    setDialog((prev) => {
      if (prev?.submitting) return prev;
      return null;
    });
  };

  const submitDisable = async () => {
    if (!dialog || dialog.mode !== 'disable') return;
    const reason = dialog.reason.trim();
    if (!reason) {
      setDialog({ ...dialog, error: 'Reason is required.' });
      return;
    }

    setDialog({ ...dialog, submitting: true, error: null });

    try {
      const res = await fetch(`/api/admin/accounts/${dialog.account.id}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to disable account');
      }

      await fetchAccounts();
      setDialog(null);
    } catch (error) {
      setDialog({
        ...dialog,
        submitting: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  const submitEnable = async () => {
    if (!dialog || dialog.mode !== 'enable') return;

    setDialog({ ...dialog, submitting: true, error: null });

    try {
      const res = await fetch(`/api/admin/accounts/${dialog.account.id}/enable`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to enable account');
      }

      await fetchAccounts();
      setDialog(null);
    } catch (error) {
      setDialog({
        ...dialog,
        submitting: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  const submitCreate = async () => {
    if (!dialog || dialog.mode !== 'create') return;
    const name = dialog.name.trim();
    const email = dialog.ownerEmail.trim();

    if (!name) {
      setDialog({ ...dialog, error: 'Account name is required.' });
      return;
    }

    if (!email || !email.includes('@')) {
      setDialog({ ...dialog, error: 'Valid owner email is required.' });
      return;
    }

    setDialog({ ...dialog, submitting: true, error: null });

    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ownerEmail: email,
          temporaryPassword: dialog.customPassword || undefined,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to create account');
      }

      const body = (await res.json()) as {
        account: { id: string; name: string };
        owner: { email: string; existingUser: boolean };
        temporaryPassword: string;
      };

      await fetchAccounts();

      setDialog({
        mode: 'create',
        name: '',
        ownerEmail: '',
        customPassword: '',
        submitting: false,
        error: null,
        result: {
          accountId: body.account.id,
          accountName: body.account.name,
          ownerEmail: body.owner.email,
          temporaryPassword: body.temporaryPassword,
          ownerExisting: body.owner.existingUser,
        },
      });
    } catch (error) {
      setDialog({
        ...dialog,
        submitting: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Accounts</h2>
        <p className="mt-1 text-sm text-gray-600">
          Disable compromised tenants, re-enable when the issue is resolved, and keep an audit trail of every action.
        </p>
      </header>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreateDialog}
          className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          New Account
        </button>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-gray-500">Total Accounts</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Disabled Accounts</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.disabled}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Active Accounts</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total - stats.disabled}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500">Filter</p>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setSearchTerm(searchInput.trim());
              }
            }}
            placeholder="Search accounts…"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-64"
          />
          <button
            type="button"
            onClick={() => setSearchTerm(searchInput.trim())}
            className="inline-flex items-center rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Search
          </button>
        </div>
        <button
          type="button"
          onClick={fetchAccounts}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Refresh
        </button>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Account Directory</h3>
            <p className="text-sm text-gray-500">
              Actions require a reason and are fully audited. Disabled tenants lose access immediately.
            </p>
          </div>
        </header>

        {accountsState.status === 'loading' && (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Loading accounts…</div>
        )}

        {accountsState.status === 'error' && (
          <div className="px-6 py-12 text-center text-sm text-red-600">
            {accountsState.message}
          </div>
        )}

        {accountsState.status === 'success' && accountsState.data.accounts.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No matching accounts found. Adjust filters or search terms.
          </div>
        )}

        {accountsState.status === 'success' && accountsState.data.accounts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Disabled Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {accountsState.data.accounts.map((account) => {
                  const isProcessing =
                    dialog &&
                    (dialog.mode === 'disable' || dialog.mode === 'enable') &&
                    dialog.submitting &&
                    dialog.account.id === account.id;
                  const isBreakGlassBusy = dialog?.mode === 'breakglass' && dialog.submitting;
                  return (
                    <tr key={account.id} className="align-top">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{account.name}</div>
                        <div className="font-mono text-xs text-gray-500">{account.id}</div>
                        {account.is_super_admin && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                            Super Admin Tenant
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {account.account_user && account.account_user.length > 0 ? (
                          <ul className="space-y-1 text-xs text-gray-600">
                            {account.account_user.map((member) => (
                              <li key={member.user_id}>
                                <span className="font-medium text-gray-900">{member.role}</span>{' '}
                                · {member.email ?? 'unknown'}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-gray-500">No members</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              account.is_disabled
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {account.is_disabled ? 'Disabled' : 'Active'}
                          </span>
                        </div>
                        {account.disabled_at && (
                          <p className="mt-2 text-xs text-gray-500">
                            Disabled{' '}
                            {new Date(account.disabled_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        )}
                        {account.disabled_by && (
                          <p className="text-xs text-gray-500">
                            By <span className="font-mono text-gray-600">{account.disabled_by}</span>
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {account.disabled_reason ? (
                          <p className="text-xs text-gray-600">{account.disabled_reason}</p>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {new Date(account.created_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-700">
                        {account.is_disabled ? (
                          <button
                            type="button"
                            onClick={() => openEnableDialog(account)}
                            disabled={isProcessing}
                            className="inline-flex items-center rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? 'Enabling…' : 'Enable'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openDisableDialog(account)}
                            disabled={isProcessing}
                            className="inline-flex items-center rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? 'Disabling…' : 'Disable'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openBreakGlassDialog(account)}
                          disabled={isBreakGlassBusy}
                          className="ml-3 inline-flex items-center rounded border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Break Glass
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {dialog.mode === 'disable' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900">Disable Account</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Provide a reason for disabling{' '}
                  <span className="font-semibold text-gray-900">{dialog.account.name}</span>. This
                  will be recorded in the audit log and shared with the responding team.
                </p>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Reason
                  <textarea
                    value={dialog.reason}
                    onChange={(event) =>
                      setDialog((prev) =>
                        prev && prev.mode === 'disable'
                          ? { ...prev, reason: event.target.value }
                          : prev
                      )
                    }
                    rows={4}
                    placeholder="Write a short operator-friendly reason…"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={dialog.submitting}
                  />
                </label>
                {dialog.error && (
                  <p className="mt-2 text-sm text-red-600">{dialog.error}</p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialog.submitting}
                    className="inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitDisable}
                    disabled={dialog.submitting || dialog.reason.trim() === ''}
                    className="inline-flex items-center rounded bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dialog.submitting ? 'Disabling…' : 'Disable Account'}
                  </button>
                </div>
              </>
            ) : dialog.mode === 'enable' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900">Enable Account</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Re-enable{' '}
                  <span className="font-semibold text-gray-900">{dialog.account.name}</span>. This
                  clears the disable reason and restores access for all members.
                </p>
                {dialog.error && (
                  <p className="mt-3 text-sm text-red-600">{dialog.error}</p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialog.submitting}
                    className="inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitEnable}
                    disabled={dialog.submitting}
                    className="inline-flex items-center rounded bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dialog.submitting ? 'Enabling…' : 'Enable Account'}
                  </button>
                </div>
              </>
            ) : dialog.mode === 'breakglass' ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900">Break-Glass Access</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Grant temporary access for{' '}
                  <span className="font-semibold text-gray-900">{dialog.account.name}</span>. The
                  account remains disabled, but the selected user can sign in with the provided
                  one-time password until the override expires.
                </p>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Target user email
                  <input
                    type="email"
                    value={dialog.userEmail}
                    onChange={(event) =>
                      setDialog((prev) =>
                        prev && prev.mode === 'breakglass'
                          ? { ...prev, userEmail: event.target.value }
                          : prev
                      )
                    }
                    placeholder="user@example.com"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={dialog.submitting}
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-gray-700">
                  Reason
                  <textarea
                    value={dialog.reason}
                    onChange={(event) =>
                      setDialog((prev) =>
                        prev && prev.mode === 'breakglass'
                          ? { ...prev, reason: event.target.value }
                          : prev
                      )
                    }
                    placeholder="Describe the incident requiring access…"
                    rows={3}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={dialog.submitting}
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-gray-700">
                  Duration (minutes)
                  <input
                    type="number"
                    min={5}
                    max={720}
                    value={dialog.durationMinutes}
                    onChange={(event) =>
                      setDialog((prev) =>
                        prev && prev.mode === 'breakglass'
                          ? { ...prev, durationMinutes: Number(event.target.value) }
                          : prev
                      )
                    }
                    className="mt-1 w-32 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={dialog.submitting}
                  />
                </label>
                {dialog.error && (
                  <p className="mt-3 text-sm text-red-600">{dialog.error}</p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialog.submitting}
                    className="inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={submitBreakGlass}
                    disabled={dialog.submitting}
                    className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {dialog.submitting ? 'Granting…' : 'Grant Access'}
                  </button>
                </div>
                {dialog.result && (
                  <div className="mt-6 rounded border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-sm text-indigo-900">
                      <span className="font-semibold">Temporary access granted.</span> Share the
                      following password with{' '}
                      <span className="font-semibold">{dialog.result.userEmail}</span>.
                    </p>
                    <div className="mt-3 flex items-center justify-between rounded border border-indigo-300 bg-white px-3 py-2">
                      <code className="text-sm font-semibold text-indigo-600">
                        {dialog.result.temporaryPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(dialog.result!.temporaryPassword)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-indigo-800">
                      Expires {new Date(dialog.result.expiresAt).toLocaleString()}
                    </p>
                  </div>
                )}
                <div className="mt-8 rounded border border-gray-200">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <h4 className="text-sm font-medium text-gray-900">Active Overrides</h4>
                  </div>
                  {dialog.loadingOverrides ? (
                    <div className="px-4 py-6 text-sm text-gray-500">Loading overrides…</div>
                  ) : dialog.overrides && dialog.overrides.length > 0 ? (
                    <ul className="divide-y divide-gray-200">
                      {dialog.overrides
                        .filter((override) => !override.revokedAt)
                        .map((override) => (
                          <li key={override.id} className="flex items-center justify-between px-4 py-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {override.userEmail ?? override.userId}
                              </p>
                              <p className="text-xs text-gray-500">
                                Expires {new Date(override.expiresAt).toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">Reason: {override.reason}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => revokeBreakGlass(override.id)}
                              disabled={dialog.submitting}
                              className="text-xs font-medium text-red-600 hover:text-red-500"
                            >
                              Revoke
                            </button>
                          </li>
                        ))}
                      {dialog.overrides.filter((override) => !override.revokedAt).length === 0 && (
                        <li className="px-4 py-4 text-sm text-gray-500">No active overrides.</li>
                      )}
                    </ul>
                  ) : (
                    <div className="px-4 py-6 text-sm text-gray-500">No overrides yet.</div>
                  )}
                </div>
              </>
            ) : (
              <>
                {!dialog.result ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900">Create Account</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Provision a new tenant and assign an owner with a one-time password.
                    </p>
                    <label className="mt-4 block text-sm font-medium text-gray-700">
                      Account Name
                      <input
                        value={dialog.name}
                        onChange={(event) =>
                          setDialog((prev) =>
                            prev && prev.mode === 'create'
                              ? { ...prev, name: event.target.value }
                              : prev
                          )
                        }
                        placeholder="Acme Corp"
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        disabled={dialog.submitting}
                      />
                    </label>
                    <label className="mt-3 block text-sm font-medium text-gray-700">
                      Owner Email
                      <input
                        type="email"
                        value={dialog.ownerEmail}
                        onChange={(event) =>
                          setDialog((prev) =>
                            prev && prev.mode === 'create'
                              ? { ...prev, ownerEmail: event.target.value }
                              : prev
                          )
                        }
                        placeholder="owner@example.com"
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        disabled={dialog.submitting}
                      />
                    </label>
                    <label className="mt-3 block text-sm font-medium text-gray-700">
                      Custom Temporary Password <span className="text-xs text-gray-400">(optional)</span>
                      <input
                        value={dialog.customPassword}
                        onChange={(event) =>
                          setDialog((prev) =>
                            prev && prev.mode === 'create'
                              ? { ...prev, customPassword: event.target.value }
                              : prev
                          )
                        }
                        placeholder="Leave blank to auto-generate"
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        disabled={dialog.submitting}
                      />
                    </label>
                    {dialog.error && (
                      <p className="mt-3 text-sm text-red-600">{dialog.error}</p>
                    )}
                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeDialog}
                        disabled={dialog.submitting}
                        className="inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitCreate}
                        disabled={dialog.submitting}
                        className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {dialog.submitting ? 'Creating…' : 'Create Account'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900">Account Created</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Share this one-time password with the owner. They will be prompted to reset on
                      first login.
                    </p>
                    <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">Account:</span>{' '}
                        {dialog.result.accountName}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">Owner Email:</span>{' '}
                        {dialog.result.ownerEmail}
                      </p>
                      <div className="mt-3">
                        <p className="text-xs uppercase text-gray-500">One-time password</p>
                        <div className="mt-1 flex items-center justify-between rounded border border-indigo-200 bg-white px-3 py-2">
                          <code className="text-sm font-semibold text-indigo-600">
                            {dialog.result.temporaryPassword}
                          </code>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(dialog.result!.temporaryPassword)}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      {dialog.result.ownerExisting && (
                        <p className="mt-2 text-xs text-amber-600">
                          Note: Owner already existed. Their password was reset and they must update it on next sign-in.
                        </p>
                      )}
                    </div>
                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={closeDialog}
                        className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
