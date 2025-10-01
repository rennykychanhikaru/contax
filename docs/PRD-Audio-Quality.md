# Twilio Audio Fidelity Recovery PRD

## Summary

- Investigated Twilio media bridge, shared µ-law helpers, and fallback greeting pipeline to identify the cause of low PSTN audio fidelity.
- Determined that naive downsampling of OpenAI's 24 kHz PCM output without low-pass filtering introduces audible aliasing and compression artifacts.
- Documented a recovery plan that replaces naive resampling with high-quality signal processing to preserve audio fidelity while maintaining the required 24 kHz → 8 kHz conversion.

## CRITICAL UPDATE: OpenAI API Format Constraints

**OpenAI's Realtime API does NOT support `g711_ulaw` output format.** The API only supports:

- **Output formats:** `pcm16` (16-bit PCM at 24kHz) - this is the only available option
- **Input formats:** `g711_ulaw`, `pcm16`

Therefore, **resampling from 24kHz to 8kHz is unavoidable**. The solution must focus on implementing high-quality resampling rather than eliminating it.

## Root Cause Analysis

- **Required format conversion:** OpenAI Realtime API outputs `pcm16` at 24 kHz (only available format), while Twilio expects µ-law 8 kHz. This 3:1 downsampling is unavoidable and must be handled correctly.
- **Naive resampling implementation (PRIMARY ISSUE):** The current `downsample24kTo8kLinear` function in `server/twilio-media-ws.js:587-593` performs simple averaging of every 3 samples without low-pass filtering. This violates the Nyquist theorem and creates aliasing artifacts:
  ```javascript
  // PROBLEM: No anti-aliasing filter before downsampling
  out[j] = ((pcm24k[i] + pcm24k[i + 1] + pcm24k[i + 2]) / 3) | 0;
  ```
  Frequencies above 4kHz in the 24kHz signal fold back into the audible range when downsampled to 8kHz, creating the "compressed and choppy" sound.
- **Fallback TTS quality:** Fallback TTS flows (line 399-414) also use the same naive resampling, compounding quality issues.

## Product Requirements

### Background / Problem Statement

Outgoing PSTN audio routed through our Twilio bridge sounds overly compressed compared to reference implementations. The current pipeline requests high-sample-rate PCM from OpenAI Realtime, then performs manual 24 kHz → 8 kHz downsampling before µ-law encoding, resulting in audible artifacts.

### Goals

1. Deliver OpenAI assistant audio to Twilio with clarity comparable to reference integrations.
2. Remove bespoke resampling from the critical audio path or replace it with high-fidelity alternatives when unavoidable.
3. Preserve existing latency expectations (≤ 120 ms additional jitter).

### Non-Goals

- Altering PSTN call flows or authentication mechanisms.
- Switching to a different OpenAI Realtime model.
- Revisiting inbound audio handling, which already uses `g711_ulaw`.

### Proposed Solution

**PRIMARY FIX: Replace naive resampling with high-quality signal processing**

1. **Integrate professional-grade resampler library:**
   - **RECOMMENDED:** `@samplerate/samplerate` - Node.js bindings to libsamplerate (SoX quality)
     - Pros: Industry-standard sinc interpolation, best quality, low latency
     - Cons: Native dependency (requires compilation)
   - **Alternative 1:** `audio-resampler` (WASM-based)
     - Pros: No native dependencies, good quality
     - Cons: Slightly higher CPU overhead
   - **Alternative 2:** `libsamplerate.js` (Pure JS port)
     - Pros: No dependencies, decent quality
     - Cons: Higher CPU usage than native

2. **Replace `downsample24kTo8kLinear` in server/twilio-media-ws.js:**
   - Apply low-pass filter at 3.4kHz cutoff (Nyquist for 8kHz, matching G.711 bandwidth)
   - Use sinc interpolation or equivalent high-quality algorithm
   - Maintain < 10ms processing latency per audio chunk

