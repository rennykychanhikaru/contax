import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { TwilioTelephonyAdapter } from '../../../../lib/telephony/twilio';

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

    // Get organization ID if not provided
    let orgId = organizationId;
    if (!orgId && userId) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .single();
      
      if (member) {
        orgId = member.organization_id;
      }
    }

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    // Get Twilio settings for the organization
    const { data: twilioSettings, error: settingsError } = await supabase
      .from('twilio_settings')
      .select('account_sid, auth_token, phone_number')
      .eq('organization_id', orgId)
      .single();

    if (settingsError || !twilioSettings) {
      return NextResponse.json({ error: 'Twilio settings not found for organization' }, { status: 404 });
    }

    // Initialize Twilio adapter
    const twilioAdapter = new TwilioTelephonyAdapter({
      accountSid: twilioSettings.account_sid,
      authToken: twilioSettings.auth_token,
      phoneNumber: twilioSettings.phone_number,
    });

    // Get the base URL for callbacks
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;

    // Create the outgoing call using the adapter
    await twilioAdapter.startOutboundCall(phoneNumber, {
      baseUrl,
      organizationId: orgId,
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
        call_sid: callSid,
        from_number: twilioSettings.phone_number,
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
      from: twilioSettings.phone_number,
    });
  } catch (error: any) {
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