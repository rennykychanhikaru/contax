export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (!r.ok) return null
  return (await r.json()) as any
}

export async function getAccountTimezone(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!r.ok) return null
    const j = await r.json()
    // Response shape: { kind, etag, value: 'Europe/Amsterdam' }
    return j?.value || null
  } catch {
    return null
  }
}

/**
 * List all calendars for the authenticated user
 */
export async function listCalendars(accessToken: string): Promise<Array<{
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  selected?: boolean;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}> | null> {
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!r.ok) return null
    const j = await r.json()
    const items = (j.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary,
      accessRole: c.accessRole,
      selected: !!c.selected,
      timeZone: c.timeZone || null,
      backgroundColor: c.backgroundColor,
      foregroundColor: c.foregroundColor
    }))
    return items
  } catch {
    return null
  }
}

/**
 * Check calendar availability for a given time range
 */
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
    // Get account timezone
    const accountTz = await getAccountTimezone(accessToken)
    const baseTz = accountTz || undefined
    
    // Normalize datetimes
    const normStart = normalizeRfc3339(start, baseTz)
    const normEnd = normalizeRfc3339(end, baseTz)
    
    // Determine which calendars to check
    let ids = calendarIds && calendarIds.length ? calendarIds : []
    if (!ids.length) {
      // Fetch calendar list to get selected calendars
      const calendars = await listCalendars(accessToken)
      if (calendars && calendars.length > 0) {
        ids = calendars
          .filter((c) => (c.selected === true || c.primary === true) && 
                        (c.accessRole === 'owner' || c.accessRole === 'writer'))
          .map((c) => c.id)
      }
    }
    if (!ids.length) ids = [calendarId]
    
    // Check free/busy
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
    })
    
    if (!r.ok) {
      return {
        available: true, // Assume available if API fails
        conflicts: [],
        timeZone: baseTz
      }
    }
    
    const freebusy = await r.json()
    let busy: Array<{ start: string; end: string }> = []
    
    if (freebusy?.calendars) {
      for (const id of ids) {
        const slots = freebusy.calendars[id]?.busy || []
        busy = busy.concat(slots)
      }
    }
    
    return {
      available: busy.length === 0,
      conflicts: busy,
      timeZone: baseTz
    }
  } catch (error) {
    console.error('Error checking calendar availability:', error)
    return {
      available: true, // Assume available if error
      conflicts: [],
      timeZone: undefined
    }
  }
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
    location?: string;
    conferenceData?: any;
  },
  calendarId: string = 'primary'
): Promise<{
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: any;
  end?: any;
  summary?: string;
  error?: string;
} | null> {
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
    )
    
    if (!resp.ok) {
      const errorText = await resp.text()
      console.error('Failed to create calendar event:', errorText)
      return { error: `${resp.status} ${errorText}` }
    }
    
    const data = await resp.json()
    return {
      id: data.id,
      htmlLink: data.htmlLink,
      hangoutLink: data.hangoutLink,
      start: data.start,
      end: data.end,
      summary: data.summary
    }
  } catch (error) {
    console.error('Error creating calendar event:', error)
    return { error: error instanceof Error ? error.message : 'Failed to create event' }
  }
}

// Helper function to normalize RFC3339 datetime with timezone
function normalizeRfc3339(input: string, timeZone?: string): string {
  if (!input) return input
  // Always interpret the wall-clock portion in the provided timezone (if given),
  // ignoring any incoming offset to avoid ET/UTC mismatches.
  let s = input.trim()
  s = s.replace(/[zZ]$/,'').replace(/[+-]\d{2}:\d{2}$/,'')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'
  if (!timeZone) return s + 'Z'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return s + 'Z'
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); 
  const h = Number(m[4]); const mi = Number(m[5]); const se = Number(m[6])
  const utcProbe = new Date(Date.UTC(y, mo - 1, d, h, mi, se))
  const offset = tzOffsetString(timeZone, utcProbe)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`
}

// Helper function to get timezone offset string
function tzOffsetString(timeZone: string, utcDate: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
  const parts = fmt.formatToParts(utcDate)
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'
  const m = tzName.match(/GMT([+-])(\d{1,2})/)
  if (!m) return 'Z'
  const sign = m[1] === '-' ? '-' : '+'
  const hh = String(Number(m[2])).padStart(2, '0')
  return `${sign}${hh}:00`
}