3. **Update fallback TTS pipeline (lines 399-414):**
   - Apply same high-quality resampling to fallback TTS audio
   - Ensure consistent quality between realtime and fallback paths

4. **Add observability:**
   - Log resampling method and latency per frame
   - Monitor for audio dropouts or buffer underruns
   - Add frequency analysis in test environment to verify no aliasing

### Milestones & Acceptance Criteria

1. **High-Quality Resampler Integration**
   - [ ] Evaluate and select resampler library (`@samplerate/samplerate` recommended)
   - [ ] Install and test library in development environment
   - [ ] Implement wrapper function with appropriate filter settings (3.4kHz cutoff, sinc interpolation)
   - [ ] Measure processing latency (must be < 10ms per chunk)

2. **Replace Naive Resampling in Production Path**
   - [ ] Replace `downsample24kTo8kLinear` in `server/twilio-media-ws.js:587-593`
   - [ ] Update audio delta handler (lines 370-381) to use new resampler
   - [ ] Ensure µ-law encoding (`encodePcm16ToMuLaw`) remains unchanged
   - [ ] Add error handling and fallback to naive resampler if library fails

3. **Fallback TTS Pipeline Update**
   - [ ] Update fallback TTS resampling (lines 399-414) to use same high-quality resampler
   - [ ] Ensure `downsample16kTo8k` is also replaced or removed
   - [ ] Validate fallback audio quality matches realtime quality

4. **Quality Validation & Testing**
   - [ ] **Objective metrics:**
     - Measure frequency response (should preserve up to 3.4kHz)
     - Verify no aliasing artifacts in spectrogram analysis
     - Confirm total harmonic distortion (THD) < 1%
   - [ ] **Subjective testing:**
     - Create standardized test recordings (before/after)
     - Conduct blind A/B testing with 5+ listeners
     - Achieve MOS (Mean Opinion Score) improvement of at least 1.0 point (5-point scale)
   - [ ] **Latency verification:**
     - Measure end-to-end audio latency
     - Ensure < 120ms total additional jitter (existing requirement)

5. **Observability & Monitoring**
   - [ ] Add structured logs for resampler selection and performance
   - [ ] Log processing latency per audio chunk
   - [ ] Add counters for buffer underruns or resampling errors
   - [ ] Create dashboard for audio quality metrics in production

### Pseudocode Sketch

```javascript
// Install high-quality resampler
// npm install @samplerate/samplerate

const samplerate = require('@samplerate/samplerate');

// Initialize resampler with high-quality settings
const resampler = new samplerate.Resampler({
  type: samplerate.SRC_SINC_BEST_QUALITY, // Best quality sinc interpolation
  channels: 1, // Mono audio
  fromRate: 24000, // OpenAI outputs 24kHz
  toRate: 8000, // Twilio expects 8kHz
});

// Replace downsample24kTo8kLinear with high-quality resampling
function downsample24kTo8kHighQuality(pcm24k) {
  try {
    // Convert Int16Array to Float32Array (normalized to -1.0 to 1.0)
    const float24k = new Float32Array(pcm24k.length);
    for (let i = 0; i < pcm24k.length; i++) {
      float24k[i] = pcm24k[i] / 32768.0;
    }

    // Resample with anti-aliasing filter
    const float8k = resampler.process(float24k);

    // Convert back to Int16Array
    const pcm8k = new Int16Array(float8k.length);
    for (let i = 0; i < float8k.length; i++) {
      pcm8k[i] = Math.max(
        -32768,
        Math.min(32767, Math.round(float8k[i] * 32768.0)),
      );
    }

    return pcm8k;
  } catch (e) {
    // Fallback to naive resampling if library fails
    console.warn(
      '[resample.error] falling back to naive resampler:',
      e.message,
    );
    return downsample24kTo8kLinear(pcm24k);
  }
}

// Session configuration (CORRECT - OpenAI only supports pcm16 output)
const sessionUpdate = {
  type: 'session.update',
  session: {
    voice: normalizeVoiceId(voice) ?? 'sage',
    modalities: ['audio', 'text'],
    output_audio_format: 'pcm16', // ONLY available format from OpenAI
    // output_audio_sample_rate: 24000  // Implicit, cannot be changed
    input_audio_format: 'g711_ulaw', // Correct for Twilio input
    turn_detection: { type: 'server_vad', silence_duration_ms: 1000 },
    tools,
    instructions,
  },
};

// When receiving realtime audio deltas (updated)
if (msg.type === 'response.output_audio.delta') {
  const pcm24k = new Int16Array(Buffer.from(msg.delta, 'base64').buffer);
  const pcm8k = downsample24kTo8kHighQuality(pcm24k); // Use high-quality resampler
  const mu = encodePcm16ToMuLaw(pcm8k);
  for (let i = 0; i < mu.length; i += 160) {
    enqueueMu(mu.subarray(i, i + 160));
  }
}
```

