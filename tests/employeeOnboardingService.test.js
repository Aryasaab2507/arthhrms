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
  global.location = {
    href: '',
    origin: 'https://pilot.example.com',
    pathname: '/hr-dashboard.html',
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
  global.__telemetry = [];
  global.__audits = [];
  global.WorkflowTelemetryService = {
    emitTelemetry(category, eventType, options) {
      global.__telemetry.push({ category, eventType, options });
      return { success: true, emitted: true };
    }
  };
  global.AuditService = {
    recordAudit(event, context) {
      global.__audits.push({ event, context });
      return { success: true, recorded: true };
    }
  };
}

function seedTenantData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TENANT-A', companyId: 'TENANT-A', companyName: 'Pilot Tenant' };
  (data.employees || []).forEach(emp => { emp.tenantId = 'TENANT-A'; emp.companyId = 'TENANT-A'; });
  (data.users || []).forEach(user => { user.tenantId = 'TENANT-A'; user.companyId = 'TENANT-A'; });
  data.employees.push(
    {
      id: 'ARTH-EMP-2026-0001', empId: 'ARTH-EMP-2026-0001', employeeId: 'ARTH-EMP-2026-0001',
      name: 'Tenant Manager', email: 'tenant.manager@example.com', dept: 'Operations', department: 'Operations',
      desig: 'Manager', designation: 'Manager', managerId: null, role: 'manager', tenantId: 'TENANT-A',
      companyId: 'TENANT-A', employmentStatus: 'Active', activationStatus: 'Active'
    },
    {
      id: 'ARTH-EMP-2026-0005', empId: 'ARTH-EMP-2026-0005', employeeId: 'ARTH-EMP-2026-0005',
      name: 'Onboarding Target', email: 'nikhil.k@arthhrms.com', dept: 'Operations', department: 'Operations',
      desig: 'Executive', designation: 'Executive', managerId: 'ARTH-EMP-2026-0001', role: 'employee',
      tenantId: 'TENANT-A', companyId: 'TENANT-A', employmentStatus: 'Active', activationStatus: 'Not Activated'
    }
  );
  data.employees.push({
    id: 'ARTH-EMP-2026-0900',
    empId: 'ARTH-EMP-2026-0900',
    employeeId: 'ARTH-EMP-2026-0900',
    name: 'Foreign Manager',
    email: 'foreign.manager@example.com',
    dept: 'Operations',
    department: 'Operations',
    desig: 'Manager',
    designation: 'Manager',
    managerId: null,
    role: 'manager',
    tenantId: 'TENANT-B',
    companyId: 'TENANT-B',
    employmentStatus: 'Active',
    activationStatus: 'Active'
  });
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/platformGovernanceService.js',
    'services/rlsValidationService.js',
    'services/inviteGovernanceService.js',
    'services/employeeOnboardingService.js',
    'services/authService.js',
    'services/authInviteService.js',
    'services/importStagingService.js',
    'services/importService.js',
    'services/pilotOnboardingService.js'
  ].forEach(load);

  seedTenantData();
  assert.ok(global.InviteGovernanceService, 'InviteGovernanceService should be exported');
  assert.ok(global.EmployeeOnboardingService, 'EmployeeOnboardingService should be exported');

  assert.ok(Object.isFrozen(global.EmployeeOnboardingService.ONBOARDING_LIFECYCLE), 'onboarding lifecycle constants should be immutable');
  assert.deepEqual(global.EmployeeOnboardingService.ONBOARDING_LIFECYCLE, ['INVITED', 'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DISABLED']);

  assert.equal(global.InviteGovernanceService.normalizeOnboardingRole('HR Head'), 'hr_head');
  assert.equal(global.InviteGovernanceService.normalizeOnboardingRole('PLATFORM_OWNER'), '', 'platform owner must not normalize into a tenant onboarding role');

  const platformInvite = global.InviteGovernanceService.validateInvitePayload({
    empId: 'ARTH-EMP-2026-0005',
    email: 'hidden.owner@example.com',
    role: 'PLATFORM_OWNER',
    tenantId: 'TENANT-A'
  }, { actorRole: 'hr', tenantId: 'TENANT-A' });
  assert.equal(platformInvite.success, false);
  assert.equal(platformInvite.blocked, true);
  assert.ok(platformInvite.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ASSIGNMENT'), 'PLATFORM_OWNER must be blocked from invites');
  assert.ok(Object.isFrozen(platformInvite), 'invite validation output should be immutable');

  const goodInvite = global.InviteGovernanceService.validateInvitePayload({
    empId: 'ARTH-EMP-2026-0005',
    email: 'nikhil.k@arthhrms.com',
    role: 'employee',
    tenantId: 'TENANT-A'
  }, { actorRole: 'hr', tenantId: 'TENANT-A' });
  assert.equal(goodInvite.success, true);
  assert.equal(goodInvite.normalizedPayload.role, 'employee');

  global.DB.createAuthInvite({
    empId: 'ARTH-EMP-2026-0005',
    email: 'nikhil.k@arthhrms.com',
    role: 'employee',
    status: 'Invite Sent',
    inviteStatus: 'Invite Sent',
    activationStatus: 'Invite Sent',
    tenantId: 'TENANT-A'
  });
  const duplicate = global.InviteGovernanceService.validateInvitePayload({
    empId: 'ARTH-EMP-2026-0005',
    email: 'nikhil.k@arthhrms.com',
    role: 'employee',
    tenantId: 'TENANT-A'
  }, { actorRole: 'hr', tenantId: 'TENANT-A' });
  assert.equal(duplicate.success, false);
  assert.ok(duplicate.failures.some(item => item.failureCode === 'DUPLICATE_ACTIVE_INVITE'), 'duplicate active invites should be blocked');

  const crossTenant = global.InviteGovernanceService.validateInvitePayload({
    empId: 'ARTH-EMP-2026-0005',
    email: 'nikhil.k@arthhrms.com',
    role: 'employee',
    tenantId: 'TENANT-B'
  }, { actorRole: 'hr', tenantId: 'TENANT-A' });
  assert.ok(crossTenant.failures.some(item => item.severity === 'CRITICAL' && item.failureCode === 'CROSS_TENANT_ONBOARDING_BLOCKED'), 'cross-tenant onboarding must be CRITICAL');

  const employeeBefore = JSON.stringify(global.DB.getEmployee('ARTH-EMP-2026-0005'));
  const bulk = global.EmployeeOnboardingService.validateBulkOnboardingImport([
    {
      employee_id: 'ARTH-EMP-2026-0200',
      name: 'Pilot Employee One',
      email: 'pilot.one@example.com',
      department: 'Operations',
      designation: 'Associate',
      role: 'EMPLOYEE',
      reporting_manager_id: 'ARTH-EMP-2026-0001',
      joining_date: '2026-05-20',
      tenant_id: 'TENANT-A'
    },
    {
      employee_id: 'ARTH-EMP-2026-0201',
      name: 'Duplicate Pilot Email',
      email: 'pilot.one@example.com',
      department: 'Operations',
      designation: 'Associate',
      role: 'EMPLOYEE',
      reporting_manager_id: 'ARTH-EMP-2026-0001',
      joining_date: '2026-05-20',
      tenant_id: 'TENANT-A'
    },
    {
      employee_id: 'ARTH-EMP-2026-0202',
      name: 'Unsafe Owner',
      email: 'unsafe.owner@example.com',
      department: 'Operations',
      designation: 'Associate',
      role: 'PLATFORM_OWNER',
      reporting_manager_id: 'ARTH-EMP-2026-0001',
      joining_date: '2026-05-20',
      tenant_id: 'TENANT-A'
    },
    {
      employee_id: 'ARTH-EMP-2026-0203',
      name: 'Cross Tenant Report',
      email: 'cross.tenant@example.com',
      department: 'Operations',
      designation: 'Associate',
      role: 'EMPLOYEE',
      reporting_manager_id: 'ARTH-EMP-2026-0900',
      joining_date: '2026-05-20',
      tenant_id: 'TENANT-A'
    }
  ], { tenantId: 'TENANT-A', dryRun: true, actorRole: 'hr', actorId: 'HR1' });
  assert.equal(JSON.stringify(global.DB.getEmployee('ARTH-EMP-2026-0005')), employeeBefore, 'bulk dry-run must not mutate existing employee records');
  assert.equal(bulk.dryRun, true);
  assert.equal(bulk.summary.totalRows, 4);
  assert.equal(bulk.summary.successRows, 1);
  assert.ok(bulk.summary.failedRows >= 3, 'malformed and unsafe rows should be isolated as failed rows');
  assert.ok(bulk.failedRows.some(row => row.failures.some(item => item.failureCode === 'DUPLICATE_EMAIL_IN_FILE')));
  assert.ok(bulk.failedRows.some(row => row.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ASSIGNMENT')));
  assert.ok(bulk.failedRows.some(row => row.failures.some(item => item.failureCode === 'CROSS_TENANT_MANAGER_BLOCKED' && item.severity === 'CRITICAL')));
  assert.ok(Object.isFrozen(bulk), 'bulk validation output should be immutable');
  assert.ok(Object.isFrozen(bulk.successRows), 'bulk validation rows should be immutable');

  const hierarchy = global.EmployeeOnboardingService.validateManagerHierarchy([
    { employee_id: 'ARTH-EMP-2026-0300', reporting_manager_id: 'ARTH-EMP-2026-0301', tenant_id: 'TENANT-A' },
    { employee_id: 'ARTH-EMP-2026-0301', reporting_manager_id: 'ARTH-EMP-2026-0300', tenant_id: 'TENANT-A' },
    { employee_id: 'ARTH-EMP-2026-0302', reporting_manager_id: 'ARTH-EMP-2026-0302', tenant_id: 'TENANT-A' }
  ], { tenantId: 'TENANT-A' });
  assert.equal(hierarchy.success, false);
  assert.ok(hierarchy.failures.some(item => item.failureCode === 'CIRCULAR_MANAGER_CHAIN'));
  assert.ok(hierarchy.failures.some(item => item.failureCode === 'SELF_MANAGER_NOT_ALLOWED'));

  const staged = global.EmployeeOnboardingService.createPilotActivationPlan(['ARTH-EMP-2026-0005'], {
    stage: 'pilot_group_1',
    tenantId: 'TENANT-A'
  });
  assert.equal(staged.success, true);
  assert.equal(staged.stage, 'pilot_group_1');
  assert.ok(Object.isFrozen(staged));

  const rlsReport = global.EmployeeOnboardingService.validateOnboardingRlsIsolation({
    tenantIsolationTests: [{ testName: 'invite tenant leak', table: 'auth_invites', crossTenantLeak: true }]
  });
  assert.equal(rlsReport.passed, false);
  assert.ok(rlsReport.failures.some(item => item.severity === 'CRITICAL'), 'cross-tenant RLS failures should stay CRITICAL');

  const authInviteValidation = global.authInviteService.validateInvitePayload({
    empId: 'ARTH-EMP-2026-0005',
    email: 'platform.owner.in.tenant@example.com',
    role: 'platform_owner',
    tenantId: 'TENANT-A'
  });
  assert.equal(authInviteValidation.ok, false, 'authInviteService should consume tenant-safe role governance');

  const importValidation = global.importService.validateRows('employees', [{
    empId: 'ARTH-EMP-2026-0400',
    fullName: 'Import Platform Owner',
    department: 'Operations',
    designation: 'Analyst',
    managerId: 'ARTH-EMP-2026-0001',
    salary: '50000',
    joinDate: '2026-05-20',
    email: 'import.owner@example.com',
    employmentStatus: 'Active',
    role: 'PLATFORM_OWNER'
  }]);
  assert.equal(importValidation.failedRows.length, 1, 'employee import validation should reject platform owner role');

  assert.ok(global.__telemetry.length > 0, 'onboarding hardening should emit telemetry safely');
  assert.ok(global.__audits.length > 0, 'onboarding hardening should audit failures safely');

  console.log('employeeOnboardingService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
