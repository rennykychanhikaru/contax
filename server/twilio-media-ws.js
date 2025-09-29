/* eslint-disable @typescript-eslint/no-unused-vars, no-useless-escape, no-empty */
/*
  Standalone Twilio Media Streams WebSocket bridge (Node.js)

  - Run with: node server/twilio-media-ws.js
  - Expose with a separate ngrok tunnel: ngrok http $PORT
  - Set TWILIO_STREAM_WSS_URL to the wss://<ngrok-domain> root + path
    Example: export TWILIO_STREAM_WSS_URL=wss://abc123.ngrok-free.app

  Env vars required:
    - NEXT_PUBLIC_SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - OPENAI_API_KEY
    - TWILIO_WS_PORT (optional, default 8787)
*/

const http = require('http')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')

// --- Load env from .env.local then .env if not already set (Next.js dev style) ---
function loadDotEnvIfPresent(file) {
  try {
    const p = path.resolve(process.cwd(), file)
    if (!fs.existsSync(p)) return false
    const text = fs.readFileSync(p, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
    console.log(`[env] loaded ${file}`)
    return true
  } catch (e) {
    console.warn(`[env] failed to load ${file}:`, e.message)
    return false
  }
}

loadDotEnvIfPresent('.env.local') || loadDotEnvIfPresent('.env')

function uint8ToB64(arr) {
  return Buffer.from(arr).toString('base64')
}

// --- Twilio Media Streams helpers ---
function sendTwilioAudio(ws, streamSid, muLawBytes) {
  const payload = uint8ToB64(muLawBytes)
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
}

// --- Server setup ---
const PORT = parseInt(process.env.TWILIO_WS_PORT || '8787', 10)
const server = http.createServer()
// Disable per-message compression to reduce latency jitter
const wss = new WebSocket.Server({ server, perMessageDeflate: false })
// Ensure TCP_NODELAY (no Nagle) on incoming sockets
server.on('connection', (sock) => { try { sock.setNoDelay(true) } catch (e) { /* ignore */ } })

// Basic health endpoint for Fly checks
server.on('request', (req, res) => {
  try {
    const url = req.url || '/'
    if (req.method === 'GET' && (url === '/health' || url.startsWith('/health?'))) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    // Optionally return 200 on root for quick sanity checks
    if (req.method === 'GET' && (url === '/' || url.startsWith('/?'))) {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('twilio-ws: ok')
      return
    }
  } catch (_) { /* noop */ }
})

// Supabase admin client (lazy ESM import to avoid CJS require errors)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
let supabase = null
async function getSupabase() {
  if (supabase) return supabase
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[warn] Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }
  try {
    const mod = await import('@supabase/supabase-js')
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_KEY)
  } catch (e) {
    console.error('[fatal] Failed to load @supabase/supabase-js:', e?.message)
  }
  return supabase
}

const OAI_KEY = process.env.OPENAI_API_KEY
if (!OAI_KEY) {
  console.warn('[warn] OPENAI_API_KEY not set; OpenAI TTS greeting will be skipped')
}

// One-time env validation to aid diagnostics
;(function validateEnvOnce() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const issues = []
  if (!SUPABASE_URL) issues.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_KEY) issues.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!OAI_KEY) issues.push('OPENAI_API_KEY')
  if (!baseUrl) issues.push('NEXT_PUBLIC_APP_URL')
  if (issues.length) {
    console.warn('[env.check] missing:', issues.join(', '))
  } else {
    console.log('[env.check] all required env present')
  }
})()

