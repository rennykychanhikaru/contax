// Abstraction layer interfaces

export interface STTAdapter {
  // For Realtime, STT is implicit; interface kept for parity
  start?(): Promise<void>
  stop?(): Promise<void>
}

export interface TTSAdapter {
  // For Realtime, TTS is implicit; interface kept for parity
  setVoice?(voiceId: string): void
}

export interface TelephonyAdapter {
  // Twilio-ready interface; browser demo uses no-op
  startInboundSession?(): Promise<void>
  startOutboundCall?(to: string): Promise<void>
  hangup?(): Promise<void>
}

export interface AgentAdapter {
  connect(systemPrompt: string): Promise<void>
  disconnect(): Promise<void>
}

