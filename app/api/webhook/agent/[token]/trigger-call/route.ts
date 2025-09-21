import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioTelephonyAdapter } from '@/lib/telephony/twilio'
import { decrypt } from '@/lib/security/crypto'

function toE164Loose(raw: string): string | null {
  if (!raw) return null
  let s = raw.trim()
  s = s.replace(/\D/g, '')
  if (!s) return null
  if (s.length === 10) return `+1${s}`
  if (s.length === 11 && s.startsWith('1')) return `+${s}`
  if (/^\+[1-9]\d{1,14}$/.test(raw.trim())) return raw.trim()
  return null
}

function findPhoneNumber(obj: any): string | null {
  if (!obj) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPhoneNumber(item);
      if (found) return found;
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
        const potentialPhone = toE164Loose(String(obj[key]));
        if (potentialPhone) return potentialPhone;
      }
    }
    // If no direct string is a phone number, check nested objects
    for (const key in obj) {
      const found = findPhoneNumber(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = (await params).token

    const body = await req.json();
    let phoneNumber: string | null = null;

    if (typeof body === 'string' || typeof body === 'number') {
      phoneNumber = toE164Loose(String(body));
    } else {
      phoneNumber = findPhoneNumber(body);
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required (E.164)' }, { status: 400 })
    }

    const formatted = phoneNumber;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Resolve agent by webhook token
    const { data: agent, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, organization_id')
      .eq('webhook_token', token)
      .single()
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 404 })
    }

    // Load Twilio settings for this agent
    const { data: settings, error: tsError } = await supabase
      .from('agent_twilio_settings')
      .select('account_sid, auth_token_encrypted, phone_number')
      .eq('agent_id', agent.id)
      .single()
    if (tsError || !settings) {
      const configureUrl = `${process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`}/agent-settings`
      return NextResponse.json({ error: 'Twilio not configured for this agent', agentId: agent.id, configureUrl }, { status: 409 })
    }

    const adapter = new TwilioTelephonyAdapter({
      accountSid: settings.account_sid,
      authToken: await decrypt(settings.auth_token_encrypted),
      phoneNumber: settings.phone_number,
    })
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`
    await adapter.startOutboundCall(formatted, {
      baseUrl,
      organizationId: agent.organization_id,
      agentId: agent.id,
    })
    const callSid = adapter.getCurrentCallSid()

    // Log call
    const { data: call, error: callError } = await supabase
      .from('call_logs')
      .insert({
        organization_id: agent.organization_id,
        agent_id: agent.id,
        to_number: formatted,
        from_number: settings.phone_number,
        status: 'initiated',
        direction: 'outbound',
        call_sid: callSid,
        metadata: body && typeof body === 'object' ? { webhook_payload: body as Record<string, unknown> } : null,
      })
      .select('id')
      .single()
    if (callError || !call) {
      return NextResponse.json({ error: 'Failed to log call' }, { status: 500 })
    }

    return NextResponse.json({ success: true, callId: call.id, twilioCallSid: callSid })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}
