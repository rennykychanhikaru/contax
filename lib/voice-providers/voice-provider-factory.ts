import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/database.types';
import { FeatureFlagService } from '@/lib/feature-flags/service';
import {
  ElevenLabsClient,
  type ElevenLabsVoiceSettings,
} from '@/lib/voice-providers/elevenlabs/client';

export type VoiceProviderKind = 'openai' | 'elevenlabs';

export interface VoiceProviderClient {
  connect(
    onAudio: (audioChunk: Uint8Array) => void,
    onError?: (error: Error) => void,
  ): Promise<void>;
  sendText(text: string): Promise<void>;
  flush(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ElevenLabsProviderOptions {
  provider: 'elevenlabs';
  voiceId: string;
  apiKey: string;
  modelId?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
}

export interface OpenAIProviderOptions {
  provider: 'openai';
  voiceId: string;
  apiKey: string;
}

export type CreateVoiceProviderOptions =
  | ElevenLabsProviderOptions
  | OpenAIProviderOptions;

export class OpenAIVoiceClient implements VoiceProviderClient {
  constructor(
    private readonly config: { voiceId: string; apiKey: string },
  ) {}

  async connect(): Promise<void> {
    throw new Error(
      'OpenAI realtime voice client is handled by the existing realtime session workflow',
    );
  }

  async sendText(): Promise<void> {
    throw new Error(
      'OpenAI realtime voice client is handled by the existing realtime session workflow',
    );
  }

  async flush(): Promise<void> {
    // No-op; handled externally by realtime session.
  }

  async disconnect(): Promise<void> {
    // No-op; handled externally by realtime session.
  }

  get voiceId(): string {
    return this.config.voiceId;
  }
}

export type AgentVoiceRow = Pick<
  Database['public']['Tables']['agent_configurations']['Row'],
  | 'voice_provider'
  | 'voice'
  | 'elevenlabs_voice_id'
  | 'elevenlabs_voice_settings'
  | 'voice_fallback_enabled'
>;

export class VoiceProviderFactory {
  static create(options: CreateVoiceProviderOptions): VoiceProviderClient {
    if (options.provider === 'elevenlabs') {
      return new ElevenLabsClient({
        apiKey: options.apiKey,
        voiceId: options.voiceId,
        modelId: options.modelId,
        voiceSettings: options.voiceSettings,
      });
    }

    return new OpenAIVoiceClient({
      voiceId: options.voiceId,
      apiKey: options.apiKey,
    });
  }

  static async createFromAgent(
    supabase: SupabaseClient<Database>,
    agentId: string,
    organizationId: string,
  ): Promise<{ client: VoiceProviderClient; provider: VoiceProviderKind }> {
    const { data: agent, error } = await supabase
      .from('agent_configurations')
      .select(
        'voice_provider, voice, elevenlabs_voice_id, elevenlabs_voice_settings, voice_fallback_enabled',
      )
      .eq('id', agentId)
      .single();

    if (error) {
      throw new Error(`Failed to load agent configuration: ${error.message}`);
    }

    if (!agent) {
      throw new Error('Agent not found');
    }

    const voiceConfig = agent as AgentVoiceRow;

    if (voiceConfig.voice_provider === 'elevenlabs') {
      return this.buildElevenLabsClient(supabase, voiceConfig, organizationId);
    }

    return {
      provider: 'openai',
      client: this.createOpenAIProvider(voiceConfig),
    };
  }

  private static async buildElevenLabsClient(
    supabase: SupabaseClient<Database>,
    agent: AgentVoiceRow,
    organizationId: string,
  ): Promise<{ client: VoiceProviderClient; provider: VoiceProviderKind }> {
    const flagResult = await FeatureFlagService.isEnabled(
      organizationId,
      'elevenlabs_voices',
      supabase,
    );

    if (!flagResult.enabled) {
      if (agent.voice_fallback_enabled) {
        return {
          provider: 'openai',
          client: this.createOpenAIProvider(agent),
        };
      }

      throw new Error('Premium voices not enabled for this organization');
    }

    const hasSubscription = await FeatureFlagService.hasActiveSubscription(
      organizationId,
      'elevenlabs_voices',
      supabase,
    );

    if (!hasSubscription) {
      if (agent.voice_fallback_enabled) {
        return {
          provider: 'openai',
          client: this.createOpenAIProvider(agent),
        };
      }

      throw new Error('Premium voice subscription is required');
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    if (!agent.elevenlabs_voice_id) {
      if (agent.voice_fallback_enabled) {
        return {
          provider: 'openai',
          client: this.createOpenAIProvider(agent),
        };
      }

      throw new Error('Agent has no ElevenLabs voice configured');
    }

    const voiceSettings = (agent.elevenlabs_voice_settings ?? {}) as
      | ElevenLabsVoiceSettings
      | undefined;

    return {
      provider: 'elevenlabs',
      client: new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: agent.elevenlabs_voice_id,
        voiceSettings,
      }),
    };
  }

  private static createOpenAIProvider(agent: AgentVoiceRow): VoiceProviderClient {
    const voice = agent.voice ?? 'sage';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    return new OpenAIVoiceClient({
      apiKey,
      voiceId: voice,
    });
  }
}
