import { getAdminClient } from '@/lib/db/admin';
import type { Database } from '@/supabase/database.types';

export type VoiceProvider = 'openai' | 'elevenlabs';

export type LogVoiceUsageParams = {
  organizationId: string;
  agentId?: string | null;
  provider: VoiceProvider;
  voiceId?: string | null;
  sessionId: string;
  callId?: string | null;
  characterCount?: number;
  durationSeconds?: number;
  costCents?: number;
};

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export async function logVoiceUsage(params: LogVoiceUsageParams) {
  try {
    const supabase = getAdminClient();
    const payload: Database['public']['Tables']['voice_usage_logs']['Insert'] = {
      organization_id: params.organizationId,
      agent_id: params.agentId ?? null,
      voice_provider: params.provider,
      voice_id: params.voiceId ?? null,
      session_id: params.sessionId,
      call_id: isNonEmpty(params.callId) ? params.callId : null,
      character_count: params.characterCount ?? 0,
      duration_seconds: params.durationSeconds ?? 0,
      cost_cents: params.costCents ?? 0,
    };

    const { error } = await supabase.from('voice_usage_logs').insert(payload);
    if (error) {
      console.warn('[voice-usage] failed to log usage', error.message);
    }
  } catch (err) {
    console.warn('[voice-usage] unexpected error logging usage', err);
  }
}
