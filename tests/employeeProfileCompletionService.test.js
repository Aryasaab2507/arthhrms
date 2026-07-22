const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

function seedProfileData() {
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
  data.tenantDepartmentRecords = [
    { departmentId: 'COMPANY', tenantSlug: 'tabsons', departmentName: 'Tabsons Company', departmentCode: 'COMPANY', ownerId: 'DIR-1', parentDepartmentCode: '', state: 'ACTIVE', active: true },
    { departmentId: 'ENG', tenantSlug: 'tabsons', departmentName: 'Engineering', departmentCode: 'ENG', ownerId: 'MGR-1', parentDepartmentCode: 'COMPANY', state: 'ACTIVE', active: true },
    { departmentId: 'PEOPLE', tenantSlug: 'tabsons', departmentName: 'People', departmentCode: 'PEOPLE', ownerId: 'HR-1', parentDepartmentCode: 'COMPANY', state: 'ACTIVE', active: true },
    { departmentId: 'ABC-FIN', tenantSlug: 'abc', departmentName: 'ABC Finance', departmentCode: 'ABC-FIN', ownerId: 'ABC-1', parentDepartmentCode: '', state: 'ACTIVE', active: true }
  ];
  data.employees = [
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', firstName: 'Divya', lastName: 'Director', email: 'divya@example.com', role: 'director', department: 'Leadership', designation: 'Director', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: '', salary: 1_000_000 },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', firstName: 'Harini', lastName: 'HR', email: 'harini@example.com', role: 'HR', department: 'People', designation: 'HR Head', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'DIR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Mohan Manager', firstName: 'Mohan', lastName: 'Manager', email: 'mohan@example.com', role: 'manager', department: 'Engineering', designation: 'Manager', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'DIR-1' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', firstName: 'Esha', lastName: 'Engineer', email: 'esha@example.com', role: 'employee', department: 'Engineering', designation: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1', activationStatus: 'Active', authUserId: 'AUTH-1', privateNote: 'employee private' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Ravi Ops', firstName: 'Ravi', lastName: 'Ops', email: 'ravi@example.com', role: 'employee', department: 'Operations', designation: 'Analyst', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-2', activationStatus: 'Active' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', firstName: 'ABC', lastName: 'Employee', email: 'abc@example.com', role: 'employee', department: 'Finance', designation: 'Analyst', tenantSlug: 'abc', tenantId: 'TEN-abc', managerId: 'ABC-MGR', salary: 900_000, leaveBalance: 44, privateNote: 'ABC confidential profile' }
  ];
  data.employeeActivationRecords = [
    { activationId: 'ACT-EMP-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', email: 'esha@example.com', state: 'ACTIVE', profileCompletedAt: new Date().toISOString(), immutable: true }
  ];
  data.employeeBulkImportPreviewHistory = [
    { previewId: 'IMP-PREV-1', tenantSlug: 'tabsons', state: 'PREVIEW_READY', summary: { totalRows: 2, validRows: 2, invalidRows: 0 }, immutable: true }
  ];
  data.organizationInitializationRecords = [
    { initializationId: 'ORG-1', tenantSlug: 'tabsons', state: 'ACTIVE', readinessScore: 92, immutable: true }
  ];
  data.employeeProfileRecords = [];
  data.employeeProfileHistory = [];
  data.employeeProfileCompletionHistory = [];
  data.employeeProfileVerificationHistory = [];
  data.employeeProfileAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function completeProfile(overrides = {}) {
  return {
    employeeId: 'EMP-1',
    email: 'esha@example.com',
    basicInformation: {
      firstName: 'Esha',
      lastName: 'Engineer',
      preferredName: 'Esha',
      gender: 'Female',
      dateOfBirth: '1994-03-12'
    },
    contactInformation: {
      phone: '+919876543210',
      secondaryPhone: '+919876543211',
      address: '12 Business Park',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India'
    },
    emergencyContact: {
      name: 'Meera Engineer',
      relationship: 'Sister',
      contactNumber: '+919812341234'
    },
    workInformation: {
      employeeId: 'EMP-1',
      department: 'Engineering',
      designation: 'Engineer',
      manager: 'MGR-1'
    },
    verification: {
      workInformationReviewed: true,
      profileVerified: true
    },
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
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/employeeBulkImportService.js',
    'services/inviteMailDeliveryService.js',
    'services/employeeActivationWizardService.js',
    'services/tenantDepartmentSetupService.js',
    'services/organizationInitializationWizardService.js'
  ].forEach(load);
  seedProfileData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeProfileCompletionService.js');

  const svc = global.EmployeeProfileCompletionService;
  assert.ok(svc, 'EmployeeProfileCompletionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_EMPLOYEE_PROFILE_COMPLETION_SELF_TEST__.passed, true, 'development self-test should pass');

  ['calculateProfileCompletion', 'validateEmployeeProfile', 'generateReadinessReport', 'verifyProfileData', 'freezeProfileOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', email: 'esha@example.com', role: 'EMPLOYEE', department: 'Engineering' }, tenantSlug: 'tabsons' };
  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'People' }, tenantSlug: 'tabsons' };
  const managerContext = { actor: { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Engineering' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership' }, tenantSlug: 'tabsons' };
  const platformContext = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true };
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const calculated = svc.calculateProfileCompletion(completeProfile(), employeeContext);
  assert.equal(calculated.success, true, 'profile completion calculation should succeed');
  assert.equal(calculated.state, 'READY');
  assert.equal(calculated.completionPercentage, 100);
  assert.equal(calculated.missingRequiredFields.length, 0);
  assert.ok(calculated.profileQualityScore >= 90);
  assert.ok(calculated.identityReadinessScore >= 90);
  assert.ok(Object.isFrozen(calculated), 'calculation output must be immutable');
  assert.doesNotMatch(text(calculated), /salary|leaveBalance|privateNote|ABC confidential/i, 'calculation output must not expose confidential fields');

  const validation = svc.validateEmployeeProfile(completeProfile(), employeeContext);
  assert.equal(validation.success, true, 'complete employee profile should validate');
  assert.equal(validation.validation.valid, true);
  assert.equal(validation.state, 'READY');
  assert.equal(validation.onboardingReady, true);

  const verified = svc.verifyProfileData(completeProfile(), employeeContext);
  assert.equal(verified.success, true, 'employee can verify their own profile');
  assert.equal(verified.state, 'VERIFIED');
  assert.equal(verified.profile.employeeId, 'EMP-1');
  assert.equal(verified.workforceDirectoryReady, true);
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'profile completion must not corrupt employee master records');
  assert.doesNotMatch(text(verified), /salary|leaveBalance|privateNote|password/i, 'verified profile output must be sanitized');

  const incomplete = svc.validateEmployeeProfile(completeProfile({
    contactInformation: { phone: '123', city: 'Mumbai' },
    emergencyContact: { name: 'Meera Engineer', relationship: '', contactNumber: '' }
  }), employeeContext);
  assert.equal(incomplete.success, false, 'incomplete contact and emergency data should be blocked');
  assert.ok(incomplete.issues.some(issue => issue.code === 'INVALID_PHONE_FORMAT'));
  assert.ok(incomplete.issues.some(issue => issue.code === 'EMERGENCY_CONTACT_INCOMPLETE'));
  assert.ok(incomplete.missingRequiredFields.includes('emergencyContact.contactNumber'));

  const emailMismatch = svc.validateEmployeeProfile(completeProfile({ email: 'wrong@example.com' }), employeeContext);
  assert.equal(emailMismatch.success, false, 'email mismatch should be blocked');
  assert.ok(emailMismatch.issues.some(issue => issue.code === 'EMAIL_CONSISTENCY_FAILED'));

  const duplicateContact = svc.validateEmployeeProfile(completeProfile({
    contactInformation: { phone: '+919876543210', secondaryPhone: '+919876543210', address: '12 Business Park', city: 'Mumbai', state: 'Maharashtra', country: 'India' },
    emergencyContact: { name: 'Esha Engineer', relationship: 'Self', contactNumber: '+919876543210' }
  }), employeeContext);
  assert.equal(duplicateContact.success, false, 'duplicate contact records should be detected');
  assert.ok(duplicateContact.issues.some(issue => issue.code === 'DUPLICATE_CONTACT_RECORD'));

  const otherEmployee = svc.validateEmployeeProfile(completeProfile({ employeeId: 'EMP-2', email: 'ravi@example.com' }), employeeContext);
  assert.equal(otherEmployee.success, false, 'employees cannot validate another employee profile');
  assert.ok(otherEmployee.issues.some(issue => issue.code === 'PROFILE_OWNERSHIP_BLOCKED'));

  const managerReport = svc.generateReadinessReport({ tenantSlug: 'tabsons' }, managerContext);
  assert.equal(managerReport.success, true, 'manager can review team profile readiness');
  assert.ok(managerReport.profiles.every(row => row.managerId === 'MGR-1' || row.employeeId === 'MGR-1'), 'manager profile visibility should stay within team scope');
  assert.doesNotMatch(text(managerReport), /Ravi Ops|EMP-2|ABC Employee|900000|leaveBalance|ABC confidential/i, 'manager report must not leak non-team or cross-tenant data');

  const directorReport = svc.generateReadinessReport({ tenantSlug: 'tabsons', department: 'Engineering' }, directorContext);
  assert.equal(directorReport.success, true, 'director can review department profile readiness');
  assert.ok(directorReport.profiles.some(row => row.employeeId === 'EMP-1'), 'director department report should include department employee');
  assert.ok(!directorReport.profiles.some(row => row.employeeId === 'EMP-2'), 'director department report should not include other departments when filtered');

  const hrReport = svc.generateReadinessReport({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(hrReport.success, true, 'HR can review workforce profile readiness');
  assert.ok(hrReport.analytics.totalProfiles >= 1);
  assert.ok(hrReport.profileQualityScore >= 0);
  assert.ok(hrReport.workforceReadinessScore >= 0);
  assert.ok(hrReport.onboardingCompletionScore >= 0);
  assert.ok(hrReport.integrationReadiness.activationWizardIntegrated, 'activation wizard integration should be reported');
  assert.ok(hrReport.integrationReadiness.organizationDirectoryReady, 'organization directory readiness should be reported');
  assert.ok(Object.isFrozen(hrReport), 'readiness report output must be immutable');

  const platformReport = svc.generateReadinessReport({ tenantSlug: 'tabsons' }, platformContext);
  assert.equal(platformReport.success, true, 'platform owner can review profile governance');
  assert.equal(platformReport.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformReport.profiles.every(row => /^Governance Profile/.test(row.displayName)), 'platform owner profile rows should be anonymized');

  const crossTenant = svc.generateReadinessReport({ tenantSlug: 'tabsons' }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant profile review must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_PROFILE_ACCESS_BLOCKED'));

  const abcReport = svc.generateReadinessReport({ tenantSlug: 'abc' }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcReport.success, true, 'tenant B can review its own profile readiness');
  assert.ok(abcReport.profiles.some(row => row.employeeId === 'ABC-1'));
  assert.doesNotMatch(text(abcReport), /Esha Engineer|Mohan Manager|Tabsons Company|1000000/i, 'tenant A data must not influence tenant B profile readiness');

  const malformed = svc.validateEmployeeProfile('bad-payload', employeeContext);
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');
  assert.ok(malformed.issues.some(issue => issue.code === 'MALFORMED_PROFILE_PAYLOAD'));
  assert.ok(Object.isFrozen(malformed), 'malformed output must be immutable');

  const data = global.DB.get();
  assert.ok(data.employeeProfileRecords.some(row => row.employeeId === 'EMP-1'), 'profile records should be stored separately');
  assert.ok(data.employeeProfileHistory.length >= 1, 'profile history should be immutable');
  assert.ok(data.employeeProfileCompletionHistory.length >= 1, 'completion history should be immutable');
  assert.ok(data.employeeProfileVerificationHistory.length >= 1, 'verification history should be immutable');
  assert.ok(data.employeeProfileAnalytics.length >= 1, 'profile analytics should be immutable');
  assert.ok(global.DB.getAuditLogs().some(row => /PROFILE_/.test(row.actionType || row.action || '')), 'profile actions should be audited');

  const standalone = {};
  standalone.window = standalone;
  standalone.__ARTHHRMS_DEV__ = true;
  standalone.globalThis = standalone;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'services/employeeProfileCompletionService.js'), 'utf8'), standalone);
  assert.equal(standalone.__ARTHHRMS_EMPLOYEE_PROFILE_COMPLETION_SELF_TEST__.passed, true, 'development self-test should pass without DB dependencies');
}

main();
