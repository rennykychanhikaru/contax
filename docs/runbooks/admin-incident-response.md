# Super Admin Incident Response

Use this runbook for suspected compromise or misuse of the super-admin panel.

## Detection

- Alerts from `admin_api_events` (403 spikes, high error rates, break-glass bursts).
- Manual reports from operators or end users.
- Audit log anomalies (unexpected disables, override churn).

## Containment Steps

1. Notify security on-call and start an incident ticket (`SEC-IR-####`).
2. Immediately disable the `super-admin-panel` feature flag.
3. Revoke affected admin sessions:
   ```sql
   delete from auth.sessions where user_id = '<compromised-admin-id>';
   ```
4. Rotate passwords or enforce WebAuthn re-registration for impacted admins.
5. If abuse originated from bulk operations, verify account states and revert as needed.

## Eradication & Recovery

1. Execute `admin-backup-pitr.md` if data integrity is in doubt.
2. Review `admin_api_events` metadata to reconstruct timeline (download CSV via `/api/admin/audit/export`).
3. Patch vulnerabilities (e.g., disable offending route, add rate limits).
4. Re-enable panel behind feature flag for trusted admins only.

## Post-Incident

- Document root cause, timeline, blast radius in Jira ticket.
- Add necessary alerts/dashboards (see `admin-alerts.md`).
- Schedule tabletop exercise if the incident exposed process gaps.
- Update this runbook with lessons learned.

Escalation contacts: security manager, platform lead, CTO. Keep communications in `#security-oncall` with status updates every 30 minutes.
