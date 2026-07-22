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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
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
  global.navigator = { userAgent: 'Node backup integrity verification test', platform: 'Win32' };
  global.location = {
    href: '', origin: 'https://platform.arthhrms.example', hostname: 'platform.arthhrms.example', pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
  if (!global.crypto || !global.crypto.subtle) {
    global.crypto = require('node:crypto').webcrypto;
  }
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'TEN-tabsons', companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC confidential' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', name: 'Esha Engineer', email: 'esha@example.com', department: 'Engineering', tenantSlug: 'tabsons', password: 'secret-1', salary: 90000 },
    { id: 'HR-1', empId: 'HR-1', name: 'Harini HR', email: 'hr@example.com', department: 'People', tenantSlug: 'tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', department: 'Finance', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-ENG', departmentCode: 'ENG', departmentName: 'Engineering', tenantSlug: 'tabsons' },
    { departmentId: 'D-ABC', departmentCode: 'ABC', departmentName: 'ABC Finance', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', leaveType: 'Annual', status: 'Approved', tenantSlug: 'tabsons' },
    { leaveId: 'LV-ABC', empId: 'ABC-1', leaveType: 'Sick', status: 'Approved', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', empId: 'EMP-1', date: '2026-06-01', status: 'Present', tenantSlug: 'tabsons' }
  ];
  data.payroll = [
    { payrollId: 'PAY-1', empId: 'EMP-1', month: '2026-05', netSalary: 85000, tenantSlug: 'tabsons' }
  ];
  data.auditLogs = [];
  data.tenantBackupHistory = [];
  data.tenantBackupValidationHistory = [];
  data.backupIntegrityVerificationHistory = [];
  data.backupCertificationHistory = [];
  data.backupIntegrityAnalyticsHistory = [];
  global.DB.save(data);
}

function ownerContext(tenantSlug = 'tabsons') {
  return { tenantSlug, actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug }, now: '2026-06-24T10:00:00.000Z' };
}

function directorContext(tenantSlug = 'tabsons') {
  return { tenantSlug, actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug }, now: '2026-06-24T10:00:00.000Z' };
}

function hrContext(tenantSlug = 'tabsons') {
  return { tenantSlug, actor: { id: 'HR-1', role: 'HR', tenantSlug }, now: '2026-06-24T10:00:00.000Z' };
}

function employeeContext(tenantSlug = 'tabsons') {
  return { tenantSlug, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug }, now: '2026-06-24T10:00:00.000Z' };
}

