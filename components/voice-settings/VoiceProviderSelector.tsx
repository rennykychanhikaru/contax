"use client";

import { useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, Play, RefreshCw, Volume2 } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type VoiceProvider = 'openai' | 'elevenlabs';

const OPENAI_VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy - Female (Balanced, neutral)' },
  { value: 'shimmer', label: 'Shimmer - Female (Warm, friendly)' },
  { value: 'echo', label: 'Echo - Male (Smooth, confident)' },
  { value: 'sage', label: 'Sage - Male (Clear, authoritative)' },
  { value: 'verse', label: 'Verse - Male (Energetic, expressive)' },
];

interface VoiceProviderSelectorProps {
  agentId: string | null;
  organizationId: string | null;
  voiceProvider: VoiceProvider;
  onProviderChange: (provider: VoiceProvider) => void;
  openAIVoice: string;
  onOpenAIVoiceChange: (voiceId: string) => void;
  elevenlabsVoiceId: string | null;
  elevenlabsVoiceSettings: Record<string, unknown> | null;
  onElevenLabsVoiceChange: (
    voiceId: string | null,
    settings?: Record<string, unknown> | null,
  ) => void;
  voiceFallbackEnabled: boolean;
  onToggleFallback: (value: boolean) => void;
  isSaving?: boolean;
}

interface ElevenLabsVoiceDefinition {
  voice_id: string;
  name?: string;
  description?: string;
  labels?: Record<string, unknown> & { accent?: string };
  default_voice_settings?: Record<string, unknown> | null;
}

