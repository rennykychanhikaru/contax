import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET: list members
// POST: invite member by email
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (err) {
            console.error('Error setting cookies in GET members', err);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find current org using RLS-safe read
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single();
  if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 404 });

  // Admin client bypasses RLS for listing all members in org
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: members, error: listErr } = await admin
    .from('organization_members')
    .select('id, user_id, role, created_at, updated_at')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: true });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const enriched = await Promise.all(
    (members || []).map(async (m) => {
      try {
        const res = await admin.auth.admin.getUserById(m.user_id);
        const email = res.data.user?.email || null;
        const meta = (res.data.user?.user_metadata ?? undefined) as
          | Record<string, unknown>
          | undefined;
        const fullName = typeof meta?.full_name === 'string' ? (meta.full_name as string) : undefined;
        const plainName = typeof meta?.name === 'string' ? (meta.name as string) : undefined;
        const name = fullName || plainName || null;
        return { ...m, email, name };
      } catch (err) {
        console.error('Error enriching user metadata', err);
        return { ...m, email: null, name: null };
      }
    })
  );

  return NextResponse.json({ members: enriched });
}

export async function POST(req: NextRequest) {
  const { email, role } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  const inviteRole = (role as string) || 'member';

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (err) {
            console.error('Error setting cookies in POST invite', err);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single();
  if (!me) return NextResponse.json({ error: 'No organization found' }, { status: 404 });
  const isAdmin = me.role === 'owner' || me.role === 'admin';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Invite or fetch existing user
  let targetUserId: string | null = null;
  try {
    const inviteRes = await admin.auth.admin.inviteUserByEmail(email);
    targetUserId = inviteRes.data.user?.id ?? null;
  } catch (e: unknown) {
    // If invite fails (e.g., user exists), try to find user via listUsers
    try {
      // Fallback search: iterate minimal pages (small orgs)
      const pageRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = pageRes.data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      targetUserId = found?.id ?? null;
    } catch (err: unknown) {
      console.error('Error listing users as fallback', err);
    }
  }

  if (!targetUserId) {
    return NextResponse.json({ error: 'Unable to invite or find user' }, { status: 500 });
  }

  // Upsert membership
  const { error } = await admin
    .from('organization_members')
    .upsert(
      {
        organization_id: me.organization_id,
        user_id: targetUserId,
        role: inviteRole,
      },
      { onConflict: 'organization_id,user_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
