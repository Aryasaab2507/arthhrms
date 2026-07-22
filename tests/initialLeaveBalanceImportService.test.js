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
  global.navigator = { userAgent: 'Node leave migration test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
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

function seedLeaveMigrationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', email: 'divya@example.com', name: 'Divya Director', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 1_000_000 },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', email: 'hr@example.com', name: 'Harini HR', role: 'HR', department: 'People', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', email: 'esha@example.com', name: 'Esha Employee', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', privateNote: 'Tabsons confidential' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', email: 'omar@example.com', name: 'Omar Operator', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', email: 'abc@example.com', name: 'ABC Employee', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'ABC confidential' }
  ];
  data.leavePolicies = [
    { policyId: 'LP-CL', tenantSlug: 'tabsons', leaveType: 'CASUAL LEAVE', annualAllowance: 12, carryForwardLimit: 5, active: true },
    { policyId: 'LP-SL', tenantSlug: 'tabsons', leaveType: 'SICK LEAVE', annualAllowance: 10, carryForwardLimit: 0, active: true },
    { policyId: 'LP-EL', tenantSlug: 'tabsons', leaveType: 'EARNED LEAVE', annualAllowance: 18, carryForwardLimit: 10, active: true },
    { policyId: 'ABC-CL', tenantSlug: 'abc', leaveType: 'CASUAL LEAVE', annualAllowance: 8, carryForwardLimit: 2, active: true }
  ];
  data.companyHolidayCalendars = [
    { calendarId: 'TAB-HOL', tenantSlug: 'tabsons', state: 'ACTIVE', active: true, holidays: [{ holidayName: 'Republic Day', holidayDate: '2026-01-26', holidayType: 'NATIONAL', region: 'IN', active: true }] }
  ];
  data.employeeBulkImportPreviewHistory = [
    { previewId: 'PREV-1', tenantSlug: 'tabsons', state: 'APPROVAL_PENDING', summary: { validRows: 2, invalidRows: 0 }, immutable: true }
  ];
  data.organizationInitializationRecords = [
    { initializationId: 'OINIT-1', tenantSlug: 'tabsons', state: 'ACTIVE', immutable: true }
  ];
  data.initialLeaveBalanceImports = [];
  data.initialLeaveBalanceImportHistory = [];
  data.initialLeaveBalanceValidationReports = [];
  data.initialLeaveBalancePreviewHistory = [];
  data.initialLeaveBalanceApplicationHistory = [];
  data.initialLeaveBalanceAnalytics = [];
  data.employeeLeaveBalances = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function validBalances() {
  return [
    { employeeId: 'EMP-1', employeeEmail: 'esha@example.com', leaveType: 'CASUAL LEAVE', openingBalance: 12, usedBalance: 2, remainingBalance: 10, carryForwardBalance: 3, effectiveDate: '2026-04-01' },
    { employeeId: 'EMP-1', employeeEmail: 'esha@example.com', leaveType: 'SICK LEAVE', openingBalance: 10, usedBalance: 1, remainingBalance: 9, carryForwardBalance: 0, effectiveDate: '2026-04-01' },
    { employeeId: 'EMP-2', employeeEmail: 'omar@example.com', leaveType: 'EARNED LEAVE', openingBalance: 18, usedBalance: 4, remainingBalance: 14, carryForwardBalance: 6, effectiveDate: '2026-04-01' }
  ];
}

function migrationPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    fileName: 'initial-leave-balances-2026.csv',
    fileType: 'CSV',
    migrationName: 'Opening Leave Balances FY26',
    effectiveDate: '2026-04-01',
    balances: validBalances(),
    ...overrides
  };
}

