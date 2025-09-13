import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // This endpoint exchanges the server API key for a short-lived
  // ephemeral client secret used by the browser to open a Realtime session.
  // Requires: process.env.OPENAI_API_KEY
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17'
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500 })
  }

  const { systemPrompt, organizationId, calendarId, greeting, language, timeZone } = await req
    .json()
    .catch(() => ({ systemPrompt: undefined, organizationId: undefined, calendarId: undefined, greeting: undefined, language: undefined, timeZone: undefined }))

  // Resolve default organization if not provided
  let orgId = organizationId as string | undefined
  if (!orgId) {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data } = await supabase.from('organizations').select('id').limit(1)
      orgId = data?.[0]?.id
    }
  }
  const calId = (calendarId as string) || 'primary'
  const locale = (language as string) || 'en-US'
  const transcriptionLang = locale.split('-')[0] || 'en'
  const tz = (timeZone as string) || undefined

  const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'realtime=v1'
    },
    body: JSON.stringify({
      model,
      voice: 'verse',
      // Instruct the assistant how to behave
      instructions:
        (systemPrompt || 'You are a helpful scheduling assistant.') +
        `\nYou MUST speak only in ${locale}. Do not code-switch.` +
        (tz ? `\nAll times are in ${tz}. When confirming, say the weekday and local time (e.g., Monday 10:00 AM).` : '') +
        `\nWhen providing date-times to tools, do NOT include a timezone offset. Provide local wall time only (the server will apply the calendar timezone).` +
        `\nUse the provided tools to check availability and book. Default organizationId=${orgId || 'unknown'} calendarId=${calId}. Ask for missing details if necessary.` +
        `\nWhen you call a tool, you MUST include the exact function name. Examples:` +
        `\n- checkAvailability({\"organizationId\":\"${orgId || 'ORG_ID'}\",\"start\":\"2025-09-10T10:00:00-04:00\",\"end\":\"2025-09-10T11:00:00-04:00\",\"calendarId\":\"${calId}\"})` +
        `\n- bookAppointment({\"organizationId\":\"${orgId || 'ORG_ID'}\",\"customer\":{\"name\":\"Alex\"},\"start\":\"2025-09-10T10:00:00-04:00\",\"end\":\"2025-09-10T11:00:00-04:00\",\"calendarId\":\"${calId}\"})`,
      tool_choice: 'auto',
      tools: [
        {
          type: 'function',
          name: 'checkAvailability',
          description: 'Check if a time window is available for booking',
          parameters: {
            type: 'object',
            properties: {
              organizationId: { type: 'string', description: 'Organization identifier' },
              start: { type: 'string', description: 'Start ISO datetime' },
              end: { type: 'string', description: 'End ISO datetime' },
              calendarId: { type: 'string', description: 'Google Calendar id; default primary' }
            },
            required: ['start', 'end']
          }
        },
        {
          type: 'function',
          name: 'bookAppointment',
          description: 'Book an appointment and return details',
          parameters: {
            type: 'object',
            properties: {
              organizationId: { type: 'string' },
              customer: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string' }
                }
              },
              start: { type: 'string' },
              end: { type: 'string' },
              notes: { type: 'string' },
              calendarId: { type: 'string' }
            },
            required: ['start', 'end']
          }
        },
        {
          type: 'function',
          name: 'getAvailableSlots',
          description: 'List available slots for a given day in the user\'s calendar timezone',
          parameters: {
            type: 'object',
            properties: {
              organizationId: { type: 'string' },
              date: { type: 'string', description: 'YYYY-MM-DD in local calendar timezone' },
              slotMinutes: { type: 'number', description: 'Length of each slot in minutes (default 60)' },
              businessHours: {
                type: 'object',
                properties: {
                  start: { type: 'string', description: 'HH:MM e.g. 09:00' },
                  end: { type: 'string', description: 'HH:MM e.g. 17:00' }
                }
              },
              calendarIds: { type: 'array', items: { type: 'string' }, description: 'Optional list of calendar IDs to consider' }
            },
            required: ['date']
          }
        }
      ],
      input_audio_transcription: {
        model: 'gpt-4o-transcribe',
        language: transcriptionLang
      }
    })
  })

  if (!r.ok) {
    const text = await r.text()
    return new Response(
      JSON.stringify({ error: 'OpenAI error (session create)', detail: text }),
      { status: 500 }
    )
  }

  const data = await r.json()
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
