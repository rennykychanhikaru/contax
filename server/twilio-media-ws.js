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

function sendTwilioAudioB64(ws, streamSid, payloadB64) {
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: payloadB64 } }))
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
  let greetConsentRequired = false
  // Track tool calls by call_id
  const toolBuffers = new Map()
  // Track current response for audio fallback
  let curHasAudio = false
  let curTranscript = ''

  // --- OpenAI Realtime state ---
  let oai = { ws: /** @type {import('ws')} */ (null), ready: false, appendPending: 0, lastCommitTs: 0 }

  // Outbound pacing queue (20ms per frame) with light jitter buffer and telemetry
  const outboundQueue = [] /** @type {Uint8Array[]} */
  let txFrames = 0
  let lastTxLog = Date.now()
  let startedPacing = false
  const PREBUFFER_FRAMES = 5 // ~100ms prebuffer for smoother starts
  const SILENCE_160 = new Uint8Array(160).fill(0xff) // μ-law silence frame
  let carryMu = new Uint8Array(0) // carry leftover μ-law bytes between deltas
  const sendTicker = setInterval(() => {
    if (!streamSid) return
    // Wait until we have a small prebuffer to avoid initial choppiness
    if (!startedPacing) {
      if (outboundQueue.length >= PREBUFFER_FRAMES) startedPacing = true
      else return
    }
    // If passthrough mode is active, do not pace — deltas are forwarded immediately
    if (oaiOutputIsUlaw) return
    const frame = outboundQueue.shift()
    if (!frame) {
      // Keep Twilio timing steady with silence fill if pacing already started
      sendTwilioAudio(ws, streamSid, SILENCE_160)
      return
    }
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

  let oaiOutputIsUlaw = false

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
        let sessionInstructions = `${basePrompt}\n\nLanguage: Detect and mirror the caller's language automatically. If the caller switches languages, adapt immediately.\nConversation: Keep responses concise and conversational. Avoid interrupting; wait about 0.8–1.2 seconds after the caller finishes before speaking. If you're uncertain what the caller said, ask for clarification. Confirm critical details like dates, times, names, and numbers.\nSpeaking style: Speak at a natural but brisk pace and avoid long pauses between sentences.\nTurn-taking rules: Do not assume consent. Never proceed unless the caller explicitly responds. Treat background noise or one-syllable utterances as unclear and ask a brief clarification instead of assuming yes. If the caller starts speaking while you are speaking, immediately stop and let them finish (barge-in). After greeting, do not ask the next question until the caller responds.\nBooking notes: When calling bookAppointment, include a concise property summary in the notes (e.g., bedrooms, key features, budget, timeline, special requests).`
        
        if (greetingText) {
          const safeGreeting = String(greetingText).replace(/"/g, '\"')
          sessionInstructions = 'Your first response must be to say exactly: "' + safeGreeting + '". After that, you must follow all other instructions.\n\n' + sessionInstructions
        }

        // Normalize voice labels to OpenAI identifiers when possible
        const v = normalizeVoiceId(voice)
        // Select μ-law passthrough to Twilio like the reference example
        oaiOutputIsUlaw = true
        rws.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: v || 'sage',
            modalities: ['audio', 'text'],
            // Output μ-law 8k directly from Realtime for reliable pacing
            output_audio_format: 'g711_ulaw',
            input_audio_format: 'g711_ulaw',
            // Enable automatic speech turns with a slightly longer silence window
            turn_detection: { type: 'server_vad', silence_duration_ms: 1000 },
            tools: [
              {
                type: 'function',
                name: 'checkAvailability',
                description: 'Check if a specific start-end window is free on the connected calendar',
                parameters: {
                  type: 'object',
                  properties: {
                    start: { type: 'string' },
                    end: { type: 'string' },
                    organizationId: { type: 'string' },
                    calendarId: { type: 'string' }
                  },
                  required: ['start','end']
                }
              },
              {
                type: 'function',
                name: 'getAvailableSlots',
                description: 'Get free slots for a given date on the connected calendar',
                parameters: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    slotMinutes: { type: 'number' }
                  },
                  required: ['date']
                }
              },
              {
                type: 'function',
                name: 'bookAppointment',
                description: 'Create a calendar event for the confirmed time',
                parameters: {
                  type: 'object',
                  properties: {
                    start: { type: 'string' },
                    end: { type: 'string' },
                    organizationId: { type: 'string' },
                    calendarId: { type: 'string' },
                    customer: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' }
                      },
                      required: ['name']
                    },
                    notes: { type: 'string' }
                  },
                  required: ['start','end']
                }
              }
            ],
            instructions: sessionInstructions
          }
        }))
        console.log('[oai.open] realtime connected')
      })
      rws.on('message', async (raw) => {
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
          if (msg?.type === 'response.created') {
            curHasAudio = false
            curTranscript = ''
          }
          // If still waiting for consent, cancel any assistant output turn immediately
          if ((msg?.type === 'response.created' || msg?.type === 'response.started') && waitingForUser) {
            try { rws.send(JSON.stringify({ type: 'response.cancel' })) } catch (_) { /* noop */ }
          }
          if (msg?.type === 'transcript') {
            const t = (msg.text || '').toString()
            const cleaned = t.replace(/\s+/g, ' ').trim()
            const meaningful = /(yes|yeah|yep|sure|okay|ok|no|not|busy|later|schedule|appointment|property|budget|name|email|phone)/i.test(cleaned) || cleaned.length >= 8
            if (agentSpeakingNow && cleaned.length) {
              try { rws.send(JSON.stringify({ type: 'response.cancel' })) } catch (_) { /* noop */ }
              agentSpeakingNow = false
            }
            // Require explicit affirmative consent right after greeting
            const affirmative = /\b(yes|yeah|yep|sure|okay|ok|sounds good|that works)\b/i.test(cleaned)
            if (waitingForUser) {
              if (greetConsentRequired) {
                if (affirmative) {
                  waitingForUser = false
                  greetConsentRequired = false
                } else {
                  // Remain waiting; do not advance on non-affirmative
                }
              } else if (meaningful) {
                waitingForUser = false
              }
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
            if (!callId) {
              // cannot buffer without call id
            } else {
              const name = msg.name || (toolBuffers.get(callId)?.name ?? 'unknown')
              const cur = toolBuffers.get(callId) || { name, args: '' }
              cur.name = name
              cur.args += delta
              toolBuffers.set(callId, cur)
            }
          }
          const isArgsDone = (msg?.type === 'response.function_call.arguments.done' || msg?.type === 'response.function_call_arguments.done')
          if (isArgsDone || msg?.type === 'response.function_call.completed') {
            const callId = msg.call_id || msg.id
            if (callId) {
              const buf = toolBuffers.get(callId) || { name: msg.name || 'unknown', args: msg.arguments || '' }
              const name = msg.name || buf.name || 'unknown'
              const argsJson = (typeof msg.arguments === 'string' ? msg.arguments : '') || buf.args || ''
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
                // After greeting, require explicit affirmative user response before proceeding
                waitingForUser = true
                greetConsentRequired = true
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
            curHasAudio = true
            const b64 = typeof msg.delta === 'string' ? msg.delta : (typeof msg.audio === 'string' ? msg.audio : null)
            if (!b64) return
            if (oaiOutputIsUlaw) {
              // Pass-through: forward μ-law base64 directly to Twilio like the reference example
              sendTwilioAudioB64(ws, streamSid, b64)
            } else {
              // Fallback path: decode 24k PCM, resample, μ-law encode, and pace
              const pcm24k = b64ToPcm16(b64)
              let pcm8k
              try {
                if (!connectOpenAIRealtime._resamplers) connectOpenAIRealtime._resamplers = createResamplerCache()
                const rs = connectOpenAIRealtime._resamplers.get(24000, 8000)
                if (rs) {
                  pcm8k = rs.processInt16(pcm24k)
                } else {
                  console.warn('[resample.missing] falling back to naive 24k->8k')
                  pcm8k = downsample24kTo8kLinear(pcm24k)
                }
              } catch (e) {
                console.warn('[resample.error] 24k->8k fallback', e?.message)
                pcm8k = downsample24kTo8kLinear(pcm24k)
              }
              const mu = encodePcm16ToMuLaw(pcm8k)
              // Exact 160-byte frames with carry-over
              const combined = new Uint8Array(carryMu.length + mu.length)
              combined.set(carryMu, 0)
              combined.set(mu, carryMu.length)
              let i = 0
              while (i + 160 <= combined.length) {
                enqueueMu(combined.subarray(i, i + 160))
                i += 160
              }
              carryMu = combined.subarray(i) // keep remainder for next delta
            }
          }
          if (msg?.type === 'response.audio_transcript.delta') {
            const d = (msg.delta || '').toString()
            curTranscript += d
          }
          // Let server VAD create responses; avoid double-create (active response error)
          // Mark greeting as complete on first completed response
          if (!greetingDone && (msg?.type === 'response.completed' || msg?.type === 'response.audio.done' || msg?.type === 'response.done')) {
            greetingDone = true
            // Do not enable a post-greeting wait gate; allow immediate conversation
            waitingForUser = false
            greetConsentRequired = false
            console.log('[oai.greeting.completed]')
          }
          if (msg?.type === 'response.done') {
            // Fallback if no audio deltas arrived: synthesize transcript
            if (!curHasAudio && curTranscript.trim() && OAI_KEY) {
              try {
                const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${OAI_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: normalizeVoiceId(selectedVoice) || 'sage', input: curTranscript, format: 'wav' })
                })
                if (ttsRes.ok) {
                  const buf = await ttsRes.arrayBuffer()
                  const meta = parseWavHeader(buf)
                  let sampleRate = 0
                  let dataOffset = 44
                  if (meta) { sampleRate = meta.sampleRate; dataOffset = meta.dataOffset }
                  else {
                    // Fallback: assume standard 44-byte header with little-endian fields
                    try { sampleRate = new DataView(buf).getUint32(24, true) } catch (_) { sampleRate = 0 }
                  }
                  const bytes = new Uint8Array(buf, dataOffset)
                  const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
                  let pcm8k
                  if (sampleRate === 8000) {
                    pcm8k = pcm16
                  } else {
                    try {
                      // Support common 16k/24k → 8k paths with selected resampler
                      if (!connectOpenAIRealtime._resamplers) connectOpenAIRealtime._resamplers = createResamplerCache()
                      if (sampleRate % 8000 === 0 && (sampleRate === 16000 || sampleRate === 24000)) {
                        const rs = connectOpenAIRealtime._resamplers.get(sampleRate, 8000)
                        if (rs) pcm8k = rs.processInt16(pcm16)
                      }
                    } catch (e) {
                      console.warn('[tts.resample.error]', e?.message)
                    }
                    if (!pcm8k) {
                      // Last-resort fallback to simple decimation for 16k only (reduced quality)
                      if (sampleRate === 16000) pcm8k = downsample16kTo8k(pcm16)
                      else if (sampleRate === 24000) pcm8k = downsample24kTo8kLinear(pcm16)
                      else {
                        console.warn('[tts.sample_rate] unsupported sampleRate=', sampleRate, 'using passthrough (may sound wrong)')
                        pcm8k = pcm16
                      }
                    }
                  }
                  for (let i = 0; i < pcm8k.length; i += 160) enqueueMu(encodePcm16ToMuLaw(pcm8k.subarray(i, i + 160)))
                }
              } catch (_) { /* ignore */ }
            }
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
    waitingForUser = false
    agentSpeakingNow = false
    greetConsentRequired = false
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

function parseWavHeader(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  // Check 'RIFF' and 'WAVE'
  if (view.getUint32(0, false) !== 0x52494646 /* 'RIFF' */) return null
  if (view.getUint32(8, false) !== 0x57415645 /* 'WAVE' */) return null
  let offset = 12
  let fmt = null
  let dataOffset = null
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset + 0, false)
    const size = view.getUint32(offset + 4, true) // chunk size is little-endian
    if (id === 0x666d7420 /* 'fmt ' */) {
      fmt = {
        audioFormat: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
        blockAlign: view.getUint16(offset + 20, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      }
    } else if (id === 0x64617461 /* 'data' */) {
      dataOffset = offset + 8
      // do not break; still advance to be robust to LIST chunks order
    }
    offset += 8 + size
  }
  if (!fmt || dataOffset == null) return null
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, dataOffset }
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

// --- High-quality resampling: prefer libsamplerate; fallback to FIR decimator ---
let SamplerateLib = null
let RESAMPLER_MODE = (process.env.RESAMPLER || 'auto').toLowerCase() // auto|libsamplerate|fir
try {
  if (RESAMPLER_MODE !== 'fir') {
    // Try WASM libsamplerate first
    try { SamplerateLib = require('libsamplerate.js') } catch (_) { SamplerateLib = null }
    // (Optional compatibility) also try older/native naming if present in env
    if (!SamplerateLib) {
      try { SamplerateLib = require('@samplerate/samplerate') } catch (_) { /* ignore */ }
    }
  }
} catch (_) {
  SamplerateLib = null
}

function createLibsamplerateResampler(fromRate, toRate) {
  if (!SamplerateLib) return null
  const stats = { frames: 0, totalMs: 0, lastLog: Date.now() }
  const label = `libsamplerate_${fromRate}to${toRate}`
  try {
    // Adapter for different libsamplerate shapes
    // Shape A (class-based): new Resampler({ type, channels, fromRate, toRate }).process(Float32Array)
    if (SamplerateLib.Resampler && typeof SamplerateLib.Resampler === 'function') {
      const type = SamplerateLib.SRC_SINC_BEST_QUALITY || SamplerateLib.SRC_SINC_MEDIUM_QUALITY || 0
      const inst = new SamplerateLib.Resampler({ type, channels: 1, fromRate, toRate })
      return {
        label,
        processInt16(pcmIn) {
          const t0 = Date.now()
          const fIn = new Float32Array(pcmIn.length)
          for (let i = 0; i < pcmIn.length; i++) fIn[i] = pcmIn[i] / 32768.0
          const fOut = inst.process(fIn)
          const y = new Int16Array(fOut.length)
          for (let i = 0; i < fOut.length; i++) {
            const s = Math.max(-1, Math.min(1, fOut[i]))
            y[i] = (s * 32768) | 0
          }
          const ms = Date.now() - t0
          const now = Date.now()
          stats.frames++
          stats.totalMs += ms
          if (now - stats.lastLog > 2000) {
            const avg = stats.totalMs / (stats.frames || 1)
            console.log('[resample.stats]', label, 'frames=', stats.frames, 'avg_ms=', avg.toFixed(3))
            stats.frames = 0
            stats.totalMs = 0
            stats.lastLog = now
          }
          return y
        }
      }
    }
    // Shape C (constructor function export with .Type; stream-based API expecting Float32 Buffer I/O)
    if (typeof SamplerateLib === 'function' && SamplerateLib.Type) {
      const Type = SamplerateLib.Type
      const ratio = toRate / fromRate
      const inst = new SamplerateLib({ type: Type.SINC_BEST_QUALITY || Type.SINC_MEDIUM_QUALITY || 0, ratio, channels: 1 })
      return {
        label,
        processInt16(pcmIn) {
          const t0 = Date.now()
          // Build Float32 input Buffer (4 bytes per sample)
          const fIn = new Float32Array(pcmIn.length)
          for (let i = 0; i < pcmIn.length; i++) fIn[i] = pcmIn[i] / 32768.0
          const bufIn = Buffer.from(fIn.buffer)
          const outChunks = []
          const onData = (chunk) => { outChunks.push(chunk) }
          inst.on('data', onData)
          try { inst.write(bufIn) } finally { inst.off('data', onData) }
          // Concatenate output Float32 buffers
          let outLenBytes = 0
          for (let i = 0; i < outChunks.length; i++) outLenBytes += outChunks[i].length
          const outBuf = Buffer.concat(outChunks, outLenBytes)
          const fOut = new Float32Array(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength / 4)
          const y = new Int16Array(fOut.length)
          for (let i = 0; i < fOut.length; i++) {
            const s = Math.max(-1, Math.min(1, fOut[i]))
            y[i] = (s * 32768) | 0
          }
          const ms = Date.now() - t0
          const now = Date.now()
          stats.frames++
          stats.totalMs += ms
          if (now - stats.lastLog > 2000) {
            const avg = stats.totalMs / (stats.frames || 1)
            console.log('[resample.stats]', label, 'frames=', stats.frames, 'avg_ms=', avg.toFixed(3))
            stats.frames = 0
            stats.totalMs = 0
            stats.lastLog = now
          }
          return y
        }
      }
    }
    // Shape B (function-based): resample(Float32Array, fromRate, toRate, channels, quality)
    const mod = SamplerateLib.default || SamplerateLib
    const fn = mod && (mod.resample || mod.src_simple || mod.srcSimple)
    if (typeof fn === 'function') {
      return {
        label,
        processInt16(pcmIn) {
          const t0 = Date.now()
          const fIn = new Float32Array(pcmIn.length)
          for (let i = 0; i < pcmIn.length; i++) fIn[i] = pcmIn[i] / 32768.0
          // quality hint if supported; fallback to best available
          const quality = mod.SRC_SINC_BEST_QUALITY || mod.QUALITY_BEST || 0
          let fOut
          try {
            fOut = fn(fIn, fromRate, toRate, 1, quality)
          } catch (_) {
            // Some APIs expect ratio, not two rates; try that as a fallback
            const ratio = toRate / fromRate
            fOut = fn(fIn, ratio, quality)
          }
          const y = new Int16Array(fOut.length)
          for (let i = 0; i < fOut.length; i++) {
            const s = Math.max(-1, Math.min(1, fOut[i]))
            y[i] = (s * 32768) | 0
          }
          const ms = Date.now() - t0
          const now = Date.now()
          stats.frames++
          stats.totalMs += ms
          if (now - stats.lastLog > 2000) {
            const avg = stats.totalMs / (stats.frames || 1)
            console.log('[resample.stats]', label, 'frames=', stats.frames, 'avg_ms=', avg.toFixed(3))
            stats.frames = 0
            stats.totalMs = 0
            stats.lastLog = now
          }
          return y
        }
      }
    }
    console.warn('[resample.init.error] libsamplerate: unsupported API shape')
    return null
  } catch (e) {
    console.warn('[resample.init.error] libsamplerate', e?.message)
    return null
  }
}

// --- High-quality FIR decimator with anti-aliasing ---
// Design a Hamming-windowed low-pass FIR (cutoff ~3.4kHz for 8k telephony)
function designFIRLowpass(numTaps, cutoffHz, fs) {
  const taps = new Float32Array(numTaps)
  const fc = cutoffHz / fs // normalized cutoff (0..0.5)
  const M = numTaps - 1
  let sum = 0
  for (let n = 0; n <= M; n++) {
    const k = n - M / 2
    // sinc(2*fc*k) with handling k=0
    const x = (k === 0) ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k)
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / M) // Hamming window
    const h = x * w
    taps[n] = h
    sum += h
  }
  // Normalize DC gain to 1.0
  for (let n = 0; n <= M; n++) taps[n] /= sum || 1
  return taps
}

