# ArthHRMS Production Observability

## Health Model

- `GET /healthz`: container liveness only. It must not restart healthy frontend containers during a Supabase outage.
- `GET /health.json`: immutable build artifact verification.
- Authenticated synthetic readiness: call `supabaseClient.healthCheck()`, validate login/session refresh, and perform an RLS-constrained tenant read.
- Business synthetics: invitation, notification, employee read, attendance read, leave read, and payroll read using non-production synthetic records.

## Logging

- Nginx access logs go to stdout and error logs to stderr.
- Supabase Auth, API, Postgres, Storage, and Edge Function logs must be retained in the approved provider or log drain.
- Audit events remain tenant scoped and immutable.
- Never log access tokens, refresh tokens, cookies, authorization headers, payroll payloads, government IDs, or service-role keys.

## Error Reporting

The repository has browser-safe error boundaries and operational event services, but production requires an external durable error-reporting destination. Capture uncaught errors and rejected promises with release SHA, route, tenant pseudonym, correlation ID, browser, and severity. Strip request bodies, credentials, PII, and payroll fields before transmission.

## Minimum Alerts

- Frontend liveness failure for two consecutive intervals.
- Supabase Auth/API/Storage/Function 5xx rate above 2% for five minutes.
- Login failure spike, account-lock spike, or session-refresh failure.
- Database CPU, memory, connection, disk, lock, or replication threshold breach.
- Queue or notification backlog, payroll job failure, import failure, or repeated RLS denial.
- Backup/PITR age exceeds policy or a scheduled restore drill fails.

Every alert needs an owner, runbook, severity, deduplication key, escalation route, and tested notification destination.
