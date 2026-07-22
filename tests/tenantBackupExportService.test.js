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
    setAttribute(){}, removeAttribute(){}, appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
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
  global.navigator = { userAgent: 'Node tenant backup test', platform: 'Win32' };
  global.location = {
    href: '', origin: 'https://platform.arthhrms.example', hostname: 'platform.arthhrms.example', pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; },
    createElement(){ return fakeEl(); }, addEventListener(){}, body: fakeEl(), documentElement: fakeEl()
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'TEN-tabsons', companyName: 'Tabsons', timezone: 'Asia/Kolkata', currency: 'INR'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC confidential' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', name: 'Esha Engineer', email: 'esha@example.com', role: 'employee', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', password: 'secret-1', salary: 90000 },
    { id: 'HR-1', empId: 'HR-1', name: 'Harini HR', email: 'hr@example.com', role: 'HR', department: 'People', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', passwordHash: 'private-hash' },
    { id: 'ABC-1', empId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'employee', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 80000, privateNote: 'ABC confidential' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-ENG', departmentCode: 'ENG', departmentName: 'Engineering', ownerId: 'EMP-1', state: 'ACTIVE', tenantSlug: 'tabsons' },
    { departmentId: 'D-ABC', departmentCode: 'ABC', departmentName: 'ABC Finance', ownerId: 'ABC-1', state: 'ACTIVE', tenantSlug: 'abc' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', leaveType: 'Annual', fromDate: '2026-06-01', toDate: '2026-06-02', status: 'Approved', tenantSlug: 'tabsons' },
    { leaveId: 'LV-ABC', empId: 'ABC-1', leaveType: 'Sick', status: 'Approved', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', empId: 'EMP-1', date: '2026-06-01', status: 'Present', tenantSlug: 'tabsons' },
    { attendanceId: 'ATT-ABC', empId: 'ABC-1', date: '2026-06-01', status: 'Present', tenantSlug: 'abc' }
  ];
  data.payroll = [
    { payrollId: 'PAY-1', empId: 'EMP-1', month: '2026-05', netSalary: 85000, tenantSlug: 'tabsons' },
    { payrollId: 'PAY-ABC', empId: 'ABC-1', month: '2026-05', netSalary: 75000, tenantSlug: 'abc' }
  ];
  data.documents = [
    { documentId: 'DOC-1', empId: 'EMP-1', category: 'policy', fileName: 'policy.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/docs/policy.pdf', signedUrl: 'https://signed.example.com/private', tenantSlug: 'tabsons' },
    { documentId: 'DOC-ABC', empId: 'ABC-1', category: 'identity', fileName: 'abc-secret.pdf', storagePath: 'abc/docs/secret.pdf', tenantSlug: 'abc' }
  ];
  data.auditLogs = [
    { auditId: 'AUD-1', actorRole: 'HR', actionType: 'EMPLOYEE_UPDATED', module: 'Employee', tenantSlug: 'tabsons', date: '2026-06-01T00:00:00.000Z' },
    { auditId: 'AUD-ABC', actorRole: 'HR', actionType: 'ABC_PRIVATE', module: 'Employee', tenantSlug: 'abc', description: 'ABC confidential' }
  ];
  data.tenantBackupHistory = [];
  data.tenantExportHistory = [];
  data.tenantBackupValidationHistory = [];
  data.tenantBackupSchedules = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/exportService.js'].forEach(load);
  seedData();
  load('services/tenantBackupExportService.js');

  const svc = global.TenantBackupExportService;
  assert.ok(svc, 'TenantBackupExportService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.deepEqual(svc.BACKUP_TYPES, ['FULL_BACKUP', 'INCREMENTAL_BACKUP', 'MANUAL_BACKUP', 'SCHEDULED_BACKUP', 'EXPORT_SNAPSHOT']);
  assert.deepEqual(svc.BACKUP_STATES, ['CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'ARCHIVED']);
  if (global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST_PROMISE__) await global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST_PROMISE__;
  assert.equal(global.__ARTHHRMS_TENANT_BACKUP_SELF_TEST__.passed, true, 'development self-test should pass');

  ['createTenantBackup', 'validateBackupIntegrity', 'generateExport', 'calculateBackupHealth', 'generateRecoveryReadiness', 'freezeBackupOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const owner = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons' };
  const hr = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const director = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };

  const backup = await svc.createTenantBackup({ tenantSlug: 'tabsons', backupType: 'FULL_BACKUP' }, owner);
  assert.equal(backup.success, true, 'platform owner can create encrypted tenant backup');
  assert.equal(backup.backup.state, 'COMPLETED');
  assert.equal(backup.backup.backupType, 'FULL_BACKUP');
  assert.equal(backup.encryption.encrypted, true);
  assert.equal(backup.encryption.algorithm, 'AES-GCM');
  assert.ok(backup.encryptedPayload.length > 20, 'backup should expose only encrypted payload');
  assert.ok(backup.backup.integrityHash, 'backup should include integrity hash');
  assert.equal(backup.backup.recordCounts.employees, 2);
  assert.equal(backup.backup.recordCounts.payroll, 1);
  assert.doesNotMatch(text(backup), /Esha Engineer|ABC Employee|ABC confidential|secret-1|private-hash|85000|75000/i, 'backup output must never expose plaintext tenant records');
  assert.ok(Object.isFrozen(backup), 'backup output should be immutable');

  const integrity = await svc.validateBackupIntegrity(backup, owner);
  assert.equal(integrity.success, true);
  assert.equal(integrity.integrityValid, true, 'untampered backup should validate');
  const tampered = await svc.validateBackupIntegrity({ ...backup, encryptedPayload: backup.encryptedPayload + 'tampered' }, owner);
  assert.equal(tampered.success, false, 'tampered backup must fail validation');
  assert.equal(tampered.integrityValid, false);

  const employeeCsv = await svc.generateExport({ tenantSlug: 'tabsons', domain: 'employees', format: 'CSV' }, hr);
  assert.equal(employeeCsv.success, true, 'HR can export workforce data');
  assert.equal(employeeCsv.export.format, 'CSV');
  assert.match(employeeCsv.content, /Esha Engineer/);
  assert.doesNotMatch(employeeCsv.content, /ABC Employee|ABC confidential|secret-1|private-hash|passwordHash|password/i, 'workforce export must filter cross-tenant and credential data');
  assert.ok(employeeCsv.export.integrityHash);

  const settingsJson = await svc.generateExport({ tenantSlug: 'tabsons', domain: 'organization_settings', format: 'JSON' }, director);
  assert.equal(settingsJson.success, true, 'director can export organization settings');
  assert.match(settingsJson.content, /Asia\/Kolkata/);
  assert.doesNotMatch(settingsJson.content, /ABC confidential|TEN-abc/i);

  const xlsx = await svc.generateExport({ tenantSlug: 'tabsons', domain: 'departments', format: 'XLSX' }, director);
  assert.equal(xlsx.success, true, 'XLSX workbook exports should be supported');
  assert.equal(xlsx.export.format, 'XLSX');
  assert.ok(xlsx.workbook && Array.isArray(xlsx.workbook.rows), 'XLSX export should provide a workbook model');

  const deniedPayroll = await svc.generateExport({ tenantSlug: 'tabsons', domain: 'payroll', format: 'JSON' }, director);
  assert.equal(deniedPayroll.success, false, 'director cannot export payroll details');
  assert.ok(deniedPayroll.issues.some(issue => issue.code === 'EXPORT_DOMAIN_NOT_AUTHORIZED'));

  const crossTenant = await svc.generateExport({ tenantSlug: 'abc', domain: 'employees', format: 'CSV' }, hr);
  assert.equal(crossTenant.success, false, 'HR cannot export another tenant');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_EXPORT_BLOCKED'));

  const employeeDenied = await svc.createTenantBackup({ tenantSlug: 'tabsons', backupType: 'MANUAL_BACKUP' }, { actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' });
  assert.equal(employeeDenied.success, false, 'employee cannot access backup governance');

  const schedule = svc.scheduleTenantBackup({ tenantSlug: 'tabsons', frequency: 'WEEKLY', backupType: 'SCHEDULED_BACKUP' }, owner);
  assert.equal(schedule.success, true, 'platform owner can schedule backups');
  assert.equal(schedule.schedule.frequency, 'WEEKLY');

  const health = svc.calculateBackupHealth({ tenantSlug: 'tabsons' }, owner);
  assert.equal(health.success, true);
  assert.ok(health.backupHealthScore >= 80);
  const recovery = svc.generateRecoveryReadiness({ tenantSlug: 'tabsons' }, owner);
  assert.equal(recovery.success, true);
  assert.ok(typeof recovery.recoveryReadinessScore === 'number');
  assert.equal(recovery.restorePreparation.restoreExecutionEnabled, false, 'restore execution must remain disabled');

  const data = global.DB.get();
  assert.ok(data.tenantBackupHistory.length >= 1, 'immutable backup metadata history should be recorded');
  assert.ok(data.tenantExportHistory.length >= 3, 'immutable export history should be recorded');
  assert.ok(data.tenantBackupValidationHistory.length >= 2, 'integrity validation history should be recorded');
  assert.ok(data.tenantBackupSchedules.length >= 1, 'backup schedules should be recorded');
  assert.ok((data.auditLogs || []).some(row => /BACKUP|EXPORT/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'backup and export actions should be audited');

  console.log('tenantBackupExportService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
