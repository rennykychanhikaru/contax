import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; token: string }> }
) {
  try {
    const { userId, token } = await params;
    
    // Initialize Supabase client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Validate the webhook token
    const { data: tokenData, error: tokenError } = await supabase
      .from('webhook_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    // Parse the webhook payload
    const body = await req.json();
    
    // Log the webhook event (you can customize this based on your needs)
    const { error: logError } = await supabase
      .from('webhook_logs')
      .insert({
        user_id: userId,
        event_type: body.event_type || 'unknown',
        payload: body,
        created_at: new Date().toISOString(),
      });

    if (logError) {
      console.error('Error logging webhook:', logError);
      // Continue processing even if logging fails
    }

    // Process different webhook events
    switch (body.event_type) {
      case 'appointment.created':
        // Handle appointment creation
        console.log('New appointment created:', body);
        break;
      
      case 'appointment.updated':
        // Handle appointment update
        console.log('Appointment updated:', body);
        break;
      
      case 'appointment.cancelled':
        // Handle appointment cancellation
        console.log('Appointment cancelled:', body);
        break;
      
      case 'calendar.sync':
        // Handle calendar sync events
        console.log('Calendar sync event:', body);
        break;
      
      default:
        // Handle unknown event types
        console.log('Unknown webhook event:', body);
    }

    // Return success response
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// Also support GET requests for webhook verification
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; token: string }> }
) {
  try {
    const { userId, token } = await params;
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Validate the webhook token
    const { data: tokenData, error: tokenError } = await supabase
      .from('webhook_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    // Return verification response
    return NextResponse.json({ 
      verified: true,
      user_id: userId,
      message: 'Webhook URL is valid and ready to receive events' 
    });

  } catch (error) {
    console.error('Webhook verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify webhook' },
      { status: 500 }
    );
  }
}