import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkRateLimit, RateLimitPresets } from '@/lib/security/rate-limiter';

const ROLE_VALUES = new Set(['owner', 'admin', 'member']);

function parsePagination(req: NextRequest): { page: number; perPage: number; from: number; to: number } {
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(1000000, Number(url.searchParams.get('page') || '1')));
  const perPageRaw = Number(url.searchParams.get('perPage') || '25');
  const perPage = Math.max(1, Math.min(100, perPageRaw || 25));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  return { page, perPage, from, to };
}

// GET: list members
// POST: invite member by email
export async function GET(req: NextRequest) {
  const { from, to } = parsePagination(req);
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    .order('created_at', { ascending: true })
    .range(from, to);
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
  // Rate limit invites
  const rl = checkRateLimit(req as unknown as Request, RateLimitPresets.strict);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.error || 'Too many requests' }, { status: 429 });
  }

  const { email, role } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const basicEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmail.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  const inviteRoleRaw = typeof role === 'string' ? role.trim().toLowerCase() : 'member';
  const inviteRole = ROLE_VALUES.has(inviteRoleRaw) ? inviteRoleRaw : 'member';

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  // Only owners can assign owner role
  if (inviteRole === 'owner' && me.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can assign owner role' }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Build redirect to callback
  const url = new URL(req.url);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;
  const redirectTo = `${baseUrl}/auth/callback`;

  // Helper to extract action_link from Supabase response
  const extractActionLink = (data: unknown): string | null => {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const direct = d['action_link'];
      if (typeof direct === 'string') return direct;
      const props = d['properties'];
      if (props && typeof props === 'object') {
        const action = (props as Record<string, unknown>)['action_link'];
        if (typeof action === 'string') return action;
      }
    }
    return null;
  };

  // Try to generate an invite link (creates user if not exists, no email send)
  let mode: 'invite' | 'magiclink' | 'added' = 'invite';
  let link: string | null = null;
  let targetUserId: string | null = null;
  try {
    const { data } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo },
    });
    targetUserId = data.user?.id ?? null;
    link = extractActionLink(data);
    mode = 'invite';
  } catch (err: unknown) {
    // If user already exists, generate a magic link instead
    try {
      const { data } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: { redirectTo },
      });
      targetUserId = data.user?.id ?? null;
      link = extractActionLink(data);
      mode = 'magiclink';
    } catch (err2: unknown) {
      console.error('Error generating invite/magic link', err, err2);
    }
  }

  // As a last resort, attempt to look up user to add membership
  if (!targetUserId) {
    try {
      const pageRes = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = pageRes.data.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);
      targetUserId = found?.id ?? null;
      mode = 'added';
    } catch (err3: unknown) {
      console.error('Error listing users as fallback', err3);
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

  // If we still don't have a link (e.g., added existing user), generate magic link now
  if (!link) {
    try {
      const { data } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: { redirectTo },
      });
      link = extractActionLink(data);
      if (!mode) mode = 'magiclink';
    } catch (err4: unknown) {
      console.error('Error generating fallback magic link', err4);
    }
  }

  // Audit log
  await admin.from('audit_logs').insert({
    organization_id: me.organization_id,
    user_id: user.id,
    action: 'invite',
    resource_type: 'organization_member',
    resource_id: targetUserId,
    changes: { email: normalizedEmail, role: inviteRole, mode },
  });

  return NextResponse.json({ success: true, mode, link, emailed: false });
}
