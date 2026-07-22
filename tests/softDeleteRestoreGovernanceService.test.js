const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Node recovery governance test', platform: 'Win32' };
  global.location = { hostname: 'tabsons.arthhrms.example', pathname: '/platform-control.html' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' };
  data.employees = [
    { id: 'EMP-ARCH', empId: 'EMP-ARCH', name: 'Archived Employee', role: 'employee', tenantSlug: 'tabsons', status: 'ARCHIVED', privateNote: 'retain privately' },
    { id: 'EMP-EXP', empId: 'EMP-EXP', name: 'Expired Window Employee', role: 'employee', tenantSlug: 'tabsons', status: 'ARCHIVED' },
    { id: 'EMP-ACTIVE', empId: 'EMP-ACTIVE', name: 'Active Employee', role: 'employee', tenantSlug: 'tabsons', status: 'ACTIVE' },
    { id: 'ABC-ARCH', empId: 'ABC-ARCH', name: 'ABC Confidential', role: 'employee', tenantSlug: 'abc', status: 'ARCHIVED', privateNote: 'never expose' }
  ];
  data.employeeLifecycleCurrent = [
    { lifecycleId: 'L-1', tenantSlug: 'tabsons', employeeId: 'EMP-ARCH', currentStatus: 'ARCHIVED', version: 2 },
    { lifecycleId: 'L-2', tenantSlug: 'tabsons', employeeId: 'EMP-EXP', currentStatus: 'ARCHIVED', version: 1 },
    { lifecycleId: 'L-3', tenantSlug: 'tabsons', employeeId: 'EMP-ACTIVE', currentStatus: 'ACTIVE', version: 3 },
    { lifecycleId: 'L-4', tenantSlug: 'abc', employeeId: 'ABC-ARCH', currentStatus: 'ARCHIVED', version: 2 }
  ];
  data.documents = [
    { documentId: 'DOC-1', empId: 'EMP-ARCH', tenantSlug: 'tabsons', fileName: 'agreement.pdf', storagePath: 'private/agreement.pdf' },
    { documentId: 'DOC-HOLD', empId: 'EMP-ARCH', tenantSlug: 'tabsons', fileName: 'legal.pdf', storagePath: 'private/legal.pdf' }
  ];
  data.dataLegalHoldRecords = [
    { legalHoldId: 'HOLD-1', tenantSlug: 'tabsons', scope: 'documents', sourceRecordId: 'DOC-HOLD', active: true, action: 'APPLIED', state: 'LEGAL_HOLD' }
  ];
  data.tenantBackupHistory = [{ backupId: 'TBK-1', tenantSlug: 'tabsons', state: 'COMPLETED', timestamp: '2026-06-22T00:00:00.000Z' }];
  data.tenantBackupValidationHistory = [{ validationId: 'TBV-1', backupId: 'TBK-1', tenantSlug: 'tabsons', integrityValid: true, validatedAt: '2026-06-22T01:00:00.000Z' }];
  data.softDeleteHistory = [];
  data.recordRecoveryHistory = [];
  data.recordRecoveryApprovalHistory = [];
  data.recordRecoveryAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function directorApproval(overrides = {}) {
  return {
    approved: true,
    approverId: 'DIR-1',
    approverRole: 'DIRECTOR',
    approvedAt: '2026-06-22T12:00:00.000Z',
    ...overrides
  };
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  load('db.js');
  load('services/auditService.js');
  seedData();
  load('services/validationRegistryService.js');
  global.TenantBackupExportService = Object.freeze({ generateRecoveryReadiness() {} });
  global.DataRetentionGovernanceService = Object.freeze({ evaluateRetentionPolicy() {} });
  global.EmployeeStatusLifecycleService = Object.freeze({ generateLifecycleTimeline() {} });
  global.WorkflowRecoveryService = Object.freeze({ restoreWorkflowState() {} });

  global.__ARTHHRMS_DEV__ = true;
  try { load('services/softDeleteRestoreGovernanceService.js'); } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.SoftDeleteRestoreGovernanceService;
  assert.ok(svc, 'SoftDeleteRestoreGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.RECORD_STATES, [
    'ACTIVE', 'SOFT_DELETED', 'RESTORABLE', 'RESTORED',
    'PENDING_DELETION', 'ARCHIVED', 'PERMANENTLY_DELETED'
  ]);
  assert.equal(global.__ARTHHRMS_SOFT_DELETE_RESTORE_SELF_TEST__.passed, true, 'development self-test should pass');
  [
    'softDeleteRecord', 'validateRestoreRequest', 'restoreRecord',
    'calculateRecoveryReadiness', 'generateRecoveryReport', 'freezeRecoveryGovernanceOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const baseNow = '2026-06-23T00:00:00.000Z';
  const hr = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: baseNow };
  const director = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: baseNow };
  const employee = { actor: { id: 'EMP-ARCH', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: baseNow };
  const owner = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', now: baseNow };

  const malformed = svc.softDeleteRecord(null, hr);
  assert.equal(malformed.success, false);
  assert.ok(Object.isFrozen(malformed));
  assert.doesNotThrow(() => svc.validateRestoreRequest(null, hr));

  const missingApproval = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', deletionReason: 'Duplicate migration record'
  }, hr);
  assert.equal(missingApproval.code, 'DIRECTOR_APPROVAL_REQUIRED');

  const directorCannotDelete = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', deletionReason: 'Review only', approval: directorApproval()
  }, director);
  assert.equal(directorCannotDelete.code, 'RECOVERY_GOVERNANCE_DENIED');
  const employeeCannotDelete = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', deletionReason: 'Unauthorized', approval: directorApproval()
  }, employee);
  assert.equal(employeeCannotDelete.code, 'RECOVERY_GOVERNANCE_DENIED');

  const activeBlocked = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ACTIVE', deletionReason: 'Unsafe active deletion', approval: directorApproval()
  }, hr);
  assert.equal(activeBlocked.code, 'EMPLOYEE_LIFECYCLE_NOT_DELETABLE');

  const legalHoldBlocked = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'DOCUMENT_METADATA', recordId: 'DOC-HOLD', deletionReason: 'Cleanup', approval: directorApproval()
  }, hr);
  assert.equal(legalHoldBlocked.code, 'LEGAL_HOLD_PREVENTS_SOFT_DELETE');

  const beforeEmployeeCount = global.DB.get().employees.length;
  const deleted = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH',
    deletionReason: 'Duplicate record confirmed during migration review', restoreWindowDays: 30,
    expectedVersion: 0, approval: directorApproval(), deletionMetadata: { source: 'migration-review', confidentialValue: 'do not expose' }
  }, hr);
  assert.equal(deleted.success, true);
  assert.equal(deleted.state, 'SOFT_DELETED');
  assert.equal(deleted.hardDeleteExecuted, false);
  assert.equal(global.DB.get().employees.length, beforeEmployeeCount, 'soft delete must never remove the source record');
  const sourceAfterDelete = global.DB.get().employees.find(row => row.empId === 'EMP-ARCH');
  assert.equal(sourceAfterDelete.recordState, 'SOFT_DELETED');
  assert.equal(sourceAfterDelete.isSoftDeleted, true);
  assert.equal(sourceAfterDelete.deleted_by, 'HR-1');
  assert.equal(sourceAfterDelete.deletion_reason, 'Duplicate record confirmed during migration review');
  assert.equal(sourceAfterDelete.tenant_id, 'tabsons');
  assert.ok(sourceAfterDelete.deleted_at);
  assert.ok(sourceAfterDelete.restore_deadline);
  assert.equal(sourceAfterDelete._recoveryVersion, 1);
  assert.equal(sourceAfterDelete.privateNote, 'retain privately', 'soft delete must preserve source content');
  assert.ok(Object.isFrozen(deleted));

  const duplicateDelete = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', deletionReason: 'Duplicate attempt',
    expectedVersion: 1, approval: directorApproval()
  }, hr);
  assert.equal(duplicateDelete.code, 'RECORD_ALREADY_SOFT_DELETED');

  const crossTenant = svc.validateRestoreRequest({
    tenantSlug: 'abc', recordType: 'EMPLOYEE', recordId: 'ABC-ARCH', approval: directorApproval()
  }, hr);
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ABC Confidential|never expose/i);

  const restorable = svc.validateRestoreRequest({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 1,
    ownerEmployeeId: 'EMP-ARCH', dependencies: [{ dependencyId: 'PROFILE-1', valid: true }]
  }, director);
  assert.equal(restorable.success, true);
  assert.equal(restorable.state, 'RESTORABLE');

  const ownershipMismatch = svc.validateRestoreRequest({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 1,
    ownerEmployeeId: 'SOMEONE-ELSE'
  }, hr);
  assert.equal(ownershipMismatch.code, 'RESTORE_OWNERSHIP_MISMATCH');

  const dependencyConflict = svc.validateRestoreRequest({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 1,
    dependencies: [{ dependencyId: 'DEPT-1', valid: false, state: 'MISSING' }]
  }, hr);
  assert.equal(dependencyConflict.code, 'RESTORE_DEPENDENCY_CONFLICT');

  const restoreWithoutApproval = svc.restoreRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 1,
    restoreReason: 'Migration review corrected the duplicate match'
  }, hr);
  assert.equal(restoreWithoutApproval.code, 'DIRECTOR_APPROVAL_REQUIRED');

  const staleRestore = svc.restoreRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 0,
    restoreReason: 'Stale request', approval: directorApproval()
  }, hr);
  assert.equal(staleRestore.code, 'CONCURRENT_RECOVERY_REQUEST');

  const restored = svc.restoreRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 1,
    ownerEmployeeId: 'EMP-ARCH', dependencies: [{ dependencyId: 'PROFILE-1', valid: true }],
    restoreReason: 'Migration review corrected the duplicate match', approval: directorApproval()
  }, hr);
  assert.equal(restored.success, true);
  assert.equal(restored.state, 'RESTORED');
  assert.equal(restored.hardDeleteExecuted, false);
  const sourceAfterRestore = global.DB.get().employees.find(row => row.empId === 'EMP-ARCH');
  assert.equal(sourceAfterRestore.recordState, 'RESTORED');
  assert.equal(sourceAfterRestore.isSoftDeleted, false);
  assert.equal(sourceAfterRestore._recoveryVersion, 2);
  assert.ok(sourceAfterRestore.restored_at);
  assert.equal(sourceAfterRestore.privateNote, 'retain privately');

  const duplicateRestore = svc.restoreRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-ARCH', expectedVersion: 2,
    restoreReason: 'Duplicate restore', approval: directorApproval()
  }, hr);
  assert.equal(duplicateRestore.code, 'RECORD_NOT_RESTORABLE');

  const expiringDelete = svc.softDeleteRecord({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-EXP', deletionReason: 'Time-limited recovery test',
    restoreWindowDays: 1, expectedVersion: 0, approval: directorApproval()
  }, hr);
  assert.equal(expiringDelete.success, true);
  const expiredRestore = svc.validateRestoreRequest({
    tenantSlug: 'tabsons', recordType: 'EMPLOYEE', recordId: 'EMP-EXP', expectedVersion: 1
  }, { ...hr, now: '2026-06-25T00:00:00.000Z' });
  assert.equal(expiredRestore.code, 'RESTORE_WINDOW_EXPIRED');

  const report = svc.generateRecoveryReport({ tenantSlug: 'tabsons' }, { ...hr, now: '2026-06-25T00:00:00.000Z' });
  assert.equal(report.success, true);
  assert.ok(report.analytics.deletedRecords >= 2);
  assert.ok(report.analytics.restoredRecords >= 1);
  assert.ok(report.analytics.restoreFailures >= 1);
  assert.ok(report.recoveryScore >= 0 && report.recoveryScore <= 100);
  assert.ok(report.governanceScore >= 0 && report.governanceScore <= 100);
  assert.ok(report.resilienceScore >= 0 && report.resilienceScore <= 100);
  assert.ok(Array.isArray(report.deletedRecords));
  assert.ok(Array.isArray(report.restoreQueue));
  assert.ok(!report.restoreQueue.some(row => row.recordId === 'EMP-EXP'), 'expired records must not remain in the active restore queue');
  assert.ok(Array.isArray(report.deletionHistory));
  assert.ok(Array.isArray(report.restoreHistory));
  assert.equal(report.integrations.backupGovernance.integrated, true);
  assert.equal(report.integrations.retentionGovernance.integrated, true);
  assert.equal(report.integrations.employeeLifecycle.integrated, true);
  assert.equal(report.integrations.workflowRecovery.integrated, true);
  assert.equal(report.governance.permanentDeletionEnabled, false);
  assert.ok(Object.isFrozen(report));
  assert.doesNotMatch(JSON.stringify(report), /privateNote|retain privately|storagePath|confidentialValue|ABC Confidential/i);

  const readiness = svc.calculateRecoveryReadiness({ tenantSlug: 'tabsons' }, director);
  assert.equal(readiness.success, true);
  assert.ok(readiness.recoveryReadinessScore >= 0 && readiness.recoveryReadinessScore <= 100);

  const ownerReport = svc.generateRecoveryReport({ tenantSlug: 'tabsons' }, owner);
  assert.equal(ownerReport.success, true);
  assert.equal(ownerReport.governance.platformOwnerVisibilityOnly, true);
  assert.doesNotMatch(JSON.stringify(ownerReport), /EMP-ARCH|EMP-EXP|Duplicate record|HR-1/i, 'Platform Owner report must remain governance-only');

  const employeeReport = svc.generateRecoveryReport({ tenantSlug: 'tabsons' }, employee);
  assert.equal(employeeReport.success, true, 'employee can view own recovery status');
  assert.ok(employeeReport.deletionHistory.every(row => row.recordId === 'EMP-ARCH'));
  const employeeOtherRecord = svc.generateRecoveryReport({ tenantSlug: 'tabsons', recordId: 'EMP-EXP' }, employee);
  assert.equal(employeeOtherRecord.success, false, 'employee cannot inspect another record');

  const data = global.DB.get();
  assert.ok(data.softDeleteHistory.length >= 2, 'deletion history should be append-only');
  assert.ok(data.softDeleteHistory.every(row => row.immutable === true));
  assert.ok(data.recordRecoveryHistory.some(row => row.state === 'RESTORABLE'));
  assert.ok(data.recordRecoveryHistory.some(row => row.state === 'RESTORED'));
  assert.ok(data.recordRecoveryHistory.some(row => row.action === 'RESTORE_FAILED'));
  assert.ok(data.recordRecoveryApprovalHistory.length >= 3);
  assert.ok(data.auditLogs.some(row => /SOFT_DELETE|RECORD_RESTORE|RECOVERY_GOVERNANCE/.test(String(row.actionType || row.action || row.type || ''))));
  assert.equal(typeof svc.permanentlyDeleteRecord, 'undefined', 'hard deletion must not be exposed');

  const frozen = svc.freezeRecoveryGovernanceOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));

  console.log('softDeleteRestoreGovernanceService.test.js passed');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