wss.on('connection', (ws) => {
  let streamSid = ''
  let callSid = ''
  let orgId
  let agentId
  let selectedVoice = 'sage'
  let greetingDone = false
  let waitingForUser = false
  let agentSpeakingNow = false
  /** @type {NodeJS.Timeout|null} */
  let repromptTimer = null
  // Track tool calls by call_id
  const toolBuffers = new Map()

  // --- OpenAI Realtime state ---
  let oai = { ws: /** @type {import('ws')} */ (null), ready: false, appendPending: 0, lastCommitTs: 0 }

  // Outbound pacing queue (20ms per frame) with light jitter buffer and telemetry
  const outboundQueue = [] /** @type {Uint8Array[]} */
  let txFrames = 0
  let lastTxLog = Date.now()
  let startedPacing = false
  const PREBUFFER_FRAMES = 2 // ~40ms prebuffer for smoother starts
  const sendTicker = setInterval(() => {
    if (!streamSid) return
    // Wait until we have a small prebuffer to avoid initial choppiness
    if (!startedPacing) {
      if (outboundQueue.length >= PREBUFFER_FRAMES) startedPacing = true
      else return
    }
    const frame = outboundQueue.shift()
    if (!frame) return
    sendTwilioAudio(ws, streamSid, frame)
    txFrames++
    const now = Date.now()
    if (now - lastTxLog > 1000) {
      if (txFrames > 0) console.log('[tx.frames]', txFrames, 'in last second')
      txFrames = 0
      lastTxLog = now
    }
  }, 20)

  function enqueueMu(mu) { outboundQueue.push(mu) }

  function connectOpenAIRealtime(voice, greetingText, languageCode, agentPrompt) {
  if (!OAI_KEY) return
  try {
      const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17'
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`
      const rws = new WebSocket(url, { headers: { Authorization: `Bearer ${OAI_KEY}`, 'OpenAI-Beta': 'realtime=v1' }, perMessageDeflate: false })
      let initialTurnSent = false
      rws.on('open', () => {
        oai.ws = rws
        oai.ready = true
        // Persona and conversation guidance
        const lang = languageCode || 'en-US'
        const basePrompt = agentPrompt || 'You are a helpful voice assistant.'
        let sessionInstructions = `${basePrompt}\n\nLanguage: Detect and mirror the caller's language automatically. If the caller switches languages, adapt immediately.\nConversation: Keep responses concise and conversational. Avoid interrupting; wait about 0.8–1.2 seconds after the caller finishes before speaking. If you're uncertain what the caller said, ask for clarification. Confirm critical details like dates, times, names, and numbers.\nSpeaking style: Speak at a natural but brisk pace and avoid long pauses between sentences.\nTurn-taking rules: Do not assume consent. Never proceed unless the caller explicitly responds. Treat background noise or one-syllable utterances as unclear and ask a brief clarification instead of assuming yes. If the caller starts speaking while you are speaking, immediately stop and let them finish (barge-in). After greeting, do not ask the next question until the caller responds.`
        
        if (greetingText) {
          const safeGreeting = String(greetingText).replace(/"/g, '\"')
          sessionInstructions = 'Your first response must be to say exactly: "' + safeGreeting + '". After that, you must follow all other instructions.\n\n' + sessionInstructions
        }

        // Normalize voice labels to OpenAI identifiers when possible
        const v = normalizeVoiceId(voice)
        rws.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: v || 'sage',
            modalities: ['audio', 'text'],
            // Output μ-law 8k directly from Realtime for reliable pacing
            output_audio_format: 'pcm16',
            input_audio_format: 'g711_ulaw',
            // Enable automatic speech turns with a slightly longer silence window
            turn_detection: { type: 'server_vad', silence_duration_ms: 1000, prefix_ms: 200 },
            instructions: sessionInstructions
          }
        }))
        console.log('[oai.open] realtime connected')
      })
      rws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf-8'))
          if (msg?.type) {
            // Lightweight event tracing to diagnose missing audio
            if (
              msg.type !== 'response.output_audio.delta' &&
              msg.type !== 'response.audio.delta' &&
              msg.type !== 'input_audio_buffer.append' &&
              msg.type !== 'transcript'
            ) {
              console.log('[oai.event]', msg.type)
            }
          }
          // Track assistant speaking lifecycle and user barge-in
          if (msg?.type === 'response.started') {
            agentSpeakingNow = true
          }
          if (msg?.type === 'response.completed' || msg?.type === 'response.audio.done' || msg?.type === 'response.done') {
            agentSpeakingNow = false
          }
          if (msg?.type === 'transcript') {
            const t = (msg.text || '').toString()
            const cleaned = t.replace(/\s+/g, ' ').trim()
            const meaningful = /(yes|yeah|yep|sure|okay|ok|no|not|busy|later|schedule|appointment|property|budget|name|email|phone)/i.test(cleaned) || cleaned.length >= 8
            if (agentSpeakingNow && cleaned.length) {
              try { rws.send(JSON.stringify({ type: 'response.cancel' })) } catch (_) { /* noop */ }
              agentSpeakingNow = false
            }
            if (waitingForUser && meaningful) {
              waitingForUser = false
              if (repromptTimer) { try { clearTimeout(repromptTimer) } catch (_) { /* noop */ } repromptTimer = null }
            }
          }
          // Function/tool calling lifecycle
          if (msg?.type === 'response.function_call.created') {
            const callId = msg.call_id || msg.id
            const name = msg.name || 'unknown'
            if (callId) toolBuffers.set(callId, { name, args: '' })
          }
          if (msg?.type === 'response.function_call.arguments.delta' || msg?.type === 'response.function_call_arguments.delta') {
            const callId = msg.call_id || msg.id
            const delta = msg.delta || ''
            if (callId && toolBuffers.has(callId)) {
              toolBuffers.get(callId).args += delta
            }
          }
          const isArgsDone = (msg?.type === 'response.function_call.arguments.done' || msg?.type === 'response.function_call_arguments.done')
          if (isArgsDone || msg?.type === 'response.function_call.completed') {
            const callId = msg.call_id || msg.id
            if (callId && toolBuffers.has(callId)) {
              const buf = toolBuffers.get(callId)
              const name = msg.name || buf.name || 'unknown'
              const argsJson = msg.arguments || buf.args || ''
              // Invoke our HTTP tool and provide results back to the model
              invokeToolAndRespond(rws, callId, name, argsJson, { orgId, agentId })
                .catch((e) => console.warn('[tool.invoke.error]', e?.message))
            }
          }
          // After session settings apply, explicitly speak the greeting once
          if (msg?.type === 'session.updated' && !initialTurnSent) {
            initialTurnSent = true
            if (greetingText) {
              const safe = String(greetingText).replace(/\"/g, '"').replace(/"/g, '\\"')
              const instr = `Say exactly: "${safe}". Then stop speaking and wait for the caller.`
              try {
                rws.send(JSON.stringify({ type: 'response.create', response: { instructions: instr, modalities: ['audio','text'] } }))
                console.log('[oai.response.create] sent greeting turn')
                // After greeting, wait for explicit user response
                waitingForUser = true
                if (repromptTimer) { try { clearTimeout(repromptTimer) } catch (_) { /* noop */ } }
                repromptTimer = setTimeout(() => {
                  if (waitingForUser) {
                    try {
                      rws.send(JSON.stringify({ type: 'response.create', response: { instructions: 'Say exactly: "Is this a good time to chat?"', modalities: ['audio','text'] } }))
                    } catch (_) { /* noop */ }
                  }
                }, 8000)
              } catch (e) {
                console.warn('[oai.response.create.error]', e?.message)
              }
            } else {
              // No explicit greeting; at least start the first turn
              try {
                rws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio','text'] } }))
                console.log('[oai.response.create] sent initial turn (no greeting)')
              } catch (e) {
                console.warn('[oai.response.create.error]', e?.message)
              }
            }
          }
          // Handle audio deltas: downsample, encode, and forward
          if ((msg?.type === 'response.output_audio.delta' || msg?.type === 'response.audio.delta')) {
            console.time('audio_processing');
            const b64 = typeof msg.delta === 'string' ? msg.delta : (typeof msg.audio === 'string' ? msg.audio : null)
            if (!b64) return
            const pcm24k = new Int16Array(Buffer.from(b64, 'base64').buffer)
            const pcm8k = downsample24kTo8kLinear(pcm24k)
            const mu = encodePcm16ToMuLaw(pcm8k)
            for (let i = 0; i < mu.length; i += 160) {
              enqueueMu(mu.subarray(i, i + 160))
            }
            console.timeEnd('audio_processing');
          }
          // Mark greeting as complete on first completed response
          if (!greetingDone && (msg?.type === 'response.completed' || msg?.type === 'response.audio.done' || msg?.type === 'response.done')) {
            greetingDone = true
            console.log('[oai.greeting.completed]')
          }
          if (msg?.type === 'error' || msg?.error) {
            console.warn('[oai.msg.error]', msg?.error || msg)
          }
        } catch (e) { /* ignore */ }
      })
      rws.on('close', () => { oai.ready = false; console.log('[oai.close]') })
      rws.on('error', (e) => { console.warn('[oai.error]', e?.message) })
    } catch (e) {
      console.warn('[oai.connect.error]', e?.message)
    }
  }

  function appendCallerMuLawBase64ToOAI(b64) {
    if (!oai.ready || !oai.ws) return
    // Let Realtime handle VAD and commits; do not force commit/response here
    oai.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }))
  }

  ws.on('message', async (data) => {
    try {
      const str = typeof data === 'string' ? data : data.toString('utf-8')
      const msg = JSON.parse(str)
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid
        callSid = msg.start.callSid
        const params = msg.start.customParameters || {}
        orgId = params['organizationId']
        agentId = params['agentId']
        selectedVoice = params['voice'] || 'sage'
        console.log('[twilio.stream.start]', { callSid, streamSid, orgId, agentId, voice: selectedVoice })

        // Fetch agent greeting, language, prompt, and voice
        let greeting = 'Hello! How can I help you today?'
        let agentLanguage = 'en-US'
        let agentPrompt = 'You are a helpful voice assistant.'
        let agentName = ''
        let agentVoice = ''
        if (orgId) {
          let agent
          if (agentId && agentId !== 'default') {
            const s = await getSupabase()
            if (s) {
            const { data } = await s
              .from('agent_configurations')
              .select('id, display_name, greeting, language, prompt, voice')
              .eq('organization_id', orgId)
              .eq('id', agentId)
              .single()
            agent = data
            }
          } else {
            const s = await getSupabase()
            if (s) {
            const { data } = await s
              .from('agent_configurations')
              .select('id, display_name, greeting, language, prompt, voice')
              .eq('organization_id', orgId)
              .eq('name', 'default')
              .single()
            agent = data
            if (agent && agent.id) agentId = agent.id // resolve real agent id for this call
            }
          }
          if (agent) {
            if (agent.greeting) greeting = agent.greeting
            if (agent.language) agentLanguage = agent.language
            if (agent.prompt) agentPrompt = agent.prompt
            if (agent.display_name) agentName = agent.display_name
            if (agent.voice) agentVoice = agent.voice
          }
        }
        // Prefer DB-configured voice
        if (agentVoice) selectedVoice = agentVoice

        // Log loaded agent configuration for traceability
        const preview = (s) => (s ? String(s).slice(0, 120) : '')
        console.log('[agent.loaded]', {
          organizationId: orgId,
          agentId,
          name: agentName || undefined,
          language: agentLanguage,
          voice: selectedVoice,
          greeting: preview(greeting),
          prompt: preview(agentPrompt)
        })

        // Connect OpenAI Realtime and have it speak the greeting first
        connectOpenAIRealtime(selectedVoice, greeting, agentLanguage, agentPrompt)
        // Safety timer to avoid blocking if greeting doesn't complete
        setTimeout(() => { if (!greetingDone) { greetingDone = true; console.log('[oai.greeting.timeout]') } }, 12000)
      }

      if (msg.event === 'media') {
        if (!greetingDone) return
        try {
          if (!oai.ready) return
          // Twilio payload is μ-law 8k base64
          appendCallerMuLawBase64ToOAI(msg.media.payload)
        } catch (e) { /* ignore */ }
      }

      if (msg.event === 'stop') {
        try { ws.close() } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // Ignore JSON parse errors to keep stream alive
    }
  })

  ws.on('close', () => {
    clearInterval(sendTicker)
    try { if (oai.ws) oai.ws.close() } catch (e) { /* ignore */ }
    try { if (repromptTimer) clearTimeout(repromptTimer) } catch (_) { /* noop */ }
    repromptTimer = null
    waitingForUser = false
    agentSpeakingNow = false
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[twilio-ws] listening on 0.0.0.0:${PORT}`)
})

// --- Tool invocation helpers ---
function normalizeVoiceId(voice) {
  if (!voice) return ''
  const v = String(voice).toLowerCase()
  // Common labels mapped to OpenAI voice IDs
  if (v.includes('shimmer')) return 'shimmer'
  if (v.includes('sage')) return 'sage'
  if (v.includes('alloy')) return 'alloy'
  if (v.includes('verse')) return 'verse'
  if (v.includes('aria')) return 'aria'
  if (v.includes('opal')) return 'opal'
  return voice
}

// --- Audio utils: base64 -> PCM16, downsample to 8k, μ-law encode ---
function b64ToPcm16(b64) {
  const buf = Buffer.from(b64, 'base64')
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2))
}

