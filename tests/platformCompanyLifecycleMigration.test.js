const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260725142939_platform_company_lifecycle.sql'),
  'utf8'
);
const edge = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'invite-company-owner', 'index.ts'),
  'utf8'
);
const platformPage = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');

for (const table of [
  'platform_companies',
  'platform_tenant_lifecycle',
  'platform_lifecycle_events',
  'platform_company_invitations'
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  assert.match(migration, new RegExp(`grant select on public\\.${table} to authenticated`));
  assert.doesNotMatch(
    migration,
    new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to authenticated`, 'i'),
    `${table} mutations must remain behind audited RPCs`
  );
}

assert.match(migration, /security definer[\s\S]*arth_platform_create_company/i);
assert.match(migration, /security definer[\s\S]*arth_platform_transition_company/i);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /auth\.jwt\(\)[\s\S]*app_metadata/);
assert.doesNotMatch(migration, /user_metadata/);
assert.match(migration, /CompanyCreated/);
assert.match(migration, /TenantProvisioned/);
assert.match(migration, /CompanyOwnerInvited/);
assert.match(migration, /InvitationAccepted/);
assert.match(migration, /CompanyActivated/);
assert.match(migration, /revision is stale/i);
assert.match(migration, /Idempotency key is already assigned/i);
assert.match(
  migration,
  /revoke all on function public\.arth_platform_record_owner_invite\([\s\S]*from public, anon, authenticated/i
);
assert.match(
  migration,
  /grant execute on function public\.arth_platform_record_owner_invite\([\s\S]*to service_role/i
);
assert.match(
  migration,
  /grant execute on function public\.arth_complete_company_owner_activation\(\) to authenticated/i
);

assert.match(edge, /callerData\.user\.app_metadata\?\.role/);
assert.match(edge, /!== "platform_owner"/);
assert.match(edge, /inviteUserByEmail/);
assert.match(edge, /onboarding_method: "company_owner_invite"/);
assert.match(edge, /company_owner: true/);
assert.match(edge, /arth_platform_record_owner_invite/);
assert.match(edge, /deleteUser\(authUserId\)/, 'partial failures must compensate the invited Auth user');
assert.doesNotMatch(edge, /password\s*:/i);
assert.doesNotMatch(edge, /Access-Control-Allow-Origin": "\*"/);

assert.match(platformPage, /services\/platformCompanyRegistryService\.js/);
assert.match(platformPage, /id="tenantOwnerName"/);
assert.match(platformPage, /id="tenantOwnerEmail"/);

console.log('platformCompanyLifecycleMigration.test.js passed');
