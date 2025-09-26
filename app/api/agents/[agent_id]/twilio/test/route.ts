import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { decrypt } from '@/lib/security/crypto';
import twilio from 'twilio';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getSupabaseWithUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* ignore cookie set errors */ }
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

async function getAgent(
  supabase: SupabaseClient,
  agentId: string
) {
  const { data, error } = await supabase
    .from<{ id: string; organization_id: string }>('agent_configurations')
    .select('id, organization_id')
    .eq('id', agentId)
    .single();
  if (error || !data) return null;
  return data;
}

async function hasWriteRole(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
) {
  const { data } = await supabase
    .from<{ role: string }>('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();
  return !!(data && (data.role === 'owner' || data.role === 'admin'));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ agent_id: string }> }) {
  try {
    const { supabase, user } = await getSupabaseWithUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { agent_id } = await params;
    const agent = await getAgent(supabase, agent_id);
    if (!agent) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

    const canWrite = await hasWriteRole(supabase, agent.organization_id, user.id);
    if (!canWrite) return NextResponse.json({ ok: false, error: 'Permission denied' }, { status: 403 });

    // Load saved settings
    const { data: settings } = await supabase
      .from<{ account_sid: string; auth_token_encrypted: string; phone_number: string }>('agent_twilio_settings')
      .select('account_sid, auth_token_encrypted, phone_number')
      .eq('agent_id', agent.id)
      .single();
    if (!settings) return NextResponse.json({ ok: false, error: 'Twilio not configured for this agent' }, { status: 404 });

    const authToken = await decrypt(settings.auth_token_encrypted);
    const client = twilio(settings.account_sid, authToken);

    // 1) Verify account credentials
    const account = await client.api.accounts(settings.account_sid).fetch();

    // 2) Optionally verify phone number ownership (best-effort)
    let phoneOwned = false;
    try {
      const nums = await client.incomingPhoneNumbers.list({ phoneNumber: settings.phone_number, limit: 1 });
      phoneOwned = Array.isArray(nums) && nums.length > 0;
    } catch { /* noop */ }

    // Safely extract a friendly name if present
    const friendly = (account as unknown as { friendlyName?: string }).friendlyName ?? null;
    return NextResponse.json({ ok: true, accountSid: account.sid, accountFriendlyName: friendly, phoneNumber: settings.phone_number, phoneOwned });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
