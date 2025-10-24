const WebSocket = require('ws');

const DEFAULT_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

class ElevenLabsStream {
  constructor(config) {
    this.config = {
      modelId: 'eleven_turbo_v2_5',
      outputFormat: 'ulaw_8000',
      voiceSettings: DEFAULT_SETTINGS,
      ...config,
    };
    this.ws = null;
    this.onAudio = null;
    this.onError = null;
  }

  async connect(onAudio, onError) {
    if (!this.config.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }

    this.onAudio = onAudio;
    this.onError = onError;

    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream-input?model_id=${this.config.modelId}&output_format=${this.config.outputFormat}`;

    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
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
          this.ws.send(
            JSON.stringify({
              text: ' ',
              voice_settings: this.config.voiceSettings,
              generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
            }),
          );
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      this.ws.on('message', (data) => {
        try {
          const payload = typeof data === 'string' ? data : data.toString('utf8');
          const parsed = JSON.parse(payload);
          if (parsed.audio) {
            const audio = Buffer.from(parsed.audio, 'base64');
            if (this.onAudio) {
              this.onAudio(new Uint8Array(audio));
            }
          }
          if (parsed.error) {
            const errorObj = new Error(parsed.error);
            if (this.onError) this.onError(errorObj);
          }
        } catch (err) {
          if (this.onError) {
            this.onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });

      this.ws.once('error', (err) => {
        cleanup();
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (this.onError) this.onError(errorObj);
        reject(errorObj);
      });

      this.ws.once('close', () => {
        cleanup();
        this.ws = null;
      });
    });
  }

  sendText(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('ElevenLabs stream not connected');
    }
    this.ws.send(
      JSON.stringify({
        text,
        try_trigger_generation: true,
      }),
    );
  }

  flush() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ text: '' }));
  }

  async disconnect() {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    await new Promise((resolve) => {
      ws.once('close', () => resolve());
      ws.close();
      setTimeout(resolve, 250);
    });
  }
}

module.exports = {
  ElevenLabsStream,
};
