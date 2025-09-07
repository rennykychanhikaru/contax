# Contax Demo Web (Next.js)

Local demo app showcasing a browser-based voice agent using OpenAI Realtime and a modal to edit the agent system prompt.

## Run

1. Set env vars (in `.env.local`):
```
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
```

2. Start dev server:
```
npm run demo:dev
```

## Notes

- The browser calls `/api/realtime/token` to obtain a short-lived Realtime session secret.
- Twilio PSTN integration will be added later via a media-bridge gateway.

