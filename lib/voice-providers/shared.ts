export type AgentVoiceRow = Pick<
  Database['public']['Tables']['agent_configurations']['Row'],
  | 'voice_provider'
  | 'voice'
  | 'elevenlabs_voice_id'
  | 'elevenlabs_voice_settings'
  | 'voice_fallback_enabled'
>;