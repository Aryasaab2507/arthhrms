const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260725190000_company_readiness_handoff.sql'),
  'utf8'
);

assert.match(migration, /create table if not exists public\.platform_company_readiness_requests/);
assert.match(migration, /alter table public\.platform_company_readiness_requests force row level security/);
assert.match(migration, /revoke all on public\.platform_company_readiness_requests from public, anon, authenticated/);
assert.doesNotMatch(
  migration,
  /grant [^;]*(insert|update|delete)[^;]* on public\.platform_company_readiness_requests to authenticated/i
);
assert.match(migration, /arth_submit_company_readiness_review/);
assert.match(migration, /caller_role <> 'super_admin'/);
assert.match(migration, /owner_auth_user_id = caller_id/);
assert.match(migration, /record\.tenant_id = caller_tenant/);
assert.match(migration, /status <> 'READY_FOR_APPROVAL'/);
assert.match(migration, /blockingIssues/);
assert.match(migration, /arth_review_company_pilot_request/);
assert.match(migration, /not public\.arth_is_platform_owner\(\)/);
assert.match(migration, /ReadinessReviewReturned/);
assert.match(migration, /PilotActivated/);
assert.match(migration, /arth_enforce_certified_lifecycle_activation/);
assert.match(migration, /Production activation requires a successful pilot/);
assert.match(migration, /grant execute on function public\.arth_submit_company_readiness_review/);
assert.match(migration, /grant execute on function public\.arth_review_company_pilot_request/);

console.log('companyReadinessHandoffMigration.test.js passed');
