import type { AgentAdapter } from '../adapters/types'

type ToolEvent =
  | { kind: 'event'; type: string; text?: string }
  | { kind: 'call'; name: string; args: string }
  | { kind: 'result'; name: string; result: unknown }

type AvailabilityResult = {
  error?: string
  available?: boolean
  timeZone?: string
  start?: string
  end?: string
  suggestions?: unknown[]
}

export class OpenAIRealtimeAgent implements AgentAdapter {
  private pc: RTCPeerConnection | null = null
  private mic: MediaStream | null = null
  private audioEl: HTMLAudioElement
  private onTranscript?: (text: string) => void
  private onAgentTranscript?: (text: string, final: boolean) => void
  private currentAgentTranscript: string = ''
  private toolArgsBuffers = new Map<string, { name: string; args: string }>()
  private dataChannel: RTCDataChannel | null = null
  private pendingMessages: unknown[] = []
  private defaultOrgId: string | undefined
  private defaultCalendarId: string | undefined
  private defaultAgentId: string | undefined
  private toolHintSent = false
  private onToolEvent?: (e: ToolEvent) => void
  private onSlots?: (slots: Array<{ start: string; end: string }>, tz?: string) => void
  private calendarIds: string[] | undefined
  private awaitingTool: boolean = false
  private awaitingToolTimer: NodeJS.Timeout | null = null
  private fallbackTimer: NodeJS.Timeout | null = null
  private lastTranscript: string = ''
  private tz: string | undefined

  constructor(opts?: {
    onTranscript?: (text: string) => void
    onAgentTranscript?: (text: string, final: boolean) => void
    onToolEvent?: (e: ToolEvent) => void
    onSlots?: (slots: Array<{ start: string; end: string }>, tz?: string) => void
  }) {
    this.audioEl = new Audio()
    this.onTranscript = opts?.onTranscript
    this.onAgentTranscript = opts?.onAgentTranscript
    this.onToolEvent = opts?.onToolEvent
    this.onSlots = opts?.onSlots
  }

  setCalendarIds(ids: string[] | undefined) {
    this.calendarIds = ids && ids.length ? [...ids] : undefined
  }

