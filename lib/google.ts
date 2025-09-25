import type { GoogleCalendar } from '../types/api';

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: 'Bearer';
};

export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokenResponse | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!r.ok) return null;
  return (await r.json()) as GoogleTokenResponse;
}

export async function getAccountTimezone(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { value: string };
    return j?.value || null;
  } catch {
    return null;
  }
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendar[] | null> {
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { items: GoogleCalendar[] };
    return j.items || [];
  } catch {
    return null;
  }
}

export async function checkCalendarAvailability(
  accessToken: string,
  start: string,
  end: string,
  calendarId: string = 'primary',
  calendarIds?: string[]
): Promise<{
  available: boolean;
  conflicts: Array<{ start: string; end: string }>;
  timeZone?: string;
}> {
  try {
    const accountTz = await getAccountTimezone(accessToken);
    const baseTz = accountTz || undefined;
    
    const normStart = normalizeRfc3339(start, baseTz);
    const normEnd = normalizeRfc3339(end, baseTz);
    
    let ids = calendarIds && calendarIds.length ? calendarIds : [];
    if (!ids.length) {
      const calendars = await listCalendars(accessToken);
      if (calendars && calendars.length > 0) {
        ids = calendars
          .filter((c) => (c.selected === true || c.primary === true) && 
                        (c.accessRole === 'owner' || c.accessRole === 'writer'))
          .map((c) => c.id);
      }
    }
    if (!ids.length) ids = [calendarId];
    
    const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        timeMin: normStart,
        timeMax: normEnd,
        timeZone: baseTz || 'UTC',
        items: ids.map((id) => ({ id }))
      })
    });
    
    if (!r.ok) {
      return {
        available: true, 
        conflicts: [],
        timeZone: baseTz
      };
    }
    
    const freebusy = (await r.json()) as { calendars: Record<string, { busy: Array<{ start: string; end: string }> }> };
    let busy: Array<{ start: string; end: string }> = [];
    
    if (freebusy?.calendars) {
      for (const id of ids) {
        const slots = freebusy.calendars[id]?.busy || [];
        busy = busy.concat(slots);
      }
    }
    
    return {
      available: busy.length === 0,
      conflicts: busy,
      timeZone: baseTz
    };
  } catch (error) {
    console.error('Error checking calendar availability:', error);
    return {
      available: true, 
      conflicts: [],
      timeZone: undefined
    };
  }
}

interface CalendarEventCreationRequest {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
  location?: string;
  conferenceData?: unknown;
}

interface CalendarEventCreationResponse {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  summary?: string;
  error?: string;
}

export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventCreationRequest,
  calendarId: string = 'primary'
): Promise<CalendarEventCreationResponse | null> {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${accessToken}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(event)
      }
    );
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Failed to create calendar event:', errorText);
      return { error: `${resp.status} ${errorText}` };
    }
    
    return (await resp.json()) as CalendarEventCreationResponse;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return { error: error instanceof Error ? error.message : 'Failed to create event' };
  }
}

// Minimal service account helper used by API routes that fall back to
// server-to-server Google Calendar access. Reads credentials from env.
export type ServiceAccount = { client_email: string; private_key: string };

export function getServiceAccount(): ServiceAccount {
  // Prefer a single JSON blob env var
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const parsed = JSON.parse(raw as string);
      if (parsed?.client_email && parsed?.private_key) {
        return {
          client_email: String(parsed.client_email),
          private_key: String(parsed.private_key)
        };
      }
    } catch {
      // Ignore JSON parse errors; fall back to individual env vars
    }
  }

  // Fallback to separate env vars
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  // Private key often has literal \n in env; normalize to real newlines
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google service account not configured');
  }
  return { client_email: clientEmail, private_key: privateKey };
}

function normalizeRfc3339(input: string, timeZone?: string): string {
  if (!input) return input;
  let s = input.trim();
  s = s.replace(/[zZ]$/,'').replace(/[+-]\d{2}:\d{2}$/,'');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
  if (!timeZone) return s + 'Z';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return s + 'Z';
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); 
  const h = Number(m[4]); const mi = Number(m[5]); const se = Number(m[6]);
  const utcProbe = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  const offset = tzOffsetString(timeZone, utcProbe);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`;
}

function tzOffsetString(timeZone: string, utcDate: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(utcDate);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
  const m = tzName.match(/GMT([+-])(\d{1,2})/);
  if (!m) return 'Z';
  const sign = m[1] === '-' ? '-' : '+';
  const hh = String(Number(m[2])).padStart(2, '0');
  return `${sign}${hh}:00`;
}
