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
    const { start, end } = body as { start?: string; end?: string };
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
    }

    const accessToken = await getAgentAccessToken(agent_id);
    if (!accessToken) {
      return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });
    }

    // Fetch events in window and detect overlap
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
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
    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items as Array<{ start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> : [];
    const hasConflict = items.some((ev) => {
      const s = ev?.start?.dateTime || ev?.start?.date;
      const e = ev?.end?.dateTime || ev?.end?.date;
      if (!s || !e) return false;
      const S = new Date(s).getTime();
      const E = new Date(e).getTime();
      const A = new Date(start).getTime();
      const B = new Date(end).getTime();
      return A < E && B > S;
    });
    return NextResponse.json({ available: !hasConflict, start, end });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
