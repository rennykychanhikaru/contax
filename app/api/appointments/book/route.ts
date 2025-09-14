import { NextRequest, NextResponse } from 'next/server';
import { getServiceAccount } from '@/lib/google';
import { JWT } from 'google-auth-library';
import { TimeSlot } from '@/app/types/api';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, slot, name, email } = body;

  try {
    const serviceAccount = getServiceAccount();

    const auth = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const accessToken = await auth.getAccessToken();
    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    // Get available slots
    const checkUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${serviceAccount.client_email}/events`);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    checkUrl.searchParams.append('timeMin', startOfDay.toISOString());
    checkUrl.searchParams.append('timeMax', endOfDay.toISOString());
    checkUrl.searchParams.append('singleEvents', 'true');
    checkUrl.searchParams.append('orderBy', 'startTime');

    const checkResponse = await fetch(checkUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const events = await checkResponse.json();
    const busyTimes = events.items?.map((event: { start?: { dateTime?: string }; end?: { dateTime?: string } }) => ({
      start: event.start?.dateTime,
      end: event.end?.dateTime
    })) || [];

    // Generate available slots
    const availability: TimeSlot[] = [];
    const workStart = 9;
    const workEnd = 17;

    for (let hour = workStart; hour < workEnd; hour++) {
      const slotStart = new Date(date);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(hour + 1, 0, 0, 0);

      const isBusy = busyTimes.some((busy: { start?: string; end?: string }) => {
        if (!busy.start || !busy.end) return false;
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        availability.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString()
        });
      }
    }

    // Select the slot
    let startTime: string;
    if (slot === 'random' && availability.length > 0) {
      const randomIndex = Math.floor(Math.random() * availability.length);
      const selectedSlot = availability[randomIndex];
      startTime = selectedSlot.start;
    } else if (slot) {
      startTime = slot;
    } else {
      return NextResponse.json({ error: 'No available slots' }, { status: 400 });
    }

    const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

    // Create the event
    const event = {
      summary: `Meeting with ${name}`,
      description: `Scheduled meeting with ${name} (${email})`,
      start: {
        dateTime: startTime,
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/Los_Angeles'
      },
      conferenceData: {
        createRequest: {
          requestId: `meeting-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${serviceAccount.client_email}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    const createdEvent = await response.json();

    return NextResponse.json({
      success: true,
      event: {
        id: createdEvent.id,
        link: createdEvent.htmlLink,
        meetLink: createdEvent.hangoutLink,
        start: createdEvent.start.dateTime,
        end: createdEvent.end.dateTime
      }
    });
  } catch (error) {
    console.error('Booking error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to book appointment' },
      { status: 500 }
    );
  }
}
