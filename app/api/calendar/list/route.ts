import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { GoogleCalendar } from '@/types/api'

export async function GET() {
  const c = await cookies()
  const token = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'no_token' }, { status: 401 })

  const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!r.ok) return NextResponse.json({ error: 'failed' }, { status: r.status })

  const data = await r.json()
  const calendars = (data.items as GoogleCalendar[]) || []

  return NextResponse.json({ calendars })
}
