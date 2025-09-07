'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, Button } from '@kit/ui'

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
    <Card>
      <CardHeader>
        <div className="mk-row">
          <div style={{ width: 10, height: 10, borderRadius: 6, background: color }} />
          <div>
            <strong>Google Calendar:</strong>{' '}
            {status ? (connected ? 'Connected' : status.hasToken ? 'Token present, but connection failed' : 'Token missing') : 'Checking…'}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button onClick={() => (window.location.href = '/api/google/oauth/start')}>Connect Google</Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {status?.scopes && (
          <div className="mk-label">Scopes: <code>{status.scopes.join(' ')}</code></div>
        )}
        {status?.calendars && (
          <div className="mk-label">Calendars: {status.calendars.map((c) => `${c.summary}${c.primary ? ' (primary)' : ''}`).join(', ')}
          </div>
        )}
        {status?.errors && status.errors.length > 0 && (
          <div style={{ color: '#a00' }}>Errors: {status.errors.map((e) => `${e.step}: ${e.message}`).join(' | ')}</div>
        )}
      </CardBody>
    </Card>
  )
}
