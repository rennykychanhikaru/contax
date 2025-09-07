import type { TelephonyAdapter } from '../adapters/types'

// Twilio stubs for future PSTN integration.
// Later, implement Twilio <Stream> webhook and Media Streams gateway
// that bridges to OpenAI Realtime via WebRTC.

export const TwilioTelephonyAdapter: TelephonyAdapter = {
  async startInboundSession() {
    // TODO: initialize Twilio media stream session
    throw new Error('Twilio inbound session not implemented yet')
  },
  async startOutboundCall(_to: string) {
    // TODO: place outbound call via Twilio and attach media stream
    throw new Error('Twilio outbound call not implemented yet')
  },
  async hangup() {
    // TODO: end call
  }
}

