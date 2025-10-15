# Super Admin Panel – Operator Guide

The super admin panel is accessible only to approved security/operations staff. This guide covers daily tasks, escalation paths, and break-glass usage.

## Access Requirements

1. Your account must belong to an organization flagged `is_super_admin`.
2. The `super-admin-panel` feature flag must be enabled.
3. Step-up MFA is mandatory (WebAuthn hardware key preferred; Supabase TOTP accepted). Sessions without a recent MFA assertion are rejected.
4. Connect through the corporate VPN/Zero Trust proxy before visiting `/admin`.

Troubleshooting sign-in:

- If you land on “Step-up verification required,” reauthenticate at `/auth/sign-in` with hardware key or OTP.
- If you see “Super admin panel disabled,” enable the `super-admin-panel` feature flag or escalate to platform engineering.

## Feature Flags

1. Navigate to **Feature Flags**.
2. Use the search bar to locate the flag by key or name.
3. Toggle **Enabled** to change the global state. The action is logged (`FEATURE_FLAG_UPDATED`) and streamed to the toast feed.
4. To scope overrides:
   - Select the flag, then use **Add Override**.
   - Choose _Account_ (UUID) or _User_ (email/UUID).
   - Save. Audit log entries (`FEATURE_FLAG_OVERRIDE_UPSERTED`) are emitted and visible under Activity.
5. The **Usage analytics** panel shows daily evaluation counts (global + overrides). Refresh the data if you recently shipped code that touches the flag.

## Account Management

### Search & Filters

- Filters support status (active/disabled), super-admin designation, break-glass status, and creation windows. Combine filters to narrow results.
- Clearing the search box restores the full result set.

### Disable / Enable

1. Open **Accounts**.
2. Click an account row, then **Disable**.
3. Provide a reason; confirm. The action writes to `admin_audit_log` with metadata.
4. To reactivate, select the account and choose **Enable**. A toast confirms success.

### Bulk Operations

- Use the checkbox column to select up to 10 accounts.
- Choose **Bulk Disable** or **Bulk Enable**.
- Provide context (bulk disable requires reasons).
- Guardrails prevent more than one bulk batch per hour; the UI surfaces partial failures.

### Create New Account

1. Click **Create account**.
2. Provide the organization name and owner email.
3. Optionally specify a one-time password; otherwise one is generated.
4. After confirmation, copy the generated credentials and share via secure channel. The owner is forced to change the password on first login.

## Break-Glass Overrides

Break-glass allows temporary access to a disabled account.

1. From **Accounts**, open the desired account.
2. Click **Break glass overrides**.
3. Choose the target user (email must already belong to the account) and specify duration + reason.
4. Confirm; the system updates Supabase Auth credentials, sets `force_password_reset`, and stores the override record.
5. Once remediation finishes, revoke the override to trigger credential rotation.

## Activity & Audit

- **Activity** provides CSV exports. Use start/end dates plus filters for action type, admin user, or target type.
- Notifications appear in the real-time toast feed whenever an admin action is recorded. Dismiss individual toasts after review.
- For investigations, export the CSV and attach to the incident ticket.

## Break-Glass Runbook Summary

1. Disable the affected account (if not already disabled).
2. Issue break-glass override to the on-call operator with limited duration (default 2 hours).
3. Operator completes remediation, confirms resolution.
4. Revoke the override, rotate credentials, re-enable account if appropriate.
5. Document the event in the security log and update the ticket.

## Troubleshooting

| Symptom                                               | Resolution                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/admin` redirects to `/auth/sign-in` repeatedly      | Session expired; sign back in with MFA, ensure VPN is active.                                                                 |
| Feature flag toggle fails with a “view missing” error | Run latest Supabase migrations (`npm run supabase:migrate`) and regenerate types.                                             |
| Analytics panel shows no data                         | Ensure backend code calls `is_feature_enabled`; refresh after confirming migration `20251229_feature_flag_analytics.sql` ran. |
| Bulk disable locked by guardrail                      | Wait one hour or disable accounts individually; guardrails prevent accidental mass changes.                                   |
| Toast feed silent                                     | Confirm websocket connection (Supabase Realtime) via browser devtools; reload `/admin` to resubscribe.                        |

For production incidents contact the security on-call in Slack `#security-oncall` and attach the audit export.
