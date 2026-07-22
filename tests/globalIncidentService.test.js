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

function seedIncidentData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.platformTenants = [
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', companyName: 'Alpha Tenant', lifecycleState: 'PRODUCTION_ACTIVE', onboardingStage: 'full_activation' },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', companyName: 'Beta Tenant', lifecycleState: 'DEGRADED', onboardingStage: 'setup_only' }
  ];
  data.platformIncidents = [
    {
      incidentId: 'INC-ACTIVE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      incidentType: 'WORKFLOW_OUTAGE',
      incidentState: 'ESCALATED',
      severity: 'HIGH_RISK',
      module: 'workflow',
      createdAt: '2026-05-29T10:00:00.000Z',
      durationMinutes: 90,
      mitigationMinutes: 35,
      impactedTenants: 1,
      salary: 90000,
      leaveBalance: 12,
      rawDocumentUrl: 'private://tenant-a/doc.pdf',
      metadata: { confidentialEmployeeRecord: 'hidden' }
    },
    {
      incidentId: 'INC-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      incidentType: 'STORAGE_DEGRADATION',
      incidentState: 'ARCHIVED',
      severity: 'WARNING',
      module: 'storage',
      createdAt: '2026-05-20T10:00:00.000Z',
      resolvedAt: '2026-05-20T11:00:00.000Z',
      durationMinutes: 60
    }
  ];
  data.workflowEvents = [
    { eventId: 'WF-FAIL-1', tenantId: 'TENANT-A', status: 'FAILED', eventType: 'WORKFLOW_FAILED', salary: 80000 },
    { eventId: 'WF-BLOCK-1', tenantId: 'TENANT-B', status: 'BLOCKED', eventType: 'APPROVAL_BLOCKED' }
  ];
  data.notificationLogs = [
    { notificationId: 'N-FAIL-1', tenantId: 'TENANT-B', status: 'FAILED', messageText: 'private payroll reminder' }
  ];
  data.authInvites = [
    { inviteId: 'INV-B1', tenantId: 'TENANT-B', status: 'FAILED', email: 'person@example.invalid' }
  ];
  data.deploymentLogs = [
    { logId: 'DEP-1', status: 'FAILED', environment: 'PRODUCTION', deploymentStage: 'LIMITED_PRODUCTION' }
  ];
  data.storageObjects = [
    { objectId: 'STO-1', tenantId: 'TENANT-B', status: 'DEGRADED', quotaUtilization: 95, objectPath: 'tenant-b/private/payroll.pdf' }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-1', tenantId: 'TENANT-B', rolloutState: 'DEGRADED', failureCount: 4, confidentialNote: 'salary cohort issue' }
  ];
  data.tenantBillingRecords = [
    {
      billingId: 'BILL-INC-1',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      billingState: 'PAST_DUE',
      renewalStatus: 'FAILED',
      paymentStatus: 'FAILED',
      renewalFailures: 2,
      billingRestriction: true,
      salary: 120000,
      metadata: { rawInvoiceUrl: 'private://tenant-b/invoice.pdf', confidentialNote: 'payroll-linked renewal issue' }
    }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 90000, leaveBalance: 12 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', salary: 70000, leaveBalance: 4 }
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
    'services/tenantGovernanceService.js',
    'services/tenantBillingService.js',
    'services/featureRolloutService.js',
    'services/globalIncidentService.js'
  ].forEach(load);

  seedIncidentData();

  assert.ok(global.GlobalIncidentService, 'GlobalIncidentService should be exported');
  assert.ok(Object.isFrozen(global.GlobalIncidentService), 'global incident service export must be immutable');
  assert.ok(Object.isFrozen(global.GlobalIncidentService.INCIDENT_STATES), 'incident states must be immutable');
  assert.deepEqual(global.GlobalIncidentService.INCIDENT_STATES, ['DETECTED', 'INVESTIGATING', 'DEGRADED', 'ESCALATED', 'MITIGATING', 'RESOLVED', 'POST_REVIEW', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_GLOBAL_INCIDENT_SELF_TEST__.passed, true, 'development self-test should cover incident governance failure cases');

  const malformed = global.GlobalIncidentService.normalizeIncidentPayload(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.GlobalIncidentService.normalizeIncidentPayload({
    incidentId: 'INC-NORM',
    state: 'escalated',
    incidentType: 'workflow',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'incident payload should normalize');
  assert.equal(normalized.payload.incidentState, 'ESCALATED');
  assert.equal(normalized.payload.incidentType, 'WORKFLOW_OUTAGE');
  assert.ok(Object.isFrozen(normalized), 'normalized incident output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential incident fields must be filtered');

  const ownerScope = global.GlobalIncidentService.validateIncidentScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated incident governance');

  const tenantRoleScope = global.GlobalIncidentService.validateIncidentScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access platform incident governance');
  assert.ok(tenantRoleScope.failures.some(item => item.failureCode === 'INCIDENT_GOVERNANCE_TENANT_UI_BLOCKED' || item.failureCode === 'TENANT_ROLE_INCIDENT_GOVERNANCE_BLOCKED'));

  const superAdminBlocked = global.GlobalIncidentService.validateIncidentScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBlocked.allowed, false, 'SUPER_ADMIN must not access platform incident governance analytics');
  assert.ok(superAdminBlocked.failures.some(item => item.failureCode === 'SUPER_ADMIN_INCIDENT_GOVERNANCE_BLOCKED'));

  const superAdminInfra = global.GlobalIncidentService.validateIncidentScope({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN can access infrastructure-only incident monitoring');
  assert.equal(superAdminInfra.visibility, 'INFRASTRUCTURE_INCIDENT_MONITORING');

  const crossTenantInfra = global.GlobalIncidentService.validateIncidentScope({ infrastructureOnly: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantInfra.allowed, false, 'cross-tenant infrastructure incident scope should be blocked');
  assert.ok(crossTenantInfra.failures.some(item => item.failureCode === 'CROSS_TENANT_INFRASTRUCTURE_INCIDENT_SCOPE_BLOCKED'));

  const archivedMutation = global.GlobalIncidentService.validateIncidentScope({ incidentState: 'ARCHIVED', operationalOverride: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical incident mutation must be blocked after archival');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_INCIDENT_MUTATION_BLOCKED'));
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'UNSAFE_OPERATIONAL_OVERRIDE_BLOCKED'));

  assert.equal(global.GlobalIncidentService.classifyIncidentSeverity({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.GlobalIncidentService.classifyIncidentSeverity({ durationMinutes: 90 }), 'HIGH_RISK');

  const degradation = global.GlobalIncidentService.detectReliabilityDegradation({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degradation.success, true, 'reliability degradation detection should work');
  assert.ok(degradation.workflowDegradation >= 1, 'workflow degradation should be detected');
  assert.ok(degradation.featureRolloutFailures >= 1, 'feature rollout failures should be detected');

  const report = global.GlobalIncidentService.generateGlobalIncidentReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(report.success, true, 'global incident report should generate');
  assert.equal(report.accessGovernance.crossTenantConfidentialLeakageBlocked, true);
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.ok(report.incidentSummaries.length >= 3, 'incident summaries should include explicit and derived incident rows');
  assert.ok(report.incidentAnalytics.incidentFrequency >= 3, 'incident analytics should count incidents');
  assert.equal(report.integrationHealth.tenantBillingIntegrated, true, 'tenant billing integration should be detected');
  assert.ok(report.featureDeploymentIntegration.billingReliabilityImpact >= 1, 'billing-linked reliability pressure should be summarized');
  assert.ok(report.platformReliabilityGovernance.reliabilityScore < 100, 'reliability score should reflect incidents');
  assert.ok(Object.isFrozen(report), 'incident report output should be immutable');
  assert.ok(Object.isFrozen(report.incidentSummaries), 'incident summaries should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /90000|80000|70000|120000|"leaveBalance"|Alice Salary|Bob Private|private\/payroll|private:\/\/tenant-a|private:\/\/tenant-b|salary cohort|private payroll|payroll-linked/i, 'incident report must not expose confidential tenant data');

  const infraReport = global.GlobalIncidentService.generateGlobalIncidentReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only report should generate for SUPER_ADMIN');
  assert.equal(infraReport.visibility, 'INFRASTRUCTURE_INCIDENT_MONITORING');
  assert.equal(infraReport.incidentSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose incident rows');

  const previousPlatformAnalytics = global.PlatformAnalyticsService;
  const previousTenantGovernance = global.TenantGovernanceService;
  const previousFeatureRollout = global.FeatureRolloutService;
  const previousTenantBilling = global.TenantBillingService;
  const previousTenantBillingAlias = global.tenantBillingService;
  delete global.PlatformAnalyticsService;
  delete global.TenantGovernanceService;
  delete global.FeatureRolloutService;
  delete global.TenantBillingService;
  delete global.tenantBillingService;
  const dependencyAbsentReport = global.GlobalIncidentService.generateGlobalIncidentReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'missing optional dependencies should degrade safely');
  assert.equal(dependencyAbsentReport.integrationHealth.platformAnalyticsIntegrated, false);
  assert.equal(dependencyAbsentReport.integrationHealth.tenantGovernanceIntegrated, false);
  assert.equal(dependencyAbsentReport.integrationHealth.featureRolloutIntegrated, false);
  assert.equal(dependencyAbsentReport.integrationHealth.tenantBillingIntegrated, false);
  global.PlatformAnalyticsService = previousPlatformAnalytics;
  global.TenantGovernanceService = previousTenantGovernance;
  global.FeatureRolloutService = previousFeatureRollout;
  global.TenantBillingService = previousTenantBilling;
  global.tenantBillingService = previousTenantBillingAlias;

  assert.ok(global.DB.getAuditLogs().some(row => /GLOBAL_INCIDENT/.test(row.actionType || row.eventType || '')), 'incident actions should be auditable');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /GLOBAL_INCIDENT/.test(row.eventType || '')), 'incident governance should emit telemetry safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.GLOBAL_INCIDENT_REPORTED, 'incident governance metrics should aggregate safely');

  console.log('globalIncidentService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
