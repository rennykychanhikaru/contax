import { Buffer } from 'buffer';
import type { NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/supabase/database.types';

export type CookieSession = {
  accessToken: string;
  refreshToken?: string | null;
};

export function decodeCookieSession(raw?: string | null): CookieSession | null {
  if (!raw || raw.length === 0) return null;
  if (!raw.startsWith('base64-')) {
    return { accessToken: raw, refreshToken: null };
  }

  try {
    const decoded = Buffer.from(raw.slice(7), 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as
      | { access_token?: string | null; refresh_token?: string | null }
      | null;

    if (!parsed?.access_token) return null;

    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? null,
    };
  } catch {
    return null;
  }
}

export function extractSupabaseSession(
  req: NextRequest,
): CookieSession | null {
  const preferredNames = ['sb-access-token', 'sb-127-auth-token'];

  for (const name of preferredNames) {
    const session = decodeCookieSession(req.cookies.get(name)?.value ?? null);
    if (session) return session;
  }

  const fallback = req.cookies
    .getAll()
    .find(
      (cookie) =>
        cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token'),
    );

  return decodeCookieSession(fallback?.value ?? null);
}

export async function resolveSupabaseUser(
  req: NextRequest,
  supabase: SupabaseClient<Database>,
): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return user;

  const fallbackSession = extractSupabaseSession(req);
  if (!fallbackSession?.accessToken) return null;

  try {
    const refreshToken =
      fallbackSession.refreshToken ?? fallbackSession.accessToken;

    await supabase.auth.setSession({
      access_token: fallbackSession.accessToken,
      refresh_token: refreshToken,
    });

    const {
      data: { user: tokenUser },
    } = await supabase.auth.getUser(fallbackSession.accessToken);

    return tokenUser ?? null;
  } catch (error) {
    console.error('Supabase session restoration failed', error);
    return null;
  }
}
