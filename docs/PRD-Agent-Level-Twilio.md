
# PRD: Agent-Level Twilio Configuration

**Author:** Gemini
**Date:** 2025-09-20
**Status:** In Progress

## 1. Overview

This document outlines the requirements for moving Twilio configuration from the account (organization) level to the individual agent level. This change will allow users to assign different Twilio accounts and phone numbers to different agents, enabling more flexible and granular control over voice and SMS communications.

## 2. Background

Currently, the platform uses a single Twilio account for all agents within an organization. This is limiting for users who want to:

*   Use different phone numbers for different agents or departments.
*   Track Twilio usage and costs on a per-agent basis.
*   Isolate Twilio configurations for different teams or use cases.

By moving Twilio configuration to the agent level, we will empower our users with greater flexibility and control over their telephony infrastructure.

## Change Log

- 2025-09-20: Revised milestones for agent-first rollout, encryption at rest, org-level fallback and observability. Added sections 7–19 (Reality Check, Architecture, Data Model, API, Outbound Logic, UI, Encryption, Observability, Migration, Security Notes, Testing, Acceptance Criteria, Risks).

## 3. Goals

*   Allow users to connect a unique Twilio account to each agent.
*   Store Twilio credentials securely for each agent.
*   Update the agent settings UI to include Twilio configuration.
*   Modify the outbound call process to use the correct Twilio credentials for each agent.
*   Ensure that Twilio webhooks can be securely handled for each agent.

## 4. Non-Goals

*   This project will not address the current webhook security implementation. A separate initiative will be created to address this.
*   This project will not introduce any changes to the inbound call routing logic.

## 5. Milestones

### Milestone 1: Database Schema Changes

**Sub-milestones:**

*   [x] 1.1: Create a new `agent_twilio_settings` table (agent-scoped). Store Twilio Account SID, encrypted Auth Token, and phone number per agent.
*   [x] 1.2: Add FKs to `agent_configurations(id)` and `organizations(id)`; enforce `UNIQUE(agent_id)` and consider `UNIQUE(organization_id, phone_number)` to prevent number collisions within an org.
*   [x] 1.3: Add RLS policies mirroring `organization_members` permissions (read for members, write for admin/owner) and indexes for `agent_id`, `organization_id`, and `phone_number`.
*   [ ] 1.4: Do NOT drop `twilio_settings` yet. Keep it during migration for fallback and gradual rollout.
*   [ ] 1.5: Optional backfill: seed the default agent’s settings from `twilio_settings` to accelerate adoption.

**Pseudocode (SQL):**

```sql
-- Create the new agent_twilio_settings table
CREATE TABLE IF NOT EXISTS public.agent_twilio_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agent_configurations(id) ON DELETE CASCADE,
  account_sid TEXT NOT NULL,
  auth_token_encrypted TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  encryption_version TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
  -- optionally: UNIQUE (organization_id, phone_number)
);

-- RLS policies (examples)
ALTER TABLE public.agent_twilio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read agent twilio settings" ON public.agent_twilio_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_twilio_settings.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage agent twilio settings" ON public.agent_twilio_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_twilio_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_twilio_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner','admin')
    )
  );

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_agent_twilio_agent_id ON public.agent_twilio_settings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_twilio_org_id ON public.agent_twilio_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_twilio_phone ON public.agent_twilio_settings(phone_number);
```

### Milestone 2: Backend API Changes

**Sub-milestones:**

*   [x] 2.1: Create new API endpoints for managing agent-level Twilio settings (CRUD):
    * `POST /api/agents/[agent_id]/twilio`
    * `GET /api/agents/[agent_id]/twilio`
    * `DELETE /api/agents/[agent_id]/twilio`
    - Validate inputs (Account SID, E.164 phone number), mask token on GET, and encrypt token at rest.
    - Enforce permissions via RLS and server-side checks (org membership and admin/owner role for write).
