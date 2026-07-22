# ArthHRMS Supabase Execution Order

This is the controlled activation sequence for authenticated Supabase-backed operation. Execute it first in a Supabase branch or staging project and retain the command output as release evidence.

## Versioned Migrations

| Order | Migration | Purpose | Verification |
|---:|---|---|---|
| 1 | `supabase/migrations/20260722131020_authenticated_business_persistence.sql` | Tenant-scoped business projections, explicit grants, constraints, indexes, and forced RLS | Run the persistence gate and role matrix |
| 2 | `supabase/migrations/20260722131032_storage_policies.sql` | Private document, expense, payroll, and profile Storage policies | Exercise object access with tenant A and tenant B users |

The reviewed source copies remain under `context/sql/`. `npm run verify:deployment` fails when a migration differs from its canonical source.

## Deployment Commands

```powershell
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run --linked
npx supabase db push --linked
npx supabase functions deploy invite-user --project-ref <project-ref>
```

Run the following database gate after migration:

```text
context/sql/authenticated_business_persistence_tests.sql
```

## Activation Sequence

1. Confirm the linked project and target environment before any command.
2. Review the dry-run migration plan and snapshot current migration history.
3. Apply the two ordered migrations to staging.
4. Verify explicit Data API grants, forced RLS, indexes, constraints, and Storage policies.
5. Verify trusted `app_metadata` contains role, tenant, organization, and employee claims.
6. Deploy `supabase/functions/invite-user/index.ts` with JWT verification enabled and exact allowed origins.
7. Run create, read, update, and delete smoke tests for each supported role and two separate tenants.
8. Review Supabase security and performance advisors.
9. Promote the same reviewed migrations and immutable application image through the protected release workflow.

## Production Flags

Supabase Auth and authenticated persistence are mandatory. Legacy module-specific adapters remain disabled. Persistence failures fail closed and never fall back to browser storage.

## Rollback Rule

Database migrations are roll-forward by default. For a failed release, roll back the application image first, assess schema compatibility, and then use a reviewed forward fix or verified point-in-time/database restore. Supabase database backup does not restore Storage objects, so Storage recovery must be handled separately. Follow `context/ROLLBACK_RUNBOOK.md`.

## Security Rules

- Do not use the user-editable metadata object for authorization.
- Never expose the service role key to the browser or container runtime configuration.
- Keep anonymous access revoked unless a reviewed public endpoint explicitly requires it.
- Require RLS on every exposed table and test both allowed and denied cross-tenant paths.
- Treat migration, function, secret, and policy changes as audited release events.
