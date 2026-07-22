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
  global.navigator = { userAgent: 'Node department setup test', platform: 'Win32' };
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

function seedDepartmentData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC' }
  ];
  data.employees = [
    { id: 'OWN-CEO', empId: 'OWN-CEO', employeeId: 'OWN-CEO', name: 'Ada CEO', role: 'director', department: 'Leadership', designation: 'CEO', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 1_000_000, leaveBalance: 20 },
    { id: 'OWN-HR', empId: 'OWN-HR', employeeId: 'OWN-HR', name: 'Harini HR', role: 'HR', department: 'People', designation: 'HR Head', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'OWN-ENG', empId: 'OWN-ENG', employeeId: 'OWN-ENG', name: 'Eng Owner', role: 'manager', department: 'Engineering', designation: 'Engineering Manager', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'OWN-FIN', empId: 'OWN-FIN', employeeId: 'OWN-FIN', name: 'Finance Owner', role: 'manager', department: 'Finance', designation: 'Finance Manager', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-ENG', empId: 'EMP-ENG', employeeId: 'EMP-ENG', name: 'Engineer Employee', role: 'employee', department: 'Engineering', designation: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', password: 'secret' },
    { id: 'ABC-OWNER', empId: 'ABC-OWNER', employeeId: 'ABC-OWNER', name: 'ABC Owner', role: 'manager', department: 'Finance', designation: 'Manager', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900_000, privateNote: 'ABC confidential department' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'ABC-FIN', tenantSlug: 'abc', departmentName: 'ABC Finance', departmentCode: 'ABC-FIN', ownerId: 'ABC-OWNER', parentDepartmentCode: '', state: 'ACTIVE', active: true, level: 'DEPARTMENT' }
  ];
  data.departmentSetupHistory = [];
  data.departmentOwnershipHistory = [];
  data.departmentSetupAnalytics = [];
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
    'services/tenantIsolationService.js'
  ].forEach(load);
  seedDepartmentData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/tenantDepartmentSetupService.js');

  const svc = global.TenantDepartmentSetupService;
  assert.ok(svc, 'TenantDepartmentSetupService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_TENANT_DEPARTMENT_SETUP_SELF_TEST__.passed, true, 'development self-test should pass');

  ['createDepartment', 'assignDepartmentOwner', 'validateDepartmentHierarchy', 'calculateStructureReadiness', 'buildDepartmentTree', 'freezeDepartmentOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'OWN-HR', empId: 'OWN-HR', role: 'HR', department: 'People' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'OWN-CEO', empId: 'OWN-CEO', role: 'DIRECTOR', department: 'Leadership' }, tenantSlug: 'tabsons' };
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const activeWithoutValidation = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Unsafe Active', departmentCode: 'UNSAFE', ownerId: 'OWN-ENG', state: 'ACTIVE' }, hrContext);
  assert.equal(activeWithoutValidation.success, false, 'activation before validation must be blocked');
  assert.ok(activeWithoutValidation.issues.some(issue => issue.code === 'VALIDATION_REQUIRED_BEFORE_ACTIVATION'));

  const root = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Tabsons Company', departmentCode: 'COMPANY', ownerId: 'OWN-CEO', level: 'COMPANY' }, hrContext);
  const businessUnit = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Product Business Unit', departmentCode: 'BU-PROD', ownerId: 'OWN-ENG', parentDepartmentCode: 'COMPANY', level: 'BUSINESS_UNIT' }, hrContext);
  const engineering = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Engineering', departmentCode: 'ENG', ownerId: 'OWN-ENG', parentDepartmentCode: 'BU-PROD', level: 'DEPARTMENT' }, hrContext);
  const frontend = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Frontend Platform', departmentCode: 'ENG-FE', ownerId: 'OWN-ENG', parentDepartmentCode: 'ENG', level: 'SUB_DEPARTMENT' }, hrContext);
  const team = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Frontend Alpha', departmentCode: 'ENG-FE-A', ownerId: 'OWN-ENG', parentDepartmentCode: 'ENG-FE', level: 'TEAM' }, hrContext);

  [root, businessUnit, engineering, frontend, team].forEach(result => {
    assert.equal(result.success, true, `department creation should pass for ${result.department?.departmentCode}`);
    assert.equal(result.department.state, 'DRAFT');
    assert.ok(Object.isFrozen(result), 'department outputs must be immutable');
  });

  const duplicateCode = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Engineering Duplicate Code', departmentCode: 'ENG', ownerId: 'OWN-FIN', parentDepartmentCode: 'BU-PROD' }, hrContext);
  assert.equal(duplicateCode.success, false, 'duplicate department code must be blocked');
  assert.ok(duplicateCode.issues.some(issue => issue.code === 'DUPLICATE_DEPARTMENT_CODE'));

  const duplicateName = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Engineering', departmentCode: 'ENG2', ownerId: 'OWN-FIN', parentDepartmentCode: 'BU-PROD' }, hrContext);
  assert.equal(duplicateName.success, false, 'duplicate department name must be blocked');
  assert.ok(duplicateName.issues.some(issue => issue.code === 'DUPLICATE_DEPARTMENT_NAME'));

  const missingOwner = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'No Owner', departmentCode: 'NO-OWNER', parentDepartmentCode: 'COMPANY' }, hrContext);
  assert.equal(missingOwner.success, false, 'missing owner must be blocked');
  assert.ok(missingOwner.issues.some(issue => issue.code === 'MISSING_DEPARTMENT_OWNER'));

  const crossTenantOwner = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Leaky Owner', departmentCode: 'LEAK', ownerId: 'ABC-OWNER', parentDepartmentCode: 'COMPANY' }, hrContext);
  assert.equal(crossTenantOwner.success, false, 'cross-tenant owner assignment must be blocked');
  assert.ok(crossTenantOwner.issues.some(issue => issue.code === 'INVALID_DEPARTMENT_OWNER'));

  const invalidParent = svc.createDepartment({ tenantSlug: 'tabsons', departmentName: 'Invalid Parent', departmentCode: 'BAD-PARENT', ownerId: 'OWN-ENG', parentDepartmentCode: 'MISSING' }, hrContext);
  assert.equal(invalidParent.success, false, 'invalid parent assignment must be blocked');
  assert.ok(invalidParent.issues.some(issue => issue.code === 'INVALID_PARENT_DEPARTMENT'));

  const ownership = svc.assignDepartmentOwner({ tenantSlug: 'tabsons', departmentCode: 'ENG', ownerId: 'OWN-FIN', ownershipType: 'DELEGATED_OWNER' }, hrContext);
  assert.equal(ownership.success, true, 'HR can assign department ownership');
  assert.equal(ownership.department.ownerId, 'OWN-FIN');

  const validation = svc.validateDepartmentHierarchy({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(validation.success, true, 'valid department hierarchy should pass');
  assert.equal(validation.structureReadyForActivation, true);
  assert.equal(validation.validation.valid, true);

  const activation = svc.activateDepartment({ tenantSlug: 'tabsons', departmentCode: 'ENG', validationApproved: true }, directorContext);
  assert.equal(activation.success, true, 'director can activate a validated department');
  assert.equal(activation.department.state, 'ACTIVE');

  const tree = svc.buildDepartmentTree({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(tree.success, true, 'department tree should build');
  assert.ok(tree.tree.length >= 1, 'tree should include a root');
  assert.ok(tree.analytics.hierarchyDepth >= 5, 'unlimited-depth department chains should be represented');
  assert.ok(tree.departments.some(row => row.departmentCode === 'ENG-FE-A' && row.parentDepartmentCode === 'ENG-FE'), 'deep team row should be present');
  assert.ok(Object.isFrozen(tree), 'tree output must be immutable');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'department setup must not mutate employee records');
  assert.doesNotMatch(text(tree), /"salary"|"leaveBalance"|secret|1000000|ABC confidential|ABC Finance/i, 'tree output must not expose confidential or cross-tenant data');

  const managerView = svc.buildDepartmentTree({ tenantSlug: 'tabsons' }, { actor: { id: 'OWN-ENG', empId: 'OWN-ENG', role: 'MANAGER', department: 'Engineering' }, tenantSlug: 'tabsons' });
  assert.equal(managerView.success, true, 'manager can view assigned department structure');
  assert.ok(managerView.departments.every(row => row.ownerId === 'OWN-ENG' || row.departmentName === 'Engineering' || row.departmentCode.startsWith('ENG')), 'manager view should stay within assigned structure');

  const employeeView = svc.buildDepartmentTree({ tenantSlug: 'tabsons' }, { actor: { id: 'EMP-ENG', empId: 'EMP-ENG', role: 'EMPLOYEE', department: 'Engineering' }, tenantSlug: 'tabsons' });
  assert.equal(employeeView.success, true, 'employee can view own department structure');
  assert.ok(employeeView.departments.some(row => row.departmentCode === 'ENG'), 'employee view includes own department');
  assert.ok(!employeeView.departments.some(row => row.departmentCode === 'BU-PROD'), 'employee view must not expose broader structure');

  const platformView = svc.buildDepartmentTree({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformView.success, true, 'platform owner can review department governance');
  assert.equal(platformView.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformView.departments.every(row => /^Governance Department/.test(row.departmentName)), 'platform owner view must be anonymized');

  const abcTree = svc.buildDepartmentTree({ tenantSlug: 'abc' }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcTree.success, true, 'other tenant can build its own structure');
  assert.ok(abcTree.departments.some(row => row.departmentCode === 'ABC-FIN'));
  assert.ok(!abcTree.departments.some(row => row.departmentCode === 'ENG'));
  assert.doesNotMatch(text(abcTree), /Engineering|Tabsons Company|1000000|"salary"/i, 'cross-tenant output must not leak Tabsons departments');

  const readiness = svc.calculateStructureReadiness({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(readiness.success, true, 'structure readiness should be generated');
  assert.ok(readiness.structureReadinessScore >= 0);
  assert.ok(readiness.hierarchyQualityScore >= 0);
  assert.ok(readiness.governanceScore >= 0);
  assert.ok(Object.isFrozen(readiness), 'readiness output must be immutable');

  const dataWithProblems = global.DB.get();
  dataWithProblems.tenantDepartmentRecords.push(
    { departmentId: 'CYCLE-A', tenantSlug: 'tabsons', departmentName: 'Cycle A', departmentCode: 'CYCLE-A', ownerId: 'OWN-ENG', parentDepartmentCode: 'CYCLE-B', state: 'DRAFT', active: false },
    { departmentId: 'CYCLE-B', tenantSlug: 'tabsons', departmentName: 'Cycle B', departmentCode: 'CYCLE-B', ownerId: 'OWN-ENG', parentDepartmentCode: 'CYCLE-A', state: 'DRAFT', active: false },
    { departmentId: 'ORPHAN', tenantSlug: 'tabsons', departmentName: 'Orphan', departmentCode: 'ORPHAN', ownerId: 'OWN-ENG', parentDepartmentCode: 'MISSING-PARENT', state: 'DRAFT', active: false }
  );
  global.DB.save(dataWithProblems);
  const invalidHierarchy = svc.validateDepartmentHierarchy({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(invalidHierarchy.success, false, 'corrupt hierarchy should be blocked');
  assert.ok(invalidHierarchy.issues.some(issue => issue.code === 'CIRCULAR_DEPARTMENT_HIERARCHY'));
  assert.ok(invalidHierarchy.issues.some(issue => issue.code === 'ORPHAN_DEPARTMENT'));

  const malformed = svc.buildDepartmentTree(null, hrContext);
  assert.equal(malformed.success, true, 'malformed payloads should safely fall back to tenant context');

  const denied = svc.buildDepartmentTree({ tenantSlug: 'tabsons' }, { actor: { id: 'SA-1', role: 'SUPER_ADMIN' }, tenantSlug: 'tabsons' });
  assert.equal(denied.success, false, 'SUPER_ADMIN must not receive business department visibility');
  assert.ok(denied.issues.some(issue => issue.code === 'DEPARTMENT_ACCESS_DENIED'));

  const persisted = global.DB.get();
  assert.ok(persisted.tenantDepartmentRecords.length >= 6, 'department records should be persisted tenant-scoped');
  assert.ok(persisted.departmentSetupHistory.length >= 1, 'department history should be immutable');
  assert.ok(persisted.departmentOwnershipHistory.length >= 1, 'ownership history should be immutable');
  assert.ok(persisted.departmentSetupAnalytics.length >= 1, 'department analytics should be immutable');
  assert.ok(global.DB.getAuditLogs().some(row => /DEPARTMENT_/.test(row.actionType || row.action || '')), 'department setup actions should be audited');
}

main();
