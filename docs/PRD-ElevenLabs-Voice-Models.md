# PRD: ElevenLabs Premium Voice Models (Feature-Flagged Add-On)

## Executive Summary

This PRD outlines the implementation of ElevenLabs voice models as a premium, feature-flagged add-on for Contax. Users will gain access to high-quality, natural-sounding voices through our application without knowing the underlying provider is ElevenLabs. The feature will be gated behind feature flags and subscription tiers, enabling us to monetize this as a premium add-on in the future.

## Background

### Current State

- Voice agent uses OpenAI Realtime API with built-in voices (alloy, echo, fable, onyx, nova, shimmer, sage)
- Voice configuration stored in `agent_configurations` table
- OpenAI μ-law passthrough for audio quality
- Voice selection happens at session creation (`/api/realtime/token/route.ts`)

### Problem Statement

- OpenAI voices, while functional, have a robotic quality that affects user experience
- Competitors offer more natural-sounding voice options
- Users want premium voice quality but we need to monetize this feature
- We need flexibility to enable/disable premium voices per organization or plan tier

### Goals

1. **Premium Experience**: Integrate ElevenLabs voices for superior audio quality
2. **White-Label Integration**: Users configure voices through our UI without ElevenLabs branding
3. **Feature Gating**: Implement robust feature flags for controlled rollout and monetization
4. **Subscription Integration**: Enable premium voices as a paid add-on
5. **Seamless Switching**: Support both OpenAI and ElevenLabs voices in the same agent workflow

### Non-Goals

- Replacing OpenAI Realtime API entirely
- Supporting other voice providers (this iteration)
- Custom voice cloning (future consideration)
- Real-time voice switching during a call

## Technical Architecture

### High-Level Flow

```
User Request → Feature Flag Check → Voice Provider Selection → Audio Stream
                                          ↓
                              OpenAI Realtime ← → ElevenLabs WebSocket
                                          ↓
                                   Twilio Bridge
```

### Components to Modify/Create

1. **Database Schema** (`supabase/migrations/`)
   - Feature flags table
   - Subscription features table
   - Agent voice provider configuration
   - Usage tracking for billing

2. **Agent Configuration** (`agent_configurations` table)
   - Add `voice_provider` field (enum: 'openai', 'elevenlabs')
   - Add `elevenlabs_voice_id` field
   - Add `elevenlabs_voice_settings` JSONB field

3. **Voice Agent Integration**
   - Abstract voice provider interface
   - ElevenLabs WebSocket client
   - Fallback logic for voice provider failures

4. **API Routes**
   - Feature flag evaluation endpoint
   - Voice provider selection logic
   - ElevenLabs session management

5. **UI Components**
   - Voice provider selector
   - ElevenLabs voice picker (with preview)
   - Premium feature indicator/upsell

## Detailed Design

### 1. Database Schema

#### Feature Flags System

```sql
-- Feature flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled_globally BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization-specific feature overrides
CREATE TABLE IF NOT EXISTS public.organization_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, feature_flag_id)
);

-- Subscription add-ons table
CREATE TABLE IF NOT EXISTS public.subscription_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL, -- 'elevenlabs_voices', 'advanced_analytics', etc.
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  billing_status TEXT, -- 'paid', 'trial', 'overdue'
  trial_ends_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking for billing
CREATE TABLE IF NOT EXISTS public.voice_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agent_configurations(id) ON DELETE SET NULL,
  voice_provider TEXT NOT NULL, -- 'openai', 'elevenlabs'
  voice_id TEXT,
  session_id TEXT,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  character_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_org_feature_flags_org ON public.organization_feature_flags(organization_id);
CREATE INDEX idx_subscription_addons_org ON public.subscription_addons(organization_id, addon_type);
CREATE INDEX idx_voice_usage_org_date ON public.voice_usage_logs(organization_id, created_at);
CREATE INDEX idx_voice_usage_provider ON public.voice_usage_logs(voice_provider, created_at);
```

#### Agent Configuration Updates

```sql
-- Add voice provider fields to agent_configurations
ALTER TABLE public.agent_configurations
ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'openai' CHECK (voice_provider IN ('openai', 'elevenlabs')),
ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT,
ADD COLUMN IF NOT EXISTS elevenlabs_voice_settings JSONB DEFAULT '{"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": true}',
ADD COLUMN IF NOT EXISTS voice_fallback_enabled BOOLEAN DEFAULT true;

-- Create index for voice provider queries
CREATE INDEX IF NOT EXISTS idx_agent_voice_provider ON public.agent_configurations(voice_provider, organization_id);
```

### 2. Feature Flag Service

**File: `lib/feature-flags/service.ts`**

