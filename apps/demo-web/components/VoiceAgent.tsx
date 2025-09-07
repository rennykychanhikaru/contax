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
  const [calendarTz, setCalendarTz] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary?: boolean; accessRole?: string; timeZone?: string }>>([])
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([])
  const [useUnion, setUseUnion] = useState<boolean>(true)
  const agentRef = useRef<OpenAIRealtimeAgent | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [toolEvents, setToolEvents] = useState<Array<{ t: number; data: any }>>([])
  const [testResult, setTestResult] = useState<any>(null)
  const [agentSays, setAgentSays] = useState<string[]>([])
  const [actualAgentTranscript, setActualAgentTranscript] = useState<string[]>([])
  const [availableSlots, setAvailableSlots] = useState<Array<{ start: string; end: string }>>([])
  const [slotsTz, setSlotsTz] = useState<string | null>(null)
  const [showUserTranscript, setShowUserTranscript] = useState<boolean>(false)
  const [showAgentTranscript, setShowAgentTranscript] = useState<boolean>(false)

  useEffect(() => {
    agentRef.current = new OpenAIRealtimeAgent({
      onTranscript: (text) => setTranscript((prev) => [...prev, text]),
      onAgentTranscript: (text, final) => {
        if (final) {
          // When we get a final transcript, add it to the list
          setActualAgentTranscript((prev) => [...prev, text])
        }
      },
      onToolEvent: (e) => {
        setToolEvents((prev) => [...prev.slice(-19), { t: Date.now(), data: e }])
        if (e.kind === 'event' && e.type === 'spoken' && (e as any).text) {
          setAgentSays((prev) => [...prev, String((e as any).text)])
        }
      },
      onSlots: (slots, tz) => {
        setAvailableSlots(slots)
        setSlotsTz(tz || null)
      }
    })
    // Restore persisted selections
    try {
      const savedUnion = localStorage.getItem('cal_union')
      if (savedUnion != null) setUseUnion(savedUnion === '1')
      const savedSel = localStorage.getItem('cal_selected')
      if (savedSel) setSelectedCalIds(JSON.parse(savedSel))
      const savedBook = localStorage.getItem('cal_book')
      if (savedBook) setCalendarId(savedBook)
    } catch {}

    // Fetch default org
    fetch('/api/org/default')
      .then((r) => r.json())
      .then((j) => j.organization && setOrg(j.organization))
      .catch(() => {})
    // Fetch calendar status for timezone
    fetch('/api/calendar/status')
      .then((r) => r.json())
      .then((j) => setCalendarTz(j.accountTimeZone || j.primaryTimeZone || null))
      .catch(() => {})
    // Fetch calendars list
    fetch('/api/calendar/list')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.calendars) return
        setCalendars(j.calendars)
        // Default to all calendars the user has selected in Google, plus primary
        const defaults = j.calendars.filter((c: any) => c.selected || c.primary).map((c: any) => c.id)
        const sel = defaults.length ? defaults : j.calendars.map((c: any) => c.id)
        // If we have a persisted selection, prefer it; else default
        const nextSel = selectedCalIds.length ? selectedCalIds : sel
        setSelectedCalIds(nextSel)
        agentRef.current?.setCalendarIds(useUnion ? nextSel : [calendarId])
        const primary = j.calendars.find((c: any) => c.primary) || j.calendars[0]
        if (primary) {
          setCalendarId(primary.id)
          if (primary.timeZone) setCalendarTz(primary.timeZone)
        }
      })
      .catch(() => {})
    return () => {
      agentRef.current?.disconnect().catch(() => {})
      agentRef.current = null
    }
  }, [])

  async function start() {
    try {
      // Ensure agent uses the latest calendar selection before connecting
      agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
      await agentRef.current!.connect(systemPrompt, {
        organizationId: org?.id,
        calendarId,
        greeting,
        language,
        // Pass the active calendar timezone so the agent speaks and reasons in local time
        timeZone: calendarTz || undefined
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

  // Persist selections
  useEffect(() => {
    try { localStorage.setItem('cal_union', useUnion ? '1' : '0') } catch {}
    // update agent calendarIds when toggle changes
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [useUnion])

  useEffect(() => {
    try { localStorage.setItem('cal_selected', JSON.stringify(selectedCalIds)) } catch {}
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [selectedCalIds])

  useEffect(() => {
    try { localStorage.setItem('cal_book', calendarId) } catch {}
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [calendarId])

  return (
    <div className="mk-card">
      <OrgBar org={org} setOrg={setOrg} calendarId={calendarId} />
      {calendarTz && (
        <div style={{ marginBottom: 8, color: '#555' }}>
          <strong>Active Timezone:</strong> {calendarTz}
        </div>
      )}
      <CalendarStatus />
      {calendars.length > 0 && (
        <div className="mk-card" style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 6 }}><strong>Calendars to consider (availability):</strong></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {calendars.map((c) => (
              <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedCalIds.includes(c.id)}
                  onChange={(e) => {
                    setSelectedCalIds((prev) => {
                      const next = e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id)
                      agentRef.current?.setCalendarIds(next)
                      return next
                    })
                  }}
                />
                {c.summary} {c.primary ? '(primary)' : ''}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={useUnion} onChange={(e) => setUseUnion(e.target.checked)} />
              Use selected calendars for availability
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Book on:</strong>{' '}
            <select
              value={calendarId}
              onChange={(e) => {
                const id = e.target.value
                setCalendarId(id)
                const found = calendars.find((c) => c.id === id)
                if (found?.timeZone) setCalendarTz(found.timeZone)
              }}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="mk-row" style={{ marginTop: 8 }}>
        {!connected ? (
          <button className="mk-btn primary" onClick={start}>Start Voice Session</button>
        ) : (
          <button className="mk-btn" onClick={stop}>Hang Up</button>
        )}
        <button className="mk-btn" onClick={() => setDebugOpen((v) => !v)}>{debugOpen ? 'Hide Debug' : 'Show Debug'}</button>
        <button className="mk-btn" onClick={() => setShowUserTranscript((v) => !v)}>{showUserTranscript ? 'Hide Transcript' : 'Show Transcript'}</button>
        <button className="mk-btn" onClick={() => setShowAgentTranscript((v) => !v)}>{showAgentTranscript ? 'Hide Agent Transcript' : 'Show Agent Transcript'}</button>
        <button className="mk-btn"
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
      {showUserTranscript && (
        <div className="mk-card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Transcript (user speech)</div>
          <ul>
            {transcript.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {availableSlots.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong>Availability on {fmtDateLocal(availableSlots[0].start, slotsTz || calendarTz || undefined)} ({slotsTz || calendarTz || 'local'}):</strong>
          <ul>
            {availableSlots.map((s, i) => (
              <li key={i}>{fmtRangeLocal(s.start, s.end, slotsTz || calendarTz || undefined)}</li>
            ))}
          </ul>
        </div>
      )}
      {showAgentTranscript && (
        <div className="mk-card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Agent Transcript</div>
          {actualAgentTranscript.length === 0 && agentSays.length === 0 ? (
            <div className="mk-label">No agent speech yet.</div>
          ) : (
            <>
              {actualAgentTranscript.length > 0 && (
                <ul>
                  {actualAgentTranscript.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
              {agentSays.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#666' }}>
                    Intended responses ({agentSays.length})
                  </summary>
                  <ul style={{ marginTop: 4, opacity: 0.7 }}>
                    {agentSays.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
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

function fmtRangeLocal(startIso: string, endIso: string, tz?: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  try {
    return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`
  } catch {
    return `${startIso} – ${endIso}`
  }
}

function fmtDateLocal(startIso: string, tz?: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
  try {
    return fmt.format(new Date(startIso))
  } catch {
    return startIso.slice(0, 10)
  }
}

// CalendarStatus moved to separate component file
