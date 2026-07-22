# ArthHRMS Production Deployment Checklist

Every mandatory item requires recorded evidence. A failed or unknown item blocks production traffic.

## Ownership And Change Control

- [ ] Release commit and immutable container image digest are approved.
- [ ] GitHub `production` environment requires independent reviewer approval.
- [ ] Deployment owner, database owner, security owner, and rollback commander are assigned.
- [ ] Change window, stakeholder notice, incident channel, and rollback deadline are recorded.

## Environment And Secrets

- [ ] Production uses a dedicated Supabase project and hosting environment.
- [ ] `SUPABASE_URL` and a publishable key are configured; no service-role key reaches the browser or container.
- [ ] Production, auth, persistence, storage, and invite flags match `deploy/production.env.example`.
- [ ] Demo, development, pilot, and legacy module-specific persistence flags are disabled.
- [ ] Auth Site URL and redirect allowlist contain only approved HTTPS production URLs.
- [ ] Edge Function `ALLOWED_ORIGINS` contains the exact production origin.
- [ ] GitHub secrets contain `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD`.

## Supabase And Database

- [ ] Staging is on the same Postgres major version as production.
- [ ] `supabase db push --linked --include-all --dry-run` shows only reviewed migrations.
- [ ] Migrations under `supabase/migrations/` pass in staging from an empty database and from the current production baseline.
- [ ] `authenticated_business_persistence_tests.sql` and `security_policy_tests.sql` pass for every supported role.
- [ ] Security and performance advisors contain no unaccepted critical findings.
- [ ] Explicit Data API grants are verified for `authenticated`; `anon` has no business-table grants.
- [ ] Storage buckets are private and tenant/employee path policies pass.
- [ ] Invite Function requires JWT verification and rejects cross-tenant, disallowed-role, and disallowed-origin requests.

## Recovery

- [ ] Paid Supabase backups or PITR are enabled and the latest recovery point is verified.
- [ ] Storage objects have a separate versioned backup because database backups contain only Storage metadata.
- [ ] A restore rehearsal has passed in a non-production project.
- [ ] Previous application image digest and previous Edge Function version are recorded.
- [ ] `context/ROLLBACK_RUNBOOK.md` has been reviewed by the rollback commander.

## Build And Supply Chain

- [ ] `npm ci` succeeds from the committed lockfile on Node 24.17.0.
- [ ] `npm audit --omit=dev --audit-level=high` passes or findings are risk accepted.
- [ ] `npm run ci` passes all tests, deterministic build checks, RLS checks, and repository checks.
- [ ] Deno 2.8.1 type-checks and lints every Supabase Edge Function.
- [ ] Docker build uses digest-pinned base images and the resulting image is scanned by the deployment platform.
- [ ] Runtime JavaScript dependencies in `dist/` are version pinned.

## Operations

- [ ] `/healthz` is used for container liveness; authenticated Supabase checks are synthetic readiness checks.
- [ ] Nginx, Supabase Auth/API/Postgres/Storage/Function logs reach the approved log platform.
- [ ] Browser errors and unhandled promise rejections reach an external error-reporting platform with PII scrubbing.
- [ ] Alerts exist for login failures, elevated 5xx rates, RLS denials, function failures, database saturation, and storage failures.
- [ ] On-call routing, escalation, retention, dashboards, and SLOs follow `context/OBSERVABILITY.md`.

## Post-Deployment Smoke Tests

- [ ] `/healthz`, login, logout, session refresh, and auth callback pass over HTTPS.
- [ ] Platform Owner, Super Admin, HR, Manager, and Employee route restrictions pass.
- [ ] Cross-tenant reads and writes fail for database rows, storage, imports, exports, and reports.
- [ ] Employee, leave, attendance, payroll, document, invite, and notification smoke tests pass.
- [ ] Audit events, Nginx logs, Supabase logs, metrics, alerts, and error reporting are visible.
- [ ] No critical alert appears during the observation window.

## Go-Live Approval

- [ ] No mandatory item remains failed or unknown.
- [ ] Security, database, operations, HR, and release owners approve production traffic.
- [ ] Release evidence and the final image digest are attached to the change record.
