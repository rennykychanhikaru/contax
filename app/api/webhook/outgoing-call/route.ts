import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { TwilioTelephonyAdapter } from '../../../../lib/telephony/twilio';
import { decrypt } from '../../../../lib/security/crypto';

type AgentTwilioRow = {
  organization_id: string;
  account_sid: string;
  auth_token_encrypted: string;
  phone_number: string;
};

type OrgTwilioRow = {
  account_sid: string;
  auth_token: string;
  phone_number: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber, organizationId, userId, agentId } = body;

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

    // Resolve credentials: agent-first, then org fallback
    let orgId = organizationId as string | undefined;
    let accountSid: string | undefined;
    let authToken: string | undefined;
    let fromNumber: string | undefined;

    // If agentId provided, try agent-level settings
    if (agentId) {
      const { data: agentRow } = await supabase
        .from<AgentTwilioRow>('agent_twilio_settings')
        .select('organization_id, account_sid, auth_token_encrypted, phone_number')
        .eq('agent_id', agentId)
        .single();
      if (agentRow) {
        orgId = orgId || agentRow.organization_id;
        accountSid = agentRow.account_sid;
        authToken = await decrypt(agentRow.auth_token_encrypted);
        fromNumber = agentRow.phone_number;
      }
    }

    // If not found or no agentId, resolve org-level
    if (!accountSid || !authToken || !fromNumber) {
      if (!orgId && userId) {
        const { data: member } = await supabase
          .from<{ organization_id: string }>('organization_members')
          .select('organization_id')
          .eq('user_id', userId)
          .single();
        if (member) orgId = member.organization_id;
      }
      if (!orgId) {
        return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
      }
      const { data: twilioSettings, error: settingsError } = await supabase
        .from<OrgTwilioRow>('twilio_settings')
        .select('account_sid, auth_token, phone_number')
        .eq('organization_id', orgId)
        .single();
      if (settingsError || !twilioSettings) {
        return NextResponse.json({ error: 'Twilio settings not found for organization' }, { status: 404 });
      }
      accountSid = twilioSettings.account_sid;
      authToken = twilioSettings.auth_token;
      fromNumber = twilioSettings.phone_number;
    }

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
  } catch (error) {
    console.error('Error creating outgoing call:', error);
    
    // Handle Twilio-specific errors
    if (error.code) {
      return NextResponse.json({
        error: `Twilio error: ${error.message}`,
        code: error.code,
      }, { status: 400 });
    }
    
    return NextResponse.json({
      error: 'Failed to create outgoing call',
      details: error.message,
    }, { status: 500 });
  }
}
