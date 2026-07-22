const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

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
  global.navigator = { userAgent: 'Node employee master import test', platform: 'Win32' };
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

function seedEmployeeMigrationData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.departments = [
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-OPS', name: 'Operations', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ABC-FIN', name: 'Finance', tenantSlug: 'abc', active: true }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'DEP-HR', departmentName: 'HR', tenantSlug: 'tabsons', active: true },
    { departmentId: 'DEP-OPS', departmentName: 'Operations', tenantSlug: 'tabsons', active: true },
    { departmentId: 'DEP-ENG', departmentName: 'Engineering', tenantSlug: 'tabsons', active: true }
  ];
  data.companyLocations = [
    { locationId: 'LOC-BLR', locationName: 'Bengaluru', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-MUM', locationName: 'Mumbai', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-ABC', locationName: 'ABC HQ', tenantSlug: 'abc', active: true }
  ];
  data.employees = [
    { id: 'EMP-100', empId: 'EMP-100', employeeId: 'EMP-100', employeeCode: 'EMP-100', name: 'Existing Employee', firstName: 'Existing', lastName: 'Employee', email: 'existing@example.com', phone: '+919000000100', role: 'EMPLOYEE', department: 'Operations', designation: 'Analyst', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', employeeCode: 'MGR-1', name: 'Manager One', firstName: 'Manager', lastName: 'One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'MGR-INACTIVE', empId: 'MGR-INACTIVE', employeeId: 'MGR-INACTIVE', email: 'inactive.manager@example.com', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'TERMINATED' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', employeeCode: 'ABC-1', name: 'ABC Confidential Employee', email: 'abc@example.com', phone: '+919000009999', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 999999, leaveBalance: 44, privateNote: 'ABC confidential' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-100', date: '2026-07-01', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-100', fromDate: '2026-07-02', toDate: '2026-07-03', status: 'APPROVED', reason: 'private family note' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-1', tenantSlug: 'tabsons', period: '2026-07', gross: 100000, net: 85000 }
  ];
  data.employeeMasterImportBatches = [];
  data.employeeMasterImportCheckpoints = [];
  data.employeeMasterImportSnapshots = [];
  data.employeeMasterImportRollbackHistory = [];
  data.employeeMasterImportAnalytics = [];
  data.employeeMasterImportMappingTemplates = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function csvPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    fileName: 'legacy-employees.csv',
    fileType: 'CSV',
    conflictStrategy: 'MERGE',
    fileContent: [
      'Emp No,First Name,Last Name,Mail ID,Phone,Department,Designation,Reporting Manager,Branch,Location,Date of Joining,DOB,Employment Type,Status,Cost Center,Bank Account,Tax ID',
      'EMP-200,Asha,Rao,asha.rao@example.com,+918765432101,Operations,Analyst,MGR-1,Mumbai,Mumbai,2026-07-10,1994-04-12,Full Time,ACTIVE,OPS-A,111111111,AAAAA1111A',
      'EMP-201,Ravi,Shah,ravi.shah@example.com,+918765432102,Engineering,Engineer,MGR-1,Bengaluru,Bengaluru,2026-07-11,1993-02-20,Full Time,ACTIVE,ENG-A,222222222,BBBBB2222B',
      'EMP-201,Duplicate,Code,dup.code@example.com,+918765432103,Engineering,Engineer,MGR-1,Bengaluru,Bengaluru,2026-07-12,1993-02-20,Full Time,ACTIVE,ENG-A,333333333,CCCCC3333C',
      'EMP-202,NoEmail,User,,+918765432104,HR,Coordinator,MGR-1,Bengaluru,Bengaluru,2026-07-13,1995-02-20,Full Time,ACTIVE,HR-A,444444444,DDDDD4444D',
      'EMP-203,BadDept,User,baddept@example.com,+918765432105,Unknown,Engineer,MGR-1,Bengaluru,Bengaluru,2026-07-14,1995-02-20,Full Time,ACTIVE,ENG-A,555555555,EEEEE5555E',
      'EMP-204,InactiveManager,User,inactive.manager.user@example.com,+918765432106,Engineering,Engineer,MGR-INACTIVE,Bengaluru,Bengaluru,2026-07-15,1995-02-20,Full Time,ACTIVE,ENG-A,666666666,FFFFF6666F',
      'EMP-205,BadDate,User,baddate@example.com,+918765432107,Engineering,Engineer,MGR-1,Bengaluru,Bengaluru,not-a-date,1995-02-20,Full Time,ACTIVE,ENG-A,777777777,GGGGG7777G',
      'EMP-100,Existing,Updated,existing@example.com,+918765432108,Operations,Senior Analyst,MGR-1,Mumbai,Mumbai,2020-01-01,1990-01-01,Full Time,ACTIVE,OPS-A,888888888,HHHHH8888H'
    ].join('\n'),
    metadata: { sourceSystem: 'Legacy HRMS', rawPayload: 'salary 999999 leaveBalance 44 bank account' },
    ...overrides
  };
}

