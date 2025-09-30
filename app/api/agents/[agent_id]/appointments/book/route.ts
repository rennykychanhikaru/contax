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
    type Customer = { name?: string; email?: string; phone?: string };
    const { start, end, customer, notes } = body as { start?: string; end?: string; customer?: Customer; notes?: string };
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
    }

    const accessToken = await getAgentAccessToken(agent_id);
    if (!accessToken) return NextResponse.json({ error: 'calendar_not_connected' }, { status: 409 });

    const summary = customer?.name ? `Consultation with ${customer.name}` : 'Consultation';
    const event: {
      summary: string;
      description?: string;
      start: { dateTime: string };
      end: { dateTime: string };
      conferenceData: { createRequest: { requestId: string; conferenceSolutionKey: { type: 'hangoutsMeet' } } };
      attendees?: Array<{ email: string }>;
    } = {
      summary,
      description: notes || undefined,
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      conferenceData: { createRequest: { requestId: `mtg-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      attendees: customer?.email ? [{ email: customer.email }] : undefined,
    };

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    let payload: unknown = null;
    try { payload = await r.json(); } catch { payload = null; }
    if (!r.ok) {
      return NextResponse.json({ error: 'google_error', status: r.status, detail: payload }, { status: r.status });
    }
    const p = payload as { id?: string; htmlLink?: string } | null;
    return NextResponse.json({ success: true, event: { id: p?.id, link: p?.htmlLink, start, end } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
