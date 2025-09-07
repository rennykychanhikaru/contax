import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { refreshGoogleAccessToken, getAccountTimezone } from '../../../../lib/google'

type Status = {
  connected: boolean
  hasToken: boolean
  scopes?: string[]
  calendars?: { id: string; summary: string; primary?: boolean; accessRole?: string; selected?: boolean }[]
  primaryReachable?: boolean
  primaryTimeZone?: string
  accountTimeZone?: string
  errors?: { step: string; message: string }[]
}

export async function GET(req: NextRequest) {
  const c = cookies()
  let token = c.get('gcal_access')?.value || c.get('gcal_token')?.value || process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  const refresh = c.get('gcal_refresh')?.value
  const expiry = Number(c.get('gcal_expiry')?.value || 0)
  const nowSec = Math.floor(Date.now() / 1000)
  let setCookies: { name: string; value: string }[] = []

  // Preemptive refresh when expired or missing and refresh is present
  if ((!token || (expiry && nowSec >= expiry)) && refresh && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const rt = await refreshGoogleAccessToken(refresh, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    if (rt?.access_token) {
      token = rt.access_token
      const newExpiry = nowSec + (rt.expires_in || 3600) - 60
      setCookies.push({ name: 'gcal_access', value: token })
      setCookies.push({ name: 'gcal_expiry', value: String(newExpiry) })
      setCookies.push({ name: 'gcal_token', value: token })
    }
  }
  const res: Status = { connected: false, hasToken: !!token, errors: [] }
  if (!token) {
    const r = NextResponse.json(res)
    setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
    return r
  }

  // 1) Check token scopes
  try {
    const info = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`)
    if (info.ok) {
      const j = await info.json()
      const scopes = typeof j.scope === 'string' ? (j.scope as string).split(' ') : []
      res.scopes = scopes
    } else {
      res.errors!.push({ step: 'tokeninfo', message: `${info.status} ${await info.text()}` })
    }
  } catch (e: any) {
    res.errors!.push({ step: 'tokeninfo', message: e?.message || 'tokeninfo failed' })
  }

  // 2) List calendars (include accessRole & selected)
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (r.ok) {
      const j = await r.json()
      const items = (j.items || [])
      res.calendars = items.map((c: any) => ({ id: c.id, summary: c.summary, primary: !!c.primary, accessRole: c.accessRole, selected: !!c.selected }))
      const primary = items.find((c: any) => c.primary) || items.find((c: any) => c.selected)
      if (primary?.timeZone) res.primaryTimeZone = primary.timeZone
    } else {
      res.errors!.push({ step: 'calendarList', message: `${r.status} ${await r.text()}` })
    }
  } catch (e: any) {
    res.errors!.push({ step: 'calendarList', message: e?.message || 'calendarList failed' })
  }

  // 3) FreeBusy probe for primary (now to now+60m)
  try {
    const now = new Date()
    const end = new Date(now.getTime() + 60 * 60 * 1000)
    const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: now.toISOString(), timeMax: end.toISOString(), items: [{ id: 'primary' }] })
    })
    if (fb.ok) {
      res.primaryReachable = true
    } else {
      res.primaryReachable = false
      res.errors!.push({ step: 'freeBusy', message: `${fb.status} ${await fb.text()}` })
    }
  } catch (e: any) {
    res.primaryReachable = false
    res.errors!.push({ step: 'freeBusy', message: e?.message || 'freeBusy failed' })
  }

  // 4) Account timezone (authoritative)
  try {
    const tz = await getAccountTimezone(token)
    if (tz) res.accountTimeZone = tz
  } catch {}

  res.connected = !!res.scopes && Array.isArray(res.calendars) && res.primaryReachable === true
  const r = NextResponse.json(res)
  setCookies.forEach((kv) => r.cookies.set(kv.name, kv.value, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }))
  return r
}
