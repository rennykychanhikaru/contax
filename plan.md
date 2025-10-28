# Updated Plan to Fix Voice Agent Latency

1.  **Fix the `ElevenLabs stream not connected` error:** I will modify the `handleOAIEvent` function in `lib/agent/openai-realtime.ts` to only handle the `response.audio_transcript.done` event for ElevenLabs. This will prevent the double flush issue.

2.  **Verify the fix:** I will ask you to test the voice agent again to verify that the issue is resolved.

3.  **Remove unnecessary code:** Once the fix is verified, I will remove the unnecessary code that I added to `lib/agent/openai-realtime.ts` and `server/voice/elevenlabs-stream.js`.
