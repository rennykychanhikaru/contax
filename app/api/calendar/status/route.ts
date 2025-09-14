import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { validateAgentAccess } from '@/lib/agent-calendar'
import { refreshGoogleAccessToken } from '@/lib/google'

interface CalendarInfo {
  summary: string;
  id: string;
  primary?: boolean;
}

export async function GET() {
  const cookieStore = await cookies()

  const agentId = cookieStore.get('agent_id')?.value
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            console.error('Error setting cookies:', error)
          }
        },
      },
    }
  )

  if (agentId) {
    const isValid = await validateAgentAccess(agentId, supabase)
    if (!isValid) {
      return NextResponse.json({ status: 'no_access' })
    }

    const { data: agentTokens } = await supabase
      .from('agent_calendar_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('agent_id', agentId)
      .single()

    if (agentTokens?.access_token) {
      const needsRefresh = agentTokens.token_expiry && new Date(agentTokens.token_expiry) < new Date()

      if (needsRefresh && agentTokens.refresh_token) {
        const newToken = await refreshGoogleAccessToken(
          agentTokens.refresh_token,
          process.env.GOOGLE_CLIENT_ID!,
          process.env.GOOGLE_CLIENT_SECRET!
        )

        if (newToken?.access_token) {
          await supabase
            .from('agent_calendar_tokens')
            .update({
              access_token: newToken.access_token,
              token_expiry: new Date(Date.now() + (newToken.expires_in || 3600) * 1000).toISOString()
            })
            .eq('agent_id', agentId)

          const testResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
            headers: { 'Authorization': `Bearer ${newToken.access_token}` }
          })

          if (testResponse.ok) {
            const calendar = await testResponse.json() as CalendarInfo

            const { data: storedCalendars } = await supabase
              .from('agent_calendars')
              .select('calendar_id, calendar_name')
              .eq('agent_id', agentId)

            return NextResponse.json({
              status: 'connected',
              email: calendar.summary || 'Connected',
              calendars: storedCalendars || []
            })
          }
        }
      } else {
        const testResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
          headers: { 'Authorization': `Bearer ${agentTokens.access_token}` }
        })

        if (testResponse.ok) {
          const calendar = await testResponse.json() as CalendarInfo

          const { data: storedCalendars } = await supabase
            .from('agent_calendars')
            .select('calendar_id, calendar_name')
            .eq('agent_id', agentId)

          return NextResponse.json({
            status: 'connected',
            email: calendar.summary || 'Connected',
            calendars: storedCalendars || []
          })
        }
      }
    }
  }

  const token = cookieStore.get('gcal_access')?.value ||
                cookieStore.get('gcal_token')?.value ||
                process.env.GOOGLE_CALENDAR_ACCESS_TOKEN

  if (!token) {
    return NextResponse.json({ status: 'not_connected' })
  }

  const refreshToken = cookieStore.get('gcal_refresh')?.value
  const expiry = Number(cookieStore.get('gcal_expiry')?.value || 0)
  const needsRefresh = expiry > 0 && Date.now() > expiry - 60000

  let activeToken = token

  if (needsRefresh && refreshToken) {
    try {
      const newToken = await refreshGoogleAccessToken(
        refreshToken,
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!
      )

      if (newToken?.access_token) {
        activeToken = newToken.access_token

        cookieStore.set('gcal_access', newToken.access_token, {
          httpOnly: true,
          path: '/',
          maxAge: newToken.expires_in || 3600
        })

        const newExpiry = Date.now() + (newToken.expires_in || 3600) * 1000
        cookieStore.set('gcal_expiry', newExpiry.toString(), {
          httpOnly: true,
          path: '/'
        })
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
    }
  }

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { 'Authorization': `Bearer ${activeToken}` }
  })

  if (response.ok) {
    const calendar = await response.json() as CalendarInfo
    return NextResponse.json({
      status: 'connected',
      email: calendar.summary || 'Connected'
    })
  }

  if (response.status === 401) {
    return NextResponse.json({ status: 'token_expired' })
  }

  return NextResponse.json({ status: 'not_connected' })
}