  private requireTool(name: 'check' | 'slots') {
    // Cancel any current generation and require a tool call
    try { this.sendOAI({ type: 'response.cancel' }) } catch {
    // Error handled
  }
    const instructions =
      name === 'slots'
        ? 'User asked for day availability. Call getAvailableSlots with the requested date (YYYY-MM-DD). Do not state times unless they come from the tool result.'
        : 'User asked for a specific time. Call checkAvailability with start at that exact local time and end=start+60 minutes (unless user specified a duration). Do not speak availability before tool result.'
    this.sendOAI({ type: 'response.create', response: { instructions, tool_choice: 'required', modalities: ['audio', 'text'] } })
    this.awaitingTool = true
    if (this.awaitingToolTimer) clearTimeout(this.awaitingToolTimer)
    this.awaitingToolTimer = setTimeout(() => {
      if (this.awaitingTool) {
        // Re-prompt once
        this.sendOAI({ type: 'response.create', response: { instructions, tool_choice: 'required', modalities: ['audio', 'text'] } })
      }
    }, 2000)

    // Fallback after 3500ms for specific-time queries: parse transcript and call API directly
    if (name === 'check') {
      if (this.fallbackTimer) clearTimeout(this.fallbackTimer)
      this.fallbackTimer = setTimeout(() => {
        if (!this.awaitingTool) return
        const parsed = this.parseSlotFromTranscript(this.lastTranscript)
        if (!parsed) return
        const organizationId = this.defaultOrgId
        const calendarId = this.defaultCalendarId
        const agentId = this.defaultAgentId
        const apiUrl = agentId ? `/api/agents/${agentId}/calendar/check-availability` : '/api/calendar/check-availability'
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, start: parsed.start, end: parsed.end, calendarId, calendarIds: this.calendarIds })
        })
          .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
          .then(({ ok, j }) => {
            this.awaitingTool = false
            if (ok && j?.available === true) {
              this.speak(`That time is available: ${this.fmtRange(j.start || parsed.start, j.end || parsed.end, j.timeZone || this.tz)}. Should I book it?`)
            } else if (ok && j?.available === false) {
              const date = (j.start || parsed.start).slice(0, 10)
              const slotsApiUrl = agentId ? `/api/agents/${agentId}/calendar/slots` : '/api/calendar/slots'
              fetch(slotsApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, slotMinutes: 60, calendarIds: this.calendarIds })
              })
                .then(async (r2) => ({ ok2: r2.ok, j2: await r2.json().catch(() => ({})) }))
                .then(({ ok2, j2 }) => {
                  if (ok2 && Array.isArray(j2?.slots) && j2.slots.length) {
                    const list = j2.slots.slice(0, 5).map((it: unknown) => this.fmtRange(it.start, it.end, j2.timeZone || this.tz)).join(', ')
                    this.speak(`That time is not available. Here are some options: ${list}.`)
                  } else {
                    this.speak('That time is not available and I could not retrieve alternative slots.')
                  }
                })
            } else {
              this.speak('I could not verify that time just now.')
            }
          })
          .catch(() => this.speak('I could not verify that time just now.'))
      }, 3500)
    }
  }

  private speak(text: string) {
    // Try to cancel any ongoing response first
    try { this.sendOAI({ type: 'response.cancel' }) } catch {
    // Error handled
  }
    
    // Report what we're trying to say
    this.onToolEvent?.({ kind: 'event', type: 'spoken', text })
    
    // Tell OpenAI to speak EXACTLY this text
    const exactInstructions = `Say exactly this and nothing else: "${text.replace(/"/g, '\\"')}"`
    this.sendOAI({ 
      type: 'response.create', 
      response: { 
        instructions: exactInstructions,
        modalities: ['audio', 'text'] 
      } 
    })
  }

  private parseSlotFromTranscript(transcript: string): { start: string; end: string } | null {
    // Simple time parser for fallback - tries to extract a time from the transcript
    const timeMatch = transcript.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|AM|PM)?\b/i)
    if (!timeMatch) return null
    
    try {
      const hours = parseInt(timeMatch[1])
      const minutes = parseInt(timeMatch[2] || '0')
      const isPM = /pm/i.test(timeMatch[3] || '')
      
      let hour24 = hours
      if (isPM && hours !== 12) hour24 += 12
      if (!isPM && hours === 12) hour24 = 0
      
      const now = new Date()
      const slotDate = new Date(now)
      slotDate.setHours(hour24, minutes, 0, 0)
      
      // If time is in the past, assume tomorrow
      if (slotDate < now) {
        slotDate.setDate(slotDate.getDate() + 1)
      }
      
      const endDate = new Date(slotDate)
      endDate.setHours(endDate.getHours() + 1)
      
      return {
        start: slotDate.toISOString(),
        end: endDate.toISOString()
      }
    } catch {
      return null
    }
  }

  private fmtTime(iso: string, tz?: string) {
    try {
      const d = new Date(iso)
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
      return fmt.format(d)
    } catch { return iso }
  }

  private fmtRange(startIso: string, endIso: string, tz?: string) {
    return `${this.fmtTime(startIso, tz)} – ${this.fmtTime(endIso, tz)}`
  }

  async connect(
    systemPrompt: string,
    opts?: { organizationId?: string; agentId?: string; calendarId?: string; greeting?: string; language?: string; timeZone?: string }
  ): Promise<void> {
    const session = await fetch('/api/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        organizationId: opts?.organizationId,
        calendarId: opts?.calendarId || 'primary',
        greeting: opts?.greeting,
        language: opts?.language || 'en-US',
        timeZone: opts?.timeZone
      })
    }).then((r) => r.json())

    if (!session?.client_secret?.value || !session?.model) {
      throw new Error('Failed to obtain Realtime session')
    }

    this.defaultOrgId = opts?.organizationId
    this.defaultCalendarId = opts?.calendarId || 'primary'
    this.defaultAgentId = opts?.agentId
    this.tz = opts?.timeZone

    const pc = new RTCPeerConnection()
    this.pc = pc
    pc.ontrack = (e) => {
      const [stream] = e.streams
      this.audioEl.srcObject = stream
      this.audioEl.play().catch(() => {})
    }

    // Receive events from OpenAI
    pc.ondatachannel = (event) => {
      const channel = event.channel
      if (channel.label !== 'oai-events') return
      // Prefer the inbound channel if OpenAI creates it.
      this.attachDataChannel(channel)
    }

    const dc = pc.createDataChannel('oai-events')
    this.attachDataChannel(dc)

    this.mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic!))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const baseUrl = 'https://api.openai.com/v1/realtime'
    const sdpResponse = await fetch(`${baseUrl}?model=${encodeURIComponent(session.model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.client_secret.value}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: offer.sdp
    })
    if (!sdpResponse.ok) {
      const txt = await sdpResponse.text()
      throw new Error(`Realtime SDP error: ${sdpResponse.status} ${txt}`)
    }
    const answer = { type: 'answer', sdp: await sdpResponse.text() } as RTCSessionDescriptionInit
    await pc.setRemoteDescription(answer)

    // Speak the explicit greeting first (if provided), without jumping into scheduling yet
    if (opts?.greeting) {
      const safe = opts.greeting.replace(/"/g, '\\"')
      const greetOnly = `Say exactly: "${safe}". Then stop speaking and wait for the caller to respond.`
      this.sendOAI({
        type: 'response.create',
        response: {
          instructions: greetOnly,
          modalities: ['audio', 'text']
        }
      })
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.sendOAI({ type: 'response.cancel' })
    } catch {
    // Error handled
  }
    this.pc?.close()
    this.pc = null
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    this.toolArgsBuffers.clear()
    this.dataChannel = null
    this.pendingMessages = []
  }

  private handleOAIEvent = (raw: unknown) => {
    try {
      const msg = typeof raw === 'string' ? JSON.parse(raw) : raw
      // Lightweight debug logging to help diagnose tool calling
      if (msg?.type) {
        const k = msg.type as string
        if (
          k.startsWith('response.function_call') ||
          k.startsWith('response.output_text') ||
          k === 'transcript'
        ) {
          // eslint-disable-next-line no-console
          console.debug('[oai]', k)
          this.onToolEvent?.({ kind: 'event', type: k })
        }
      }
      // Simple transcript tap if present
      if (msg.type === 'transcript') {
        this.lastTranscript = msg.text
        if (this.onTranscript) this.onTranscript(msg.text)
        // After first user transcript, arm tool usage with explicit guidance (once)
        if (!this.toolHintSent) {
          const toolHint = `Use tools for scheduling. When the caller mentions a specific time, call checkAvailability with start at that exact local time and end=start+60 minutes (unless the user requested a different duration). Do not check a whole day when a specific time was requested. If checkAvailability shows conflicts, do not proceed to booking; propose the next free times. Format dates as RFC3339 with timezone (e.g., 2025-09-10T10:00:00-04:00). Default organizationId=${this.defaultOrgId || 'unknown'}, calendarId=${this.defaultCalendarId || 'primary'}.`
          this.sendOAI({
            type: 'response.create',
            response: { instructions: toolHint, tool_choice: 'auto', modalities: ['audio', 'text'] }
          })
          this.toolHintSent = true
        }
        // Heuristic: day availability question -> require getAvailableSlots
        const t = (msg.text as string).toLowerCase()
        const hasTime = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)?\b/.test(t) || /\bnoon\b|\bmidnight\b/.test(t)
        const dayQuery = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this\s+week|availability|free|open)\b/.test(t)
        if (dayQuery && !hasTime) this.requireTool('slots')
        if (hasTime) this.requireTool('check')
      }

      // Handle agent (assistant) transcript events
      if (msg.type === 'response.started') {
        // Clear transcript when a new response starts
        this.currentAgentTranscript = ''
      }
      if (msg.type === 'response.audio_transcript.delta') {
        const delta = (msg.delta as string) || ''
        this.currentAgentTranscript += delta
        if (this.onAgentTranscript) {
          this.onAgentTranscript(this.currentAgentTranscript, false)
        }
      }
      if (msg.type === 'response.audio_transcript.done') {
        const final = (msg.transcript as string) || this.currentAgentTranscript
        this.currentAgentTranscript = ''
        if (this.onAgentTranscript) {
          this.onAgentTranscript(final, true)
        }
      }
      // Also handle text output events (when audio is disabled)
      if (msg.type === 'response.text.delta') {
        const delta = (msg.delta as string) || ''
        this.currentAgentTranscript += delta
        if (this.onAgentTranscript) {
          this.onAgentTranscript(this.currentAgentTranscript, false)
        }
      }
      if (msg.type === 'response.text.done') {
        const final = (msg.text as string) || this.currentAgentTranscript
        this.currentAgentTranscript = ''
        if (this.onAgentTranscript) {
          this.onAgentTranscript(final, true)
        }
      }

      // Tool calling (function calling) handlers – support current and legacy event names
      if (msg.type === 'response.function_call.created') {
        // Capture the function name early so later delta/done events can find it
        const callId = (msg.call_id as string) || (msg.id as string)
        const name = (msg.name as string) || 'unknown'
        if (callId) {
          const cur = this.toolArgsBuffers.get(callId) || { name, args: '' }
          cur.name = name
          this.toolArgsBuffers.set(callId, cur)
          this.onToolEvent?.({ kind: 'event', type: 'response.function_call.created' })
        }
      }
      if (
        msg.type === 'response.function_call.arguments.delta' ||
        msg.type === 'response.function_call_arguments.delta'
      ) {
        this.awaitingTool = false
        const callId = (msg.call_id as string) || (msg.id as string)
        const name = (msg.name as string) || (this.toolArgsBuffers.get(callId)?.name ?? 'unknown')
        const delta = (msg.delta as string) || ''
        if (!callId) return
        const cur = this.toolArgsBuffers.get(callId) || { name, args: '' }
        cur.args += delta
        cur.name = name
        this.toolArgsBuffers.set(callId, cur)
      }
      if (
        msg.type === 'response.function_call.arguments.done' ||
        msg.type === 'response.function_call_arguments.done'
      ) {
        this.awaitingTool = false
        const callId = (msg.call_id as string) || (msg.id as string)
        if (!callId) return
        const buf = this.toolArgsBuffers.get(callId)
        if (!buf) return
        // eslint-disable-next-line no-console
        console.debug('[oai] function_call.complete', buf.name)
        this.invokeTool(callId, buf.name, buf.args)
      }
      if (msg.type === 'response.function_call.completed') {
        this.awaitingTool = false
        // Some backends emit a single completed event with full arguments
        const callId = (msg.call_id as string) || (msg.id as string)
        const name = (msg.name as string) || 'unknown'
        const args = (msg.arguments as string) || this.toolArgsBuffers.get(callId || '')?.args || ''
        if (!callId) return
        // eslint-disable-next-line no-console
        console.debug('[oai] function_call.completed', name)
        this.invokeTool(callId, name, args)
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  private async invokeTool(callId: string, name: string, argsJson: string) {
    let args: unknown = {}
    try {
      args = argsJson ? JSON.parse(argsJson) : {}
    } catch {
      // If parsing fails, return an error result
      await this.sendToolResult(callId, { error: 'Invalid tool arguments' })
      return
    }

    try {
      // Heuristic mapping if model omitted the function name
      let effective = name
      if (!effective || effective === 'unknown') {
        if (args && typeof args === 'object') {
          if (args.start && args.end && !args.customer) effective = 'checkAvailability'
          else if (args.start && args.end && args.customer) effective = 'bookAppointment'
          else if (args.date) effective = 'getAvailableSlots'
        }
      }

      this.onToolEvent?.({ kind: 'call', name: effective || name, args: argsJson })

      if (effective === 'checkAvailability') {
        const organizationId = args.organizationId || this.defaultOrgId
        const calendarId = args.calendarId || this.defaultCalendarId
        if (!args.start || !args.end) {
          await this.sendToolResult(callId, { error: 'Missing start/end' })
          return
        }
        const res = await (async () => {
          const agentId = this.defaultAgentId
          const apiUrl = agentId ? `/api/agents/${agentId}/calendar/check-availability` : '/api/calendar/check-availability'
          const r = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId, start: args.start, end: args.end, calendarId, calendarIds: this.calendarIds })
          })
          try {
            const j = await r.json()
            return r.ok ? j : { error: 'http_error', status: r.status, detail: j }
          } catch {
            const t = await r.text().catch(() => '')
            return { error: 'http_error', status: r.status, detail: t }
          }
        })()
        this.onToolEvent?.({ kind: 'result', name: effective, result: res })
        
        // Process the result and prepare our response BEFORE sending tool result
        let spokenResponse = ''
        try {
          if ((res as AvailabilityResult)?.error === 'broad_window') {
            // Don't speak, just trigger slots tool
            await this.sendToolResult(callId, res)
            this.requireTool('slots')
            return
          } else if ((res as AvailabilityResult)?.available === true) {
            const tz = (res as AvailabilityResult)?.timeZone
            const s = (res as AvailabilityResult)?.start || args.start
            const e = (res as AvailabilityResult)?.end || args.end
            spokenResponse = `Yes, ${this.fmtRange(s, e, tz)} is available. Would you like me to book it?`
          } else if ((res as AvailabilityResult)?.available === false) {
            const tz = (res as AvailabilityResult)?.timeZone
            const requestedStart = (res as AvailabilityResult)?.start || args.start
            const requestedEnd = (res as AvailabilityResult)?.end || args.end
            const requestedTime = this.fmtRange(requestedStart, requestedEnd, tz)
            
            // Get alternative slots for the same day
            const date = (requestedStart as string).slice(0, 10)
            const agentId = this.defaultAgentId
            const slotsApiUrl = agentId ? `/api/agents/${agentId}/calendar/slots` : '/api/calendar/slots'
            const r2 = await fetch(slotsApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date, slotMinutes: 60, calendarIds: this.calendarIds })
            })
            let j: unknown = null
            try { j = await r2.json() } catch {
    // Error handled
  }
            if (r2.ok && j?.slots?.length) {
              const tz2 = j.timeZone
              try { this.onSlots?.(j.slots, tz2) } catch {
    // Error handled
  }
              const list = j.slots.slice(0, 5).map((it: unknown) => this.fmtRange(it.start, it.end, tz2)).join(', ')
              spokenResponse = `Sorry, ${requestedTime} is not available. The available times that day are: ${list}.`
            } else {
              spokenResponse = `Sorry, ${requestedTime} is not available and I could not retrieve alternative slots for that day.`
            }
          }
        } catch {
    // Error handled
  }
        
        // Send tool result with suppression flag, then speak our response
        await this.sendToolResult(callId, res, true)
        if (spokenResponse) {
          this.speak(spokenResponse)
        }
      } else if (effective === 'bookAppointment') {
        const organizationId = args.organizationId || this.defaultOrgId
        const calendarId = args.calendarId || this.defaultCalendarId
        if (!organizationId) {
          await this.sendToolResult(callId, { error: 'Missing organizationId' })
          return
        }
        const res = await (async () => {
          const agentId = this.defaultAgentId
          const apiUrl = agentId ? `/api/agents/${agentId}/appointments/book` : '/api/appointments/book'
          const r = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId, customer: args.customer, start: args.start, end: args.end, notes: args.notes, calendarId })
          })
          try {
            const j = await r.json()
            return r.ok ? j : { error: 'http_error', status: r.status, detail: j }
          } catch {
            const t = await r.text().catch(() => '')
            return { error: 'http_error', status: r.status, detail: t }
          }
        })()
        this.onToolEvent?.({ kind: 'result', name: effective, result: res })
        
        // Prepare response before sending tool result
        let spokenResponse = ''
        try {
          if (res?.error === 'conflict') {
            spokenResponse = 'That time is busy. Would you like me to suggest alternatives?'
          } else if (res?.appointment) {
            const tz = res?.timeZone
            const s = res?.start || args.start
            const e = res?.end || args.end
            spokenResponse = `Perfect! I've booked ${this.fmtRange(s, e, tz)} for you. It's now on your calendar.`
          }
        } catch {
    // Error handled
  }
        
        await this.sendToolResult(callId, res, true)
        if (spokenResponse) {
          this.speak(spokenResponse)
        }
      } else if (effective === 'getAvailableSlots') {
        const organizationId = args.organizationId || this.defaultOrgId
        const res = await (async () => {
          const agentId = this.defaultAgentId
          const apiUrl = agentId ? `/api/agents/${agentId}/calendar/slots` : '/api/calendar/slots'
          const r = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId,
              date: args.date,
              slotMinutes: args.slotMinutes,
              businessHours: args.businessHours,
              calendarIds: this.calendarIds
            })
          })
          try {
            const j = await r.json()
            return r.ok ? j : { error: 'http_error', status: r.status, detail: j }
          } catch {
            const t = await r.text().catch(() => '')
            return { error: 'http_error', status: r.status, detail: t }
          }
        })()
        this.onToolEvent?.({ kind: 'result', name: effective, result: res })
        
        // Prepare response before sending tool result
        let spokenResponse = ''
        try {
          if (Array.isArray(res?.slots)) {
            const tz = res?.timeZone
            try { this.onSlots?.(res.slots, tz) } catch {
    // Error handled
  }
            if (res.slots.length === 0) {
              spokenResponse = 'No free slots found that day.'
            } else {
              const list = res.slots.slice(0, 5).map((it: unknown) => this.fmtRange(it.start, it.end, tz)).join(', ')
              spokenResponse = `Available times are: ${list}.`
            }
          } else if (res?.error) {
            spokenResponse = 'I could not retrieve the day availability at the moment.'
          }
        } catch {
    // Error handled
  }
        
        await this.sendToolResult(callId, res, true)
        if (spokenResponse) {
          this.speak(spokenResponse)
        }
      } else {
        const err = { error: `Unknown tool ${name || 'unknown'}` }
        this.onToolEvent?.({ kind: 'result', name, result: err })
        await this.sendToolResult(callId, err)
      }
    } catch (e) {
      const err = { error: (e as Error).message }
      this.onToolEvent?.({ kind: 'result', name, result: err })
      await this.sendToolResult(callId, err)
    }
  }

  private async sendToolResult(callId: string, result: unknown, suppressResponse: boolean = false) {
    // Provide tool output to the model
    const createItem = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result)
      }
    }
    this.sendOAI(createItem)
    
    // If we're going to speak deterministically, tell the AI to be quiet
    if (suppressResponse) {
      // Add a system message to prevent AI from speaking
      const suppressMsg = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'text', text: 'Tool result has been processed. Agent will speak the response.' }]
        }
      }
      this.sendOAI(suppressMsg)
    }
  }

  private attachDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel
    channel.onmessage = (ev) => this.handleOAIEvent(ev.data)
    channel.onopen = () => {
      // Flush any queued messages once channel is open
      if (this.pendingMessages.length) {
        for (const msg of this.pendingMessages) {
          try {
            channel.send(JSON.stringify(msg))
          } catch {
            // ignore send failures
          }
        }
        this.pendingMessages = []
      }
    }
  }

  private sendOAI(msg: unknown) {
    const dc = this.dataChannel
    const payload = JSON.stringify(msg)
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(payload)
      } catch {
        // If send fails unexpectedly, queue it for retry on next open
        this.pendingMessages.push(msg)
      }
    } else {
      this.pendingMessages.push(msg)
    }
  }
}