function text(value) {
  return JSON.stringify(value);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/exportService.js'].forEach(load);
  seedData();
  load('services/validationRegistryService.js');
  load('services/tenantBackupExportService.js');
  global.SoftDeleteRestoreGovernanceService = Object.freeze({ generateRecoveryReport() {} });
  global.DisasterRecoverySimulationService = Object.freeze({ generateBusinessContinuityReport() {} });
  global.operationsMonitoringService = Object.freeze({});

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/backupIntegrityVerificationService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.BackupIntegrityVerificationService;
  assert.ok(svc, 'BackupIntegrityVerificationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.CHECKSUM_ALGORITHMS, ['SHA-256', 'SHA-512']);
  assert.deepEqual(svc.VERIFICATION_STATES, [
    'BACKUP_CREATED', 'INTEGRITY_VERIFICATION', 'CHECKSUM_VALIDATION', 'METADATA_VALIDATION',
    'RECOVERY_TEST_VALIDATION', 'TRUST_SCORE_GENERATED', 'BACKUP_CERTIFIED', 'FAILED'
  ]);
  [
    'verifyBackupIntegrity', 'calculateChecksum', 'validateBackupMetadata',
    'calculateRecoveryConfidence', 'certifyBackup', 'freezeIntegrityOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));
  assert.equal(global.__ARTHHRMS_BACKUP_INTEGRITY_SELF_TEST__.passed, true, 'development self-test should pass');

  const sha256 = await svc.calculateChecksum('arthhrms-backup', 'SHA-256');
  const sha512 = await svc.calculateChecksum('arthhrms-backup', 'SHA-512');
  assert.equal(sha256.success, true);
  assert.equal(sha256.hash.length, 64, 'SHA-256 hash should be hex encoded');
  assert.equal(sha512.success, true);
  assert.equal(sha512.hash.length, 128, 'SHA-512 hash should be hex encoded');
  assert.equal((await svc.calculateChecksum('x', 'MD5')).success, false, 'unsupported algorithms are blocked');

  const backup = await global.TenantBackupExportService.createTenantBackup({ tenantSlug: 'tabsons', backupType: 'FULL_BACKUP' }, ownerContext());
  assert.equal(backup.success, true, 'fixture backup should be created');

  const metadata = svc.validateBackupMetadata(backup, ownerContext());
  assert.equal(metadata.success, true, 'valid backup metadata passes');
  assert.equal(metadata.metadataValidation.tenantOwnershipValid, true);
  assert.equal(metadata.metadataValidation.recordCountsValid, true);
  assert.equal(metadata.metadataValidation.structureValid, true);
  assert.ok(Object.isFrozen(metadata) && Object.isFrozen(metadata.metadataValidation));

  const verification = await svc.verifyBackupIntegrity(backup, ownerContext());
  assert.equal(verification.success, true, 'valid backup should verify');
  assert.equal(verification.integrityStatus, 'VALID');
  assert.equal(verification.checksum.algorithm, 'SHA-256');
  assert.equal(verification.checksum.originalHash, backup.backup.integrityHash);
  assert.equal(verification.checksum.verificationHash, backup.backup.integrityHash);
  assert.equal(verification.checksum.matched, true);
  assert.equal(verification.secondaryChecksum.algorithm, 'SHA-512');
  assert.equal(verification.secondaryChecksum.hash.length, 128);
  assert.equal(verification.metadataValidation.tenantOwnershipValid, true);
  assert.equal(verification.recoveryAssurance.schemaCompatible, true);
  assert.equal(verification.recoveryAssurance.backupRestorable, true);
  assert.equal(verification.recoveryAssurance.restoreExecuted, false, 'verification must not restore backups');
  assert.ok(verification.backupTrustScore >= 85);
  assert.ok(verification.recoveryConfidenceScore >= 85);
  assert.ok(verification.restorationReadinessScore >= 85);
  assert.equal(verification.governance.tenantIsolationPreserved, true);
  assert.equal(verification.governance.restoreExecutionEnabled, false);
  assert.equal(verification.corruptionFindings.length, 0);
  assert.ok(Object.isFrozen(verification) && Object.isFrozen(verification.checksum));
  assert.doesNotMatch(text(verification), /Esha Engineer|ABC Employee|ABC confidential|secret-1|salary|85000/i, 'verification output must not expose backup payload data');

  const confidence = svc.calculateRecoveryConfidence(verification, ownerContext());
  assert.equal(confidence.success, true);
  assert.ok(confidence.recoveryConfidenceScore >= 85);
  assert.equal(confidence.restoreExecutionEnabled, false);

  const certificate = await svc.certifyBackup(verification, ownerContext());
  assert.equal(certificate.success, true, 'verified backup can be certified');
  assert.equal(certificate.certificationStatus, 'CERTIFIED');
  assert.equal(certificate.state, 'BACKUP_CERTIFIED');
  assert.equal(certificate.integrityStatus, 'VALID');
  assert.equal(certificate.restoreExecutionEnabled, false);
  assert.ok(certificate.backupTrustScore >= 85);

  const tampered = await svc.verifyBackupIntegrity({ ...backup, encryptedPayload: backup.encryptedPayload + 'tamper' }, ownerContext());
  assert.equal(tampered.success, false, 'tampered backup should fail verification');
  assert.equal(tampered.integrityStatus, 'CORRUPTED');
  assert.equal(tampered.checksum.matched, false);
  assert.ok(tampered.corruptionFindings.some(item => item.code === 'CHECKSUM_MISMATCH'));
  assert.equal(tampered.governance.certificationBlocked, true);

  const blockedCertificate = await svc.certifyBackup(tampered, ownerContext());
  assert.equal(blockedCertificate.success, false, 'corrupted backup cannot be certified');
  assert.equal(blockedCertificate.code, 'BACKUP_CERTIFICATION_BLOCKED');
  assert.equal(blockedCertificate.governance.corruptedBackupBlocked, true);

  const incomplete = await svc.verifyBackupIntegrity({ backup: { ...backup.backup, recordCounts: null }, encryptedPayload: '', encryption: backup.encryption }, ownerContext());
  assert.equal(incomplete.success, false, 'incomplete backup should fail verification');
  assert.ok(incomplete.corruptionFindings.some(item => /MISSING|INCOMPLETE|METADATA/.test(item.code)));
  assert.equal(incomplete.recoveryAssurance.backupRestorable, false);

  const missingMetadata = svc.validateBackupMetadata({ backup: { backupId: 'TBK-MISSING', tenantSlug: 'tabsons', state: 'COMPLETED' } }, ownerContext());
  assert.equal(missingMetadata.success, false, 'missing metadata should fail validation');
  assert.ok(missingMetadata.issues.length >= 1);

  const employeeDenied = await svc.verifyBackupIntegrity(backup, employeeContext());
  assert.equal(employeeDenied.success, false, 'employees cannot run integrity controls');
  assert.equal(employeeDenied.code, 'INTEGRITY_GOVERNANCE_DENIED');

  const directorDenied = await svc.certifyBackup(verification, directorContext());
  assert.equal(directorDenied.success, false, 'director has visibility but cannot certify backups');
  assert.equal(directorDenied.code, 'INTEGRITY_GOVERNANCE_DENIED');

  const crossTenant = await svc.verifyBackupIntegrity({ backup: { ...backup.backup, tenantSlug: 'abc' }, encryptedPayload: backup.encryptedPayload, encryption: backup.encryption }, ownerContext('tabsons'));
  assert.equal(crossTenant.success, false, 'backup verification cannot cross tenant boundaries');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC confidential|ABC Employee/i);

  const report = svc.generateIntegrityAssuranceReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'director can view backup integrity assurance');
  assert.ok(report.backupTrustScore >= 0 && report.backupTrustScore <= 100);
  assert.ok(report.recoveryAssuranceScore >= 0 && report.recoveryAssuranceScore <= 100);
  assert.ok(report.integrityHealthScore >= 0 && report.integrityHealthScore <= 100);
  assert.ok(report.analytics.verificationSuccessRate >= 0 && report.analytics.verificationSuccessRate <= 100);
  assert.ok(report.analytics.corruptionRate >= 0 && report.analytics.corruptionRate <= 100);
  assert.ok(report.analytics.backupCertificationRate >= 0 && report.analytics.backupCertificationRate <= 100);
  assert.equal(report.integrations.backupGovernance, true);
  assert.equal(report.integrations.restoreGovernance, true);
  assert.equal(report.integrations.disasterRecoverySimulation, true);
  assert.equal(report.integrations.auditGovernance, true);
  assert.equal(report.governance.restoreExecutionEnabled, false);
  assert.doesNotMatch(text(report), /ABC Employee|ABC confidential/i, 'assurance report must remain tenant scoped');
  assert.ok(Object.isFrozen(report));

  const hrReport = svc.generateIntegrityAssuranceReport({ tenantSlug: 'tabsons' }, hrContext());
  assert.equal(hrReport.success, true, 'HR can view export-oriented integrity status');
  const employeeReport = svc.generateIntegrityAssuranceReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeReport.success, false, 'employee has no integrity assurance visibility');

  const data = global.DB.get();
  assert.ok(data.backupIntegrityVerificationHistory.length >= 3, 'verification history should be immutable and append-only');
  assert.ok(data.backupIntegrityVerificationHistory.every(row => row.immutable === true));
  assert.ok(data.backupCertificationHistory.some(row => row.state === 'BACKUP_CERTIFIED'), 'certification history should be recorded');
  assert.ok(data.backupCertificationHistory.every(row => row.immutable === true));
  assert.ok(data.backupIntegrityAnalyticsHistory.length >= 1, 'integrity analytics history should be recorded');
  assert.ok((data.auditLogs || []).some(row => /BACKUP_INTEGRITY|BACKUP_CERTIFICATION|CHECKSUM/.test(String(row.actionType || row.action || row.type || ''))), 'integrity actions should be audited');

  const frozen = svc.freezeIntegrityOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
  console.log('backupIntegrityVerificationService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
