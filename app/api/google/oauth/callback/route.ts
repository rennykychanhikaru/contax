import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || 'http://localhost:3000/api/google/oauth/callback'

  if (!code || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  const data = await r.json()

  if (data.error || !data.access_token) {
    return NextResponse.json({ error: data.error || 'Failed to get token' }, { status: 400 })
  }

  const response = NextResponse.redirect(new URL('/', req.url))
  response.cookies.set('gcal_access', data.access_token, {
    httpOnly: true,
    path: '/',
    maxAge: data.expires_in || 3600
  })

  if (data.refresh_token) {
    response.cookies.set('gcal_refresh', data.refresh_token, {
      httpOnly: true,
      path: '/'
    })
  }

  const expiry = Date.now() + (data.expires_in || 3600) * 1000
  response.cookies.set('gcal_expiry', expiry.toString(), {
    httpOnly: true,
    path: '/'
  })

  return response
}
