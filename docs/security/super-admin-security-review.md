# Super Admin Security Review Checklist

Complete quarterly or before major releases.

## Access Lifecycle

- [ ] Verify `accounts.is_super_admin = true` only for approved personnel (cross-check HR roster).
- [ ] Confirm step-up MFA (WebAuthn/TOTP) enrolled for every super admin.
- [ ] Review break-glass overrides (`account_break_glass_overrides`) for stale entries; revoke as needed.

## Telemetry & Alerts

- [ ] Inspect `admin_api_events` for anomalies (status ≥ 400, unusual metadata).
- [ ] Validate alert destinations (`admin-alerts.md`) and on-call rotation.
- [ ] Ensure dashboards (latency/error) reflect recent traffic.

## Configuration & Secrets

- [ ] Confirm feature flag defaults (disabled in prod until rollout).
- [ ] Audit env vars (Supabase keys, Slack webhooks) stored in secret manager.
- [ ] Run dependency vulnerability scan (e.g., `npm audit`, SCA tool).

## Testing & Documentation

- [ ] Playwright smoke (`npm run test:e2e`) executed against staging in the last 30 days.
- [ ] Runbook updates (`admin-incident-response`, `admin-backup-pitr`, `admin-rollout-plan`).
- [ ] Incident simulations conducted (tabletop or live drill) with notes captured.

## Sign-off

- Security reviewer name & date
- Outstanding issues & owners

Store completed checklists in the shared compliance drive (`GRC/Super-Admin`).
