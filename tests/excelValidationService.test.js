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
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32'
  };
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

function seedValidationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.departments = [
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons' },
    { id: 'DEP-OPS', name: 'Operations', tenantSlug: 'tabsons' },
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'DEP-FIN-ABC', name: 'Finance', tenantSlug: 'abc' }
  ];
  data.designations = [
    { id: 'DES-HR-A', name: 'HR Associate', tenantSlug: 'tabsons' },
    { id: 'DES-OPS-A', name: 'Operations Analyst', tenantSlug: 'tabsons' },
    { id: 'DES-ENG', name: 'Engineer', tenantSlug: 'tabsons' }
  ];
  data.locations = [
    { id: 'LOC-MUM', name: 'Mumbai', tenantSlug: 'tabsons' },
    { id: 'LOC-PUNE', name: 'Pune', tenantSlug: 'tabsons' },
    { id: 'LOC-BLR', name: 'Bengaluru', tenantSlug: 'tabsons' }
  ];
  data.employees = [
    { id: 'EMP-EXISTING', empId: 'EMP-EXISTING', employeeId: 'EMP-EXISTING', name: 'Existing Employee', email: 'existing@example.com', department: 'Operations', designation: 'Operations Analyst', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', designation: 'Operations Analyst', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-EXISTING', empId: 'ABC-EXISTING', employeeId: 'ABC-EXISTING', name: 'Other Tenant Employee', email: 'abc.existing@example.com', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 999999, leaveBalance: 40 }
  ];
  data.excelValidationHistory = [];
  data.importQualityReports = [];
  data.onboardingReadinessReports = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function validationRows() {
  return [
    { employeeId: 'VAL-001', firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@example.com', department: 'HR', designation: 'HR Associate', joiningDate: '2026-07-01', manager: 'MGR-1', location: 'Mumbai' },
    { employeeId: 'VAL-002', firstName: 'Ravi', lastName: 'Shah', email: 'ravi.shah@example.com', department: 'Operations', designation: 'Operations Analyst', joiningDate: '2026-07-02', manager: 'MGR-1', location: 'Pune' },
    { employeeId: 'VAL-002', firstName: 'Duplicate', lastName: 'Id', email: 'duplicate.id@example.com', department: 'Operations', designation: 'Operations Analyst', joiningDate: '2026-07-03', manager: 'MGR-1', location: 'Pune' },
    { employeeId: 'EMP-EXISTING', firstName: 'Existing', lastName: 'Conflict', email: 'existing@example.com', department: 'Operations', designation: 'Operations Analyst', joiningDate: '2026-07-03', manager: 'MGR-1', location: 'Pune' },
    { employeeId: 'ABC-EXISTING', firstName: 'Tenant', lastName: 'Safe', email: 'abc.existing@example.com', department: 'HR', designation: 'HR Associate', joiningDate: '2026-07-04', manager: 'MGR-1', location: 'Mumbai' },
    { employeeId: 'VAL-003', firstName: '', lastName: 'MissingFirst', email: 'missing.first@example.com', department: 'Engineering', designation: 'Engineer', joiningDate: '2026-07-05', manager: 'MGR-1', location: 'Bengaluru' },
    { employeeId: 'VAL-004', firstName: 'Bad', lastName: 'Email', email: 'bad-email', department: 'Engineering', designation: 'Engineer', joiningDate: '2026-07-05', manager: 'MGR-1', location: 'Bengaluru' },
    { employeeId: 'VAL-005', firstName: 'Bad', lastName: 'Dept', email: 'bad.dept@example.com', department: 'Unknown', designation: 'Engineer', joiningDate: '2026-07-05', manager: 'MGR-1', location: 'Bengaluru' },
    { employeeId: 'VAL-006', firstName: 'Bad', lastName: 'Date', email: 'bad.date@example.com', department: 'Engineering', designation: 'Engineer', joiningDate: 'not-a-date', manager: 'MGR-1', location: 'Bengaluru' },
    { employeeId: 'VAL-007', firstName: 'Missing', lastName: 'Manager', email: 'missing.manager@example.com', department: 'Engineering', designation: 'Engineer', joiningDate: '2026-07-05', manager: 'MGR-404', location: 'Bengaluru' },
    { employeeId: 'VAL-008', firstName: 'Bad', lastName: 'Designation', email: 'bad.designation@example.com', department: 'Engineering', designation: 'Unknown Role', joiningDate: '2026-07-05', manager: 'MGR-1', location: 'Bengaluru' },
    { employeeId: 'VAL-009', firstName: 'Bad', lastName: 'Location', email: 'bad.location@example.com', department: 'Engineering', designation: 'Engineer', joiningDate: '2026-07-05', manager: 'MGR-1', location: 'Unknown City' }
  ];
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/employeeBulkImportService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/excelValidationService.js');
  seedValidationData();

  const svc = global.ExcelValidationService;
  assert.ok(svc, 'ExcelValidationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.VALIDATION_PIPELINE), 'pipeline constants must be immutable');
  assert.ok(Object.isFrozen(svc.VALIDATION_SEVERITIES), 'severity constants must be immutable');
  assert.equal(global.__ARTHHRMS_EXCEL_VALIDATION_SELF_TEST__.passed, true, 'development self-test should cover validation failure cases');

  ['validateImportSchema', 'validateEmployeeRow', 'detectDuplicateEmployees', 'calculateImportQuality', 'generateValidationReport', 'freezeValidationOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const context = { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const payload = {
    tenantSlug: 'tabsons',
    fileName: 'employee-validation.xlsx',
    fileType: 'XLSX',
    rows: validationRows(),
    metadata: { rawPayload: 'salary 999999 leaveBalance 40' }
  };
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const schema = svc.validateImportSchema(payload, context);
  assert.equal(schema.success, true, 'schema validation should pass with required columns');
  assert.equal(schema.pipeline[1].key, 'SCHEMA_VALIDATION');
  assert.equal(schema.requiredColumnsMissing.length, 0);
  assert.ok(Object.isFrozen(schema), 'schema output must be immutable');

  const missingSchema = svc.validateImportSchema({
    tenantSlug: 'tabsons',
    fileName: 'missing.csv',
    fileType: 'CSV',
    rows: [{ employeeId: 'X', email: 'x@example.com' }]
  }, context);
  assert.equal(missingSchema.success, false, 'missing required columns should fail schema validation');
  assert.ok(missingSchema.failures.some(item => item.code === 'MISSING_REQUIRED_COLUMN'));

  const rowReport = svc.validateEmployeeRow(validationRows()[6], { ...context, rowNumber: 7 });
  assert.equal(rowReport.success, false, 'malformed row should fail row validation');
  assert.ok(rowReport.issues.some(item => item.code === 'INVALID_EMAIL'));
  assert.ok(Object.isFrozen(rowReport), 'row output must be immutable');

  const duplicates = svc.detectDuplicateEmployees(validationRows(), context);
  assert.equal(duplicates.duplicateEmployeeIds.length, 2, 'file and existing employee ID conflicts should be reported');
  assert.equal(duplicates.duplicateEmails.length, 1, 'existing email conflicts should be reported');
  assert.ok(duplicates.conflictReport.some(item => item.conflictType === 'EXISTING_EMPLOYEE_ID'));
  assert.ok(duplicates.conflictReport.some(item => item.conflictType === 'EXISTING_EMAIL'));
  assert.doesNotMatch(JSON.stringify(duplicates), /ABC-EXISTING|abc\.existing@example\.com|999999|salary|leaveBalance/i, 'cross-tenant employee data must not leak into duplicate report');

  const report = svc.generateValidationReport(payload, context);
  assert.equal(report.success, true, 'validation report should generate even with invalid rows');
  assert.equal(report.readOnly, true);
  assert.equal(report.noImportExecution, true);
  assert.equal(report.noEmployeeCreation, true);
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'validation must not mutate employee records');
  assert.equal(report.pipeline.map(step => step.key).join('>'), 'FILE_UPLOAD>SCHEMA_VALIDATION>COLUMN_VALIDATION>FIELD_VALIDATION>DUPLICATE_DETECTION>BUSINESS_RULE_VALIDATION>QUALITY_SCORING>VALIDATION_REPORT');
  assert.equal(report.summary.totalRows, 12);
  assert.equal(report.summary.validRows, 3, 'two clean rows plus cross-tenant existing duplicate value should remain tenant-isolated');
  assert.equal(report.summary.invalidRows, 9);
  assert.ok(report.summary.warningCount >= 1, 'missing manager should create warning visibility');
  assert.ok(report.summary.errorCount >= 1, 'field and business rule errors should be counted');
  assert.ok(report.summary.criticalCount >= 1, 'existing duplicate conflicts should be critical');
  assert.equal(report.summary.duplicateCount, 3, 'duplicate ID, existing ID, and existing email should count');
  assert.equal(report.onboardingReadiness.onboardingBlocked, true, 'critical validation issues must block onboarding');
  assert.ok(report.quality.qualityScore < 100, 'mixed import should reduce quality score');
  assert.ok(report.quality.severityScore < 100, 'severity issues should reduce severity score');
  assert.ok(report.onboardingReadiness.onboardingReadinessScore < 100, 'issues should reduce onboarding readiness');
  assert.ok(report.integrationReadiness.inviteMailDeliveryPrepared, 'Task 115 integration should be prepared');
  assert.ok(report.integrationReadiness.activationWizardPrepared, 'Task 116 integration should be prepared');
  assert.ok(report.integrationReadiness.departmentSetupFlowPrepared, 'Task 118 integration should be prepared');
  assert.ok(report.integrationReadiness.leaveBalanceImportPrepared, 'Task 121 integration should be prepared');
  assert.ok(Object.isFrozen(report), 'report output must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC-EXISTING|abc\.existing@example\.com/i, 'validation output must redact sensitive and cross-tenant records');

  const quality = svc.calculateImportQuality(report, context);
  assert.equal(quality.success, true, 'quality scoring should complete');
  assert.equal(quality.onboardingBlocked, true);
  assert.ok(quality.qualityScore < 100);
  assert.ok(Object.isFrozen(quality), 'quality output must be immutable');

  const employeeBlocked = svc.generateValidationReport(payload, { actor: { id: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeBlocked.success, false, 'employees cannot run import validation');
  assert.ok(employeeBlocked.failures.some(item => item.code === 'ROLE_VALIDATION_ACCESS_BLOCKED'));

  const directorReview = svc.generateValidationReport(payload, { actor: { id: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons', reviewOnly: true });
  assert.equal(directorReview.success, true, 'director can review validation reports');
  assert.equal(directorReview.governance.reviewOnly, true);

  const platformVisibility = svc.generateValidationReport(payload, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformVisibility.success, true, 'platform owner can access governance visibility');
  assert.equal(platformVisibility.governance.platformOwnerVisibilityOnly, true);

  const crossTenant = svc.generateValidationReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(crossTenant.success, false, 'cross-tenant validation must be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_VALIDATION_BLOCKED'));

  const empty = svc.generateValidationReport({ tenantSlug: 'tabsons', fileName: 'empty.xlsx', fileType: 'XLSX', rows: [] }, context);
  assert.equal(empty.success, false, 'empty spreadsheets should fail safely');
  assert.ok(empty.failures.some(item => item.code === 'EMPTY_SPREADSHEET'));

  const malformed = svc.generateValidationReport('bad-payload', context);
  assert.equal(malformed.success, false, 'malformed spreadsheets should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed output must be immutable');

  const oversized = svc.generateValidationReport({ tenantSlug: 'tabsons', fileName: 'huge.xlsx', fileType: 'XLSX', rows: validationRows(), sizeBytes: 11 * 1024 * 1024 }, context);
  assert.equal(oversized.success, false, 'oversized imports should fail safely');
  assert.ok(oversized.failures.some(item => item.code === 'OVERSIZED_IMPORT'));

  const previousAudit = global.AuditService;
  const previousTelemetry = global.WorkflowTelemetryService;
  const previousBulk = global.EmployeeBulkImportService;
  global.AuditService = undefined;
  global.WorkflowTelemetryService = undefined;
  global.EmployeeBulkImportService = undefined;
  const degraded = svc.generateValidationReport({
    tenantSlug: 'tabsons',
    fileName: 'degraded.xls',
    fileType: 'XLS',
    rows: validationRows().slice(0, 2)
  }, context);
  assert.equal(degraded.success, true, 'optional dependency absence should degrade safely');
  assert.equal(degraded.integrationHealth.auditIntegrated, false);
  assert.equal(degraded.integrationHealth.employeeBulkImportIntegrated, false);
  global.AuditService = previousAudit;
  global.WorkflowTelemetryService = previousTelemetry;
  global.EmployeeBulkImportService = previousBulk;

  const data = global.DB.get();
  assert.ok(data.excelValidationHistory.length >= 1, 'immutable validation history should be stored');
  assert.ok(data.importQualityReports.length >= 1, 'immutable quality report should be stored');
  assert.ok(data.onboardingReadinessReports.length >= 1, 'immutable readiness report should be stored');
  assert.ok(global.DB.getAuditLogs().some(row => /EXCEL_VALIDATION_/.test(row.actionType || row.action || '')), 'validation actions should be audited');
}

main();