function downsample16kTo8k(pcm16k) {
  const out = new Int16Array(Math.floor(pcm16k.length / 2))
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = pcm16k[i]
  return out
}

const MU_BIAS = 0x84
const MU_CLIP = 32635
function pcm16ToMu(sample) {
  let s = sample
  let sign = (s >> 8) & 0x80
  if (sign !== 0) s = -s
  if (s > MU_CLIP) s = MU_CLIP
  s = s + MU_BIAS
  let exponent = 7
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  let mantissa = (s >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f
  let mu = ~(sign | (exponent << 4) | mantissa)
  return mu & 0xff
}
function encodePcm16ToMuLaw(pcm) {
  const out = new Uint8Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm16ToMu(pcm[i])
  return out
}

// Downsample PCM16 from 24kHz to 8kHz by averaging 3 samples
function downsample24kTo8kLinear(pcm24k) {
  const out = new Int16Array(Math.floor(pcm24k.length / 3));
  for (let i = 0, j = 0; j < out.length; i += 3, j++) {
    out[j] = ((pcm24k[i] + pcm24k[i+1] + pcm24k[i+2]) / 3) | 0;
  }
  return out;
}

async function invokeToolAndRespond(rws, callId, name, argsJson, ctx) {
  let args = {}
  try { args = argsJson ? JSON.parse(argsJson) : {} } catch { /* noop */ }

  // Infer function if omitted
  let effective = name || 'unknown'
  if (!effective || effective === 'unknown') {
    if (args && typeof args === 'object') {
      if (args.start && args.end && !args.customer) effective = 'checkAvailability'
      else if (args.start && args.end && args.customer) effective = 'bookAppointment'
      else if (args.date) effective = 'getAvailableSlots'
    }
  }

  const body = { ...args }
  // Ensure agent and organization are present in tool requests
  if (ctx && ctx.agentId && !body.agentId) body.agentId = ctx.agentId
  if (ctx && ctx.orgId && !body.organizationId) body.organizationId = ctx.orgId
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  let url = ''
  try {
    const aId = (ctx && ctx.agentId) || args.agentId || args.agent_id
    if (effective === 'checkAvailability') {
      url = aId ? `${base}/api/agents/${aId}/calendar/check-availability` : `${base}/api/calendar/check-availability`
    } else if (effective === 'getAvailableSlots') {
      url = aId ? `${base}/api/agents/${aId}/calendar/slots` : `${base}/api/calendar/slots`
    } else if (effective === 'bookAppointment') {
      url = aId ? `${base}/api/agents/${aId}/appointments/book` : `${base}/api/appointments/book`
    } else {
      // Unknown tool; still send a structured error back
      await sendToolResult(rws, callId, { error: `Unknown tool: ${name}` })
      return
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let payload = null
    try { payload = await res.json() } catch { payload = { ok: res.ok } }
    if (!res.ok) payload = { error: 'http_error', status: res.status, detail: payload }
    await sendToolResult(rws, callId, payload)
    // Let the model speak based on tool output (no suppression)
    rws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio','text'] } }))
  } catch (e) {
    await sendToolResult(rws, callId, { error: (e && e.message) || 'tool_invoke_failed' })
  }
}

async function sendToolResult(rws, callId, result) {
  const item = {
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) }
  }
  try { rws.send(JSON.stringify(item)) } catch (e) { /* ignore */ }
}
