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
  global.location = {
    href: '',
    origin: 'http://localhost:8080',
    hostname: 'localhost',
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

function seedTenantData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    companyId: 'TENANT-A',
    companyName: 'Pilot Tenant'
  };
  data.employees = [
    { id: 'EMP-A1', empId: 'EMP-A1', email: 'a1@example.com', role: 'employee', tenantId: 'TENANT-A', companyId: 'TENANT-A' },
    { id: 'EMP-A2', empId: 'EMP-A2', email: 'a2@example.com', role: 'manager', tenantId: 'TENANT-A', companyId: 'TENANT-A' },
    { id: 'EMP-B1', empId: 'EMP-B1', email: 'b1@example.com', role: 'employee', tenantId: 'TENANT-B', companyId: 'TENANT-B' }
  ];
  global.DB.save(data);
}

function safeEvidence() {
  const criticalTables = [
    'employees',
    'attendance',
    'leave_requests',
    'expense_claims',
    'salary_structures',
    'payroll_cycles',
    'payroll_records',
    'payslips',
    'notifications',
    'pending_actions',
    'workflow_events',
    'audit_logs'
  ];
  const roleAccessTests = {};
  ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'].forEach(role => {
    roleAccessTests[role] = [{ name: role + ' staging probe', passed: true, table: 'employees' }];
  });
  return {
    tenantIsolationTests: [
      { name: 'employee tenant isolation', table: 'employees', role: 'EMPLOYEE', passed: true },
      { name: 'manager tenant isolation', table: 'employees', role: 'MANAGER', passed: true },
      { name: 'payroll tenant isolation', table: 'payroll_records', role: 'HR', passed: true }
    ],
    roleAccessTests,
    policyCoverage: criticalTables.map(table => ({
      table,
      rlsEnabled: true,
      policies: [{ policyName: table + '_tenant_policy', command: 'SELECT', roles: ['authenticated'], qual: "tenant_id = auth.jwt() ->> 'tenant_id'" }]
    })),
    roleVisibilityTests: [
      { role: 'EMPLOYEE', passed: true, scope: 'own' },
      { role: 'MANAGER', passed: true, scope: 'team' },
      { role: 'HR', passed: true, scope: 'hr_operational' },
      { role: 'HR_HEAD', passed: true, scope: 'strategic_hr' },
      { role: 'DIRECTOR', passed: true, scope: 'organization_strategic' },
      { role: 'SUPER_ADMIN', passed: true, scope: 'technical_governance', salaryVisible: false, leaveBalanceVisible: false },
      { role: 'PLATFORM_OWNER', passed: true, scope: 'governance_only', tenantHierarchyVisible: false }
    ],
    authValidationTests: [
      { name: 'invite activation', passed: true },
      { name: 'expired invites rejected', passed: true },
      { name: 'invalid roles rejected', passed: true },
      { name: 'tenant-safe activation', passed: true }
    ]
  };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/featureFlagValidator.js',
    'services/launchReadinessService.js',
    'services/rlsValidationService.js',
    'services/environmentGovernanceService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/stagingValidationService.js');

  seedTenantData();

  assert.ok(global.StagingValidationService, 'StagingValidationService should be exported');
  assert.equal(global.__ARTHHRMS_STAGING_VALIDATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');
  assert.ok(Object.isFrozen(global.StagingValidationService), 'service export must be frozen');
  assert.ok(Object.isFrozen(global.StagingValidationService.SEVERITIES), 'severity constants must be immutable');

  const unsafeEnvironment = global.StagingValidationService.validateDeploymentReadiness({
    environment: 'PRODUCTION',
    origin: 'http://localhost:8080',
    flags: {
      PRODUCTION_MODE: true,
      USE_SUPABASE_AUTH: false,
      ALLOW_LOCAL_AUTH_FALLBACK: true,
      REQUIRE_EMAIL_VERIFIED: false
    },
    context: {
      rlsValidated: false,
      inviteFlowValidated: false,
      monitoringEnabled: false
    },
    rlsEvidence: safeEvidence(),
    tenantEvidence: safeEvidence(),
    roleEvidence: safeEvidence(),
    authEvidence: safeEvidence()
  });
  assert.equal(unsafeEnvironment.readiness, 'BLOCKED', 'unsafe production environment must block deployment');
  assert.ok(unsafeEnvironment.failures.some(item => item.failureCode === 'PRODUCTION_LOCALHOST_ORIGIN' && item.severity === 'CRITICAL_BLOCKER'));
  assert.ok(unsafeEnvironment.failures.some(item => item.failureCode === 'PRODUCTION_SUPABASE_AUTH_REQUIRED' && item.severity === 'CRITICAL_BLOCKER'));
  assert.ok(Object.isFrozen(unsafeEnvironment), 'readiness output should be immutable');

  const tenantEvidence = {
    tenantIsolationTests: [
      { name: 'cross tenant leak', table: 'employees', role: 'MANAGER', crossTenantLeak: true, passed: false }
    ]
  };
  const beforeTenantEvidence = JSON.stringify(tenantEvidence);
  const tenantResult = global.StagingValidationService.validateTenantIsolation(tenantEvidence);
  assert.equal(JSON.stringify(tenantEvidence), beforeTenantEvidence, 'tenant evidence must not be mutated');
  assert.equal(tenantResult.passed, false, 'cross-tenant leakage must fail tenant isolation');
  assert.ok(tenantResult.failures.some(item => item.severity === 'CRITICAL_BLOCKER'), 'cross-tenant leakage must be critical blocker');
  assert.ok(Object.isFrozen(tenantResult.failures), 'tenant failures should be immutable');

  const roleResult = global.StagingValidationService.validateRoleVisibility({
    roleVisibilityTests: [
      { role: 'SUPER_ADMIN', salaryVisible: true, leaveBalanceVisible: true, passed: false },
      { role: 'PLATFORM_OWNER', tenantHierarchyVisible: true, passed: false }
    ]
  });
  assert.equal(roleResult.passed, false);
  assert.ok(roleResult.failures.some(item => item.failureCode === 'SUPER_ADMIN_HR_DATA_VISIBLE'));
  assert.ok(roleResult.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_HIERARCHY_VISIBLE'));

  const authResult = global.StagingValidationService.validateAuthSafety({
    authValidationTests: [
      { name: 'cross tenant activation', crossTenantActivation: true, passed: false },
      { name: 'invalid role accepted', invalidRoleAccepted: true, role: 'PLATFORM_OWNER', passed: false },
      { name: 'duplicate onboarding accepted', duplicateOnboardingAccepted: true, passed: false }
    ]
  });
  assert.equal(authResult.passed, false);
  assert.ok(authResult.failures.some(item => item.severity === 'CRITICAL_BLOCKER' && item.failureCode === 'CROSS_TENANT_ACTIVATION'));
  assert.ok(authResult.failures.some(item => item.failureCode === 'INVALID_ROLE_ACCEPTED'));

  const safeReport = global.StagingValidationService.generateStagingValidationReport({
    environment: 'STAGING',
    origin: 'https://staging.arthhrms.example',
    flags: {
      USE_SUPABASE_AUTH: true,
      USE_SUPABASE_INVITES: true,
      REQUIRE_EMAIL_VERIFIED: true,
      ALLOW_LOCAL_AUTH_FALLBACK: false,
      DEVELOPMENT_MODE: false,
      PRODUCTION_MODE: false,
      PILOT_MODE: false
    },
    config: {
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_staging_validation_only'
    },
    context: {
      rlsValidated: true,
      inviteFlowValidated: true,
      monitoringEnabled: true,
      importsValidated: true,
      governanceReviewed: true
    },
    rlsEvidence: safeEvidence(),
    tenantEvidence: safeEvidence(),
    roleEvidence: safeEvidence(),
    authEvidence: safeEvidence()
  });
  assert.equal(safeReport.success, true);
  assert.equal(safeReport.readiness, 'READY', 'complete staging evidence should pass readiness');
  assert.ok(Object.isFrozen(safeReport.sections), 'report sections should be immutable');
  assert.doesNotMatch(JSON.stringify(safeReport), /service_role_secret|PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY/, 'report must not expose private secrets');

  const malformed = global.StagingValidationService.generateStagingValidationReport('bad-input');
  assert.equal(malformed.success, true, 'malformed input should be handled safely');
  assert.equal(malformed.readiness, 'BLOCKED', 'malformed evidence should not be deployment-ready');

  const recentTelemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(recentTelemetry.some(row => /STAGING_VALIDATION/.test(row.eventType)), 'staging validation should emit telemetry safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STAGING_VALIDATION_REPORT_GENERATED, 'staging validation should aggregate workflow metrics safely');
  assert.ok(global.DB.getAuditLogs().some(row => /STAGING_VALIDATION/.test(row.actionType || row.action || '')), 'staging validation should be audited safely');

  console.log('stagingValidationService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
