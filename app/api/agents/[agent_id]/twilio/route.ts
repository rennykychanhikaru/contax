import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { encrypt } from '@/lib/security/crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const MASK = '********************************';

async function getSupabaseWithUser() {
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
          } catch {
            // ignore
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

async function requireAgentAndOrg(
  supabase: SupabaseClient,
  agentId: string
) {
  const { data: agent, error } = await supabase
    .from<{ id: string; organization_id: string }>('agent_configurations')
    .select('id, organization_id')
    .eq('id', agentId)
    .single();
  if (error || !agent) return null as null;
  return agent;
}

async function requireOrgRole(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  roles: string[]
) {
  const { data: member } = await supabase
    .from<{ role: string }>('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();
  if (!member) return false;
  if (roles.length === 0) return true;
  return roles.includes(member.role);
}

// GET /api/agents/[agent_id]/twilio
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent_id: string }> }) {
  const { supabase, user } = await getSupabaseWithUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent_id } = await params;
  const agent = await requireAgentAndOrg(supabase, agent_id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const canRead = await requireOrgRole(supabase, agent.organization_id, user.id, []);
  if (!canRead) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const { data, error } = await supabase
    .from<{ account_sid: string; phone_number: string }>('agent_twilio_settings')
    .select('account_sid, phone_number')
    .eq('agent_id', agent.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch Twilio settings' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ accountSid: '', phoneNumber: '', authToken: '' });
  }

  return NextResponse.json({
    accountSid: data.account_sid || '',
    phoneNumber: data.phone_number || '',
    authToken: MASK,
  });
}

// POST /api/agents/[agent_id]/twilio
export async function POST(req: NextRequest, { params }: { params: Promise<{ agent_id: string }> }) {
  const { supabase, user } = await getSupabaseWithUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent_id } = await params;
  const agent = await requireAgentAndOrg(supabase, agent_id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const canWrite = await requireOrgRole(supabase, agent.organization_id, user.id, ['owner', 'admin']);
  if (!canWrite) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  let parsed: unknown = {};
  try { parsed = await req.json(); } catch (_err) { /* noop */ }
  const {
    accountSid,
    authToken,
    phoneNumber,
  } = (parsed as Partial<{ accountSid: string; authToken: string; phoneNumber: string }>);

  if (!accountSid || !phoneNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!String(accountSid).startsWith('AC') || String(accountSid).length !== 34) {
    return NextResponse.json({ error: 'Invalid Account SID format' }, { status: 400 });
  }
  if (!String(phoneNumber).startsWith('+')) {
    return NextResponse.json({ error: 'Phone number must be E.164 (e.g., +1234567890)' }, { status: 400 });
  }

  // Check if existing
  const { data: existing } = await supabase
    .from<{ id: string }>('agent_twilio_settings')
    .select('id')
    .eq('agent_id', agent.id)
    .single();

  let result;
  if (existing) {
    const update: Record<string, unknown> = {
      account_sid: accountSid,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    };
    if (authToken && authToken !== MASK) {
      update.auth_token_encrypted = await encrypt(String(authToken));
    }
    result = await supabase
      .from('agent_twilio_settings')
      .update(update)
      .eq('agent_id', agent.id);
  } else {
    if (!authToken || authToken === MASK) {
      return NextResponse.json({ error: 'Auth token is required for initial setup' }, { status: 400 });
    }
    result = await supabase
      .from('agent_twilio_settings')
      .insert({
        organization_id: agent.organization_id,
        agent_id: agent.id,
        account_sid: accountSid,
        auth_token_encrypted: await encrypt(String(authToken)),
        phone_number: phoneNumber,
      });
  }

  if (result.error) {
    return NextResponse.json({ error: 'Failed to save Twilio settings' }, { status: 500 });
  }

  // Audit log (redacted)
  try {
    await supabase.from('audit_logs').insert({
      organization_id: agent.organization_id,
      user_id: user.id,
      action: existing ? 'update' : 'create',
      resource_type: 'agent_twilio_settings',
      resource_id: agent.id,
      changes: {
        account_sid: accountSid,
        phone_number: phoneNumber,
        auth_token_updated: !!(authToken && authToken !== MASK),
      },
    });
  } catch (_e) { /* noop */ }

  return NextResponse.json({ success: true });
}

// DELETE /api/agents/[agent_id]/twilio
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ agent_id: string }> }) {
  const { supabase, user } = await getSupabaseWithUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent_id } = await params;
  const agent = await requireAgentAndOrg(supabase, agent_id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const canWrite = await requireOrgRole(supabase, agent.organization_id, user.id, ['owner', 'admin']);
  if (!canWrite) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const { error } = await supabase
    .from('agent_twilio_settings')
    .delete()
    .eq('agent_id', agent.id);

  if (error) return NextResponse.json({ error: 'Failed to disconnect Twilio' }, { status: 500 });

  // Audit log
  try {
    await supabase.from('audit_logs').insert({
      organization_id: agent.organization_id,
      user_id: user.id,
      action: 'delete',
      resource_type: 'agent_twilio_settings',
      resource_id: agent.id,
    });
  } catch (_e) { /* noop */ }

  return NextResponse.json({ success: true });
}
