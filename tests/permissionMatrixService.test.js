const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function fakeEl() {
  return {
    style: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
    appendChild(){},
    insertBefore(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    value: '',
    textContent: '',
    innerHTML: ''
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32'
  };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    getElementById(){ return null; },
    createElement(){ return fakeEl(); },
    addEventListener(){},
    body: fakeEl(),
    documentElement: fakeEl()
  };
}

function seedPermissionData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'CREATED' }
  ];
  data.rolePermissionOverrides = [
    { role: 'manager', inheritsFrom: 'hr', tenantSlug: 'tabsons' },
    { role: 'hr', inheritsFrom: 'manager', tenantSlug: 'tabsons' }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/permissionMatrixService.js');
  seedPermissionData();

  const svc = global.PermissionMatrixService;
  assert.ok(svc, 'PermissionMatrixService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.RISK_LEVELS), 'risk constants must be immutable');
  assert.equal(global.__ARTHHRMS_PERMISSION_MATRIX_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  const managerInput = { role: 'manager', capability: 'team_visibility', tenantSlug: 'tabsons', route: 'manager.html' };
  const managerBefore = JSON.stringify(managerInput);
  const managerAllowed = svc.validateRolePermission(managerInput, { tenantSlug: 'tabsons' });
  assert.equal(managerAllowed.allowed, true, 'manager team visibility should remain compatible');
  assert.equal(managerAllowed.riskLevel, 'SAFE');
  assert.equal(JSON.stringify(managerInput), managerBefore, 'role validation must not mutate caller input');
  assert.ok(Object.isFrozen(managerAllowed), 'permission validation output should be immutable');

  const employeePlatform = svc.validateRolePermission(
    { role: 'employee', capability: 'platform_governance', route: 'platform-control.html', tenantSlug: 'tabsons' },
    { tenantSlug: 'tabsons', routeType: 'tenant' }
  );
  assert.equal(employeePlatform.allowed, false, 'employees must not access platform-control');
  assert.ok(employeePlatform.failures.some(item => item.failureCode === 'TENANT_ROLE_PLATFORM_GOVERNANCE_BLOCKED' && item.severity === 'CRITICAL_BLOCKER'));

  const superAdminGlobal = svc.validateRolePermission(
    { role: 'super_admin', capability: 'global_rollout', route: 'platform-control.html', tenantSlug: 'tabsons' },
    { tenantSlug: 'tabsons', routeType: 'tenant' }
  );
  assert.equal(superAdminGlobal.allowed, false, 'tenant SUPER_ADMIN must not control global rollout');
  assert.ok(superAdminGlobal.failures.some(item => item.failureCode === 'TENANT_SUPER_ADMIN_GLOBAL_GOVERNANCE_BLOCKED'));

  const platformOwnerPlatform = svc.validateRolePermission(
    { role: 'platform_owner', capability: 'platform_governance', route: 'platform-control.html' },
    { routeType: 'platform' }
  );
  assert.equal(platformOwnerPlatform.allowed, true, 'PLATFORM_OWNER should access isolated platform governance');

  const platformOwnerTenant = svc.validateRolePermission(
    { role: 'platform_owner', capability: 'employee_dashboard', route: 'employee-portal.html', tenantSlug: 'tabsons' },
    { routeType: 'tenant', tenantSlug: 'tabsons' }
  );
  assert.equal(platformOwnerTenant.allowed, false, 'PLATFORM_OWNER must not appear inside tenant RBAC');
  assert.ok(platformOwnerTenant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_RBAC_BLOCKED'));

  const crossTenant = svc.validateRolePermission(
    { role: 'hr', capability: 'onboarding_visibility', tenantSlug: 'abc' },
    { tenantSlug: 'tabsons' }
  );
  assert.equal(crossTenant.allowed, false, 'cross-tenant RBAC visibility must be blocked');
  assert.ok(crossTenant.failures.some(item => item.failureCode === 'CROSS_TENANT_PERMISSION_SCOPE' && item.severity === 'CRITICAL_BLOCKER'));

  const employeeToHr = svc.detectPermissionEscalation({ fromRole: 'employee', toRole: 'hr', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(employeeToHr.blocked, true, 'EMPLOYEE to HR escalation must be blocked');
  assert.ok(employeeToHr.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ESCALATION'));

  const superAdminToOwner = svc.detectPermissionEscalation({ fromRole: 'super_admin', toRole: 'platform_owner', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(superAdminToOwner.blocked, true, 'SUPER_ADMIN must not escalate to PLATFORM_OWNER');
  assert.ok(superAdminToOwner.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ESCALATION_BLOCKED'));

  const loop = svc.detectPermissionEscalation({ inheritanceChain: ['manager', 'hr', 'manager'], tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(loop.blocked, true, 'permission inheritance loops must be prohibited');
  assert.ok(loop.failures.some(item => item.failureCode === 'PERMISSION_INHERITANCE_LOOP'));

  const contributor = svc.validateStrategicGovernanceAccess({ role: 'employee', strategicRole: 'contributor', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(contributor.allowed, true, 'employees can remain strategic contributors');
  const reviewer = svc.validateStrategicGovernanceAccess({ role: 'employee', strategicRole: 'reviewer', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(reviewer.allowed, false, 'employees cannot become strategic reviewers');

  const report = svc.generatePermissionGovernanceReport({
    tenantSlug: 'tabsons',
    roleAssignments: [
      { actorRole: 'employee', targetRole: 'hr', tenantSlug: 'tabsons' },
      { actorRole: 'manager', targetRole: 'platform_owner', tenantSlug: 'tabsons' },
      { role: 'platform_owner', capability: 'employee_dashboard', route: 'employee-portal.html', tenantSlug: 'tabsons' },
      { role: 'hr', capability: 'onboarding_visibility', tenantSlug: 'abc' },
      { role: 'director', capability: 'kpi_visibility', module: 'strategic', tenantSlug: 'tabsons' }
    ],
    routeChecks: [
      { role: 'employee', route: 'platform-control.html', capability: 'platform_governance', tenantSlug: 'tabsons' },
      { role: 'super_admin', route: 'platform-control.html', capability: 'global_rollout', tenantSlug: 'tabsons' }
    ],
    strategicChecks: [
      { role: 'employee', strategicRole: 'reviewer', tenantSlug: 'tabsons' },
      { role: 'director', strategicRole: 'sponsor', tenantSlug: 'tabsons' }
    ],
    metadata: { salary: 123456, service_role: 'do-not-render', note: 'safe' }
  }, { actor: { role: 'platform_owner', id: 'PO-1' }, tenantSlug: 'tabsons' });
  assert.equal(report.success, true, 'permission report should complete safely');
  assert.equal(report.passed, false, 'seeded unsafe permissions should fail governance report');
  assert.ok(report.failures.some(item => item.failureCode === 'CROSS_TENANT_PERMISSION_SCOPE'));
  assert.ok(report.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_RBAC_BLOCKED'));
  assert.ok(report.sections.some(section => section.validationType === 'STRATEGIC_GOVERNANCE_ACCESS'));
  assert.doesNotMatch(JSON.stringify(report), /123456|service_role|do-not-render/i, 'permission report must not expose sensitive metadata');
  assert.ok(Object.isFrozen(report), 'report output should be immutable');
  assert.ok(Object.isFrozen(report.failures), 'report failures should be immutable');

  const malformed = svc.generatePermissionGovernanceReport('bad-input', { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.passed, false, 'malformed payloads should not silently pass RBAC governance');

  const telemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(telemetry.some(row => /PERMISSION_MATRIX|RBAC|PERMISSION/.test(row.eventType)), 'permission governance should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /PERMISSION|RBAC/.test(row.actionType || row.action || '')), 'permission violations should be audited safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.PERMISSION_MATRIX_VALIDATED, 'permission governance should aggregate metrics safely');
}

main();