### Risks & Mitigations

- **Native dependency compilation:** `@samplerate/samplerate` requires native compilation which may fail in some environments.
  - _Mitigation:_ Provide fallback to WASM-based `audio-resampler` or pure JS implementation
  - _Mitigation:_ Add pre-compiled binaries for common platforms (Linux x64, macOS arm64/x64)

- **Increased CPU overhead:** High-quality resampling uses more CPU than naive averaging.
  - _Mitigation:_ Benchmark CPU usage in production-like environment (target: < 5% CPU per call)
  - _Mitigation:_ Use `SRC_SINC_MEDIUM_QUALITY` instead of `BEST_QUALITY` if latency becomes an issue

- **Processing latency:** Resampling adds computational delay to audio pipeline.
  - _Mitigation:_ Process audio in small chunks (160-sample frames) to minimize buffering
  - _Mitigation:_ Monitor end-to-end latency and rollback if it exceeds 120ms threshold

- **Library stability:** Third-party resampler could have bugs or edge cases.
  - _Mitigation:_ Keep naive resampler as emergency fallback (with logging)
  - _Mitigation:_ Add automated testing with known audio samples

- **Twilio jitter sensitivity:** Changes to audio pipeline could affect pacing.
  - _Mitigation:_ Maintain existing pacing queue (20ms ticker, PREBUFFER_FRAMES=2)
  - _Mitigation:_ Monitor Twilio WebSocket backpressure and buffer occupancy

### Testing Plan

#### Phase 1: Development Testing

1. **Unit tests for resampler:**
   - Test with known audio samples (sine waves at various frequencies)
   - Verify frequency response: 3.4kHz should be preserved, > 4kHz should be attenuated
   - Test edge cases: silence, clipping, very short buffers

2. **Integration testing:**
   - Record test calls with current (naive) resampling
   - Record test calls with new high-quality resampling
   - Generate spectrograms for both recordings to visualize aliasing reduction

3. **Performance benchmarking:**
   - Measure CPU usage per resampling operation
   - Measure processing latency (target: < 10ms per chunk)
   - Test with concurrent calls to verify scalability

#### Phase 2: Staging Validation

1. **End-to-end call testing:**
   - Place test calls through staging environment
   - Test both realtime and fallback TTS paths
   - Verify no audio dropouts or buffer underruns

2. **Quality comparison:**
   - Create standardized test script with variety of speech patterns
   - Record 10+ test calls with each resampler
   - Conduct blind A/B listening tests with 5+ participants
   - Calculate MOS scores (target: +1.0 point improvement)

3. **Monitoring validation:**
   - Verify all new logs and metrics are being emitted
   - Test alerting for resampling errors or high latency

#### Phase 3: Production Rollout

1. **Gradual rollout:**
   - Deploy behind feature flag (10% → 50% → 100% of calls)
   - Monitor audio quality metrics and latency at each stage
   - Rollback if MOS scores decrease or latency exceeds 120ms

2. **Post-deployment monitoring:**
   - Track CPU usage and call quality for 7 days
   - Collect customer feedback on audio quality
   - Document any issues and iterate if needed

