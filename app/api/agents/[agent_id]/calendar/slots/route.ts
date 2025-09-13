import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getAgentCalendarTokens, validateAgentAccess, getAgentCalendars } from '@/lib/agent-calendar';
import { checkCalendarAvailability } from '@/lib/google';

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
    const { 
      date, 
      slotMinutes = 30, 
      businessHours = { start: '09:00', end: '17:00' },
      calendarIds 
    } = body;
    
    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
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
    
    // Parse date
    const targetDate = new Date(date);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    
    // Create time boundaries for the day
    const dayStart = `${year}-${month}-${day}T${businessHours.start}:00`;
    const dayEnd = `${year}-${month}-${day}T${businessHours.end}:00`;
    
    // Get calendars to check (use provided IDs or agent's calendars)
    let calendarsToCheck = calendarIds;
    if (!calendarsToCheck || calendarsToCheck.length === 0) {
      // Use agent's primary calendar or all calendars
      const agentCalendars = await getAgentCalendars(agent_id);
      calendarsToCheck = agentCalendars.map(cal => cal.calendar_id);
      
      if (calendarsToCheck.length === 0 && tokens.calendar_id) {
        calendarsToCheck = [tokens.calendar_id];
      }
    }
    
    // Check availability for the entire day
    const availability = await checkCalendarAvailability(
      tokens.access_token,
      dayStart,
      dayEnd,
      undefined,
      calendarsToCheck
    );
    
    // Generate available slots
    const slots = [];
    const slotMs = slotMinutes * 60 * 1000;
    const startTime = new Date(dayStart);
    const endTime = new Date(dayEnd);
    
    for (let time = startTime.getTime(); time < endTime.getTime() - slotMs; time += slotMs) {
      const slotStart = new Date(time);
      const slotEnd = new Date(time + slotMs);
      
      // Check if this slot overlaps with any busy period
      const isBusy = availability.conflicts.some(conflict => {
        const busyStart = new Date(conflict.start);
        const busyEnd = new Date(conflict.end);
        return (slotStart < busyEnd && slotEnd > busyStart);
      });
      
      if (!isBusy) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          available: true
        });
      }
    }
    
    return NextResponse.json({
      date,
      slots,
      businessHours,
      slotMinutes,
      totalAvailable: slots.length
    });
  } catch (error) {
    console.error('Error getting agent calendar slots:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get available slots' },
      { status: 500 }
    );
  }
}