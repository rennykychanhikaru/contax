import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServiceAccount } from '@/lib/google';
import { JWT } from 'google-auth-library';
import { TimeSlot } from '@/types/api';

interface GoogleEvent {
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function POST(_req: NextRequest) {
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
