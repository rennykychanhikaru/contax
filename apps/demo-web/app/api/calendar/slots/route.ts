import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAccountTimezone, refreshGoogleAccessToken } from '../../../../lib/google'

type Payload = {
  organizationId?: string
  date: string // YYYY-MM-DD
  slotMinutes?: number // default 60
  businessHours?: { start?: string; end?: string } // HH:MM
  calendarIds?: string[]
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Payload
  const { organizationId, date, calendarIds } = body || {}
  const slotMinutes = Math.max(5, Math.min(240, body?.slotMinutes || 60))
  const bhStart = body?.businessHours?.start || '09:00'
  const bhEnd = body?.businessHours?.end || '17:00'
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid_date', detail: 'Expected YYYY-MM-DD' }, { status: 400 })
  }

  // No DB usage in Google-only mode

  // Google access
  const c = await cookies()
  let gAccessToken = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  const refreshTok = c.get('gcal_refresh')?.value
  const expiry = Number(c.get('gcal_expiry')?.value || 0)
  const nowSec = Math.floor(Date.now() / 1000)
  const setCookies: { name: string; value: string }[] = []
  if ((!gAccessToken || (expiry && nowSec >= expiry)) && refreshTok && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const rt = await refreshGoogleAccessToken(refreshTok, process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    if (rt?.access_token) {
      gAccessToken = rt.access_token
      const newExpiry = nowSec + (rt.expires_in || 3600) - 60
      setCookies.push({ name: 'gcal_access', value: gAccessToken })
      setCookies.push({ name: 'gcal_expiry', value: String(newExpiry) })
      setCookies.push({ name: 'gcal_token', value: gAccessToken })
    }
  }
  if (!gAccessToken) return NextResponse.json({ error: 'no_google_token' }, { status: 401 })

  const accountTz = (await getAccountTimezone(gAccessToken)) || 'UTC'

  // Determine day window in tz
  const [y, m, d] = date.split('-').map(Number)
  const dayStartIso = withTzIso(y, m, d, 0, 0, 0, accountTz)
  const dayEndIso = withTzIso(y, m, d, 23, 59, 59, accountTz)
  const bhStartIso = withTzIso(y, m, d, ...hm(bhStart), accountTz)
  const bhEndIso = withTzIso(y, m, d, ...hm(bhEnd), accountTz)

  // Calendars to consider
  let ids = calendarIds && calendarIds.length ? calendarIds : []
  if (!ids.length) {
    const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${gAccessToken}` }
    }).then((r) => (r.ok ? r.json() : null))
    if (cl?.items?.length) {
      ids = cl.items.filter((c: any) => c.selected === true || c.primary === true).map((c: any) => c.id)
    }
  }
  if (!ids.length) return NextResponse.json({ error: 'no_calendars' }, { status: 400 })

  // FreeBusy
  const fbResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${gAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: dayStartIso, timeMax: dayEndIso, timeZone: accountTz, items: ids.map((id) => ({ id })) })
  })
  if (!fbResp.ok) return NextResponse.json({ error: 'google_error', detail: await fbResp.text() }, { status: 502 })
  const fb = await fbResp.json()
  let busy: { start: number; end: number }[] = []
  for (const id of ids) {
    const arr = fb?.calendars?.[id]?.busy || []
    for (const b of arr) busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) })
  }

  // DB overlaps disabled

  // Merge busy intervals
  busy.sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const b of busy) {
    if (!merged.length || b.start > merged[merged.length - 1].end) merged.push({ ...b })
    else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end)
  }

  // Compute free windows within business hours
  const bhStartTs = Date.parse(bhStartIso)
  const bhEndTs = Date.parse(bhEndIso)
  const free: { start: number; end: number }[] = []
  let cursor = bhStartTs
  for (const b of merged) {
    if (b.end <= bhStartTs || b.start >= bhEndTs) continue
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, bhEndTs) })
    cursor = Math.max(cursor, b.end)
    if (cursor >= bhEndTs) break
  }
  if (cursor < bhEndTs) free.push({ start: cursor, end: bhEndTs })

  // Expand into slots
  const slots: { start: string; end: string }[] = []
  for (const w of free) {
    let s = w.start
    while (s + slotMinutes * 60000 <= w.end) {
      const e = s + slotMinutes * 60000
      slots.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() })
      s += slotMinutes * 60000
    }
  }

  const res = NextResponse.json({ slots, timeZone: accountTz, usedGoogleCalendars: ids, dayStart: dayStartIso, dayEnd: dayEndIso })
  setCookies.forEach((kv) => res.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
  return res
}

function hm(s: string): [number, number, number] {
  const m = s.match(/^(\d{2}):(\d{2})$/)
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), 0]
}

function withTzIso(y: number, m: number, d: number, hh: number, mm: number, ss: number, timeZone: string) {
  const utc = new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
  const parts = fmt.formatToParts(utc)
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'
  const m2 = tzName.match(/GMT([+-])(\d{1,2})/)
  const sign = m2?.[1] === '-' ? '-' : '+'
  const off = String(Number(m2?.[2] || '0')).padStart(2, '0')
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${sign}${off}:00`
  return iso
}
