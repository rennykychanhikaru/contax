/**
 * @vitest-environment jsdom
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Buffer } from 'node:buffer';
import { OpenAIRealtimeAgent } from '@/lib/agent/openai-realtime';

type TestAudioElement = HTMLAudioElement & {
  play: Mock;
  pause: Mock;
};

const mockAudioInstances: TestAudioElement[] = [];

function createMockAudioElement(): TestAudioElement {
  const element = document.createElement('audio') as TestAudioElement;
  element.play = vi.fn().mockImplementation(() =>
    Promise.resolve().then(() => {
      setTimeout(() => element.dispatchEvent(new Event('ended')), 0);
    })
  );
  element.pause = vi.fn();
  mockAudioInstances.push(element);
  return element;
}

const originalAudio = globalThis.Audio;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let fetchMock: Mock;
let createObjectURLSpy: ReturnType<typeof vi.spyOn> | null = null;
let revokeObjectURLSpy: ReturnType<typeof vi.spyOn> | null = null;

describe('OpenAIRealtimeAgent ElevenLabs playback', () => {
  beforeEach(() => {
    mockAudioInstances.length = 0;
    globalThis.Audio = (function MockAudioCtor() {
      return createMockAudioElement();
    }) as unknown as typeof Audio;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    if (typeof originalCreateObjectURL === 'function') {
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    } else {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:mock');
      createObjectURLSpy = null;
    }
    if (typeof originalRevokeObjectURL === 'function') {
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    } else {
      (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn(() => {});
      revokeObjectURLSpy = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.Audio = originalAudio;
    globalThis.fetch = originalFetch;
    if (createObjectURLSpy) {
      createObjectURLSpy.mockRestore();
      createObjectURLSpy = null;
    } else if (typeof originalCreateObjectURL !== 'function') {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    }
    if (revokeObjectURLSpy) {
      revokeObjectURLSpy.mockRestore();
      revokeObjectURLSpy = null;
    } else if (typeof originalRevokeObjectURL !== 'function') {
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('plays premium audio when ElevenLabs synthesis succeeds', async () => {
    const audioPayload = Buffer.from('premium-audio', 'utf8').toString('base64');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        audio: audioPayload,
        contentType: 'audio/mpeg',
      }),
    });

    const agent = new OpenAIRealtimeAgent();
    const internal = agent as unknown as Record<string, unknown>;
    internal.elevenLabsEnabled = true;
    internal.defaultOrgId = 'org';
    internal.defaultAgentId = 'agent';
    internal.voiceMetadata = {
      provider: 'elevenlabs',
      voiceId: 'voice',
      voiceSettings: undefined,
      modelId: 'eleven_turbo_v2_5',
      sessionId: 'session',
    };

    (agent as unknown as { enqueueElevenLabsSpeech(text: string): void }).enqueueElevenLabsSpeech(
      'Thanks for calling!'
    );

    await (internal.elevenLabsQueue as Promise<void>);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/voice/elevenlabs-proxy',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const lastAudio = mockAudioInstances.at(-1);
    expect(lastAudio?.play).toHaveBeenCalled();
  });

  it('falls back to OpenAI audio when ElevenLabs synthesis fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'synthesis failed' }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const agent = new OpenAIRealtimeAgent();
    const internal = agent as unknown as Record<string, unknown>;
    internal.elevenLabsEnabled = true;
    internal.defaultOrgId = 'org';
    internal.defaultAgentId = 'agent';
    internal.voiceMetadata = {
      provider: 'elevenlabs',
      voiceId: 'voice',
      voiceSettings: undefined,
      modelId: 'eleven_turbo_v2_5',
      sessionId: 'session',
    };

    (agent as unknown as { enqueueElevenLabsSpeech(text: string): void }).enqueueElevenLabsSpeech(
      'Fallback please'
    );

    await (internal.elevenLabsQueue as Promise<void>);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(internal.elevenLabsEnabled).toBe(false);
  });
});
