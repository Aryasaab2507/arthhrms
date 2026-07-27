const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260725145129_company_setup_orchestration.sql'),
  'utf8'
);
const hardeningSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727083151_harden_company_setup_wizard.sql'),
  'utf8'
);
const rpcClaimSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727084250_enforce_company_owner_setup_rpc_claim.sql'),
  'utf8'
);
const setupPage = fs.readFileSync(path.join(root, 'setup.html'), 'utf8');
const adminPage = fs.readFileSync(path.join(root, 'super-admin.html'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');

for (const table of ['company_setup_workspaces', 'company_setup_step_versions']) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`));
  assert.doesNotMatch(
    sql,
    new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to authenticated`, 'i')
  );
}

assert.match(sql, /arth_persistence_tenant_allowed\(tenant_id\)/);
assert.match(sql, /public\.arth_persistence_role\(\)/);
assert.match(sql, /owner_auth_user_id = caller_id/);
assert.match(sql, /Company setup revision is stale/);
assert.match(sql, /Idempotency key is already assigned/);
assert.match(sql, /pg_column_size\(p_payload\) > 1048576/);
assert.match(sql, /CompanySetupStarted/);
assert.match(sql, /CompanySetupStepSaved/);
assert.match(sql, /OrganizationStructureConfigured/);
assert.doesNotMatch(sql, /user_metadata/i);

assert.match(guard, /'setup\.html': \['super_admin'\]/);
assert.match(guard, /DEDICATED_PERSISTENCE_ROUTES/);
assert.match(guard, /usesDedicatedPersistence/);
assert.doesNotMatch(guard, /legacyPlatformSetup/);
assert.match(setupPage, /services\/companySetupOrchestrationService\.js/);
assert.match(setupPage, /await orchestration\(\)\.saveStep/);
assert.match(setupPage, /await orchestration\(\)\.completeCoreSetup/);
assert.match(setupPage, /u\?\.companyOwner===true/);
assert.match(setupPage, /saveDraft\(\{complete:false,source:'manual'\}\)/);
assert.match(setupPage, /source:'autosave'/);
assert.match(setupPage, /source:'back'/);
assert.match(setupPage, /id="passwordMinLength"[^>]*min="12"[^>]*value="12"/);
assert.match(adminPage, /data-company-setup-nav/);
assert.match(adminPage, /id="sec-company-setup"/);
assert.match(adminPage, /CompanySetupOrchestrationService/);

assert.match(hardeningSql, /arth_company_setup_owner_allowed/);
assert.match(hardeningSql, /company_owner', 'false'/);
assert.match(hardeningSql, /company_setup_workspace_owner_read/);
assert.match(hardeningSql, /company_setup_versions_owner_read/);
assert.match(hardeningSql, /arth_company_setup_payload_error/);
assert.match(hardeningSql, /Setup review must be completed before final provisioning/);
assert.match(hardeningSql, /new\.current_step := old\.current_step/);
assert.match(hardeningSql, /company_setup_audit_step_version/);
assert.match(hardeningSql, /company_setup_audit_workspace/);
assert.match(hardeningSql, /insert into public\.hrms_audit_records/);
assert.doesNotMatch(hardeningSql, /disable row level security/i);
assert.doesNotMatch(hardeningSql, /grant\s+(insert|update|delete)[^;]*hrms_audit_records/i);

for (const rpc of [
  'arth_get_or_create_company_setup',
  'arth_save_company_setup_step',
  'arth_complete_company_core_setup'
]) {
  assert.match(rpcClaimSql, new RegExp(`private\\.${rpc}_internal`));
  assert.match(rpcClaimSql, new RegExp(`public\\.${rpc}`));
}
assert.match(rpcClaimSql, /'app_metadata'\s*->>\s*'company_owner'/);
assert.match(rpcClaimSql, /public\.arth_persistence_role\(\) <> 'super_admin'/);
assert.match(rpcClaimSql, /Company Owner authorization is required/);
assert.doesNotMatch(rpcClaimSql, /user_metadata/i);
assert.doesNotMatch(rpcClaimSql, /disable row level security/i);

console.log('companySetupOrchestrationMigration.test.js passed');
