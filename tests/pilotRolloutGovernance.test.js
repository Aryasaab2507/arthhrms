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
  global.navigator = { userAgent: 'Node rollout governance test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
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

function seedRolloutData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    leavePoliciesConfigured: true
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'READY' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'READY' }
  ];
  data.organizationInitializationRecords = [
    { initializationId: 'OINIT-1', tenantSlug: 'tabsons', state: 'ACTIVE', initializationModules: { leavePoliciesConfigured: true, attendanceSettingsConfigured: true, permissionsConfigured: true }, immutable: true },
    { initializationId: 'OINIT-ABC', tenantSlug: 'abc', state: 'ACTIVE', initializationModules: { leavePoliciesConfigured: false }, confidentialNote: 'ABC private setup' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-1', tenantSlug: 'tabsons', departmentCode: 'COMPANY', departmentName: 'Company', ownerId: 'DIR-1', state: 'ACTIVE' },
    { departmentId: 'D-2', tenantSlug: 'tabsons', departmentCode: 'ENG', departmentName: 'Engineering', ownerId: 'MGR-1', state: 'ACTIVE' },
    { departmentId: 'ABC-D', tenantSlug: 'abc', departmentCode: 'ABC', departmentName: 'ABC Finance', ownerId: 'ABC-1', state: 'ACTIVE', privatePayload: 'ABC confidential' }
  ];
  data.employees = [
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', role: 'director', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true, salary: 900000 },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', role: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Employee', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', role: 'employee', tenantSlug: 'abc', tenantId: 'TEN-abc', active: true, salary: 800000, privateNote: 'ABC confidential' }
  ];
  data.employeeBulkImportPreviewHistory = [
    { previewId: 'PREV-1', tenantSlug: 'tabsons', summary: { totalRows: 3, validRows: 3, invalidRows: 0 }, immutable: true }
  ];
  data.employeeActivationRecords = [
    { activationId: 'ACT-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', state: 'ACTIVE', immutable: true },
    { activationId: 'ACT-2', tenantSlug: 'tabsons', employeeId: 'HR-1', state: 'ACTIVE', immutable: true }
  ];
  data.companyHolidayCalendars = [
    { calendarId: 'HOL-1', tenantSlug: 'tabsons', state: 'ACTIVE', holidays: [{ name: 'Founders Day', date: '2026-01-01' }], immutable: true }
  ];
  data.passwordResetHistory = [{ eventId: 'PWD-1', tenantSlug: 'tabsons', state: 'COMPLETED' }];
  data.sessionGovernanceHistory = [{ sessionId: 'SES-1', tenantSlug: 'tabsons', state: 'ACTIVE' }];
  data.loginAttemptHistory = [{ attemptId: 'LOG-1', tenantSlug: 'tabsons', outcome: 'SUCCESS' }];
  data.auditLogs = [{ auditId: 'AUD-1', tenantSlug: 'tabsons', module: 'Audit Governance', actionType: 'AUDIT_ACTIVE', date: new Date().toISOString() }];
  data.platformGovernance = {
    ...(data.platformGovernance || {}),
    features: {
      employees: { key: 'employees', label: 'Employee Master', enabled: true, rolloutStage: 'PILOT_ENABLED', roles: { hr: true, platform_owner: true } },
      imports: { key: 'imports', label: 'Data Import Center', enabled: true, rolloutStage: 'PILOT_ENABLED', roles: { hr: true, platform_owner: true } },
      notifications: { key: 'notifications', label: 'Notifications', enabled: true, rolloutStage: 'PILOT_ENABLED', roles: { employee: true, manager: true, hr: true, platform_owner: true } },
      aiInsights: { key: 'aiInsights', label: 'AI Insights', enabled: false, experimental: true, rolloutStage: 'STAGE_0', roles: { hr: true, platform_owner: true } }
    }
  };
  data.multiStagePilotRolloutRecords = [];
  data.pilotRolloutReadinessReports = [];
  data.pilotRolloutHistory = [];
  data.pilotRollbackHistory = [];
  data.pilotFeatureFlagHistory = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/platformGovernanceService.js',
    'services/featureRolloutService.js',
    'services/organizationInitializationWizardService.js',
    'services/tenantGovernanceService.js'
  ].forEach(load);
  seedRolloutData();
  load('services/pilotRolloutGovernanceService.js');

  const svc = global.PilotRolloutGovernanceService;
  assert.ok(svc, 'PilotRolloutGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.deepEqual(svc.ROLLOUT_STAGES, ['STAGE_0', 'STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4']);
  assert.equal(global.__ARTHHRMS_PILOT_ROLLOUT_SELF_TEST__.passed, true, 'development self-test should pass');

  ['evaluateTenantReadiness', 'calculateRolloutRisk', 'activatePilotTenant', 'rollbackTenantActivation', 'generateLaunchReadinessReport', 'freezeRolloutOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const ownerContext = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons' };
  const hrContext = { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };

  const readiness = svc.evaluateTenantReadiness({ tenantSlug: 'tabsons' }, ownerContext);
  assert.equal(readiness.success, true, 'readiness evaluation should succeed');
  assert.equal(readiness.tenantSlug, 'tabsons');
  assert.ok(readiness.rolloutReadinessScore >= 80, 'complete tenant should be launch ready');
  assert.equal(readiness.activationBlocked, false);
  assert.ok(readiness.checkpoints.every(item => item.status === 'COMPLETE'), 'all rollout checkpoints should pass');
  assert.ok(Object.isFrozen(readiness), 'readiness output should be immutable');
  assert.doesNotMatch(text(readiness), /salary|ABC confidential|ABC Employee|private setup/i, 'readiness output must not expose confidential or cross-tenant data');

  const report = svc.generateLaunchReadinessReport({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(report.success, true, 'director can review launch readiness');
  assert.equal(report.launchReadiness.activationReady, true);
  assert.ok(report.analytics.deploymentConfidenceScore >= 80);
  assert.ok(report.governance.tenantIsolationPreserved);
  assert.ok(report.governance.rolloutGovernancePreserved);

  const hrActivation = svc.activatePilotTenant({ tenantSlug: 'tabsons', stage: 'STAGE_1', approval: true }, hrContext);
  assert.equal(hrActivation.success, false, 'HR cannot activate pilot tenants');
  assert.ok(hrActivation.issues.some(issue => issue.code === 'ROLLOUT_AUTHORITY_REQUIRED'));

  const activation = svc.activatePilotTenant({
    tenantSlug: 'tabsons',
    stage: 'STAGE_1',
    approval: true,
    featureFlags: { employees: true, imports: true, notifications: true }
  }, ownerContext);
  assert.equal(activation.success, true, 'platform owner can activate launch-ready pilot tenant');
  assert.equal(activation.rollout.stage, 'STAGE_1');
  assert.equal(activation.rollout.state, 'ACTIVE');
  assert.equal(activation.featureFlags.enabled.length, 3, 'feature flags should be staged without redeployment');
  assert.ok(Object.isFrozen(activation), 'activation output should be immutable');

  const risk = svc.calculateRolloutRisk({ tenantSlug: 'tabsons' }, ownerContext);
  assert.equal(risk.success, true, 'risk scoring should work');
  assert.ok(risk.rolloutRiskScore <= 35, 'complete tenant should have low rollout risk');
  assert.ok(risk.governanceScore >= 80);

  const rollback = svc.rollbackTenantActivation({ tenantSlug: 'tabsons', reason: 'pilot smoke issue', approval: true }, ownerContext);
  assert.equal(rollback.success, true, 'platform owner can rollback tenant activation');
  assert.equal(rollback.rollout.state, 'ROLLED_BACK');
  assert.equal(rollback.rollback.reason, 'pilot smoke issue');

  const crossTenant = svc.activatePilotTenant({ tenantSlug: 'tabsons', stage: 'STAGE_1', approval: true }, { actor: { id: 'HR-ABC', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant rollout activation must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_ROLLOUT_BLOCKED' || issue.code === 'ROLLOUT_AUTHORITY_REQUIRED'));

  const employeeDenied = svc.generateLaunchReadinessReport({ tenantSlug: 'tabsons' }, { actor: { id: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeDenied.success, false, 'employee cannot access rollout governance');
  assert.ok(employeeDenied.issues.some(issue => issue.code === 'ROLLOUT_ACCESS_DENIED'));

  const incomplete = svc.evaluateTenantReadiness({ tenantSlug: 'abc' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'abc' });
  assert.equal(incomplete.success, true, 'incomplete tenant readiness still reports safely');
  assert.equal(incomplete.activationBlocked, true);
  assert.ok(incomplete.checkpoints.some(item => item.status === 'BLOCKED'), 'incomplete tenant should have blocked checkpoints');

  const malformed = svc.evaluateTenantReadiness('bad-payload', ownerContext);
  assert.equal(malformed.success, false, 'malformed payload should fail safely');

  const data = global.DB.get();
  assert.ok(data.pilotRolloutHistory.length >= 2, 'immutable rollout history should be recorded');
  assert.ok(data.pilotRollbackHistory.length >= 1, 'immutable rollback history should be recorded');
  assert.ok(data.pilotRolloutReadinessReports.length >= 1, 'immutable readiness reports should be recorded');
  assert.ok((data.auditLogs || []).some(row => /ROLLOUT|PILOT|READINESS/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'rollout actions should be audited');

  console.log('pilotRolloutGovernance.test.js passed');
}

main();
