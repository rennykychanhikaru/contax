# Agent-Level Twilio — Smoke Test

Use this checklist to validate per-agent Twilio configuration, agent-first outbound routing with org-level fallback, and encrypted storage.

## Prerequisites
- Env vars set in `.env.local` (restart `npm run dev` after changes):
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `WEBHOOK_ENCRYPTION_KEY` = 64 hex chars (32 bytes). Example: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - `NEXT_PUBLIC_APP_URL` = public HTTPS URL (e.g., ngrok) if you want Twilio callbacks to succeed.
- Twilio credentials and an E.164 phone number you control.
- Services: `npm run dev` (app) and local Supabase running (migrations applied).

## 1) Get an Agent ID
- In Supabase SQL: `select id, organization_id from public.agent_configurations where name = 'default';`
- Copy the `id` value as `{agentId}`.

## 2) Configure Agent-Level Twilio (UI)
- Visit `/agent-settings`.
- In “Agent Twilio Integration”:
  - Enter Account SID (starts with AC, 34 chars), Auth Token, and Phone Number (E.164).
  - Click “Save Configuration”.
  - Refresh: token shows masked as `********************************`.

Or via API:
- POST: `curl -X POST http://localhost:3000/api/agents/{agentId}/twilio -H 'Content-Type: application/json' -d '{"accountSid":"AC...","authToken":"...","phoneNumber":"+15551234567"}'`
- GET:  `curl http://localhost:3000/api/agents/{agentId}/twilio`
- DELETE: `curl -X DELETE http://localhost:3000/api/agents/{agentId}/twilio`

## 3) Verify Encryption at Rest
- SQL: `select account_sid, auth_token_encrypted, phone_number from public.agent_twilio_settings where agent_id = '{agentId}';`
- Confirm `auth_token_encrypted` looks like `iv:tag:ciphertext` (two colons) and is not plaintext.

## 4) Place an Outbound Call (Agent-First)
- Using trigger-call route (flexible):
  - `curl -X POST http://localhost:3000/api/webhook/trigger-call -H 'Content-Type: application/json' -d '{"agentId":"{agentId}","phoneNumber":"+1NNNNNNNNNN","context":{"note":"smoke test"}}'`
- Or outgoing-call route:
  - `curl -X POST http://localhost:3000/api/webhook/outgoing-call -H 'Content-Type: application/json' -d '{"agentId":"{agentId}","phoneNumber":"+1NNNNNNNNNN"}'`
- Expected:
  - 200 JSON with `success: true` and Twilio Call SID present (in trigger-call response).
  - New call logs created: `calls` (trigger-call) and/or `call_logs` (outgoing-call).

## 5) Confirm Logs
- `select * from public.calls order by created_at desc limit 5;`
- `select * from public.call_logs order by created_at desc limit 5;`
- Expect new rows with your callee number; `call_logs` should include the Twilio `call_sid`.

## 6) Test Org-Level Fallback (Optional)
- Delete agent settings: `curl -X DELETE http://localhost:3000/api/agents/{agentId}/twilio`
- Ensure org-level `twilio_settings` exists (UI `/settings` or SQL `select * from public.twilio_settings;`).
- Re-run step 4. Expected: call still places using org-level credentials.

## 7) Negative Cases
- Invalid SID (not `AC...`, len != 34) → POST returns 400.
- Missing token on initial connect (token = masked) → POST returns 400.
- Non-E.164 phone number → POST returns 400 with guidance.

## 8) Troubleshooting
- No status updates: ensure `NEXT_PUBLIC_APP_URL` is public (ngrok), callbacks hit `/api/webhook/call-status`.
- “Twilio settings not found”: confirm agent-level row or org-level fallback exists.
- Encryption errors: verify `WEBHOOK_ENCRYPTION_KEY` is set to a 64-hex string and restart the app.
