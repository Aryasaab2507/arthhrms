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
  global.navigator = { userAgent: 'Node organization initialization test', platform: 'Win32' };
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

function seedInitializationData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'CREATED' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'CREATED' }
  ];
  data.employees = [
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', role: 'director', department: 'Leadership', designation: 'Director', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: '', salary: 1_000_000 },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', role: 'HR', department: 'People', designation: 'HR Head', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Mohan Manager', role: 'manager', department: 'Engineering', designation: 'Manager', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'DIR-1' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', role: 'employee', department: 'Engineering', designation: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1', password: 'secret' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', role: 'employee', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900_000, privateNote: 'ABC confidential' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'COMPANY', tenantSlug: 'tabsons', departmentName: 'Tabsons Company', departmentCode: 'COMPANY', ownerId: 'DIR-1', parentDepartmentCode: '', state: 'ACTIVE', active: true, level: 'COMPANY' },
    { departmentId: 'ENG', tenantSlug: 'tabsons', departmentName: 'Engineering', departmentCode: 'ENG', ownerId: 'MGR-1', parentDepartmentCode: 'COMPANY', state: 'ACTIVE', active: true, level: 'DEPARTMENT' },
    { departmentId: 'ABC-FIN', tenantSlug: 'abc', departmentName: 'ABC Finance', departmentCode: 'ABC-FIN', ownerId: 'ABC-1', parentDepartmentCode: '', state: 'ACTIVE', active: true, level: 'DEPARTMENT' }
  ];
  data.employeeBulkImportPreviewHistory = [
    { previewId: 'PREV-1', tenantSlug: 'tabsons', state: 'APPROVAL_PENDING', summary: { totalRows: 3, validRows: 3, invalidRows: 0, duplicateEmployees: 0, duplicateEmails: 0, missingFields: 0, departmentMismatches: 0 }, immutable: true }
  ];
  data.importQualityReports = [
    { validationId: 'VAL-1', tenantSlug: 'tabsons', quality: { qualityScore: 96, severityScore: 2 }, summary: { totalRows: 3, validRows: 3, invalidRows: 0, warningCount: 0, errorCount: 0, duplicateCount: 0 }, immutable: true }
  ];
  data.onboardingReadinessReports = [
    { validationId: 'VAL-1', tenantSlug: 'tabsons', onboardingReadiness: { onboardingReadinessScore: 94, onboardingBlocked: false }, immutable: true }
  ];
  data.employeeInvitationRecords = [
    { invitationId: 'INV-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', email: 'esha@example.com', state: 'DELIVERED', token: 'safe-token', immutable: true }
  ];
  data.invitationDeliveryLogs = [
    { deliveryId: 'DEL-1', tenantSlug: 'tabsons', state: 'DELIVERED', status: 'DELIVERED', immutable: true }
  ];
  data.employeeActivationRecords = [
    { activationId: 'ACT-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', email: 'esha@example.com', state: 'ACTIVE', profileCompletedAt: new Date().toISOString(), immutable: true }
  ];
  data.organizationInitializationRecords = [];
  data.organizationInitializationHistory = [];
  data.organizationReadinessReports = [];
  data.organizationActivationHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function profile(overrides = {}) {
  return {
    companyName: 'Tabsons',
    companyCode: 'TAB',
    legalEntity: 'Tabsons Private Limited',
    industry: 'Manufacturing',
    timezone: 'Asia/Kolkata',
    country: 'India',
    currency: 'INR',
    fiscalYear: 'APR-MAR',
    ...overrides
  };
}

function initializationPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    companyProfile: profile(),
    initializationModules: {
      roles: ['EMPLOYEE', 'MANAGER', 'HR', 'DIRECTOR'],
      permissionsConfigured: true,
      leavePoliciesConfigured: true,
      attendanceSettingsConfigured: true,
      companySettingsConfigured: true
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
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/organizationSetupService.js',
    'services/employeeBulkImportService.js',
    'services/excelValidationService.js',
    'services/inviteMailDeliveryService.js',
    'services/employeeActivationWizardService.js',
    'services/managerHierarchyService.js',
    'services/tenantDepartmentSetupService.js'
  ].forEach(load);
  seedInitializationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/organizationInitializationWizardService.js');

  const svc = global.OrganizationInitializationWizardService;
  assert.ok(svc, 'OrganizationInitializationWizardService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_ORGANIZATION_INITIALIZATION_SELF_TEST__.passed, true, 'development self-test should pass');

  ['initializeOrganization', 'validateLaunchReadiness', 'calculateReadinessScore', 'activateOrganization', 'generateInitializationChecklist', 'freezeInitializationOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    companySettings: global.DB.get().companySettings,
    platformTenants: global.DB.get().platformTenants,
    employees: global.DB.get().employees
  });

  const initialized = svc.initializeOrganization(initializationPayload(), hrContext);
  assert.equal(initialized.success, true, 'HR can initialize organization metadata');
  assert.equal(initialized.organization.state, 'CONFIGURING');
  assert.equal(initialized.organization.companyProfile.companyCode, 'TAB');
  assert.ok(Object.isFrozen(initialized), 'initialize output must be immutable');
  assert.doesNotMatch(text(initialized), /salary|secret|ABC confidential|ABC Employee/i, 'initialization output must not expose confidential or cross-tenant data');

  const checklist = svc.generateInitializationChecklist({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(checklist.success, true, 'checklist should be generated');
  assert.ok(checklist.checklist.some(item => item.step === 'DEPARTMENT_SETUP' && item.status === 'COMPLETE'), 'department setup should be recognized');
  assert.ok(checklist.checklist.some(item => item.step === 'HIERARCHY_SETUP' && item.status === 'COMPLETE'), 'hierarchy setup should be recognized');
  assert.ok(checklist.checklist.some(item => item.step === 'EMPLOYEE_IMPORT' && item.status === 'COMPLETE'), 'employee import should be recognized');
  assert.ok(checklist.integrationHealth.departmentSetupIntegrated, 'department setup integration should be validated');
  assert.ok(checklist.integrationHealth.employeeImportIntegrated, 'employee import integration should be validated');
  assert.ok(Object.isFrozen(checklist), 'checklist output must be immutable');

  const readiness = svc.validateLaunchReadiness({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(readiness.success, true, 'launch readiness should pass for complete onboarding');
  assert.equal(readiness.activationReady, true);
  assert.ok(readiness.readinessScore >= 80);
  assert.ok(readiness.governanceScore >= 80);
  assert.ok(readiness.activationScore >= 80);
  assert.ok(readiness.integrationSummary.integrationsValidated, 'all required integrations should be validated');

  const score = svc.calculateReadinessScore({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(score.success, true, 'readiness scoring should work');
  assert.ok(score.launchReadinessScore >= 80);
  assert.ok(score.onboardingScore >= 80);
  assert.ok(score.governanceScore >= 80);

  const noApprovalActivation = svc.activateOrganization({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(noApprovalActivation.success, false, 'HR cannot activate organization');
  assert.ok(noApprovalActivation.issues.some(issue => issue.code === 'ORGANIZATION_ACTIVATION_DENIED'));

  const activated = svc.activateOrganization({ tenantSlug: 'tabsons', readinessApproved: true }, directorContext);
  assert.equal(activated.success, true, 'director can activate after readiness validation');
  assert.equal(activated.organization.state, 'ACTIVE');
  assert.equal(activated.activationReadiness.activationReady, true);

  const incomplete = svc.validateLaunchReadiness({
    tenantSlug: 'tabsons',
    companyProfile: profile({ currency: '' }),
    initializationModules: { roles: [], permissionsConfigured: false, leavePoliciesConfigured: false, attendanceSettingsConfigured: false, companySettingsConfigured: false },
    departments: []
  }, directorContext);
  assert.equal(incomplete.success, false, 'incomplete onboarding must block launch readiness');
  assert.ok(incomplete.issues.some(issue => issue.code === 'REQUIRED_COMPANY_PROFILE_MISSING' || issue.code === 'DEPARTMENT_SETUP_INCOMPLETE' || issue.code === 'PERMISSION_CONFIGURATION_INCOMPLETE'));

  const employeeDenied = svc.initializeOrganization(initializationPayload(), { actor: { id: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeDenied.success, false, 'employees cannot access organization initialization');
  assert.ok(employeeDenied.issues.some(issue => issue.code === 'ORGANIZATION_INITIALIZATION_ACCESS_DENIED'));

  const platformView = svc.generateInitializationChecklist({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformView.success, true, 'platform owner can review governance visibility');
  assert.equal(platformView.governance.platformOwnerVisibilityOnly, true);
  assert.equal(platformView.companyProfile.companyName, 'Governance Organization');

  const crossTenant = svc.initializeOrganization(initializationPayload({ tenantSlug: 'tabsons' }), { actor: { id: 'HR-ABC', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant initialization must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_INITIALIZATION_BLOCKED'));

  const abcReadiness = svc.validateLaunchReadiness({ tenantSlug: 'abc', companyProfile: profile({ companyName: 'ABC', companyCode: 'ABC' }) }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcReadiness.success, false, 'ABC sparse onboarding should not be made ready by Tabsons data');
  assert.doesNotMatch(text(abcReadiness), /Tabsons Company|Engineering|safe-token|esha@example.com|1000000/i, 'tenant A data must not influence tenant B readiness');

  const malformed = svc.generateInitializationChecklist(null, hrContext);
  assert.equal(malformed.success, true, 'malformed payloads should safely fall back to context');

  assert.equal(JSON.stringify({
    companySettings: global.DB.get().companySettings,
    platformTenants: global.DB.get().platformTenants,
    employees: global.DB.get().employees
  }), beforeProtected, 'initialization wizard must not mutate company, tenant, or employee records');

  const data = global.DB.get();
  assert.ok(data.organizationInitializationRecords.some(row => row.tenantSlug === 'tabsons'), 'initialization records should be persisted');
  assert.ok(data.organizationInitializationHistory.length >= 1, 'initialization history should be immutable');
  assert.ok(data.organizationReadinessReports.length >= 1, 'readiness reports should be immutable');
  assert.ok(data.organizationActivationHistory.length >= 1, 'activation history should be immutable');
  assert.ok(global.DB.getAuditLogs().some(row => /ORGANIZATION_INITIALIZATION|ORGANIZATION_ACTIVATION|LAUNCH_READINESS/.test(row.actionType || row.action || '')), 'organization initialization actions should be audited');
}

main();
