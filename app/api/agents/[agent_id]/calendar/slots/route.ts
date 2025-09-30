import { NextRequest, NextResponse } from 'next/server';
import { getAgentCalendarTokens } from '@/lib/agent-calendar';

async function getAgentAccessToken(agentId: string): Promise<string | null> {
  const tokens = await getAgentCalendarTokens(agentId);
  return tokens?.access_token || null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ agent_id: string }> }) {
  try {
    const { agent_id } = await ctx.params;
    const body = await req.json();
    const { date, slotMinutes = 60 } = body as { date?: string; slotMinutes?: number };
    if (!date) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const accessToken = await getAgentAccessToken(agent_id);
    if (!accessToken) return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });

    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.append('timeMin', startOfDay.toISOString());
    url.searchParams.append('timeMax', endOfDay.toISOString());
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return NextResponse.json({ error: 'google_error', detail: t }, { status: r.status });
    }
    const j = await r.json();
    const events = Array.isArray(j?.items) ? j.items : [];
    const busy: Array<{ start: Date; end: Date }> = [];
    for (const ev of events) {
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
