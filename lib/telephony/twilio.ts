import type { TelephonyAdapter } from '../adapters/types'
import twilio from 'twilio'
import crypto from 'crypto'

export interface TwilioConfig {
  accountSid: string
  authToken: string
  phoneNumber: string
}

export class TwilioTelephonyAdapter implements TelephonyAdapter {
  private client: twilio.Twilio | null = null
  private config: TwilioConfig | null = null
  private currentCallSid: string | null = null

  constructor(config?: TwilioConfig) {
    if (config) {
      this.config = config
      this.client = twilio(config.accountSid, config.authToken)
    }
  }

  setConfig(config: TwilioConfig) {
    this.config = config
    this.client = twilio(config.accountSid, config.authToken)
  }

  async startInboundSession() {
    // Inbound calls are handled via Twilio webhooks
    // The media stream is established through the TwiML response
    throw new Error('Inbound sessions are initiated via Twilio webhooks')
  }

  async startOutboundCall(to: string, options?: {
    baseUrl?: string
    organizationId?: string
    agentId?: string
    voice?: string
  }): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('Twilio client not configured')
    }

    const baseUrl = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      throw new Error('Base URL is required for outbound calls')
    }

    // Create TwiML for the call. Prefer external WS bridge if configured, otherwise use edge endpoint.
    // The assistant will speak the greeting first via the media bridge.
    const extWsBase = process.env.TWILIO_STREAM_WSS_URL // e.g., wss://<ngrok-domain>
    const streamUrl = extWsBase && /^wss:\/\//i.test(extWsBase)
      ? `${extWsBase.replace(/\/$/, '')}/twilio-media`
      : `wss://${new URL(baseUrl).host}/api/twilio/media-stream`
    const voice = options?.voice || 'sage'
    // Auth token for stream protection (5 min TTL)
    const authSecret = process.env.STREAM_AUTH_SECRET || ''
    const now = Math.floor(Date.now() / 1000)
    const tokenPayload = {
      organizationId: options?.organizationId || '',
      agentId: options?.agentId || 'default',
      iat: now,
      exp: now + 5 * 60,
      nonce: crypto.randomBytes(8).toString('hex'),
    }
    const sessionId = crypto.randomUUID()
    const toB64Url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const payloadJson = JSON.stringify(tokenPayload)
    const payloadB64 = toB64Url(Buffer.from(payloadJson, 'utf8'))
    const sig = authSecret ? toB64Url(crypto.createHmac('sha256', authSecret).update(payloadB64).digest()) : ''
    const authToken = `${payloadB64}.${sig}`
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="organizationId" value="${options?.organizationId || ''}" />
      <Parameter name="agentId" value="${options?.agentId || 'default'}" />
      <Parameter name="direction" value="outbound" />
      <Parameter name="auth" value="${authToken}" />
      <Parameter name="voice" value="${voice}" />
      <Parameter name="sessionId" value="${sessionId}" />
    </Stream>
  </Connect>
</Response>`

    try {
      const call = await this.client.calls.create({
        to,
        from: this.config.phoneNumber,
        twiml,
        statusCallback: `${baseUrl}/api/webhook/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: false,
      })

      this.currentCallSid = call.sid
      // Return void to match interface
    } catch (error) {
      console.error('Error creating outbound call:', error)
      throw new Error(`Failed to create outbound call: ${error.message}`)
    }
  }
  
  // Add method to get current call SID
  getCurrentCallSid(): string | null {
    return this.currentCallSid
  }

  async hangup(callSid?: string) {
    if (!this.client) {
      throw new Error('Twilio client not configured')
    }

    const sid = callSid || this.currentCallSid
    if (!sid) {
      throw new Error('No call SID provided or found')
    }

    try {
      await this.client.calls(sid).update({ status: 'completed' })
      if (sid === this.currentCallSid) {
        this.currentCallSid = null
      }
    } catch (error) {
      console.error('Error hanging up call:', error)
      throw new Error(`Failed to hang up call: ${error.message}`)
    }
  }
}

// Export a singleton instance for backward compatibility
export const TwilioTelephonyAdapterInstance = new TwilioTelephonyAdapter()