### Implementation Recommendations

#### 1. Resampler Library Selection

**RECOMMENDED: `@samplerate/samplerate`**

- **Pros:**
  - Industry-standard libsamplerate (used by SoX, Audacity, etc.)
  - Excellent quality/latency tradeoff
  - Battle-tested in production audio applications
  - MIT License (permissive)
- **Cons:**
  - Requires native compilation (node-gyp)
  - May need pre-compiled binaries for deployment environments
- **Evaluation criteria:**
  - Install in dev environment and measure latency/quality
  - Test compilation on target deployment platform (verify it works)
  - If compilation fails, fallback to `audio-resampler` (WASM-based)

#### 2. MOS Testing Protocol

**Mean Opinion Score (MOS) - 5-point scale:**

- **5** - Excellent (imperceptible impairment)
- **4** - Good (perceptible but not annoying)
- **3** - Fair (slightly annoying)
- **2** - Poor (annoying)
- **1** - Bad (very annoying)

**Testing procedure:**

1. Create 5 standardized test scripts covering:
   - Male voice
   - Female voice
   - Fast speech
   - Slow speech with pauses
   - Background noise scenario
2. Record each script with both resamplers (10 recordings total)
3. Randomize playback order (blind test)
4. Have 5+ listeners rate each recording
5. Calculate average MOS for each resampler
6. **Success criterion:** New resampler MOS ≥ 4.0 AND improvement ≥ +1.0 vs naive

#### 3. Golden-Call Recordings

**Storage location:** `tests/fixtures/audio/golden-calls/`

**Create the following reference recordings:**

1. `golden-greeting.wav` - Assistant greeting (8kHz µ-law)
2. `golden-conversation.wav` - Full conversation with booking (8kHz µ-law)
3. `golden-fallback-tts.wav` - Fallback TTS sample (8kHz µ-law)

**Validation process:**

- After each code change, generate new recordings using same script
- Compare spectrograms visually
- Run automated frequency analysis (script in `tests/audio-analysis.js`)
- Ensure no regression in frequency response or THD

#### 4. Feature Flag Implementation

**Use environment variable for gradual rollout:**

```javascript
// Add to server/twilio-media-ws.js
const USE_HIGH_QUALITY_RESAMPLER =
  process.env.HIGH_QUALITY_RESAMPLER_ENABLED === 'true';
const RESAMPLER_ROLLOUT_PERCENTAGE = parseInt(
  process.env.RESAMPLER_ROLLOUT_PERCENTAGE || '100',
  10,
);

function shouldUseHighQualityResampler(callSid) {
  if (!USE_HIGH_QUALITY_RESAMPLER) return false;

  // Deterministic rollout based on call SID hash
  const hash = callSid
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 100 < RESAMPLER_ROLLOUT_PERCENTAGE;
}
```

**Rollout stages:**

- Stage 1: `RESAMPLER_ROLLOUT_PERCENTAGE=10` (1-2 days, monitor closely)
- Stage 2: `RESAMPLER_ROLLOUT_PERCENTAGE=50` (2-3 days, collect data)
- Stage 3: `RESAMPLER_ROLLOUT_PERCENTAGE=100` (full rollout)
- Emergency rollback: `HIGH_QUALITY_RESAMPLER_ENABLED=false`

#### 5. Current Configuration Validation

The existing configuration in `server/twilio-media-ws.js` is **already correct**:

- ✅ `output_audio_format: 'pcm16'` (line 198) - Correct, only option available
- ✅ `input_audio_format: 'g711_ulaw'` (line 199) - Correct for Twilio
- ✅ WebSocket compression disabled (line 64) - Good for latency
- ✅ TCP_NODELAY enabled (line 66) - Good for latency
- ✅ Pacing queue with prebuffer (lines 144-166) - Good for jitter handling

**No changes needed to session configuration or WebSocket setup.** The ONLY change required is replacing the `downsample24kTo8kLinear` function.