```typescript
/**
 * Feature Flag Service
 * Centralized service for feature flag evaluation
 */
import { createClient } from '@/lib/supabase/server';

export type FeatureFlag =
  | 'elevenlabs_voices'
  | 'advanced_analytics'
  | 'custom_webhooks';
// Add more features here

interface FeatureFlagResult {
  enabled: boolean;
  reason: 'global' | 'organization' | 'disabled';
  metadata?: Record<string, unknown>;
}

export class FeatureFlagService {
  /**
   * Check if a feature is enabled for an organization
   */
  static async isEnabled(
    organizationId: string,
    featureName: FeatureFlag,
  ): Promise<FeatureFlagResult> {
    const supabase = await createClient();

    // 1. Get the feature flag definition
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('*')
      .eq('name', featureName)
      .single();

    if (!flag) {
      return { enabled: false, reason: 'disabled' };
    }

    // 2. Check organization-specific override
    const { data: orgFlag } = await supabase
      .from('organization_feature_flags')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('feature_flag_id', flag.id)
      .single();

    if (orgFlag) {
      return {
        enabled: orgFlag.enabled,
        reason: 'organization',
        metadata: orgFlag.metadata,
      };
    }

    // 3. Fall back to global setting
    return {
      enabled: flag.enabled_globally,
      reason: 'global',
    };
  }

  /**
   * Check if organization has active subscription for a feature
   */
  static async hasActiveSubscription(
    organizationId: string,
    addonType: string,
  ): Promise<boolean> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('subscription_addons')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('addon_type', addonType)
      .eq('status', 'active')
      .single();

    if (!data) return false;

    // Check if in trial and trial hasn't expired
    if (data.billing_status === 'trial' && data.trial_ends_at) {
      return new Date(data.trial_ends_at) > new Date();
    }

    // Check if paid and not overdue
    return data.billing_status === 'paid';
  }

  /**
   * Combined check: feature flag AND subscription
   */
  static async canUseFeature(
    organizationId: string,
    featureName: FeatureFlag,
  ): Promise<{
    allowed: boolean;
    reason: string;
    requiresUpgrade: boolean;
  }> {
    const flagResult = await this.isEnabled(organizationId, featureName);

    if (!flagResult.enabled) {
      return {
        allowed: false,
        reason: 'Feature not available',
        requiresUpgrade: false,
      };
    }

    // Map feature flags to addon types
    const addonTypeMap: Record<FeatureFlag, string> = {
      elevenlabs_voices: 'elevenlabs_voices',
      advanced_analytics: 'advanced_analytics',
      custom_webhooks: 'custom_webhooks',
    };

    const addonType = addonTypeMap[featureName];
    const hasSubscription = await this.hasActiveSubscription(
      organizationId,
      addonType,
    );

    if (!hasSubscription) {
      return {
        allowed: false,
        reason: 'Subscription required',
        requiresUpgrade: true,
      };
    }

    return {
      allowed: true,
      reason: 'Active subscription',
      requiresUpgrade: false,
    };
  }
}
```

### 3. ElevenLabs Integration

**File: `lib/voice-providers/elevenlabs/client.ts`**

