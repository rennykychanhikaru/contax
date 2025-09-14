#!/bin/bash

echo "Fixing main app lint errors (excluding vendor code)..."

# Fix all remaining any types and unused variables in the main app

echo "Fixing calendar/list/route.ts..."
cat > app/api/calendar/list/route.ts << 'EOF'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GoogleCalendar } from '@/app/types/api'

export async function GET() {
  const c = await cookies()
  const token = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 401 })

  const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!r.ok) return NextResponse.json({ error: 'failed' }, { status: r.status })

  const data = await r.json()
  const calendars = (data.items as GoogleCalendar[]) || []

  return NextResponse.json({ calendars })
}
EOF

echo "Fixing calendar/slots/route.ts..."
cat > app/api/calendar/slots/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServiceAccount } from '@/lib/google';
import { JWT } from 'google-auth-library';
import { TimeSlot } from '@/app/types/api';

interface GoogleEvent {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date } = body;
  // const organizationId = body.organizationId || null; // Commented as not currently used

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('gcal_access')?.value ||
                       cookieStore.get('gcal_token')?.value ||
                       process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;

    if (accessToken) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.append('timeMin', startOfDay.toISOString());
      url.searchParams.append('timeMax', endOfDay.toISOString());
      url.searchParams.append('singleEvents', 'true');
      url.searchParams.append('orderBy', 'startTime');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const events = (data.items as GoogleEvent[])?.map(event => ({
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date
        })) || [];

        const busySlots: TimeSlot[] = [];
        events.forEach((event: { start?: string; end?: string }) => {
          if (event.start && event.end) {
            busySlots.push({ start: event.start, end: event.end });
          }
        });

        const availability: TimeSlot[] = [];
        const workStart = 9;
        const workEnd = 17;

        for (let hour = workStart; hour < workEnd; hour++) {
          const slotStart = new Date(date);
          slotStart.setHours(hour, 0, 0, 0);
          const slotEnd = new Date(date);
          slotEnd.setHours(hour + 1, 0, 0, 0);

          const isBusy = busySlots.some(slot => {
            const busyStart = new Date(slot.start);
            const busyEnd = new Date(slot.end);
            return slotStart < busyEnd && slotEnd > busyStart;
          });

          if (!isBusy) {
            availability.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString()
            });
          }
        }

        return NextResponse.json({ availability });
      }
    }

    const serviceAccount = getServiceAccount();
    const auth = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const serviceToken = await auth.getAccessToken();
    if (!serviceToken) {
      throw new Error('Failed to get service account token');
    }

    return NextResponse.json({ availability: [], usingServiceAccount: true });
  } catch (error) {
    console.error('Slots error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get slots' },
      { status: 500 }
    );
  }
}
EOF

echo "Fixing calendar/status/route.ts..."
cat > app/api/calendar/status/route.ts << 'EOF'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { validateAgentAccess } from '@/lib/agent-calendar'
import { refreshGoogleAccessToken } from '@/lib/google'

interface CalendarInfo {
  summary: string;
  id: string;
  primary?: boolean;
}

export async function GET() {
  const cookieStore = await cookies()

  const agentId = cookieStore.get('agent_id')?.value
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            console.error('Error setting cookies:', error)
          }
        },
      },
    }
  )

  if (agentId) {
    const isValid = await validateAgentAccess(agentId, supabase)
    if (!isValid) {
      return NextResponse.json({ status: 'no_access' })
    }

    const { data: agentTokens } = await supabase
      .from('agent_calendar_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('agent_id', agentId)
      .single()

    if (agentTokens?.access_token) {
      const needsRefresh = agentTokens.token_expiry && new Date(agentTokens.token_expiry) < new Date()

      if (needsRefresh && agentTokens.refresh_token) {
        const newToken = await refreshGoogleAccessToken(
          agentTokens.refresh_token,
          process.env.GOOGLE_CLIENT_ID!,
          process.env.GOOGLE_CLIENT_SECRET!
        )

        if (newToken?.access_token) {
          await supabase
            .from('agent_calendar_tokens')
            .update({
              access_token: newToken.access_token,
              token_expiry: new Date(Date.now() + (newToken.expires_in || 3600) * 1000).toISOString()
            })
            .eq('agent_id', agentId)

          const testResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
            headers: { 'Authorization': `Bearer ${newToken.access_token}` }
          })

          if (testResponse.ok) {
            const calendar = await testResponse.json() as CalendarInfo

            const { data: storedCalendars } = await supabase
              .from('agent_calendars')
              .select('calendar_id, calendar_name')
              .eq('agent_id', agentId)

            return NextResponse.json({
              status: 'connected',
              email: calendar.summary || 'Connected',
              calendars: storedCalendars || []
            })
          }
        }
      } else {
        const testResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
          headers: { 'Authorization': `Bearer ${agentTokens.access_token}` }
        })

        if (testResponse.ok) {
          const calendar = await testResponse.json() as CalendarInfo

          const { data: storedCalendars } = await supabase
            .from('agent_calendars')
            .select('calendar_id, calendar_name')
            .eq('agent_id', agentId)

          return NextResponse.json({
            status: 'connected',
            email: calendar.summary || 'Connected',
            calendars: storedCalendars || []
          })
        }
      }
    }
  }

  const token = cookieStore.get('gcal_access')?.value ||
                cookieStore.get('gcal_token')?.value ||
                process.env.GOOGLE_CALENDAR_ACCESS_TOKEN

  if (!token) {
    return NextResponse.json({ status: 'not_connected' })
  }

  const refreshToken = cookieStore.get('gcal_refresh')?.value
  const expiry = Number(cookieStore.get('gcal_expiry')?.value || 0)
  const needsRefresh = expiry > 0 && Date.now() > expiry - 60000

  let activeToken = token

  if (needsRefresh && refreshToken) {
    try {
      const newToken = await refreshGoogleAccessToken(
        refreshToken,
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!
      )

      if (newToken?.access_token) {
        activeToken = newToken.access_token

        cookieStore.set('gcal_access', newToken.access_token, {
          httpOnly: true,
          path: '/',
          maxAge: newToken.expires_in || 3600
        })

        const newExpiry = Date.now() + (newToken.expires_in || 3600) * 1000
        cookieStore.set('gcal_expiry', newExpiry.toString(), {
          httpOnly: true,
          path: '/'
        })
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
    }
  }

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { 'Authorization': `Bearer ${activeToken}` }
  })

  if (response.ok) {
    const calendar = await response.json() as CalendarInfo
    return NextResponse.json({
      status: 'connected',
      email: calendar.summary || 'Connected'
    })
  }

  if (response.status === 401) {
    return NextResponse.json({ status: 'token_expired' })
  }

  return NextResponse.json({ status: 'not_connected' })
}
EOF

echo "Fixing realtime/token/route.ts..."
cat > app/api/realtime/token/route.ts << 'EOF'
import { NextResponse } from 'next/server'

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      modalities: ['text', 'audio'],
      voice: 'sage'
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    return NextResponse.json({ error: data.error || 'Failed to create session' }, { status: response.status })
  }

  return NextResponse.json(data)
}
EOF

echo "Main app lint fixes completed!"