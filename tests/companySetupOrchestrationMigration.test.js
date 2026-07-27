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
const auditOutboxSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727090940_company_setup_audit_outbox.sql'),
  'utf8'
);
const auditTriggerFixSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727092707_fix_company_setup_audit_trigger.sql'),
  'utf8'
);
const setupIndexSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727093827_index_company_setup_foreign_keys.sql'),
  'utf8'
);
const masterDataSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727113000_company_setup_master_data.sql'),
  'utf8'
);
const masterDataUpsertFixSql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260727121500_fix_company_setup_master_data_upsert.sql'),
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
assert.match(setupPage, /services\/companySetupMasterDataService\.js/);
assert.match(setupPage, /services\/authInviteService\.js/);
assert.doesNotMatch(setupPage, /<script src="services\/authService\.js"/);
assert.doesNotMatch(setupPage, /<script src="services\/supabaseClient\.js"/);
assert.doesNotMatch(setupPage, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/);
assert.match(setupPage, /await service\(\)\.saveStep/);
assert.match(setupPage, /await service\(\)\.completeCoreSetup/);
assert.match(setupPage, /owner\?\.companyOwner!==true/);
assert.match(setupPage, /persistCurrent\(\{complete:false,source:'manual'\}\)/);
assert.match(setupPage, /source:'autosave'/);
assert.match(setupPage, /source:'previous'/);
assert.match(setupPage, /id="passwordPolicyPreset"/);
assert.match(setupPage, /id="passwordMinLength" type="hidden"/);
assert.match(setupPage, /setValue\('passwordMinLength','12'\)/);
assert.equal((setupPage.match(/<section class="panel" data-step="/g) || []).length, 10);
assert.equal((setupPage.match(/<script>/g) || []).length, 1);
assert.equal((setupPage.match(/<textarea/g) || []).length, 0);
assert.match(setupPage, /class SmartSelect/);
assert.match(setupPage, /id="masterDataDialog"/);
assert.match(setupPage, /id="hierarchyBuilder"/);
assert.match(setupPage, /id="approvalBuilder"/);
assert.match(setupPage, /await masterData\(\)\.inviteEmployee/);
assert.match(setupPage, /changeVersionAtStart/);
assert.match(setupPage, /function armAutosave/);
assert.match(setupPage, /if\(!navigator\.onLine\)\{[\s\S]*state\.autosaveInFlight=false/);
assert.match(setupPage, /ignoreCurrentCompanySettings:true/);
assert.doesNotMatch(setupPage, /durableMode/);
assert.doesNotMatch(setupPage, /Unexpected Error Occurred/);
assert.doesNotMatch(setupPage, /\.innerHTML\s*=/);
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

assert.match(auditOutboxSql, /create table if not exists public\.company_setup_audit_outbox/);
assert.match(auditOutboxSql, /alter table public\.company_setup_audit_outbox force row level security/);
assert.match(auditOutboxSql, /revoke all on public\.company_setup_audit_outbox from public, anon, authenticated/);
assert.match(auditOutboxSql, /arth_enqueue_company_setup_audit/);
assert.match(auditOutboxSql, /arth_deliver_company_setup_audit/);
assert.match(auditOutboxSql, /arth_flush_company_setup_audit/);
assert.match(auditOutboxSql, /status = 'PENDING'/);
assert.match(auditOutboxSql, /exception\s+when others then\s+null/is);
assert.doesNotMatch(auditOutboxSql, /disable row level security/i);
assert.doesNotMatch(
  auditOutboxSql,
  /grant\s+(insert|update|delete)[^;]*company_setup_audit_outbox[^;]*authenticated/i
);
assert.doesNotMatch(
  auditOutboxSql,
  /grant\s+(insert|update|delete)[^;]*hrms_audit_records[^;]*authenticated/i
);
assert.match(auditTriggerFixSql, /create or replace function private\.arth_audit_company_setup_step/);
assert.match(auditTriggerFixSql, /Company setup audit provenance is invalid/);
assert.match(auditTriggerFixSql, /arth_enqueue_company_setup_audit/);
assert.doesNotMatch(auditTriggerFixSql, /new\.completed/);
for (const index of [
  'company_setup_audit_outbox_workspace_idx',
  'company_setup_audit_outbox_actor_idx',
  'company_setup_step_versions_company_idx',
  'company_setup_step_versions_actor_idx',
  'company_setup_workspaces_created_by_idx',
  'company_setup_workspaces_updated_by_idx'
]) {
  assert.match(setupIndexSql, new RegExp(`create index if not exists ${index}`));
}

assert.match(masterDataSql, /arth_get_company_setup_reference_data/);
assert.match(masterDataSql, /arth_upsert_company_setup_master_data/);
assert.match(masterDataSql, /private\.arth_company_setup_owner_allowed/);
assert.match(masterDataSql, /hrms_departments/);
assert.match(masterDataSql, /hrms_designations/);
assert.match(masterDataSql, /hrms_settings/);
assert.match(masterDataSql, /hrms_payroll_records/);
assert.match(masterDataSql, /hrms_workflow_records/);
assert.match(masterDataSql, /CompanySetupMasterDataUpserted/);
assert.doesNotMatch(masterDataSql, /disable row level security/i);
assert.doesNotMatch(masterDataSql, /service_role/i);
assert.match(masterDataUpsertFixSql, /master_record_id text/);
assert.match(masterDataUpsertFixSql, /CompanySetupMasterDataUpserted/);
assert.doesNotMatch(masterDataUpsertFixSql, /^\s*record_id text;/m);
assert.doesNotMatch(masterDataUpsertFixSql, /disable row level security/i);
assert.doesNotMatch(masterDataUpsertFixSql, /service_role/i);

console.log('companySetupOrchestrationMigration.test.js passed');