```typescript
/**
 * ElevenLabs WebSocket Client
 * Handles real-time text-to-speech streaming via ElevenLabs API
 */

export interface ElevenLabsVoiceSettings {
  stability?: number; // 0-1, default 0.5
  similarity_boost?: number; // 0-1, default 0.75
  style?: number; // 0-1, default 0
  use_speaker_boost?: boolean; // default true
}

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string; // default 'eleven_turbo_v2_5'
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: 'ulaw_8000' | 'pcm_16000' | 'pcm_24000';
}

export class ElevenLabsClient {
  private ws: WebSocket | null = null;
  private config: ElevenLabsConfig;
  private onAudio?: (audioChunk: Uint8Array) => void;
  private onError?: (error: Error) => void;

  constructor(config: ElevenLabsConfig) {
    this.config = {
      modelId: 'eleven_turbo_v2_5',
      outputFormat: 'ulaw_8000',
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
      ...config,
    };
  }

  async connect(
    onAudio: (audioChunk: Uint8Array) => void,
    onError?: (error: Error) => void,
  ): Promise<void> {
    this.onAudio = onAudio;
    this.onError = onError;

    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream-input?model_id=${this.config.modelId}&output_format=${this.config.outputFormat}`;

    this.ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': this.config.apiKey,
      },
    });

    return new Promise((resolve, reject) => {
      this.ws!.onopen = () => {
        // Send initial configuration
        this.ws!.send(
          JSON.stringify({
            text: ' ', // Initial space to start stream
            voice_settings: this.config.voiceSettings,
            generation_config: {
              chunk_length_schedule: [120, 160, 250, 290],
            },
          }),
        );
        resolve();
      };

      this.ws!.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);

          if (response.audio) {
            // Audio is base64 encoded
            const audioData = Buffer.from(response.audio, 'base64');
            this.onAudio?.(new Uint8Array(audioData));
          }

          if (response.error) {
            this.onError?.(new Error(response.error));
          }
        } catch (err) {
          this.onError?.(err as Error);
        }
      };

      this.ws!.onerror = (err) => {
        reject(err);
        this.onError?.(new Error('WebSocket error'));
      };

      this.ws!.onclose = () => {
        this.ws = null;
      };
    });
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(
      JSON.stringify({
        text: text,
        try_trigger_generation: true,
      }),
    );
  }

  async flush(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send empty string to flush remaining audio
    this.ws.send(
      JSON.stringify({
        text: '',
      }),
    );
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

### 4. Voice Provider Abstraction

**File: `lib/voice-providers/types.ts`**

```typescript
/**
 * Voice Provider Interface
 * Abstract interface for different voice providers (OpenAI, ElevenLabs)
 */

export type VoiceProvider = 'openai' | 'elevenlabs';

export interface VoiceProviderConfig {
  provider: VoiceProvider;
  voiceId: string;
  apiKey: string;
  settings?: Record<string, unknown>;
}

export interface VoiceProviderClient {
  connect(): Promise<void>;
  sendText(text: string): Promise<void>;
  disconnect(): Promise<void>;
  onAudio(callback: (chunk: Uint8Array) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface VoiceSession {
  provider: VoiceProvider;
  sessionId: string;
  organizationId: string;
  agentId?: string;
  startedAt: Date;
  endedAt?: Date;
}
```

**File: `lib/voice-providers/factory.ts`**

```typescript
/**
 * Voice Provider Factory
 * Creates appropriate voice provider client based on configuration
 */
import { OpenAIRealtimeAgent } from '@/lib/agent/openai-realtime';
import { ElevenLabsClient } from './elevenlabs/client';
import type { VoiceProviderClient, VoiceProviderConfig } from './types';

export class VoiceProviderFactory {
  static async create(
    config: VoiceProviderConfig,
  ): Promise<VoiceProviderClient> {
    switch (config.provider) {
      case 'openai':
        return new OpenAIRealtimeAdapter({
          apiKey: config.apiKey,
          voice: config.voiceId,
          ...config.settings,
        });

      case 'elevenlabs':
        return new ElevenLabsAdapter({
          apiKey: config.apiKey,
          voiceId: config.voiceId,
          voiceSettings: config.settings,
        });

      default:
        throw new Error(`Unknown voice provider: ${config.provider}`);
    }
  }

  static async createFromAgent(
    agentId: string,
    organizationId: string,
  ): Promise<VoiceProviderClient> {
    // Fetch agent configuration
    const supabase = await createClient();
    const { data: agent } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('id', agentId)
      .single();

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Check feature flag for ElevenLabs
    if (agent.voice_provider === 'elevenlabs') {
      const canUse = await FeatureFlagService.canUseFeature(
        organizationId,
        'elevenlabs_voices',
      );

      if (!canUse.allowed) {
        // Fall back to OpenAI if subscription not active
        if (agent.voice_fallback_enabled) {
          console.warn('ElevenLabs not available, falling back to OpenAI');
          return this.createOpenAIProvider(agent);
        }
        throw new Error(canUse.reason);
      }

      return this.create({
        provider: 'elevenlabs',
        voiceId: agent.elevenlabs_voice_id!,
        apiKey: process.env.ELEVENLABS_API_KEY!,
        settings: agent.elevenlabs_voice_settings,
      });
    }

    return this.createOpenAIProvider(agent);
  }

  private static createOpenAIProvider(agent: any): VoiceProviderClient {
    return this.create({
      provider: 'openai',
      voiceId: agent.voice || 'sage',
      apiKey: process.env.OPENAI_API_KEY!,
      settings: {
        temperature: agent.temperature,
        maxTokens: agent.max_tokens,
      },
    });
  }
}
```

### 5. API Route Updates

**File: `app/api/realtime/token/route.ts` (Updated)**

```typescript
export async function POST(req: NextRequest) {
  const requestBody = await req.json();
  const { agentId, organizationId } = requestBody;

  if (!organizationId) {
    return NextResponse.json(
      { error: 'organizationId required' },
      { status: 400 },
    );
  }

  // Fetch agent configuration
  const supabase = await createClient();
  const { data: agent } = await supabase
    .from('agent_configurations')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Check if using ElevenLabs
  if (agent.voice_provider === 'elevenlabs') {
    const canUse = await FeatureFlagService.canUseFeature(
      organizationId,
      'elevenlabs_voices',
    );

    if (!canUse.allowed) {
      if (agent.voice_fallback_enabled) {
        // Fall back to OpenAI
        return createOpenAISession(agent, requestBody);
      }

      return NextResponse.json(
        {
          error: 'Premium voices not available',
          requiresUpgrade: canUse.requiresUpgrade,
          upgradeUrl: '/settings/billing?addon=elevenlabs_voices',
        },
        { status: 403 },
      );
    }

    // Create ElevenLabs session
    return createElevenLabsSession(agent, requestBody);
  }

  // Default to OpenAI
  return createOpenAISession(agent, requestBody);
}

async function createElevenLabsSession(agent: any, requestBody: any) {
  // Return configuration for client to create ElevenLabs WebSocket
  return NextResponse.json({
    provider: 'elevenlabs',
    voiceId: agent.elevenlabs_voice_id,
    voiceSettings: agent.elevenlabs_voice_settings,
    // DO NOT expose API key - client will request through secure endpoint
    sessionId: crypto.randomUUID(),
    modelId: 'eleven_turbo_v2_5',
  });
}

async function createOpenAISession(agent: any, requestBody: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 },
    );
  }

  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'realtime=v1',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      modalities: ['text', 'audio'],
      voice: agent.voice || 'sage',
      instructions: requestBody.systemPrompt || agent.prompt,
    }),
  });

  const data = await response.json();

  return NextResponse.json({
    provider: 'openai',
    ...data,
  });
}
```

**File: `app/api/voice/elevenlabs-proxy/route.ts` (New)**

```typescript
/**
 * Secure proxy for ElevenLabs API
 * Prevents exposing API key to client
 */
import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagService } from '@/lib/feature-flags/service';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { organizationId, agentId, action, text } = await req.json();

  if (!organizationId || !agentId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  // Verify feature access
  const canUse = await FeatureFlagService.canUseFeature(
    organizationId,
    'elevenlabs_voices',
  );

  if (!canUse.allowed) {
    return NextResponse.json(
      { error: canUse.reason, requiresUpgrade: canUse.requiresUpgrade },
      { status: 403 },
    );
  }

  // Get agent configuration
  const supabase = await createClient();
  const { data: agent } = await supabase
    .from('agent_configurations')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent || agent.voice_provider !== 'elevenlabs') {
    return NextResponse.json({ error: 'Invalid agent' }, { status: 400 });
  }

  // Proxy to ElevenLabs API
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ElevenLabs not configured' },
      { status: 500 },
    );
  }

  // Handle different actions
  switch (action) {
    case 'generate':
      return generateSpeech(apiKey, agent, text);
    case 'list_voices':
      return listVoices(apiKey);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

async function generateSpeech(apiKey: string, agent: any, text: string) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${agent.elevenlabs_voice_id}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: agent.elevenlabs_voice_settings,
        output_format: 'ulaw_8000',
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json(
      { error: 'ElevenLabs API error', details: error },
      { status: response.status },
    );
  }

  // Stream the audio back
  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/basic',
      'Transfer-Encoding': 'chunked',
    },
  });
}

async function listVoices(apiKey: string) {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey,
    },
  });

  const data = await response.json();

  // Filter to only include relevant information
  const voices = data.voices?.map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    description: v.description,
    preview_url: v.preview_url,
    labels: v.labels,
  }));

  return NextResponse.json({ voices });
}
```

### 6. UI Components

**File: `components/voice-settings/VoiceProviderSelector.tsx` (New)**

```tsx
'use client';

import { Crown, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface VoiceProviderSelectorProps {
  agentId: string;
  organizationId: string;
  currentProvider: 'openai' | 'elevenlabs';
  currentVoiceId: string;
  onUpdate: (provider: string, voiceId: string, settings?: any) => void;
}

export function VoiceProviderSelector({
  agentId,
  organizationId,
  currentProvider,
  currentVoiceId,
  onUpdate,
}: VoiceProviderSelectorProps) {
  const [provider, setProvider] = useState(currentProvider);
  const [hasAccess, setHasAccess] = useState(false);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);
  const [openaiVoices] = useState([
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and friendly' },
    { id: 'fable', name: 'Fable', description: 'Expressive storyteller' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Bright and energetic' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft and calm' },
    { id: 'sage', name: 'Sage', description: 'Wise and measured' },
  ]);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<any[]>([]);

  useEffect(() => {
    checkFeatureAccess();
    if (provider === 'elevenlabs') {
      loadElevenLabsVoices();
    }
  }, [provider]);

  async function checkFeatureAccess() {
    const res = await fetch('/api/feature-flags/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        feature: 'elevenlabs_voices',
      }),
    });
    const data = await res.json();
    setHasAccess(data.allowed);
    setRequiresUpgrade(data.requiresUpgrade);
  }

  async function loadElevenLabsVoices() {
    const res = await fetch('/api/voice/elevenlabs-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        agentId,
        action: 'list_voices',
      }),
    });
    const data = await res.json();
    setElevenlabsVoices(data.voices || []);
  }

  function handleProviderChange(newProvider: 'openai' | 'elevenlabs') {
    if (newProvider === 'elevenlabs' && !hasAccess) {
      // Show upgrade prompt
      return;
    }
    setProvider(newProvider);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Voice Provider</label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">Standard Voices</SelectItem>
            <SelectItem value="elevenlabs" disabled={!hasAccess}>
              <div className="flex items-center gap-2">
                Premium Voices
                <Crown className="h-3 w-3 text-yellow-500" />
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {provider === 'elevenlabs' && !hasAccess && (
        <Alert>
          <Crown className="h-4 w-4 text-yellow-500" />
          <AlertDescription>
            Premium voices require an active subscription.
            <Button
              variant="link"
              className="px-2"
              onClick={() =>
                (window.location.href =
                  '/settings/billing?addon=elevenlabs_voices')
              }
            >
              Upgrade Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {provider === 'openai' && (
        <div>
          <label className="text-sm font-medium mb-2 block">Voice</label>
          <Select
            value={currentVoiceId}
            onValueChange={(v) => onUpdate('openai', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {openaiVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  <div>
                    <div className="font-medium">{voice.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {voice.description}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {provider === 'elevenlabs' && hasAccess && (
        <ElevenLabsVoicePicker
          voices={elevenlabsVoices}
          currentVoiceId={currentVoiceId}
          onSelect={(voiceId, settings) =>
            onUpdate('elevenlabs', voiceId, settings)
          }
        />
      )}
    </div>
  );
}
```

## Implementation Milestones

### Milestone 1: Foundation & Feature Flags (Week 1)

**Goal**: Establish feature flag infrastructure and database schema

**Tasks**:

- [ ] Create feature flags tables and migration
- [ ] Create subscription addons tables
- [ ] Create voice usage logging tables
- [ ] Implement `FeatureFlagService` class
- [ ] Add voice provider fields to `agent_configurations`
- [ ] Create RLS policies for new tables

**Pseudo Code**:

```typescript
// Migration: 001_feature_flags.sql
/*
1. CREATE TABLE feature_flags
   - id, name (unique), description, enabled_globally, timestamps

2. CREATE TABLE organization_feature_flags
   - id, organization_id, feature_flag_id, enabled, metadata, timestamps
   - UNIQUE(organization_id, feature_flag_id)

3. CREATE TABLE subscription_addons
   - id, organization_id, addon_type, status, billing_status
   - trial_ends_at, activated_at, cancelled_at, metadata

4. CREATE TABLE voice_usage_logs
   - id, organization_id, agent_id, voice_provider, voice_id
   - session_id, call_id, character_count, duration_seconds, cost_cents

5. CREATE indexes for performance

6. INSERT default feature flag
   INSERT INTO feature_flags (name, description, enabled_globally)
   VALUES ('elevenlabs_voices', 'Premium ElevenLabs voice models', false)
*/

// FeatureFlagService implementation
class FeatureFlagService {
  async isEnabled(orgId, featureName) {
    // 1. SELECT from feature_flags WHERE name = featureName
    // 2. SELECT from organization_feature_flags WHERE org_id AND feature_flag_id
    // 3. Return org override if exists, else global setting
  }

  async hasActiveSubscription(orgId, addonType) {
    // 1. SELECT from subscription_addons WHERE org_id AND addon_type AND status='active'
    // 2. Check trial expiry or billing_status
    // 3. Return boolean
  }

  async canUseFeature(orgId, featureName) {
    // 1. Check isEnabled()
    // 2. Check hasActiveSubscription()
    // 3. Return { allowed, reason, requiresUpgrade }
  }
}
```

**Acceptance Criteria**:

- ✅ All migrations run successfully
- ✅ Feature flag service can check org-specific flags
- ✅ Subscription addon checking works
- ✅ Unit tests for FeatureFlagService pass
- ✅ RLS policies prevent unauthorized access

---

### Milestone 2: ElevenLabs Integration (Week 2)

**Goal**: Implement ElevenLabs client and voice provider abstraction

**Tasks**:

- [ ] Create `ElevenLabsClient` class
- [ ] Implement WebSocket streaming
- [ ] Create voice provider interface/types
- [ ] Implement `VoiceProviderFactory`
- [ ] Add adapter layer for OpenAI & ElevenLabs
- [ ] Create secure proxy API route

**Pseudo Code**:

```typescript
// ElevenLabsClient.ts
class ElevenLabsClient {
  constructor(config) {
    this.apiKey = config.apiKey
    this.voiceId = config.voiceId
    this.voiceSettings = config.voiceSettings
    this.ws = null
  }

  async connect(onAudio, onError) {
    // 1. Create WebSocket connection
    //    ws = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input`)

    // 2. On open: send initial config
    //    ws.send(JSON.stringify({ voice_settings, generation_config }))

    // 3. On message: decode base64 audio and call onAudio(audioChunk)

    // 4. On error: call onError(err)
  }

  async sendText(text) {
    // ws.send(JSON.stringify({ text, try_trigger_generation: true }))
  }

  async disconnect() {
    // ws.close()
  }
}

