import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest) {
  const c = await cookies()
  const token = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 401 })

  const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!r.ok) return NextResponse.json({ error: 'google_error', detail: await r.text() }, { status: r.status })
  const j = await r.json()
  const items = (j.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    accessRole: c.accessRole,
    selected: !!c.selected,
    timeZone: c.timeZone || null
  }))
  return NextResponse.json({ calendars: items })
}

