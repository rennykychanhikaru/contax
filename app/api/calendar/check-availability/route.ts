import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServiceAccount, refreshGoogleAccessToken } from '@/lib/google';
import { JWT } from 'google-auth-library';
import { createServerClient } from '@supabase/ssr';

interface GoogleEvent {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function POST(_req: NextRequest) {
  const body = await req.json();
  const { date, agentId } = body;

  const cookieStore = await cookies();
  // const organizationId = body.organizationId || null; // Commented as not currently used

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
            console.error('Error setting cookies:', error);
          }
        },
      },
    }
  );

  try {
    let accessToken: string | null = null;

    if (agentId) {
      const { data: agentTokens } = await supabase
        .from('agent_calendar_tokens')
        .select('access_token, refresh_token, token_expiry')
        .eq('agent_id', agentId)
        .single();

      if (agentTokens) {
        const needsRefresh = agentTokens.token_expiry && new Date(agentTokens.token_expiry) < new Date();

        if (needsRefresh && agentTokens.refresh_token) {
          const newToken = await refreshGoogleAccessToken(
            agentTokens.refresh_token,
            process.env.GOOGLE_CLIENT_ID!,
            process.env.GOOGLE_CLIENT_SECRET!
          );

          if (newToken?.access_token) {
            accessToken = newToken.access_token;

            await supabase
              .from('agent_calendar_tokens')
              .update({
                access_token: newToken.access_token,
                token_expiry: new Date(Date.now() + (newToken.expires_in || 3600) * 1000).toISOString()
              })
              .eq('agent_id', agentId);
          }
        } else {
          accessToken = agentTokens.access_token;
        }
      }
    }

    if (!accessToken) {
      accessToken = cookieStore.get('gcal_access')?.value ||
                   cookieStore.get('gcal_token')?.value ||
                   process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || null;

      const refreshToken = cookieStore.get('gcal_refresh')?.value;
      const expiry = Number(cookieStore.get('gcal_expiry')?.value || 0);
      const needsRefresh = expiry > 0 && Date.now() > expiry - 60000;

      if (needsRefresh && refreshToken) {
        const newToken = await refreshGoogleAccessToken(
          refreshToken,
          process.env.GOOGLE_CLIENT_ID!,
          process.env.GOOGLE_CLIENT_SECRET!
        );

        if (newToken?.access_token) {
          accessToken = newToken.access_token;
          cookieStore.set('gcal_access', newToken.access_token, {
            httpOnly: true,
            path: '/',
            maxAge: newToken.expires_in || 3600
          });

          const newExpiry = Date.now() + (newToken.expires_in || 3600) * 1000;
          cookieStore.set('gcal_expiry', newExpiry.toString(), {
            httpOnly: true,
            path: '/'
          });
        }
      }
    }

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
        const events = data.items?.map((event: GoogleEvent) => ({
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date
        })) || [];

        const busySlots: Array<{ start: string; end: string }> = [];
        events.forEach((event: { start?: string; end?: string }) => {
          if (event.start && event.end) {
            busySlots.push({ start: event.start, end: event.end });
          }
        });

        const availability: Array<{ start: string; end: string }> = [];
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

        return NextResponse.json({ availability, busySlots });
      } else if (response.status === 401) {
        return NextResponse.json({ error: 'token_expired' }, { status: 401 });
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

    return NextResponse.json({ availability: [], busySlots: [], usingServiceAccount: true });
  } catch (error) {
    console.error('Calendar check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check availability' },
      { status: 500 }
    );
  }
}
