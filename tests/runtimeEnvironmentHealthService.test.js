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

function seedRuntimeHealthData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.runtimeHealthRecords = [
    {
      runtimeId: 'RUN-HEALTHY',
      environmentId: 'production',
      tenantSlug: 'tenant-a',
      runtimeState: 'HEALTHY',
      checkCategory: 'service availability',
      serviceAvailable: true,
      apiResponsive: true,
      databaseConnected: true,
      authenticationReady: true,
      notificationDeliveryReady: true,
      storageAccessible: true,
      dependenciesAvailable: true,
      workflowExecutionReady: true,
      uptimePercent: 99.99,
      apiLatencyMs: 120,
      dependencyFailureCount: 0,
      authenticationFailureCount: 0,
      workflowFailureCount: 0,
      recoveryValidated: true,
      createdAt: '2026-06-04T07:00:00.000Z',
      salary: 151000,
      leaveBalance: 14,
      metadata: { rawDocumentUrl: 'private://tenant-a/runtime-runbook.txt', confidentialEmployeeRecord: 'hidden' }
    },
    {
      runtimeId: 'RUN-DEGRADED',
      environmentId: 'production',
      tenantSlug: 'tenant-a',
      runtimeState: 'CRITICAL',
      checkCategory: 'dependency availability',
      serviceAvailable: false,
      apiResponsive: false,
      databaseConnected: false,
      authenticationReady: false,
      notificationDeliveryReady: false,
      storageAccessible: false,
      dependenciesAvailable: false,
      workflowExecutionReady: false,
      uptimePercent: 91.2,
      apiLatencyMs: 2400,
      dependencyFailureCount: 7,
      authenticationFailureCount: 4,
      workflowFailureCount: 6,
      recoveryValidated: false,
      partialOutage: true,
      dependencyTimeout: true,
      createdAt: '2026-06-04T08:00:00.000Z'
    }
  ];
  data.platformHealthRecords = [
    { healthId: 'HEALTH-RUNTIME-1', tenantSlug: 'tenant-a', healthState: 'HEALTHY', uptimePercent: 99.99, failureRate: 0 }
  ];
  data.globalIncidentRecords = [
    { incidentId: 'INC-RUNTIME-1', tenantSlug: 'tenant-a', incidentState: 'ACTIVE', severity: 'HIGH_RISK', linkedRuntimeId: 'RUN-DEGRADED' }
  ];
  data.cicdPipelineRecords = [
    { pipelineId: 'PIPE-RUNTIME-1', releaseId: 'REL-RUNTIME-1', tenantSlug: 'tenant-a', pipelineState: 'READY', deploymentValidationPassed: true }
  ];
  data.deploymentValidationRecords = [
    { validationId: 'DEPVAL-RUNTIME-1', releaseId: 'REL-RUNTIME-1', tenantSlug: 'tenant-a', validationState: 'PASSED', healthValidationPassed: true }
  ];
  data.environmentSnapshotRecords = [
    { snapshotId: 'SNAP-RUNTIME-1', tenantSlug: 'tenant-a', snapshotState: 'RECOVERY_READY', integrityVerified: true }
  ];
  data.emergencyOverrideRecords = [
    { overrideId: 'EMERG-RUNTIME-1', tenantSlug: 'tenant-a', overrideState: 'REVOKED', active: false }
  ];
  data.auditLogs = [
    { auditId: 'AUD-RUNTIME-1', tenantSlug: 'tenant-a', actionType: 'RUNTIME_HEALTH_CHECK_RECORDED', auditState: 'RECORDED', severity: 'INFO' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 151000, leaveBalance: 14 }
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
    'services/globalAuditVisibilityService.js',
    'services/platformHealthMonitoringService.js',
    'services/globalIncidentService.js',
    'services/cicdGovernanceService.js',
    'services/deploymentValidationService.js',
    'services/environmentSnapshotService.js',
    'services/emergencyOverrideService.js',
    'services/runtimeEnvironmentHealthService.js'
  ].forEach(load);

  seedRuntimeHealthData();

  const svc = global.RuntimeEnvironmentHealthService;
  assert.ok(svc, 'RuntimeEnvironmentHealthService should be exported');
  assert.ok(Object.isFrozen(svc), 'runtime health service export must be immutable');
  assert.ok(Object.isFrozen(svc.RUNTIME_HEALTH_STATES), 'runtime health states must be immutable');
  assert.deepEqual(svc.RUNTIME_HEALTH_STATES, ['HEALTHY', 'MONITORING', 'DEGRADED', 'WARNING', 'CRITICAL', 'RECOVERING', 'VERIFIED', 'ARCHIVED']);
  assert.equal(typeof svc.validateRuntimeHealth, 'function', 'validateRuntimeHealth helper should be exported');
  assert.equal(typeof svc.calculateRuntimeHealthScore, 'function', 'calculateRuntimeHealthScore helper should be exported');
  assert.equal(typeof svc.calculateOperationalReadiness, 'function', 'calculateOperationalReadiness helper should be exported');
  assert.equal(typeof svc.normalizeRuntimePayload, 'function', 'normalizeRuntimePayload helper should be exported');
  assert.equal(typeof svc.freezeRuntimeOutput, 'function', 'freezeRuntimeOutput helper should be exported');
  assert.equal(typeof svc.generateRuntimeHealthReport, 'function', 'generateRuntimeHealthReport helper should be exported');
  assert.equal(global.__ARTHHRMS_RUNTIME_HEALTH_SELF_TEST__.passed, true, 'runtime health self-test should cover live verification failure cases');

  const malformed = svc.normalizeRuntimePayload(null, {});
  assert.equal(malformed.success, false, 'malformed runtime payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed runtime output should be immutable');

  const normalized = svc.normalizeRuntimePayload({
    runtimeId: 'RUN-NORMALIZE',
    environmentId: 'production',
    tenantSlug: 'tenant-a',
    runtimeState: 'verified',
    checkCategory: 'api responsiveness',
    serviceAvailable: true,
    apiResponsive: true,
    databaseConnected: true,
    authenticationReady: true,
    notificationDeliveryReady: true,
    storageAccessible: true,
    dependenciesAvailable: true,
    workflowExecutionReady: true,
    uptimePercent: 99.97,
    apiLatencyMs: 140,
    dependencyFailureCount: 0,
    recoveryValidated: true,
    salary: 151000,
    leaveBalance: 14,
    metadata: { rawDocumentUrl: 'private://tenant-a/runtime-runbook.txt', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(normalized.success, true, 'runtime normalization should work');
  assert.equal(normalized.runtime.runtimeState, 'VERIFIED');
  assert.equal(normalized.runtime.checkCategory, 'API_RESPONSIVENESS');
  assert.ok(Object.isFrozen(normalized), 'normalized runtime output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /151000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'runtime output must not expose tenant business data');

  const healthyValidation = svc.validateRuntimeHealth(normalized.runtime, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(healthyValidation.allowed, true, 'PLATFORM_OWNER should access isolated runtime monitoring governance');
  assert.equal(healthyValidation.deploymentBlockingRequired, false, 'healthy runtime should not block deployment');
  assert.equal(healthyValidation.escalationRequired, false, 'healthy runtime should not trigger escalation');

  const tenantBlocked = svc.validateRuntimeHealth({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantBlocked.allowed, false, 'tenant roles must never access platform runtime governance');

  const superAdminMutationBlocked = svc.validateRuntimeHealth({ recoveryOverrideRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminMutationBlocked.allowed, false, 'SUPER_ADMIN must not bypass runtime recovery governance');

  const archivedMutation = svc.validateRuntimeHealth({ runtimeState: 'ARCHIVED', recoveryOverrideRequested: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived runtime history must be immutable');

  const degraded = svc.validateRuntimeHealth({
    runtimeId: 'RUN-BLOCKED',
    runtimeState: 'CRITICAL',
    serviceAvailable: false,
    apiResponsive: false,
    databaseConnected: false,
    authenticationReady: false,
    notificationDeliveryReady: false,
    storageAccessible: false,
    dependenciesAvailable: false,
    workflowExecutionReady: false,
    uptimePercent: 90,
    apiLatencyMs: 2600,
    dependencyFailureCount: 8,
    authenticationFailureCount: 3,
    workflowFailureCount: 5,
    recoveryValidated: false,
    partialOutage: true,
    dependencyTimeout: true
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(degraded.deploymentBlockingRequired, true, 'critical runtime issues should block deployment');
  assert.equal(degraded.escalationRequired, true, 'critical runtime issues should trigger escalation');
  assert.ok(degraded.runtimeIssues.length >= 8, 'runtime blockers should be explained');

  const healthScore = svc.calculateRuntimeHealthScore(healthyValidation);
  assert.ok(healthScore.runtimeHealthScore >= 85, 'healthy runtime should have high health score');
  assert.ok(healthScore.environmentStabilityScore >= 80, 'healthy runtime should have high stability score');

  const degradedScore = svc.calculateRuntimeHealthScore(degraded);
  assert.ok(degradedScore.runtimeHealthScore < 60, 'critical runtime should have low health score');

  const readiness = svc.calculateOperationalReadiness(healthyValidation);
  assert.ok(readiness.operationalReadinessScore >= 85, 'healthy runtime should have high operational readiness');
  assert.ok(readiness.recoveryConfidenceScore >= 80, 'validated recovery should have high recovery confidence');

  const degradedReadiness = svc.calculateOperationalReadiness(degraded);
  assert.ok(degradedReadiness.operationalReadinessScore < 60, 'degraded runtime should have low operational readiness');
  assert.ok(degradedReadiness.recoveryConfidenceScore < 60, 'unvalidated recovery should have low recovery confidence');

  const report = svc.generateRuntimeHealthReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(report.success, true, 'runtime health report should run');
  assert.ok(['CRITICAL', 'WARNING', 'DEGRADED', 'MONITORING', 'VERIFIED', 'HEALTHY'].includes(report.runtimeGovernanceModel.state));
  assert.ok(report.activeRuntimeChecks.length >= 1, 'runtime checks should be summarized');
  assert.ok(report.liveVerification.validationCheckpoints.length >= 8, 'live verification checkpoints should be summarized');
  assert.ok(report.runtimeHealth.runtimeHealthScore >= 0);
  assert.ok(report.operationalReadiness.operationalReadinessScore >= 0);
  assert.ok(report.dependencyHealth.dependencyFailureCount >= 1, 'dependency failures should be tracked');
  assert.ok(report.runtimeAnalytics.runtimeInstabilityFrequency >= 1, 'runtime instability should be tracked');
  assert.ok(report.governanceIntegrations.platformHealthIntegrated, 'platform health integration should be reported');
  assert.ok(report.auditSummary.runtimeActionsAuditable, 'runtime auditability should be preserved');
  assert.ok(Object.isFrozen(report), 'runtime report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /151000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'runtime report must not expose tenant business data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /RUNTIME_HEALTH/.test(row.eventType)), 'runtime health governance should emit telemetry');
  assert.ok(global.DB.getAuditLogs().some(row => /RUNTIME_HEALTH/.test(row.actionType || row.action || '')), 'runtime health governance should audit actions');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.RUNTIME_HEALTH_GOVERNANCE_REPORTED, 'runtime health governance should emit metrics');

  console.log('runtimeEnvironmentHealthService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
