import WebSocket from 'ws';

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface ElevenLabsClientConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: 'ulaw_8000' | 'pcm_16000' | 'pcm_24000';
}

type MessageHandler = (chunk: Uint8Array) => void;
type ErrorHandler = (error: Error) => void;

export class ElevenLabsClient {
  private ws: WebSocket | null = null;
  private readonly config: Required<
    Pick<ElevenLabsClientConfig, 'modelId' | 'outputFormat' | 'voiceSettings'>
  > & ElevenLabsClientConfig;
  private onAudio?: MessageHandler;
  private onError?: ErrorHandler;

  constructor(config: ElevenLabsClientConfig) {
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

  async connect(onAudio: MessageHandler, onError?: ErrorHandler): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }

    this.onAudio = onAudio;
    this.onError = onError;

    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream-input?model_id=${this.config.modelId}&output_format=${this.config.outputFormat}`;

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': this.config.apiKey,
        },
      });

      const cleanup = () => {
        if (!this.ws) return;
        this.ws.removeAllListeners('open');
        this.ws.removeAllListeners('message');
        this.ws.removeAllListeners('error');
        this.ws.removeAllListeners('close');
      };

      this.ws.once('open', () => {
        try {
          this.ws?.send(
            JSON.stringify({
              text: ' ',
              voice_settings: this.config.voiceSettings,
              generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
            }),
          );
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      });

      this.ws.on('message', (data) => {
        try {
          const payload =
            typeof data === 'string' ? data : data.toString('utf8');
          const parsed = JSON.parse(payload) as {
            audio?: string;
            error?: string;
          };

          if (parsed.audio) {
            const audioData = Buffer.from(parsed.audio, 'base64');
            this.onAudio?.(new Uint8Array(audioData));
          }

          if (parsed.error) {
            const err = new Error(parsed.error);
            this.onError?.(err);
          }
        } catch (error) {
          this.onError?.(
            error instanceof Error
              ? error
              : new Error('Failed to parse ElevenLabs response'),
          );
        }
      });

      this.ws.once('error', (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
        this.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      });

      this.ws.once('close', () => {
        cleanup();
        this.ws = null;
      });
    });
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('ElevenLabs WebSocket not connected');
    }

    this.ws.send(
      JSON.stringify({
        text,
        try_trigger_generation: true,
      }),
    );
  }

  async flush(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ text: '' }));
  }

  async disconnect(): Promise<void> {
    if (!this.ws) return;

    await new Promise<void>((resolve) => {
      this.ws?.once('close', () => {
        this.ws = null;
        resolve();
      });
      this.ws?.close();
      setTimeout(() => resolve(), 250);
    });
  }
}
