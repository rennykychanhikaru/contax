# Backup & PITR Validation Runbook

Ensures we can restore the super-admin data set within agreed RTO/RPO targets.

## Nightly Backups

- Supabase: enable automated backups + WAL (Point-in-Time Recovery) in project settings.
- Verify backup job status daily (Supabase dashboard or API).
- Mirror copies to organization object storage (S3/GCS) weekly for redundancy.

## Monthly Validation

1. Choose latest backup timestamp.
2. Spin up a temporary Supabase project (or local Docker instance).
3. Perform PITR restore to the selected timestamp using `supabase db remote restore`.
4. Run smoke queries:
   - `select count(*) from admin_api_events;`
   - `select * from admin_audit_log order by created_at desc limit 10;`
5. Destroy temporary project and record duration in the change log.

## On-Demand Restore

1. Declare incident; freeze production writes to admin tables.
2. Trigger PITR restore to new project.
3. Export required tables (`admin_api_events`, `admin_audit_log`, `feature_flag_overrides`, etc.).
4. Import data back into production (or alternative environment) after validation.
5. Resume traffic and update runbook with lessons learned.

## SLA Targets

- **RPO** (data loss): ≤ 15 minutes.
- **RTO** (restore time): ≤ 60 minutes.

Track each validation in Jira (`SECOPS`) including timestamp, operator, and success/failure status.
