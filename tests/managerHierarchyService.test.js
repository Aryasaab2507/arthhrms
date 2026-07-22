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
  global.navigator = { userAgent: 'Node hierarchy test', platform: 'Win32' };
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

function seedHierarchyData() {
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
    { id: 'CEO-1', empId: 'CEO-1', employeeId: 'CEO-1', name: 'Ada CEO', role: 'director', department: 'Leadership', designation: 'CEO', managerId: null, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 1_000_000, leaveBalance: 20 },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', role: 'director', department: 'Engineering', designation: 'Director', managerId: 'CEO-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Mohan Manager', role: 'manager', department: 'Engineering', designation: 'Manager', managerId: 'DIR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'LEAD-1', empId: 'LEAD-1', employeeId: 'LEAD-1', name: 'Leena Lead', role: 'team_lead', department: 'Engineering', designation: 'Team Lead', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', role: 'employee', department: 'Engineering', designation: 'Engineer', managerId: 'LEAD-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', password: 'secret' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Omar Ops', role: 'employee', department: 'Engineering', designation: 'Analyst', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ORPHAN-1', empId: 'ORPHAN-1', employeeId: 'ORPHAN-1', name: 'Olive Orphan', role: 'employee', department: 'Operations', designation: 'Coordinator', managerId: 'MISSING-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'CYCLE-A', empId: 'CYCLE-A', employeeId: 'CYCLE-A', name: 'Cycle A', role: 'employee', department: 'Risk', designation: 'Analyst', managerId: 'CYCLE-B', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'CYCLE-B', empId: 'CYCLE-B', employeeId: 'CYCLE-B', name: 'Cycle B', role: 'employee', department: 'Risk', designation: 'Analyst', managerId: 'CYCLE-A', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MULTI-1', empId: 'MULTI-1', employeeId: 'MULTI-1', name: 'Multi Manager', role: 'employee', department: 'Finance', designation: 'Associate', managerId: 'MGR-1', managerIds: ['MGR-1', 'DIR-1'], tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-CEO', empId: 'ABC-CEO', employeeId: 'ABC-CEO', name: 'ABC CEO', role: 'director', department: 'Leadership', designation: 'CEO', managerId: null, tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900_000, leaveBalance: 30, privateNote: 'ABC confidential hierarchy' },
    { id: 'ABC-EMP', empId: 'ABC-EMP', employeeId: 'ABC-EMP', name: 'ABC Employee', role: 'employee', department: 'Finance', designation: 'Analyst', managerId: 'ABC-CEO', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.managerHierarchyHistory = [];
  data.reportingHierarchyHistory = [];
  data.hierarchyAnalyticsReports = [];
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
  seedHierarchyData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/managerHierarchyService.js');

  const svc = global.ManagerHierarchyService;
  assert.ok(svc, 'ManagerHierarchyService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_MANAGER_HIERARCHY_SELF_TEST__.passed, true, 'development self-test should pass');

  ['buildOrgChart', 'validateReportingChain', 'calculateHierarchyHealth', 'generateManagerTree', 'normalizeHierarchyPayload', 'freezeHierarchyOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const chart = svc.buildOrgChart({ tenantSlug: 'tabsons', viewMode: 'tree' }, hrContext);
  assert.equal(chart.success, true, 'HR can build tenant org chart');
  assert.equal(chart.viewMode, 'TREE');
  assert.ok(chart.reportingTree.length >= 1, 'org chart should include a root');
  assert.ok(chart.analytics.maxDepth >= 5, 'unlimited-depth reporting chains should be represented');
  assert.ok(chart.nodes.some(node => node.employeeId === 'EMP-1' && node.managerId === 'LEAD-1'), 'employee-to-manager relationship should be mapped');
  assert.ok(chart.edges.some(edge => edge.from === 'LEAD-1' && edge.to === 'EMP-1'), 'reporting edge should be generated');
  assert.ok(Object.isFrozen(chart), 'chart output must be immutable');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'org chart rendering must not mutate employee records');
  assert.doesNotMatch(text(chart), /"salary"|"leaveBalance"|secret|1000000|ABC confidential|ABC Employee/i, 'chart output must not expose confidential or cross-tenant data');

  const validChain = svc.validateReportingChain({ tenantSlug: 'tabsons', employeeId: 'EMP-1' }, hrContext);
  assert.equal(validChain.success, true, 'valid reporting chain should pass');
  assert.deepEqual(validChain.managerChain.map(item => item.employeeId), ['CEO-1', 'DIR-1', 'MGR-1', 'LEAD-1', 'EMP-1']);

  const cycle = svc.validateReportingChain({ tenantSlug: 'tabsons', employeeId: 'CYCLE-A' }, hrContext);
  assert.equal(cycle.success, false, 'circular reporting must be blocked');
  assert.ok(cycle.issues.some(issue => issue.code === 'CIRCULAR_REPORTING'));

  const orphan = svc.validateReportingChain({ tenantSlug: 'tabsons', employeeId: 'ORPHAN-1' }, hrContext);
  assert.equal(orphan.success, false, 'missing managers must be blocked');
  assert.ok(orphan.issues.some(issue => issue.code === 'MISSING_MANAGER'));

  const duplicateManager = svc.validateReportingChain({ tenantSlug: 'tabsons', employeeId: 'MULTI-1' }, hrContext);
  assert.equal(duplicateManager.success, false, 'duplicate manager assignments must be blocked');
  assert.ok(duplicateManager.issues.some(issue => issue.code === 'DUPLICATE_MANAGER_ASSIGNMENT'));

  const managerTree = svc.generateManagerTree({ tenantSlug: 'tabsons', managerId: 'MGR-1' }, { actor: { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER' }, tenantSlug: 'tabsons' });
  assert.equal(managerTree.success, true, 'manager can view own team hierarchy');
  assert.ok(managerTree.nodes.some(node => node.employeeId === 'LEAD-1'), 'manager tree includes direct reports');
  assert.ok(managerTree.nodes.some(node => node.employeeId === 'EMP-1'), 'manager tree includes indirect reports');
  assert.ok(!managerTree.nodes.some(node => node.employeeId === 'CEO-1'), 'manager tree should not expose upstream leadership as team data');

  const employeeView = svc.buildOrgChart({ tenantSlug: 'tabsons', employeeId: 'EMP-1', viewMode: 'reporting' }, { actor: { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeView.success, true, 'employee can view own reporting chain');
  assert.deepEqual(employeeView.nodes.map(node => node.employeeId), ['CEO-1', 'DIR-1', 'MGR-1', 'LEAD-1', 'EMP-1']);
  assert.ok(!employeeView.nodes.some(node => node.employeeId === 'EMP-2'), 'employee view must not expose peer reporting data');

  const platformView = svc.buildOrgChart({ tenantSlug: 'tabsons', viewMode: 'leadership' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformView.success, true, 'platform owner can review hierarchy governance');
  assert.equal(platformView.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformView.nodes.every(node => /^Governance Node/.test(node.name)), 'platform owner view must be governance-only and anonymized');

  const crossTenant = svc.buildOrgChart({ tenantSlug: 'abc', viewMode: 'tree' }, { actor: { id: 'HR-ABC', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, true, 'other tenant can build only its own chart');
  assert.ok(crossTenant.nodes.some(node => node.employeeId === 'ABC-CEO'));
  assert.ok(!crossTenant.nodes.some(node => node.employeeId === 'EMP-1'));
  assert.doesNotMatch(text(crossTenant), /Ada CEO|Esha Engineer|1000000|"leaveBalance"/i, 'cross-tenant output must not leak Tabsons data');

  const health = svc.calculateHierarchyHealth({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(health.success, true, 'hierarchy health analytics should be generated');
  assert.ok(health.organizationalHealthScore >= 0);
  assert.ok(health.hierarchyQualityScore >= 0);
  assert.ok(health.reportingEfficiencyScore >= 0);
  assert.ok(health.analytics.managerSpanOfControl.max >= 0);
  assert.ok(Object.isFrozen(health), 'health output must be immutable');

  const malformed = svc.buildOrgChart(null, { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' });
  assert.equal(malformed.success, true, 'malformed payloads should degrade safely to tenant context');

  const denied = svc.buildOrgChart({ tenantSlug: 'tabsons' }, { actor: { id: 'SA-1', role: 'SUPER_ADMIN' }, tenantSlug: 'tabsons' });
  assert.equal(denied.success, false, 'SUPER_ADMIN must not receive business hierarchy visibility');
  assert.ok(denied.issues.some(issue => issue.code === 'HIERARCHY_ACCESS_DENIED'));

  const data = global.DB.get();
  assert.ok(data.managerHierarchyHistory.length >= 1, 'hierarchy history should be preserved immutably');
  assert.ok(data.reportingHierarchyHistory.length >= 1, 'reporting history should be preserved immutably');
  assert.ok(data.hierarchyAnalyticsReports.length >= 1, 'hierarchy analytics should be preserved immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /HIERARCHY_/.test(row.actionType || row.action || '')), 'hierarchy actions should be audited');
}

main();
