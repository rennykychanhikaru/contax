import type { AgentAdapter } from '../adapters/types'

type ToolEvent =
  | { kind: 'event'; type: string }
  | { kind: 'call'; name: string; args: string }
  | { kind: 'result'; name: string; result: any }

export class OpenAIRealtimeAgent implements AgentAdapter {
  private pc: RTCPeerConnection | null = null
  private mic: MediaStream | null = null
  private audioEl: HTMLAudioElement
  private onTranscript?: (text: string) => void
  private toolArgsBuffers = new Map<string, { name: string; args: string }>()
  private dataChannel: RTCDataChannel | null = null
  private pendingMessages: any[] = []
  private defaultOrgId: string | undefined
  private defaultCalendarId: string | undefined
  private toolHintSent = false
  private onToolEvent?: (e: ToolEvent) => void

  constructor(opts?: { onTranscript?: (text: string) => void; onToolEvent?: (e: ToolEvent) => void }) {
    this.audioEl = new Audio()
    this.onTranscript = opts?.onTranscript
    this.onToolEvent = opts?.onToolEvent
  }

  async connect(
    systemPrompt: string,
    opts?: { organizationId?: string; calendarId?: string; greeting?: string; language?: string }
  ): Promise<void> {
    const session = await fetch('/api/realtime/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        organizationId: opts?.organizationId,
        calendarId: opts?.calendarId || 'primary',
        greeting: opts?.greeting,
        language: opts?.language || 'en-US'
      })
    }).then((r) => r.json())

    if (!session?.client_secret?.value || !session?.model) {
      throw new Error('Failed to obtain Realtime session')
    }

    this.defaultOrgId = opts?.organizationId
    this.defaultCalendarId = opts?.calendarId || 'primary'

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
    } catch {}
    this.pc?.close()
    this.pc = null
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    this.toolArgsBuffers.clear()
    this.dataChannel = null
    this.pendingMessages = []
  }

  private handleOAIEvent = (raw: any) => {
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
        if (this.onTranscript) this.onTranscript(msg.text)
        // After first user transcript, arm tool usage with explicit guidance (once)
        if (!this.toolHintSent) {
          const toolHint = `Use tools for scheduling. First call checkAvailability for the requested time; if available, call bookAppointment. Format dates as RFC3339 with timezone (e.g., 2025-09-10T10:00:00-04:00). Default organizationId=${this.defaultOrgId || 'unknown'}, calendarId=${this.defaultCalendarId || 'primary'}.`
          this.sendOAI({
            type: 'response.create',
            response: { instructions: toolHint, tool_choice: 'auto', modalities: ['audio', 'text'] }
          })
          this.toolHintSent = true
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
        const callId = (msg.call_id as string) || (msg.id as string)
        if (!callId) return
        const buf = this.toolArgsBuffers.get(callId)
        if (!buf) return
        // eslint-disable-next-line no-console
        console.debug('[oai] function_call.complete', buf.name)
        this.invokeTool(callId, buf.name, buf.args)
      }
      if (msg.type === 'response.function_call.completed') {
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
    let args: any = {}
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
        const res = await fetch('/api/calendar/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            start: args.start,
            end: args.end,
            calendarId
          })
        }).then((r) => r.json())
        this.onToolEvent?.({ kind: 'result', name, result: res })
        await this.sendToolResult(callId, res)
      } else if (effective === 'bookAppointment') {
        const organizationId = args.organizationId || this.defaultOrgId
        const calendarId = args.calendarId || this.defaultCalendarId
        if (!organizationId) {
          await this.sendToolResult(callId, { error: 'Missing organizationId' })
          return
        }
        const res = await fetch('/api/appointments/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            customer: args.customer,
            start: args.start,
            end: args.end,
            notes: args.notes,
            calendarId
          })
        }).then((r) => r.json())
        this.onToolEvent?.({ kind: 'result', name, result: res })
        await this.sendToolResult(callId, res)
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

  private async sendToolResult(callId: string, result: any) {
    // Provide tool output to the model and request it to continue
    const createItem = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result)
      }
    }
    this.sendOAI(createItem)
    this.sendOAI({ type: 'response.create' })
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

  private sendOAI(msg: any) {
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
