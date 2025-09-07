export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (!r.ok) return null
  return (await r.json()) as any
}

export async function getAccountTimezone(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!r.ok) return null
    const j = await r.json()
    // Response shape: { kind, etag, value: 'Europe/Amsterdam' }
    return j?.value || null
  } catch {
    return null
  }
}
