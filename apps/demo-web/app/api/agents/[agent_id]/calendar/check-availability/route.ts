import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getAgentCalendarTokens, validateAgentAccess } from '../../../../../../lib/agent-calendar';
import { checkCalendarAvailability } from '../../../../../../lib/google';

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
    const { start, end, calendarId, calendarIds } = body;
    
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
    
    // Check availability using the agent's calendar
    const availability = await checkCalendarAvailability(
      tokens.access_token,
      start,
      end,
      calendarId || tokens.calendar_id,
      calendarIds
    );
    
    return NextResponse.json(availability);
  } catch (error) {
    console.error('Error checking agent calendar availability:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check availability' },
      { status: 500 }
    );
  }
}