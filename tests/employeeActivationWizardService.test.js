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

function seedActivationData() {
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
  data.employees = [
    { id: 'EMP-001', empId: 'EMP-001', employeeId: 'EMP-001', name: 'Asha Rao', email: 'asha.rao@example.com', role: 'employee', department: 'HR', designation: 'People Partner', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-002', empId: 'EMP-002', employeeId: 'EMP-002', name: 'Ravi Shah', email: 'ravi.shah@example.com', role: 'employee', department: 'Operations', designation: 'Ops Analyst', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-003', empId: 'EMP-003', employeeId: 'EMP-003', name: 'Nisha Patel', email: 'nisha.patel@example.com', role: 'employee', department: 'Engineering', designation: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-ACTIVE', empId: 'EMP-ACTIVE', employeeId: 'EMP-ACTIVE', name: 'Active User', email: 'active@example.com', role: 'employee', department: 'Operations', designation: 'Lead', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active', authUserId: 'AUTH-1', inviteStatus: 'Activated' },
    { id: 'ABC-001', empId: 'ABC-001', employeeId: 'ABC-001', name: 'Other Tenant', email: 'other@example.com', role: 'employee', department: 'Finance', designation: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900000, leaveBalance: 30, privateNote: 'ABC confidential onboarding' }
  ];
  data.users = [];
  data.authInvites = [];
  data.employeeInvitationRecords = [];
  data.invitationDeliveryLogs = [];
  data.invitationActivationHistory = [];
  data.invitationAnalyticsReports = [];
  data.employeeActivationRecords = [];
  data.employeeActivationHistory = [];
  data.employeeOnboardingHistory = [];
  data.activationAnalyticsReports = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function profile(overrides = {}) {
  return {
    personalInformation: { preferredName: 'Asha', dateOfBirth: '1995-02-10' },
    phoneNumber: '+919876543210',
    emergencyContact: { name: 'Meera Rao', phone: '+919812341234', relation: 'Sister' },
    profilePhotoPrepared: true,
    departmentConfirmation: true,
    contactVerified: true,
    policyAcknowledged: true,
    ...overrides
  };
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
    'services/excelValidationService.js',
    'services/inviteMailDeliveryService.js'
  ].forEach(load);
  seedActivationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeActivationWizardService.js');

  const inviteSvc = global.InviteMailDeliveryService;
  const svc = global.EmployeeActivationWizardService;
  assert.ok(svc, 'EmployeeActivationWizardService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_ACTIVATION_WIZARD_SELF_TEST__.passed, true, 'development self-test should cover activation failure cases');

  ['startActivationWizard', 'validateActivationToken', 'completeProfileSetup', 'calculateOnboardingReadiness', 'finalizeEmployeeActivation', 'freezeActivationOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-001', empId: 'EMP-001', employeeId: 'EMP-001', email: 'asha.rao@example.com', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' };
  const beforeEmployees = JSON.stringify(global.DB.get().employees);
  const beforeUsers = JSON.stringify(global.DB.get().users);

  const created = inviteSvc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com', name: 'Asha Rao', role: 'employee' }, hrContext);
  assert.equal(created.success, true, 'invite should be available for activation');

  const started = svc.startActivationWizard({ tenantSlug: 'tabsons', token: created.invitation.token, email: 'asha.rao@example.com' }, employeeContext);
  assert.equal(started.success, true, 'employee should start activation with a valid invite');
  assert.equal(started.state, 'ACTIVATION_STARTED');
  assert.equal(started.steps.length, 6, 'wizard should expose all activation steps');
  assert.equal(started.noActiveUserCreationBeforeFinalization, true, 'wizard start must not activate users');
  assert.equal(JSON.stringify(global.DB.get().users), beforeUsers, 'wizard start must not create users');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'wizard start must not mutate employees');
  assert.ok(Object.isFrozen(started), 'start output must be immutable');
  assert.doesNotMatch(JSON.stringify(started), new RegExp(created.invitation.token), 'activation output must not expose raw tokens');

  const crossTenant = svc.validateActivationToken({ tenantSlug: 'abc', token: created.invitation.token, email: 'asha.rao@example.com' }, { actor: { id: 'EMP-ABC', role: 'EMPLOYEE', email: 'asha.rao@example.com' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant activation must be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_ACTIVATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(crossTenant), /900000|leaveBalance|ABC confidential|other@example\.com/i, 'cross-tenant data must not leak');

  const wrongOwner = svc.startActivationWizard({ tenantSlug: 'tabsons', token: created.invitation.token, email: 'asha.rao@example.com' }, { actor: { id: 'EMP-002', empId: 'EMP-002', email: 'ravi.shah@example.com', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(wrongOwner.success, false, 'employees cannot activate another employee invitation');
  assert.ok(wrongOwner.failures.some(item => item.code === 'ACTIVATION_OWNERSHIP_BLOCKED'));

  const weakPassword = svc.completeProfileSetup({
    tenantSlug: 'tabsons',
    activationId: started.activation.activationId,
    token: created.invitation.token,
    email: 'asha.rao@example.com',
    password: 'weak',
    confirmPassword: 'weak',
    profile: profile()
  }, employeeContext);
  assert.equal(weakPassword.success, false, 'weak passwords must be blocked');
  assert.ok(weakPassword.failures.some(item => item.code === 'PASSWORD_POLICY_FAILED'));

  const incomplete = svc.completeProfileSetup({
    tenantSlug: 'tabsons',
    activationId: started.activation.activationId,
    token: created.invitation.token,
    email: 'asha.rao@example.com',
    password: 'StrongPass!123',
    confirmPassword: 'StrongPass!123',
    profile: profile({ phoneNumber: '', policyAcknowledged: false })
  }, employeeContext);
  assert.equal(incomplete.success, false, 'incomplete profiles must be blocked before finalization');
  assert.ok(incomplete.failures.some(item => item.code === 'PROFILE_COMPLETION_REQUIRED'));

  const completed = svc.completeProfileSetup({
    tenantSlug: 'tabsons',
    activationId: started.activation.activationId,
    token: created.invitation.token,
    email: 'asha.rao@example.com',
    password: 'StrongPass!123',
    confirmPassword: 'StrongPass!123',
    profile: profile()
  }, employeeContext);
  assert.equal(completed.success, true, 'profile completion should succeed with complete, valid data');
  assert.equal(completed.state, 'PROFILE_COMPLETED');
  assert.ok(completed.onboardingReadinessScore >= 90, 'complete profile should have high onboarding readiness');
  assert.equal(JSON.stringify(global.DB.get().users), beforeUsers, 'profile completion must not create active users');
  assert.doesNotMatch(JSON.stringify(completed), /StrongPass|password/i, 'passwords must not be exposed in outputs');

  const readiness = svc.calculateOnboardingReadiness({ tenantSlug: 'tabsons', activationId: started.activation.activationId }, { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons', reviewOnly: true });
  assert.equal(readiness.success, true, 'HR can review onboarding readiness');
  assert.ok(readiness.onboardingReadinessScore >= 90);
  assert.ok(readiness.activationSuccessScore >= 0);
  assert.ok(Object.isFrozen(readiness), 'readiness output must be immutable');

  const finalized = svc.finalizeEmployeeActivation({
    tenantSlug: 'tabsons',
    activationId: started.activation.activationId,
    token: created.invitation.token,
    email: 'asha.rao@example.com',
    password: 'StrongPass!123',
    confirmPassword: 'StrongPass!123'
  }, employeeContext);
  assert.equal(finalized.success, true, 'final activation should succeed after validation and profile completion');
  assert.equal(finalized.state, 'ACTIVE');
  assert.equal(finalized.employee.activationStatus, 'Active');
  assert.equal(finalized.employee.inviteStatus, 'Activated');
  assert.equal(finalized.invitation.used, true, 'final activation should consume invitation token');
  assert.doesNotMatch(JSON.stringify(finalized), /StrongPass|password|900000|leaveBalance/i, 'final output must not expose passwords or confidential fields');

  const activatedEmployee = global.DB.getEmployee('EMP-001');
  assert.equal(activatedEmployee.activationStatus, 'Active', 'employee becomes active only after finalization');
  assert.equal(activatedEmployee.onboardingStatus, 'Completed');
  assert.ok(activatedEmployee.authUserId, 'employee should be linked to an auth user on finalization');
  const createdUser = global.DB.findUserByEmail('asha.rao@example.com');
  assert.ok(createdUser, 'finalization creates or links a user record');
  assert.equal(createdUser.active, true);
  assert.equal(createdUser.activationStatus, 'Active');

  const replay = svc.validateActivationToken({ tenantSlug: 'tabsons', token: created.invitation.token, email: 'asha.rao@example.com' }, employeeContext);
  assert.equal(replay.success, false, 'reused activation tokens must be blocked');
  assert.ok(replay.failures.some(item => item.code === 'INVITATION_TOKEN_REUSED'));

  const expired = inviteSvc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-002', email: 'ravi.shah@example.com', name: 'Ravi Shah', expiresAt: '2020-01-01T00:00:00.000Z' }, hrContext);
  const expiredStart = svc.startActivationWizard({ tenantSlug: 'tabsons', token: expired.invitation.token, email: 'ravi.shah@example.com' }, { actor: { id: 'EMP-002', empId: 'EMP-002', email: 'ravi.shah@example.com', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(expiredStart.success, false, 'expired activation links must be blocked');
  assert.ok(expiredStart.failures.some(item => item.code === 'INVITATION_EXPIRED'));

  const analytics = svc.generateActivationAnalytics({ tenantSlug: 'tabsons' }, { actor: { id: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons', reviewOnly: true });
  assert.equal(analytics.success, true, 'director can review activation analytics');
  assert.ok(analytics.analytics.activationRate >= 0);
  assert.ok(analytics.integrationReadiness.managerHierarchyVisualizerPrepared, 'manager hierarchy visualizer should be prepared only');
  assert.ok(analytics.integrationReadiness.employeeProfileCompletionFlowPrepared, 'profile completion flow should be prepared only');
  assert.doesNotMatch(JSON.stringify(analytics), /900000|leaveBalance|ABC confidential|other@example\.com/i, 'analytics must not expose cross-tenant confidential data');

  const platformVisibility = svc.generateActivationAnalytics({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformVisibility.success, true, 'platform owner can review activation governance only');
  assert.equal(platformVisibility.governance.platformOwnerVisibilityOnly, true);

  const data = global.DB.get();
  assert.ok(data.employeeActivationRecords.length >= 1, 'activation records should be stored immutably');
  assert.ok(data.employeeActivationHistory.length >= 1, 'activation history should be stored immutably');
  assert.ok(data.employeeOnboardingHistory.length >= 1, 'onboarding history should be stored immutably');
  assert.ok(data.activationAnalyticsReports.length >= 1, 'activation analytics should be stored immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /ACTIVATION_/.test(row.actionType || row.action || '')), 'activation actions should be audited');
}

main();
