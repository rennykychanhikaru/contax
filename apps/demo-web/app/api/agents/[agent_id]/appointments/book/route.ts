import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getAgentCalendarTokens, validateAgentAccess } from '../../../../../../lib/agent-calendar';
import { createCalendarEvent, checkCalendarAvailability } from '../../../../../../lib/google';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  try {
    const { agent_id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
              console.error('Error setting cookies:', error);
            }
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Validate agent access
    const agentAccess = await validateAgentAccess(agent_id, user.id);
    if (!agentAccess) {
      return NextResponse.json({ error: 'Agent not found or access denied' }, { status: 404 });
    }
    
    const body = await req.json();
    const { customer, start, end, notes, calendarId } = body;
    
    if (!start || !end) {
      return NextResponse.json(
        { error: 'Start and end times are required' },
        { status: 400 }
      );
    }
    
    // Get agent calendar tokens
    const tokens = await getAgentCalendarTokens(agent_id);
    
    if (!tokens || !tokens.access_token) {
      return NextResponse.json(
        { error: 'Agent calendar not connected' },
        { status: 400 }
      );
    }
    
    // Use provided calendar ID or agent's primary calendar
    const targetCalendarId = calendarId || tokens.calendar_id || 'primary';
    
    // Check for conflicts before booking
    const availability = await checkCalendarAvailability(
      tokens.access_token,
      start,
      end,
      targetCalendarId
    );
    
    if (!availability.available) {
      return NextResponse.json(
        { 
          error: 'Time slot is not available',
          conflicts: availability.conflicts 
        },
        { status: 409 }
      );
    }
    
    // Create the calendar event
    const event = await createCalendarEvent(
      tokens.access_token,
      {
        summary: customer?.name ? `Meeting with ${customer.name}` : 'Meeting',
        description: notes || `Booked via Agent: ${agentAccess.agent.name}`,
        start: { dateTime: start, timeZone: 'America/Los_Angeles' },
        end: { dateTime: end, timeZone: 'America/Los_Angeles' },
        attendees: customer?.email ? [{ email: customer.email }] : [],
      },
      targetCalendarId
    );
    
    // Store appointment in database
    const { data: appointment, error: dbError } = await supabase
      .from('appointments')
      .insert({
        organization_id: agentAccess.organization.id,
        agent_id: agent_id,
        customer_name: customer?.name,
        customer_email: customer?.email,
        customer_phone: customer?.phone,
        scheduled_start: start,
        scheduled_end: end,
        google_event_id: event.id,
        google_calendar_id: targetCalendarId,
        notes: notes,
        status: 'scheduled'
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('Failed to store appointment in database:', dbError);
    }
    
    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        htmlLink: event.htmlLink,
        start: event.start,
        end: event.end,
        summary: event.summary,
        meetLink: event.hangoutLink
      },
      appointment
    });
  } catch (error) {
    console.error('Error booking appointment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to book appointment' },
      { status: 500 }
    );
  }
}