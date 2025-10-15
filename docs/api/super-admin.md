# Super Admin API Reference

This cheat sheet summarizes the private endpoints surfaced through `docs/api/super-admin.yaml`. All routes require a valid Supabase session cookie and the caller must belong to an account flagged `is_super_admin`.

## Accounts

| Endpoint                                  | Method | Notes                                                                                                                                |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/admin/accounts`                     | `GET`  | Paging (`page`, `limit`), search by name, status filters (`status`, `superAdmin`, `hasBreakGlass`, `createdAfter`, `createdBefore`). |
| `/api/admin/accounts`                     | `POST` | Body `{ name, ownerEmail, temporaryPassword? }`. Creates an org, provisions owner credentials, logs `ACCOUNT_CREATED`.               |
| `/api/admin/accounts/{accountId}/disable` | `POST` | Body `{ reason }`. Marks account disabled and records the actor.                                                                     |
| `/api/admin/accounts/{accountId}/enable`  | `POST` | Re-enables a disabled account.                                                                                                       |

Bulk operations are available via `/api/admin/accounts/bulk-disable` and `/api/admin/accounts/bulk-enable` (max 10 IDs per request, hourly guardrails enforced).

## Feature Flags

| Endpoint                                                   | Method           | Notes                                                                                                             |
| ---------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/api/admin/feature-flags`                                 | `GET`            | Sorted list of flags.                                                                                             |
| `/api/admin/feature-flags`                                 | `POST`           | Body `{ flag_key, flag_name, target_type, description?, is_enabled? }`. Logs `FEATURE_FLAG_CREATED`.              |
| `/api/admin/feature-flags/{flagId}`                        | `PATCH`          | Partial update (`flag_name`, `description`, `is_enabled`, `target_type`). Writes analytics + audit entries.       |
| `/api/admin/feature-flags/{flagId}`                        | `DELETE`         | Removes the flag and logs `FEATURE_FLAG_DELETED`.                                                                 |
| `/api/admin/feature-flags/analytics`                       | `GET`            | Query params `flagKey`, `days` (default 30, max 180). Returns daily aggregates from `feature_flag_usage_summary`. |
| `/api/admin/feature-flags/{flagId}/overrides`              | `GET`/`POST`     | CRUD for account/user overrides.                                                                                  |
| `/api/admin/feature-flags/{flagId}/overrides/{overrideId}` | `PATCH`/`DELETE` | Toggle or remove overrides.                                                                                       |

## Audit & Notifications

| Endpoint                   | Method | Notes                                                                                          |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `/api/admin/audit/export`  | `GET`  | Returns CSV with optional filters (`start`, `end`, `actionType`, `adminUserId`, `targetType`). |
| `/api/admin/notifications` | `GET`  | Lightweight feed of recent audit events (limit default 5, max 20).                             |
| `/api/admin/check-access`  | `GET`  | Verifies session + super-admin privileges and feature flag gating.                             |

Realtime notifications are delivered via Supabase Realtime subscription to `admin_audit_log`—the feed is bootstrapped by calling `/api/admin/notifications`.

## Security Notes

- Every request must originate from a session that has passed step-up MFA (WebAuthn or TOTP) and for which the `super-admin-panel` feature flag is enabled.
- RLS policies on Supabase tables gate access to super admins only. Service-role operations (e.g., bulk disables) are wrapped in guardrails (batch size & cadence).
- CSV exports and analytics queries run server-side; no direct table access is exposed in the browser.
