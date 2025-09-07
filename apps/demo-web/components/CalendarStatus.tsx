'use client'

import { useEffect, useState } from 'react'

type GCalStatus = {
  connected: boolean
  hasToken: boolean
  scopes?: string[]
  calendars?: { id: string; summary: string; primary?: boolean }[]
  primaryReachable?: boolean
  errors?: { step: string; message: string }[]
}

export function CalendarStatus() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<GCalStatus | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/status').then((r) => r.json())
      setStatus(res)
    } catch (e) {
      setStatus({ connected: false, hasToken: false, errors: [{ step: 'client', message: (e as Error).message }] })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const connected = status?.connected
  const color = connected ? '#0a7' : '#c33'

  return (
    <div style={{ marginBottom: 12, padding: 8, background: '#fafafa', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 6, background: color }} />
        <strong>Google Calendar:</strong>
        <span>
          {status
            ? connected
              ? 'Connected'
              : status.hasToken
              ? 'Token present, but connection failed'
              : 'Token missing'
            : 'Checking…'}
        </span>
        <button
          onClick={() => {
            // Open OAuth consent flow
            window.location.href = '/api/google/oauth/start'
          }}
          style={{ marginLeft: 'auto' }}
        >
          Connect Google
        </button>
      </div>
      {status?.scopes && (
        <div style={{ marginTop: 6, color: '#555' }}>
          Scopes: <code>{status.scopes.join(' ')}</code>
        </div>
      )}
      {status?.calendars && (
        <div style={{ marginTop: 6, color: '#555' }}>
          Calendars: {status.calendars.map((c) => `${c.summary}${c.primary ? ' (primary)' : ''}`).join(', ')}
        </div>
      )}
      {status?.errors && status.errors.length > 0 && (
        <div style={{ marginTop: 6, color: '#a00' }}>
          Errors: {status.errors.map((e) => `${e.step}: ${e.message}`).join(' | ')}
        </div>
      )}

    </div>
  )
}
