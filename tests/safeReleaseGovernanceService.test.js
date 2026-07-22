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

function seedReleaseData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.environmentState = { mode: 'LIMITED_PRODUCTION', updatedAt: '2026-06-01T09:00:00.000Z' };
  data.safeReleaseRecords = [
    {
      safeReleaseId: 'SAFE-1',
      releaseId: 'REL-1',
      rolloutWaveId: 'WAVE-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      releaseState: 'STABILIZING',
      releaseType: 'CONTROLLED_ROLLOUT',
      severity: 'HIGH_RISK',
      environment: 'PRODUCTION',
      rolloutWave: 2,
      rolloutPercentage: 25,
      releaseFreeze: true,
      rollbackReady: false,
      rollbackActive: false,
      stabilizationFailure: true,
      stabilizationDelayMinutes: 90,
      approvalCheckpoint: true,
      deploymentSafetyMarker: true,
      correlationId: 'CORR-RELEASE-1',
      createdAt: '2026-06-01T10:00:00.000Z',
      salary: 99000,
      leaveBalance: 8,
      metadata: { rawDocumentUrl: 'private://tenant-a/release.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      safeReleaseId: 'SAFE-ARCHIVED',
      releaseId: 'REL-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      releaseState: 'ARCHIVED',
      releaseType: 'ROLLBACK_GOVERNANCE',
      severity: 'WARNING',
      rollbackReady: true,
      stabilizationCheckpoint: true,
      correlationId: 'CORR-RELEASE-2',
      createdAt: '2026-05-20T10:00:00.000Z'
    }
  ];
  data.releaseWaveRecords = [
    { rolloutWaveId: 'WAVE-1', safeReleaseId: 'SAFE-1', correlationId: 'CORR-RELEASE-1', tenantSlug: 'tenant-a', status: 'STAGED', rolloutPercentage: 25, approvalCheckpoint: true }
  ];
  data.releaseStabilizationRecords = [
    { stabilizationId: 'STAB-REL-1', correlationId: 'CORR-RELEASE-1', tenantSlug: 'tenant-a', status: 'DEGRADED', stabilizationFailure: true, stabilizationDelayMinutes: 90 }
  ];
  data.productionReadinessRecords = [
    { readinessId: 'READY-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', readinessState: 'IN_REVIEW', rollbackPrepared: false, stabilityVerified: false, environmentConsistent: false }
  ];
  data.deploymentValidationRecords = [
    { deploymentId: 'DEPLOY-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', deploymentState: 'FAILED', validationFailures: 2, rollbackReady: false, migrationInstability: true }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', incidentState: 'CRITICAL', severity: 'CRITICAL', durationMinutes: 130 }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', healthState: 'CRITICAL', failureRate: 18, latencyMs: 1900 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'ROLLBACK_PENDING', failureCount: 5, confidentialNote: 'salary cohort affected' }
  ];
  data.emergencyOverrideRecords = [
    { emergencyId: 'EMG-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', emergencyState: 'RECOVERY_ACTIVE', emergencyType: 'FEATURE_ROLLBACK', rollbackActivated: true, recoveryMinutes: 40 }
  ];
  data.auditLogs = [
    { auditId: 'AUD-REL-1', correlationId: 'CORR-RELEASE-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', actionType: 'ROLLOUT_APPROVAL_STARTED', auditState: 'ESCALATED', severity: 'HIGH_RISK' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 99000, leaveBalance: 8 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', salary: 73000, leaveBalance: 5 }
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
    'services/featureRolloutService.js',
    'services/globalIncidentService.js',
    'services/platformHealthMonitoringService.js',
    'services/globalAuditVisibilityService.js',
    'services/emergencyOverrideService.js',
    'services/deploymentSafetyService.js',
    'services/environmentGovernanceService.js',
    'services/stagingValidationService.js',
    'services/deploymentValidationService.js',
    'services/productionReadinessService.js',
    'services/safeReleaseGovernanceService.js'
  ].forEach(load);

  seedReleaseData();

  assert.ok(global.SafeReleaseGovernanceService, 'SafeReleaseGovernanceService should be exported');
  assert.ok(Object.isFrozen(global.SafeReleaseGovernanceService), 'safe release service export must be immutable');
  assert.ok(Object.isFrozen(global.SafeReleaseGovernanceService.RELEASE_STATES), 'release states must be immutable');
  assert.deepEqual(global.SafeReleaseGovernanceService.RELEASE_STATES, ['PLANNED', 'APPROVED', 'STAGED', 'LIMITED_RELEASE', 'STABILIZING', 'DEGRADED', 'ROLLBACK_ACTIVE', 'ARCHIVED']);
  assert.equal(typeof global.SafeReleaseGovernanceService.validateReleaseGovernance, 'function', 'validateReleaseGovernance helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.calculateRolloutConfidence, 'function', 'calculateRolloutConfidence helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.calculateRolloutRisk, 'function', 'calculateRolloutRisk helper should be exported');
  assert.equal(global.__ARTHHRMS_SAFE_RELEASE_SELF_TEST__.passed, true, 'development self-test should cover safe release failure cases');
  assert.ok(Object.isFrozen(global.SafeReleaseGovernanceService.ROLLBACK_STATES), 'rollback states must be immutable');
  assert.deepEqual(global.SafeReleaseGovernanceService.ROLLBACK_STATES, ['READY', 'VALIDATING', 'APPROVED', 'EXECUTING', 'RECOVERING', 'VERIFIED', 'FAILED', 'ARCHIVED']);
  assert.equal(typeof global.SafeReleaseGovernanceService.normalizeRollbackPayload, 'function', 'normalizeRollbackPayload helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.validateRollbackEligibility, 'function', 'validateRollbackEligibility helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.calculateRollbackConfidence, 'function', 'calculateRollbackConfidence helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.verifyRecoveryIntegrity, 'function', 'verifyRecoveryIntegrity helper should be exported');
  assert.equal(typeof global.SafeReleaseGovernanceService.generateRollbackSafetyReport, 'function', 'generateRollbackSafetyReport helper should be exported');
  assert.equal(global.__ARTHHRMS_ROLLBACK_SAFETY_SELF_TEST__.passed, true, 'rollback safety self-test should cover recovery assurance failure cases');

  const malformed = global.SafeReleaseGovernanceService.normalizeReleasePayload(null, {});
  assert.equal(malformed.success, false, 'malformed release payloads should fail safely');

  const normalized = global.SafeReleaseGovernanceService.normalizeReleasePayload({
    safeReleaseId: 'SAFE-NORM',
    state: 'limited release',
    releaseType: 'rollout wave',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'release payload should normalize');
  assert.equal(normalized.payload.releaseState, 'LIMITED_RELEASE');
  assert.equal(normalized.payload.releaseType, 'ROLLOUT_WAVE');
  assert.ok(Object.isFrozen(normalized), 'normalized release output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential release fields must be filtered');

  const rolloutRisk = global.SafeReleaseGovernanceService.calculateRolloutRisk({
    certificationMissing: true,
    criticalIncidentActive: true,
    healthStatusCritical: true,
    emergencyOverrideActive: true,
    unresolvedDeploymentValidationFailure: true,
    rollbackReadinessUnavailable: true,
    releaseFreeze: true
  });
  assert.equal(rolloutRisk.success, true, 'rollout risk calculation should run');
  assert.equal(rolloutRisk.rolloutBlocked, true, 'hard blockers must block rollout');
  assert.equal(rolloutRisk.riskLevel, 'CRITICAL_BLOCKER');
  assert.ok(rolloutRisk.blockedReleaseReasons.length >= 6, 'all hard blockers should be surfaced safely');

  const confidence = global.SafeReleaseGovernanceService.calculateRolloutConfidence({
    rolloutPercentage: 50,
    internalRolloutComplete: true,
    pilotRolloutComplete: true,
    departmentRolloutComplete: true,
    tenantRolloutComplete: false,
    fullRolloutComplete: false,
    stabilizationScore: 88,
    releaseApproved: true,
    deploymentValidated: true,
    readinessCertified: true,
    rollbackReady: true
  });
  assert.equal(confidence.success, true, 'rollout confidence calculation should run');
  assert.equal(confidence.rolloutConfidenceScore >= 60, true, 'controlled rollout should produce confidence score');
  assert.equal(confidence.rolloutRiskScore < 50, true, 'healthy phased rollout should remain below high-risk score');

  const blockedGovernance = global.SafeReleaseGovernanceService.validateReleaseGovernance({
    releaseId: 'REL-BLOCKED',
    rolloutPercentage: 25,
    releaseApproved: false,
    readinessCertified: false,
    deploymentValidated: false,
    rollbackReady: false,
    criticalIncidentActive: true
  }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(blockedGovernance.success, true, 'release governance validation should run');
  assert.equal(blockedGovernance.releaseSafety.rolloutBlocked, true, 'missing certification and critical incident should block release');
  assert.equal(blockedGovernance.rolloutConfidence.rolloutEligible, false, 'blocked release should not be rollout eligible');

  const ownerScope = global.SafeReleaseGovernanceService.validateReleaseScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated release governance');
  assert.equal(ownerScope.rolloutAuthority, true, 'PLATFORM_OWNER should retain final rollout authority');

  const tenantRoleScope = global.SafeReleaseGovernanceService.validateReleaseScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access release governance center');

  const superAdminBypass = global.SafeReleaseGovernanceService.validateReleaseScope({ rolloutBypass: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass rollout governance validation');

  const superAdminMonitor = global.SafeReleaseGovernanceService.validateReleaseScope({ infrastructureOnly: true, rolloutMonitoring: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminMonitor.allowed, true, 'SUPER_ADMIN can monitor infrastructure rollout health only');
  assert.equal(superAdminMonitor.rolloutAuthority, false);

  const crossTenantMonitor = global.SafeReleaseGovernanceService.validateReleaseScope({ infrastructureOnly: true, rolloutMonitoring: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantMonitor.allowed, false, 'cross-tenant release visibility should be blocked');

  const archivedMutation = global.SafeReleaseGovernanceService.validateReleaseScope({ releaseState: 'ARCHIVED', rolloutBypass: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived release governance history must be immutable');

  assert.equal(global.SafeReleaseGovernanceService.classifyReleaseRisk({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.SafeReleaseGovernanceService.classifyReleaseRisk({ stabilizationFailure: true, rolloutInstability: true }), 'HIGH_RISK');

  const instability = global.SafeReleaseGovernanceService.detectRolloutInstability({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(instability.success, true, 'rollout instability detection should run');
  assert.ok(instability.releaseStabilizationIntelligence.rolloutInstability >= 1, 'rollout instability should be tracked');
  assert.ok(instability.releaseStabilizationIntelligence.stabilizationDelays >= 1, 'stabilization delays should be tracked');
  assert.ok(instability.releaseStabilizationIntelligence.rollbackFrequency >= 1, 'rollback frequency should be tracked');

  const report = global.SafeReleaseGovernanceService.generateSafeReleaseReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'safe release report should generate for PLATFORM_OWNER');
  assert.equal(report.accessGovernance.crossTenantDeploymentLeakageBlocked, true);
  assert.equal(report.accessGovernance.superAdminRolloutBypassAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assert.ok(report.releaseGovernance, 'release governance summary should be generated');
  assert.ok(report.rolloutProgress, 'rollout progress should be generated');
  assert.ok(report.stabilizationStatus, 'stabilization status should be generated');
  assert.ok(report.rolloutConfidence, 'rollout confidence should be generated');
  assert.ok(report.rolloutRisk, 'rollout risk should be generated');
  assert.ok(Array.isArray(report.blockedReleases), 'blocked releases should be summarized');
  assert.ok(Array.isArray(report.releaseHistory), 'release history should be immutable and summarized');
  assert.equal(report.rolloutRisk.rolloutBlocked, true, 'critical blockers should block safe release rollout');
  assert.equal(report.rolloutConfidence.rolloutEligible, false, 'blocked release report should not be rollout eligible');
  assert.equal(report.controlledRollout.stagedProductionRollouts >= 1, true, 'staged rollouts should be summarized');
  assert.equal(report.rollbackGovernance.rollbackCheckpoints >= 1, true, 'rollback governance should be summarized');
  assert.equal(report.incidentDeploymentIntegration.rolloutLinkedDegradation >= 1, true, 'incident/deployment integration should summarize rollout degradation');
  assert.equal(report.releaseAnalytics.releaseGovernanceHealth >= 0, true, 'release analytics should be generated');
  assert.ok(Object.isFrozen(report), 'safe release report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /99000|73000|"leaveBalance"|Alice Salary|Bob Private|private:\/\/tenant-a|salary cohort|rawDocument/i, 'safe release report must not expose confidential tenant data');

  const infraReport = global.SafeReleaseGovernanceService.generateSafeReleaseReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only release report should generate for SUPER_ADMIN');
  assert.equal(infraReport.releaseSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant release rows');
  assert.equal(infraReport.accessGovernance.superAdminRolloutBypassAuthority, false, 'SUPER_ADMIN must not gain rollout bypass authority');

  const frozen = global.SafeReleaseGovernanceService.freezeReleaseOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen), 'freezeReleaseOutput should freeze root output');
  assert.ok(Object.isFrozen(frozen.nested), 'freezeReleaseOutput should deep-freeze nested output');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeReleaseOutput should filter confidential fields');

  const malformedRollback = global.SafeReleaseGovernanceService.normalizeRollbackPayload(null, {});
  assert.equal(malformedRollback.success, false, 'malformed rollback payloads should fail safely');
  assert.ok(Object.isFrozen(malformedRollback), 'malformed rollback output should be immutable');

  const normalizedRollback = global.SafeReleaseGovernanceService.normalizeRollbackPayload({
    rollbackId: 'RB-NORM',
    state: 'approved',
    rollbackType: 'production rollback',
    targetReleaseId: 'REL-1',
    snapshotId: 'SNAP-1',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocumentUrl: 'private://rollback-plan.pdf', confidentialEmployeeRecord: 'hidden' }
  }, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(normalizedRollback.success, true, 'rollback payload should normalize');
  assert.equal(normalizedRollback.payload.rollbackState, 'APPROVED');
  assert.equal(normalizedRollback.payload.rollbackType, 'PRODUCTION_ROLLBACK');
  assert.ok(Object.isFrozen(normalizedRollback.payload), 'normalized rollback payload should be immutable');
  assert.doesNotMatch(JSON.stringify(normalizedRollback), /90000|"leaveBalance"|private:\/\/rollback-plan|hidden/i, 'rollback payload should filter confidential fields');

  const recoveryIntegrity = global.SafeReleaseGovernanceService.verifyRecoveryIntegrity({
    deploymentStability: true,
    environmentIntegrity: true,
    tenantIsolationIntegrity: true,
    workflowIntegrity: true,
    featureIntegrity: true,
    auditIntegrity: true,
    platformHealthStatus: true
  });
  assert.equal(recoveryIntegrity.success, true, 'recovery integrity should run');
  assert.equal(recoveryIntegrity.recoveryAssuranceScore, 100, 'healthy recovery integrity should score 100');
  assert.equal(recoveryIntegrity.recoveryVerified, true, 'healthy recovery integrity should verify recovery');

  const failedRecoveryIntegrity = global.SafeReleaseGovernanceService.verifyRecoveryIntegrity({
    deploymentStability: false,
    tenantIsolationIntegrity: false,
    auditIntegrity: false
  });
  assert.equal(failedRecoveryIntegrity.recoveryVerified, false, 'failed recovery checks should prevent verification');
  assert.ok(failedRecoveryIntegrity.failures.some(item => item.failureCode === 'TENANT_ISOLATION_RECOVERY_FAILED'), 'tenant isolation recovery failure should be explicit');

  const blockedRollback = global.SafeReleaseGovernanceService.validateRollbackEligibility({
    rollbackId: 'RB-BLOCKED',
    rollbackTargetExists: false,
    releaseSnapshotExists: false,
    migrationCompatible: false,
    environmentCompatible: true,
    dependencyCompatible: false,
    tenantIsolationIntegrity: true,
    auditIntegrity: true,
    recoveryReady: false,
    productionRollback: true
  }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(blockedRollback.eligible, false, 'rollback hard blockers should block eligibility');
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'ROLLBACK_TARGET_MISSING'));
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'ROLLBACK_SNAPSHOT_UNAVAILABLE'));
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'MIGRATION_INCOMPATIBILITY_BLOCKS_ROLLBACK'));
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'DEPENDENCY_CORRUPTION_RISK_BLOCKS_ROLLBACK'));
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'RECOVERY_VALIDATION_BLOCKS_ROLLBACK'));
  assert.ok(blockedRollback.failures.some(item => item.failureCode === 'ROLLBACK_APPROVAL_REQUIRED'));

  const superAdminRollback = global.SafeReleaseGovernanceService.validateRollbackEligibility({
    rollbackTargetExists: true,
    releaseSnapshotExists: true,
    migrationCompatible: true,
    environmentCompatible: true,
    dependencyCompatible: true,
    tenantIsolationIntegrity: true,
    auditIntegrity: true,
    recoveryReady: true,
    productionRollback: true,
    approvalStatus: 'APPROVED'
  }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', id: 'SA1' } });
  assert.equal(superAdminRollback.eligible, false, 'SUPER_ADMIN must not execute production rollback');
  assert.ok(superAdminRollback.failures.some(item => item.failureCode === 'SUPER_ADMIN_ROLLBACK_EXECUTION_BLOCKED'));

  const rollbackConfidence = global.SafeReleaseGovernanceService.calculateRollbackConfidence({
    rollbackTargetExists: true,
    releaseSnapshotExists: true,
    migrationCompatible: true,
    environmentCompatible: true,
    dependencyCompatible: true,
    tenantIsolationIntegrity: true,
    auditIntegrity: true,
    recoveryReady: true,
    approvalStatus: 'APPROVED',
    recoveryIntegrity
  });
  assert.equal(rollbackConfidence.success, true, 'rollback confidence should run');
  assert.ok(rollbackConfidence.rollbackConfidenceScore >= 90, 'healthy rollback should score high confidence');
  assert.equal(rollbackConfidence.rollbackBlocked, false);

  const rollbackReport = global.SafeReleaseGovernanceService.generateRollbackSafetyReport({
    rollbackId: 'RB-READY',
    rollbackState: 'APPROVED',
    targetReleaseId: 'REL-1',
    snapshotId: 'SNAP-1',
    rollbackTargetExists: true,
    releaseSnapshotExists: true,
    migrationCompatible: true,
    environmentCompatible: true,
    dependencyCompatible: true,
    tenantIsolationIntegrity: true,
    auditIntegrity: true,
    recoveryReady: true,
    approvalStatus: 'APPROVED',
    productionRollback: true,
    recoveryIntegrity,
    rollbacks: [
      { rollbackId: 'RB-READY', rollbackState: 'VERIFIED', targetReleaseId: 'REL-1', snapshotId: 'SNAP-1', recoveryDurationMinutes: 22, success: true },
      { rollbackId: 'RB-FAILED', rollbackState: 'FAILED', targetReleaseId: 'REL-2', snapshotId: '', failedRollback: true, recoveryValidationFailed: true }
    ]
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(rollbackReport.success, true, 'rollback safety report should run');
  assert.equal(rollbackReport.rollbackGovernanceModel.state, 'APPROVED');
  assert.ok(rollbackReport.rollbackConfidence.rollbackConfidenceScore >= 90);
  assert.equal(rollbackReport.recoveryAssurance.recoveryAssuranceScore, 100);
  assert.ok(rollbackReport.failedRollbackAttempts.length >= 1, 'failed rollback attempts should be summarized');
  assert.ok(Array.isArray(rollbackReport.rollbackHistory), 'rollback history should be available');
  assert.ok(Object.isFrozen(rollbackReport), 'rollback safety report should be immutable');
  assert.doesNotMatch(JSON.stringify(rollbackReport), /90000|"leaveBalance"|private:\/\/|hidden/i, 'rollback report must not expose confidential tenant data');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ROLLBACK_SAFETY/.test(row.eventType)), 'rollback safety should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ROLLBACK_SAFETY/.test(row.actionType || row.action || '')), 'rollback safety should audit actions safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ROLLBACK_SAFETY_REPORTED, 'rollback safety should aggregate metrics safely');

  const savedReadiness = global.ProductionReadinessService;
  const savedDeployment = global.DeploymentValidationService;
  const savedHealth = global.PlatformHealthMonitoringService;
  const savedIncident = global.GlobalIncidentService;
  const savedRollout = global.FeatureRolloutService;
  const savedEmergency = global.EmergencyOverrideService;
  const savedReadinessLower = global.productionReadinessService;
  const savedDeploymentLower = global.deploymentValidationService;
  const savedHealthLower = global.platformHealthMonitoringService;
  const savedIncidentLower = global.globalIncidentService;
  const savedRolloutLower = global.featureRolloutService;
  const savedEmergencyLower = global.emergencyOverrideService;
  delete global.ProductionReadinessService;
  delete global.DeploymentValidationService;
  delete global.PlatformHealthMonitoringService;
  delete global.GlobalIncidentService;
  delete global.FeatureRolloutService;
  delete global.EmergencyOverrideService;
  delete global.productionReadinessService;
  delete global.deploymentValidationService;
  delete global.platformHealthMonitoringService;
  delete global.globalIncidentService;
  delete global.featureRolloutService;
  delete global.emergencyOverrideService;
  const dependencyAbsentReport = global.SafeReleaseGovernanceService.generateSafeReleaseReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  global.ProductionReadinessService = savedReadiness;
  global.DeploymentValidationService = savedDeployment;
  global.PlatformHealthMonitoringService = savedHealth;
  global.GlobalIncidentService = savedIncident;
  global.FeatureRolloutService = savedRollout;
  global.EmergencyOverrideService = savedEmergency;
  global.productionReadinessService = savedReadinessLower;
  global.deploymentValidationService = savedDeploymentLower;
  global.platformHealthMonitoringService = savedHealthLower;
  global.globalIncidentService = savedIncidentLower;
  global.featureRolloutService = savedRolloutLower;
  global.emergencyOverrideService = savedEmergencyLower;
  assert.equal(dependencyAbsentReport.integrationHealth.productionReadinessIntegrated, false, 'missing readiness dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.deploymentValidationIntegrated, false, 'missing deployment dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalIncidentIntegrated, false, 'missing incident dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.platformHealthIntegrated, false, 'missing health dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.featureRolloutIntegrated, false, 'missing feature rollout dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.emergencyOverrideIntegrated, false, 'missing emergency dependency should be reflected safely');

  let auditCount = 0;
  let telemetryCount = 0;
  let metricCount = 0;
  global.AuditService = { recordAudit(event) { auditCount += 1; return { success: true, event }; } };
  global.WorkflowTelemetryService = { emitTelemetry(category, eventType, payload) { telemetryCount += 1; return { success: true, category, eventType, payload }; } };
  global.OrchestrationMetricsService = { recordWorkflowMetric(name, payload) { metricCount += 1; return { success: true, name, payload }; } };
  const audited = global.SafeReleaseGovernanceService.generateSafeReleaseReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true);
  assert.ok(auditCount >= 1, 'release governance visibility access should be auditable');
  assert.ok(telemetryCount >= 1, 'safe release governance should emit telemetry when available');
  assert.ok(metricCount >= 1, 'safe release governance should record metrics when available');

  console.log('safeReleaseGovernanceService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
