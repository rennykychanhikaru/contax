'use client'

import { useEffect, useRef, useState } from 'react'
import { OpenAIRealtimeAgent } from '../lib/agent/openai-realtime'
import { CalendarStatus } from './CalendarStatus'

type GCalStatus = {
  connected: boolean
  hasToken: boolean
  scopes?: string[]
  calendars?: { id: string; summary: string; primary?: boolean }[]
  primaryReachable?: boolean
  errors?: { step: string; message: string }[]
}

type Props = { systemPrompt: string; greeting?: string; language?: string }

export function VoiceAgent({ systemPrompt, greeting, language = 'en-US' }: Props) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [calendarId, setCalendarId] = useState<string>('primary')
  const agentRef = useRef<OpenAIRealtimeAgent | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [toolEvents, setToolEvents] = useState<Array<{ t: number; data: any }>>([])
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    agentRef.current = new OpenAIRealtimeAgent({
      onTranscript: (text) => setTranscript((prev) => [...prev, text]),
      onToolEvent: (e) => setToolEvents((prev) => [...prev.slice(-19), { t: Date.now(), data: e }])
    })
    // Fetch default org
    fetch('/api/org/default')
      .then((r) => r.json())
      .then((j) => j.organization && setOrg(j.organization))
      .catch(() => {})
    return () => {
      agentRef.current?.disconnect().catch(() => {})
      agentRef.current = null
    }
  }, [])

  async function start() {
    try {
      await agentRef.current!.connect(systemPrompt, {
        organizationId: org?.id,
        calendarId,
        greeting,
        language
      })
    } catch (e) {
      alert((e as Error).message)
      return
    }
    setConnected(true)
  }

  async function stop() {
    setConnected(false)
    await agentRef.current?.disconnect()
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <OrgBar org={org} setOrg={setOrg} calendarId={calendarId} />
      <CalendarStatus />
      <div style={{ display: 'flex', gap: 8 }}>
        {!connected ? (
          <button onClick={start}>Start Voice Session</button>
        ) : (
          <button onClick={stop}>Hang Up</button>
        )}
        <button onClick={() => setDebugOpen((v) => !v)}>{debugOpen ? 'Hide Debug' : 'Show Debug'}</button>
        <button
          onClick={async () => {
            if (!org) return alert('No organization loaded')
            const now = new Date()
            const startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0)
              .toISOString()
            const endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 2, 0, 0)
              .toISOString()
            const res = await fetch('/api/calendar/check-availability', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ organizationId: org.id, start: startIso, end: endIso, calendarId })
            }).then((r) => r.json())
            setTestResult(res)
          }}
        >
          Test Availability (next hour)
        </button>
      </div>
      <div style={{ marginTop: 12, color: '#333' }}>
        <strong>Status:</strong> {connected ? 'Connected' : 'Idle'}
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Transcript (captured events):</strong>
        <ul>
          {transcript.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      {debugOpen && (
        <div style={{ marginTop: 12, background: '#111', color: '#0f0', padding: 10, borderRadius: 6 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Tool Debug</strong> (last {toolEvents.length} events)
          </div>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(toolEvents, null, 2)}</pre>
          {testResult && (
            <div style={{ marginTop: 8 }}>
              <strong>Test Availability Result</strong>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(testResult, null, 2)}</pre>
          {Array.isArray(testResult?.usedGoogleCalendars) && (
            <div style={{ marginTop: 6 }}>
              <strong>Calendars considered:</strong> {testResult.usedGoogleCalendars.join(', ')}
            </div>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  )
}

function OrgBar({
  org,
  setOrg,
  calendarId
}: {
  org: { id: string; name: string } | null
  setOrg: (o: { id: string; name: string } | null) => void
  calendarId: string
}) {
  const [manualId, setManualId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (org) setError(null)
  }, [org])

  return (
    <div style={{ marginBottom: 8, color: '#333' }}>
      <div>
        <strong>Organization:</strong>{' '}
        {org ? (
          `${org.name} (${org.id})`
        ) : (
          <span>
            Loading…{' '}
            <span style={{ color: '#999' }}>(if this persists, paste an Organization ID)</span>
          </span>
        )}
      </div>
      <div>
        <strong>Calendar:</strong> <code>{calendarId}</code>
      </div>
      {!org && (
        <div style={{ marginTop: 8 }}>
          <input
            placeholder="Paste Organization ID"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            style={{ width: 360, marginRight: 8 }}
          />
          <button
            onClick={() => {
              if (manualId.trim()) setOrg({ id: manualId.trim(), name: 'Manual' })
              else setError('Organization ID is required')
            }}
          >
            Use This Org ID
          </button>
          {error && (
            <div style={{ color: 'crimson', marginTop: 4 }}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}

// CalendarStatus moved to separate component file