*   [x] 2.2: Implement at-rest encryption for the `auth_token_encrypted` field using AES‑256‑GCM (`lib/security/crypto.encrypt`), and store `encryption_version`.
*   [x] 2.3: Update outbound call routes to be agent-first with org-level fallback.
    - Resolve credentials in the route (not inside the adapter) by `agentId` → `agent_twilio_settings`, else fallback to `twilio_settings` (feature-flagged during migration).
    - Persist `call_sid`, `agent_id`, and `organization_id` when initiating calls to enable status mapping.

**Notes:** Keep `TwilioTelephonyAdapter` stateless regarding persistence. The adapter only receives a `TwilioConfig` via constructor or `setConfig`.

### Milestone 3: Frontend UI Changes

**Sub-milestones:**

*   [x] 3.1: Create a new `AgentTwilioSettingsForm` component (agent-scoped), modeled on `TwilioIntegrationForm`, with masked token behavior and clear validation states.
*   [x] 3.2: Integrate `AgentTwilioSettingsForm` into `app/agent-settings/page.tsx`; show a notice if the agent lacks configuration.
*   [x] 3.3: Keep the org-level `TwilioIntegrationForm` temporarily with a banner indicating: “Agent-level Twilio overrides org-level during migration.” Remove later.

**Pseudocode (React):**

```typescript
// app/agent-settings/AgentTwilioSettingsForm.tsx

export default function AgentTwilioSettingsForm({ agentId }: { agentId: string }) {
  // ... state for form fields, loading, error, etc. ...

  useEffect(() => {
    // Load existing Twilio configuration for the agent
    const loadTwilioConfig = async () => {
      const response = await fetch(`/api/agents/${agentId}/twilio`);
      // ... handle response ...
    };
    loadTwilioConfig();
  }, [agentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ...
    const response = await fetch(`/api/agents/${agentId}/twilio`, {
      method: 'POST',
      // ... body with form data ...
    });
    // ... handle response ...
  };

  // ... JSX for the form ...
}
```

### Milestone 4: Testing and Deployment

**Sub-milestones:**

*   [ ] 4.1: Unit tests: agent-level API CRUD, masking logic, permission paths, encryption/decryption roundtrip.
*   [ ] 4.2: Integration tests: outbound call flow (agent-first), org-fallback behavior, status webhook updates tied to `call_sid` + `agent_id`.
*   [ ] 4.3: E2E/UI tests: AgentTwilioSettingsForm create/update/delete and call gating.
*   [ ] 4.4: Staged deployment with feature flag to enable/disable org-level fallback.
*   [ ] 4.5: Observability: emit metrics for agent-level call initiation and fallback usage; audit logs on config changes (redacted).

## 6. Rollback Plan

In the event of a critical issue, we will revert the database schema changes and redeploy the previous version of the application. The following steps will be taken:

1.  Restore the `twilio_settings` table from a backup.
2.  Revert the database migration that created the `agent_twilio_settings` table.
3.  Revert the application code to the previous version.
4.  Redeploy the application.

## 7. Reality Check (Current State)

- Data tables in use today:
  - `twilio_settings` (organization-scoped): read by settings API and outbound call routes.
  - `agent_configurations` (agents exist and link to organizations).
  - `calls` / `call_logs`: call records; ensure we capture `agent_id` + `call_sid` on initiation.
- UI/Backend:
  - Org-level `TwilioIntegrationForm` under `app/settings`.
  - Outbound call APIs fetch org-level settings and inject config into `TwilioTelephonyAdapter`.
  - Adapter remains DB-agnostic and consumes injected `TwilioConfig`.

Implication: introduce `agent_twilio_settings`, agent-scoped API, outbound agent-first resolution, and UI for agent-level config.

## 8. Architecture Changes

- Responsibilities:
  - API routes resolve credentials (agent-first, org-fallback). Adapter remains pure (no DB I/O).
- Call initiation:
  - Prefer requiring `agentId` on outbound calls.
  - Persist `call_sid`, `agent_id`, `organization_id` to map status callbacks reliably.

## 9. Data Model (Agent-Level Twilio)

