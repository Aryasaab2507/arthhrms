# ArthHRMS Production Rollback Runbook

Database rollback is restore-or-forward-fix, never an unreviewed destructive down migration.

## Rollback Triggers

- Authentication or tenant-isolation failure.
- Data corruption, failed canonical persistence, or migration inconsistency.
- Sustained critical error rate, unavailable payroll/attendance processing, or failed health checks.
- Security incident, leaked credential, or unexpected cross-tenant visibility.

## Before Deployment

1. Record the current application image digest, Edge Function version, migration list, and Supabase recovery point.
2. Verify the last backup and separate Storage-object backup.
3. Confirm the previous image can start with the post-migration schema.
4. Set a decision deadline and appoint one rollback commander.

## Application Rollback

1. Stop traffic promotion and place the tenant or service in maintenance mode if required.
2. Redeploy the previously recorded immutable image digest.
3. Restore the previous `invite-user` Edge Function version if its behavior caused the incident.
4. Do not restore browser storage or local snapshots as business data.
5. Run authentication, tenant-isolation, employee, attendance, leave, payroll, and notification smoke tests.

## Database Recovery

1. Stop mutating traffic and capture logs, migration history, and the incident timestamp.
2. If the migration is incomplete but data is intact, create and review a forward repair migration.
3. If data is corrupted, restore PITR or a physical backup to a new recovery project first.
4. Validate row counts, RLS, Auth, Storage metadata, critical payroll totals, and tenant isolation.
5. Reconfigure Edge Functions, Auth settings, API keys, Storage objects, and integrations that database restore does not reproduce.
6. Switch traffic only after security, database, and business owners approve the recovered project.

## Storage Recovery

Supabase database backups do not restore deleted Storage objects. Restore objects from the separate versioned object backup, then reconcile `storage.objects` metadata and signed-download tests.

## Closure

Record the decision, approvers, timestamps, image/function/database versions, data-loss window, recovery duration, validation evidence, and follow-up actions in the incident and audit systems.
