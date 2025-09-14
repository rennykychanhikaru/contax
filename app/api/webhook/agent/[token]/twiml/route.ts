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

    // Use the agent's greeting
    const greeting = agent.greeting || 'Hello! How can I help you today?';
    
    // Connect to the agent (similar to existing webhook logic)
    response.say({
      voice: 'alice',
      language: agent.language || 'en-US'
    }, greeting);

    // Add gather to capture user input
    // const gather = response.gather({
    //   input: ['speech'],
    //   timeout: 5,
    //   language: agent.language || 'en-US',
    //   speechTimeout: 'auto',
    //   action: `/api/webhook/agent/${token}/process`,
    //   method: 'POST'
    // });

    // If no input, hang up
    response.say('I didn\'t hear anything. Goodbye.');
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