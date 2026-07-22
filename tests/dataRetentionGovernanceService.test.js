const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Node data retention test', platform: 'Win32' };
  global.location = { hostname: 'platform.arthhrms.example', pathname: '/platform-control.html' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'TEN-tabsons' };
  data.employees = [
    { id: 'EMP-OLD', empId: 'EMP-OLD', name: 'Old Employee', role: 'employee', department: 'Engineering', tenantSlug: 'tabsons', createdAt: '2014-01-01T00:00:00.000Z', privateNote: 'never expose' },
    { id: 'EMP-RECENT', empId: 'EMP-RECENT', name: 'Recent Employee', role: 'employee', department: 'People', tenantSlug: 'tabsons', createdAt: '2026-05-01T00:00:00.000Z' },
    { id: 'ABC-OLD', empId: 'ABC-OLD', name: 'ABC Confidential', role: 'employee', tenantSlug: 'abc', createdAt: '2014-01-01T00:00:00.000Z' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-OLD', empId: 'EMP-OLD', tenantSlug: 'tabsons', date: '2018-01-02' },
    { attendanceId: 'ATT-ABC', empId: 'ABC-OLD', tenantSlug: 'abc', date: '2018-01-02' }
  ];
  data.leaveRequests = [{ leaveId: 'LV-OLD', empId: 'EMP-OLD', tenantSlug: 'tabsons', createdAt: '2018-01-02T00:00:00.000Z' }];
  data.payroll = [{ payrollId: 'PAY-OLD', empId: 'EMP-OLD', tenantSlug: 'tabsons', createdAt: '2014-01-02T00:00:00.000Z', netSalary: 80000 }];
  data.documents = [{ documentId: 'DOC-OLD', empId: 'EMP-OLD', tenantSlug: 'tabsons', createdAt: '2014-01-02T00:00:00.000Z', storagePath: 'private/path.pdf' }];
  data.notifications = [{ id: 'NOT-OLD', empId: 'EMP-OLD', tenantSlug: 'tabsons', createdAt: '2020-01-02T00:00:00.000Z', message: 'private message' }];
  data.workflowEvents = [{ eventId: 'EVT-OLD', tenantSlug: 'tabsons', timestamp: '2020-01-02T00:00:00.000Z', payload: { secret: true } }];
  data.auditLogs = [{ auditId: 'AUD-OLD', tenantSlug: 'tabsons', timestamp: '2014-01-02T00:00:00.000Z', module: 'Employee', actionType: 'UPDATED' }];
  data.tenantBackupHistory = [{ backupId: 'TBK-1', historyId: 'TBH-1', tenantSlug: 'tabsons', state: 'COMPLETED', timestamp: '2026-06-18T00:00:00.000Z', integrityHash: 'sha256-value' }];
  data.tenantBackupValidationHistory = [{ validationId: 'TBV-1', backupId: 'TBK-1', tenantSlug: 'tabsons', state: 'COMPLETED', integrityValid: true, validatedAt: '2026-06-18T01:00:00.000Z' }];
  data.dataRetentionPolicies = [];
  data.dataRetentionHistory = [];
  data.dataLifecycleHistory = [];
  data.dataArchiveRecords = [];
  data.dataLegalHoldRecords = [];
  data.dataDeletionReviews = [];
  global.DB.save(data);
}

