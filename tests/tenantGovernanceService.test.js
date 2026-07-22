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

function seedTenantGovernanceData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.platformTenants = [
    {
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      companyName: 'Alpha Tenant',
      lifecycleState: 'PRODUCTION_ACTIVE',
      onboardingStage: 'full_activation',
      planType: 'enterprise',
      subscriptionState: 'ACTIVE'
    },
    {
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      companyName: 'Beta Tenant',
      lifecycleState: 'RESTRICTED',
      onboardingStage: 'setup_only',
      planType: 'pilot',
      subscriptionState: 'WATCH'
    }
  ];
  data.organizationSetups = [
    {
      tenantSlug: 'tenant-a',
      currentStage: 'ACTIVATION_READY',
      activationReadiness: 'READY',
      completionRate: 100,
      companyProfile: { companyName: 'Alpha Tenant' },
      departments: [{ name: 'HR' }, { name: 'Operations' }],
      roleMatrix: ['EMPLOYEE', 'MANAGER', 'HR', 'SUPER_ADMIN']
    },
    {
      tenantSlug: 'tenant-b',
      currentStage: 'COMPANY_PROFILE',
      activationReadiness: 'BLOCKED',
      completionRate: 20,
      companyProfile: { companyName: 'Beta Tenant' },
      blockers: ['Missing departments']
    }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', companyId: 'TENANT-A', role: 'employee', active: true, salary: 90000, leaveBalance: 12 },
    { id: 'EMP-A2', name: 'Alex Payroll', tenantId: 'TENANT-A', companyId: 'TENANT-A', role: 'employee', active: true, salary: 80000, leaveBalance: 8 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', companyId: 'TENANT-B', role: 'employee', active: false, salary: 70000, leaveBalance: 4 }
  ];
  data.users = [
    { id: 'USR-A1', tenantId: 'TENANT-A', role: 'employee', active: true, activationStatus: 'Active', email: 'alice@example.invalid' },
    { id: 'USR-B1', tenantId: 'TENANT-B', role: 'employee', active: false, inviteStatus: 'Pending', email: 'bob@example.invalid' },
    { id: 'USR-PO', role: 'platform_owner', active: true, email: 'owner@example.invalid' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-A1', tenantId: 'TENANT-A', status: 'COMPLETED' },
    { eventId: 'WF-B1', tenantId: 'TENANT-B', status: 'BLOCKED' },
    { eventId: 'WF-B2', tenantId: 'TENANT-B', status: 'DELAYED' }
  ];
  data.pendingActions = [
    { actionId: 'PA-B1', tenantId: 'TENANT-B', status: 'PENDING' }
  ];
  data.escalations = [
    { escalationId: 'ESC-B1', tenantId: 'TENANT-B', status: 'OPEN' },
    { escalationId: 'ESC-B2', tenantId: 'TENANT-B', status: 'OPEN' }
  ];
  data.storageObjects = [
    { objectId: 'SO-A1', tenantId: 'TENANT-A', quotaUtilization: 45, objectPath: 'tenant-a/private/payroll.pdf' },
    { objectId: 'SO-B1', tenantId: 'TENANT-B', quotaUtilization: 94, publicUrl: 'https://example.invalid/private' }
  ];
  data.notificationLogs = [
    { notificationId: 'N-A1', tenantId: 'TENANT-A', status: 'SENT' },
    { notificationId: 'N-B1', tenantId: 'TENANT-B', status: 'FAILED' }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'FR-A1', tenantId: 'TENANT-A', featureKey: 'reports', usageCount: 9, adoptionCount: 7, rolloutState: 'ACTIVE' },
    { rolloutId: 'FR-B1', tenantId: 'TENANT-B', featureKey: 'aiInsights', usageCount: 2, adoptionCount: 0, rolloutState: 'DEGRADED', confidentialNote: 'salary cohort issue' }
  ];
  data.auditLogs = [];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantProvisioningService.js',
    'services/organizationSetupService.js',
    'services/platformAnalyticsService.js',
    'services/tenantGovernanceService.js'
  ].forEach(load);

  seedTenantGovernanceData();

  assert.ok(global.TenantGovernanceService, 'TenantGovernanceService should be exported');
  assert.ok(Object.isFrozen(global.TenantGovernanceService), 'tenant governance service export must be immutable');
  assert.ok(Object.isFrozen(global.TenantGovernanceService.TENANT_STATES), 'tenant states must be immutable');
  assert.deepEqual(global.TenantGovernanceService.TENANT_STATES, ['PROVISIONING', 'ACTIVE', 'DEGRADED', 'RESTRICTED', 'SUSPENDED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_TENANT_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover tenant governance failure cases');

  const malformed = global.TenantGovernanceService.normalizeTenantMetrics(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.TenantGovernanceService.normalizeTenantMetrics({
    tenantId: 'TENANT-A',
    state: 'production active',
    onboardingCompletionRate: 85,
    salary: 90000,
    leaveBalance: 12,
    confidentialEmployeeRecord: 'hidden'
  });
  assert.equal(normalized.success, true, 'tenant metrics should normalize');
  assert.equal(normalized.payload.governanceState, 'ACTIVE');
  assert.ok(Object.isFrozen(normalized), 'normalized metrics should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|leaveBalance|hidden|Alice Salary/i, 'confidential fields must be filtered');

  const ownerScope = global.TenantGovernanceService.validateTenantGovernanceScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated tenant governance');

  const tenantRoleScope = global.TenantGovernanceService.validateTenantGovernanceScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access tenant governance');
  assert.ok(tenantRoleScope.failures.some(item => item.failureCode === 'TENANT_GOVERNANCE_TENANT_UI_BLOCKED' || item.failureCode === 'TENANT_ROLE_GOVERNANCE_BLOCKED'));

  const superAdminBlocked = global.TenantGovernanceService.validateTenantGovernanceScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBlocked.allowed, false, 'SUPER_ADMIN must not access tenant governance analytics');
  assert.ok(superAdminBlocked.failures.some(item => item.failureCode === 'SUPER_ADMIN_TENANT_GOVERNANCE_BLOCKED'));

  const superAdminInfra = global.TenantGovernanceService.validateTenantGovernanceScope({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN can access infrastructure-only monitoring');
  assert.equal(superAdminInfra.visibility, 'INFRASTRUCTURE_ONLY');

  const crossTenantInfra = global.TenantGovernanceService.validateTenantGovernanceScope({ infrastructureOnly: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantInfra.allowed, false, 'cross-tenant infrastructure scope should be blocked');
  assert.ok(crossTenantInfra.failures.some(item => item.failureCode === 'CROSS_TENANT_INFRASTRUCTURE_SCOPE_BLOCKED'));

  const archivedMutation = global.TenantGovernanceService.validateTenantGovernanceScope({ lifecycleState: 'ARCHIVED', activationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical tenant governance records must be immutable after archival');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_TENANT_GOVERNANCE_MUTATION_BLOCKED'));

  const risk = global.TenantGovernanceService.classifyTenantRisk({
    state: 'RESTRICTED',
    onboardingCompletionRate: 20,
    workflowCongestion: 9,
    storagePressure: 94,
    escalationSpikes: 6
  });
  assert.equal(risk.classification, 'CRITICAL_BLOCKER', 'restricted high-pressure tenant should be critical');
  assert.ok(Object.isFrozen(risk.riskFactors), 'risk factors should be immutable');

  const degradation = global.TenantGovernanceService.detectTenantDegradation({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degradation.success, true, 'tenant degradation detection should work');
  assert.ok(degradation.workflowCongestionSpikes >= 1, 'workflow congestion should be detected');
  assert.ok(degradation.abnormalStorageGrowth >= 1, 'storage pressure should be detected');

  const report = global.TenantGovernanceService.generateTenantGovernanceReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(report.success, true, 'tenant governance report should generate');
  assert.equal(report.accessGovernance.crossTenantConfidentialLeakageBlocked, true);
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.ok(report.tenantSummaries.length >= 2, 'tenant summaries should include metadata-only tenant rows');
  assert.ok(report.tenantSummaries.some(row => row.tenantSlug === 'tenant-b' && row.riskScore > 0), 'risk intelligence should flag degraded tenants');
  assert.ok(Object.isFrozen(report), 'tenant report output should be immutable');
  assert.ok(Object.isFrozen(report.tenantSummaries), 'tenant summaries should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /90000|80000|70000|"leaveBalance"|Alice Salary|Bob Private|private\/payroll|example\.invalid\/private|salary cohort/i, 'report must not expose confidential tenant data');

  const infraReport = global.TenantGovernanceService.generateTenantGovernanceReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only report should generate for SUPER_ADMIN');
  assert.equal(infraReport.visibility, 'INFRASTRUCTURE_ONLY');
  assert.equal(infraReport.tenantSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant rows');
  assert.equal(infraReport.tenantLifecycleOverview.employeeCount, 0, 'SUPER_ADMIN infrastructure view must not expose employee counts');

  const previousPlatformAnalytics = global.PlatformAnalyticsService;
  delete global.PlatformAnalyticsService;
  const dependencyAbsentReport = global.TenantGovernanceService.generateTenantGovernanceReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'missing optional platform analytics dependency should degrade safely');
  assert.equal(dependencyAbsentReport.integrationHealth.platformAnalyticsIntegrated, false);
  global.PlatformAnalyticsService = previousPlatformAnalytics;

  assert.ok(global.DB.getAuditLogs().some(row => /TENANT_GOVERNANCE/.test(row.actionType || row.eventType || '')), 'tenant governance access should be auditable');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /TENANT_GOVERNANCE/.test(row.eventType || '')), 'tenant governance should emit telemetry safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.TENANT_GOVERNANCE_REPORTED, 'tenant governance metrics should aggregate safely');

  console.log('tenantGovernanceService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
