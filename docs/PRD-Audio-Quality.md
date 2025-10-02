# Twilio Audio Fidelity Recovery PRD

## Summary

- Investigated Twilio media bridge, shared µ-law helpers, and fallback greeting pipeline to identify the cause of low PSTN audio fidelity.
- Determined that naive downsampling of OpenAI's 24 kHz PCM output without low-pass filtering introduces audible aliasing and compression artifacts.
- Documented a recovery plan that replaces naive resampling with high-quality signal processing to preserve audio fidelity while maintaining the required 24 kHz → 8 kHz conversion.

## CRITICAL UPDATE: OpenAI API Format Options

OpenAI's Realtime API supports `g711_ulaw` output. We now configure Realtime to output μ-law 8 kHz and pass audio through directly to Twilio.

- Output formats used: `g711_ulaw` (primary), `pcm16` (fallback/testing)
- Input formats: `g711_ulaw`, `pcm16`

Therefore, the primary path no longer resamples locally. We retain a high-quality resampler for the fallback path only when `pcm16` is used.

## Root Cause Analysis

- **Original issue (fixed):** We previously downsampled 24 kHz PCM to 8 kHz and then µ-law encoded, which caused aliasing and choppiness due to naive resampling and timing gaps.
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

**PRIMARY FIX: Switch to μ-law passthrough (no local resampling)**

1. **Configure Realtime for g711_ulaw output:**
   - OpenAI emits μ-law 8 kHz; we forward deltas directly to Twilio.
   - Removes local resampling and reduces CPU/latency.

2. **Exact-frame handling and pacing:**
   - For passthrough: forward deltas immediately (no ticker).
   - For fallback path: emit exact 160-byte μ-law frames with carry-over; prebuffer ~100 ms; fill underflows with μ-law silence.

3. **Fallback path retained:**
   - If `pcm16` is used, apply high-quality resampling (libsamplerate preferred; FIR decimator fallback).
   - TTS fallback uses robust WAV header parsing and high-quality path when resampling is needed.

4. **Add observability:**
   - Log resampling method and latency per frame
   - Monitor for audio dropouts or buffer underruns
   - Add frequency analysis in test environment to verify no aliasing

### Milestones & Acceptance Criteria

1. **μ-law Passthrough Integration**
   - [x] Configure Realtime for `g711_ulaw` output and pass-through to Twilio
   - [x] Remove resampling from primary path; keep fallback only
   - [x] Measure end-to-end latency and CPU (target: negligible vs resampling)

2. **Frame Handling & Pacing**
   - [x] Add carry-over for exact 160-byte frames; μ-law silence fill on underflow
   - [x] Increase prebuffer to ~100 ms for smoother starts
   - [x] Disable ticker in passthrough mode; forward immediately

3. **Fallback TTS Pipeline Update**
   - [x] Robust RIFF/WAV parsing for correct sample rate
   - [x] Use high-quality resampling only when `pcm16` fallback is in effect
   - [ ] Validate fallback audio quality matches passthrough quality

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
   - [x] Add structured logs for resampler selection and performance
   - [x] Log processing latency per audio chunk
   - [ ] Add counters for buffer underruns or resampling errors
   - [ ] Create dashboard for audio quality metrics in production

### Pseudocode Sketch

```javascript
// Session configuration (μ-law passthrough)
const sessionUpdate = {
  type: 'session.update',
  session: {
    voice: normalizeVoiceId(voice) ?? 'sage',
    modalities: ['audio', 'text'],
    output_audio_format: 'g711_ulaw',
    input_audio_format: 'g711_ulaw',
    turn_detection: { type: 'server_vad', silence_duration_ms: 1000 },
    tools,
    instructions,
  },
};

// When receiving realtime audio deltas (passthrough)
if (msg.type === 'response.audio.delta' && msg.delta) {
  // Forward μ-law base64 directly to Twilio
  ws.send(
    JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: msg.delta },
    }),
  );
}

// Fallback path (if using pcm16): resample to 8k and encode μ-law with exact 160-byte frames
// - Use high-quality resampling (libsamplerate preferred; FIR fallback)
// - Maintain a carry buffer and fill underflows with μ-law silence to keep pacing steady
```

### Risks & Mitigations

- **Passthrough timing jitter:** Irregular delta cadence can cause audible gaps if not paced.
  - _Mitigation:_ In fallback path, prebuffer ~100 ms, emit exact 160-byte frames with carry-over, and fill underflows with μ-law silence. Passthrough path forwards immediately.

- **Fallback resampler complexity:** Only used when `pcm16` is required.
  - _Mitigation:_ Prefer libsamplerate (WASM/native) with FIR fallback; keep clear logs and error handling.

- **Processing latency:** Keep additional latency ≤ 120 ms end-to-end.
  - _Mitigation:_ Avoid local resampling in primary path; monitor pacing and queue occupancy.

### Testing Plan

#### Phase 1: Development Testing

1. **Unit tests for resampler:**
   - Test with known audio samples (sine waves at various frequencies)
   - Verify frequency response: 3.4kHz should be preserved, > 4kHz should be attenuated
   - Test edge cases: silence, clipping, very short buffers

2. **Integration testing:**
   - Record test calls with previous (naive) resampling
   - Record test calls with μ-law passthrough primary path
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

**Target Quality: libsamplerate‑grade sinc resampling**

- Default runtime selection: `RESAMPLER=auto` (prefers libsamplerate when installed; falls back to FIR)
- Force testing libsamplerate: `RESAMPLER=libsamplerate`
- Force FIR baseline: `RESAMPLER=fir`

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

#### 4. Rollout Notes

Primary path (μ-law passthrough) is the default. Fallback path is exercised only when `pcm16` is used for testing or alternative scenarios.

#### 5. Current Configuration Validation

The current configuration in `server/twilio-media-ws.js` reflects the new primary path:

- ✅ `output_audio_format: 'g711_ulaw'` — passthrough to Twilio
- ✅ `input_audio_format: 'g711_ulaw'` — correct for Twilio input
- ✅ WebSocket compression disabled — good for latency
- ✅ TCP_NODELAY enabled — good for latency
- ✅ Passthrough forwards deltas immediately; fallback path uses prebuffer and exact 20 ms frames

Primary behavior requires no local resampling; fallback retains high-quality resampler.
