# PRD: Homepage Agent Creation

**Author:** ChatGPT
**Date:** 2024-05-18
**Status:** Draft

## 1. Overview

This document defines the requirements for enabling users to create additional agents directly from the homepage. The feature introduces a dedicated **[+ New Agent]** control above the Demo Agent card on the right side of the interface. Newly created agents must inherit the Demo Agent's default configuration (prompt, greeting message, and disabled integrations) while remaining self-contained for future customization.

## 2. Background

Today, the homepage shows a single Demo Agent that acts as a reference configuration. Users who want more than one agent need a manual back-office process that is error-prone and slow. By allowing self-serve agent creation, we accelerate experimentation with multiple personas while ensuring consistent defaults that avoid accidentally enabling integrations (Twilio, webhooks, or calendar) that require extra setup.

## 3. Goals

- Let users add new agents from the homepage without navigating away.
- Ensure each new agent duplicates the Demo Agent's core settings: prompt text, greeting, and all integrations disabled (no Twilio, webhook, or calendar connections).
- Display each agent in an independent container/card so that edits and controls remain scoped per agent.
- Keep the UI intuitive and aligned with existing design patterns.

## 4. Non-Goals

- Editing or customizing inherited settings beyond the initial duplication (covered by existing agent editing flows).
- Introducing Twilio, webhook, or calendar integrations for new agents.
- Changing authentication, permissions, or organization-level agent limits (assume current guardrails remain).
- Building agent templates beyond the Demo Agent clone.

## 5. User Personas & Stories

_As a new workspace owner_, I want to press **[+ New Agent]** to spin up a second agent that behaves like the Demo Agent so I can try new prompts quickly.

_As an operator experimenting with messaging_, I want every new agent to start with the same safe defaults (no external integrations) so I do not need to audit settings for compliance.

_As a returning customer success manager_, I want agents to display in isolated cards so I can manage each agent's controls independently without visual clutter.

## 6. Functional Requirements

1. **Placement & Control**
   - Add a **[+ New Agent]** button above the Demo Agent card on the right side of the homepage agent list/column.
   - Button is visible to users who currently have permission to view the Demo Agent.

2. **Creation Workflow**
   - Clicking the button creates a new agent record client-side, then persists via the existing agent creation API (or a new endpoint if required).
   - The new agent inherits the Demo Agent's settings at the moment of creation:
     - Prompt text / system message.
     - Greeting / opening message.
     - Integration flags set to disabled for Twilio, webhooks, and calendar.
   - Assign a default name pattern (e.g., "Agent 2", "Agent 3") with incremental numbering to avoid collisions. Users can rename later through existing flows.

3. **UI Representation**
   - Each agent (Demo + newly created) renders in its own card/container with scoped controls.
   - Cards stack vertically in the right-hand column; new agents appear directly below the Demo Agent by default.
   - Each card should show inherited settings summary (prompt snippet, greeting, integration status) consistent with Demo Agent presentation.

4. **Persistence & Data Integrity**
   - Creation is atomic—if persistence fails, display an error toast and roll back the optimistic UI card.
   - Ensure demo settings are duplicated at creation time (no shared references that could drift if Demo Agent is later edited).
   - Store a flag indicating the agent was cloned from the Demo template to aid analytics (optional but recommended).

5. **Permissions & Limits**
   - Respect existing workspace permissions—only authorized users can create agents.
   - Enforce organization-level agent quotas; if a limit is reached, disable the button and show contextual messaging.

## 7. UX & UI Considerations

- **Button Styling:** Match primary button style used elsewhere on the homepage. Include "+" icon.
- **Empty State:** If the Demo Agent is the only card, show subtle helper text near the button explaining that new agents copy Demo defaults.
- **Loading State:** Display an inline spinner or skeleton in the new agent card while creation request is pending.
- **Success Feedback:** Show a brief toast (e.g., "Agent created with Demo defaults") once the backend confirms persistence.
- **Responsive Layout:** On smaller viewports, ensure the button remains visible above the agent stack and that cards maintain adequate spacing.

## 8. Technical Considerations

- **Data Source:** Fetch the current Demo Agent configuration before or during creation; consider caching it client-side to minimize extra requests.
- **API:** If no agent creation endpoint exists, add `POST /api/agents` (or equivalent) that accepts a payload derived from the Demo Agent with overrides for `name` and default flags.
- **Integration Flags:** Explicitly set `twilioEnabled=false`, `webhookEnabled=false`, and `calendarEnabled=false` in the payload to prevent accidental inheritance if the Demo Agent changes later.
- **State Management:** Ensure each card instance uses unique IDs to prevent React key collisions.
- **Testing:** Add unit coverage for the cloning logic and integration tests ensuring the backend stores disabled integrations.

## 9. Analytics & Telemetry

- Track button clicks (`homepage.new_agent.clicked`).
- Track successful creations with metadata (agent_id, source = "demo_clone").
- Monitor error rates and latency for the creation API.
- Optional: measure how often users rename or edit prompts post-creation to inform template improvements.

## 10. Rollout Plan

1. Implement backend cloning logic and tests behind a feature flag (`homepage_agent_creation`).
2. Ship UI with flag gating to internal users for validation.
3. Collect QA feedback and ensure analytics events fire.
4. Gradually enable flag for production tenants (start with low-risk accounts).
5. Provide documentation/tooltip updates explaining Demo inheritance.

## 11. Risks & Mitigations

| Risk                                                                        | Mitigation                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Demo Agent lacks required fields (prompt/greeting) leading to blank clones. | Enforce validation that Demo Agent defaults are present; fall back to system defaults if missing.    |
| Users exceed agent quota rapidly.                                           | Surface clear messaging and consider soft limits or throttling.                                      |
| Future Demo Agent changes should not retroactively update clones.           | Clone by value, not by reference; store creation timestamp and template source.                      |
| Confusion about disabled integrations.                                      | Show integration status badges/icons within each card to reinforce that channels are off by default. |

## 12. Acceptance Criteria

- [+ New Agent] button appears above the Demo Agent card on the homepage for authorized users.
- Creating an agent duplicates Demo Agent prompt, greeting, and disabled Twilio/webhook/calendar settings.
- New agent cards render independently with accurate inherited information.
- Backend stores cloned configuration with integrations disabled and unique agent name.
- Analytics events emit for button click and successful creation.
- Errors during creation show user-friendly feedback and do not leave phantom agents.

## 13. Open Questions

- Should we allow choosing a template other than the Demo Agent in future iterations?
- Are there workspace-specific limits we must expose in the UI (e.g., max 5 agents)?
- Do we need audit logging for agent creation events today, or is existing logging sufficient?
