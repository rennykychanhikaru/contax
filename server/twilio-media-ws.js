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
const { createClient } = require('@supabase/supabase-js')

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

// Supabase admin client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[fatal] Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const OAI_KEY = process.env.OPENAI_API_KEY
if (!OAI_KEY) {
  console.warn('[warn] OPENAI_API_KEY not set; OpenAI TTS greeting will be skipped')
}

wss.on('connection', (ws) => {
  let streamSid = ''
  let callSid = ''
  let orgId
  let agentId
  let selectedVoice = 'sage'
  let greetingDone = false

  // --- OpenAI Realtime state ---
  let oai = { ws: /** @type {import('ws')} */ (null), ready: false, appendPending: 0, lastCommitTs: 0 }

  // Outbound pacing queue (20ms per frame) with light jitter buffer and telemetry
  const outboundQueue = [] /** @type {Uint8Array[]} */
  let txFrames = 0
  let lastTxLog = Date.now()
  let startedPacing = false
  const PREBUFFER_FRAMES = 8 // ~160ms prebuffer
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
      rws.on('open', () => {
        oai.ws = rws
        oai.ready = true
        // Ensure the session is configured to output μ-law 8k audio and desired language
        const lang = languageCode || 'en-US'
        const basePrompt = agentPrompt || 'You are a helpful voice assistant.'
        const sessionInstructions = `${basePrompt}\n\nAlways and only speak in ${lang}. Do not switch languages even if the caller speaks another language; instead, politely ask to continue in ${lang}. Keep responses concise and conversational. When the caller pauses, wait rather than interrupting.`
        rws.send(JSON.stringify({
          type: 'session.update',
          session: {
            voice: voice || 'sage',
            modalities: ['audio', 'text'],
            output_audio_format: 'g711_ulaw',
            input_audio_format: 'g711_ulaw',
            instructions: sessionInstructions
          }
        }))
        console.log('[oai.open] realtime connected')
        // Have the model speak the greeting first
        if (greetingText) {
          const safe = String(greetingText).replace(/"/g, '\"')
          const instr = `Say exactly: "${safe}". Then stop speaking and wait for the caller.`
          rws.send(JSON.stringify({ type: 'response.create', response: { instructions: instr, modalities: ['audio','text'] } }))
        }
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
          // Handle both legacy and current audio delta events; with g711_ulaw we can forward directly
          if ((msg?.type === 'response.output_audio.delta' || msg?.type === 'response.audio.delta')) {
            const b64 = typeof msg.delta === 'string' ? msg.delta : (typeof msg.audio === 'string' ? msg.audio : null)
            if (!b64) return
            const mu = Buffer.from(b64, 'base64')
            for (let i = 0; i < mu.length; i += 160) {
              enqueueMu(mu.subarray(i, i + 160))
            }
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

        // Fetch agent greeting, language, and prompt
        let greeting = 'Hello! How can I help you today?'
        let agentLanguage = 'en-US'
        let agentPrompt = 'You are a helpful voice assistant.'
        if (orgId && agentId) {
          const { data: agent } = await supabase
            .from('agent_configurations')
            .select('greeting, language, prompt')
            .eq('organization_id', orgId)
            .eq('id', agentId)
            .single()
          if (agent && agent.greeting) greeting = agent.greeting
          if (agent && agent.language) agentLanguage = agent.language
          if (agent && agent.prompt) agentPrompt = agent.prompt
        }

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
  })
})

server.listen(PORT, () => {
  console.log(`[twilio-ws] listening on ws://localhost:${PORT}`)
  console.log('[twilio-ws] expose this port with ngrok: ngrok http', PORT)
})
