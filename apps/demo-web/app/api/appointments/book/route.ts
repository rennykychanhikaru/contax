import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { refreshGoogleAccessToken, getAccountTimezone } from '../../../../lib/google'
// No DB usage in Google-only mode

type Payload = {
  organizationId: string
  customer: { name?: string; phone?: string; email?: string }
  start: string // ISO
  end: string // ISO
  notes?: string
  calendarId?: string // default 'primary'
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Payload
  const { organizationId, customer, start, end, notes, calendarId = 'primary' } = body || {}
  if (!organizationId || !start || !end) {
    return new Response(JSON.stringify({ error: 'organizationId, start, end required' }), { status: 400 })
  }

  // DB disabled

  // Optionally use Google access token
  const c = await cookies()
  let gAccessToken = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  const refreshTok = c.get('gcal_refresh')?.value
  const expiry = Number(c.get('gcal_expiry')?.value || 0)
  const nowSec = Math.floor(Date.now() / 1000)
  const setCookies: { name: string; value: string }[] = []
  if ((!gAccessToken || (expiry && nowSec >= expiry)) && refreshTok && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const rt = await refreshGoogleAccessToken(refreshTok, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    if (rt?.access_token) {
      gAccessToken = rt.access_token
      const newExpiry = nowSec + (rt.expires_in || 3600) - 60
      setCookies.push({ name: 'gcal_access', value: gAccessToken })
      setCookies.push({ name: 'gcal_expiry', value: String(newExpiry) })
      setCookies.push({ name: 'gcal_token', value: gAccessToken })
    }
  }

  // Normalize datetimes using org or account timezone
  // Use only Google account timezone
  const accountTz = gAccessToken ? await getAccountTimezone(gAccessToken) : null
  const baseTz = accountTz || undefined
  const normStart = normalizeRfc3339(start, baseTz)
  const normEnd = normalizeRfc3339(end, baseTz)

  // No DB pre-check; Google is the source of truth

  // Guardrail: verify not busy on Google via FreeBusy before inserting
  if (gAccessToken) {
    try {
      let ids: string[] = []
      const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${gAccessToken}` }
      }).then((r) => (r.ok ? r.json() : null))
      if (cl?.items?.length) {
        ids = cl.items
          .filter((cal: any) => (cal.selected === true || cal.primary === true) && (cal.accessRole === 'owner' || cal.accessRole === 'writer'))
          .map((cal: any) => cal.id)
      }
      if (!ids.length) ids = [calendarId]

      const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: normStart, timeMax: normEnd, timeZone: baseTz || 'UTC', items: ids.map((id) => ({ id })) })
      })
      if (fb.ok) {
        const j = await fb.json()
        let busy: { start: string; end: string }[] = []
        for (const id of ids) busy = busy.concat(j?.calendars?.[id]?.busy || [])
        if (busy.length) {
          const r = NextResponse.json(
            { error: 'conflict', message: 'Requested time is busy on Google Calendar', conflicts: busy, usedGoogleCalendars: ids, timeZone: baseTz || null },
            { status: 409 }
          )
          setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
          return r
        }
      } else {
        const text = await fb.text()
        const r = NextResponse.json({ error: 'google_freebusy_failed', detail: text }, { status: 502 })
        setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
        return r
      }
    } catch (e: any) {
      const r = NextResponse.json({ error: 'freebusy_exception', detail: e?.message || 'failed' }, { status: 502 })
      setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
      return r
    }
  }

  // No local DB insert
  let googleEventId: string | undefined
  let googleError: string | undefined
  if (gAccessToken) {
    try {
      const event = {
        summary: `Appointment: ${customer?.name || 'Customer'}`,
        description: `Phone: ${customer?.phone || ''}\n${notes || ''}`.trim(),
        start: { dateTime: normStart, timeZone: baseTz },
        end: { dateTime: normEnd, timeZone: baseTz }
      }
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      })
      if (resp.ok) {
        const data = await resp.json()
        googleEventId = data.id
      } else {
        googleError = `${resp.status} ${await resp.text()}`
      }
    } catch (e: any) {
      googleError = e?.message || 'google event create failed'
    }
  }

  const r = NextResponse.json({ appointment: googleEventId ? { google_event_id: googleEventId } : null, googleError, start: normStart, end: normEnd, timeZone: baseTz || null })
  setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
  return r
}

// Helpers shared with availability route
function normalizeRfc3339(input: string, timeZone?: string): string {
  if (!input) return input
  // Always treat the provided wall time as being in the given timezone (ignore incoming offset)
  let s = input.trim()
  s = s.replace(/[zZ]$/,'').replace(/[+-]\d{2}:\d{2}$/,'')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'
  if (!timeZone) return s + 'Z'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return s + 'Z'
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); const h = Number(m[4]); const mi = Number(m[5]); const se = Number(m[6])
  const utcProbe = new Date(Date.UTC(y, mo - 1, d, h, mi, se))
  const offset = tzOffsetString(timeZone, utcProbe)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`
}

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
