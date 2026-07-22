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
  global.navigator = { userAgent: 'Node employee data validation test', platform: 'Win32' };
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

function seedEmployeeQualityData() {
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
    { id: 'DEP-LEAD', name: 'Leadership', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ABC', name: 'Finance', tenantSlug: 'abc', active: true }
  ];
  data.companyBranches = [
    { branchId: 'BR-MUM', branchName: 'Mumbai', tenantSlug: 'tabsons', active: true },
    { branchId: 'BR-BLR', branchName: 'Bengaluru', tenantSlug: 'tabsons', active: true },
    { branchId: 'BR-ABC', branchName: 'ABC HQ', tenantSlug: 'abc', active: true }
  ];
  data.companyLocations = [
    { locationId: 'LOC-MUM', locationName: 'Mumbai', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-BLR', locationName: 'Bengaluru', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-ABC', locationName: 'ABC HQ', tenantSlug: 'abc', active: true }
  ];
  data.businessUnits = [
    { businessUnitId: 'BU-ENG', name: 'Engineering BU', tenantSlug: 'tabsons', active: true }
  ];
  data.costCenters = [
    { costCenterId: 'CC-ENG', code: 'ENG-A', name: 'Engineering Cost Center', tenantSlug: 'tabsons', active: true }
  ];
  data.designations = [
    { designationId: 'DES-ENG', name: 'Engineer', tenantSlug: 'tabsons', active: true },
    { designationId: 'DES-MGR', name: 'Manager', tenantSlug: 'tabsons', active: true },
    { designationId: 'DES-DIR', name: 'Director', tenantSlug: 'tabsons', active: true },
    { designationId: 'DES-CEO', name: 'CEO', tenantSlug: 'tabsons', active: true }
  ];
  data.leavePolicies = [
    { policyId: 'LP-ENG', tenantSlug: 'tabsons', department: 'Engineering', status: 'ACTIVE' }
  ];
  data.attendancePolicies = [
    { policyId: 'ATT-ENG', tenantSlug: 'tabsons', department: 'Engineering', status: 'ACTIVE' }
  ];
  data.documents = [
    { documentId: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'EMP-100', documentType: 'PAN', status: 'VERIFIED' }
  ];
  data.employees = [
    { id: 'CEO-1', empId: 'CEO-1', employeeId: 'CEO-1', employeeCode: 'CEO-1', name: 'Ada CEO', firstName: 'Ada', lastName: 'CEO', email: 'ada.ceo@example.com', phone: '+919800000001', role: 'DIRECTOR', designation: 'CEO', department: 'Leadership', branch: 'Mumbai', location: 'Mumbai', businessUnit: 'Engineering BU', costCenter: 'ENG-A', managerId: '', dob: '1980-01-01', dateOfJoining: '2015-01-01', confirmationDate: '2015-07-01', pan: 'ABCDE1234F', aadhaar: '123456789012', passport: 'A1234567', bankAccount: '123456789012', ifsc: 'SBIN0001234', taxId: 'TAX-CEO', salaryGrade: 'G10', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', employeeCode: 'DIR-1', name: 'Divya Director', firstName: 'Divya', lastName: 'Director', email: 'divya.director@example.com', phone: '+919800000002', role: 'DIRECTOR', designation: 'Director', department: 'Engineering', branch: 'Mumbai', location: 'Mumbai', businessUnit: 'Engineering BU', costCenter: 'ENG-A', managerId: 'CEO-1', dob: '1985-02-02', dateOfJoining: '2018-01-01', confirmationDate: '2018-07-01', pan: 'BCDEF2345G', aadhaar: '123456789013', passport: 'B1234567', bankAccount: '123456789013', ifsc: 'SBIN0001234', taxId: 'TAX-DIR', salaryGrade: 'G9', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', employeeCode: 'MGR-1', name: 'Mohan Manager', firstName: 'Mohan', lastName: 'Manager', email: 'mohan.manager@example.com', phone: '+919800000003', role: 'MANAGER', designation: 'Manager', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', businessUnit: 'Engineering BU', costCenter: 'ENG-A', managerId: 'DIR-1', dob: '1990-03-03', dateOfJoining: '2019-01-01', confirmationDate: '2019-07-01', pan: 'CDEFG3456H', aadhaar: '123456789014', passport: 'C1234567', bankAccount: '123456789014', ifsc: 'SBIN0001234', taxId: 'TAX-MGR', salaryGrade: 'G8', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-100', empId: 'EMP-100', employeeId: 'EMP-100', employeeCode: 'EMP-100', name: 'Asha Rao', firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@example.com', phone: '+919800000004', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', businessUnit: 'Engineering BU', costCenter: 'ENG-A', managerId: 'MGR-1', dob: '1994-04-04', dateOfJoining: '2020-01-01', confirmationDate: '2020-07-01', pan: 'DEFGH4567I', aadhaar: '123456789015', passport: 'D1234567', bankAccount: '123456789015', ifsc: 'SBIN0001234', taxId: 'TAX-100', salaryGrade: 'G5', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DUP-1', empId: 'DUP-1', employeeId: 'DUP-1', employeeCode: 'DUP-CODE', name: 'Deepak Duplicate', firstName: 'Deepak', lastName: 'Duplicate', email: 'duplicate@example.com', phone: '+919800000005', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'MGR-1', dob: '1992-05-05', dateOfJoining: '2021-01-01', pan: 'EEEEE1111E', aadhaar: '223456789015', passport: 'E1234567', bankAccount: '223456789015', ifsc: 'SBIN0001234', salaryGrade: 'G5', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DUP-2', empId: 'DUP-2', employeeId: 'DUP-2', employeeCode: 'DUP-CODE', name: 'Deepak Duplication', firstName: 'Deepak', lastName: 'Duplication', email: 'duplicate@example.com', phone: '+919800000006', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'MGR-1', dob: '1992-05-06', dateOfJoining: '2021-02-01', pan: 'EEEEE1111E', aadhaar: '223456789016', passport: 'E1234568', bankAccount: '223456789015', ifsc: 'SBIN0001234', salaryGrade: 'G5', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'BAD-1', empId: 'BAD-1', employeeId: 'BAD-1', employeeCode: 'BAD-1', name: '', firstName: '', lastName: 'Broken', email: '', phone: 'bad-phone', role: 'EMPLOYEE', designation: 'Unknown Role', department: 'Unknown Department', branch: 'Unknown Branch', location: 'Unknown City', businessUnit: 'Missing BU', costCenter: 'MISSING-CC', managerId: 'MISSING-MGR', dob: '2030-01-01', dateOfJoining: '2027-01-01', confirmationDate: '2026-01-01', pan: 'BADPAN', aadhaar: '1234', passport: 'bad', bankAccount: 'abc', ifsc: 'BADIFSC', taxId: '', salaryGrade: '', salary: -100, employmentStatus: 'MYSTERY', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'INACTIVE-MGR', empId: 'INACTIVE-MGR', employeeId: 'INACTIVE-MGR', employeeCode: 'INACTIVE-MGR', name: 'Inactive Manager', firstName: 'Inactive', lastName: 'Manager', email: 'inactive.manager@example.com', phone: '+919800000007', role: 'MANAGER', designation: 'Manager', department: 'Engineering', managerId: 'DIR-1', employmentStatus: 'TERMINATED', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-INACTIVE-MGR', empId: 'EMP-INACTIVE-MGR', employeeId: 'EMP-INACTIVE-MGR', employeeCode: 'EMP-INACTIVE-MGR', name: 'Inactive Managed', firstName: 'Inactive', lastName: 'Managed', email: 'inactive.managed@example.com', phone: '+919800000008', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'INACTIVE-MGR', dob: '1992-01-01', dateOfJoining: '2020-01-01', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'CYCLE-A', empId: 'CYCLE-A', employeeId: 'CYCLE-A', employeeCode: 'CYCLE-A', name: 'Cycle A', firstName: 'Cycle', lastName: 'A', email: 'cycle.a@example.com', phone: '+919800000009', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'CYCLE-B', dob: '1993-01-01', dateOfJoining: '2020-01-01', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'CYCLE-B', empId: 'CYCLE-B', employeeId: 'CYCLE-B', employeeCode: 'CYCLE-B', name: 'Cycle B', firstName: 'Cycle', lastName: 'B', email: 'cycle.b@example.com', phone: '+919800000010', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'CYCLE-A', dob: '1993-01-02', dateOfJoining: '2020-01-01', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', employeeCode: 'ABC-1', name: 'ABC Confidential Employee', firstName: 'ABC', lastName: 'Employee', email: 'abc@example.com', phone: '+919899999999', role: 'EMPLOYEE', designation: 'Analyst', department: 'Finance', managerId: '', salary: 999999, leaveBalance: 40, privateNote: 'ABC confidential quality', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-1', tenantSlug: 'tabsons', period: '2026-07', gross: 100000, net: 85000 }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-100', date: '2026-07-10', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-100', status: 'APPROVED', fromDate: '2026-07-10', toDate: '2026-07-11' }
  ];
  data.reportingHierarchyRelationships = [
    { relationshipId: 'REL-1', tenantSlug: 'tabsons', employeeId: 'EMP-100', managerId: 'MGR-1', relationshipType: 'DIRECT_MANAGER', active: true }
  ];
  data.employeeDataValidationRuns = [];
  data.employeeDataQualityReports = [];
  data.employeeDataValidationAnalytics = [];
  data.employeeDataQualityRecommendations = [];
  data.auditLogs = [];
  global.DB.save(data);
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
    'services/employeeMasterImportService.js',
    'services/managerHierarchyService.js',
    'services/reportingHierarchyService.js'
  ].forEach(load);
  seedEmployeeQualityData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeDataValidationService.js');

  const svc = global.EmployeeDataValidationService;
  assert.ok(svc, 'EmployeeDataValidationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.VALIDATION_DOMAINS), 'validation domains must be immutable');
  assert.equal(global.__ARTHHRMS_EMPLOYEE_DATA_VALIDATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'validateEmployeeFields',
    'validateEmployeeRelationships',
    'validateBusinessRules',
    'detectEmployeeDuplicates',
    'calculateEmployeeQualityScore',
    'generateValidationReport',
    'generateBulkFixSuggestions',
    'generateDataQualityAnalytics',
    'generateQualityDashboard',
    'freezeValidationOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.EmployeeValidationService, svc, 'EmployeeValidationService alias should be available');
  assert.equal(global.RelationshipValidator, svc, 'RelationshipValidator alias should be available');
  assert.equal(global.BusinessRuleValidator, svc, 'BusinessRuleValidator alias should be available');
  assert.equal(global.DuplicateAnalysisService, svc, 'DuplicateAnalysisService alias should be available');
  assert.equal(global.QualityScoringService, svc, 'QualityScoringService alias should be available');
  assert.equal(global.ValidationReportGenerator, svc, 'ValidationReportGenerator alias should be available');
  assert.equal(global.DataQualityAnalyticsService, svc, 'DataQualityAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-100', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    employees: global.DB.get().employees,
    payrollRuns: global.DB.get().payrollRuns,
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    reportingHierarchyRelationships: global.DB.get().reportingHierarchyRelationships
  });

  const fields = svc.validateEmployeeFields({ tenantSlug: 'tabsons', employeeId: 'BAD-1' }, hrContext);
  assert.equal(fields.success, false, 'bad employee field validation should fail');
  assert.ok(fields.issues.some(issue => issue.code === 'MISSING_REQUIRED_FIELD'));
  assert.ok(fields.issues.some(issue => issue.code === 'INVALID_PHONE_FORMAT'));
  assert.ok(fields.issues.some(issue => issue.code === 'INVALID_DOB'));
  assert.ok(fields.issues.some(issue => issue.code === 'INVALID_PAN'));
  assert.ok(fields.issues.some(issue => issue.code === 'INVALID_AADHAAR'));
  assert.ok(fields.issues.some(issue => issue.code === 'INVALID_IFSC'));
  assert.ok(Object.isFrozen(fields), 'field validation output must be immutable');

  const relationships = svc.validateEmployeeRelationships({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(relationships.success, false, 'relationship validation should detect broken dependencies');
  assert.ok(relationships.issues.some(issue => issue.code === 'DEPARTMENT_NOT_FOUND'));
  assert.ok(relationships.issues.some(issue => issue.code === 'BRANCH_NOT_FOUND'));
  assert.ok(relationships.issues.some(issue => issue.code === 'LOCATION_NOT_FOUND'));
  assert.ok(relationships.issues.some(issue => issue.code === 'MANAGER_NOT_FOUND'));
  assert.ok(relationships.issues.some(issue => issue.code === 'INACTIVE_MANAGER'));
  assert.ok(relationships.issues.some(issue => issue.code === 'CIRCULAR_REPORTING'));

  const business = svc.validateBusinessRules({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(business.success, false, 'business rule validation should detect violations');
  assert.ok(business.issues.some(issue => issue.code === 'FUTURE_JOINING_DATE'));
  assert.ok(business.issues.some(issue => issue.code === 'NEGATIVE_SALARY'));
  assert.ok(business.issues.some(issue => issue.code === 'INVALID_EMPLOYMENT_STATUS'));
  assert.ok(business.issues.some(issue => issue.code === 'CONFIRMATION_BEFORE_JOINING'));
  assert.ok(business.issues.some(issue => issue.code === 'MISSING_LEAVE_POLICY'));

  const duplicates = svc.detectEmployeeDuplicates({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(duplicates.success, true, 'duplicate detection should complete');
  assert.ok(duplicates.summary.duplicateEmployeeCodes >= 1);
  assert.ok(duplicates.summary.duplicateEmails >= 1);
  assert.ok(duplicates.summary.duplicatePan >= 1);
  assert.ok(duplicates.summary.duplicateBankAccounts >= 1);
  assert.ok(duplicates.summary.fuzzyNameMatches >= 1);
  assert.ok(duplicates.manualReviewQueue.length >= 1);
  assert.doesNotMatch(text(duplicates), /ABC Confidential|abc@example.com|999999|leaveBalance|private/i, 'duplicate output must be tenant scoped and sanitized');

  const goodScore = svc.calculateEmployeeQualityScore({ tenantSlug: 'tabsons', employeeId: 'EMP-100' }, hrContext);
  const badScore = svc.calculateEmployeeQualityScore({ tenantSlug: 'tabsons', employeeId: 'BAD-1' }, hrContext);
  assert.equal(goodScore.success, true);
  assert.equal(badScore.success, true);
  assert.ok(goodScore.qualityScore > badScore.qualityScore, 'clean employee should score higher than broken employee');
  assert.ok(badScore.dimensions.completeness < 100);
  assert.ok(badScore.dimensions.integrity < 100);

  const report = svc.generateValidationReport({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(report.success, true, 'validation report should generate even with errors');
  assert.equal(report.readOnly, true);
  assert.equal(report.nonDestructive, true);
  assert.equal(report.autoCorrectionsApplied, false);
  assert.equal(report.summary.totalEmployees, 11);
  assert.ok(report.summary.criticalErrors >= 1);
  assert.ok(report.summary.warnings >= 1);
  assert.ok(report.summary.duplicateRecords >= 1);
  assert.ok(report.criticalErrors.some(issue => issue.code === 'CIRCULAR_REPORTING'));
  assert.ok(report.duplicateRecords.length >= 1);
  assert.ok(report.relationshipIssues.length >= 1);
  assert.ok(report.policyViolations.length >= 1);
  assert.ok(report.perEmployeeQuality.some(row => row.employeeId === 'BAD-1' && row.qualityScore < 100));
  assert.ok(report.scores.dataQualityScore < 100);
  assert.ok(report.scores.migrationReadinessScore < 100);
  assert.ok(report.scores.goLiveReadinessScore < 100);
  assert.ok(Object.isFrozen(report), 'report output must be immutable');
  assert.doesNotMatch(text(report), /ABC Confidential|abc@example.com|999999|leaveBalance|password|private/i, 'report must redact sensitive and cross-tenant data');

  const suggestions = svc.generateBulkFixSuggestions({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(suggestions.success, true, 'bulk fix suggestions should generate');
  assert.equal(suggestions.autoApply, false);
  assert.ok(suggestions.recommendations.some(row => row.action === 'MERGE_DUPLICATES'));
  assert.ok(suggestions.recommendations.some(row => row.action === 'ASSIGN_MISSING_MANAGER'));
  assert.ok(suggestions.recommendations.some(row => row.action === 'ASSIGN_DEPARTMENT'));
  assert.ok(suggestions.recommendations.some(row => row.action === 'CORRECT_FORMAT'));
  assert.ok(suggestions.recommendations.some(row => row.action === 'NORMALIZE_PHONE'));
  assert.ok(suggestions.recommendations.some(row => row.action === 'NORMALIZE_EMAIL'));

  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    payrollRuns: global.DB.get().payrollRuns,
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    reportingHierarchyRelationships: global.DB.get().reportingHierarchyRelationships
  }), beforeProtected, 'validation must not mutate employee, payroll, attendance, leave, or reporting records');

  const analytics = svc.generateDataQualityAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'analytics should generate');
  assert.ok(analytics.analytics.validationRuns >= 1);
  assert.ok(analytics.analytics.duplicateCount >= 1);
  assert.ok(analytics.dataQualityScore >= 0);
  assert.ok(analytics.migrationReadinessScore >= 0);
  assert.ok(analytics.goLiveReadinessScore >= 0);

  const dashboard = svc.generateQualityDashboard({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.validationSummary.totalEmployees >= 1);
  assert.ok(dashboard.criticalIssues.length >= 1);
  assert.ok(dashboard.warnings.length >= 1);
  assert.ok(dashboard.duplicates.length >= 1);
  assert.ok(dashboard.relationshipErrors.length >= 1);
  assert.ok(dashboard.recommendedActions.length >= 1);
  assert.equal(dashboard.compatibility.employeeModulePreserved, true);
  assert.equal(dashboard.compatibility.payrollModulePreserved, true);
  assert.equal(dashboard.compatibility.attendanceModulePreserved, true);
  assert.equal(dashboard.compatibility.leaveModulePreserved, true);
  assert.equal(dashboard.compatibility.reportingModulePreserved, true);

  const employeeBlocked = svc.generateValidationReport({ tenantSlug: 'tabsons' }, employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot run enterprise validation');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'DATA_VALIDATION_ACCESS_DENIED'));

  const crossTenant = svc.generateValidationReport({ tenantSlug: 'abc' }, hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant validation must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_VALIDATION_BLOCKED'));

  assert.ok(global.DB.get().employeeDataValidationRuns.length >= 1, 'validation runs should be stored immutably');
  assert.ok(global.DB.get().employeeDataQualityReports.length >= 1, 'quality reports should be stored immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /EMPLOYEE_DATA_VALIDATION|DATA_QUALITY/.test(row.actionType || row.action || '')), 'validation actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /EMPLOYEE_DATA_VALIDATION|DATA_QUALITY/.test(row.eventType || row.category || '')), 'validation telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.EMPLOYEE_DATA_VALIDATION_RUN, 'validation metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'employee-data-quality-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Employee Data Quality Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Employee Data Quality Center/i);
  assert.match(dashboardHtml, /Critical Issues/i);
  assert.match(dashboardHtml, /Recommended Actions/i);
  assert.match(dashboardHtml, /EmployeeDataValidationService/i);

  console.log('employeeDataValidationService.test.js passed');
}

main();
