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

function seedEmergencyData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.platformTenants = [
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', lifecycleState: 'PRODUCTION_ACTIVE', recoveryState: 'RESTORED' },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', lifecycleState: 'DEGRADED', recoveryState: 'LOCKDOWN' }
  ];
  data.emergencyOverrideRecords = [
    {
      emergencyId: 'EMG-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      emergencyType: 'TENANT_LOCKDOWN',
      emergencyState: 'LOCKDOWN',
      severity: 'CRITICAL',
      rollbackActivated: true,
      operationalFreeze: true,
      recoveryMinutes: 42,
      escalationCount: 4,
      correlationId: 'CORR-EMG-1',
      createdAt: '2026-05-30T10:00:00.000Z',
      salary: 95000,
      leaveBalance: 9,
      metadata: { rawDocumentUrl: 'private://tenant-a/hr.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      emergencyId: 'EMG-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      emergencyType: 'FEATURE_ROLLBACK',
      emergencyState: 'ARCHIVED',
      severity: 'WARNING',
      rollbackActivated: true,
      recoveryMinutes: 25,
      correlationId: 'CORR-EMG-2',
      createdAt: '2026-05-20T10:00:00.000Z'
    }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-EMG-1', correlationId: 'CORR-EMG-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', incidentState: 'ESCALATED', severity: 'HIGH_RISK', durationMinutes: 120 }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-EMG-1', correlationId: 'CORR-EMG-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', healthState: 'CRITICAL', failureRate: 25, latencyMs: 2200 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-EMG-1', correlationId: 'CORR-EMG-1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'ROLLBACK_PENDING', failureCount: 6, confidentialNote: 'salary cohort affected' }
  ];
  data.tenantBillingRecords = [
    {
      billingId: 'BILLING-EMG-1',
      correlationId: 'CORR-EMG-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      billingState: 'PAST_DUE',
      renewalFailures: 2,
      paymentStatus: 'FAILED',
      billingRestriction: true,
      rawInvoiceUrl: 'private://tenant-a/invoice.pdf',
      salary: 92000
    }
  ];
  data.auditLogs = [
    { auditId: 'AUD-EMG-1', correlationId: 'CORR-EMG-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', actionType: 'EMERGENCY_OVERRIDE_ACTIVATED', auditState: 'ESCALATED', severity: 'HIGH_RISK' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-EMG-1', correlationId: 'CORR-EMG-1', tenantId: 'TENANT-A', status: 'FAILED', eventType: 'WORKFLOW_FAILED', salary: 81000 }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 95000, leaveBalance: 9 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', salary: 72000, leaveBalance: 3 }
  ];
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
    'services/platformHealthMonitoringService.js',
    'services/globalAuditVisibilityService.js',
    'services/emergencyOverrideService.js'
  ].forEach(load);

  seedEmergencyData();

  assert.ok(global.EmergencyOverrideService, 'EmergencyOverrideService should be exported');
  assert.ok(Object.isFrozen(global.EmergencyOverrideService), 'emergency override service export must be immutable');
  assert.ok(Object.isFrozen(global.EmergencyOverrideService.EMERGENCY_STATES), 'emergency states must be immutable');
  assert.deepEqual(global.EmergencyOverrideService.EMERGENCY_STATES, ['STANDBY', 'ALERTED', 'LOCKDOWN', 'DEGRADED', 'RECOVERY_ACTIVE', 'MITIGATED', 'RESTORED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_EMERGENCY_OVERRIDE_SELF_TEST__.passed, true, 'development self-test should cover emergency governance failure cases');

  const malformed = global.EmergencyOverrideService.normalizeEmergencyPayload(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.EmergencyOverrideService.normalizeEmergencyPayload({
    emergencyId: 'EMG-NORM',
    state: 'lockdown',
    emergencyType: 'feature rollback',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'emergency payload should normalize');
  assert.equal(normalized.payload.emergencyState, 'LOCKDOWN');
  assert.equal(normalized.payload.emergencyType, 'FEATURE_ROLLBACK');
  assert.ok(Object.isFrozen(normalized), 'normalized emergency output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential emergency fields must be filtered');

  const ownerScope = global.EmergencyOverrideService.validateEmergencyScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated emergency governance');

  const tenantRoleScope = global.EmergencyOverrideService.validateEmergencyScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access emergency governance center');

  const superAdminBlocked = global.EmergencyOverrideService.validateEmergencyScope({ emergencyRollback: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBlocked.allowed, false, 'SUPER_ADMIN must not gain strategic emergency override authority');

  const superAdminAssist = global.EmergencyOverrideService.validateEmergencyScope({ infrastructureOnly: true, recoveryAssist: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminAssist.allowed, true, 'SUPER_ADMIN can access infrastructure recovery visibility only');
  assert.equal(superAdminAssist.strategicOverrideAuthority, false);

  const crossTenantAssist = global.EmergencyOverrideService.validateEmergencyScope({ infrastructureOnly: true, recoveryAssist: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantAssist.allowed, false, 'cross-tenant emergency recovery scope should be blocked');

  const archivedMutation = global.EmergencyOverrideService.validateEmergencyScope({ emergencyState: 'ARCHIVED', emergencyOverride: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived emergency history must be immutable');

  assert.equal(global.EmergencyOverrideService.classifyEmergencySeverity({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.EmergencyOverrideService.classifyEmergencySeverity({ rollbackActivated: true, escalationCount: 3 }), 'HIGH_RISK');

  const instability = global.EmergencyOverrideService.detectCriticalInstability({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(instability.success, true, 'critical instability detection should run');
  assert.ok(instability.recoveryIntelligence.degradationSeverity >= 1, 'degradation severity should be tracked');
  assert.ok(instability.recoveryIntelligence.rollbackFrequency >= 1, 'rollback frequency should be tracked');

  const report = global.EmergencyOverrideService.generateEmergencyOverrideReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'emergency report should generate for PLATFORM_OWNER');
  assert.equal(report.accessGovernance.crossTenantConfidentialLeakageBlocked, true);
  assert.equal(report.accessGovernance.superAdminStrategicOverrideAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assert.equal(report.recoveryWorkflows.tenantIsolationLockdowns >= 1, true, 'tenant lockdowns should be summarized');
  assert.equal(report.rollbackGovernance.emergencyRollbackExecutions >= 1, true, 'emergency rollback governance should be summarized');
  assert.equal(report.incidentHealthIntegration.incidentLinkedOverrides >= 1, true, 'incident-linked overrides should be summarized');
  assert.equal(report.integrationHealth.tenantBillingIntegrated, true, 'tenant billing reliability integration should be detected');
  assert.equal(report.incidentHealthIntegration.billingLinkedEmergencyPressure >= 1, true, 'billing restrictions should contribute to emergency recovery pressure');
  assert.equal(report.emergencyAnalytics.billingRecoveryPressure >= 1, true, 'billing-linked emergency pressure should be visible in aggregate analytics');
  assert.equal(report.emergencyAnalytics.emergencyActivationFrequency >= 1, true, 'emergency analytics should be generated');
  assert.ok(Object.isFrozen(report), 'emergency report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /95000|72000|92000|"leaveBalance"|Alice Salary|Bob Private|private:\/\/tenant-a|salary cohort|private payroll|rawDocument|rawInvoice/i, 'emergency report must not expose confidential tenant data');

  const infraReport = global.EmergencyOverrideService.generateEmergencyOverrideReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only emergency report should generate for SUPER_ADMIN');
  assert.equal(infraReport.emergencySummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant emergency rows');
  assert.equal(infraReport.accessGovernance.superAdminStrategicOverrideAuthority, false, 'SUPER_ADMIN must not gain strategic override authority');

  const frozen = global.EmergencyOverrideService.freezeEmergencyOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen), 'freezeEmergencyOutput should freeze root output');
  assert.ok(Object.isFrozen(frozen.nested), 'freezeEmergencyOutput should deep-freeze nested output');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeEmergencyOutput should filter confidential fields');

  const savedIncident = global.GlobalIncidentService;
  const savedHealth = global.PlatformHealthMonitoringService;
  const savedRollout = global.FeatureRolloutService;
  delete global.GlobalIncidentService;
  delete global.PlatformHealthMonitoringService;
  delete global.FeatureRolloutService;
  const dependencyAbsentReport = global.EmergencyOverrideService.generateEmergencyOverrideReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  global.GlobalIncidentService = savedIncident;
  global.PlatformHealthMonitoringService = savedHealth;
  global.FeatureRolloutService = savedRollout;

  let auditCount = 0;
  let telemetryCount = 0;
  let metricCount = 0;
  global.AuditService = { recordAudit(event) { auditCount += 1; return { success: true, event }; } };
  global.WorkflowTelemetryService = { emitTelemetry(category, eventType, payload) { telemetryCount += 1; return { success: true, category, eventType, payload }; } };
  global.OrchestrationMetricsService = { recordWorkflowMetric(name, payload) { metricCount += 1; return { success: true, name, payload }; } };
  const audited = global.EmergencyOverrideService.generateEmergencyOverrideReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true);
  assert.ok(auditCount >= 1, 'emergency visibility access should be auditable');
  assert.ok(telemetryCount >= 1, 'emergency governance should emit telemetry when available');
  assert.ok(metricCount >= 1, 'emergency governance should record metrics when available');

  console.log('emergencyOverrideService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
