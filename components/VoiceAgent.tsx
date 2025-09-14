

'use client'

import { useEffect, useRef, useState } from 'react'
import { OpenAIRealtimeAgent } from '../lib/agent/openai-realtime'
import { CalendarStatus } from './CalendarStatus'

// Import UI components
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'

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
  const [toolEvents, setToolEvents] = useState<Array<{ t: number; data: unknown }>>([])
  const [testResult, setTestResult] = useState<unknown>(null)
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
    } catch {
    // Error handled
  }

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
        const defaults = j.calendars.filter((c: unknown) => c.selected || c.primary).map((c: unknown) => c.id)
        const sel = defaults.length ? defaults : j.calendars.map((c: unknown) => c.id)
        // If we have a persisted selection, prefer it; else default
        const nextSel = selectedCalIds.length ? selectedCalIds : sel
        setSelectedCalIds(nextSel)
        agentRef.current?.setCalendarIds(useUnion ? nextSel : [calendarId])
        const primary = j.calendars.find((c: unknown) => c.primary) || j.calendars[0]
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
    try { localStorage.setItem('cal_union', useUnion ? '1' : '0') } catch {
    // Error handled
  }
    // update agent calendarIds when toggle changes
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [useUnion])

  useEffect(() => {
    try { localStorage.setItem('cal_selected', JSON.stringify(selectedCalIds)) } catch {
    // Error handled
  }
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [selectedCalIds])

  useEffect(() => {
    try { localStorage.setItem('cal_book', calendarId) } catch {
    // Error handled
  }
    agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
  }, [calendarId])

  return (
    <div className="space-y-6">
      <OrgBar org={org} setOrg={setOrg} calendarId={calendarId} />
      {calendarTz && (
        <div className="text-sm text-muted-foreground">
          <strong>Active Timezone:</strong> {calendarTz}
        </div>
      )}
      <CalendarStatus />
      {calendars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Calendar Configuration</CardTitle>
            <CardDescription>Select calendars and settings for the voice agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Calendars to consider (availability):</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {calendars.map((c) => (
                  <div key={c.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`calendar-${c.id}`}
                      checked={selectedCalIds.includes(c.id)}
                      onCheckedChange={(checked) => {
                        setSelectedCalIds((prev) => {
                          const next = checked ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id)
                          agentRef.current?.setCalendarIds(next)
                          return next
                        })
                      }}
                    />
                    <Label htmlFor={`calendar-${c.id}`} className="text-sm">
                      {c.summary} {c.primary ? <Badge variant="secondary" className="ml-1 text-xs">primary</Badge> : ''}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="use-union"
                checked={useUnion}
                onCheckedChange={(checked) => setUseUnion(!!checked)}
              />
              <Label htmlFor="use-union" className="text-sm">Use selected calendars for availability</Label>
            </div>
            <div>
              <Label className="text-sm font-medium">Book appointments on:</Label>
              <Select
                value={calendarId}
                onValueChange={(value) => {
                  setCalendarId(value)
                  const found = calendars.find((c) => c.id === value)
                  if (found?.timeZone) setCalendarTz(found.timeZone)
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.summary}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Voice Agent Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <Button onClick={start} className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Start Voice Session
              </Button>
            ) : (
              <Button variant="destructive" onClick={stop} className="flex items-center gap-2">
                <PhoneOff className="h-4 w-4" />
                Hang Up
              </Button>
            )}
            <Button variant="outline" onClick={() => setDebugOpen((v) => !v)}>
              {debugOpen ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {debugOpen ? 'Hide Debug' : 'Show Debug'}
            </Button>
            <Button variant="outline" onClick={() => setShowUserTranscript((v) => !v)}>
              {showUserTranscript ? 'Hide Transcript' : 'Show Transcript'}
            </Button>
            <Button variant="outline" onClick={() => setShowAgentTranscript((v) => !v)}>
              {showAgentTranscript ? 'Hide Agent Transcript' : 'Show Agent Transcript'}
            </Button>
            <Button
              variant="outline"
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
              className="flex items-center gap-2"
            >
              <TestTube className="h-4 w-4" />
              Test Availability (next hour)
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-muted-foreground">
              <strong>Status:</strong> {connected ? 'Connected' : 'Idle'}
            </span>
          </div>
        </CardContent>
      </Card>
      {showUserTranscript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User Transcript</CardTitle>
            <CardDescription>Your speech recognized by the system</CardDescription>
          </CardHeader>
          <CardContent>
            {transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">No speech detected yet.</p>
            ) : (
              <ul className="space-y-2">
                {transcript.map((t, i) => (
                  <li key={i} className="text-sm bg-muted p-2 rounded">{t}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {availableSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Available Slots
            </CardTitle>
            <CardDescription>
              Availability on {fmtDateLocal(availableSlots[0].start, slotsTz || calendarTz || undefined)} ({slotsTz || calendarTz || 'local'})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {availableSlots.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {fmtRangeLocal(s.start, s.end, slotsTz || calendarTz || undefined)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {showAgentTranscript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Transcript</CardTitle>
            <CardDescription>What the AI agent is saying</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actualAgentTranscript.length === 0 && agentSays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent speech yet.</p>
            ) : (
              <>
                {actualAgentTranscript.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Actual Speech</h4>
                    <ul className="space-y-2">
                      {actualAgentTranscript.map((t, i) => (
                        <li key={i} className="text-sm bg-blue-50 p-2 rounded dark:bg-blue-900/20">{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {agentSays.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                      <ChevronDown className="h-4 w-4" />
                      Intended responses ({agentSays.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <ul className="space-y-2 opacity-70">
                        {agentSays.map((t, i) => (
                          <li key={i} className="text-sm bg-muted p-2 rounded">{t}</li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      {debugOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <TestTube className="h-5 w-5" />
              Debug Console
            </CardTitle>
            <CardDescription>
              Last {toolEvents.length} tool events and system information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-4 rounded font-mono text-xs overflow-x-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(toolEvents, null, 2)}</pre>
            </div>
            {testResult && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Test Availability Result</h4>
                <div className="bg-muted p-3 rounded">
                  <pre className="text-xs whitespace-pre-wrap overflow-x-auto">{JSON.stringify(testResult, null, 2)}</pre>
                  {Array.isArray(testResult?.usedGoogleCalendars) && (
                    <div className="mt-2 pt-2 border-t">
                      <strong className="text-sm">Calendars considered:</strong>{' '}
                      <span className="text-sm text-muted-foreground">
                        {testResult.usedGoogleCalendars.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">System Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="font-medium">Calendar:</Label>
            <div className="mt-1">
              <code className="text-sm bg-muted px-2 py-1 rounded">{calendarId}</code>
            </div>
          </div>
        </div>
        {!org && (
          <div className="space-y-2">
            <Label htmlFor="org-id">Manual Organization ID</Label>
            <div className="flex gap-2">
              <input
                id="org-id"
                className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
                placeholder="Paste Organization ID"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (manualId.trim()) setOrg({ id: manualId.trim(), name: 'Manual' })
                  else setError('Organization ID is required')
                }}
                size="sm"
              >
                Use This Org ID
              </Button>
            </div>
            {error && (
              <Alert>
                <AlertDescription className="text-destructive">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
