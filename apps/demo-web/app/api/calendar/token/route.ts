import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { accessToken } = await req.json().catch(() => ({ accessToken: undefined }))
  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken required' }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('gcal_token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // Secure in production, allow HTTP in dev
    path: '/'
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('gcal_token', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  return res
}