class FirDecimator {
  constructor(fromRate, toRate, opts) {
    if (!toRate || !fromRate || fromRate % toRate !== 0) {
      throw new Error(`FirDecimator requires integer ratio. fromRate=${fromRate} toRate=${toRate}`)
    }
    this.factor = fromRate / toRate
    const numTaps = (opts && opts.numTaps) || 63
    const cutoff = (opts && opts.cutoffHz) || 3400
    this.taps = designFIRLowpass(numTaps, cutoff, fromRate)
    this.state = new Float32Array(this.taps.length - 1)
    this.stats = { frames: 0, totalMs: 0, lastLog: Date.now() }
    this.label = `fir_polyphase_${fromRate}to${toRate}_t${numTaps}_f${this.factor}`
  }
  processInt16(pcmIn) {
    const t0 = Date.now()
    const L = this.taps.length
    // Build working buffer = [state | current]
    const x = new Float32Array(this.state.length + pcmIn.length)
    // Copy previous tail
    x.set(this.state, 0)
    // Append current normalized samples
    for (let i = 0; i < pcmIn.length; i++) x[this.state.length + i] = pcmIn[i] / 32768.0
    // Compute number of output samples available
    const available = x.length - (L - 1)
    const outLen = Math.max(0, Math.floor(available / this.factor))
    const y = new Int16Array(outLen)
    // Convolution + decimation
    let outIdx = 0
    for (let n = L - 1; n <= x.length - 1 && outIdx < outLen; n += this.factor) {
      let acc = 0.0
      // Unrolled-ish inner loop for performance
      for (let k = 0; k < L; k++) {
        acc += this.taps[k] * x[n - k]
      }
      // Clamp to Int16
      const s = Math.max(-1, Math.min(1, acc))
      y[outIdx++] = (s * 32768) | 0
    }
    // Save new tail
    const tailStart = Math.max(0, x.length - (L - 1))
    this.state.set(x.subarray(tailStart))
    // Stats
    const ms = Date.now() - t0
    const now = Date.now()
    this.stats.frames++
    this.stats.totalMs += ms
    if (now - this.stats.lastLog > 2000) {
      const avg = this.stats.totalMs / (this.stats.frames || 1)
      console.log('[resample.stats]', this.label, 'frames=', this.stats.frames, 'avg_ms=', avg.toFixed(3))
      this.stats.frames = 0
      this.stats.totalMs = 0
      this.stats.lastLog = now
    }
    return y
  }
}

