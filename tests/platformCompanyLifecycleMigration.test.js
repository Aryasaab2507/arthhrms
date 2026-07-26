const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260725142939_platform_company_lifecycle.sql'),
  'utf8'
);
const workspaceMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260726180923_platform_company_onboarding_workspace.sql'),
  'utf8'
);
const failureAuditMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260726181914_company_owner_invitation_failure_audit.sql'),
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
assert.match(edge, /\["send", "resend", "revoke"\]/);
assert.match(edge, /arth_platform_close_owner_invite/);
assert.match(edge, /admin\.auth\.admin\.deleteUser\(priorAuthUserId\)/);
assert.match(edge, /AUTH_INVITE_EXPIRY_MINUTES/);
assert.match(edge, /arth_platform_record_owner_invite_failure/);
assert.match(edge, /deleteUser\(authUserId\)/, 'partial failures must compensate the invited Auth user');
assert.doesNotMatch(edge, /password\s*:/i);
assert.doesNotMatch(edge, /Access-Control-Allow-Origin": "\*"/);

assert.match(platformPage, /services\/platformCompanyRegistryService\.js/);
assert.match(platformPage, /href="company-setup\.html#company-information"/);
assert.doesNotMatch(platformPage, /function createTenantFromForm/);

assert.match(workspaceMigration, /create or replace function public\.arth_platform_update_company/);
assert.match(workspaceMigration, /Tenant identity cannot change after provisioning/);
assert.match(workspaceMigration, /CompanyOwnerProfileSaved/);
assert.match(workspaceMigration, /create or replace function public\.arth_platform_expire_owner_invitations/);
assert.match(workspaceMigration, /CompanyOwnerInvitationExpired/);
assert.match(workspaceMigration, /create or replace function public\.arth_platform_close_owner_invite/);
assert.match(workspaceMigration, /from public, anon, authenticated[\s\S]*to service_role/);
assert.doesNotMatch(workspaceMigration, /grant execute on function public\.arth_platform_close_owner_invite\([\s\S]*to authenticated/i);
assert.match(failureAuditMigration, /create or replace function public\.arth_platform_record_owner_invite_failure/);
assert.match(failureAuditMigration, /CompanyOwnerInvitationFailed/);
assert.match(failureAuditMigration, /from public, anon, authenticated[\s\S]*to service_role/);
assert.doesNotMatch(failureAuditMigration, /grant execute on function public\.arth_platform_record_owner_invite_failure\([\s\S]*to authenticated/i);

console.log('platformCompanyLifecycleMigration.test.js passed');
