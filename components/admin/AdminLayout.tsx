'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Database } from '@/supabase/database.types';

const navLinks = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/feature-flags', label: 'Feature Flags' },
  { href: '/admin/activity', label: 'Activity' },
];

type AuditLogRow = Database['public']['Tables']['admin_audit_log']['Row'];

type NotificationEntry = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  expiresAt: number;
};

function formatActionLabel(action: string) {
  return action
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function describeEvent(event: AuditLogRow) {
  const parts: string[] = [];
  if (event.target_type) {
    parts.push(`Target: ${event.target_type}`);
  }
  if (event.target_id) {
    parts.push(event.target_id);
  }
  if (event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)) {
    const entries = Object.entries(event.metadata as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined)
      .slice(0, 3)
      .map(([key, value]) => `${key}=${String(value)}`);
    if (entries.length > 0) {
      parts.push(entries.join(', '));
    }
  }
  return parts.join(' • ') || 'No additional metadata.';
}

function mapAuditLogToNotification(event: AuditLogRow): NotificationEntry {
  return {
    id: event.id,
    title: formatActionLabel(event.action_type),
    description: describeEvent(event),
    createdAt: event.created_at,
    expiresAt: Date.now() + 15_000,
  };
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'mfa' | 'disabled'>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

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
          setMessage(
            'A recent WebAuthn or TOTP verification is required. Please complete MFA and try again.'
          );
          return;
        }

        if (res.status === 404) {
          setStatus('disabled');
          setMessage(body?.error ?? 'Super admin panel is currently disabled.');
          return;
        }

        router.replace('/');
      } catch {
        router.replace('/');
      }
    }

    verifyAccess();
  }, [router]);

  useEffect(() => {
    if (status !== 'ready') {
      setNotifications([]);
      return;
    }

    let isCancelled = false;

    async function fetchRecentEvents() {
      try {
        const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as { events?: AuditLogRow[] };
        if (isCancelled || !body?.events) {
          return;
        }
        setNotifications((previous) => {
          const latest = body.events.map(mapAuditLogToNotification);
          const seen = new Set(latest.map((entry) => entry.id));
          const merged = [...latest, ...previous.filter((entry) => !seen.has(entry.id))];
          return merged.slice(0, 6);
        });
      } catch {
        // Ignore initial fetch failures; realtime feed will fill in.
      }
    }

    fetchRecentEvents();

    return () => {
      isCancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }

    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let channel: RealtimeChannel | null = supabase
      .channel('admin-audit-log')
      .on<{ new: AuditLogRow }>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_audit_log' },
        (payload) => {
          const event = payload.new;
          if (!event) return;
          setNotifications((previous) => {
            if (previous.some((note) => note.id === event.id)) {
              return previous;
            }
            const next = [mapAuditLogToNotification(event), ...previous];
            return next.slice(0, 6);
          });
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [status]);

  useEffect(() => {
    if (notifications.length === 0) {
      return;
    }
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNotifications((previous) => previous.filter((note) => note.expiresAt > now));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [notifications.length]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((previous) => previous.filter((note) => note.id !== id));
  }, []);

  const navItems = useMemo(
    () =>
      navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="block rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          {link.label}
        </Link>
      )),
    []
  );

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

  const notificationsPanel = (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      {notifications.map((notification) => {
        const created = new Date(notification.createdAt);
        const timeLabel = Number.isNaN(created.getTime())
          ? ''
          : created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
          <div
            key={notification.id}
            className="pointer-events-auto rounded-lg border border-indigo-100 bg-white p-4 shadow-lg ring-1 ring-indigo-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-600">{notification.title}</p>
                <p className="mt-1 text-xs text-gray-600">{notification.description}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
            {timeLabel ? (
              <p className="mt-2 text-right text-xs text-gray-400">at {timeLabel}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow">
        <div className="border-b p-6">
          <h1 className="text-2xl font-semibold text-gray-900">Super Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Platform controls &amp; insights</p>
        </div>
        <nav className="space-y-1 p-4">{navItems}</nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
      {notificationsPanel}
    </div>
  );
}
