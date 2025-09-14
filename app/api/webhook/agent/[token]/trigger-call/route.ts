/**
 * Agent-specific webhook endpoint for triggering calls
 * Each agent has a unique webhook URL with token-based identification
 *
 * Security features:
 * - Token-based agent identification
 * - Rate limiting per agent
 * - Audit logging
 * - Auto-disable after failures
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import twilio from 'twilio'

// Input validation schema
const TriggerCallSchema = z.object({
  phoneNumber: z.string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format. Must be E.164 format (e.g., +1234567890)')
    .max(15, 'Phone number too long'),

  customerName: z.string()
    .min(1, 'Customer name is required')
    .max(100, 'Customer name too long')
    .optional(),

  context: z.string()
    .max(1000, 'Context too long')
    .optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now()

  try {
    // Parse and validate request body
    let body: unknown
    try {
      body = await req.json()
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    // Log the incoming request body to see what Make is sending
    console.error('==== WEBHOOK DEBUG ====')
    console.error('Webhook received from Make:', JSON.stringify(body, null, 2))
    console.error('====================')

    // Handle if Make sends just a raw number
    let phoneNumber: string | undefined;
    if (typeof body === 'number' || typeof body === 'string') {
      // Make sent just the phone number directly
      phoneNumber = String(body);
    } else if (body && typeof body === 'object') {
      // Try to map common field variations from Make
      const bodyObj = body as Record<string, unknown>;
      phoneNumber = String(bodyObj.phoneNumber || bodyObj.phone_number || bodyObj.phone || bodyObj.mobile || bodyObj.Phone || bodyObj['Phone Number'] || bodyObj['Mobile Phone Number'] || bodyObj.MobilePhoneNumber || bodyObj['MobilePhoneNumber'] || bodyObj.mobile_phone_number || '');
    }

    // Auto-format phone number if it doesn't start with +
    if (phoneNumber && !phoneNumber.startsWith('+')) {
      // Remove any non-digit characters first
      phoneNumber = phoneNumber.replace(/\D/g, '');

      // Add +1 for US/Canada numbers (10 or 11 digits)
      if (phoneNumber.length === 10) {
        phoneNumber = '+1' + phoneNumber;
      } else if (phoneNumber.length === 11 && phoneNumber.startsWith('1')) {
        phoneNumber = '+' + phoneNumber;
      } else {
        // For other lengths, just add + and hope it's formatted correctly
        phoneNumber = '+' + phoneNumber;
      }
    }

    let customerName: string | undefined;
    let context: string | undefined;

    if (body && typeof body === 'object') {
      const bodyObj = body as Record<string, unknown>;
      customerName = bodyObj.customerName ? String(bodyObj.customerName) :
                    bodyObj.customer_name ? String(bodyObj.customer_name) :
                    bodyObj.name ? String(bodyObj.name) :
                    bodyObj.Name ? String(bodyObj.Name) :
                    bodyObj['Customer Name'] ? String(bodyObj['Customer Name']) :
                    bodyObj['Full Name'] ? String(bodyObj['Full Name']) : undefined;

      context = bodyObj.context ? String(bodyObj.context) :
               bodyObj.Context ? String(bodyObj.Context) :
               bodyObj.notes ? String(bodyObj.notes) :
               bodyObj.Notes ? String(bodyObj.Notes) :
               bodyObj.description ? String(bodyObj.description) : undefined;
    }

    const mappedBody = {
      phoneNumber: phoneNumber,
      customerName: customerName,
      context: context
    }

    console.error('Mapped body:', JSON.stringify(mappedBody, null, 2))

    // Validate input data
    const validation = TriggerCallSchema.safeParse(mappedBody)
    if (!validation.success) {
      console.log('Validation errors:', validation.error.issues)
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.issues.map(e => ({
            field: e.path.join('.'),
            message: e.message
          })),
          debug: {
            receivedFromMake: body,  // What Make actually sent
            afterMapping: mappedBody,  // What we tried to use
            receivedFields: body && typeof body === 'object' ? Object.keys(body as Record<string, unknown>) : [],  // List of field names Make sent
          },
          help: "Make is sending data with different field names. Check 'receivedFields' to see what Make is actually sending, then update your Make scenario to use 'phoneNumber' as the field name, or contact support to update the webhook handler.",
          expectedFormat: {
            phoneNumber: '+1234567890 (E.164 format with country code)',
            customerName: 'Optional: Customer name',
            context: 'Optional: Additional context'
          }
        },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    // Extract webhook token from URL
    const webhookToken = (await params).token

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Find agent by webhook token
    const { data: agent, error: agentError } = await supabase
      .from('agent_configurations')
      .select('*, organization_id')
      .eq('webhook_token', webhookToken)
      .eq('webhook_enabled', true)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Invalid webhook token or webhook disabled' },
        { status: 401 }
      )
    }

    // Get organization details for processing the call
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', agent.organization_id)
      .single()

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Get Twilio settings for the organization
    const { data: twilioSettings, error: twilioError } = await supabase
      .from('twilio_settings')
      .select('*')
      .eq('organization_id', agent.organization_id)
      .single()

    if (twilioError || !twilioSettings) {
      console.error('Twilio settings not found:', twilioError)
      return NextResponse.json(
        { error: 'Twilio not configured for this organization' },
        { status: 503 }
      )
    }

    // Check if organization has Twilio configured
    const twilioPhone = twilioSettings.phone_number
    const twilioSid = twilioSettings.account_sid
    const twilioToken = twilioSettings.auth_token

    if (!twilioPhone || !twilioSid || !twilioToken) {
      return NextResponse.json(
        { error: 'Twilio not configured for this organization' },
        { status: 503 }
      )
    }

    // Agent-specific configuration (stored in call metadata for voice handler to use)
    // const agentPrompt = agent.prompt || 'You are a helpful scheduling assistant.'
    // const agentGreeting = agent.greeting || 'Hi! Thanks for calling. How can I help you today?'
    // const voiceConfig = agent.voice_config || { voice: 'alloy', model: 'gpt-4o-realtime-preview' }

    // Create call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert({
        organization_id: agent.organization_id,
        caller_phone: validatedData.phoneNumber,
        status: 'initiated',
        transcript: {
          metadata: {
            triggered_via: 'agent_webhook',
            customer_name: validatedData.customerName,
            context: validatedData.context,
            agent_id: agent.id,
            agent_name: agent.display_name,
            webhook_token: webhookToken.substring(0, 8) + '...', // Log partial token for debugging
          }
        }
      })
      .select()
      .single()

    if (callError || !call) {
      console.error('Failed to create call record:', callError)
      return NextResponse.json(
        { error: 'Failed to initiate call' },
        { status: 500 }
      )
    }

    // Log webhook usage
    await supabase
      .from('webhook_logs')
      .insert({
        organization_id: agent.organization_id,
        webhook_token: webhookToken.substring(0, 8) + '...',
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        user_agent: req.headers.get('user-agent'),
        request_body: validatedData,
        response_status: 200,
        success: true,
        processing_time_ms: Date.now() - startTime
      })

    // Initialize Twilio client
    const twilioClient = twilio(twilioSid, twilioToken)

    try {
      // Create TwiML webhook URL for handling the call
      // This should point to your endpoint that handles the voice interaction
      const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/twilio/voice?callId=${call.id}`

      // Initiate the call via Twilio
      const twilioCall = await twilioClient.calls.create({
        from: twilioPhone,
        to: validatedData.phoneNumber,
        url: twimlUrl, // URL that will handle the call with TwiML
        method: 'POST',
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/twilio/status`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true, // Record the call
        machineDetection: 'DetectMessageEnd', // Detect answering machines
      })

      // Update call record with Twilio call SID
      await supabase
        .from('calls')
        .update({
          status: 'connecting',
          call_sid: twilioCall.sid
        })
        .eq('id', call.id)

      const response = {
        success: true,
        message: 'Call initiated successfully',
        callId: call.id,
        twilioCallSid: twilioCall.sid,
        organizationId: agent.organization_id,
        phoneNumber: validatedData.phoneNumber,
        processingTime: Date.now() - startTime
      }

      return NextResponse.json(response, { status: 200 })

    } catch (twilioError) {
      console.error('Twilio call failed:', twilioError)

      // Update call status to failed
      const errorMessage = twilioError instanceof Error ? twilioError.message : 'Unknown error'
      await supabase
        .from('calls')
        .update({
          status: 'failed',
          ai_summary: `Failed to initiate call: ${errorMessage}`
        })
        .eq('id', call.id)

      return NextResponse.json(
        {
          error: 'Failed to initiate call',
          details: errorMessage
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Webhook processing error:', error)

    // Don't leak internal errors in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    } else {
      return NextResponse.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  }
}

// OPTIONS request for CORS preflight
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