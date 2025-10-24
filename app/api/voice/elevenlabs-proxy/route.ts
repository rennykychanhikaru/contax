import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FeatureFlagService } from '@/lib/feature-flags/service';
import { getAdminClient } from '@/lib/db/admin';
import type { Database } from '@/supabase/database.types';
import { resolveSupabaseUser } from '@/lib/supabase/session';

type ElevenLabsProxyRequest = {
  organizationId?: string;
  agentId?: string;
  action?: 'generate' | 'list_voices';
  text?: string;
  voiceId?: string;
  voiceSettings?: Record<string, unknown>;
};

type AgentRow = Database['public']['Tables']['agent_configurations']['Row'];
type AgentVoiceConfig = Pick<
  AgentRow,
  | 'id'
  | 'organization_id'
  | 'voice_provider'
  | 'elevenlabs_voice_id'
  | 'elevenlabs_voice_settings'
>;

const DEFAULT_MODEL = 'eleven_turbo_v2_5';

async function parseRequest(
  req: NextRequest,
): Promise<ElevenLabsProxyRequest> {
  try {
    const payload = await req.json();
    if (payload && typeof payload === 'object') {
      return payload as ElevenLabsProxyRequest;
    }
  } catch {
    // Ignore parse failure
  }
  return {};
}

async function loadAgent(
  agentId: string,
): Promise<AgentVoiceConfig | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('agent_configurations')
    .select(
      'id, organization_id, voice_provider, elevenlabs_voice_id, elevenlabs_voice_settings',
    )
    .eq('id', agentId)
    .returns<AgentVoiceConfig>()
    .single();

  if (error) {
    console.warn('Failed to load agent for ElevenLabs proxy', error.message);
    return null;
  }

  return data as AgentVoiceConfig;
}

async function listVoices(apiKey: string) {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey,
    },
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: 'Failed to load ElevenLabs voices', detail },
      { status: response.status },
    );
  }

  const voices = await response.json();
  return NextResponse.json({ voices });
}

async function generatePreview(params: {
  apiKey: string;
  voiceId: string;
  text: string;
  voiceSettings?: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': params.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text.slice(0, 600),
        model_id: DEFAULT_MODEL,
        voice_settings: params.voiceSettings,
        output_format: 'mp3_44100_128',
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: 'ElevenLabs TTS failed', detail },
      { status: response.status },
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return NextResponse.json({
    audio: buffer.toString('base64'),
    contentType: response.headers.get('content-type') ?? 'audio/mpeg',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await parseRequest(req);

  const organizationId =
    typeof body.organizationId === 'string' ? body.organizationId : undefined;
  const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
  const action = body.action;

  if (!organizationId || !agentId || !action) {
    return NextResponse.json(
      { error: 'organizationId, agentId, and action are required' },
      { status: 400 },
    );
  }

  const user = await resolveSupabaseUser(req, supabase);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
  }

  const agent = await loadAgent(agentId);
  if (!agent || agent.organization_id !== organizationId) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const flagResult = await FeatureFlagService.isEnabled(
    organizationId,
    'elevenlabs_voices',
    supabase,
  );

  if (!flagResult.enabled) {
    return NextResponse.json(
      { error: 'Premium voices disabled', requiresUpgrade: false },
      { status: 403 },
    );
  }

  const hasSubscription = await FeatureFlagService.hasActiveSubscription(
    organizationId,
    'elevenlabs_voices',
    supabase,
  );

  if (!hasSubscription) {
    return NextResponse.json(
      { error: 'Premium voice subscription required', requiresUpgrade: true },
      { status: 403 },
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ElevenLabs API key not configured' },
      { status: 500 },
    );
  }

  if (action === 'list_voices') {
    return listVoices(apiKey);
  }

  if (action === 'generate') {
    const text = typeof body.text === 'string' ? body.text : undefined;
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'text is required for generate action' },
        { status: 400 },
      );
    }

    const voiceId =
      typeof body.voiceId === 'string'
        ? body.voiceId
        : agent.elevenlabs_voice_id;

    if (!voiceId) {
      return NextResponse.json(
        { error: 'Voice ID missing for ElevenLabs preview' },
        { status: 400 },
      );
    }

    return generatePreview({
      apiKey,
      voiceId,
      text,
      voiceSettings:
        (body.voiceSettings as Record<string, unknown>) ??
        (agent.elevenlabs_voice_settings as Record<string, unknown> | null) ??
        undefined,
    });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
