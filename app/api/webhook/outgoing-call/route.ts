import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { TwilioTelephonyAdapter } from '@/lib/telephony/twilio';
import { decrypt } from '@/lib/security/crypto';

type AgentTwilioRow = {
  organization_id: string;
  account_sid: string;
  auth_token_encrypted: string;
  phone_number: string;
};

// (Removed unused OrgTwilioRow type)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber, agentId } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Initialize Supabase client
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
            } catch (error) {
              // Handle error
            }
          },
        },
      }
    );

    // Require agentId and resolve agent-level credentials only
    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
    }
    const { data: agentRow, error: agentErr } = await supabase
      .from<AgentTwilioRow>('agent_twilio_settings')
      .select('organization_id, account_sid, auth_token_encrypted, phone_number')
      .eq('agent_id', agentId)
      .single();
    if (agentErr || !agentRow) {
      const configureUrl = `${process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`}/agent-settings`;
      return NextResponse.json({ error: 'Twilio not configured for this agent', configureUrl }, { status: 409 });
    }
    const orgId = agentRow.organization_id;
    const accountSid = agentRow.account_sid;
    const authToken = await decrypt(agentRow.auth_token_encrypted);
    const fromNumber = agentRow.phone_number;

    // Initialize Twilio adapter
    const twilioAdapter = new TwilioTelephonyAdapter({
      accountSid: accountSid!,
      authToken: authToken!,
      phoneNumber: fromNumber!,
    });

    // Get the base URL for callbacks
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;

    // Create the outgoing call using the adapter
    await twilioAdapter.startOutboundCall(phoneNumber, {
      baseUrl,
      organizationId: orgId!,
      agentId: agentId || 'default',
    });
    
    // Get the call SID from the adapter
    const callSid = twilioAdapter.getCurrentCallSid();

    if (!callSid) {
      throw new Error('Failed to get call SID');
    }

    // Log the call in the database
    await supabase
      .from('call_logs')
      .insert({
        organization_id: orgId,
        agent_id: agentId || null,
        call_sid: callSid,
        from_number: fromNumber,
        to_number: phoneNumber,
        direction: 'outbound',
        status: 'initiated',
        created_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      callSid: callSid,
      status: 'initiated',
      to: phoneNumber,
      from: fromNumber,
    });
  } catch (error: unknown) {
    console.error('Error creating outgoing call:', error);
    const err = error as { code?: string; message?: string } | undefined;
    if (err?.code) {
      return NextResponse.json({ error: `Twilio error: ${err.message || 'unknown'}`, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create outgoing call', details: (err?.message || 'unknown') }, { status: 500 });
  }
}