function serialized(value) { return JSON.stringify(value); }

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  ['db.js', 'services/auditService.js'].forEach(load);
  seedData();
  load('services/dataRetentionGovernanceService.js');

  const svc = global.DataRetentionGovernanceService;
  assert.ok(svc, 'DataRetentionGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.deepEqual(svc.RETENTION_STATES, ['ACTIVE', 'ARCHIVED', 'RETENTION_PENDING', 'DELETION_PENDING', 'DELETED', 'LEGAL_HOLD']);
  assert.deepEqual(svc.DATA_SCOPES, ['employees', 'attendance', 'leave', 'payroll', 'audit_logs', 'documents', 'notifications', 'system_events']);
  assert.equal(global.__ARTHHRMS_DATA_RETENTION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'evaluateRetentionPolicy', 'archiveEligibleRecords', 'restoreArchivedRecord',
    'calculateRetentionCompliance', 'applyLegalHold', 'freezeRetentionOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const owner = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', now: '2026-06-19T00:00:00.000Z' };
  const director = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: owner.now };
  const hr = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: owner.now };
  const employee = { actor: { id: 'EMP-OLD', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', now: owner.now };

  const policy = svc.saveRetentionPolicy({
    tenantSlug: 'tabsons', scope: 'employees', retentionDays: 3650, archiveAfterDays: 1825,
    deletionApprovalRequired: true, active: true
  }, owner);
  assert.equal(policy.success, true, 'platform owner can configure a tenant policy');
  assert.equal(policy.policy.scope, 'employees');
  assert.ok(Object.isFrozen(policy), 'policy output should be immutable');

  const evaluation = svc.evaluateRetentionPolicy({ tenantSlug: 'tabsons', scope: 'employees' }, director);
  assert.equal(evaluation.success, true, 'director can review retention compliance');
  assert.equal(evaluation.metrics.totalRecords, 2, 'evaluation must include only the selected tenant');
  assert.equal(evaluation.metrics.archiveEligibleRecords, 1);
  assert.equal(evaluation.metrics.deletionEligibleRecords, 0, 'active records are never directly deletion eligible');
  assert.doesNotMatch(serialized(evaluation), /Old Employee|Recent Employee|ABC Confidential|never expose/i, 'governance output must not expose record contents');

  const deniedEmployee = svc.calculateRetentionCompliance({ tenantSlug: 'tabsons' }, employee);
  assert.equal(deniedEmployee.success, false, 'employees cannot access retention governance');
  const deniedCrossTenant = svc.evaluateRetentionPolicy({ tenantSlug: 'abc', scope: 'employees' }, hr);
  assert.equal(deniedCrossTenant.success, false, 'tenant roles cannot inspect another tenant');

  const beforeEmployees = serialized(global.DB.get().employees);
  const archived = svc.archiveEligibleRecords({
    tenantSlug: 'tabsons', scope: 'employees', recordIds: ['EMP-OLD'], approval: true, approvalReference: 'APP-100'
  }, owner);
  assert.equal(archived.success, true);
  assert.equal(archived.archivedCount, 1);
  assert.equal(archived.archiveRecords[0].state, 'ARCHIVED');
  assert.equal(serialized(global.DB.get().employees), beforeEmployees, 'archival must never mutate source records');

  const deletionReview = svc.scheduleDeletionReview({
    tenantSlug: 'tabsons', archiveId: archived.archiveRecords[0].archiveId,
    approval: true, approvalReference: 'DEL-100'
  }, owner);
  assert.equal(deletionReview.success, true, 'validated backups permit deletion review preparation');
  assert.equal(deletionReview.state, 'DELETION_PENDING');
  assert.equal(deletionReview.backupIntegrityVerified, true);
  assert.equal(serialized(global.DB.get().employees), beforeEmployees, 'deletion review must not physically delete data');

  const restored = svc.restoreArchivedRecord({
    tenantSlug: 'tabsons', archiveId: archived.archiveRecords[0].archiveId,
    approval: true, approvalReference: 'RESTORE-100'
  }, owner);
  assert.equal(restored.success, true);
  assert.equal(restored.state, 'ACTIVE');
  assert.equal(serialized(global.DB.get().employees), beforeEmployees, 'restore governance must preserve source records');

  const payrollPolicy = svc.saveRetentionPolicy({ tenantSlug: 'tabsons', scope: 'payroll', retentionDays: 3650, archiveAfterDays: 1825 }, owner);
  assert.equal(payrollPolicy.success, true);
  const payrollArchive = svc.archiveEligibleRecords({ tenantSlug: 'tabsons', scope: 'payroll', recordIds: ['PAY-OLD'], approval: true }, owner);
  assert.equal(payrollArchive.success, true);
  const hold = svc.applyLegalHold({
    tenantSlug: 'tabsons', scope: 'payroll', recordId: 'PAY-OLD',
    reasonCode: 'LITIGATION', approval: true, approvalReference: 'LEGAL-42'
  }, owner);
  assert.equal(hold.success, true);
  assert.equal(hold.state, 'LEGAL_HOLD');
  const blockedDeletion = svc.scheduleDeletionReview({ tenantSlug: 'tabsons', archiveId: payrollArchive.archiveRecords[0].archiveId, approval: true }, owner);
  assert.equal(blockedDeletion.success, false, 'legal hold must prevent deletion progression');
  assert.ok(blockedDeletion.issues.some(item => item.code === 'LEGAL_HOLD_PREVENTS_DELETION'));

  const compliance = svc.calculateRetentionCompliance({ tenantSlug: 'tabsons' }, hr);
  assert.equal(compliance.success, true, 'HR can view workforce retention analytics');
  assert.ok(compliance.retentionComplianceScore >= 0 && compliance.retentionComplianceScore <= 100);
  assert.ok(compliance.lifecycleHealthScore >= 0 && compliance.lifecycleHealthScore <= 100);
  assert.equal(compliance.analytics.legalHoldRecords, 1);

  const report = svc.generateRetentionGovernanceReport({ tenantSlug: 'tabsons' }, owner);
  assert.equal(report.success, true);
  assert.ok(Array.isArray(report.policies));
  assert.ok(Array.isArray(report.archiveHistory));
  assert.ok(Array.isArray(report.deletionSchedule));
  assert.ok(Object.isFrozen(report));
  assert.doesNotMatch(serialized(report), /ABC Confidential|never expose|80000|private\/path/i);

  const releasedHold = svc.releaseLegalHold({
    tenantSlug: 'tabsons', legalHoldId: hold.legalHold.legalHoldId,
    approval: true, approvalReference: 'LEGAL-RELEASE-42'
  }, owner);
  assert.equal(releasedHold.success, true, 'approved legal hold release should append a lifecycle event');
  const afterRelease = svc.generateRetentionGovernanceReport({ tenantSlug: 'tabsons' }, owner);
  assert.equal(afterRelease.legalHolds.length, 0, 'released legal holds should not remain in the active hold projection');

  const malformed = svc.evaluateRetentionPolicy(null, owner);
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const data = global.DB.get();
  assert.ok(data.dataRetentionPolicies.length >= 2, 'policy history should be append-only');
  assert.ok(data.dataArchiveRecords.length >= 2, 'archive history should be persisted');
  assert.ok(data.dataLifecycleHistory.some(row => row.state === 'LEGAL_HOLD'), 'legal hold lifecycle should be persisted');
  assert.ok(data.dataDeletionReviews.length >= 1, 'deletion review history should be persisted');
  assert.ok((data.auditLogs || []).some(row => /RETENTION|ARCHIVE|LEGAL_HOLD/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'retention actions should be audited');

  console.log('dataRetentionGovernanceService.test.js passed');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
