# Super Admin Alerting Guide

## Purpose

Provide actionable alert thresholds for the super-admin panel using the new `admin_api_events` telemetry. Alerts should surface within a few minutes and route to `#security-oncall`.

## Core Signals

| Signal                       | Threshold                                                                         | Action                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| High error rate              | `error_count > 5` in `admin_api_latency_summary` for any route within 15 minutes  | Page security on-call, review telemetry metadata, pull audit log CSV                             |
| Slow route                   | `p95_duration_ms > 2000` for any route over 30 minutes                            | Create ticket for platform engineering, investigate Supabase query, evaluate cache effectiveness |
| Break-glass spike            | ≥2 `BREAK_GLASS_GRANTED` events from `admin_api_events.metadata.reason` in 1 hour | Escalate to security + management, confirm incident ticket                                       |
| Bulk failures                | `metadata.failed > 0` on bulk enable/disable responses                            | Notify operations, validate failure reasons, rerun per-account                                   |
| Unauthorized access attempts | `status = 403` on `GET /api/admin/check-access` more than 3 times from same IP    | Lock suspicious account, review Supabase session history                                         |

## Implementation Sketch (Supabase + Slack)

1. Create a Supabase scheduled function (every 5 minutes) that runs SQL aggregations, e.g.:

```sql
select
  method,
  path,
  sum(case when status >= 500 then 1 else 0 end) as error_count
from public.admin_api_events
where occurred_at >= now() - interval '15 minutes'
group by method, path
having sum(case when status >= 500 then 1 else 0 end) > 5;
```

2. When a threshold is crossed, invoke a Netlify/Cloudflare Worker or Upstash QStash endpoint that posts a formatted message to Slack `#security-oncall`.
3. Include the latest metadata (`filters`, `limit`, `overrideId` etc.) in the message to accelerate triage.
4. Store alert events in an `admin_alert_history` table (if desired) for after-action reviews.

## Dashboard Checklist

- Line chart for total requests vs errors per route (from `admin_api_latency_summary`).
- Table of slowest routes (p95 descending) with links to Supabase logs.
- Panel tracking break-glass events (counts by reason).
- SLA gauge: percentage of requests under 500ms.

## Runbooks

- When an alert fires, reference `docs/runbooks/admin-incident-response.md` for containment steps.
- For performance regressions, use `EXPLAIN ANALYZE` against the affected Supabase query and update indexes as required.

Keep alert fatigue low—start with the thresholds above, then tune in production based on real traffic.