export function VoiceProviderSelector({
  agentId,
  organizationId,
  voiceProvider,
  onProviderChange,
  openAIVoice,
  onOpenAIVoiceChange,
  elevenlabsVoiceId,
  elevenlabsVoiceSettings,
  onElevenLabsVoiceChange,
  voiceFallbackEnabled,
  onToggleFallback,
  isSaving = false,
}: VoiceProviderSelectorProps) {
  const [hasPremiumAccess, setHasPremiumAccess] = useState<boolean | null>(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<ElevenLabsVoiceDefinition[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voiceLoadError, setVoiceLoadError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const agentKeyForRequests = agentId ?? undefined;

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsCheckingAccess(true);

    (async () => {
      try {
        const res = await fetch('/api/feature-flags/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            feature: 'elevenlabs_voices',
          }),
        });

        if (!res.ok) {
          throw new Error(`Feature flag check failed (${res.status})`);
        }

        const data = await res.json();
        if (!cancelled) {
          setHasPremiumAccess(Boolean(data.allowed));
          setRequiresUpgrade(Boolean(data.requiresUpgrade));
        }
      } catch (error) {
        console.error('Failed to check ElevenLabs access', error);
        if (!cancelled) {
          setHasPremiumAccess(false);
          setRequiresUpgrade(false);
        }
      } finally {
        if (!cancelled) setIsCheckingAccess(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (voiceProvider === 'elevenlabs' && hasPremiumAccess === false) {
      onProviderChange('openai');
    }
  }, [voiceProvider, hasPremiumAccess, onProviderChange]);

  useEffect(() => {
    if (voiceProvider !== 'elevenlabs') {
      setPreviewError(null);
    }
  }, [voiceProvider]);

  const loadElevenLabsVoices = async () => {
    if (!organizationId || !agentKeyForRequests) return;
    setIsLoadingVoices(true);
    setVoiceLoadError(null);

    try {
      const res = await fetch('/api/voice/elevenlabs-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          agentId: agentKeyForRequests,
          action: 'list_voices',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load voices (${res.status})`);
      }

      const data = await res.json();
      const voicesPayload = Array.isArray(data.voices)
        ? data.voices
        : Array.isArray(data.voices?.voices)
          ? data.voices.voices
          : [];
      const voices = voicesPayload.filter(
        (voiceOption): voiceOption is ElevenLabsVoiceDefinition =>
          Boolean(voiceOption && voiceOption.voice_id),
      );
      setElevenlabsVoices(voices);

      if (voices.length) {
        const selected =
          voices.find((voiceOption) => voiceOption.voice_id === elevenlabsVoiceId) ??
          voices[0];

        if (!elevenlabsVoiceId) {
          onElevenLabsVoiceChange(selected.voice_id, selected.default_voice_settings ?? null);
        } else if (!elevenlabsVoiceSettings && selected.default_voice_settings) {
          onElevenLabsVoiceChange(elevenlabsVoiceId, selected.default_voice_settings ?? null);
        }
      }
    } catch (error) {
      console.error('Failed to load ElevenLabs voices', error);
      setVoiceLoadError(error instanceof Error ? error.message : 'Failed to load voices');
      setElevenlabsVoices([]);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (voiceProvider !== 'elevenlabs') return;
    if (!hasPremiumAccess) return;
    if (!organizationId || !agentKeyForRequests) return;
    if (elevenlabsVoices.length > 0) return;

    void loadElevenLabsVoices();
  }, [voiceProvider, hasPremiumAccess, organizationId, agentKeyForRequests, elevenlabsVoices.length]);

  const handlePreview = async (voiceId: string) => {
    if (!organizationId || !agentKeyForRequests) return;
    setIsPreviewing(true);
    setPreviewError(null);

    try {
      const res = await fetch('/api/voice/elevenlabs-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          agentId: agentKeyForRequests,
          action: 'generate',
          voiceId,
          text: 'Hello, this is a preview of the Contax premium voice.',
          voiceSettings: elevenlabsVoiceSettings ?? undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Preview failed (${res.status})`);
      }

      const data = await res.json();
      if (data.audio) {
        const audio = new Audio(`data:${data.contentType || 'audio/mpeg'};base64,${data.audio}`);
        await audio.play();
      }
    } catch (error) {
      console.error('Failed to preview ElevenLabs voice', error);
      setPreviewError(error instanceof Error ? error.message : 'Failed to preview voice');
    } finally {
      setIsPreviewing(false);
    }
  };

  const selectedElevenLabsVoice = useMemo(() => {
    return elevenlabsVoices.find((voice) => voice.voice_id === elevenlabsVoiceId) ?? null;
  }, [elevenlabsVoices, elevenlabsVoiceId]);

  const canUseElevenLabs = hasPremiumAccess === true;

  return (
    <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="voice-provider">Voice Provider</Label>
            <Volume2 className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            Choose which voice engine powers your agent.
          </p>
          <Select
            value={voiceProvider}
            onValueChange={(value) => onProviderChange(value as VoiceProvider)}
            disabled={isSaving || isCheckingAccess}
          >
            <SelectTrigger id="voice-provider" className="w-full">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">Standard (OpenAI)</SelectItem>
              <SelectItem value="elevenlabs" disabled={!canUseElevenLabs}>
                <div className="flex items-center gap-2">
                  Premium (ElevenLabs)
                  <Crown className="h-4 w-4 text-yellow-500" />
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {voiceProvider === 'openai' && (
          <div className="space-y-2">
            <Label htmlFor="agent-voice">Standard Voice</Label>
            <p className="text-sm text-gray-500">Choose the voice personality for your agent.</p>
            <Select
              value={openAIVoice}
              onValueChange={onOpenAIVoiceChange}
              disabled={isSaving}
            >
              <SelectTrigger id="agent-voice" className="w-full">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_VOICE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {voiceProvider === 'elevenlabs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Premium Voice</Label>
                <p className="text-sm text-gray-500">
                  ElevenLabs voices offer more natural, expressive speech.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadElevenLabsVoices}
                disabled={isLoadingVoices || isSaving}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {voiceLoadError && (
              <Alert className="border-red-600">
                <AlertDescription className="text-red-600">{voiceLoadError}</AlertDescription>
              </Alert>
            )}

            <Select
              value={elevenlabsVoiceId ?? undefined}
              onValueChange={(value) => {
                const nextId = value === '__placeholder__' ? null : value;
                onElevenLabsVoiceChange(nextId, elevenlabsVoiceSettings);
                if (nextId) {
                  const voiceDef = elevenlabsVoices.find((v) => v.voice_id === nextId);
                  if (voiceDef?.default_voice_settings) {
                    onElevenLabsVoiceChange(nextId, voiceDef.default_voice_settings);
                  }
                }
              }}
              disabled={isSaving || isLoadingVoices || elevenlabsVoices.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={isLoadingVoices ? 'Loading voices…' : 'Select a premium voice'}
                >
                  {selectedElevenLabsVoice ? (
                    <div className="flex flex-col text-left truncate">
                      <span className="font-medium">
                        {selectedElevenLabsVoice.name || selectedElevenLabsVoice.voice_id}
                      </span>
                      {selectedElevenLabsVoice.description ? (
                        <span className="text-xs text-muted-foreground">
                          {selectedElevenLabsVoice.description}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__placeholder__" disabled textValue="Select a premium voice">
                  Select a premium voice
                </SelectItem>
                {elevenlabsVoices.map((voiceOption) => (
                  <SelectItem
                    key={voiceOption.voice_id}
                    value={voiceOption.voice_id}
                    textValue={voiceOption.name || voiceOption.voice_id}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{voiceOption.name || voiceOption.voice_id}</span>
                      {voiceOption.description ? (
                        <span className="text-xs text-muted-foreground">{voiceOption.description}</span>
                      ) : null}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!elevenlabsVoiceId || isPreviewing || isSaving}
                onClick={() => elevenlabsVoiceId && handlePreview(elevenlabsVoiceId)}
              >
                {isPreviewing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Previewing…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Preview Voice
                  </>
                )}
              </Button>
              {selectedElevenLabsVoice?.labels?.accent && (
                <span className="text-xs text-muted-foreground">
                  Accent: {String(selectedElevenLabsVoice.labels.accent)}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-fallback">Fallback to standard voice</Label>
                <Switch
                  id="voice-fallback"
                  checked={voiceFallbackEnabled}
                  onCheckedChange={(checked) => onToggleFallback(Boolean(checked))}
                  disabled={isSaving}
                />
              </div>
              <p className="text-xs text-gray-500">
                When enabled, the agent automatically uses standard voices if premium access is unavailable.
              </p>
            </div>

            {previewError && (
              <Alert className="border-red-600">
                <AlertDescription className="text-red-600">{previewError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {voiceProvider === 'elevenlabs' && !isCheckingAccess && !canUseElevenLabs && (
          <Alert className="border-amber-500">
            <AlertDescription className="flex items-center gap-2 text-amber-500">
              <Crown className="h-4 w-4" />
              Premium voices require an active ElevenLabs add-on
              {requiresUpgrade && (
                <a href="/settings/billing?addon=elevenlabs_voices" className="underline">
                  Upgrade now
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
  );
}

export default VoiceProviderSelector;
