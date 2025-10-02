# Makerkit

This repository contains Open Source code used in the [Makerkit](https://makerkit.dev) SaaS Starter Kits.

This repository uses Nrwl Nx to manage the monorepo.

## Packages

Packages are published to the [Makerkit NPM Organization](https://www.npmjs.com/org/makerkit).

You'll find the packages under the `packages` directory.

Currently, the following packages are available:

1. [Core Data Loader SDK for Supabase](https://github.com/makerkit/makerkit/tree/main/packages/data-loader/supabase/core)
2. [Next.js Data Loader SDK for Supabase](https://github.com/makerkit/makerkit/tree/main/packages/data-loader/supabase/nextjs)
3. [Remix Data Loader SDK for Supabase](https://github.com/makerkit/makerkit/tree/main/packages/data-loader/supabase/remix)
4. [QStash Task Queue](https://github.com/makerkit/makerkit/tree/main/packages/qstash)

## Docs

- Agent-Level Twilio: see `docs/SMOKE-TEST-AGENT-TWILIO.md` for a smoke test guide covering per-agent configuration, agent-first outbound routing with org fallback, and encrypted storage verification.

## Media Stream Auth Rollout (Twilio WS)

To protect the Twilio Media Streams WebSocket, the Next.js app (TwiML signer) now attaches a short‑lived HMAC token, and the Node WS bridge verifies it.

- Purpose: Prevent unauthorized clients from connecting to the media stream if the WS URL becomes known.
- How: Next signs a 5‑minute token using `STREAM_AUTH_SECRET` and sends it as `<Parameter name="auth" ...>` on `<Connect><Stream>`. The Node server validates signature and expiry.

Rollout (no downtime):

- Step 1 (Signer): Add `STREAM_AUTH_SECRET` to Vercel and local `.env.local`, then redeploy the Next app. Calls include the token; the WS still accepts without verification if it has no secret.
- Step 2 (Verifier): Add the same `STREAM_AUTH_SECRET` to Fly via `fly secrets set STREAM_AUTH_SECRET="..."`. The WS starts enforcing verification.
- Backout: Unset the Fly secret to disable verification immediately.

Generate a secret:

- Node: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

Where to set it:

- Vercel → Project → Settings → Environment Variables → `STREAM_AUTH_SECRET`
- Fly.io → `fly secrets set STREAM_AUTH_SECRET="..."`
- Local dev → `.env.local`: `STREAM_AUTH_SECRET=...`

Notes:

- Keep the value identical across Next (Vercel) and Node WS (Fly).
- Ensure clocks are reasonably in sync; tokens expire after ~5 minutes.
