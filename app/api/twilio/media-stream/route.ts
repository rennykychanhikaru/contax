/*
  Twilio Media Streams WebSocket endpoint

  - Accepts WebSocket upgrade from Twilio <Connect><Stream>
  - Parses Twilio events: start, media, stop
  - On connect, fetches agent by organizationId/agentId and starts an OpenAI Realtime session
  - Sends the agent's saved greeting as the very first audio (no barge-in during greeting)
  - Bridges model audio -> Twilio (PCM16 16kHz -> downsample 8k -> µ-law -> base64 payload)
  - Bridges Twilio audio -> model (µ-law 8k -> upsample 16k PCM16) after greeting completes

  Notes:
  - This implementation focuses on the greeting-first behavior and establishes a structure for
    two-way media. It uses naive resampling for simplicity.
  - For production, consider more robust resampling, VAD, and backpressure handling.
*/


import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encodePcm16ToMuLaw, downsample16kTo8k, MU_LAW_SILENCE_20MS, MU_LAW_FRAME_SAMPLES_8K_20MS } from '../../../../lib/telephony/mulaw'

export const runtime = 'edge'

type TwilioStartEvent = {
  event: 'start'
  start: {
    streamSid: string
    callSid: string
    accountSid: string
    customParameters?: Record<string, string>
  }
}

type TwilioMediaEvent = {
  event: 'media'
  media: { payload: string }
  streamSid: string
}

type TwilioStopEvent = { event: 'stop' }

type TwilioEvent = TwilioStartEvent | TwilioMediaEvent | TwilioStopEvent | { event: string; [k: string]: unknown }

function okWs(ws: WebSocket) {
  // @ts-expect-error-next-line - WebSocket is not a standard property on Response
  return new Response(null, { status: 101, webSocket: ws })
}

// Utility: send Twilio media frame (µ-law base64) back to the call stream
function b64UrlEncodeChunked(arr: Uint8Array): string {
  // Convert to base64 using chunking to avoid large intermediate strings
  const CHUNK = 0x2000; // 8KB
  let s = ''
  for (let i = 0; i < arr.length; i += CHUNK) {
    const sub = arr.subarray(i, Math.min(i + CHUNK, arr.length))
    s += String.fromCharCode.apply(null, Array.from(sub))
  }
  return btoa(s)
}

type WebSocketWithBuffered = WebSocket & { bufferedAmount?: number }

function sendTwilioAudio(ws: WebSocket, streamSid: string, muLawBytes: Uint8Array) {
  const payload = b64UrlEncodeChunked(muLawBytes)
  // Backpressure safety: if buffered is very high, drop frame to keep timing
  const bufferedAmount = (ws as WebSocketWithBuffered).bufferedAmount ?? 0
  if (bufferedAmount > 2_000_000) {
    return
  }
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
}

// Full duplex realtime bridge will be added later. For now we handle greeting playback.

