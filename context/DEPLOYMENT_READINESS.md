# ArthHRMS Deployment Readiness

## Supported Production Shape

- Frontend: immutable Nginx container built from `Dockerfile`.
- Backend: Supabase Auth, PostgreSQL, Storage, and Edge Functions.
- Business persistence: authenticated `hrms_*` projections only.
- Configuration: browser-safe runtime values generated when the container starts.
- Secrets: GitHub environment secrets, Supabase secrets, and the target platform secret store.

Production mode fails closed. Local fixtures and legacy module adapters are not production persistence paths.

## Mandatory Configuration

Use `deploy/production.env.example` as the browser-safe deployment template. Production requires:

- `APP_ENV=production`
- `PRODUCTION_MODE=true`
- `DEVELOPMENT_MODE=false`, `DEMO_MODE=false`, and `PILOT_MODE=false`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `USE_SUPABASE_AUTH=true`, `USE_SUPABASE_PERSISTENCE=true`, `USE_SUPABASE_STORAGE=true`, and `USE_SUPABASE_INVITES=true`
- `REQUIRE_APP_METADATA_ROLE=true` and `REQUIRE_EMAIL_VERIFIED=true`
- Exact invite endpoint, callback URL, and origin allowlist

The service role key is forbidden from browser configuration and must exist only in the Edge Function secret store.

## Database and Storage Gates

1. Link the Supabase CLI to the intended project.
2. Review `supabase db push --dry-run --linked` output.
3. Apply migrations from `supabase/migrations/` to staging.
4. Run `context/sql/authenticated_business_persistence_tests.sql`.
5. Test every supported role and at least two tenants.
6. Validate private Storage buckets and object policies independently.
7. Review Supabase security and performance advisors before promotion.

Database backups do not include Storage objects. Both recovery paths must be tested before go-live.

## Build and Release Gates

```powershell
npm ci
npm run ci
docker build --pull -t arthhrms:<version> .
```

GitHub Actions repeat these gates, publish an immutable image, and require the protected `production` environment for release. The final rollout is intentionally platform-specific and operator controlled.

## Health and Observability

- `/healthz` is the container liveness endpoint.
- Supabase readiness requires an authenticated synthetic transaction against a tenant-scoped projection.
- Nginx access and error output are written to stdout/stderr.
- Supabase Auth, Database, Storage, and Edge Function logs must feed the production log destination.
- External error reporting, alert routing, ownership, and retention must be configured before activation.

See `context/OBSERVABILITY.md` for alert requirements.

## Recovery

Use immutable image rollback for application failures. Use reviewed forward migrations or point-in-time/database restore for database failures; never improvise a destructive SQL rollback. Storage restore is a separate procedure. See `context/ROLLBACK_RUNBOOK.md`.

## Readiness Decision

Code and deployment artifacts alone are not go-live approval. Production remains blocked until a real Supabase project, backup restoration, monitoring destinations, alert delivery, and the target hosting rollout have been exercised in staging with retained evidence.
