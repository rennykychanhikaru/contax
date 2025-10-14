import Link from 'next/link';

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold text-gray-900">Super Admin Control Center</h2>
        <p className="mt-2 text-sm text-gray-600">
          Review platform status, manage accounts, and roll out feature flags from here.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/dashboard" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300">
          <h3 className="text-lg font-medium text-gray-900">Dashboard</h3>
          <p className="mt-1 text-sm text-gray-600">Platform-wide metrics and recent activity snapshots.</p>
        </Link>
        <Link href="/admin/accounts" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300">
          <h3 className="text-lg font-medium text-gray-900">Accounts</h3>
          <p className="mt-1 text-sm text-gray-600">Disable, enable, or inspect account health and access.</p>
        </Link>
        <Link href="/admin/feature-flags" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300">
          <h3 className="text-lg font-medium text-gray-900">Feature Flags</h3>
          <p className="mt-1 text-sm text-gray-600">Ship features safely with global and targeted overrides.</p>
        </Link>
        <Link href="/admin/activity" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300">
          <h3 className="text-lg font-medium text-gray-900">Audit Activity</h3>
          <p className="mt-1 text-sm text-gray-600">Trace super admin actions and investigate alerts.</p>
        </Link>
      </div>
    </div>
  );
}
