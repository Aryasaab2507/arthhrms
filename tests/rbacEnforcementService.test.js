const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function actor(role, tenantSlug = 'tenant-a', id = role + '-1', empId = '') {
  return { id, role, tenantSlug, empId, source: 'supabase', roleTrusted: true };
}

function main() {
  global.window = global;
  global.DB = {
    getManagerTeam(empId) {
      return empId === 'MGR-1' ? { memberIds: ['EMP-1', 'EMP-2'] } : { memberIds: [] };
    }
  };
  require(path.join(root, 'services', 'rbacEnforcementService.js'));
  const rbac = global.rbacEnforcementService;
  assert.ok(rbac && Object.isFrozen(rbac), 'central RBAC service must be immutable');

  const owner = actor('platform_owner', '', 'OWNER-1');
  assert.equal(rbac.authorize({ resource: 'platform_governance', action: 'manage', actor: owner }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'employees', action: 'read', tenantSlug: 'tenant-a', actor: owner }).code, 'PLATFORM_OWNER_TENANT_DATA_BLOCKED');

  const superAdmin = actor('super_admin');
  assert.equal(rbac.authorize({ resource: 'tenant_governance', action: 'manage', actor: superAdmin }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'payroll', action: 'read', actor: superAdmin }).code, 'ROLE_ACTION_FORBIDDEN');

  const hr = actor('hr', 'tenant-a', 'HR-1', 'HR-1');
  ['employees', 'attendance', 'leave', 'payroll', 'imports', 'reports'].forEach(resource => {
    const action = resource === 'imports' ? 'execute' : resource === 'reports' ? 'export' : 'read';
    assert.equal(rbac.authorize({ resource, action, tenantSlug: 'tenant-a', actor: hr }).allowed, true, `HR ${resource} permission missing`);
  });
  assert.equal(rbac.authorize({ resource: 'employees', action: 'read', tenantSlug: 'tenant-b', actor: hr }).code, 'CROSS_TENANT_ACCESS_DENIED');

  const manager = actor('manager', 'tenant-a', 'AUTH-MGR', 'MGR-1');
  assert.equal(rbac.authorize({ resource: 'employees', action: 'read', targetEmployeeId: 'EMP-1', actor: manager }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'leave', action: 'approve', targetEmployeeId: 'EMP-2', actor: manager }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'leave', action: 'approve', targetEmployeeId: 'EMP-9', actor: manager }).code, 'TEAM_RESOURCE_SCOPE_DENIED');
  assert.equal(rbac.authorize({ resource: 'payroll', action: 'read', targetEmployeeId: 'EMP-1', actor: manager }).code, 'ROLE_ACTION_FORBIDDEN');

  const employee = actor('employee', 'tenant-a', 'AUTH-EMP', 'EMP-1');
  assert.equal(rbac.authorize({ resource: 'employees', action: 'read', targetEmployeeId: 'EMP-1', actor: employee }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'attendance', action: 'create', targetEmployeeId: 'EMP-1', actor: employee }).allowed, true);
  assert.equal(rbac.authorize({ resource: 'employees', action: 'read', targetEmployeeId: 'EMP-2', actor: employee }).code, 'OWN_RESOURCE_SCOPE_DENIED');
  assert.equal(rbac.authorize({ resource: 'payroll', action: 'read', actor: employee }).code, 'OWN_RESOURCE_SCOPE_DENIED');
  assert.equal(rbac.authorize({ resource: 'attendance', action: 'create', actor: employee }).code, 'OWN_RESOURCE_SCOPE_DENIED');

  const forged = { id: 'FORGED', role: 'hr', tenantSlug: 'tenant-a' };
  assert.equal(rbac.authorize({ resource: 'payroll', action: 'read', actor: forged }).status, 401);
  assert.equal(rbac.authorize({ resource: 'unknown', action: 'read', actor: hr }).code, 'RBAC_POLICY_MISSING');
  assert.throws(() => rbac.resolveTenant('tenant-b', hr), error => error.code === 'CROSS_TENANT_ACCESS_DENIED');

  const publicPages = new Set(['ArthHRMS.html', 'index.html', 'platform-login.html', 'password-recovery.html', 'auth-callback.html', '403.html']);
  fs.readdirSync(root).filter(file => file.endsWith('.html') && !publicPages.has(file)).forEach(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /services\/authGuard\.js/, `${file} lacks the shared page guard`);
  });

  const persistenceSql = fs.readFileSync(path.join(root, 'context', 'sql', 'authenticated_business_persistence.sql'), 'utf8');
  assert.match(persistenceSql, /force row level security/gi);
  assert.match(persistenceSql, /target_tenant = public\.arth_persistence_tenant_id\(\)/);
  assert.doesNotMatch(persistenceSql.match(/create or replace function public\.arth_persistence_tenant_allowed[\s\S]*?\$\$;/)?.[0] || '', /platform_owner/i);
  assert.doesNotMatch(persistenceSql.match(/create or replace function public\.arth_persistence_is_ops[\s\S]*?\$\$;/)?.[0] || '', /platform_owner|super_admin/i);
  assert.match(persistenceSql, /table_name \|\| '_manager_update'/);
  assert.match(persistenceSql, /arth_validate_scoped_business_update/);
  assert.doesNotMatch(persistenceSql, /user_metadata/i);

  const storageSql = fs.readFileSync(path.join(root, 'context', 'sql', 'storage_policies.sql'), 'utf8');
  assert.match(storageSql, /\{tenantId\}\/\{empId\}/);
  assert.match(storageSql, /arth_persistence_tenant_allowed\(\(storage\.foldername\(name\)\)\[1\]\)/);
  assert.match(storageSql, /\(storage\.foldername\(object_name\)\)\[2\] = public\.arth_persistence_emp_id\(\)/);
  assert.doesNotMatch(storageSql, /to anon|public\s*=\s*true/i);

  const highRisk = [
    'services/importStagingService.js', 'services/exportService.js', 'services/storageService.js',
    'services/platformGovernanceService.js', 'services/migrationControlService.js', 'services/expenseService.js'
  ];
  highRisk.forEach(file => assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /rbacEnforcementService/, `${file} lacks central authorization`));
  ['services/developerPlatformService.js', 'services/integrationMarketplaceService.js', 'services/webhookPlatformService.js'].forEach(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /systemIntegration\s*===\s*true/, `${file} retains a caller-controlled integration bypass`);
  });
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'services', 'importService.js'), 'utf8'), /__bypassStaging/);
  fs.readdirSync(path.join(root, 'services')).filter(file => file.endsWith('.js')).forEach(file => {
    const source = fs.readFileSync(path.join(root, 'services', file), 'utf8');
    assert.doesNotMatch(source, /systemIntegration\s*(?::\s*true|===\s*true)/, `${file} retains a caller-controlled integration bypass`);
    assert.doesNotMatch(source, /__bypass/, `${file} retains a hidden bypass flag`);
  });

  console.log('rbacEnforcementService.test.js passed');
}

main();
