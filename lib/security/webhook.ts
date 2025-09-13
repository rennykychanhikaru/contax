/**
 * Webhook security utilities for request validation and rate limiting
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { decrypt, secureCompare, verifyWebhookSignature } from './crypto'

// Types for webhook validation
export interface WebhookValidationResult {
  valid: boolean
  organizationId?: string
  error?: string
  shouldLogFailure?: boolean
}

export interface WebhookOrganization {
  id: string
  name: string
  webhook_token: string
  webhook_secret_encrypted: string
  webhook_enabled: boolean
  webhook_failures: number
  webhook_rate_limit_per_minute: number
  webhook_rate_limit_per_hour: number
}

export interface WebhookLogEntry {
  organization_id: string
  webhook_token: string
  ip_address: string
  user_agent: string | null
  request_headers: Record<string, any>
  request_body: any
  response_status: number
  error_message?: string
  processing_time_ms: number
  success: boolean
}

/**
 * Extract client IP address from request
 * Handles various proxy headers
 */
function getClientIp(req: NextRequest): string {
  // Check various headers that might contain the real IP
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for may contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim()
  }
  
  // Other common headers
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  
  const clientIp = req.headers.get('x-client-ip')
  if (clientIp) return clientIp
  
  // Fallback to remote address (may not be available in some environments)
  return '0.0.0.0'
}

/**
 * Validate webhook request from an organization
 * @param token - Webhook token from URL
 * @param request - Next.js request object
 * @param requestBody - Parsed request body
 * @returns Validation result with organization details
 */
export async function validateWebhookRequest(
  token: string,
  request: NextRequest,
  requestBody: any
): Promise<WebhookValidationResult> {
  const startTime = Date.now()
  
  // Initialize Supabase client with service role for admin access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  
  try {
    // Validate token format (should be URL-safe base64)
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return {
        valid: false,
        error: 'Invalid webhook token format',
        shouldLogFailure: false
      }
    }
    
    // Look up organization by webhook token
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('webhook_token', token)
      .single()
    
    if (orgError || !org) {
      return {
        valid: false,
        error: 'Invalid webhook token',
        shouldLogFailure: true
      }
    }
    
    const organization = org as WebhookOrganization
    
    // Check if webhook is enabled
    if (!organization.webhook_enabled) {
      await logWebhookAttempt(supabase, {
        organization_id: organization.id,
        webhook_token: token,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
        request_headers: Object.fromEntries(request.headers.entries()),
        request_body: requestBody,
        response_status: 403,
        error_message: 'Webhook disabled',
        processing_time_ms: Date.now() - startTime,
        success: false
      })
      
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Webhook is disabled for this organization',
        shouldLogFailure: false
      }
    }
    
    // Check if webhook has been auto-disabled due to failures
    if (organization.webhook_failures >= (parseInt(process.env.WEBHOOK_MAX_FAILURES || '5'))) {
      await logWebhookAttempt(supabase, {
        organization_id: organization.id,
        webhook_token: token,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
        request_headers: Object.fromEntries(request.headers.entries()),
        request_body: requestBody,
        response_status: 403,
        error_message: 'Webhook auto-disabled due to failures',
        processing_time_ms: Date.now() - startTime,
        success: false
      })
      
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Webhook has been auto-disabled due to multiple failures',
        shouldLogFailure: false
      }
    }
    
    // Verify webhook secret
    const providedSecret = request.headers.get('x-webhook-secret') || 
                          request.headers.get('authorization')?.replace('Bearer ', '') ||
                          requestBody.webhook_secret
    
    if (!providedSecret) {
      await incrementWebhookFailures(supabase, organization.id)
      await logWebhookAttempt(supabase, {
        organization_id: organization.id,
        webhook_token: token,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
        request_headers: Object.fromEntries(request.headers.entries()),
        request_body: requestBody,
        response_status: 401,
        error_message: 'Missing webhook secret',
        processing_time_ms: Date.now() - startTime,
        success: false
      })
      
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Missing webhook secret',
        shouldLogFailure: true
      }
    }
    
    // Decrypt stored secret and compare
    let decryptedSecret: string
    try {
      decryptedSecret = await decrypt(organization.webhook_secret_encrypted)
    } catch (decryptError) {
      console.error('Failed to decrypt webhook secret:', decryptError)
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Internal security error',
        shouldLogFailure: false
      }
    }
    
    // Use constant-time comparison to prevent timing attacks
    if (!secureCompare(providedSecret, decryptedSecret)) {
      await incrementWebhookFailures(supabase, organization.id)
      await logWebhookAttempt(supabase, {
        organization_id: organization.id,
        webhook_token: token,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
        request_headers: Object.fromEntries(request.headers.entries()),
        request_body: requestBody,
        response_status: 401,
        error_message: 'Invalid webhook secret',
        processing_time_ms: Date.now() - startTime,
        success: false
      })
      
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Invalid webhook secret',
        shouldLogFailure: true
      }
    }
    
    // Check rate limits
    const { data: rateLimitOk, error: rateLimitError } = await supabase
      .rpc('check_webhook_rate_limit', {
        p_organization_id: organization.id,
        p_minute_limit: organization.webhook_rate_limit_per_minute,
        p_hour_limit: organization.webhook_rate_limit_per_hour
      })
    
    if (rateLimitError || !rateLimitOk) {
      await logWebhookAttempt(supabase, {
        organization_id: organization.id,
        webhook_token: token,
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
        request_headers: Object.fromEntries(request.headers.entries()),
        request_body: requestBody,
        response_status: 429,
        error_message: 'Rate limit exceeded',
        processing_time_ms: Date.now() - startTime,
        success: false
      })
      
      return {
        valid: false,
        organizationId: organization.id,
        error: 'Rate limit exceeded',
        shouldLogFailure: false
      }
    }
    
    // Reset failure count on successful validation
    if (organization.webhook_failures > 0) {
      await supabase
        .from('organizations')
        .update({ 
          webhook_failures: 0,
          webhook_last_failure_at: null
        })
        .eq('id', organization.id)
    }
    
    // Log successful validation
    await logWebhookAttempt(supabase, {
      organization_id: organization.id,
      webhook_token: token,
      ip_address: getClientIp(request),
      user_agent: request.headers.get('user-agent'),
      request_headers: Object.fromEntries(request.headers.entries()),
      request_body: requestBody,
      response_status: 200,
      processing_time_ms: Date.now() - startTime,
      success: true
    })
    
    return {
      valid: true,
      organizationId: organization.id
    }
    
  } catch (error) {
    console.error('Webhook validation error:', error)
    return {
      valid: false,
      error: 'Internal validation error',
      shouldLogFailure: false
    }
  }
}