- Table: `agent_twilio_settings`
  - Columns: `id`, `organization_id`, `agent_id`, `account_sid`, `auth_token_encrypted`, `phone_number`, `encryption_version`, timestamps.
  - Constraints: `UNIQUE(agent_id)`; consider `UNIQUE(organization_id, phone_number)`.
  - Indexes: by `agent_id`, `organization_id`, `phone_number`.
- RLS: org members can read; admin/owner can write (mirror `organization_members`).
- Backfill: optionally seed default agent from org-level `twilio_settings`.
- Keep `twilio_settings` during migration; deprecate later.

## 10. API Design

- Endpoints:
  - `POST /api/agents/[agent_id]/twilio`: upsert agent config; encrypt token; validate inputs.
  - `GET /api/agents/[agent_id]/twilio`: return `accountSid`, `phoneNumber`, masked `authToken`.
  - `DELETE /api/agents/[agent_id]/twilio`: disconnect agent config.
- Permissions: verify org membership + role; rely on RLS and server-side checks.
- No DB in adapter; resolve creds in routes and inject into the adapter.

## 11. Outbound Call Logic

- Require or strongly prefer `agentId` in request.
- Resolve credentials:
  - Try `agent_twilio_settings` by `agentId`.
  - Fallback to org `twilio_settings` during migration (feature-flagged).
- Persist initiation with `call_sid`, `agent_id`, `organization_id` for reliable status handling.

## 12. Frontend UI

- `AgentTwilioSettingsForm`: agent page component with masked token, validation, and clear error states.
- Integrate into `app/agent-settings/page.tsx`; gate call triggers if agent lacks config.
- Keep org-level `TwilioIntegrationForm` with a migration banner; remove after adoption.

## 13. Encryption & Key Management

- Use AES‑256‑GCM via `lib/security/crypto.encrypt` for `auth_token_encrypted`.
- Add `encryption_version` for future rotations.
- Enforce `WEBHOOK_ENCRYPTION_KEY` (32 bytes / 64 hex) in production; fail fast if missing.
- Never log raw secrets; redact in audit logs.

## 14. Observability & Auditing

- Audit `agent_twilio_settings` CRUD with `resource_id = agent_id` and redacted fields.
- Emit metrics for agent-level vs fallback calls to monitor rollout.

## 15. Migration & Rollout Plan

- Phase 1: Create table + RLS + indexes; add API and UI; agent-first resolution with org fallback behind a flag.
- Phase 2: Optional backfill for default agent; UI banner nudging migration.
- Phase 3: Disable fallback by default; deprecate org-level UI.
- Phase 4: Remove org-level codepaths; drop `twilio_settings` only after data migration and comms.

## 16. Security Notes

- Out of scope here but strongly recommended:
  - Validate Twilio `X-Twilio-Signature` on inbound webhooks to prevent spoofing.
  - Rate limit webhook endpoints and maintain redacted logging as implemented in `lib/security/webhook.ts`.

## 17. Testing

- Unit: API CRUD, masking, permissions, encryption roundtrip.
- Integration: outbound call (agent-first), fallback, status updates mapped via `call_sid`.
- UI/E2E: Agent form flows and call gating.

## 18. Acceptance Criteria

- Unique Twilio credentials can be configured per agent; tokens are masked on read and encrypted at rest.
- Outbound calls use the correct agent’s credentials when `agentId` is provided.
- Fallback to org-level works (when feature flag enabled) if agent config is missing during migration.
- `call_logs`/`calls` records capture `agent_id` + `call_sid` at initiation.
- No raw secrets stored or logged; production requires valid encryption key.

## 19. Risks & Mitigations

- Risk: Confusion between org-level and agent-level settings.
  - Mitigation: UI banner, documentation, temporary fallback window.
- Risk: Number collisions across agents.
  - Mitigation: Add org-scoped uniqueness on `phone_number`.
- Risk: Secret handling drift.
  - Mitigation: Enforce key checks and track `encryption_version` for rotation.
