import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Extract Twilio call status data
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const direction = formData.get('Direction') as string;
    const duration = formData.get('CallDuration') as string;
    const timestamp = formData.get('Timestamp') as string;

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

    // Update call log in database
    const { error } = await supabase
      .from('call_logs')
      .update({
        status: callStatus,
        duration: duration ? parseInt(duration) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', callSid);

    if (error) {
      console.error('Error updating call status:', error);
      // Don't return error to Twilio, just log it
    }

    // Log the status change for debugging
    console.log(`Call ${callSid} status changed to: ${callStatus}`);

    // Return success response to Twilio
    return new NextResponse('', { status: 200 });
  } catch (error) {
    console.error('Error processing call status webhook:', error);
    // Return 200 to prevent Twilio from retrying
    return new NextResponse('', { status: 200 });
  }
}