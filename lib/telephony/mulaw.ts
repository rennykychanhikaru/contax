// Minimal G.711 µ-law encode/decode helpers and simple resampling utilities
// Twilio Media Streams use 8kHz mono PCMU (µ-law). The OpenAI Realtime API
// outputs PCM16 (typically 16kHz). We provide helpers to:
// - Encode PCM16 -> µ-law (for Twilio outbound)
// - Decode µ-law -> PCM16 (for model inbound)
// - Downsample PCM16 16kHz -> 8kHz (naive decimation)
// - Upsample PCM16 8kHz -> 16kHz (naive linear interpolation)

// Constants for µ-law
const BIAS = 0x84;
const CLIP = 32635;

// PCM16 (Int16) -> µ-law (byte)
export function pcm16ToMuLaw(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;

  sample = sample + BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) { /* a-ok */ }
  const mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f;
  const muLawByte = ~(sign | (exponent << 4) | mantissa);
  return muLawByte & 0xff;
}

// µ-law (byte) -> PCM16 (Int16)
export function muLawToPcm16(mu: number): number {
  mu = ~mu;
  const sign = (mu & 0x80);
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << (exponent + 2);
  sample -= BIAS;
  return sign ? -sample : sample;
}

// Encode an Int16Array of PCM16 samples to a Uint8Array of µ-law bytes
export function encodePcm16ToMuLaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm16ToMuLaw(pcm[i]);
  return out;
}

// Decode a Uint8Array of µ-law bytes to an Int16Array of PCM16 samples
export function decodeMuLawToPcm16(mu: Uint8Array): Int16Array {
  const out = new Int16Array(mu.length);
  for (let i = 0; i < mu.length; i++) out[i] = muLawToPcm16(mu[i]);
  return out;
}

// Downsample PCM16 from 16kHz to 8kHz by naive decimation (take every other sample)
export function downsample16kTo8k(pcm16k: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor(pcm16k.length / 2));
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = pcm16k[i];
  return out;
}

// Upsample PCM16 from 8kHz to 16kHz by naive linear interpolation
export function upsample8kTo16k(pcm8k: Int16Array): Int16Array {
  if (pcm8k.length === 0) return new Int16Array(0);
  const out = new Int16Array(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length - 1; i++) {
    const a = pcm8k[i];
    const b = pcm8k[i + 1];
    out[i * 2] = a;
    out[i * 2 + 1] = (a + b) >> 1;
  }
  // Last sample duplicate
  const last = pcm8k[pcm8k.length - 1];
  out[out.length - 2] = last;
  out[out.length - 1] = last;
  return out;
}

