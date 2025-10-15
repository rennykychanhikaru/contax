# Runbook: Super Admin Operations

## Purpose

Provide a repeatable procedure for handling administrative actions in production (feature toggles, account disable/enable, break-glass events) with auditable outcomes and clear escalation paths.

## Contacts & Escalation

- **Primary On-Call:** Security Engineer (PagerDuty schedule `SEC-ONCALL`).
- **Secondary:** Platform Engineering On-Call.
- **Slack Channels:** `#security-oncall` (primary), `#platform-ops` (secondary).
- **Ticketing:** Log every administrative change in Jira project `SECOPS`.

## Preconditions

1. Operator is on VPN / Zero Trust proxy.
2. Operator has hardware key or TOTP configured for step-up MFA.
3. `super-admin-panel` feature flag is enabled. If disabled, coordinate with platform eng before proceeding.

## Standard Operating Procedures

### Feature Toggle Change

1. Review Jira change request and confirm rollback plan.
2. Navigate to `/admin/feature-flags`, locate the relevant flag.
3. Validate the flag’s current state and overrides.
4. Toggle global state or add/remove overrides as required.
5. Capture screenshot of confirmation toast and attach to the Jira ticket.
6. Monitor the `/admin/feature-flags` analytics panel or relevant dashboards for anomalies.
7. Update Jira ticket with action timestamp and audit log ID.

### Account Disable / Enable

**Disable**

1. Validate requestor authorization (support ticket / Slack justification).
2. From `/admin/accounts`, locate the account and click **Disable**.
3. Provide detailed reason (e.g., “Suspicious activity ticket SEC-1234”).
4. Confirm toast and verify audit entry in Activity.
5. Notify requestor and attach CSV export if required.

**Enable**

1. Confirm remediation steps are complete and approved.
2. Select the account and click **Enable**.
3. Monitor for immediate errors; if the account was break-glass disabled, ensure overrides are cleared.

### Break-Glass Procedure

1. Open the account detail and record current override list.
2. Issue a new override to the designated responder, set duration ≤ 120 minutes.
3. Share temporary password using approved secret channel (1Password secure note).
4. Create high-priority alert via Slack `#security-oncall` announcing break-glass activation.
5. After remediation, revoke the override, rotate credentials, and ensure user flags are restored.
6. Export audit log covering the interval and attach to post-incident review.

### Audit Log Export

1. Navigate to `/admin/activity`.
2. Apply relevant filters (dates, action types, admin user IDs).
3. Export CSV; store in incident folder within shared drive (`SECOPS/Incidents/{ticket}`).

## Emergency Response

**Scenario: Compromised Admin Session**

1. Revoke active session via Supabase Studio (`auth.sessions` delete) or SQL helper.
2. Disable affected account(s).
3. Rotate credentials (force password reset) and follow break-glass procedure if access needed.
4. Initiate incident response (IR) workflow; escalate to security manager.

**Scenario: Feature Flag Regression**

1. Immediately toggle the flag back to previous state.
2. Notify platform on-call; pull audit log entry for context.
3. Coordinate rollback communication via `#status`.

## Post-Operations Checklist

- [ ] Ticket updated with action summary and audit log reference IDs.
- [ ] CSV exports stored in secure folder.
- [ ] Stakeholders notified in Slack.
- [ ] Any temporary credentials/overrides revoked.

## Tooling Notes

- Supabase migrations must be current: `npm run supabase:migrate`.
- Regenerate types after schema changes: `npm run typegen`.
- Run unit tests before production changes: `npm run test`.
- Optional E2E smoke test: `PLAYWRIGHT_RUN_ADMIN_E2E=true npm run test:e2e` (requires staged credentials).

## Revision History

| Date       | Author                | Notes                                    |
| ---------- | --------------------- | ---------------------------------------- |
| 2025-12-29 | Platform AI Assistant | Initial runbook drafted per Milestone 6. |
