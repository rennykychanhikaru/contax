import { NextRequest, NextResponse } from 'next/server';
import { getAgentCalendarTokens } from '@/lib/agent-calendar';

export async function POST(req: NextRequest, ctx: { params: Promise<{ agent_id: string }> }) {
  try {
    const { agent_id } = await ctx.params;
    const body = await req.json();
    const { date, slotMinutes = 60 } = body as { date?: string; slotMinutes?: number };
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const tokens = await getAgentCalendarTokens(agent_id);
    const accessToken = tokens?.access_token || null;
    if (!accessToken) return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });
    const calendarId = tokens?.calendar_id || 'primary';

    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.append('timeMin', startOfDay.toISOString());
    url.searchParams.append('timeMax', endOfDay.toISOString());
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
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
    const j = await r.json();
    const events: GEvent[] = Array.isArray(j?.items) ? j.items : [];
    const blocking = events.filter((ev) => {
      const status = (ev.status || 'confirmed').toLowerCase();
      const trans = (ev.transparency || 'opaque').toLowerCase();
      const type = (ev.eventType || '').toLowerCase();
      if (status !== 'confirmed') return false;
      if (trans === 'transparent') return false;
      if (type === 'workinglocation' || type === 'working_location' || type === 'focustime' || type === 'focus_time') return false;
      return true;
    });
    const busy: Array<{ start: Date; end: Date }> = [];
    for (const ev of blocking) {
      const s = ev?.start?.dateTime || ev?.start?.date;
      const e = ev?.end?.dateTime || ev?.end?.date;
      if (!s || !e) continue;
      busy.push({ start: new Date(s), end: new Date(e) });
    }

    const slots: Array<{ start: string; end: string }> = [];
    const workStart = 9, workEnd = 17;
    for (let h = workStart; h < workEnd; h++) {
      const s = new Date(date); s.setHours(h, 0, 0, 0);
      const e = new Date(s.getTime() + slotMinutes * 60000);
      const overlap = busy.some(b => s < b.end && e > b.start);
      if (!overlap) slots.push({ start: s.toISOString(), end: e.toISOString() });
    }
    return NextResponse.json({ slots, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
