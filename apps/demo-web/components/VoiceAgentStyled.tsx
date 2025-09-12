'use client'

import { useEffect, useRef, useState } from 'react'
import { OpenAIRealtimeAgent } from '../lib/agent/openai-realtime'
import Link from 'next/link'

// Import UI components from local
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Separator } from './ui/separator'
import { ChevronDown, Mic, MicOff, Phone, PhoneOff, Eye, EyeOff, Clock, Bug, TestTube2, Settings } from 'lucide-react'
import { cn } from '../lib/utils'

type GCalendar = {
  id: string
  summary: string
  primary?: boolean
  selected?: boolean
  timeZone?: string
}

export function VoiceAgentStyled({
  systemPrompt = '',
  greeting = 'Hi, how can I help?',
  language = 'en',
  agentName = 'Voice Scheduling Assistant',
  organizationName,
  isDemo = false,
  agentDescription
}: {
  systemPrompt?: string
  greeting?: string
  language?: string
  agentName?: string
  organizationName?: string
  isDemo?: boolean
  agentDescription?: string
}) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<string[]>([])
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null)
  const [calendars, setCalendars] = useState<GCalendar[]>([])
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([])
  const [calendarId, setCalendarId] = useState<string>('primary')
  const [calendarTz, setCalendarTz] = useState<string | null>(null)
  const [useUnion, setUseUnion] = useState(false)
  const agentRef = useRef<OpenAIRealtimeAgent | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [toolEvents, setToolEvents] = useState<Array<{ t: number; data: any }>>([])
  const [testResult, setTestResult] = useState<any>(null)
  const [agentSays, setAgentSays] = useState<string[]>([])
  const [actualAgentTranscript, setActualAgentTranscript] = useState<string[]>([])
  const [availableSlots, setAvailableSlots] = useState<Array<{ start: string; end: string }>>([])
  const [slotsTz, setSlotsTz] = useState<string | null>(null)
  const [showUserTranscript, setShowUserTranscript] = useState<boolean>(false)
  const [showAgentTranscript, setShowAgentTranscript] = useState<boolean>(true)

  useEffect(() => {
    agentRef.current = new OpenAIRealtimeAgent({
      onTranscript: (text) => setTranscript((prev) => [...prev, text]),
      onAgentTranscript: (text, final) => {
        if (final) {
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

    // Load persisted preferences
    try {
      const savedUnion = localStorage.getItem('cal_union')
      if (savedUnion === '1') setUseUnion(true)
      const savedSel = localStorage.getItem('cal_selected')
      if (savedSel) setSelectedCalIds(JSON.parse(savedSel))
      const savedBook = localStorage.getItem('cal_book')
      if (savedBook) setCalendarId(savedBook)
    } catch {}

    // Fetch initial data
    fetch('/api/org/default')
      .then((r) => r.json())
      .then((j) => j.organization && setOrg(j.organization))
      .catch(() => {})
    
    fetch('/api/calendar/status')
      .then((r) => r.json())
      .then((j) => setCalendarTz(j.accountTimeZone || j.primaryTimeZone || null))
      .catch(() => {})
    
    fetch('/api/calendar/list')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.calendars) return
        setCalendars(j.calendars)
        const defaults = j.calendars.filter((c: any) => c.selected || c.primary).map((c: any) => c.id)
        const sel = defaults.length ? defaults : j.calendars.map((c: any) => c.id)
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
      agentRef.current?.setCalendarIds(useUnion ? selectedCalIds : [calendarId])
      await agentRef.current!.connect(systemPrompt, {
        organizationId: org?.id,
        calendarId,
        greeting,
        language,
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

  const fmtDateLocal = (iso: string, tz?: string) => {
    try {
      const d = new Date(iso)
      const fmt = new Intl.DateTimeFormat('en-US', { 
        timeZone: tz, 
        dateStyle: 'short'
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

  return (
    <div className="space-y-4">
      {/* Header Card */}
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
            {/* Timezone Badge aligned with title */}
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

            {/* Transcript button hidden
            <Button
              variant="outline"
              onClick={() => setShowUserTranscript(!showUserTranscript)}
              className="flex items-center gap-2"
            >
              {showUserTranscript ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showUserTranscript ? 'Hide' : 'Show'} Transcript
            </Button>
            */}

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

            {/* Test Availability button hidden
            <Button
              variant="outline"
              onClick={async () => {
                if (!org) return
                const now = new Date()
                const startDate = new Date(now)
                startDate.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
                const endDate = new Date(startDate)
                endDate.setHours(endDate.getHours() + 1)
                const startIso = startDate.toISOString()
                const endIso = endDate.toISOString()
                const res = await fetch('/api/calendar/check-availability', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ organizationId: org.id, start: startIso, end: endIso, calendarId })
                }).then((r) => r.json())
                setTestResult(res)
              }}
              className="flex items-center gap-2"
            >
              <TestTube2 className="h-4 w-4" />
              Test Availability
            </Button>
            */}
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

      {/* User Transcript */}
      {showUserTranscript && transcript.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {transcript.map((t, i) => (
                <li key={i} className="text-sm">{t}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Agent Transcript */}
      {showAgentTranscript && (actualAgentTranscript.length > 0 || agentSays.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent Transcript</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actualAgentTranscript.length > 0 && (
              <ul className="space-y-1">
                {actualAgentTranscript.map((t, i) => (
                  <li key={i} className="text-sm">{t}</li>
                ))}
              </ul>
            )}
            
            {agentSays.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                  Intended responses ({agentSays.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ul className="space-y-1 opacity-60">
                    {agentSays.map((t, i) => (
                      <li key={i} className="text-sm">{t}</li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available Slots */}
      {availableSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Available Slots - {fmtDateLocal(availableSlots[0].start, slotsTz || calendarTz || undefined)}
            </CardTitle>
            <CardDescription>
              {slotsTz || calendarTz || 'local'} timezone
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableSlots.map((s, i) => (
                <Badge key={i} variant="secondary" className="justify-center py-1.5">
                  {fmtTimeLocal(s.start, slotsTz || calendarTz || undefined)} – {fmtTimeLocal(s.end, slotsTz || calendarTz || undefined)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Panel */}
      {debugOpen && (
        <Card className="bg-black text-green-400 font-mono">
          <CardHeader>
            <CardTitle className="text-base text-green-400">
              Tool Debug (last {toolEvents.length} events)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(toolEvents, null, 2)}
            </pre>
            
            {testResult && (
              <>
                <Separator className="bg-green-800" />
                <div>
                  <h4 className="font-bold mb-2 text-green-400">Test Availability Result</h4>
                  <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                  {Array.isArray(testResult?.usedGoogleCalendars) && (
                    <div className="mt-2 text-xs">
                      <strong>Calendars considered:</strong> {testResult.usedGoogleCalendars.join(', ')}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Helper component for organization bar
function OrgBar({
  org,
  setOrg,
  calendarId
}: {
  org: { id: string; name: string } | null
  setOrg: (org: { id: string; name: string } | null) => void
  calendarId: string
}) {
  return null // This functionality is integrated into the main component
}