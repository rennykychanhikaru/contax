import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getAgentCalendarTokens, validateAgentAccess, storeAgentCalendars } from '../../../../../../lib/agent-calendar';
import { listCalendars } from '../../../../../../lib/google';

export async function GET(
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
    
    // Get agent calendar tokens
    const tokens = await getAgentCalendarTokens(agent_id);
    
    if (!tokens || !tokens.access_token) {
      return NextResponse.json(
        { error: 'Agent calendar not connected' },
        { status: 400 }
      );
    }
    
    // List calendars from Google
    const calendars = await listCalendars(tokens.access_token);
    
    if (!calendars) {
      return NextResponse.json(
        { error: 'Failed to fetch calendars' },
        { status: 500 }
      );
    }
    
    // Store calendars in database for future reference
    await storeAgentCalendars(agent_id, calendars);
    
    return NextResponse.json({
      calendars,
      primaryCalendar: calendars.find(cal => cal.primary) || calendars[0],
      total: calendars.length
    });
  } catch (error) {
    console.error('Error listing agent calendars:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list calendars' },
      { status: 500 }
    );
  }
}