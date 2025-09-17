import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioTelephonyAdapter } from '../../../../lib/telephony/twilio'

// Flexible mapper for popular automation tools (Zapier/Make/n8n/etc.)
const PHONE_KEYS = [
  'phonenumber', 'phone_number', 'phone', 'mobile',
  'phone number', 'mobile phone number', 'mobilephonenumber', 'mobile_phone_number',
  'to'
]

function normKey(k: string): string {
  return k.trim().toLowerCase()
}

function mapPhoneNumber(input: unknown): string | undefined {
  if (typeof input === 'string' || typeof input === 'number') {
    return String(input)
  }
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const cand =
      o.phoneNumber ?? o.phone_number ?? o.phone ?? o.mobile ??
      o.Phone ?? (o as never)['Phone Number'] ?? (o as never)['Mobile Phone Number'] ?? (o as never).MobilePhoneNumber ?? (o as never)['MobilePhoneNumber'] ??
      o.mobile_phone_number ?? o.to ?? o.To
    return cand != null ? String(cand) : undefined
  }
  return undefined
}

function deepFindPhone(input: unknown): string | undefined {
  const queue: unknown[] = [input]
  while (queue.length) {
    const cur = queue.shift()
    if (!cur) continue
    if (typeof cur === 'string' || typeof cur === 'number') {
      // Might be just a raw string in some wrappers
      const s = String(cur).trim()
      if (s) return s
      continue
    }
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v)
      continue
    }
    if (typeof cur === 'object') {
      const o = cur as Record<string, unknown>
      for (const [k, v] of Object.entries(o)) {
        const nk = normKey(k)
        if (PHONE_KEYS.includes(nk)) return v != null ? String(v) : undefined
        queue.push(v)
      }
    }
  }
  return undefined
}

function phoneFromQuery(req: NextRequest): string | undefined {
  const sp = new URL(req.url).searchParams
  return (
    sp.get('phoneNumber') || sp.get('phone_number') || sp.get('phone') || sp.get('mobile') || sp.get('Phone') || sp.get('to') || undefined
  )
}

function phoneFromHeaders(req: NextRequest): string | undefined {
  const h = req.headers
  return (
    h.get('x-phone') || h.get('x-phone-number') || h.get('x-target-number') || h.get('x-to') || h.get('phone') || h.get('to') || undefined
  )
}

function phoneFromFormData(fd: FormData): string | undefined {
  // Try known keys first
  for (const [k, v] of fd.entries()) {
    const nk = normKey(k)
    if (PHONE_KEYS.includes(nk) || nk === 'phone number' || nk === 'mobile phone number') {
      if (typeof v === 'string') return v
    }
  }
  // Fallback: any single string entry that looks like a phone
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string' && /\d/.test(v)) return v
  }
  return undefined
}

function mapAgentId(input: unknown): string | undefined {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const cand = o.agentId ?? o.agent_id ?? o.agent ?? o.AgentId ?? o.AgentID
    return cand ? String(cand) : undefined
  }
  return undefined
}

function mapContext(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const c = (o.context ?? o.Context ?? o.notes ?? o.Notes ?? o.description) as unknown
    if (c && typeof c === 'object') return c as Record<string, unknown>
    if (typeof c === 'string') return { message: c }
  }
  return undefined
}

function mapOrganizationId(input: unknown): string | undefined {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const cand = o.organizationId ?? o.orgId ?? o.organization_id ?? o.org_id
    return cand ? String(cand) : undefined
  }
  return undefined
}