// VoiceProviderFactory.ts
class VoiceProviderFactory {
  static async createFromAgent(agentId, orgId) {
    // 1. SELECT agent FROM agent_configurations WHERE id = agentId

    // 2. IF agent.voice_provider === 'elevenlabs'
    //    a. Check FeatureFlagService.canUseFeature(orgId, 'elevenlabs_voices')
    //    b. IF not allowed AND fallback_enabled: use OpenAI
    //    c. ELSE IF not allowed: throw error
    //    d. ELSE: return ElevenLabsClient

    // 3. ELSE return OpenAIRealtimeAgent
  }
}

// API: app/api/voice/elevenlabs-proxy/route.ts
POST /api/voice/elevenlabs-proxy {
  // 1. Validate organizationId, agentId from request

  // 2. Check FeatureFlagService.canUseFeature(orgId, 'elevenlabs_voices')
  //    IF !allowed: return 403 with requiresUpgrade

  // 3. Get agent config from database

  // 4. Switch on action:
  //    - 'generate': POST to ElevenLabs /text-to-speech/${voiceId}/stream
  //    - 'list_voices': GET from ElevenLabs /v1/voices

  // 5. Stream response back to client (without exposing API key)
}
```

**Acceptance Criteria**:

- ✅ ElevenLabs WebSocket connects successfully
- ✅ Text-to-speech generates audio in μ-law format
- ✅ VoiceProviderFactory selects correct provider
- ✅ Fallback to OpenAI works when ElevenLabs unavailable
- ✅ API proxy never exposes ElevenLabs API key
- ✅ Integration tests with both providers pass

---

### Milestone 3: Voice Agent Integration (Week 3)

**Goal**: Integrate ElevenLabs into existing voice agent flow

**Tasks**:

- [ ] Update OpenAIRealtimeAgent to support provider switching
- [ ] Modify `/api/realtime/token` route for provider selection
- [ ] Implement audio bridging for ElevenLabs → Twilio
- [ ] Add usage logging for billing
- [ ] Handle provider failures gracefully
- [ ] Add monitoring/observability

**Pseudo Code**:

```typescript
// app/api/realtime/token/route.ts (updated)
POST /api/realtime/token {
  const { agentId, organizationId } = await req.json()

  // 1. SELECT agent FROM agent_configurations WHERE id = agentId

  // 2. IF agent.voice_provider === 'elevenlabs'
  //    a. canUse = FeatureFlagService.canUseFeature(orgId, 'elevenlabs_voices')
  //    b. IF !canUse.allowed
  //       - IF agent.voice_fallback_enabled: goto OpenAI flow
  //       - ELSE: return 403 with upgrade message
  //    c. Return ElevenLabs session config (no API key exposed)

  // 3. ELSE (OpenAI flow)
  //    a. POST to OpenAI /v1/realtime/sessions
  //    b. Return session token
}

