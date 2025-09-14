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

// --- µ-law and resampling helpers (PCM16 Int16Array) ---
const BIAS = 0x84
const CLIP = 32635
function pcm16ToMuLaw(sample) {
  let sign = (sample >> 8) & 0x80
  if (sign !== 0) sample = -sample
  if (sample > CLIP) sample = CLIP
  sample = sample + BIAS
  let exponent = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  let mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f
  let muLawByte = ~(sign | (exponent << 4) | mantissa)
  return muLawByte & 0xff
}
function encodePcm16ToMuLaw(pcm) {
  const out = new Uint8Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm16ToMuLaw(pcm[i])
  return out
}
function downsample16kTo8k(pcm16k) {
  const out = new Int16Array(Math.floor(pcm16k.length / 2))
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = pcm16k[i]
  return out
}

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
const wss = new WebSocket.Server({ server })

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

        // Fetch agent greeting
        let greeting = 'Hello! How can I help you today?'
        if (orgId && agentId) {
          const { data: agent } = await supabase
            .from('agent_configurations')
            .select('greeting')
            .eq('organization_id', orgId)
            .eq('id', agentId)
            .single()
          if (agent && agent.greeting) greeting = agent.greeting
        }

        // Synthesize greeting via OpenAI TTS and stream to Twilio
        if (OAI_KEY) {
          try {
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: { Authorization: `Bearer ${OAI_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: selectedVoice, input: greeting, format: 'wav' })
            })
            console.log('[tts.response]', res.status, res.statusText)
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer())
              // Minimal WAV parsing
              const sampleRate = buf.readUInt32LE(24)
              // Find 'data' chunk
              let dataOffset = 44
              for (let i = 12; i < 44; i++) {
                if (buf.readUInt32BE(i) === 0x64617461) { // 'data'
                  dataOffset = i + 8
                  break
                }
              }
              const pcmBytes = buf.subarray(dataOffset)
              const pcm16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 2))
              const pcm8k = (sampleRate === 8000) ? pcm16 : downsample16kTo8k(pcm16)
              const frame = 160 // 20ms @ 8kHz
              let frames = 0
              for (let i = 0; i < pcm8k.length; i += frame) {
                const slice = pcm8k.subarray(i, i + frame)
                const mu = encodePcm16ToMuLaw(slice)
                sendTwilioAudio(ws, streamSid, mu)
                await new Promise((r) => setTimeout(r, 20))
                frames++
              }
              console.log('[tts.stream.sent_frames]', frames)
            } else {
              const t = await res.text().catch(() => '')
              console.warn('[tts.response.error]', t.slice(0, 256))
            }
          } catch (e) {
            console.warn('[tts.error]', e?.message)
          }
        }
      }

      if (msg.event === 'media') {
        // Future: forward caller audio to realtime LLM and stream response back
        // We intentionally do nothing here for now
      }

      if (msg.event === 'stop') {
        try { ws.close() } catch {}
      }
    } catch (e) {
      // Ignore JSON parse errors to keep stream alive
    }
  })
})

server.listen(PORT, () => {
  console.log(`[twilio-ws] listening on ws://localhost:${PORT}`)
  console.log('[twilio-ws] expose this port with ngrok: ngrok http', PORT)
})
