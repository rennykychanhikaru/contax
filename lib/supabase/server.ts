import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/database.types';

/**
 * Helper for route handlers to access Supabase with the caller's session.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          const value = cookieStore.get(name);
          return value ? { name, value: value.value } : undefined;
        },
        getAll() {
          return cookieStore.getAll();
        },
        set() {
          // Route handlers cannot mutate request cookies; ignore writes.
        },
        setAll() {
          // No-op to satisfy the Supabase client interface.
        },
        remove() {
          // No-op; cookies are request-scoped in route handlers.
        },
      },
    }
  );
}
