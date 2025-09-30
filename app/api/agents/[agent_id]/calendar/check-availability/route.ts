import { NextRequest, NextResponse } from 'next/server';
import { getAgentCalendarTokens } from '@/lib/agent-calendar';

export async function POST(req: NextRequest, ctx: { params: Promise<{ agent_id: string }> }) {
  try {
    const { agent_id } = await ctx.params;
    const body = await req.json();
    const { start, end } = body as { start?: string; end?: string };
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
    }

    const tokens = await getAgentCalendarTokens(agent_id);
    const accessToken = tokens?.access_token || null;
    if (!accessToken) {
      return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });
    }
    const calendarId = tokens?.calendar_id || 'primary';

    // Fetch events in window and detect overlap
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.append('timeMin', new Date(start).toISOString());
    url.searchParams.append('timeMax', new Date(end).toISOString());
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return NextResponse.json({ error: 'google_error', detail: t }, { status: r.status });
    }
    type GEvent = {
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
      transparency?: string;
      eventType?: string;
    };
    const items: GEvent[] = Array.isArray((await r.clone().json())?.items)
      ? ((await r.json()) as { items: GEvent[] }).items
      : ((await r.json())?.items ?? []);

    const relevant = (items || []).filter((ev) => {
      const status = (ev.status || 'confirmed').toLowerCase();
      const trans = (ev.transparency || 'opaque').toLowerCase();
      const type = (ev.eventType || '').toLowerCase();
      // Ignore non-blocking events
      if (status !== 'confirmed') return false;
      if (trans === 'transparent') return false;
      if (type === 'workinglocation' || type === 'working_location' || type === 'focustime' || type === 'focus_time') return false;
      return true;
    });

    const A = new Date(start).getTime();
    const B = new Date(end).getTime();
    const hasConflict = relevant.some((ev) => {
      const sRaw = ev?.start?.dateTime || ev?.start?.date;
      const eRaw = ev?.end?.dateTime || ev?.end?.date;
      if (!sRaw || !eRaw) return false;
      const S = new Date(sRaw).getTime();
      const E = new Date(eRaw).getTime();
      return A < E && B > S;
    });
    return NextResponse.json({ available: !hasConflict, start, end });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
