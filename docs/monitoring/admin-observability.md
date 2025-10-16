# Super Admin Observability Cheat Sheet

This guide summarizes how to inspect the new telemetry introduced in Milestone 7.

## Tables & Views

- `public.admin_api_events`
  - One row per admin API request (method, path, status, duration, admin user ID, IP/UA, metadata).
- `public.admin_api_latency_summary`
  - Hourly rollup (total, error count, avg latency, p95). Backed directly by the events table.

## Ad-hoc Queries

```sql
-- Most recent admin API calls
select occurred_at, method, path, status, duration_ms, admin_user_id, metadata
from admin_api_events
order by occurred_at desc
limit 20;

-- 24h latency/error summary per route
select bucket, method, path, total_requests, error_count, avg_duration_ms, p95_duration_ms
from admin_api_latency_summary
where bucket >= now() - interval '24 hours'
order by bucket desc, path;

-- Identify noisy callers (same admin triggering >50 requests/hour)
select admin_user_id, date_trunc('hour', occurred_at) as bucket, count(*)
from admin_api_events
group by admin_user_id, bucket
having count(*) > 50
order by bucket desc;
```

## Alerting Hints

- Supabase SQL + `pg_net` (or Upstash/QStash) can dispatch alerts. Example: run hourly and POST to Slack when `error_count > 5` or `p95_duration_ms > 2000` for any route.
- Break-glass events are tagged via `metadata` (`target_user_email`, `reason`). Monitor for repeated grants/revokes within short windows.
- Bulk operations expose `metadata` counts (`succeeded`, `failed`). Alert when `failed > 0` or rate limits are hit (`status 429`).

## Integration

1. Create a Supabase scheduled function (or Next.js cron) that queries `admin_api_latency_summary` and pushes metrics to your observability stack (e.g., Grafana/Prometheus).
2. Ship console logs (`admin_api_event`) to your log aggregator (Datadog, CloudWatch, ELK) — messages already include structured JSON.
3. Feed the summary view to dashboards for latency/error charts per admin route.

Keep production secrets out of metadata: only send non-sensitive IDs/context. Temporary passwords are never logged; the telemetry layer already redacts them by omission.
