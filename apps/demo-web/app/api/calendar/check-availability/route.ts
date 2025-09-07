import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { refreshGoogleAccessToken } from '../../../../lib/google'
import { createClient } from '@supabase/supabase-js'

type Payload = {
  organizationId?: string
  start: string // ISO
  end: string // ISO
  calendarId?: string // default 'primary'
  calendarIds?: string[] // optional override list
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Payload
  const { organizationId, start, end, calendarId = 'primary', calendarIds } = body || {}
  if (!start || !end) {
    return new Response(JSON.stringify({ error: 'start and end required' }), { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

  let busy = [] as { start: string; end: string }[]

  // Try Google Calendar freebusy if access token is provided
  const c = cookies()
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
  // Resolve organization timezone (for naive datetime coercion)
  let orgTz: string | undefined
  if (supabase && organizationId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('timezone')
      .eq('id', organizationId)
      .single()
    orgTz = orgRow?.timezone || undefined
  }

  // Normalize datetimes to RFC3339 with timezone if not provided
  const normStart = normalizeRfc3339(start, orgTz)
  const normEnd = normalizeRfc3339(end, orgTz)

  let gError: string | undefined
  let usedGoogleCalendars: string[] = []
  if (gAccessToken) {
    try {
      // Determine which calendars to check: explicit list -> selected calendars -> primary
      let ids = calendarIds && calendarIds.length ? calendarIds : []
      if (!ids.length) {
        const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${gAccessToken}` }
        }).then((r) => (r.ok ? r.json() : null))
        if (cl?.items?.length) {
          ids = cl.items.filter((c: any) => c.selected === true || c.primary === true).map((c: any) => c.id)
        }
      }
      if (!ids.length) ids = [calendarId]
      usedGoogleCalendars = ids

      const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: normStart, timeMax: normEnd, items: ids.map((id) => ({ id })) })
      })
      if (r.ok) {
        const freebusy = await r.json()
        if (freebusy?.calendars) {
          for (const id of ids) {
            const slots = freebusy.calendars[id]?.busy || []
            busy = busy.concat(slots)
          }
        }
      } else {
        gError = `${r.status} ${await r.text()}`
      }
    } catch (e: any) {
      gError = e?.message || 'google freebusy failed'
    }
  }

  // Check Supabase appointments as well (only if we have env and organizationId)
  let conflicts: any[] = []
  if (supabase && organizationId) {
    const { data } = await supabase
      .from('appointments')
      .select('id, scheduled_start, scheduled_end, status')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .gte('scheduled_start', normStart)
      .lt('scheduled_end', normEnd)
    conflicts = data || []
  }

  const hasConflict = (conflicts?.length || 0) > 0 || busy.length > 0
  const resp = {
    available: !hasConflict,
    conflicts: { google: busy, db: conflicts },
    usedGoogle: !!gAccessToken,
    usedDB: !!(supabase && organizationId),
    googleError: gError,
    usedGoogleCalendars,
    start: normStart,
    end: normEnd
  }
  const r = NextResponse.json(resp)
  setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
  return r
}

// Helpers: add timezone offset to naive RFC3339 values using Intl
function normalizeRfc3339(input: string, timeZone?: string): string {
  if (!input) return input
  const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(input)
  let s = input
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'
  if (hasTz) return s
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
