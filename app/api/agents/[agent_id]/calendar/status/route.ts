import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getAgentCalendarTokens, validateAgentAccess, getAgentWithCalendarStatus } from '@/lib/agent-calendar';
import { listCalendars } from '@/lib/google';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent_id: string }> }
) {
  const { agent_id } = await params;
  try {
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
    
    // Get agent with calendar status
    const agent = await getAgentWithCalendarStatus(agent_id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    // If not connected, return disconnected status
    if (!agent.google_calendar_connected) {
      return NextResponse.json({
        connected: false,
        email: null,
        calendarId: null,
        calendars: [],
        error: null
      });
    }
    
    // Get tokens from database
    const tokens = await getAgentCalendarTokens(agent_id);
    
    if (!tokens || !tokens.access_token) {
      return NextResponse.json({
        connected: false,
        email: agent.google_calendar_email,
        calendarId: agent.google_calendar_id,
        calendars: [],
        error: 'No valid access token'
      });
    }
    
    // Try to list calendars to verify connection
    try {
      const calendars = await listCalendars(tokens.access_token);
      
      return NextResponse.json({
        connected: true,
        email: agent.google_calendar_email,
        calendarId: agent.google_calendar_id,
        calendars: calendars || [],
        error: null,
        lastSync: agent.google_calendar_last_sync,
        connectedAt: agent.google_calendar_connected_at
      });
    } catch (error) {
      console.error('Calendar connection test failed:', error);
      return NextResponse.json({
        connected: false,
        email: agent.google_calendar_email,
        calendarId: agent.google_calendar_id,
        calendars: [],
        error: error instanceof Error ? error.message : 'Connection test failed'
      });
    }
  } catch (error) {
    console.error('Error checking agent calendar status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check calendar status' },
      { status: 500 }
    );
  }
}