# Super Admin Rollout Plan

This staged rollout ensures changes to the super-admin panel ship safely from development to production.

## Environments & Gates

1. **Development** (local / preview)
   - Run `npm run test` and `npm run test:e2e` (with seeded admin credentials).
   - Verify telemetry rows appear in `admin_api_events`.
2. **Staging**
   - Apply migrations: `npx supabase migration up`.
   - Enable `super-admin-panel` flag for a staging admin.
   - Execute smoke script: `PLAYWRIGHT_RUN_ADMIN_E2E=true npm run test:e2e` against staging URL.
   - Export audit CSV and confirm formatting.
3. **Production**
   - Confirm on-call coverage (security + platform).
   - Re-run migrations with backup snapshot (see `admin-backup-pitr.md`).
   - Cherry-pick rollout checklist in Jira ticket.

## Deployment Steps

1. Announce maintenance window in `#platform-ops` and `#security-oncall`.
2. Apply migrations (`supabase migration up`). Record migration ID in ticket.
3. Deploy Next.js app (Vercel/GitHub Actions). Ensure env vars available.
4. Enable feature flag for pilot admins only. Monitor telemetry dashboard for 30 minutes.
5. Expand feature flag to all super admins once metrics look normal.

## Rollback Procedure

1. Disable feature flag (`super-admin-panel`) to block access.
2. Revert deployment (`git revert` + redeploy) or promote previous Vercel build.
3. Run migration rollback (if needed) or restore from PITR snapshot (see `admin-backup-pitr.md`).
4. Post-mortem: capture admin telemetry around failure window and attach to incident ticket.

## Checklist

- [ ] Tests & linting passed
- [ ] Migrations applied successfully
- [ ] Telemetry verified in target environment
- [ ] Feature flag staged rollout documented
- [ ] Rollback plan acknowledged by on-call

Record every rollout in the security change log with dates, operators, and validation steps.
