import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || 'http://localhost:3000/api/google/oauth/callback'

  if (!code || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing code or client credentials' }, { status: 400 })
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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

  if (!tokenRes.ok) {
    const t = await tokenRes.text()
    return NextResponse.json({ error: 'token-exchange-failed', detail: t }, { status: 500 })
  }

  const tok = await tokenRes.json()
  const accessToken = tok.access_token as string
  const refreshToken = tok.refresh_token as string | undefined
  const expiresIn = (tok.expires_in as number) || 3600
  const nowSec = Math.floor(Date.now() / 1000)
  const expirySec = nowSec + expiresIn - 60 // 60s early refresh window

  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set('gcal_access', accessToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  if (refreshToken) {
    res.cookies.set('gcal_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  }
  res.cookies.set('gcal_expiry', String(expirySec), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  // Backward compatibility with prior code path
  res.cookies.set('gcal_token', accessToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  return res
}

