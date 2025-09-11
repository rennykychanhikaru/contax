/**
 * Secure webhook endpoint for triggering calls
 * Each organization has a unique webhook URL with token-based identification
 * 
 * Security features:
 * - Token-based organization identification
 * - Secret key validation
 * - Rate limiting per organization
 * - Audit logging
 * - Auto-disable after failures
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookRequest } from '@/lib/security/webhook'
import { z } from 'zod'

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
  
  // Optional: For backward compatibility, but ignored for security
  organizationId: z.string().uuid().optional(),
  
  // Optional: Alternative way to provide webhook secret (not recommended)
  webhook_secret: z.string().optional()
})

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const startTime = Date.now()
  
  try {
    // Parse and validate request body
    let body: any
    try {
      body = await req.json()
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }
    
    // Validate input data
    const validation = TriggerCallSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      )
    }
    
    const validatedData = validation.data
    
    // Extract webhook token from URL
    const webhookToken = params.token
    
    // Validate webhook request (handles auth, rate limiting, logging)
    const validationResult = await validateWebhookRequest(
      webhookToken,
      req,
      body
    )
    
    if (!validationResult.valid) {
      // Return appropriate error status based on error type
      let status = 401 // Default to unauthorized
      if (validationResult.error?.includes('Rate limit')) {
        status = 429
      } else if (validationResult.error?.includes('disabled')) {
        status = 403
      } else if (validationResult.error?.includes('Invalid webhook token format')) {
        status = 400
      }
      
      return NextResponse.json(
        { error: validationResult.error || 'Webhook validation failed' },
        { status }
      )
    }
    
    const organizationId = validationResult.organizationId!
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    
    // Get organization details for processing the call
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*, organization_settings(*)')
      .eq('id', organizationId)
      .single()
    
    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }
    
    // Check if organization has Twilio configured
    const twilioPhone = org.settings?.twilio_phone_number
    const twilioSid = org.settings?.twilio_account_sid
    const twilioToken = org.settings?.twilio_auth_token_encrypted // This should be decrypted when used
    
    if (!twilioPhone || !twilioSid || !twilioToken) {
      return NextResponse.json(
        { error: 'Twilio not configured for this organization' },
        { status: 503 }
      )
    }
    
    // Get agent configuration
    const agentPrompt = org.settings?.agent_prompt || 'You are a helpful scheduling assistant.'
    const voiceConfig = org.settings?.voice_config || { voice: 'alloy', model: 'gpt-4o-realtime-preview' }
    
    // Create call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .insert({
        organization_id: organizationId,
        caller_phone: validatedData.phoneNumber,
        status: 'initiated',
        metadata: {
          triggered_via: 'webhook',
          customer_name: validatedData.customerName,
          context: validatedData.context,
          webhook_token: webhookToken.substring(0, 8) + '...', // Log partial token for debugging
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
    
    // TODO: Integrate with actual call triggering service (Twilio, etc.)
    // For now, we'll just simulate the call being triggered
    
    // In production, you would:
    // 1. Decrypt the Twilio auth token
    // 2. Use Twilio SDK to initiate the call
    // 3. Pass the agent configuration and context
    // 4. Update the call record with Twilio call SID
    
    // Simulated response for now
    const response = {
      success: true,
      message: 'Call initiated successfully',
      callId: call.id,
      organizationId: organizationId,
      phoneNumber: validatedData.phoneNumber,
      processingTime: Date.now() - startTime
    }
    
    // Update call status to 'connecting'
    await supabase
      .from('calls')
      .update({ status: 'connecting' })
      .eq('id', call.id)
    
    return NextResponse.json(response, { status: 200 })
    
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
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Secret, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}