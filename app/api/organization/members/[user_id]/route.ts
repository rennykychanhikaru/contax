import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkRateLimit, RateLimitPresets } from '@/lib/security/rate-limiter';

const ROLE_VALUES = new Set(['owner', 'admin', 'member']);

// PATCH: update role
// DELETE: remove member
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
) {
  const rl = checkRateLimit(req as unknown as Request, RateLimitPresets.standard);
  if (!rl.allowed) return NextResponse.json({ error: rl.error || 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const newRoleRaw = (body?.role as string | undefined)?.trim().toLowerCase();
  if (!newRoleRaw) return NextResponse.json({ error: 'role is required' }, { status: 400 });
  if (!ROLE_VALUES.has(newRoleRaw)) return NextResponse.json({ error: 'invalid role' }, { status: 400 });

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
            console.error('Error setting cookies in PATCH member', err);
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

  const { user_id: targetUserId } = await params;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // Only owners can assign owner role
  if (newRoleRaw === 'owner' && me.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can assign owner role' }, { status: 403 });
  }

  // Prevent demoting the last owner
  if (newRoleRaw !== 'owner') {
    const { count: ownersCount } = await admin
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', me.organization_id)
      .eq('role', 'owner');
    const ownerCountEffective = typeof ownersCount === 'number' ? ownersCount : 0;
    if (ownerCountEffective <= 1) {
      // If target is the only owner, block demotion
      const { data: target } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', me.organization_id)
        .eq('user_id', targetUserId)
        .single();
      if (target?.role === 'owner') {
        return NextResponse.json({ error: 'Cannot demote the last owner' }, { status: 400 });
      }
    }
  }

  const { error } = await admin
    .from('organization_members')
    .update({ role: newRoleRaw })
    .eq('organization_id', me.organization_id)
    .eq('user_id', targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('audit_logs').insert({
    organization_id: me.organization_id,
    user_id: user.id,
    action: 'role_update',
    resource_type: 'organization_member',
    resource_id: targetUserId,
    changes: { role: newRoleRaw },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
) {
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
            console.error('Error setting cookies in DELETE member', err);
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

  const { user_id: targetUserId } = await params;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  // Prevent removing the last owner
  const { data: owners } = await admin
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', me.organization_id)
    .eq('role', 'owner')
    .limit(2);
  const ownersCount = owners?.length || 0;
  if (ownersCount <= 1) {
    const targetIsOwner = owners?.some((o) => o.user_id === targetUserId);
    if (targetIsOwner) {
      return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 });
    }
  }
  // Prevent self-removal if sole owner
  if (ownersCount <= 1 && targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself as the last owner' }, { status: 400 });
  }
  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('organization_id', me.organization_id)
    .eq('user_id', targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('audit_logs').insert({
    organization_id: me.organization_id,
    user_id: user.id,
    action: 'remove_member',
    resource_type: 'organization_member',
    resource_id: targetUserId,
  });
  return NextResponse.json({ success: true });
}