/**
 * Log webhook attempt for audit trail
 */
async function logWebhookAttempt(
  supabase: any,
  logEntry: WebhookLogEntry
): Promise<void> {
  try {
    // Don't log sensitive data in production
    if (process.env.NODE_ENV === 'production') {
      // Redact sensitive headers
      const sanitizedHeaders = { ...logEntry.request_headers }
      delete sanitizedHeaders['authorization']
      delete sanitizedHeaders['x-webhook-secret']
      delete sanitizedHeaders['cookie']
      
      // Redact sensitive body fields
      const sanitizedBody = logEntry.request_body ? { ...logEntry.request_body } : {}
      delete sanitizedBody['webhook_secret']
      delete sanitizedBody['password']
      delete sanitizedBody['token']
      
      logEntry.request_headers = sanitizedHeaders
      logEntry.request_body = sanitizedBody
    }
    
    await supabase
      .from('webhook_logs')
      .insert(logEntry)
  } catch (error) {
    console.error('Failed to log webhook attempt:', error)
    // Don't throw - logging failure shouldn't break the webhook
  }
}

/**
 * Increment webhook failure count
 */
async function incrementWebhookFailures(
  supabase: any,
  organizationId: string
): Promise<void> {
  try {
    await supabase.rpc('increment', {
      table_name: 'organizations',
      column_name: 'webhook_failures',
      row_id: organizationId
    })
    
    await supabase
      .from('organizations')
      .update({ webhook_last_failure_at: new Date().toISOString() })
      .eq('id', organizationId)
    
    // Check if we should auto-disable
    const { data: org } = await supabase
      .from('organizations')
      .select('webhook_failures')
      .eq('id', organizationId)
      .single()
    
    const maxFailures = parseInt(process.env.WEBHOOK_MAX_FAILURES || '5')
    if (org && org.webhook_failures >= maxFailures) {
      await supabase
        .from('organizations')
        .update({ 
          webhook_enabled: false,
          webhook_auto_disabled_at: new Date().toISOString()
        })
        .eq('id', organizationId)
    }
  } catch (error) {
    console.error('Failed to increment webhook failures:', error)
  }
}

/**
 * Validate webhook signature for services that support it (GitHub, Stripe style)
 */
export function validateWebhookHMAC(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyWebhookSignature(payload, signature, secret)
}