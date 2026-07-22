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

function seedContinuityData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.deploymentContinuityRecords = [
    {
      continuityId: 'CONT-READY',
      releaseId: 'REL-HA-1',
      deploymentId: 'DEP-HA-1',
      tenantSlug: 'tenant-a',
      continuityState: 'READY',
      deploymentMode: 'BLUE_GREEN',
      deploymentReady: true,
      rollbackReady: true,
      healthMonitoringReady: true,
      environmentConsistent: true,
      trafficMigrationReady: true,
      serviceDependenciesReady: true,
      failoverPrepared: true,
      certifiedRelease: true,
      validatedPipeline: true,
      healthyEnvironment: true,
      stabilizationApproved: true,
      stabilizationWindowMinutes: 30,
      trafficMigratedPercent: 0,
      uptimePercent: 99.98,
      interruptionMinutes: 0,
      cutoverSucceeded: true,
      recoverySucceeded: true,
      createdAt: '2026-06-03T07:00:00.000Z',
      salary: 151000,
      leaveBalance: 14,
      metadata: { rawDocumentUrl: 'private://tenant-a/ha-runbook.txt', confidentialEmployeeRecord: 'hidden' }
    },
    {
      continuityId: 'CONT-DEGRADED',
      releaseId: 'REL-HA-2',
      deploymentId: 'DEP-HA-2',
      tenantSlug: 'tenant-a',
      continuityState: 'DEGRADED',
      deploymentMode: 'ROLLING',
      deploymentReady: true,
      rollbackReady: false,
      healthMonitoringReady: false,
      environmentConsistent: false,
      trafficMigrationReady: false,
      serviceDependenciesReady: false,
      failoverPrepared: false,
      certifiedRelease: false,
      validatedPipeline: false,
      healthyEnvironment: false,
      stabilizationFailure: true,
      interruptionMinutes: 12,
      cutoverSucceeded: false,
      recoverySucceeded: false,
      healthCritical: true,
      emergencyOverrideActive: true,
      createdAt: '2026-06-03T08:00:00.000Z'
    }
  ];
  data.cicdPipelineRecords = [
    { pipelineId: 'PIPE-HA-1', releaseId: 'REL-HA-1', tenantSlug: 'tenant-a', pipelineState: 'READY', productionApprovalGranted: true, rollbackReady: true }
  ];
  data.environmentSnapshotRecords = [
    { snapshotId: 'SNAP-HA-1', releaseId: 'REL-HA-1', tenantSlug: 'tenant-a', snapshotState: 'RECOVERY_READY', integrityVerified: true, rollbackSafe: true }
  ];
  data.safeReleaseRecords = [
    { safeReleaseId: 'SAFE-HA-1', releaseId: 'REL-HA-1', tenantSlug: 'tenant-a', releaseState: 'ACTIVE', releaseApproved: true, rollbackReady: true, stabilizationCheckpoint: true }
  ];
  data.platformHealthRecords = [
    { healthId: 'HEALTH-HA-1', tenantSlug: 'tenant-a', healthState: 'HEALTHY', uptimePercent: 99.98, failureRate: 0 }
  ];
  data.globalIncidentRecords = [
    { incidentId: 'INC-HA-1', tenantSlug: 'tenant-a', incidentState: 'RESOLVED', severity: 'INFO' }
  ];
  data.auditLogs = [
    { auditId: 'AUD-HA-1', tenantSlug: 'tenant-a', actionType: 'ZERO_DOWNTIME_CONTINUITY_REVIEWED', auditState: 'RECORDED', severity: 'INFO' }
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
    'services/deploymentValidationService.js',
    'services/productionReadinessService.js',
    'services/safeReleaseGovernanceService.js',
    'services/environmentActivationService.js',
    'services/environmentSnapshotService.js',
    'services/cicdGovernanceService.js',
    'services/zeroDowntimeDeploymentService.js'
  ].forEach(load);

  seedContinuityData();

  const svc = global.ZeroDowntimeDeploymentService;
  assert.ok(svc, 'ZeroDowntimeDeploymentService should be exported');
  assert.ok(Object.isFrozen(svc), 'zero downtime service export must be immutable');
  assert.ok(Object.isFrozen(svc.CONTINUITY_STATES), 'continuity states must be immutable');
  assert.deepEqual(svc.CONTINUITY_STATES, ['PREPARING', 'READY', 'TRANSITIONING', 'VALIDATING', 'STABILIZING', 'ACTIVE', 'DEGRADED', 'FAILOVER', 'ARCHIVED']);
  assert.equal(typeof svc.validateDeploymentContinuity, 'function', 'validateDeploymentContinuity helper should be exported');
  assert.equal(typeof svc.calculateAvailabilityScore, 'function', 'calculateAvailabilityScore helper should be exported');
  assert.equal(typeof svc.calculateFailoverReadiness, 'function', 'calculateFailoverReadiness helper should be exported');
  assert.equal(typeof svc.normalizeContinuityPayload, 'function', 'normalizeContinuityPayload helper should be exported');
  assert.equal(typeof svc.freezeContinuityOutput, 'function', 'freezeContinuityOutput helper should be exported');
  assert.equal(typeof svc.generateZeroDowntimeReport, 'function', 'generateZeroDowntimeReport helper should be exported');
  assert.equal(global.__ARTHHRMS_ZERO_DOWNTIME_SELF_TEST__.passed, true, 'zero downtime self-test should cover HA failure cases');

  const malformed = svc.normalizeContinuityPayload(null, {});
  assert.equal(malformed.success, false, 'malformed continuity payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed continuity output should be immutable');

  const normalized = svc.normalizeContinuityPayload({
    continuityId: 'CONT-NORMALIZE',
    releaseId: 'REL-HA-3',
    deploymentId: 'DEP-HA-3',
    continuityState: 'stabilizing',
    deploymentMode: 'blue green',
    tenantSlug: 'tenant-a',
    deploymentReady: true,
    rollbackReady: true,
    healthMonitoringReady: true,
    environmentConsistent: true,
    trafficMigrationReady: true,
    serviceDependenciesReady: true,
    failoverPrepared: true,
    certifiedRelease: true,
    validatedPipeline: true,
    healthyEnvironment: true,
    stabilizationApproved: true,
    trafficMigratedPercent: 45,
    uptimePercent: 99.95,
    salary: 151000,
    leaveBalance: 14,
    metadata: { rawDocumentUrl: 'private://tenant-a/ha-runbook.txt', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(normalized.success, true, 'continuity normalization should work');
  assert.equal(normalized.continuity.continuityState, 'STABILIZING');
  assert.equal(normalized.continuity.deploymentMode, 'BLUE_GREEN');
  assert.ok(Object.isFrozen(normalized), 'normalized continuity output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /151000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'continuity output must not expose tenant business data');

  const ready = svc.validateDeploymentContinuity({
    ...normalized.continuity,
    continuityState: 'READY',
    trafficMigratedPercent: 100
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(ready.allowed, true, 'PLATFORM_OWNER should access isolated HA governance');
  assert.equal(ready.activationBlocked, false, 'fully ready continuity should not be blocked');

  const tenantBlocked = svc.validateDeploymentContinuity({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantBlocked.allowed, false, 'tenant roles must never access HA governance');

  const superAdminCutoverBlocked = svc.validateDeploymentContinuity({ cutoverRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminCutoverBlocked.allowed, false, 'SUPER_ADMIN must not execute release cutovers');

  const archivedMutation = svc.validateDeploymentContinuity({ continuityState: 'ARCHIVED', failoverActivationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived continuity history must be immutable');

  const blocked = svc.validateDeploymentContinuity({
    continuityId: 'CONT-BLOCKED',
    deploymentReady: true,
    rollbackReady: false,
    healthMonitoringReady: false,
    environmentConsistent: false,
    trafficMigrationReady: false,
    serviceDependenciesReady: false,
    failoverPrepared: false,
    certifiedRelease: false,
    validatedPipeline: false,
    healthyEnvironment: false,
    healthCritical: true,
    unresolvedDeploymentRisk: true,
    emergencyOverrideActive: true
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(blocked.activationBlocked, true, 'unsafe continuity should block activation');
  assert.ok(blocked.blockingConditions.length >= 7, 'continuity blockers should be explained');

  const availability = svc.calculateAvailabilityScore(ready);
  assert.ok(availability.availabilityScore >= 85, 'ready continuity should have high availability score');
  assert.ok(availability.continuityConfidenceScore >= 80, 'ready continuity should have high continuity confidence');

  const degradedAvailability = svc.calculateAvailabilityScore(blocked);
  assert.ok(degradedAvailability.availabilityScore < 60, 'blocked continuity should have low availability score');

  const failoverReady = svc.calculateFailoverReadiness(ready);
  assert.ok(failoverReady.failoverReadinessScore >= 80, 'ready continuity should have high failover readiness');

  const failoverBlocked = svc.calculateFailoverReadiness(blocked);
  assert.equal(failoverBlocked.failoverBlocked, true, 'unsafe failover should be blocked');
  assert.ok(failoverBlocked.failoverReadinessScore < 60);

  const report = svc.generateZeroDowntimeReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(report.success, true, 'zero downtime report should run');
  assert.ok(['DEGRADED', 'VALIDATING', 'STABILIZING', 'ACTIVE', 'READY'].includes(report.continuityGovernanceModel.state));
  assert.ok(report.activeContinuity.length >= 1, 'active continuity records should be summarized');
  assert.ok(report.continuityValidation.validationCheckpoints.length >= 7, 'continuity checkpoints should be summarized');
  assert.ok(report.availability.availabilityScore >= 0);
  assert.ok(report.failoverReadiness.failoverReadinessScore >= 0);
  assert.ok(report.stabilization.stabilizationScore >= 0);
  assert.ok(report.availabilityAnalytics.deploymentInterruptions >= 1, 'deployment interruptions should be tracked');
  assert.ok(report.governanceIntegrations.cicdGovernanceIntegrated, 'CI/CD integration should be reported');
  assert.ok(report.auditSummary.continuityActionsAuditable, 'continuity auditability should be preserved');
  assert.ok(Object.isFrozen(report), 'zero downtime report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /151000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'zero downtime report must not expose tenant business data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ZERO_DOWNTIME/.test(row.eventType)), 'zero downtime governance should emit telemetry');
  assert.ok(global.DB.getAuditLogs().some(row => /ZERO_DOWNTIME/.test(row.actionType || row.action || '')), 'zero downtime governance should audit actions');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ZERO_DOWNTIME_GOVERNANCE_REPORTED, 'zero downtime governance should emit metrics');

  console.log('zeroDowntimeDeploymentService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
