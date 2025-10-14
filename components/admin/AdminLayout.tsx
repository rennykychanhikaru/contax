'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const navLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/feature-flags', label: 'Feature Flags' },
  { href: '/admin/activity', label: 'Activity' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'mfa' | 'disabled'>('checking');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function verifyAccess() {
      try {
        const res = await fetch('/api/admin/check-access', { cache: 'no-store' });
        if (res.ok) {
          setStatus('ready');
          return;
        }

        if (res.status === 401) {
          router.replace('/auth/sign-in');
          return;
        }

        let body: { error?: string; step_up_required?: boolean } | null = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }

        if (res.status === 403 && body?.step_up_required) {
          setStatus('mfa');
          setMessage('A recent WebAuthn or TOTP verification is required. Please complete MFA and try again.');
          return;
        }

        if (res.status === 404) {
          setStatus('disabled');
          setMessage(body?.error ?? 'Super admin panel is currently disabled.');
          return;
        }

        router.replace('/');
      } catch (error) {
        console.error('Failed to verify super admin access', error);
        router.replace('/');
      }
    }

    verifyAccess();
  }, [router]);

  if (status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Checking super admin access&hellip;</p>
      </div>
    );
  }

  if (status === 'mfa') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="max-w-sm rounded-lg border border-yellow-200 bg-white p-6 text-center shadow">
          <h2 className="text-lg font-semibold text-gray-900">Step-up verification required</h2>
          <p className="mt-2 text-sm text-gray-600">
            {message ??
              'Please complete a hardware key or TOTP challenge, then refresh this page to continue.'}
          </p>
          <button
            type="button"
            onClick={() => router.replace('/auth/sign-in')}
            className="mt-4 inline-flex items-center justify-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  if (status === 'disabled') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow">
          <h2 className="text-lg font-semibold text-gray-900">Super admin panel disabled</h2>
          <p className="mt-2 text-sm text-gray-600">
            {message ??
              'Enable the super-admin feature flag to access the control panel. Contact the platform owner if you need access.'}
          </p>
        </div>
      </div>
    );
  }

  if (status !== 'ready') {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow">
        <div className="border-b p-6">
          <h1 className="text-2xl font-semibold text-gray-900">Super Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Platform controls &amp; insights</p>
        </div>
        <nav className="space-y-1 p-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