// lib/agent/openai-realtime.ts (updated)
class OpenAIRealtimeAgent {
  async connect(systemPrompt, opts) {
    // 1. Determine provider from opts or fetch from agent config

    // 2. IF provider === 'elevenlabs'
    //    a. client = await VoiceProviderFactory.create({ provider: 'elevenlabs', ... })
    //    b. client.onAudio((chunk) => this.handleAudioChunk(chunk))
    //    c. client.connect()

    // 3. ELSE (OpenAI)
    //    a. Existing OpenAI Realtime flow

    // 4. Log session start to voice_usage_logs table
  }

  private async logUsage(text: string) {
    // INSERT INTO voice_usage_logs
    // (organization_id, agent_id, voice_provider, character_count, session_id)
    // VALUES (orgId, agentId, provider, text.length, sessionId)
  }
}

// Twilio bridge integration
function handleElevenLabsAudio(audioChunk: Uint8Array) {
  // 1. Audio is already in μ-law 8kHz format
  // 2. Base64 encode: const payload = audioChunk.toString('base64')
  // 3. Send to Twilio: twilioWs.send(JSON.stringify({
  //      event: 'media',
  //      media: { payload }
  //    }))
}
```

**Acceptance Criteria**:

- ✅ Voice agent successfully uses ElevenLabs when enabled
- ✅ Fallback to OpenAI works automatically
- ✅ Audio quality matches or exceeds OpenAI
- ✅ Usage is logged for every voice generation
- ✅ Errors are handled gracefully with fallback
- ✅ End-to-end test: user makes call → hears ElevenLabs voice

---

### Milestone 4: UI & Voice Selection (Week 4)

**Goal**: Build user-facing UI for voice configuration

**Tasks**:

- [ ] Create `VoiceProviderSelector` component
- [ ] Create `ElevenLabsVoicePicker` with preview
- [ ] Add premium badge/indicator
- [ ] Implement upgrade flow/CTA
- [ ] Add voice preview functionality
- [ ] Update agent settings page

**Pseudo Code**:

```tsx
// components/voice-settings/VoiceProviderSelector.tsx
function VoiceProviderSelector({
  agentId,
  organizationId,
  currentProvider,
  onUpdate,
}) {
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    // 1. POST /api/feature-flags/check
    //    { organizationId, feature: 'elevenlabs_voices' }
    // 2. setHasAccess(response.allowed)
  }, []);

  return (
    <div>
      <Select value={provider} onChange={handleProviderChange}>
        <option value="openai">Standard Voices</option>
        <option value="elevenlabs" disabled={!hasAccess}>
          Premium Voices 👑
        </option>
      </Select>

      {provider === 'elevenlabs' && !hasAccess && (
        <Alert>
          Upgrade to use premium voices
          <Button onClick={() => redirectToUpgrade()}>Upgrade</Button>
        </Alert>
      )}

      {provider === 'elevenlabs' && hasAccess && (
        <ElevenLabsVoicePicker
          onSelect={(voiceId, settings) =>
            onUpdate('elevenlabs', voiceId, settings)
          }
        />
      )}

      {provider === 'openai' && (
        <OpenAIVoicePicker
          onSelect={(voiceId) => onUpdate('openai', voiceId)}
        />
      )}
    </div>
  );
}