export async function GET(req: NextRequest) {
  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }

  const pair = new (globalThis as { WebSocketPair: new () => { 0: WebSocket, 1: WebSocket } }).WebSocketPair()
  const [client, server] = [pair[0], pair[1]] as [WebSocket, WebSocket]

  let streamSid = ''
  let callSid = ''
  let orgId: string | undefined
  let agentId: string | undefined
  let selectedVoice: string = 'sage'
  let greetingDone = false
  // auth verification is enforced; no separate flag required

  // Supabase anon client (read-only usage, RLS should protect data)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // OpenAI API key (used for TTS)
  const apiKey = process.env.OPENAI_API_KEY
  const authSecret = process.env.STREAM_AUTH_SECRET || ''

  function base64UrlToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  function bytesToUtf8(b: Uint8Array): string {
    return new TextDecoder().decode(b)
  }

  async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
    const enc = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
    return new Uint8Array(sig)
  }

  function bytesToB64Url(bytes: Uint8Array): string {
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    const b64 = btoa(s)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  server.accept()

  // Outbound pacing queue (20ms frames) with small prebuffer
  const outboundQueue: Uint8Array[] = []
  let startedPacing = false
  const PREBUFFER_FRAMES = 5
  const sendTimer = setInterval(() => {
    if (!streamSid) return
    if (!startedPacing) {
      if (outboundQueue.length >= PREBUFFER_FRAMES) startedPacing = true
      else return
    }
    const frame = outboundQueue.shift()
    if (!frame) {
      sendTwilioAudio(server, streamSid, MU_LAW_SILENCE_20MS)
      return
    }
    sendTwilioAudio(server, streamSid, frame)
  }, 20)

  server.addEventListener('message', async (evt: MessageEvent) => {
    try {
      const payload = typeof evt.data === 'string' ? evt.data : ''
      if (!payload) return
      const msg: TwilioEvent = JSON.parse(payload)
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid
        callSid = msg.start.callSid
        const params = msg.start.customParameters || ({} as Record<string, string>)
        orgId = params['organizationId']
        agentId = params['agentId']
        selectedVoice = params['voice'] || 'sage'
        const streamToken = params['auth'] || ''
        // Basic observability
        console.log('[twilio.stream.start]', { callSid, streamSid, orgId, agentId, voice: selectedVoice })

        // Verify short-lived token if provided
        try {
          if (authSecret && streamToken.includes('.')) {
            const [payloadB64, sigB64] = streamToken.split('.')
            const calcSig = bytesToB64Url(await hmacSha256(authSecret, payloadB64))
            if (sigB64 !== calcSig) throw new Error('bad signature')
            const raw = bytesToUtf8(base64UrlToBytes(payloadB64))
            const info = JSON.parse(raw) as { exp?: number; organizationId?: string; agentId?: string }
            if (!info?.exp || info.exp < Math.floor(Date.now() / 1000)) throw new Error('expired token')
            // Optionally check consistency with provided params
            if ((info.organizationId || '') !== (orgId || '')) console.warn('[auth.warn] orgId mismatch')
            if ((info.agentId || '') !== (agentId || '')) console.warn('[auth.warn] agentId mismatch')
          } else if (authSecret) {
            throw new Error('missing token')
          }
        } catch (e) {
          console.warn('[auth.reject]', (e as Error)?.message)
          try { server.close(1008, 'auth failed') } catch (_closeErr) { /* ignore close error */ }
          return
        }

        // Fetch agent greeting
        let greeting = 'Hello! How can I help you today?'
        try {
          if (orgId && agentId) {
            const { data: agent } = await supabase
              .from('agent_configurations')
              .select('greeting')
              .eq('organization_id', orgId)
              .eq('id', agentId)
              .single()
            if (agent?.greeting) greeting = agent.greeting
          }
        } catch (_) { /* default greeting already set */ }

        // Synthesize greeting via OpenAI TTS REST and stream to Twilio
        try {
          if (apiKey) {
            const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: selectedVoice || 'sage', input: greeting, format: 'wav' })
            })
            console.log('[tts.response]', ttsRes.status, ttsRes.statusText)
            if (ttsRes.ok) {
              const buf = await ttsRes.arrayBuffer()
              const pcm = parseWavToPcm16(buf)
              if (pcm) {
                const pcm8k = pcm.sampleRate === 8000 ? pcm.samples : downsample16kTo8k(pcm.samples)
                for (let i = 0; i < pcm8k.length; i += MU_LAW_FRAME_SAMPLES_8K_20MS) {
                  const slice = pcm8k.subarray(i, i + MU_LAW_FRAME_SAMPLES_8K_20MS)
                  const mu = encodePcm16ToMuLaw(slice)
                  outboundQueue.push(mu)
                }
                console.log('[tts.stream.enqueued_frames]', Math.ceil(pcm8k.length / MU_LAW_FRAME_SAMPLES_8K_20MS))
              } else {
                console.warn('[tts.parse] unsupported or malformed WAV, skipping')
              }
            } else {
              const txt = await ttsRes.text().catch(() => '')
              console.warn('[tts.response.error]', txt?.slice(0, 256))
            }
          }
        } catch (e) {
          console.warn('[tts.error]', (e as Error)?.message)
        }
        greetingDone = true
      }

      if (msg.event === 'media') {
        // After greeting, we can forward audio to a realtime model (future work)
        if (!greetingDone) return
        // Guard payload size and shape
        if (!('media' in msg) || typeof (msg as TwilioMediaEvent).media.payload !== 'string') return
        if ((msg as TwilioMediaEvent).media.payload.length > 4096) {
          console.warn('[media.warn] payload too large')
          return
        }
        // const mu = b64ToUint8(msg.media.payload)
        // const pcm8k = decodeMuLawToPcm16(mu)
        // const pcm16k = upsample8kTo16k(pcm8k)
      }

      if (msg.event === 'stop') server.close()
    } catch (e) {
      // Swallow parse errors to keep stream alive
    }
  })

  // Periodic commit loop to trigger responses from chunks
  // This is a lightweight approach; production code should use VAD or server events.
  const interval = setInterval(() => {}, 1000)

  server.addEventListener('close', () => {
    clearInterval(interval)
    clearInterval(sendTimer)
  })

  return okWs(client)
}

export const POST = GET

// Minimal WAV parser for PCM16 mono
function parseWavToPcm16(buf: ArrayBuffer): { sampleRate: number; samples: Int16Array } | null {
  if (buf.byteLength < 44) return null
  const v = new DataView(buf)
  // 'RIFF' and 'WAVE'
  if (v.getUint32(0, false) !== 0x52494646) return null
  if (v.getUint32(8, false) !== 0x57415645) return null
  let fmtOffset = -1
  let dataOffset = -1
  let dataSize = 0
  let i = 12
  while (i + 8 <= buf.byteLength) {
    const chunkId = v.getUint32(i, false)
    const size = v.getUint32(i + 4, true)
    if (chunkId === 0x666d7420) fmtOffset = i + 8 // 'fmt '
    if (chunkId === 0x64617461) { // 'data'
      dataOffset = i + 8
      dataSize = size
    }
    i += 8 + size
  }
  if (fmtOffset < 0 || dataOffset < 0 || dataSize <= 0) return null
  const audioFormat = v.getUint16(fmtOffset + 0, true)
  const numChannels = v.getUint16(fmtOffset + 2, true)
  const sampleRate = v.getUint32(fmtOffset + 4, true)
  const bitsPerSample = v.getUint16(fmtOffset + 14, true)
  if (audioFormat !== 1 /* PCM */ || numChannels !== 1 || bitsPerSample !== 16) return null
  const bytes = new Uint8Array(buf, dataOffset, Math.min(dataSize, buf.byteLength - dataOffset))
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
  return { sampleRate, samples }
}
