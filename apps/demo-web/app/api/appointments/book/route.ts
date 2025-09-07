import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { refreshGoogleAccessToken } from '../../../../lib/google'
import { createClient } from '@supabase/supabase-js'

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

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Normalize datetimes with org timezone if needed
  let orgTz: string | undefined
  const { data: orgRow } = await supabase.from('organizations').select('timezone').eq('id', organizationId).single()
  orgTz = orgRow?.timezone || undefined
  const normStart = normalizeRfc3339(start, orgTz)
  const normEnd = normalizeRfc3339(end, orgTz)

  // Insert appointment locally first
  const { data: appt, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: organizationId,
      customer_name: customer?.name || null,
      customer_phone: customer?.phone || null,
      customer_email: customer?.email || null,
      scheduled_start: normStart,
      scheduled_end: normEnd,
      status: 'confirmed',
      notes: notes || null
    })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: 'DB insert failed', detail: error.message }), { status: 500 })
  }

  // Optionally create Google Calendar event if access token provided
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
  let googleEventId: string | undefined
  let googleError: string | undefined
  if (gAccessToken) {
    try {
      const event = {
        summary: `Appointment: ${customer?.name || 'Customer'}`,
        description: `Phone: ${customer?.phone || ''}\n${notes || ''}`.trim(),
        start: { dateTime: normStart },
        end: { dateTime: normEnd }
      }
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      })
      if (resp.ok) {
        const data = await resp.json()
        googleEventId = data.id
        await supabase.from('appointments').update({ google_event_id: googleEventId }).eq('id', appt.id)
      } else {
        googleError = `${resp.status} ${await resp.text()}`
      }
    } catch (e: any) {
      googleError = e?.message || 'google event create failed'
    }
  }

  const r = NextResponse.json({ appointment: { ...appt, google_event_id: googleEventId }, googleError, start: normStart, end: normEnd })
  setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
  return r
}

// Helpers shared with availability route
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
