import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find agent configuration by webhook token
    const { data: agent, error: agentError } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('webhook_token', token)
      .single();

    if (agentError || !agent) {
      response.say('Sorry, this agent is not available. Goodbye.');
      response.hangup();
      return new NextResponse(response.toString(), {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Build <Connect><Stream> so Twilio streams audio to our WS bridge.
    // The WS handler will fetch this agent and speak agent.greeting first.
    const explicitWss = process.env.TWILIO_STREAM_WSS_URL // e.g., wss://<your-ngrok-ws-domain>
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
    const wsUrl = explicitWss ? `${explicitWss.replace(/\/$/, '')}/twilio-media` : `wss://${new URL(baseUrl).host}/api/twilio/media-stream`;
    const connect = response.connect();
    const stream = connect.stream({ url: wsUrl });
    stream.parameter({ name: 'organizationId', value: agent.organization_id || '' });
    stream.parameter({ name: 'agentId', value: agent.id });
    stream.parameter({ name: 'direction', value: 'outbound' });
    // Allow voice to be overridden in the future; default to 'sage' for now
    stream.parameter({ name: 'voice', value: (agent as { voice?: string }).voice || 'sage' });
    // Fallback: if Stream handshake fails, Twilio should continue to next verb.
    response.say({ voice: 'alice', language: agent.language || 'en-US' }, agent.greeting || 'Hello! How can I help you today?');
    response.hangup();

    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('Error generating TwiML:', error);
    
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say('An error occurred. Please try again later.');
    response.hangup();
    
    return new NextResponse(response.toString(), {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}
