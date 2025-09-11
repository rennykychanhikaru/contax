import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const { phoneNumber, phone_number, phone, to } = body;
    
    // Try different possible field names for phone number
    const targetPhone = phoneNumber || phone_number || phone || to;
    
    if (!targetPhone) {
      return NextResponse.json({ 
        error: 'Phone number is required. Use phoneNumber, phone_number, phone, or to field' 
      }, { status: 400 });
    }

    // Initialize Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find agent configuration by webhook token
    const { data: agent, error: agentError } = await supabase
      .from('agent_configurations')
      .select('*, organization_id')
      .eq('webhook_token', token)
      .eq('webhook_enabled', true)
      .single();

    if (agentError || !agent) {
      console.error('Agent not found or webhook disabled:', agentError);
      return NextResponse.json({ 
        error: 'Invalid webhook token or webhook disabled' 
      }, { status: 404 });
    }

    // Get organization's Twilio settings
    const { data: twilioSettings, error: twilioError } = await supabase
      .from('twilio_settings')
      .select('*')
      .eq('organization_id', agent.organization_id)
      .single();

    if (twilioError || !twilioSettings) {
      console.error('Twilio settings not found:', twilioError);
      return NextResponse.json({ 
        error: 'Twilio not configured for this organization' 
      }, { status: 400 });
    }

    // Initialize Twilio client
    const twilioClient = twilio(
      twilioSettings.account_sid,
      twilioSettings.auth_token
    );

    // Create TwiML response for the call
    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/api/webhook/agent/${token}/twiml`;

    // Initiate the call
    const call = await twilioClient.calls.create({
      to: targetPhone,
      from: twilioSettings.phone_number,
      url: twimlUrl,
      method: 'POST',
      record: false,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'}/api/webhook/call-status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    // Log the call
    await supabase
      .from('call_logs')
      .insert({
        organization_id: agent.organization_id,
        agent_id: agent.id,
        call_sid: call.sid,
        to_number: targetPhone,
        from_number: twilioSettings.phone_number,
        status: 'initiated',
        direction: 'outbound',
        webhook_triggered: true,
        metadata: {
          triggered_by: 'webhook',
          token: token,
          request_body: body
        }
      });

    return NextResponse.json({
      success: true,
      message: 'Call initiated successfully',
      callSid: call.sid,
      to: targetPhone,
      from: twilioSettings.phone_number,
      status: call.status
    });

  } catch (error) {
    console.error('Error triggering call via webhook:', error);
    return NextResponse.json({ 
      error: 'Failed to trigger call',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to show webhook info
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  
  return NextResponse.json({
    message: 'Agent webhook endpoint',
    token: token,
    usage: {
      method: 'POST',
      body: {
        phoneNumber: '+1234567890',
        description: 'Phone number to call (with country code)'
      },
      alternativeFields: [
        'phone_number',
        'phone',
        'to'
      ]
    }
  });
}