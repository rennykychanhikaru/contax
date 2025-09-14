'use client'

import { useEffect, useRef, useState } from 'react'
import { OpenAIRealtimeAgent } from '@/lib/agent/openai-realtime'
import { CalendarStatus } from '../CalendarStatus'
import Link from 'next/link'
import type { ToolEvent } from '@/types/agent'
import type { GoogleCalendar, TimeSlot } from '@/types/google'

// Import UI components
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Separator } from '../ui/separator'
import { cn } from '@/lib/utils/utils'

// Use the proper GoogleCalendar type from types/google.ts

interface VoiceAgentProps {
  agentId?: string
  systemPrompt?: string
  greeting?: string
  language?: string
  agentName?: string
  organizationName?: string
  isDemo?: boolean
  agentDescription?: string
  variant?: 'default' | 'styled'
  showCalendarConfig?: boolean
  showDebugByDefault?: boolean
}

export function VoiceAgent({
  agentId,
  systemPrompt = '',
  greeting = 'Hi, how can I help?',
  language = 'en-US',
  agentName = 'Voice Scheduling Assistant',
  organizationName,
  isDemo = false,
  agentDescription,
  variant = 'default',
  showCalendarConfig = true,
  showDebugByDefault = false
}: VoiceAgentProps) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [calendarId, setCalendarId] = useState<string>('primary')
  const [calendarTz, setCalendarTz] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([])
  const [useUnion, setUseUnion] = useState<boolean>(variant === 'default')
  const agentRef = useRef<OpenAIRealtimeAgent | null>(null)
  const [debugOpen, setDebugOpen] = useState(showDebugByDefault)
  const [toolEvents, setToolEvents] = useState<Array<{ t: number; data: ToolEvent }>>([])
  const [testResult, setTestResult] = useState<CheckAvailabilityResponse | null>(null)
  const [agentSays, setAgentSays] = useState<string[]>([])
  const [actualAgentTranscript, setActualAgentTranscript] = useState<string[]>([])
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])
  const [slotsTz, setSlotsTz] = useState<string | null>(null)
  const [showUserTranscript, setShowUserTranscript] = useState<boolean>(false)
  const [showAgentTranscript, setShowAgentTranscript] = useState<boolean>(variant === 'styled')

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
        if (e.kind === 'event' && e.type === 'spoken' && 'text' in e && e.text) {
          setAgentSays((prev) => [...prev, String(e.text)])
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
    const statusUrl = agentId ? `/api/agents/${agentId}/calendar/status` : '/api/calendar/status'
    fetch(statusUrl)
      .then((r) => r.json())
      .then((j) => setCalendarTz(j.accountTimeZone || j.primaryTimeZone || null))
      .catch(() => {})

    // Fetch calendars list
    const listUrl = agentId ? `/api/agents/${agentId}/calendar/list` : '/api/calendar/list'
    fetch(listUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CalendarListResponse) => {
        if (!j?.calendars) return
        setCalendars(j.calendars)
        // Default to all calendars the user has selected in Google, plus primary
        const defaults = j.calendars.filter((c) => c.selected || c.primary).map((c) => c.id)
        const sel = defaults.length ? defaults : j.calendars.map((c) => c.id)
        // If we have a persisted selection, prefer it; else default
        const nextSel = selectedCalIds.length ? selectedCalIds : sel
        setSelectedCalIds(nextSel)
        agentRef.current?.setCalendarIds(useUnion ? nextSel : [calendarId])
        const primary = j.calendars.find((c) => c.primary) || j.calendars[0]
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
  }, [agentId])

  async function start() {
    try {
      // Ensure agent uses the latest calendar selection before connecting
      agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
      await agentRef.current!.connect(systemPrompt, {
        organizationId: org?.id,
        agentId,
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

  // Helper functions for date/time formatting
  const fmtDateLocal = (iso: string, tz?: string) => {
    try {
      const d = new Date(iso)
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      })
      return fmt.format(d)
    } catch {
      return iso.slice(0, 10)
    }
  }

  const fmtTimeLocal = (iso: string, tz?: string) => {
    try {
      const d = new Date(iso)
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit'
      })
      return fmt.format(d)
    } catch {
      return iso
    }
  }

  const fmtRangeLocal = (startIso: string, endIso: string, tz?: string) => {
    try {
      return `${fmtTimeLocal(startIso, tz)} – ${fmtTimeLocal(endIso, tz)}`
    } catch {
      return `${startIso} – ${endIso}`
    }
  }

  if (variant === 'styled') {
    return (
      <div className="space-y-4">
        {/* Header Card - Styled Version */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                {agentName}
                {isDemo && (
                  <Badge variant="outline" className="text-xs ml-2">
                    DEMO
                  </Badge>
                )}
              </CardTitle>
              {calendarTz && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {calendarTz}
                </Badge>
              )}
            </div>
            <CardDescription>
              {isDemo && agentDescription ? agentDescription : 'AI-powered voice agent for calendar management'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              {!connected ? (
                <Button onClick={start} className="flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Call {organizationName ? `${organizationName}'s` : "the"} Office
                </Button>
              ) : (
                <Button onClick={stop} variant="destructive" className="flex items-center gap-2">
                  <PhoneOff className="h-4 w-4" />
                  Hang Up
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setShowAgentTranscript(!showAgentTranscript)}
                className="flex items-center gap-2"
              >
                {showAgentTranscript ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAgentTranscript ? 'Hide' : 'Show'} Agent Transcript
              </Button>

              <Button
                variant="outline"
                onClick={() => setDebugOpen(!debugOpen)}
                className="flex items-center gap-2"
              >
                <Bug className="h-4 w-4" />
                {debugOpen ? 'Hide' : 'Show'} Debug
              </Button>

              <Link href="/agent-settings">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Agent Settings
                </Button>
              </Link>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={connected ? "default" : "secondary"}>
                {connected ? 'Connected' : 'Idle'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Rest of styled components */}
        {renderTranscripts()}
        {renderAvailableSlots()}
        {renderDebugPanel()}
      </div>
    )
  }

  // Default variant
  return (
    <div className="space-y-6">
      <OrgBar org={org} setOrg={setOrg} calendarId={calendarId} />
      {calendarTz && (
        <div className="text-sm text-muted-foreground">
          <strong>Active Timezone:</strong> {calendarTz}
        </div>
      )}
      <CalendarStatus />

      {showCalendarConfig && calendars.length > 0 && renderCalendarConfig()}

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
                const availabilityUrl = agentId
                  ? `/api/agents/${agentId}/calendar/check-availability`
                  : '/api/calendar/check-availability'
                const res = await fetch(availabilityUrl, {
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

      {renderTranscripts()}
      {renderAvailableSlots()}
      {renderDebugPanel()}
    </div>
  )

  function renderCalendarConfig() {
    return (
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
    )
  }

  function renderTranscripts() {
    return (
      <>
        {/* User Transcript */}
        {showUserTranscript && (
          <Card>
            <CardHeader>
              <CardTitle className={variant === 'styled' ? 'text-base' : 'text-lg'}>User Transcript</CardTitle>
              {variant === 'default' && <CardDescription>Your speech recognized by the system</CardDescription>}
            </CardHeader>
            <CardContent>
              {transcript.length === 0 ? (
                <p className="text-sm text-muted-foreground">No speech detected yet.</p>
              ) : (
                <ul className={variant === 'styled' ? 'space-y-1' : 'space-y-2'}>
                  {transcript.map((t, i) => (
                    <li key={i} className={variant === 'styled' ? 'text-sm' : 'text-sm bg-muted p-2 rounded'}>{t}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Agent Transcript */}
        {showAgentTranscript && (actualAgentTranscript.length > 0 || agentSays.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className={variant === 'styled' ? 'text-base' : 'text-lg'}>Agent Transcript</CardTitle>
              {variant === 'default' && <CardDescription>What the AI agent is saying</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              {actualAgentTranscript.length === 0 && agentSays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agent speech yet.</p>
              ) : (
                <>
                  {actualAgentTranscript.length > 0 && (
                    <div>
                      {variant === 'default' && <h4 className="font-medium text-sm mb-2">Actual Speech</h4>}
                      <ul className={variant === 'styled' ? 'space-y-1' : 'space-y-2'}>
                        {actualAgentTranscript.map((t, i) => (
                          <li key={i} className={variant === 'styled'
                            ? 'text-sm'
                            : 'text-sm bg-blue-50 p-2 rounded dark:bg-blue-900/20'
                          }>{t}</li>
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
                        <ul className={variant === 'styled' ? 'space-y-1 opacity-60' : 'space-y-2 opacity-70'}>
                          {agentSays.map((t, i) => (
                            <li key={i} className={variant === 'styled' ? 'text-sm' : 'text-sm bg-muted p-2 rounded'}>{t}</li>
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
      </>
    )
  }

  function renderAvailableSlots() {
    if (availableSlots.length === 0) return null

    return (
      <Card>
        <CardHeader>
          <CardTitle className={cn(
            "flex items-center gap-2",
            variant === 'styled' ? 'text-base' : 'text-lg'
          )}>
            {variant === 'default' && <Calendar className="h-5 w-5" />}
            {variant === 'styled'
              ? `Available Slots - ${fmtDateLocal(availableSlots[0].start, slotsTz || calendarTz || undefined)}`
              : 'Available Slots'
            }
          </CardTitle>
          <CardDescription>
            {variant === 'styled'
              ? `${slotsTz || calendarTz || 'local'} timezone`
              : `Availability on ${fmtDateLocal(availableSlots[0].start, slotsTz || calendarTz || undefined)} (${slotsTz || calendarTz || 'local'})`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {variant === 'styled' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableSlots.map((s, i) => (
                <Badge key={i} variant="secondary" className="justify-center py-1.5">
                  {fmtRangeLocal(s.start, s.end, slotsTz || calendarTz || undefined)}
                </Badge>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {availableSlots.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {fmtRangeLocal(s.start, s.end, slotsTz || calendarTz || undefined)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  function renderDebugPanel() {
    if (!debugOpen) return null

    return (
      <Card className={variant === 'styled' ? 'bg-black text-green-400 font-mono' : ''}>
        <CardHeader>
          <CardTitle className={cn(
            "flex items-center gap-2",
            variant === 'styled'
              ? 'text-base text-green-400'
              : 'text-lg text-green-600 dark:text-green-400'
          )}>
            {variant === 'default' && <TestTube className="h-5 w-5" />}
            {variant === 'styled'
              ? `Tool Debug (last ${toolEvents.length} events)`
              : 'Debug Console'
            }
          </CardTitle>
          {variant === 'default' && (
            <CardDescription>
              Last {toolEvents.length} tool events and system information
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className={cn(
            "text-xs whitespace-pre-wrap overflow-x-auto",
            variant === 'styled' ? '' : 'bg-black text-green-400 p-4 rounded font-mono'
          )}>
            {JSON.stringify(toolEvents, null, 2)}
          </pre>

          {testResult && (
            <>
              {variant === 'styled' && <Separator className="bg-green-800" />}
              <div className={variant === 'default' ? 'mt-4' : ''}>
                <h4 className={cn(
                  "font-medium mb-2",
                  variant === 'styled' ? 'font-bold text-green-400' : 'text-sm'
                )}>
                  Test Availability Result
                </h4>
                <div className={variant === 'styled' ? '' : 'bg-muted p-3 rounded'}>
                  <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                  {Array.isArray(testResult?.usedGoogleCalendars) && (
                    <div className={cn(
                      "mt-2",
                      variant === 'styled' ? 'text-xs' : 'pt-2 border-t'
                    )}>
                      <strong className={variant === 'styled' ? '' : 'text-sm'}>
                        Calendars considered:
                      </strong>{' '}
                      <span className={variant === 'styled' ? '' : 'text-sm text-muted-foreground'}>
                        {testResult.usedGoogleCalendars.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    )
  }
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

// Export the unified VoiceAgent as VoiceAgentStyled for backward compatibility
export const VoiceAgentStyled = VoiceAgent

// CalendarStatus moved to separate component file
