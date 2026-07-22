const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {}, remove() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {},
    value: '', textContent: '', innerHTML: '', getContext() { return null; }, getBoundingClientRect() { return { width: 800, height: 230 }; }
  };
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

let networkCalls = 0;
function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.fetch = async () => { networkCalls += 1; throw new Error('Network access is forbidden in recovery validation tests.'); };
  global.XMLHttpRequest = class ForbiddenXMLHttpRequest { open() { networkCalls += 1; throw new Error('XHR is forbidden.'); } };
  global.navigator = { userAgent: 'Node Recovery UAT test', platform: 'Win32', onLine: true };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/backup-disaster-recovery-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-19T10:00:00.000Z' };
}

const TABLES = [
  'recoveryValidationControls', 'recoveryValidationRuns', 'recoveryValidationResults',
  'recoveryValidationEvidence', 'recoveryValidationFindings', 'recoveryValidationEvents',
  'recoveryValidationCheckpoints', 'recoveryValidationDrills', 'recoveryDrillReports',
  'recoveryValidationAnalytics', 'recoveryValidationReports', 'recoveryValidationExports',
  'recoveryValidationBackgroundJobs', 'recoveryValidationAuditHistory'
];

const PROTECTED_KEYS = [
  'employees', 'users', 'attendance', 'leaveRequests', 'leaveBalances', 'payroll', 'payrollRuns',
  'documents', 'notifications', 'workflows', 'approvals', 'auditDomainRecords', 'companySettings',
  'tenantBackupHistory', 'tenantBackupValidationHistory', 'backupIntegrityVerificationHistory',
  'backupCertificationHistory', 'disasterRecoverySimulationHistory', 'disasterRecoveryReportHistory',
  'disasterRecoveryAnalyticsHistory', 'workflowFailureHistory', 'workflowRecoveryHistory',
  'softDeleteHistory', 'recordRecoveryHistory', 'storageConfiguration', 'backupConfiguration'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [
    { tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'confidential tenant backup data' }
  ];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', employeeEmail: 'employee@example.test', salary: 60000 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', employeeEmail: 'private@abc.test', salary: 999999, privateNote: 'confidential employee data' }
  ];
  data.users = [{ id: 'U1', tenantSlug: 'tabsons', email: 'admin@example.test', role: 'platform_owner', passwordHash: 'do-not-touch' }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'APPROVED' }];
  data.leaveBalances = [{ id: 'LB-1', tenantSlug: 'tabsons', employeeId: 'E1', balance: 12 }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.payrollRuns = [{ id: 'PAYRUN-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE', storagePath: 'private/path' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.auditDomainRecords = [{ id: 'ADR-1', tenantSlug: 'tabsons', type: 'CONFIGURATION' }];
  data.tenantBackupHistory = [
    { backupId: 'TBK-1', tenantSlug: 'tabsons', state: 'COMPLETED', integrityHash: 'hash-tabsons' },
    { backupId: 'TBK-ABC', tenantSlug: 'abc', state: 'COMPLETED', privateNote: 'confidential tenant backup data' }
  ];
  data.tenantBackupValidationHistory = [{ validationId: 'TBV-1', backupId: 'TBK-1', tenantSlug: 'tabsons', integrityValid: true }];
  data.backupIntegrityVerificationHistory = [{ verificationId: 'BIV-1', tenantSlug: 'tabsons', integrityStatus: 'VALID', checksumMatched: true }];
  data.backupCertificationHistory = [{ certificationId: 'BC-1', tenantSlug: 'tabsons', certificationStatus: 'CERTIFIED' }];
  data.disasterRecoverySimulationHistory = [{ simulationId: 'DRS-1', tenantSlug: 'tabsons', state: 'COMPLETED' }];
  data.disasterRecoveryReportHistory = [{ reportId: 'DRR-1', tenantSlug: 'tabsons', state: 'COMPLETED' }];
  data.disasterRecoveryAnalyticsHistory = [{ analyticsId: 'DRA-1', tenantSlug: 'tabsons', rtoMet: true, rpoMet: true }];
  data.workflowFailureHistory = [{ failureId: 'FAIL-1', tenantSlug: 'tabsons', state: 'RECOVERABLE' }];
  data.workflowRecoveryHistory = [{ recoveryId: 'REC-1', tenantSlug: 'tabsons', state: 'COMPLETED' }];
  data.softDeleteHistory = [{ deletionId: 'DEL-1', tenantSlug: 'tabsons', state: 'SOFT_DELETED' }];
  data.recordRecoveryHistory = [{ recoveryId: 'RR-1', tenantSlug: 'tabsons', state: 'RESTORED' }];
  data.storageConfiguration = { provider: 'OBJECT_STORAGE', bucket: 'private-bucket', secret: 'do-not-touch' };
  data.backupConfiguration = { encrypted: true, schedule: 'DAILY', encryptionKey: 'do-not-touch' };
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  const snapshot = {};
  PROTECTED_KEYS.forEach(key => { snapshot[key] = data[key]; });
  return JSON.stringify(snapshot);
}

function observations(svc, domain, prefix = 'UAT08') {
  return svc.CONTROL_LIBRARY.filter(row => row.domain === domain).map(row => ({
    controlCode: row.code,
    status: 'PASSED',
    rtoTargetMinutes: 60,
    rpoTargetMinutes: 15,
    recoveryDurationMinutes: 30,
    recoveredDataPointAgeMinutes: 5,
    downtimeMinutes: 10,
    dataLossRecords: 0,
    recoverySuccessRate: 100,
    restoreAccuracyPercent: 100,
    integrityPercent: 100,
    actualResult: 'Approved isolated recovery evidence met the expected control.',
    submissionId: `${prefix}-${row.code}`,
    evidence: { sourceType: domain === 'DISASTER_RECOVERY' ? 'TABLETOP' : 'APPROVED_SANDBOX_OBSERVATION', reference: `${prefix}-EVIDENCE-${row.code}`, summary: 'Approved redacted recovery evidence.' }
  }));
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js'].forEach(load);
  seed();
  global.__ARTHHRMS_DEV__ = true;
  load('services/backupDisasterRecoveryValidationService.js');

  const svc = global.BackupDisasterRecoveryValidationService;
  assert.ok(svc, 'BackupDisasterRecoveryValidationService should be exported');
  assert.equal(global.backupDisasterRecoveryValidationService, svc);
  assert.ok(Object.isFrozen(svc));
  [
    'BackupValidationService', 'RestoreValidationService', 'DisasterRecoveryEngine',
    'BusinessContinuityService', 'RecoveryAnalyticsService', 'DisasterDrillService'
  ].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  const selfTest = global.__ARTHHRMS_BACKUP_DISASTER_RECOVERY_SELF_TEST__;
  assert.equal(selfTest.passed, true, 'development self-test should pass');
  assert.equal(typeof selfTest.timestamp, 'string');
  assert.equal(selfTest.version, '1.0.0');
  assert.equal(typeof selfTest.summary, 'string');
  assert.ok(Array.isArray(selfTest.checks) && selfTest.checks.length >= 7);
  assert.equal(svc.CONTROL_LIBRARY.length, 68);
  assert.equal(svc.BACKUP_TARGETS.length, 10);
  assert.equal(svc.BACKUP_TYPES.length, 8);
  assert.equal(svc.RESTORE_SCOPES.length, 9);
  assert.equal(svc.DISASTER_SCENARIOS.length, 9);
  assert.equal(svc.CONTINUITY_CAPABILITIES.length, 6);
  assert.equal(svc.DATA_INTEGRITY_TARGETS.length, 8);
  assert.equal(svc.TENANT_RECOVERY_MODES.length, 5);
  assert.equal(svc.RECOVERY_SECURITY_CONTROLS.length, 6);
  assert.equal(svc.EDGE_CASES.length, 7);
  assert.deepEqual(svc.CAPACITY_TARGETS, { tenants: 100, dataTerabytes: 100, documents: 1000000, parallelRecoveryTests: true, incrementalValidation: true, backgroundVerification: true });

  const before = protectedSnapshot();
  const initialized = svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(initialized.success, true);
  assert.equal(initialized.controlCount, 68);
  assert.equal(svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx()).controlsAdded, 0);
  const listed = svc.listValidationLibrary({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(listed.controls.length, 68);
  Object.keys(svc.DOMAINS).forEach(domain => assert.ok(listed.controls.some(row => row.domain === domain), `${domain} should be represented`));
  assert.equal(svc.listValidationLibrary({ tenantSlug: 'tabsons' }, ctx('EMPLOYEE')).code, 'RECOVERY_VALIDATION_VIEW_RBAC_DENIED');
  assert.equal(svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx('DIRECTOR')).code, 'RECOVERY_VALIDATION_CONTROL_RBAC_DENIED');

  assert.equal(svc.startRecoveryValidationRun({ tenantSlug: 'tabsons', environment: 'PRODUCTION' }, ctx()).code, 'RECOVERY_PRODUCTION_TARGET_BLOCKED');
  assert.equal(svc.startRecoveryValidationRun({ tenantSlug: 'tabsons', environment: 'STAGING', targetAlias: 'live-primary' }, ctx()).code, 'RECOVERY_PRODUCTION_TARGET_BLOCKED');
  assert.equal(svc.startRecoveryValidationRun({ tenantSlug: 'tabsons', environment: 'STAGING', targetUrl: 'https://staging.example.test' }, ctx()).code, 'RECOVERY_NETWORK_TARGET_FORBIDDEN');

  const started = svc.startRecoveryValidationRun({
    tenantSlug: 'tabsons', environment: 'UAT', name: 'Enterprise Recovery UAT', seed: 'UAT-08-DETERMINISTIC',
    objectives: { rtoMinutes: 60, rpoMinutes: 15, maximumDowntimeMinutes: 60, maximumDataLossRecords: 0, minimumRecoverySuccessRate: 100 },
    capacityProfile: { tenants: 100, dataTerabytes: 100, documents: 1000000 }
  }, ctx());
  assert.equal(started.success, true);
  assert.equal(started.run.repeatable, true);
  assert.equal(started.run.reversible, true);
  assert.equal(started.run.productionDataDeleted, false);
  assert.equal(started.run.productionDataOverwritten, false);
  assert.equal(started.run.productionDataModified, false);
  assert.equal(started.run.liveRestoreExecuted, false);
  assert.equal(started.run.liveFailureInjected, false);
  assert.equal(started.run.liveFailoverExecuted, false);
  assert.equal(started.run.networkRequestsIssued, false);
  assert.ok(started.run.manifestFingerprint);
  const runId = started.run.runId;

  const paused = svc.pauseRecoveryValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: started.run.version, reason: 'Checkpoint.' }, ctx());
  assert.equal(paused.run.status, 'PAUSED');
  const resumed = svc.resumeRecoveryValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: paused.run.version }, ctx());
  assert.equal(resumed.run.status, 'RUNNING');
  assert.equal(svc.recordValidationObservation({ tenantSlug: 'tabsons', runId, controlCode: 'BACKUP_DATABASE', status: 'PASSED', expectedVersion: 1 }, ctx()).code, 'RECOVERY_RUN_VERSION_CONFLICT');
  assert.equal(svc.recordValidationObservation({ tenantSlug: 'tabsons', runId, controlCode: 'BACKUP_DATABASE', status: 'UNKNOWN' }, ctx()).code, 'RECOVERY_RESULT_INVALID');
  assert.equal(svc.recordValidationObservation({ tenantSlug: 'tabsons', sourceTenantSlug: 'abc', runId, controlCode: 'BACKUP_DATABASE', status: 'PASSED' }, ctx()).code, 'TENANT_ACCESS_DENIED');
  assert.equal(svc.validateBackups({ tenantSlug: 'tabsons', runId, observations: [] }, ctx()).code, 'RECOVERY_OBSERVATIONS_REQUIRED');

  const first = svc.recordValidationObservation({
    tenantSlug: 'tabsons', sourceTenantSlug: 'tabsons', runId, expectedVersion: resumed.run.version,
    controlCode: 'BACKUP_DATABASE', status: 'PASSED', rtoTargetMinutes: 60, rpoTargetMinutes: 15,
    recoveryDurationMinutes: 30, recoveredDataPointAgeMinutes: 5, downtimeMinutes: 10,
    dataLossRecords: 0, recoverySuccessRate: 100, restoreAccuracyPercent: 100, integrityPercent: 100,
    actualResult: 'Database backup integrity evidence passed.', submissionId: 'BACKUP-DATABASE-1',
    evidence: { sourceType: 'BACKUP_INTEGRITY_REVIEW', reference: 'BIV-2026-001', summary: 'Redacted evidence.' }
  }, ctx());
  assert.equal(first.success, true);
  const replay = svc.recordValidationObservation({ tenantSlug: 'tabsons', runId, controlCode: 'BACKUP_DATABASE', status: 'FAILED', submissionId: 'BACKUP-DATABASE-1' }, ctx());
  assert.equal(replay.code, 'RECOVERY_RESULT_REPLAYED');
  assert.equal(replay.observation.status, 'PASSED');

  let version = first.runVersion;
  const domainMethods = {
    BACKUP_VALIDATION: 'validateBackups', BACKUP_TYPE: 'validateBackupTypes', RESTORE_VALIDATION: 'validateRestore',
    DISASTER_RECOVERY: 'validateDisasterRecovery', BUSINESS_CONTINUITY: 'validateBusinessContinuity',
    DATA_INTEGRITY: 'validateDataIntegrity', TENANT_RECOVERY: 'validateTenantRecovery',
    RECOVERY_SECURITY: 'validateRecoverySecurity', EDGE_CASE: 'validateRecoveryEdgeCases'
  };
  Object.keys(domainMethods).forEach(domain => {
    let rows = observations(svc, domain);
    if (domain === 'BACKUP_VALIDATION') rows = rows.filter(row => row.controlCode !== 'BACKUP_DATABASE');
    const response = svc[domainMethods[domain]]({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: rows }, ctx());
    assert.equal(response.success, true, `${domain} should validate`);
    version = response.runVersion;
  });

  const analytics = svc.generateRecoveryAnalytics({ tenantSlug: 'tabsons', runId }, ctx('AUDITOR'));
  assert.equal(analytics.success, true);
  assert.equal(analytics.analytics.backupHealthScore, 100);
  assert.equal(analytics.analytics.recoveryScore, 100);
  assert.equal(analytics.analytics.businessContinuityScore, 100);
  assert.equal(analytics.analytics.infrastructureRecoveryScore, 100);
  assert.equal(analytics.analytics.disasterReadinessScore, 100);
  assert.equal(analytics.analytics.recoverySecurityScore, 100);
  assert.equal(analytics.analytics.controlCoverage, 100);
  assert.equal(analytics.analytics.rtoSuccessRate, 100);
  assert.equal(analytics.analytics.rpoSuccessRate, 100);
  assert.equal(analytics.analytics.averageRecoveryTimeMinutes, 30);
  assert.equal(analytics.analytics.averageRecoveryPointAgeMinutes, 5);
  assert.equal(analytics.analytics.criticalFindings, 0);
  assert.equal(analytics.analytics.statusCounts.PASSED, 68);

  svc.DRILL_TYPES.forEach((drillType, index) => {
    const scheduled = svc.scheduleDisasterDrill({ tenantSlug: 'tabsons', runId, environment: 'UAT', drillType, scenarios: [svc.DISASTER_SCENARIOS[index]], scheduleLabel: `Governed ${drillType}` }, ctx());
    assert.equal(scheduled.success, true, `${drillType} should be prepared`);
    assert.equal(scheduled.drill.dispatchSuppressed, true);
    assert.equal(scheduled.drill.productionDataMutationAllowed, false);
    if (drillType === 'MANUAL_DRILL') {
      const outcome = svc.recordDisasterDrillOutcome({ tenantSlug: 'tabsons', drillId: scheduled.drill.drillId, rtoTargetMinutes: 60, rpoTargetMinutes: 15, recoveryDurationMinutes: 35, recoveredDataPointAgeMinutes: 8, recoverySuccessRate: 100, restoreAccuracyPercent: 100, tenantIsolationPreserved: true, evidenceReference: 'DRILL-EVIDENCE-1', lessonsLearned: ['Maintain quarterly restore rehearsal cadence.'] }, ctx());
      assert.equal(outcome.success, true);
      assert.equal(outcome.drillReport.passed, true);
      assert.equal(outcome.drillReport.rtoMet, true);
      assert.equal(outcome.drillReport.rpoMet, true);
    }
  });
  assert.equal(svc.scheduleDisasterDrill({ tenantSlug: 'tabsons', environment: 'PRODUCTION', drillType: 'MANUAL_DRILL' }, ctx()).code, 'RECOVERY_PRODUCTION_TARGET_BLOCKED');

  const completed = svc.completeRecoveryValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: version }, ctx());
  assert.equal(completed.success, true);
  assert.equal(completed.goLiveBlocked, false);
  assert.equal(completed.run.status, 'COMPLETED');
  assert.equal(completed.run.outcome, 'PASSED');

  svc.REPORT_TYPES.forEach(reportType => {
    const report = svc.generateRecoveryReport({ tenantSlug: 'tabsons', runId, reportType }, ctx('AUDITOR'));
    assert.equal(report.success, true, `${reportType} should generate`);
    assert.equal(report.report.executionClaims.liveRestoreExecuted, false);
    assert.equal(report.report.executionClaims.liveFailureInjected, false);
    assert.equal(report.report.executionClaims.productionDataModified, false);
    assert.ok(report.report.fingerprint);
  });
  ['JSON', 'CSV'].forEach(format => {
    const exported = svc.exportRecoveryReport({ tenantSlug: 'tabsons', runId, reportType: 'EXECUTIVE_SUMMARY', format }, ctx('AUDITOR'));
    assert.equal(exported.success, true);
    assert.equal(exported.export.productionDataIncluded, false);
    assert.ok(exported.exportContent.length > 20);
    assert.doesNotMatch(exported.exportContent, /do-not-touch|private@abc|999999|private-bucket|confidential tenant backup data/i);
  });
  const dashboard = svc.generateRecoveryDashboard({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.analytics.disasterReadinessScore, 100);
  assert.equal(dashboard.backupStatus.length, 18);
  assert.equal(dashboard.restoreStatus.length, 9);
  assert.equal(dashboard.infrastructureHealth.length, 16);
  assert.ok(dashboard.recoveryTimeline.length > 0);
  assert.equal(JSON.stringify(dashboard).includes('private@abc.test'), false);

  const blockedRun = svc.startRecoveryValidationRun({ tenantSlug: 'tabsons', environment: 'DR_TEST', name: 'Corruption blocker proof', domains: ['BACKUP_VALIDATION'], seed: 'CORRUPTION-PROOF' }, ctx());
  const failedRows = observations(svc, 'BACKUP_VALIDATION', 'CORRUPTION-PROOF');
  failedRows[0] = Object.assign({}, failedRows[0], { status: 'PASSED', corruptionDetected: true, recoveryDurationMinutes: 90, dataLossRecords: 3, actualResult: 'Approved evidence detected corruption and missed RTO.', findingTitle: 'Corrupted database backup' });
  const blockedValidation = svc.validateBackups({ tenantSlug: 'tabsons', runId: blockedRun.run.runId, expectedVersion: blockedRun.run.version, observations: failedRows }, ctx());
  assert.equal(blockedValidation.success, true);
  assert.equal(blockedValidation.observations[0].requestedStatus, 'PASSED');
  assert.equal(blockedValidation.observations[0].status, 'FAILED', 'unsafe evidence must override a claimed pass');
  const blockedAnalytics = svc.generateRecoveryAnalytics({ tenantSlug: 'tabsons', runId: blockedRun.run.runId }, ctx('AUDITOR'));
  assert.equal(blockedAnalytics.analytics.criticalFindings, 1);
  assert.ok(blockedAnalytics.analytics.disasterReadinessScore <= 59);
  assert.equal(blockedAnalytics.analytics.rtoSuccessRate < 100, true);
  const blockedCompletion = svc.completeRecoveryValidationRun({ tenantSlug: 'tabsons', runId: blockedRun.run.runId, expectedVersion: blockedValidation.runVersion }, ctx());
  assert.equal(blockedCompletion.goLiveBlocked, true);
  assert.equal(blockedCompletion.run.outcome, 'GO_LIVE_BLOCKED');
  assert.equal(svc.rollbackRecoveryValidationRun({ tenantSlug: 'tabsons', runId: blockedRun.run.runId }, ctx()).code, 'RECOVERY_ROLLBACK_REASON_REQUIRED');
  const rolledBack = svc.rollbackRecoveryValidationRun({ tenantSlug: 'tabsons', runId: blockedRun.run.runId, reason: 'Repeat recovery evidence after remediation.' }, ctx());
  assert.equal(rolledBack.success, true);
  assert.equal(rolledBack.run.status, 'ROLLED_BACK');
  assert.equal(rolledBack.run.productionRollbackExecuted, false);
  assert.equal(svc.rollbackRecoveryValidationRun({ tenantSlug: 'tabsons', runId: blockedRun.run.runId, reason: 'Replay.' }, ctx()).code, 'RECOVERY_RUN_ALREADY_ROLLED_BACK');

  assert.equal(protectedSnapshot(), before, 'production modules, backups, recovery histories, and configurations must remain unchanged');
  assert.equal(networkCalls, 0, 'recovery validation must never issue network requests');
  const stored = global.DB.get();
  assert.ok(stored.recoveryValidationAuditHistory.length > 0);
  assert.ok(stored.recoveryValidationEvents.length > 0);
  assert.ok(stored.recoveryValidationCheckpoints.every(row => row.repeatable === true && row.reversible === true && row.recoveryToken));
  assert.ok(stored.recoveryValidationEvidence.every(row => row.tenantSlug === 'tabsons' && row.fingerprint));
  assert.ok(stored.recoveryValidationDrills.every(row => row.dispatchSuppressed === true));

  const htmlPath = path.resolve(__dirname, '..', 'backup-disaster-recovery-center.html');
  assert.ok(fs.existsSync(htmlPath));
  const html = fs.readFileSync(htmlPath, 'utf8');
  [
    'Backup & Disaster Recovery Center', 'Backup & Restore', 'Disaster Recovery', 'Business Continuity',
    'Recovery objectives', 'Disaster recovery drills', 'Recovery timeline', 'Recovery reports',
    'recoveryChart', 'services/backupDisasterRecoveryValidationService.js'
  ].forEach(text => assert.ok(html.includes(text), `dashboard should include ${text}`));

  console.log('backupDisasterRecoveryValidationService.test.js: all tests passed');
}

main();
