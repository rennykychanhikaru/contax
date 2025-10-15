import { test, expect, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const shouldRun = process.env.PLAYWRIGHT_RUN_ADMIN_E2E === 'true';
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? '';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

async function authenticateViaSupabase(context: BrowserContext) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (error || !data.session) {
    throw new Error(`Supabase sign-in failed: ${error?.message ?? 'No session returned'}`);
  }

  const { access_token, refresh_token, expires_at } = data.session;
  const cookieDomain = new URL(baseUrl).hostname;
  const now = Math.floor(Date.now() / 1000);

  const cookies = [
    {
      name: 'sb-access-token',
      value: access_token,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax' as const,
      expires: expires_at ?? now + 3600,
    },
  ];

  if (refresh_token) {
    cookies.push({
      name: 'sb-refresh-token',
      value: refresh_token,
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax' as const,
      expires: now + 60 * 60 * 24 * 30,
    });
  }

  await context.addCookies(cookies);
}

test.describe('Super admin panel smoke test', () => {
  test('signs in and opens the feature flag view', async ({ page }) => {
    test.skip(!shouldRun, 'Set PLAYWRIGHT_RUN_ADMIN_E2E=true to enable the admin E2E smoke test.');
    test.skip(
      !adminEmail || !adminPassword,
      'Provide PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run the admin E2E smoke test.'
    );
    test.skip(!supabaseUrl || !supabaseAnonKey, 'Supabase credentials missing for smoke test.');

    await authenticateViaSupabase(page.context());

    await page.goto('/admin/feature-flags');
    await expect(page.getByRole('heading', { name: /feature flags/i })).toBeVisible();
  });
});
