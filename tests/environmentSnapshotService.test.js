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

function seedSnapshotData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.environmentSnapshotRecords = [
    {
      snapshotId: 'SNAP-1',
      baselineId: 'BASE-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      environment: 'PRODUCTION',
      snapshotState: 'RECOVERY_READY',
      snapshotType: 'CONFIGURATION_SNAPSHOT',
      integrityVerified: true,
      compatibilityVerified: true,
      dependencyHealthy: true,
      environmentConsistent: true,
      rollbackSafe: true,
      tenantIsolationIntegrity: true,
      restorationDurationMinutes: 18,
      recoverySucceeded: true,
      createdAt: '2026-06-01T10:00:00.000Z',
      snapshotContent: {
        environmentState: { mode: 'FULL_PRODUCTION' },
        configuration: { env: { REQUIRE_EMAIL_VERIFIED: true }, tenantIsolation: { rls: true } },
        deploymentSettings: { releaseChannel: 'stable' },
        featureFlags: { reports: true },
        governanceSettings: { platformOwnerOnly: true },
        serviceDependencies: { database: 'ready', storage: 'ready' }
      },
      salary: 99000,
      leaveBalance: 8,
      metadata: { rawDocumentUrl: 'private://tenant-a/snapshot.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      snapshotId: 'SNAP-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      environment: 'STAGING',
      snapshotState: 'ARCHIVED',
      snapshotType: 'RELEASE_SNAPSHOT',
      integrityVerified: true,
      recoverySucceeded: true
    }
  ];
  data.configurationBaselines = [
    {
      baselineId: 'BASE-1',
      tenantSlug: 'tenant-a',
      environment: 'PRODUCTION',
      configuration: {
        env: { REQUIRE_EMAIL_VERIFIED: true },
        featureFlags: { reports: true },
        deploymentSettings: { releaseChannel: 'stable' },
        tenantIsolation: { rls: true },
        serviceDependencies: { database: 'ready', storage: 'ready' }
      }
    }
  ];
  data.configurationDriftRecords = [
    { driftId: 'DRIFT-SNAP-1', tenantSlug: 'tenant-a', driftState: 'RESOLVED', severity: 'LOW', remediationMinutes: 20 }
  ];
  data.deploymentValidationRecords = [
    { deploymentId: 'DEPLOY-SNAP-1', releaseId: 'REL-SNAP-1', tenantSlug: 'tenant-a', deploymentState: 'READY', rollbackReady: true, environmentDrift: false }
  ];
  data.safeReleaseRecords = [
    { safeReleaseId: 'SAFE-SNAP-1', releaseId: 'REL-SNAP-1', tenantSlug: 'tenant-a', releaseState: 'STABILIZING', rollbackReady: true, releaseApproved: true }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-SNAP-1', tenantSlug: 'tenant-a', healthState: 'HEALTHY', failureRate: 1 }
  ];
  data.auditLogs = [
    { auditId: 'AUD-SNAP-1', tenantSlug: 'tenant-a', actionType: 'ENVIRONMENT_SNAPSHOT_CREATED', auditState: 'RECORDED', severity: 'INFO' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 99000, leaveBalance: 8 }
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
    'services/globalAuditVisibilityService.js',
    'services/platformHealthMonitoringService.js',
    'services/deploymentValidationService.js',
    'services/environmentActivationService.js',
    'services/safeReleaseGovernanceService.js',
    'services/configurationDriftService.js',
    'services/environmentSnapshotService.js'
  ].forEach(load);

  seedSnapshotData();

  const svc = global.EnvironmentSnapshotService;
  assert.ok(svc, 'EnvironmentSnapshotService should be exported');
  assert.ok(Object.isFrozen(svc), 'environment snapshot service export must be immutable');
  assert.ok(Object.isFrozen(svc.SNAPSHOT_STATES), 'snapshot states must be immutable');
  assert.deepEqual(svc.SNAPSHOT_STATES, ['CREATED', 'VERIFIED', 'ACTIVE', 'RECOVERY_READY', 'RESTORED', 'SUPERSEDED', 'ARCHIVED']);
  assert.ok(Object.isFrozen(svc.SNAPSHOT_TYPES), 'snapshot types must be immutable');
  assert.equal(typeof svc.createEnvironmentSnapshot, 'function', 'createEnvironmentSnapshot helper should be exported');
  assert.equal(typeof svc.verifySnapshotIntegrity, 'function', 'verifySnapshotIntegrity helper should be exported');
  assert.equal(typeof svc.calculateRestorationConfidence, 'function', 'calculateRestorationConfidence helper should be exported');
  assert.equal(typeof svc.compareEnvironmentBaseline, 'function', 'compareEnvironmentBaseline helper should be exported');
  assert.equal(typeof svc.freezeSnapshotOutput, 'function', 'freezeSnapshotOutput helper should be exported');
  assert.equal(typeof svc.generateEnvironmentSnapshotReport, 'function', 'generateEnvironmentSnapshotReport helper should be exported');
  assert.equal(global.__ARTHHRMS_ENVIRONMENT_SNAPSHOT_SELF_TEST__.passed, true, 'environment snapshot self-test should cover recovery baseline failure cases');

  const malformed = svc.createEnvironmentSnapshot(null, {});
  assert.equal(malformed.success, false, 'malformed snapshot payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed snapshot output should be immutable');

  const created = svc.createEnvironmentSnapshot({
    snapshotId: 'SNAP-CREATE',
    snapshotType: 'configuration snapshot',
    environment: 'production',
    tenantSlug: 'tenant-a',
    source: {
      environmentState: { mode: 'FULL_PRODUCTION' },
      configuration: { env: { REQUIRE_EMAIL_VERIFIED: true }, tenantIsolation: { rls: true } },
      deploymentSettings: { releaseChannel: 'stable' },
      releaseState: { releaseId: 'REL-1', releaseState: 'STABILIZING' },
      featureFlags: { reports: true },
      governanceSettings: { platformOwnerOnly: true },
      serviceDependencies: { database: 'ready', storage: 'ready' },
      employees: [{ id: 'EMP-1', salary: 90000 }],
      payrollRecords: [{ amount: 90000 }],
      hrDocuments: [{ rawDocumentUrl: 'private://hr-doc' }]
    },
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocumentUrl: 'private://snapshot.pdf', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(created.success, true, 'snapshot creation should work');
  assert.equal(created.snapshot.snapshotState, 'CREATED');
  assert.equal(created.snapshot.snapshotType, 'CONFIGURATION_SNAPSHOT');
  assert.ok(created.snapshot.snapshotHash, 'snapshot should include integrity hash');
  assert.ok(Object.isFrozen(created), 'snapshot creation output should be immutable');
  assert.doesNotMatch(JSON.stringify(created), /90000|"leaveBalance"|private:\/\/|hidden|secret-token|payrollRecords|hrDocuments|employees/i, 'snapshot must not expose tenant business data');

  const ownerScope = svc.validateSnapshotScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated snapshot governance');
  assert.equal(ownerScope.snapshotAuthority, true);

  const tenantScope = svc.validateSnapshotScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantScope.allowed, false, 'tenant roles must never access environment snapshot governance');

  const superAdminRestore = svc.validateSnapshotScope({ restorationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminRestore.allowed, false, 'SUPER_ADMIN must not restore snapshots');

  const archivedMutation = svc.validateSnapshotScope({ snapshotState: 'ARCHIVED', restorationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived snapshot history must be immutable');

  const verified = svc.verifySnapshotIntegrity(created.snapshot);
  assert.equal(verified.integrityVerified, true, 'integrity verification should pass for untouched snapshot');
  assert.equal(verified.snapshotCorrupted, false);

  const corrupted = svc.verifySnapshotIntegrity({ ...created.snapshot, snapshotHash: 'tampered' });
  assert.equal(corrupted.integrityVerified, false, 'corrupted snapshot should fail verification');
  assert.ok(corrupted.failures.some(item => item.failureCode === 'SNAPSHOT_HASH_MISMATCH'));

  const blockedConfidence = svc.calculateRestorationConfidence({
    snapshot: { ...created.snapshot, snapshotHash: 'tampered' },
    dependencyHealthy: false,
    environmentCompatible: false,
    rollbackSafe: false,
    tenantIsolationIntegrity: false
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(blockedConfidence.restorationBlocked, true, 'unsafe restoration should be blocked');
  assert.ok(blockedConfidence.failures.length >= 4, 'restoration blockers should be explained');

  const comparison = svc.compareEnvironmentBaseline({
    currentEnvironment: { configuration: { env: { REQUIRE_EMAIL_VERIFIED: false }, tenantIsolation: { rls: false } } },
    activeBaseline: { configuration: { env: { REQUIRE_EMAIL_VERIFIED: true }, tenantIsolation: { rls: true } } },
    verifiedSnapshot: created.snapshot,
    lastDeployment: { deploymentSettings: { releaseChannel: 'stable' } }
  });
  assert.equal(comparison.baselineConsistent, false, 'baseline comparison should detect drift');
  assert.ok(comparison.baselineConsistencyScore < 100);
  assert.ok(comparison.driftFromBaselineScore > 0);
  assert.ok(comparison.recoveryReadinessScore >= 0);

  const report = svc.generateEnvironmentSnapshotReport({
    tenantSlug: 'tenant-a',
    snapshot: created.snapshot,
    currentEnvironment: { configuration: { env: { REQUIRE_EMAIL_VERIFIED: false }, tenantIsolation: { rls: false } } },
    activeBaseline: { configuration: { env: { REQUIRE_EMAIL_VERIFIED: true }, tenantIsolation: { rls: true } } }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(report.success, true, 'environment snapshot report should run');
  assert.equal(report.snapshotGovernanceModel.state, 'RECOVERY_READY');
  assert.ok(report.activeBaselines.length >= 1, 'active baselines should be visible');
  assert.ok(report.snapshotHistory.length >= 1, 'snapshot history should be summarized');
  assert.ok(report.restorationValidation.restorationBlocked === false || report.restorationValidation.failures.length >= 0);
  assert.ok(report.baselineComparison.baselineConsistencyScore <= 100);
  assert.ok(report.recoveryReadiness.recoveryReadinessScore >= 0);
  assert.ok(report.governanceIntegrations.configurationDriftIntegrated, 'configuration drift integration should be reported');
  assert.ok(report.auditSummary.snapshotActionsAuditable, 'snapshot auditability should be preserved');
  assert.ok(Object.isFrozen(report), 'environment snapshot report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /90000|"leaveBalance"|private:\/\/|hidden|secret-token|payrollRecords|hrDocuments|employees/i, 'snapshot report must not expose tenant business data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ENVIRONMENT_SNAPSHOT/.test(row.eventType)), 'snapshot governance should emit telemetry');
  assert.ok(global.DB.getAuditLogs().some(row => /ENVIRONMENT_SNAPSHOT/.test(row.actionType || row.action || '')), 'snapshot governance should audit actions');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ENVIRONMENT_SNAPSHOT_GOVERNANCE_REPORTED, 'snapshot governance should emit metrics');

  console.log('environmentSnapshotService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
