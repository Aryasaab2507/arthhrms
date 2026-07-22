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

function seedBulkImportData() {
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
    { id: 'DEP-ABC-FIN', name: 'Finance', tenantSlug: 'abc' }
  ];
  data.employees = [
    { id: 'EMP-EXISTING', empId: 'EMP-EXISTING', employeeId: 'EMP-EXISTING', name: 'Existing Employee', email: 'existing@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'Other Tenant Employee', email: 'abc@example.com', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 999999, leaveBalance: 44 }
  ];
  data.employeeBulkImportHistory = [];
  data.employeeBulkImportPreviewHistory = [];
  data.employeeBulkImportReviewHistory = [];
  data.employeeBulkImportAuditHistory = [];
  data.importBatches = [];
  data.importStagingRows = [];
  data.importRollbackLogs = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function sampleCsv() {
  return [
    'Employee ID,First Name,Last Name,Email,Department,Designation,Joining Date,Manager,Phone Number,Location,Employment Type,Cost Center,Shift Assignment,Salary,Leave Balance',
    'IMP-001,Asha,Rao,asha.rao@example.com,Operations,Analyst,2026-07-01,MGR-1,+918765432101,Mumbai,Full Time,OPS-A,General,500000,22',
    'IMP-002,Ravi,Shah,ravi.shah@example.com,HR,HR Associate,2026-07-02,,+918765432102,Pune,Full Time,HR-A,Day,400000,18',
    'IMP-001,Duplicate,Id,duplicate.id@example.com,Operations,Analyst,2026-07-03,MGR-1,+918765432103,Mumbai,Full Time,OPS-A,General,300000,10',
    'EMP-EXISTING,Duplicate,Existing,existing@example.com,Operations,Analyst,2026-07-03,MGR-1,+918765432104,Mumbai,Full Time,OPS-A,General,300000,10',
    'IMP-003,NoEmail,User,,Engineering,Engineer,2026-07-04,MGR-1,+918765432105,Bengaluru,Full Time,ENG-A,Day,300000,10',
    'IMP-004,BadDept,User,baddept@example.com,Unknown,Engineer,2026-07-05,MGR-1,+918765432106,Bengaluru,Full Time,ENG-A,Day,300000,10',
    'IMP-005,BadDate,User,baddate@example.com,Engineering,Engineer,not-a-date,MGR-1,+918765432107,Bengaluru,Full Time,ENG-A,Day,300000,10'
  ].join('\n');
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
    'services/employeeOnboardingService.js',
    'services/importPipelineService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeBulkImportService.js');
  seedBulkImportData();

  const svc = global.EmployeeBulkImportService;
  assert.ok(svc, 'EmployeeBulkImportService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.IMPORT_WORKFLOW), 'import workflow constants must be immutable');
  assert.ok(Object.isFrozen(svc.IMPORT_STATES), 'import state constants must be immutable');
  assert.equal(global.__ARTHHRMS_EMPLOYEE_BULK_IMPORT_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  ['uploadEmployeeFile', 'parseEmployeeImport', 'generateImportPreview', 'calculateImportReadiness', 'normalizeImportPayload', 'freezeImportOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const context = {
    actor: { id: 'HR-1', role: 'HR' },
    tenantSlug: 'tabsons'
  };
  const payload = {
    tenantSlug: 'tabsons',
    fileName: 'employees.csv',
    fileType: 'CSV',
    fileContent: sampleCsv(),
    metadata: {
      source: 'test',
      rawPayload: 'salary 999999 leaveBalance 44'
    }
  };

  const beforeEmployees = JSON.stringify(global.DB.get().employees);
  const upload = svc.uploadEmployeeFile(payload, context);
  assert.equal(upload.success, true, 'CSV upload review should succeed');
  assert.equal(upload.state, 'UPLOADED');
  assert.equal(upload.directDatabaseImportBlocked, true, 'direct database imports must be blocked');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'upload must not create employees');

  const parsed = svc.parseEmployeeImport(payload, context);
  assert.equal(parsed.success, true, 'CSV parsing should succeed');
  assert.equal(parsed.state, 'PARSED');
  assert.equal(parsed.rows.length, 7, 'all CSV rows should parse into preview rows');
  assert.equal(parsed.rows[0].employeeId, 'IMP-001');
  assert.equal(parsed.rows[0].firstName, 'Asha');
  assert.doesNotMatch(JSON.stringify(parsed), /999999|salary|leaveBalance|rawPayload/i, 'parsed output must redact sensitive fields');

  const preview = svc.generateImportPreview(payload, context);
  assert.equal(preview.success, true, 'preview should generate even when rows need review');
  assert.equal(preview.state, 'REVIEW_REQUIRED');
  assert.equal(preview.readOnly, true);
  assert.equal(preview.requiresApproval, true);
  assert.equal(preview.employeeCreationBlockedUntilApproval, true);
  assert.equal(preview.directDatabaseImportBlocked, true);
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'preview must not mutate employees');
  assert.equal(preview.workflow.map(step => step.key).join('>'), 'UPLOAD_FILE>PARSE_FILE>VALIDATE_STRUCTURE>PREVIEW_EMPLOYEES>RESOLVE_ERRORS>APPROVE_IMPORT>CREATE_EMPLOYEES>AUDIT_IMPORT');
  assert.equal(preview.summary.totalRows, 7);
  assert.equal(preview.summary.validRows, 2, 'two safe rows should be ready for approval');
  assert.equal(preview.summary.invalidRows, 5, 'unsafe rows should be isolated for review');
  assert.equal(preview.summary.duplicateEmployees, 2, 'file and existing employee duplicates should be counted');
  assert.equal(preview.summary.duplicateEmails, 1, 'existing duplicate email should be counted');
  assert.ok(preview.summary.missingFields >= 1, 'missing email should be detected');
  assert.ok(preview.summary.departmentMismatches >= 1, 'unknown departments should be detected');
  assert.ok(preview.errors.some(item => item.code === 'INVALID_JOINING_DATE'), 'invalid dates should be detected');
  assert.ok(preview.errors.some(item => item.code === 'DEPARTMENT_MISMATCH'), 'department mismatches should be listed');
  assert.ok(preview.duplicates.employeeIds.includes('IMP-001'), 'duplicate employee IDs should be listed');
  assert.ok(preview.duplicates.employeeIds.includes('EMP-EXISTING'), 'existing employees should be listed as duplicates');
  assert.ok(preview.duplicates.emails.includes('existing@example.com'), 'existing emails should be listed as duplicates');
  assert.ok(preview.importGovernance.importOwnershipRequired, 'import ownership governance should be explicit');
  assert.ok(preview.importGovernance.onboardingWorkflowPreserved, 'onboarding workflow governance should be explicit');
  assert.ok(preview.integrationReadiness.excelValidationEnginePrepared, 'Excel validation integration should be prepared');
  assert.ok(preview.integrationReadiness.inviteMailDeliveryPrepared, 'invite mail delivery integration should be prepared');
  assert.ok(preview.integrationReadiness.activationWizardPrepared, 'activation wizard integration should be prepared');
  assert.ok(preview.integrationReadiness.departmentSetupFlowPrepared, 'department setup flow integration should be prepared');
  assert.ok(Object.isFrozen(preview), 'preview output must be immutable');
  assert.doesNotMatch(JSON.stringify(preview), /999999|salary|leaveBalance|rawPayload|ABC-1|abc@example.com/i, 'preview must not leak salary, leave, raw payload, or cross-tenant records');

  const readiness = svc.calculateImportReadiness(preview, context);
  assert.equal(readiness.success, true, 'readiness scoring should complete');
  assert.ok(readiness.importSuccessScore < 100, 'mixed import should reduce success score');
  assert.ok(readiness.validationScore < 100, 'validation issues should reduce validation score');
  assert.ok(readiness.onboardingReadinessScore < 100, 'review issues should reduce onboarding readiness');
  assert.ok(Object.isFrozen(readiness), 'readiness output must be immutable');

  const approved = svc.approveImportPreview({ previewId: preview.previewId, tenantSlug: 'tabsons' }, context);
  assert.equal(approved.success, false, 'imports with unresolved errors cannot be approved');
  assert.ok(approved.failures.some(item => item.code === 'UNRESOLVED_IMPORT_ERRORS'));
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'blocked approval must not mutate employees');

  const safeRows = [
    { employeeId: 'IMP-101', firstName: 'Mina', lastName: 'Roy', email: 'mina.roy@example.com', department: 'HR', designation: 'Coordinator', joiningDate: '2026-07-10', manager: 'MGR-1' },
    { employeeId: 'IMP-102', firstName: 'Dev', lastName: 'Mehta', email: 'dev.mehta@example.com', department: 'Engineering', designation: 'Engineer', joiningDate: '2026-07-11', manager: 'MGR-1' }
  ];
  const xlsxPreview = svc.generateImportPreview({ tenantSlug: 'tabsons', fileName: 'employees.xlsx', fileType: 'XLSX', rows: safeRows }, context);
  assert.equal(xlsxPreview.success, true, 'XLSX row payload should preview');
  assert.equal(xlsxPreview.state, 'PREVIEW_READY');
  assert.equal(xlsxPreview.summary.validRows, 2);
  const approval = svc.approveImportPreview({ previewId: xlsxPreview.previewId, tenantSlug: 'tabsons' }, { actor: { id: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' });
  assert.equal(approval.success, true, 'director can approve clean import preview');
  assert.equal(approval.createEmployeesDirectly, false, 'approval must not directly create employees');
  assert.equal(approval.onboardingWorkflowRequired, true, 'approval should hand off to onboarding workflow');
  assert.equal(approval.state, 'APPROVED');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'approval must not bypass onboarding employee creation');

  const crossTenant = svc.generateImportPreview({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(crossTenant.success, false, 'cross-tenant import should be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_IMPORT_BLOCKED'));

  const employeeBlocked = svc.generateImportPreview(payload, { actor: { id: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeBlocked.success, false, 'employees must not access bulk import');
  assert.ok(employeeBlocked.failures.some(item => item.code === 'ROLE_IMPORT_ACCESS_BLOCKED'));

  const platformOwnerBlocked = svc.approveImportPreview({ previewId: xlsxPreview.previewId, tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons' });
  assert.equal(platformOwnerBlocked.success, false, 'platform owner has governance visibility but cannot approve tenant imports');
  assert.ok(platformOwnerBlocked.failures.some(item => item.code === 'PLATFORM_OWNER_VISIBILITY_ONLY'));

  const malformed = svc.generateImportPreview('bad-payload', context);
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed output must be immutable');

  const empty = svc.generateImportPreview({ tenantSlug: 'tabsons', fileName: 'empty.csv', fileType: 'CSV', fileContent: '' }, context);
  assert.equal(empty.success, false, 'empty files should be rejected safely');
  assert.ok(empty.failures.some(item => item.code === 'EMPTY_IMPORT_FILE'));

  const unsupported = svc.uploadEmployeeFile({ tenantSlug: 'tabsons', fileName: 'employees.pdf', fileType: 'PDF', fileContent: 'x' }, context);
  assert.equal(unsupported.success, false, 'unsupported file types should be blocked');
  assert.ok(unsupported.failures.some(item => item.code === 'UNSUPPORTED_IMPORT_FILE_TYPE'));

  const previousAudit = global.AuditService;
  const previousTelemetry = global.WorkflowTelemetryService;
  const previousPipeline = global.ImportPipelineService;
  const previousOnboarding = global.EmployeeOnboardingService;
  global.AuditService = undefined;
  global.WorkflowTelemetryService = undefined;
  global.ImportPipelineService = undefined;
  global.EmployeeOnboardingService = undefined;
  const degraded = svc.generateImportPreview({ tenantSlug: 'tabsons', fileName: 'employees.xls', fileType: 'XLS', rows: safeRows }, context);
  assert.equal(degraded.success, true, 'optional dependency absence should degrade safely');
  assert.equal(degraded.integrationHealth.auditIntegrated, false);
  assert.equal(degraded.integrationHealth.importPipelineIntegrated, false);
  assert.equal(degraded.integrationHealth.employeeOnboardingIntegrated, false);
  global.AuditService = previousAudit;
  global.WorkflowTelemetryService = previousTelemetry;
  global.ImportPipelineService = previousPipeline;
  global.EmployeeOnboardingService = previousOnboarding;

  const data = global.DB.get();
  assert.ok(data.employeeBulkImportHistory.length >= 1, 'import history should be recorded immutably');
  assert.ok(data.employeeBulkImportPreviewHistory.length >= 1, 'preview history should be recorded immutably');
  assert.ok(data.employeeBulkImportReviewHistory.length >= 1, 'review history should be recorded immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /EMPLOYEE_BULK_IMPORT_/.test(row.actionType || row.action || '')), 'bulk import actions should be audited');
}

main();
