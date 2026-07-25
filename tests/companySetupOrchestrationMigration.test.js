const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260725145129_company_setup_orchestration.sql'),
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

assert.match(guard, /'setup\.html': \['platform_owner', 'super_admin'\]/);
assert.match(setupPage, /services\/companySetupOrchestrationService\.js/);
assert.match(setupPage, /await orchestration\(\)\.saveStep/);
assert.match(setupPage, /await orchestration\(\)\.completeCoreSetup/);
assert.match(adminPage, /data-company-setup-nav/);
assert.match(adminPage, /id="sec-company-setup"/);
assert.match(adminPage, /CompanySetupOrchestrationService/);

console.log('companySetupOrchestrationMigration.test.js passed');