// Connection-scoped resamplers cache to preserve state
function createResamplerCache() {
  const cache = new Map()
  return {
    get(fromRate, toRate) {
      const key = `${fromRate}->${toRate}`
      if (!cache.has(key)) {
        let inst = null
        // Selection: libsamplerate preferred in auto/libsamplerate modes
        if (RESAMPLER_MODE === 'auto' || RESAMPLER_MODE === 'libsamplerate') {
          inst = createLibsamplerateResampler(fromRate, toRate)
          if (inst) {
            console.log('[resample.select]', inst.label)
          } else if (RESAMPLER_MODE === 'libsamplerate') {
            console.warn('[resample.select] libsamplerate requested but unavailable; falling back to FIR')
          }
        }
        if (!inst) {
          try {
            const fir = new FirDecimator(fromRate, toRate, { numTaps: 63, cutoffHz: 3400 })
            console.log('[resample.select]', fir.label)
            inst = fir
          } catch (e) {
            console.warn('[resample.init.error] fir', e?.message)
            inst = null
          }
        }
        cache.set(key, inst)
      }
      return cache.get(key)
    }
  }
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

    // Fetch with timeout to avoid stalling the call
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    console.log('[tool.invoke]', effective, url)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    clearTimeout(t)
    let payload = null
    try { payload = await res.json() } catch { payload = { ok: res.ok } }
    if (!res.ok) payload = { error: 'http_error', status: res.status, detail: payload }
    console.log('[tool.result]', effective, res.status)
    await sendToolResult(rws, callId, payload)
    // Let the model speak based on tool output (no suppression)
    rws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio','text'] } }))
  } catch (e) {
    const msg = (e && e.message) || 'tool_invoke_failed'
    console.warn('[tool.invoke.error]', effective, msg)
    await sendToolResult(rws, callId, { error: msg })
    // Nudge the model to speak an error-friendly response
    try { rws.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio','text'] } })) } catch (_) { /* ignore */ }
  }
}

async function sendToolResult(rws, callId, result) {
  const item = {
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) }
  }
  try { rws.send(JSON.stringify(item)) } catch (e) { /* ignore */ }
}