function toE164Loose(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (s.startsWith('+') && /^\+[1-9]\d{1,14}$/.test(s)) return s
  // remove non-digits
  s = s.replace(/\D/g, '')
  if (!s) return null
  // US/CA convenience: add +1 if 10 digits
  if (s.length === 10) return `+1${s}`
  if (s.length === 11 && s.startsWith('1')) return `+${s}`
  // Fallback: prepend + if looks like international without plus
  if (/^[1-9]\d{6,14}$/.test(s)) return `+${s}`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const ct = (req.headers.get('content-type') || '').toLowerCase()
    let body: unknown = {}
    let raw = ''
    let phoneNumber: string | undefined
    let parsedForm: Record<string, unknown> | undefined

    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      phoneNumber = phoneFromFormData(fd)
      // Build a simple object for agent/context mapping
      parsedForm = {}
      for (const [k, v] of fd.entries()) {
        if (typeof v === 'string') parsedForm[k] = v
      }
      body = parsedForm
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      raw = await req.text()
      const params = new URLSearchParams(raw)
      phoneNumber = (
        params.get('phoneNumber') || params.get('phone_number') || params.get('phone') || params.get('mobile') || params.get('Phone') || params.get('to') || undefined
      )
      // Fallback search case-insensitively
      if (!phoneNumber) {
        for (const [k, v] of params.entries()) {
          const nk = normKey(k)
          if (PHONE_KEYS.includes(nk) || nk === 'phone number' || nk === 'mobile phone number') { phoneNumber = v; break }
        }
      }
      // If still not found, check first param value
      if (!phoneNumber) {
        const it = params.entries().next()
        if (!it.done) {
          const v = it.value?.[1]
          if (v && /\d/.test(v)) phoneNumber = v
        }
      }
      body = Object.fromEntries(params.entries())
    } else if (ct.includes('application/json')) {
      raw = await req.text()
      const trimmed = raw.trim()
      body = trimmed ? (trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed) : {}
    } else if (ct.includes('text/plain')) {
      raw = await req.text()
      body = raw.trim()
      phoneNumber = typeof body === 'string' && body ? body : undefined
    } else {
      // Unknown content-type: try text then JSON fallback
      raw = await req.text().catch(() => '')
      const trimmed = raw?.trim?.() || ''
      if (trimmed) {
        try { body = JSON.parse(trimmed) } catch { body = trimmed }
      } else {
        body = {}
      }
    }

    // If not already found, try mappings on the body
    if (!phoneNumber) phoneNumber = mapPhoneNumber(body)
    if (!phoneNumber) phoneNumber = deepFindPhone(body)
    // Try query and headers
    if (!phoneNumber) phoneNumber = phoneFromQuery(req)
    if (!phoneNumber) phoneNumber = phoneFromHeaders(req)
    const agentId = mapAgentId(body)
    const context = mapContext(body)

    // Auto-format to E.164 when possible
    const formatted = phoneNumber ? toE164Loose(phoneNumber) : null
    if (!formatted) {
      // Helpful diagnostics for integrators
      const fields = body && typeof body === 'object' ? Object.keys(body as Record<string, unknown>) : []
      const sp = new URL(req.url).searchParams
      const queryFields = ['phoneNumber','phone_number','phone','mobile','Phone','to'].filter((k) => sp.get(k) != null)
      return NextResponse.json({
        error: 'Validation failed: phoneNumber is required (E.164)',
        help: 'Provide phone number as +15551234567 or use one of the accepted field names',
        acceptedFieldNames: [
          'phoneNumber','phone_number','phone','mobile','Phone','Phone Number','Mobile Phone Number','MobilePhoneNumber','mobile_phone_number','to','To'
        ],
        receivedFields: fields,
        queryFields,
        contentType: req.headers.get('content-type') || undefined,
        bodyLength: typeof body === 'string' ? body.length : (raw ? raw.length : undefined),
        hint: 'If you send a 10-digit US number, it will be auto-formatted with +1'
      }, { status: 400 })
    }

    phoneNumber = formatted

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Try legacy flow: store a pending call in outgoing_calls
    let data: { id: string } | null = null
    let ocError: unknown = null
    try {
      const res = await supabase
        .from('outgoing_calls')
        .insert({
          phone_number: phoneNumber,
          agent_id: agentId,
          context,
          status: 'pending'
        })
        .select()
        .single()
      data = res.data as { id: string }
      if (res.error) ocError = res.error
    } catch (e) {
      ocError = e
    }

    if (!data) {
      // If outgoing_calls is missing, fall back to direct Twilio initiation + calls table logging
      const errObj = (ocError as { code?: string; message?: string }) || {}
      const missingOutgoingCalls = errObj?.code === 'PGRST205' || /outgoing_calls/.test(String(errObj?.message || ''))
      if (!missingOutgoingCalls) {
        console.error('Outgoing call insert error:', ocError)
      }

      // Determine organizationId
      let orgId = mapOrganizationId(body)
      if (!orgId) {
        // Try resolve via default agent
        try {
          const { data: agent } = await supabase
            .from('agent_configurations')
            .select('organization_id')
            .eq('name', 'default')
            .single()
          if (agent?.organization_id) orgId = agent.organization_id
        } catch {
          // ignore
        }
      }
      if (!orgId) {
        // Try pick first twilio_settings row
        try {
          const { data: ts } = await supabase
            .from('twilio_settings')
            .select('organization_id')
            .limit(1)
            .single()
          if (ts?.organization_id) orgId = ts.organization_id
        } catch {
          // ignore
        }
      }
      if (!orgId) {
        return NextResponse.json({
          error: 'organizationId is required to place calls (legacy table missing)',
          help: 'Include organizationId/orgId in the payload or configure a default agent/twilio_settings'
        }, { status: 400 })
      }

      // Load Twilio settings for this org
      const { data: twilioSettings, error: settingsError } = await supabase
        .from('twilio_settings')
        .select('account_sid, auth_token, phone_number')
        .eq('organization_id', orgId)
        .single()
      if (settingsError || !twilioSettings) {
        return NextResponse.json({ error: 'Twilio settings not found for organization' }, { status: 404 })
      }

      // Start the call via Twilio
      const adapter = new TwilioTelephonyAdapter({
        accountSid: twilioSettings.account_sid,
        authToken: twilioSettings.auth_token,
        phoneNumber: twilioSettings.phone_number,
      })
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`
      await adapter.startOutboundCall(phoneNumber, {
        baseUrl,
        organizationId: orgId,
        agentId: agentId || 'default',
      })
      const callSid = adapter.getCurrentCallSid()

      // Log into calls table
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          organization_id: orgId,
          caller_phone: phoneNumber,
          status: 'initiated',
          transcript: context ? { metadata: context } : null
        })
        .select()
        .single()
      if (callError || !call) {
        console.error('Failed to create call record:', callError)
        return NextResponse.json({ error: 'Failed to log call' }, { status: 500 })
      }
      if (callSid) {
        try {
          await supabase
            .from('calls')
            .update({ status: 'connecting', call_sid: callSid })
            .eq('id', call.id)
        } catch {
          // ignore
        }
      }
      return NextResponse.json({ success: true, callId: call.id, twilioCallSid: callSid, fallback: true })
    }

    // Trigger the call via existing RPC
    const result = await supabase.rpc('trigger_outgoing_call', {
      p_phone_number: phoneNumber,
      p_agent_id: agentId,
      p_context: context
    } as Record<string, unknown>)

    if (result.error) {
      console.error('RPC error:', result.error)
      return NextResponse.json({ error: 'Failed to trigger call' }, { status: 500 })
    }

    return NextResponse.json({ success: true, callId: data.id })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// OPTIONS for CORS/preflight (helpful when testing from browser-like tools)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret',
      'Access-Control-Max-Age': '86400',
    },
  })
}
