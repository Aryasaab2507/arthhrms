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

function seedHealthData() {
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
  data.platformHealthRecords = [
    {
      healthId: 'HLT-ACTIVE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      healthState: 'DEGRADED',
      healthType: 'WORKFLOW_THROUGHPUT',
      service: 'workflow',
      throughputRate: 42,
      latencyMs: 1800,
      failureRate: 18,
      recoveryMinutes: 35,
      salary: 90000,
      leaveBalance: 12,
      rawDocumentUrl: 'private://tenant-a/payroll.pdf',
      metadata: { confidentialEmployeeRecord: 'hidden' }
    },
    {
      healthId: 'HLT-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      healthState: 'ARCHIVED',
      healthType: 'STORAGE_STABILITY',
      service: 'storage',
      throughputRate: 70,
      latencyMs: 900,
      failureRate: 5,
      recoveryMinutes: 12
    }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-1', tenantId: 'TENANT-A', incidentType: 'WORKFLOW_OUTAGE', incidentState: 'ESCALATED', durationMinutes: 90, mitigationMinutes: 30 }
  ];
  data.workflowEvents = [
    { eventId: 'WF-OK', tenantId: 'TENANT-A', status: 'COMPLETED', eventType: 'WORKFLOW_COMPLETED', durationMs: 400 },
    { eventId: 'WF-FAIL', tenantId: 'TENANT-B', status: 'FAILED', eventType: 'WORKFLOW_FAILED', durationMs: 5000, salary: 80000 },
    { eventId: 'WF-BLOCK', tenantId: 'TENANT-B', status: 'BLOCKED', eventType: 'APPROVAL_BLOCKED', durationMs: 6400 }
  ];
  data.notificationLogs = [
    { notificationId: 'N-FAIL', tenantId: 'TENANT-B', status: 'FAILED', channel: 'EMAIL', messageText: 'private payroll reminder' }
  ];
  data.authInvites = [
    { inviteId: 'INV-FAIL', tenantId: 'TENANT-B', status: 'FAILED', email: 'person@example.invalid' }
  ];
  data.storageObjects = [
    { objectId: 'STO-DEG', tenantId: 'TENANT-B', status: 'DEGRADED', quotaUtilization: 96, objectPath: 'tenant-b/private/payroll.pdf' }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-DEG', tenantId: 'TENANT-B', rolloutState: 'DEGRADED', failureCount: 5, confidentialNote: 'salary cohort issue' }
  ];
  data.tenantBillingRecords = [
    {
      billingId: 'BILL-PAST-DUE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      billingState: 'PAST_DUE',
      renewalFailures: 2,
      billingRestriction: true,
      paymentStatus: 'FAILED',
      invoiceState: 'PAYMENT_FAILED',
      amountDue: 120000,
      rawInvoiceUrl: 'https://billing.example/private/tenant-a.pdf',
      metadata: { confidentialNote: 'payroll-linked billing pressure' }
    },
    {
      billingId: 'BILL-SAFE-B',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      billingState: 'ACTIVE',
      paymentStatus: 'PAID',
      amountDue: 40000,
      privatePayload: 'tenant-b billing payload'
    }
  ];
  data.paymentStateRecords = [
    { id: 'PAY-A-FAILED', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', paymentStatus: 'FAILED', privatePayload: 'tenant-a payment private' }
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
    'services/platformAnalyticsService.js',
    'services/tenantGovernanceService.js',
    'services/tenantBillingService.js',
    'services/featureRolloutService.js',
    'services/globalIncidentService.js',
    'services/platformHealthMonitoringService.js'
  ].forEach(load);

  seedHealthData();

  assert.ok(global.PlatformHealthMonitoringService, 'PlatformHealthMonitoringService should be exported');
  assert.ok(Object.isFrozen(global.PlatformHealthMonitoringService), 'platform health service export must be immutable');
  assert.ok(Object.isFrozen(global.PlatformHealthMonitoringService.HEALTH_STATES), 'health states must be immutable');
  assert.deepEqual(global.PlatformHealthMonitoringService.HEALTH_STATES, ['HEALTHY', 'MONITORING', 'DEGRADED', 'WARNING', 'CRITICAL', 'RECOVERING', 'STABILIZED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_PLATFORM_HEALTH_SELF_TEST__.passed, true, 'development self-test should cover health governance failure cases');
  assert.ok(global.__ARTHHRMS_PLATFORM_HEALTH_SELF_TEST__.checks.some(row => row.checkId === 'OPTIONAL_BILLING_DEPENDENCY_ABSENCE_IS_SAFE' && row.passed === true), 'self-test should explicitly cover billing dependency absence');

  const malformed = global.PlatformHealthMonitoringService.normalizeHealthPayload(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.PlatformHealthMonitoringService.normalizeHealthPayload({
    healthId: 'HLT-NORM',
    state: 'critical',
    healthType: 'workflow',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'health payload should normalize');
  assert.equal(normalized.payload.healthState, 'CRITICAL');
  assert.equal(normalized.payload.healthType, 'WORKFLOW_THROUGHPUT');
  assert.ok(Object.isFrozen(normalized), 'normalized health output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential health fields must be filtered');

  const ownerScope = global.PlatformHealthMonitoringService.validateHealthScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated health governance');

  const tenantRoleScope = global.PlatformHealthMonitoringService.validateHealthScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access platform health monitoring');

  const superAdminBlocked = global.PlatformHealthMonitoringService.validateHealthScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBlocked.allowed, false, 'SUPER_ADMIN must not access broad platform health governance analytics');

  const superAdminInfra = global.PlatformHealthMonitoringService.validateHealthScope({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN can access infrastructure-only health monitoring');
  assert.equal(superAdminInfra.visibility, 'INFRASTRUCTURE_HEALTH_MONITORING');

  const crossTenantInfra = global.PlatformHealthMonitoringService.validateHealthScope({ infrastructureOnly: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantInfra.allowed, false, 'cross-tenant infrastructure health scope should be blocked');

  const archivedMutation = global.PlatformHealthMonitoringService.validateHealthScope({ healthState: 'ARCHIVED', infrastructureOverride: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical health mutation must be blocked after archival');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_HEALTH_MUTATION_BLOCKED'));
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'UNSAFE_INFRASTRUCTURE_OVERRIDE_BLOCKED'));

  assert.equal(global.PlatformHealthMonitoringService.classifyHealthSeverity({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.PlatformHealthMonitoringService.classifyHealthSeverity({ latencyMs: 1800, failureRate: 18 }), 'HIGH_RISK');

  const instability = global.PlatformHealthMonitoringService.detectOperationalInstability({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(instability.success, true, 'operational instability detection should generate safely');
  assert.ok(instability.healthAlertIntelligence.workflowThroughputDecline >= 1, 'workflow throughput decline should be detected');
  assert.ok(instability.healthAlertIntelligence.notificationFailureSpikes >= 1, 'notification instability should be detected');
  assert.ok(Object.isFrozen(instability), 'instability output should be immutable');

  const report = global.PlatformHealthMonitoringService.generatePlatformHealthReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'platform health report should generate');
  assert.ok(report.operationalStabilityGovernance.realTimeHealthMonitoring, 'real-time monitoring should be represented');
  assert.ok(report.incidentReliabilityIntegration.incidentLinkedDegradation >= 1, 'incident degradation should integrate');
  assert.ok(report.operationalStabilityGovernance.billingReliabilityPressure >= 1, 'billing reliability pressure should contribute to stability governance');
  assert.ok(report.healthAlertIntelligence.billingReliabilityPressure >= 1, 'billing reliability pressure should be detected');
  assert.ok(report.incidentReliabilityIntegration.billingLinkedDegradation >= 1, 'billing degradation should integrate without raw financial exposure');
  assert.equal(report.integrationHealth.tenantBillingIntegrated, true, 'tenant billing integration should be reported when available');
  assert.ok(report.healthAnalytics.degradationFrequency >= 1, 'health analytics should count degradation');
  assert.equal(report.accessGovernance.salaryVisibility, false, 'salary visibility must be blocked');
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false, 'leave balance visibility must be blocked');
  assert.equal(report.accessGovernance.platformIsolationPreserved, true, 'platform isolation must be preserved');
  assert.doesNotMatch(JSON.stringify(report), /120000|rawInvoiceUrl|payroll-linked|tenant-b billing payload|90000|80000|70000|"leaveBalance"|Alice Salary|Bob Private|private\/payroll|private:\/\/tenant-a|salary cohort|private payroll/i, 'health report must not expose confidential tenant data');

  const infraReport = global.PlatformHealthMonitoringService.generatePlatformHealthReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only report should generate for SUPER_ADMIN');
  assert.equal(infraReport.healthSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant health rows');
  assert.equal(infraReport.accessGovernance.superAdminHrPayrollVisibility, false, 'SUPER_ADMIN must not gain HR/payroll visibility');

  const frozen = global.PlatformHealthMonitoringService.freezeHealthOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'freezeHealthOutput should deep-freeze outputs');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeHealthOutput should filter confidential fields');

  const savedGlobalIncident = global.GlobalIncidentService;
  const savedAnalytics = global.PlatformAnalyticsService;
  const savedTenantBilling = global.TenantBillingService;
  delete global.GlobalIncidentService;
  delete global.globalIncidentService;
  delete global.PlatformAnalyticsService;
  delete global.platformAnalyticsService;
  delete global.TenantBillingService;
  delete global.tenantBillingService;
  const dependencyAbsentReport = global.PlatformHealthMonitoringService.generatePlatformHealthReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalIncidentIntegrated, false, 'missing incident integration should be reflected');
  assert.equal(dependencyAbsentReport.integrationHealth.tenantBillingIntegrated, false, 'missing billing integration should be reflected');
  global.GlobalIncidentService = savedGlobalIncident;
  global.globalIncidentService = savedGlobalIncident;
  global.PlatformAnalyticsService = savedAnalytics;
  global.platformAnalyticsService = savedAnalytics;
  global.TenantBillingService = savedTenantBilling;
  global.tenantBillingService = savedTenantBilling;

  const audited = global.PlatformHealthMonitoringService.generatePlatformHealthReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true, 'audited report should still generate');
  const latest = global.DB.get();
  assert.ok((latest.auditLogs || []).some(row => /HEALTH/i.test(row.action || row.actionType || row.description || '')), 'health governance access should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /HEALTH/i.test(row.eventType || row.category || '')), 'health governance should emit telemetry');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.PLATFORM_HEALTH_REPORTED, 'health governance should emit metrics');

  console.log('platformHealthMonitoringService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