function safeRows() {
  return [
    { employeeId: 'EMP-300', employeeCode: 'EMP-300', firstName: 'Mina', lastName: 'Roy', email: 'mina.roy@example.com', phone: '+918765432201', department: 'HR', designation: 'Coordinator', manager: 'MGR-1', location: 'Bengaluru', dateOfJoining: '2026-08-01', dob: '1995-03-03', employmentType: 'Full Time', employmentStatus: 'ACTIVE', costCenter: 'HR-A' },
    { employeeId: 'EMP-301', employeeCode: 'EMP-301', firstName: 'Dev', lastName: 'Mehta', email: 'dev.mehta@example.com', phone: '+918765432202', department: 'Engineering', designation: 'Engineer', manager: 'MGR-1', location: 'Bengaluru', dateOfJoining: '2026-08-02', dob: '1996-04-04', employmentType: 'Full Time', employmentStatus: 'ACTIVE', costCenter: 'ENG-A' }
  ];
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
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/employeeBulkImportService.js',
    'services/employeeStatusLifecycleService.js'
  ].forEach(load);
  seedEmployeeMigrationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeMasterImportService.js');

  const svc = global.EmployeeMasterImportService;
  assert.ok(svc, 'EmployeeMasterImportService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.IMPORT_STATES), 'import states must be immutable');
  assert.ok(Object.isFrozen(svc.SUPPORTED_SOURCES), 'supported sources must be immutable');
  assert.equal(global.__ARTHHRMS_EMPLOYEE_MASTER_IMPORT_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'detectImportFormat',
    'normalizeImportPayload',
    'mapEmployeeColumns',
    'validateEmployeeRecords',
    'detectDuplicateEmployees',
    'resolveImportConflicts',
    'runDryRun',
    'executeImport',
    'resumeImport',
    'rollbackImport',
    'generateMigrationAnalytics',
    'generateMigrationDashboard',
    'freezeEmployeeImportOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.EmployeeImportService, svc, 'EmployeeImportService alias should be available');
  assert.equal(global.EmployeeValidator, svc, 'EmployeeValidator alias should be available');
  assert.equal(global.ColumnMapper, svc, 'ColumnMapper alias should be available');
  assert.equal(global.DuplicateDetector, svc, 'DuplicateDetector alias should be available');
  assert.equal(global.ConflictResolver, svc, 'ConflictResolver alias should be available');
  assert.equal(global.ImportExecutor, svc, 'ImportExecutor alias should be available');
  assert.equal(global.RollbackManager, svc, 'RollbackManager alias should be available');
  assert.equal(global.MigrationAnalyticsService, svc, 'MigrationAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-100', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    payrollRuns: global.DB.get().payrollRuns
  });
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const format = svc.detectImportFormat(csvPayload(), hrContext);
  assert.equal(format.success, true, 'CSV format detection should work');
  assert.equal(format.format, 'CSV');
  assert.equal(format.streamingSupported, true);

  const normalized = svc.normalizeImportPayload(csvPayload(), hrContext);
  assert.equal(normalized.success, true, 'CSV payload should normalize');
  assert.equal(normalized.records.length, 8);
  assert.doesNotMatch(text(normalized), /999999|leaveBalance|rawPayload|bank account|ABC confidential/i, 'normalized output must redact sensitive and cross-tenant content');

  const mapping = svc.mapEmployeeColumns(csvPayload(), hrContext);
  assert.equal(mapping.success, true, 'column mapping should work');
  assert.equal(mapping.mapping['Emp No'], 'employeeCode');
  assert.equal(mapping.mapping['Mail ID'], 'email');
  assert.equal(mapping.mapping['Reporting Manager'], 'manager');

  const validation = svc.validateEmployeeRecords(csvPayload(), hrContext);
  assert.equal(validation.success, false, 'mixed CSV should have validation errors');
  assert.equal(validation.summary.totalRecords, 8);
  assert.equal(validation.summary.validRecords, 3);
  assert.ok(validation.issues.some(issue => issue.code === 'MISSING_REQUIRED_FIELD'), 'missing email should be detected');
  assert.ok(validation.issues.some(issue => issue.code === 'DEPARTMENT_NOT_FOUND'), 'unknown departments should be detected');
  assert.ok(validation.issues.some(issue => issue.code === 'INACTIVE_MANAGER'), 'inactive managers should be detected');
  assert.ok(validation.issues.some(issue => issue.code === 'INVALID_JOIN_DATE'), 'bad join dates should be detected');

  const duplicates = svc.detectDuplicateEmployees(csvPayload(), hrContext);
  assert.equal(duplicates.success, true, 'duplicate detection should complete');
  assert.ok(duplicates.summary.duplicateEmployeeCodes >= 2, 'file and existing employee code duplicates should be counted');
  assert.ok(duplicates.summary.duplicateEmails >= 1, 'existing duplicate emails should be counted');
  assert.ok(duplicates.duplicates.some(row => row.matchType === 'EXISTING_EMPLOYEE_CODE'));
  assert.ok(duplicates.duplicates.some(row => row.matchType === 'FILE_EMPLOYEE_CODE'));

  const conflicts = svc.resolveImportConflicts(csvPayload({ conflictStrategy: 'SKIP' }), hrContext);
  assert.equal(conflicts.success, true, 'conflict resolution should complete');
  assert.ok(conflicts.resolutions.some(row => row.action === 'SKIP'));

  const dryRun = svc.runDryRun(csvPayload(), hrContext);
  assert.equal(dryRun.success, true, 'dry run should generate a report even with risks');
  assert.equal(dryRun.readOnly, true);
  assert.equal(dryRun.summary.totalRecords, 8);
  assert.equal(dryRun.summary.validRecords, 3);
  assert.ok(dryRun.summary.duplicates >= 3);
  assert.ok(dryRun.estimatedImportTimeMs > 0);
  assert.ok(dryRun.riskScore > 0);
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'dry run must not mutate employees');
  assert.ok(Object.isFrozen(dryRun), 'dry run output must be immutable');
  assert.doesNotMatch(text(dryRun), /999999|leaveBalance|ABC-1|abc@example.com|bankAccount|taxId|private family note/i, 'dry run must be sanitized and tenant scoped');

  const safePayload = { tenantSlug: 'tabsons', fileName: 'safe-employees.json', fileType: 'JSON', records: safeRows(), conflictStrategy: 'CREATE_NEW' };
  const safeDryRun = svc.runDryRun(safePayload, hrContext);
  assert.equal(safeDryRun.success, true);
  assert.equal(safeDryRun.summary.validRecords, 2);
  assert.equal(safeDryRun.summary.invalidRecords, 0);

  const execution = svc.executeImport(safePayload, hrContext);
  assert.equal(execution.success, true, 'safe import should execute');
  assert.equal(execution.summary.importedEmployees, 2);
  assert.equal(execution.summary.updatedEmployees, 0);
  assert.equal(execution.transaction.committed, true);
  assert.ok(execution.transaction.checkpointId, 'execution should create a checkpoint');
  assert.ok(execution.transaction.snapshotId, 'execution should create a rollback snapshot');
  assert.equal(global.DB.get().employees.some(row => row.employeeId === 'EMP-300' && row.tenantSlug === 'tabsons'), true, 'new employee should be imported');
  assert.equal(global.DB.get().employees.some(row => row.employeeId === 'ABC-1' && row.tenantSlug === 'tabsons'), false, 'tenant B employee must not cross into tenant A');

  const updateExecution = svc.executeImport({
    tenantSlug: 'tabsons',
    fileName: 'update-existing.json',
    fileType: 'JSON',
    records: [{ employeeId: 'EMP-100', employeeCode: 'EMP-100', firstName: 'Existing', lastName: 'Employee', email: 'existing@example.com', department: 'Operations', designation: 'Principal Analyst', manager: 'MGR-1', dateOfJoining: '2020-01-01', employmentStatus: 'ACTIVE' }],
    conflictStrategy: 'OVERWRITE'
  }, hrContext);
  assert.equal(updateExecution.success, true, 'overwrite imports should update existing employees');
  assert.equal(updateExecution.summary.updatedEmployees, 1);
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-100').designation, 'Principal Analyst');

  const resume = svc.resumeImport({ tenantSlug: 'tabsons', importId: execution.importId }, hrContext);
  assert.equal(resume.success, true, 'resume should find latest checkpoint');
  assert.equal(resume.resumeState, 'COMPLETED');

  const rollbackUpdate = svc.rollbackImport({ tenantSlug: 'tabsons', importId: updateExecution.importId, reason: 'Rollback update test' }, directorContext);
  assert.equal(rollbackUpdate.success, true, 'rollback should restore updated employee state');
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-100').designation, 'Analyst');

  const rollback = svc.rollbackImport({ tenantSlug: 'tabsons', importId: execution.importId, reason: 'Rollback migration test' }, directorContext);
  assert.equal(rollback.success, true, 'rollback should remove created employees');
  assert.equal(rollback.rollback.removedEmployees, 2);
  assert.equal(global.DB.get().employees.some(row => row.employeeId === 'EMP-300'), false);
  assert.equal(global.DB.get().employees.some(row => row.employeeId === 'EMP-301'), false);

  const analytics = svc.generateMigrationAnalytics({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(analytics.success, true, 'analytics should generate');
  assert.ok(analytics.analytics.rollbackEvents >= 2);
  assert.ok(analytics.migrationHealthScore >= 0);
  assert.ok(analytics.dataQualityScore >= 0);
  assert.ok(analytics.importSuccessRate >= 0);

  const dashboard = svc.generateMigrationDashboard({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.importQueue.length >= 1);
  assert.ok(dashboard.rollbackHistory.length >= 2);
  assert.equal(dashboard.compatibility.employeeModulePreserved, true);
  assert.equal(dashboard.compatibility.attendanceModulePreserved, true);
  assert.equal(dashboard.compatibility.leaveModulePreserved, true);
  assert.equal(dashboard.compatibility.payrollCalculationsUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC Confidential|abc@example.com|salary|leaveBalance|bankAccount|taxId|private family note/i);

  const employeeBlocked = svc.runDryRun(csvPayload(), employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot run master imports');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'EMPLOYEE_IMPORT_ACCESS_DENIED'));

  const crossTenant = svc.runDryRun(csvPayload({ tenantSlug: 'abc' }), hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant imports must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_EMPLOYEE_IMPORT_BLOCKED'));

  const unsupported = svc.runDryRun(csvPayload({ fileName: 'employees.pdf', fileType: 'PDF' }), hrContext);
  assert.equal(unsupported.success, false, 'unsupported sources must be blocked');
  assert.ok(unsupported.issues.some(issue => issue.code === 'UNSUPPORTED_EMPLOYEE_IMPORT_SOURCE'));

  assert.equal(JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    payrollRuns: global.DB.get().payrollRuns
  }), beforeProtected, 'employee migration must not mutate attendance, leave, or payroll records');

  assert.ok(global.DB.getAuditLogs().some(row => /EMPLOYEE_MASTER_IMPORT|EMPLOYEE_IMPORT|EMPLOYEE_MIGRATION_ROLLBACK/.test(row.actionType || row.action || '')), 'migration actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /EMPLOYEE_MASTER_IMPORT|EMPLOYEE_IMPORT|EMPLOYEE_MIGRATION_ROLLBACK/.test(row.eventType || row.category || '')), 'migration telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.EMPLOYEE_MASTER_IMPORT_EXECUTED, 'migration metrics should aggregate safely');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'employee-migration-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Employee Migration Center dashboard page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Employee Migration Center/i);
  assert.match(dashboardHtml, /Duplicate Review/i);
  assert.match(dashboardHtml, /Rollback History/i);
  assert.match(dashboardHtml, /EmployeeMasterImportService/i);

  console.log('employeeMasterImportService.test.js passed');
}

main();
