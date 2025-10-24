import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/db/admin';
import { FeatureFlagService } from '@/lib/feature-flags/service';
import { logVoiceUsage } from '@/lib/billing/voice-usage';
import type { Database } from '@/supabase/database.types';
import { resolveSupabaseUser } from '@/lib/supabase/session';

type AgentRow = Database['public']['Tables']['agent_configurations']['Row'];
type AgentVoiceConfig = Pick<
  AgentRow,
  | 'id'
  | 'organization_id'
  | 'voice'
  | 'voice_provider'
  | 'voice_fallback_enabled'
  | 'elevenlabs_voice_id'
  | 'elevenlabs_voice_settings'
>;

const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

type TokenRequestBody = {
  agentId?: string;
  organizationId?: string;
  systemPrompt?: string;
  language?: string;
};

type VoiceMetadata =
  | {
      provider: 'openai';
      voice: string;
    }
  | {
      provider: 'elevenlabs';
      voiceId: string;
      voiceSettings?: unknown;
      modelId: string;
      sessionId: string;
    };

async function parseRequest(
  req: NextRequest,
): Promise<TokenRequestBody & Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object') {
      return body as TokenRequestBody & Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON
  }
  return {};
}

function buildInstructions(prompt?: string, language?: string) {
  const basePrompt =
    prompt && prompt.trim().length
      ? prompt.trim()
      : 'You are a helpful scheduling assistant.';

  if (language && language.trim().length) {
    return `${basePrompt}\n\nAlways and only speak in ${language.trim()}. Keep responses concise and conversational.`;
  }

  return basePrompt;
}

async function createOpenAISession(params: {
  apiKey: string;
  voice: string;
  instructions: string;
}) {
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'realtime=v1',
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      modalities: ['text', 'audio'],
      voice: params.voice,
      instructions: params.instructions,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const detail =
      typeof data === 'object' && data
        ? data.error ?? data
        : 'Unknown error creating OpenAI session';
    throw new Error(
      typeof detail === 'string'
        ? detail
        : JSON.stringify(detail, null, 2),
    );
  }

  return data as Record<string, unknown>;
}

async function loadAgent(agentId: string): Promise<AgentVoiceConfig | null> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('agent_configurations')
      .select(
        [
          'id',
          'organization_id',
          'voice',
          'voice_provider',
          'voice_fallback_enabled',
          'elevenlabs_voice_id',
          'elevenlabs_voice_settings',
        ].join(', '),
      )
      .eq('id', agentId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load agent configuration', error.message);
      return null;
    }

    return (data as AgentVoiceConfig) ?? null;
  } catch (error) {
    console.warn('Failed to load agent configuration', error);
    return null;
  }
}

async function resolveDefaultAgent(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
): Promise<AgentVoiceConfig | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.organization_id) return null;

  const { data: agent } = await supabase
    .from('agent_configurations')
    .select(
      [
        'id',
        'organization_id',
        'voice',
        'voice_provider',
        'voice_fallback_enabled',
        'elevenlabs_voice_id',
        'elevenlabs_voice_settings',
      ].join(', '),
    )
    .eq('organization_id', membership.organization_id)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  return (agent as AgentVoiceConfig) ?? null;
}

function buildElevenLabsMetadata(agent: AgentVoiceConfig): VoiceMetadata | null {
  if (!agent.elevenlabs_voice_id) {
    return null;
  }

  return {
    provider: 'elevenlabs',
    voiceId: agent.elevenlabs_voice_id,
    voiceSettings: agent.elevenlabs_voice_settings ?? undefined,
    modelId: 'eleven_turbo_v2_5',
    sessionId: randomUUID(),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await parseRequest(req);

  const user = await resolveSupabaseUser(req, supabase);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
  const explicitOrgId =
    typeof body.organizationId === 'string' ? body.organizationId : undefined;
  const systemPrompt =
    typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined;
  const language =
    typeof body.language === 'string' ? body.language : undefined;

  let agent: AgentVoiceConfig | null = null;

  if (agentId) {
    console.log('[realtime.token] request', { agentId, explicitOrgId });
    agent = await loadAgent(agentId);
    if (!agent) {
      console.warn('[realtime.token] agent not found or inaccessible', { agentId });
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 },
      );
    }

    if (agent.organization_id) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', agent.organization_id)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json(
          { error: 'Organization access denied' },
          { status: 403 },
        );
      }
    }
  } else {
    agent = await resolveDefaultAgent(supabase);
  }

  const organizationId = explicitOrgId ?? agent?.organization_id;
  const voice = agent?.voice ?? 'sage';
  const instructions = buildInstructions(systemPrompt, language);

  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 },
    );
  }

  let voiceMetadata: VoiceMetadata = {
    provider: 'openai',
    voice,
  };

  const wantsElevenLabs = agent?.voice_provider === 'elevenlabs';

  if (wantsElevenLabs) {
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required for ElevenLabs voices' },
        { status: 400 },
      );
    }

    const flagEnabled = await FeatureFlagService.isEnabled(
      organizationId,
      'elevenlabs_voices',
      supabase,
    );

    if (flagEnabled.enabled) {
      const hasSubscription = await FeatureFlagService.hasActiveSubscription(
        organizationId,
        'elevenlabs_voices',
        supabase,
      );

      if (hasSubscription) {
        const metadata = buildElevenLabsMetadata(agent);
        if (metadata) {
          voiceMetadata = metadata;
        } else if (!agent.voice_fallback_enabled) {
          return NextResponse.json(
            { error: 'Agent lacks ElevenLabs configuration' },
            { status: 400 },
          );
        }
      } else if (!agent.voice_fallback_enabled) {
        return NextResponse.json(
          {
            error: 'Premium voices not available',
            requiresUpgrade: true,
            upgradeUrl: '/settings/billing?addon=elevenlabs_voices',
          },
          { status: 403 },
        );
      }
    } else if (!agent.voice_fallback_enabled) {
      return NextResponse.json(
        {
          error: 'Premium voices not available',
          requiresUpgrade: false,
        },
        { status: 403 },
      );
    }
  }

  try {
    const session = await createOpenAISession({
      apiKey: openAIApiKey,
      voice,
      instructions,
    });

    const sessionId =
      (typeof session?.id === 'string' && session.id.length > 0
        ? session.id
        : typeof session?.session_id === 'string'
          ? session.session_id
          : randomUUID());

    if (organizationId) {
      await logVoiceUsage({
        organizationId,
        agentId: agent?.id ?? null,
        provider: (voiceMetadata?.provider ?? 'openai') as 'openai' | 'elevenlabs',
        voiceId:
          voiceMetadata?.provider === 'elevenlabs'
            ? (voiceMetadata.voiceId ?? null)
            : voice ?? null,
        sessionId,
      });
    }

    return NextResponse.json({
      ...session,
      voice_metadata: voiceMetadata,
    });
  } catch (error) {
    console.error('Failed to create OpenAI realtime session', error);
    return NextResponse.json(
      {
        error: 'Failed to create Realtime session',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