// components/voice-settings/ElevenLabsVoicePicker.tsx
function ElevenLabsVoicePicker({ onSelect }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);

  useEffect(() => {
    // 1. POST /api/voice/elevenlabs-proxy
    //    { action: 'list_voices', organizationId, agentId }
    // 2. setVoices(response.voices)
  }, []);

  async function previewVoice(voiceId) {
    // 1. POST /api/voice/elevenlabs-proxy
    //    { action: 'generate', text: 'Hello, this is a preview', voiceId }
    // 2. Play returned audio: new Audio(URL.createObjectURL(blob)).play()
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {voices.map((voice) => (
        <Card
          key={voice.voice_id}
          onClick={() => onSelect(voice.voice_id)}
          className={selectedVoice === voice.voice_id ? 'border-primary' : ''}
        >
          <h3>{voice.name}</h3>
          <p className="text-sm text-muted">{voice.description}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              previewVoice(voice.voice_id);
            }}
          >
            Preview
          </Button>
        </Card>
      ))}
    </div>
  );
}

// app/agent-settings/page.tsx (updated)
function AgentSettingsPage() {
  return (
    <div>
      {/* ... other settings ... */}

      <Card>
        <CardHeader>
          <CardTitle>Voice Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <VoiceProviderSelector
            agentId={agent.id}
            organizationId={organization.id}
            currentProvider={agent.voice_provider}
            currentVoiceId={
              agent.voice_provider === 'elevenlabs'
                ? agent.elevenlabs_voice_id
                : agent.voice
            }
            onUpdate={async (provider, voiceId, settings) => {
              // UPDATE agent_configurations SET
              // voice_provider = provider,
              // elevenlabs_voice_id = voiceId (if provider=elevenlabs),
              // elevenlabs_voice_settings = settings (if provider=elevenlabs),
              // voice = voiceId (if provider=openai)
              // WHERE id = agentId
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Acceptance Criteria**:

- ✅ Users can switch between Standard and Premium voices
- ✅ Premium voice selector shows when subscription active
- ✅ Upgrade CTA shown when premium not available
- ✅ Voice preview works for all ElevenLabs voices
- ✅ Voice selection persists to agent configuration
- ✅ UI clearly indicates premium features with badge
- ✅ Settings page loads without errors

---

### Milestone 5: Billing & Usage Tracking (Week 5)

**Goal**: Implement usage tracking and billing integration

**Tasks**:

- [ ] Create usage aggregation queries
- [ ] Build billing dashboard/reporting
- [ ] Implement usage alerts/limits
- [ ] Add cost calculation logic
- [ ] Create admin panel for subscription management
- [ ] Implement trial period logic

**Pseudo Code**:

```typescript
// lib/billing/usage-tracker.ts
class VoiceUsageTracker {
  static async logUsage(params: {
    organizationId: string
    agentId: string
    voiceProvider: 'openai' | 'elevenlabs'
    voiceId: string
    sessionId: string
    characterCount: number
    durationSeconds: number
  }) {
    // 1. Calculate cost based on provider pricing
    const costCents = this.calculateCost(params)

    // 2. INSERT INTO voice_usage_logs
    //    (organization_id, agent_id, voice_provider, voice_id,
    //     session_id, character_count, duration_seconds, cost_cents)
    //    VALUES (...)
  }

  static calculateCost(params) {
    // OpenAI: included in base model cost
    if (params.voiceProvider === 'openai') return 0

    // ElevenLabs pricing: $0.30 per 1000 characters for turbo model
    if (params.voiceProvider === 'elevenlabs') {
      return Math.ceil((params.characterCount / 1000) * 30) // cents
    }
  }

  static async getMonthlyUsage(organizationId: string) {
    // SELECT
    //   voice_provider,
    //   SUM(character_count) as total_characters,
    //   SUM(duration_seconds) as total_seconds,
    //   SUM(cost_cents) as total_cost_cents,
    //   COUNT(*) as session_count
    // FROM voice_usage_logs
    // WHERE organization_id = organizationId
    //   AND created_at >= date_trunc('month', NOW())
    // GROUP BY voice_provider
  }

  static async checkUsageLimit(organizationId: string) {
    const usage = await this.getMonthlyUsage(organizationId)
    const subscription = await this.getSubscription(organizationId)

    // Check if usage exceeds limit
    if (usage.total_characters > subscription.character_limit) {
      return {
        exceeded: true,
        usage: usage.total_characters,
        limit: subscription.character_limit
      }
    }

    return { exceeded: false }
  }
}

// lib/billing/subscription-manager.ts
class SubscriptionManager {
  static async activateAddon(organizationId: string, addonType: string, trial: boolean = false) {
    const trialEndsAt = trial
      ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
      : null

    // INSERT INTO subscription_addons
    // (organization_id, addon_type, status, billing_status, trial_ends_at, activated_at)
    // VALUES (organizationId, addonType, 'active', trial ? 'trial' : 'paid', trialEndsAt, NOW())
  }

  static async checkTrialExpiry(organizationId: string, addonType: string) {
    // SELECT * FROM subscription_addons
    // WHERE organization_id = organizationId
    //   AND addon_type = addonType
    //   AND billing_status = 'trial'
    //   AND trial_ends_at < NOW()

    // IF found:
    //   UPDATE subscription_addons SET status = 'suspended'
    //   WHERE id = subscription.id
  }
}

// API: app/api/billing/usage/route.ts
GET /api/billing/usage {
  const { organizationId } = await getUserOrganization()

  // 1. Get monthly usage
  const usage = await VoiceUsageTracker.getMonthlyUsage(organizationId)

  // 2. Get subscription details
  const subscription = await SubscriptionManager.getSubscription(organizationId, 'elevenlabs_voices')

  // 3. Calculate remaining quota
  const remaining = subscription.character_limit - usage.total_characters

  return {
    usage,
    subscription,
    remaining,
    percentUsed: (usage.total_characters / subscription.character_limit) * 100
  }
}

// components/billing/UsageDashboard.tsx
function UsageDashboard() {
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    // GET /api/billing/usage
    // setUsage(response)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Usage This Month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span>Characters Used</span>
              <span>{usage?.usage.total_characters.toLocaleString()} / {usage?.subscription.character_limit.toLocaleString()}</span>
            </div>
            <Progress value={usage?.percentUsed} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Stat label="Sessions" value={usage?.usage.session_count} />
            <Stat label="Duration" value={`${Math.round(usage?.usage.total_seconds / 60)}m`} />
            <Stat label="Cost" value={`$${(usage?.usage.total_cost_cents / 100).toFixed(2)}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Acceptance Criteria**:

- ✅ All voice usage is logged accurately
- ✅ Cost calculation matches provider pricing
- ✅ Monthly usage aggregation works correctly
- ✅ Usage limits enforced (with grace period)
- ✅ Trial period tracking functional
- ✅ Billing dashboard shows accurate data
- ✅ Usage alerts sent when approaching limit
- ✅ Admin can manage subscriptions

---

### Milestone 6: Testing & Quality Assurance (Week 6)

**Goal**: Comprehensive testing and quality validation

**Tasks**:

- [ ] Write unit tests for all new services
- [ ] Integration tests for voice providers
- [ ] E2E tests for feature flag gating
- [ ] Audio quality testing
- [ ] Load testing for concurrent sessions
- [ ] Security audit
- [ ] Documentation

**Pseudo Code**:

```typescript
// __tests__/feature-flags.test.ts
describe('FeatureFlagService', () => {
  test('respects organization override', async () => {
    // 1. Create test org
    // 2. Create feature flag with enabled_globally = false
    // 3. Create org override with enabled = true
    // 4. Verify canUseFeature returns allowed = true
  });

  test('falls back to global when no override', async () => {
    // 1. Create feature flag with enabled_globally = true
    // 2. Verify canUseFeature returns allowed = true (no org override)
  });

  test('requires active subscription', async () => {
    // 1. Enable feature flag
    // 2. Create expired trial subscription
    // 3. Verify canUseFeature returns allowed = false, requiresUpgrade = true
  });
});

// __tests__/elevenlabs-client.test.ts
describe('ElevenLabsClient', () => {
  test('connects to WebSocket successfully', async () => {
    const client = new ElevenLabsClient({
      apiKey: TEST_KEY,
      voiceId: TEST_VOICE,
    });
    await client.connect(jest.fn(), jest.fn());
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
  });

  test('generates audio from text', async () => {
    const audioChunks: Uint8Array[] = [];
    const client = new ElevenLabsClient({
      apiKey: TEST_KEY,
      voiceId: TEST_VOICE,
    });

    await client.connect((chunk) => audioChunks.push(chunk));
    await client.sendText('Hello world');
    await waitFor(() => audioChunks.length > 0);

    expect(audioChunks.length).toBeGreaterThan(0);
  });

  test('handles WebSocket errors gracefully', async () => {
    const onError = jest.fn();
    const client = new ElevenLabsClient({
      apiKey: 'INVALID',
      voiceId: TEST_VOICE,
    });

    await expect(client.connect(jest.fn(), onError)).rejects.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});

// __tests__/e2e/voice-provider.test.ts
describe('Voice Provider E2E', () => {
  test('uses ElevenLabs when subscription active', async () => {
    // 1. Create test organization
    // 2. Activate elevenlabs_voices subscription
    // 3. Create agent with voice_provider = 'elevenlabs'
    // 4. POST /api/realtime/token
    // 5. Verify response includes provider: 'elevenlabs'
  });

  test('falls back to OpenAI when subscription expired', async () => {
    // 1. Create test organization
    // 2. Create expired elevenlabs subscription
    // 3. Create agent with voice_provider = 'elevenlabs', fallback_enabled = true
    // 4. POST /api/realtime/token
    // 5. Verify response includes provider: 'openai'
  });

  test('returns 403 when subscription required and no fallback', async () => {
    // 1. Create test organization (no subscription)
    // 2. Create agent with voice_provider = 'elevenlabs', fallback_enabled = false
    // 3. POST /api/realtime/token
    // 4. Verify response status = 403 with requiresUpgrade = true
  });
});

// Audio Quality Testing (manual checklist)
/*
1. Record OpenAI voice sample
2. Record ElevenLabs voice sample (same text)
3. Compare audio quality:
   - [ ] Clarity and naturalness
   - [ ] No artifacts or distortion
   - [ ] Volume levels consistent
   - [ ] Latency acceptable (<150ms)
4. Conduct A/B testing with 5+ users
5. Measure MOS (Mean Opinion Score) improvement
*/

// Load Testing
/*
1. Simulate 50 concurrent voice sessions
2. Monitor:
   - [ ] WebSocket connection stability
   - [ ] Audio stream continuity
   - [ ] Memory usage
   - [ ] CPU usage
   - [ ] API rate limits
3. Verify no degradation in quality
*/

// Security Audit Checklist
/*
- [ ] ElevenLabs API key never exposed to client
- [ ] RLS policies prevent cross-org access
- [ ] Feature flag checks cannot be bypassed
- [ ] Usage logs are tamper-proof
- [ ] Subscription status verified server-side
- [ ] Rate limiting on voice generation endpoints
*/
```

**Acceptance Criteria**:

- ✅ 90%+ code coverage for new features
- ✅ All integration tests pass
- ✅ E2E tests cover all user flows
- ✅ Audio quality meets or exceeds baseline
- ✅ System handles 50+ concurrent sessions
- ✅ Security audit passes with no critical issues
- ✅ Documentation complete and accurate

---

## Rollout Plan

### Phase 1: Internal Testing (Week 7)

- Deploy to staging environment
- Enable feature flag for internal organization only
- Test all flows with real calls
- Gather team feedback
- Fix any critical bugs

### Phase 2: Limited Beta (Week 8-9)

- Select 5-10 beta customers
- Enable feature flag for beta organizations
- Offer free trial period (14 days)
- Collect feedback and usage data
- Monitor for issues

### Phase 3: Paid Beta (Week 10-11)

- Expand to 20-30 customers
- Enable billing for new users
- Continue free trial for existing beta users
- Refine pricing based on usage data
- Optimize based on feedback

### Phase 4: General Availability (Week 12)

- Open to all customers
- Marketing announcement
- Update documentation
- Monitor usage and costs
- Iterate based on demand

## Pricing Strategy

### Suggested Tiers

**Starter Plan (Base)**

- OpenAI voices included
- No additional cost
- Standard quality

**Professional Plan Add-On**

- +$29/month
- 100,000 characters/month
- ElevenLabs premium voices
- $0.15 per additional 1,000 characters

**Enterprise Plan Add-On**

- +$99/month
- 500,000 characters/month
- Priority voice processing
- Custom voice cloning (future)
- $0.10 per additional 1,000 characters

### Cost Analysis

**ElevenLabs Pricing** (Turbo model):

- $0.30 per 1,000 characters

**Our Markup**:

- Professional: $0.15/1k chars = 50% margin
- Enterprise: $0.10/1k chars = 33% margin (volume discount)

**Break-even**:

- Professional: ~97k characters/month
- Enterprise: ~330k characters/month

## Monitoring & Observability

### Key Metrics

1. **Usage Metrics**
   - Characters generated per org
   - Session duration
   - Voice provider distribution
   - Error rates by provider

2. **Business Metrics**
   - Conversion rate (free → paid)
   - Churn rate for add-on
   - Average revenue per user (ARPU)
   - Lifetime value (LTV)

3. **Performance Metrics**
   - Audio latency (p50, p95, p99)
   - WebSocket connection stability
   - Fallback rate
   - API error rates

4. **Cost Metrics**
   - ElevenLabs API costs
   - Cost per session
   - Margin per customer
   - Total monthly spend

### Alerts

- Usage approaching limit (80%, 95%)
- Subscription expiring (7 days, 1 day)
- Error rate spike (>5%)
- Cost anomaly detected
- Trial ending soon

## Risk Mitigation

### Technical Risks

| Risk                    | Impact | Probability | Mitigation                         |
| ----------------------- | ------ | ----------- | ---------------------------------- |
| ElevenLabs API downtime | High   | Medium      | Automatic fallback to OpenAI       |
| Audio quality issues    | High   | Low         | Extensive testing, quality gates   |
| WebSocket instability   | Medium | Medium      | Retry logic, connection monitoring |
| Rate limiting           | Medium | Low         | Request queuing, usage caps        |

### Business Risks

| Risk               | Impact | Probability | Mitigation                                    |
| ------------------ | ------ | ----------- | --------------------------------------------- |
| Low adoption       | High   | Medium      | Free trial, clear value prop, marketing       |
| High churn         | Medium | Medium      | Usage monitoring, proactive support           |
| Cost overrun       | High   | Low         | Usage alerts, hard limits, pricing buffer     |
| Competitor copying | Low    | High        | Focus on integration quality, not just voices |

## Success Criteria

### Launch Success (3 months post-GA)

- ✅ 100+ active subscriptions
- ✅ <10% churn rate
- ✅ >30% margin on add-on revenue
- ✅ <1% error rate
- ✅ 4.5+ star rating from users

### Long-term Success (6 months post-GA)

- ✅ 500+ active subscriptions
- ✅ $15k+ MRR from add-on
- ✅ Feature becomes standard expectation
- ✅ Expand to additional voice providers
- ✅ Launch custom voice cloning

## Appendix

### Environment Variables

```bash
# ElevenLabs
ELEVENLABS_API_KEY=your_api_key_here

# Feature Flags (optional overrides)
FEATURE_FLAG_ELEVENLABS_VOICES_GLOBAL=false

# Billing
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
```

### Database Seed Data

```sql
-- Create the ElevenLabs voices feature flag
INSERT INTO feature_flags (name, description, enabled_globally)
VALUES (
  'elevenlabs_voices',
  'Premium ElevenLabs voice models for enhanced audio quality',
  false
);

-- Create sample subscription add-on for testing
INSERT INTO subscription_addons (
  organization_id,
  addon_type,
  status,
  billing_status,
  trial_ends_at
) VALUES (
  'test-org-id',
  'elevenlabs_voices',
  'active',
  'trial',
  NOW() + INTERVAL '14 days'
);
```

### API Endpoints Summary

| Endpoint                      | Method | Purpose                    | Auth Required |
| ----------------------------- | ------ | -------------------------- | ------------- |
| `/api/feature-flags/check`    | POST   | Check feature availability | Yes           |
| `/api/realtime/token`         | POST   | Get voice session token    | Yes           |
| `/api/voice/elevenlabs-proxy` | POST   | Proxy to ElevenLabs API    | Yes           |
| `/api/billing/usage`          | GET    | Get usage statistics       | Yes           |
| `/api/billing/subscription`   | POST   | Manage subscription        | Yes           |

---

**Document Version**: 1.0
**Last Updated**: 2025-10-02
**Author**: Claude Code
**Status**: Ready for Review
