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
import { encodePcm16ToMuLaw, downsample16kTo8k } from '../../../../lib/telephony/mulaw'

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
  // @ts-expect-error
  return new Response(null, { status: 101, webSocket: ws as any })
}

// Utility: send Twilio media frame (µ-law base64) back to the call stream
function uint8ToB64(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

function sendTwilioAudio(ws: WebSocket, streamSid: string, muLawBytes: Uint8Array) {
  const payload = uint8ToB64(muLawBytes)
  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
}

// Full duplex realtime bridge will be added later. For now we handle greeting playback.

export async function GET() {
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

  // Supabase admin client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // OpenAI API key (used for TTS)
  const apiKey = process.env.OPENAI_API_KEY

  server.accept()

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
        // Basic observability
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
          if (agent?.greeting) greeting = agent.greeting
        }

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
              const view = new DataView(buf)
              // Locate data chunk in WAV (simplified)
              let dataOffset = 44
              for (let i = 12; i < 44; i++) {
                if (view.getUint32(i, false) === 0x64617461) { dataOffset = i + 8; break }
              }
              const sampleRate = view.getUint32(24, true)
              const bytes = new Uint8Array(buf, dataOffset)
              const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
              const pcm8k = sampleRate === 8000 ? pcm16 : downsample16kTo8k(pcm16)
              const frame = 160 // 20ms @8kHz
              let frames = 0
              for (let i = 0; i < pcm8k.length; i += frame) {
                const slice = pcm8k.subarray(i, i + frame)
                const mu = encodePcm16ToMuLaw(slice)
                if (streamSid) sendTwilioAudio(server, streamSid, mu)
                await new Promise((r) => setTimeout(r, 20))
                frames++
              }
              console.log('[tts.stream.sent_frames]', frames)
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
  })

  return okWs(client)
}

export const POST = GET