function text(value) {
  return JSON.stringify(value);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/leaveAttendanceGovernanceService.js',
    'services/companyHolidayImportService.js',
    'services/employeeBulkImportService.js',
    'services/organizationInitializationWizardService.js'
  ].forEach(load);
  seedLeaveMigrationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/initialLeaveBalanceImportService.js');

  const svc = global.InitialLeaveBalanceImportService;
  assert.ok(svc, 'InitialLeaveBalanceImportService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_INITIAL_LEAVE_BALANCE_IMPORT_SELF_TEST__.passed, true, 'development self-test should pass');

  ['importLeaveBalances', 'validateLeaveBalances', 'calculateMigrationReadiness', 'previewLeaveMigration', 'applyImportedBalances', 'freezeLeaveMigrationOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    employees: global.DB.get().employees,
    leavePolicies: global.DB.get().leavePolicies,
    employeeLeaveBalances: global.DB.get().employeeLeaveBalances
  });

  const imported = svc.importLeaveBalances(migrationPayload(), hrContext);
  assert.equal(imported.success, true, 'HR can import valid leave balances for review');
  assert.equal(imported.migration.state, 'APPROVAL_PENDING');
  assert.equal(imported.preview.summary.validBalances, 3);
  assert.ok(imported.validation.migrationReadinessScore >= 80, 'valid migration should receive high readiness score');
  assert.ok(Object.isFrozen(imported), 'import output must be immutable');
  assert.doesNotMatch(text(imported), /salary|Tabsons confidential|ABC Employee|ABC confidential/i, 'leave migration output must not expose sensitive or cross-tenant data');
  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    leavePolicies: global.DB.get().leavePolicies,
    employeeLeaveBalances: global.DB.get().employeeLeaveBalances
  }), beforeProtected, 'import and preview must not create balances before approval');

  const preview = svc.previewLeaveMigration({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(preview.success, true, 'migration preview should be generated');
  assert.equal(preview.summary.totalEmployees, 2);
  assert.equal(preview.summary.validBalances, 3);
  assert.ok(preview.policyIntegration.leavePoliciesIntegrated, 'leave policy integration should be reported');
  assert.ok(preview.holidayIntegration.holidayCalendarIntegrated, 'holiday calendar integration should be reported');
  assert.ok(preview.organizationIntegration.organizationInitializationIntegrated, 'organization initialization integration should be reported');

  const validation = svc.validateLeaveBalances(migrationPayload({ fileType: 'XLSX' }), directorContext);
  assert.equal(validation.success, true, 'XLSX leave balance payloads should validate');
  assert.equal(validation.summary.validBalances, 3);
  assert.equal(validation.summary.invalidBalances, 0);
  assert.equal(validation.summary.conflictCount, 0);
  assert.ok(validation.migrationReadinessScore >= 80);
  assert.ok(validation.leaveIntegrityScore >= 80);
  assert.ok(validation.governanceScore >= 80);

  const readiness = svc.calculateMigrationReadiness({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(readiness.success, true, 'migration readiness scoring should work');
  assert.ok(readiness.migrationReadinessScore >= 80);
  assert.ok(readiness.leaveIntegrityScore >= 80);
  assert.ok(readiness.governanceScore >= 80);
  assert.ok(readiness.analytics.policyConflictCount === 0);

  const invalid = svc.validateLeaveBalances({
    tenantSlug: 'tabsons',
    fileName: 'broken.csv',
    fileType: 'CSV',
    balances: [
      { employeeId: 'UNKNOWN', employeeEmail: 'missing@example.com', leaveType: 'CASUAL LEAVE', openingBalance: 12, usedBalance: 0, remainingBalance: 12, carryForwardBalance: 0, effectiveDate: '2026-04-01' },
      { employeeId: 'EMP-1', employeeEmail: 'esha@example.com', leaveType: 'UNKNOWN LEAVE', openingBalance: 4, usedBalance: 0, remainingBalance: 4, carryForwardBalance: 0, effectiveDate: '2026-04-01' },
      { employeeId: 'EMP-1', employeeEmail: 'esha@example.com', leaveType: 'CASUAL LEAVE', openingBalance: -1, usedBalance: 0, remainingBalance: -1, carryForwardBalance: 0, effectiveDate: 'not-a-date' },
      { employeeId: 'EMP-1', employeeEmail: 'esha@example.com', leaveType: 'CASUAL LEAVE', openingBalance: 12, usedBalance: 1, remainingBalance: 11, carryForwardBalance: 7, effectiveDate: '2026-04-01' }
    ]
  }, hrContext);
  assert.equal(invalid.success, false, 'invalid leave balances must block validation');
  assert.ok(invalid.issues.some(issue => issue.code === 'EMPLOYEE_NOT_FOUND'), 'unknown employees should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'LEAVE_TYPE_NOT_FOUND'), 'unknown leave types should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'NEGATIVE_LEAVE_BALANCE'), 'negative balances should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_EFFECTIVE_DATE'), 'invalid dates should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'DUPLICATE_LEAVE_BALANCE_ENTRY'), 'duplicate entries should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'CARRY_FORWARD_POLICY_CONFLICT'), 'carry-forward policy conflicts should be detected');

  const unsupported = svc.importLeaveBalances(migrationPayload({ fileType: 'PDF', fileName: 'leave.pdf' }), hrContext);
  assert.equal(unsupported.success, false, 'unsupported file types must be blocked');
  assert.ok(unsupported.issues.some(issue => issue.code === 'UNSUPPORTED_LEAVE_BALANCE_FILE_TYPE'));

  const employeeImport = svc.importLeaveBalances(migrationPayload(), employeeContext);
  assert.equal(employeeImport.success, false, 'employees cannot import leave balances');
  assert.ok(employeeImport.issues.some(issue => issue.code === 'LEAVE_MIGRATION_IMPORT_DENIED'));

  const employeeView = svc.previewLeaveMigration({ tenantSlug: 'tabsons' }, employeeContext);
  assert.equal(employeeView.success, true, 'employees can view own migrated balances only');
  assert.equal(employeeView.governance.employeeViewOnly, true);
  assert.ok(employeeView.preview.balances.every(row => row.employeeId === 'EMP-1'), 'employee view must be restricted to own balances');
  assert.doesNotMatch(text(employeeView), /EMP-2|salary|Tabsons confidential|ABC Employee/i, 'employee leave preview must stay scoped and sanitized');

  const hrApply = svc.applyImportedBalances({ tenantSlug: 'tabsons', approvalGranted: true }, hrContext);
  assert.equal(hrApply.success, false, 'HR cannot apply imported balances');
  assert.ok(hrApply.issues.some(issue => issue.code === 'LEAVE_MIGRATION_APPLY_DENIED'));

  const approvalMissing = svc.applyImportedBalances({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(approvalMissing.success, false, 'director apply still requires explicit approval');
  assert.ok(approvalMissing.issues.some(issue => issue.code === 'LEAVE_MIGRATION_APPROVAL_REQUIRED'));

  const applied = svc.applyImportedBalances({ tenantSlug: 'tabsons', approvalGranted: true }, directorContext);
  assert.equal(applied.success, true, 'director can apply balances after validation and approval');
  assert.equal(applied.migration.state, 'APPLIED');
  assert.equal(applied.appliedBalances.length, 3);
  assert.ok(applied.policyIntegration.leavePoliciesIntegrated);
  assert.ok(applied.holidayIntegration.holidayCalendarIntegrated);

  const dataAfterApply = global.DB.get();
  assert.equal(dataAfterApply.employeeLeaveBalances.filter(row => row.tenantSlug === 'tabsons').length, 3, 'approved migration should persist applied balances');
  assert.ok(dataAfterApply.employeeLeaveBalances.every(row => row.immutable === true), 'applied balance records should be immutable');

  const platformView = svc.previewLeaveMigration({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformView.success, true, 'platform owner can see governance-only migration visibility');
  assert.equal(platformView.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformView.preview.balances.every(row => /^Governance Employee/.test(row.employeeId)), 'platform owner employee identifiers should be anonymized');

  const crossTenant = svc.importLeaveBalances(migrationPayload({ tenantSlug: 'tabsons' }), { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant leave balance import must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_LEAVE_MIGRATION_BLOCKED'));

  const abcPreview = svc.previewLeaveMigration({
    tenantSlug: 'abc',
    balances: [{ employeeId: 'ABC-1', employeeEmail: 'abc@example.com', leaveType: 'CASUAL LEAVE', openingBalance: 8, usedBalance: 0, remainingBalance: 8, carryForwardBalance: 1, effectiveDate: '2026-04-01' }]
  }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcPreview.success, true, 'tenant B can preview its own balances');
  assert.doesNotMatch(text(abcPreview), /EMP-1|EMP-2|Opening Leave Balances FY26|Tabsons|Harini/i, 'tenant A balances must not leak into tenant B');

  const empty = svc.validateLeaveBalances({ tenantSlug: 'tabsons', fileType: 'CSV', balances: [] }, hrContext);
  assert.equal(empty.success, false, 'empty leave balance imports must be blocked safely');
  assert.ok(empty.issues.some(issue => issue.code === 'EMPTY_LEAVE_BALANCE_IMPORT'));

  const data = global.DB.get();
  assert.ok(data.initialLeaveBalanceImports.some(row => row.tenantSlug === 'tabsons' && row.state === 'APPLIED'), 'applied migration should be persisted');
  assert.ok(data.initialLeaveBalanceImportHistory.length >= 1, 'leave migration import history should be immutable');
  assert.ok(data.initialLeaveBalanceValidationReports.length >= 1, 'leave migration validation history should be immutable');
  assert.ok(data.initialLeaveBalancePreviewHistory.length >= 1, 'leave migration preview history should be immutable');
  assert.ok(data.initialLeaveBalanceApplicationHistory.length >= 1, 'leave migration application history should be immutable');
  assert.ok(data.initialLeaveBalanceAnalytics.length >= 1, 'leave migration analytics should be immutable');
  assert.ok(global.DB.getAuditLogs().some(row => /LEAVE_BALANCE_IMPORT|LEAVE_BALANCE_VALIDATION|LEAVE_BALANCE_APPLIED/.test(row.actionType || row.action || '')), 'leave migration actions should be audited');
}

main();
