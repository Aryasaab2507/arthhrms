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
  global.navigator = { userAgent: 'Node leave policy configuration test', platform: 'Win32' };
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

function seedLeavePolicyData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    country: 'IN'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha Rao', email: 'asha@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', dateOfJoining: '2024-01-15', leaveBalance: 12, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Ravi HR', email: 'ravi@example.com', role: 'HR', department: 'HR', businessUnit: 'People', branch: 'Mumbai', location: 'Mumbai', employeeGrade: 'G6', employmentType: 'FULL_TIME', dateOfJoining: '2023-04-01', leaveBalance: 20, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G8', employmentType: 'FULL_TIME', dateOfJoining: '2020-01-01', leaveBalance: 15, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'EMPLOYEE', department: 'Finance', businessUnit: 'Finance', branch: 'ABC HQ', location: 'Delhi', employeeGrade: 'G5', employmentType: 'FULL_TIME', leaveBalance: 99, privateNote: 'ABC confidential leave policy data', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.departments = [
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ABC', name: 'Finance', tenantSlug: 'abc', active: true }
  ];
  data.businessUnits = [
    { businessUnitId: 'BU-PROD', name: 'Product', tenantSlug: 'tabsons', active: true },
    { businessUnitId: 'BU-PEOPLE', name: 'People', tenantSlug: 'tabsons', active: true }
  ];
  data.companyBranches = [
    { branchId: 'BR-BLR', branchName: 'Bengaluru', tenantSlug: 'tabsons', active: true },
    { branchId: 'BR-MUM', branchName: 'Mumbai', tenantSlug: 'tabsons', active: true }
  ];
  data.companyLocations = [
    { locationId: 'LOC-BLR', locationName: 'Bengaluru', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-MUM', locationName: 'Mumbai', tenantSlug: 'tabsons', active: true }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', leaveType: 'Annual Leave', totalDays: 2, status: 'Approved', appliedOn: '2026-01-10' },
    { leaveId: 'LV-2', empId: 'EMP-2', tenantSlug: 'tabsons', leaveType: 'Sick Leave', totalDays: 1, status: 'Pending', appliedOn: '2026-02-10' },
    { leaveId: 'LV-X', empId: 'ABC-1', tenantSlug: 'abc', leaveType: 'Annual Leave', totalDays: 10, status: 'Approved', reason: 'ABC confidential leave', appliedOn: '2026-01-10' }
  ];
  data.reportingHierarchyRelationships = [
    { relationshipId: 'REL-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', managerId: 'MGR-1', relationshipType: 'DIRECT_MANAGER', active: true }
  ];
  data.leavePolicyDefinitions = [];
  data.leavePolicyVersions = [];
  data.leavePolicyRollbacks = [];
  data.leavePolicySimulations = [];
  data.leavePolicyAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    leaveRequests: data.leaveRequests,
    reportingHierarchyRelationships: data.reportingHierarchyRelationships
  });
}

function validPolicy(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    policyName: 'India Engineering Leave Policy',
    policyCode: 'IN-ENG-2026',
    description: 'Engineering leave policy',
    effectiveDate: '2026-01-01',
    expiryDate: '2026-12-31',
    status: 'DRAFT',
    priority: 10,
    leaveTypes: [
      { type: 'Annual Leave', code: 'AL', annualAllowance: 24, allowHalfDay: true },
      { type: 'Sick Leave', code: 'SL', annualAllowance: 12 },
      { type: 'Work From Home', code: 'WFH', annualAllowance: 24 }
    ],
    eligibility: {
      companies: ['Tabsons'],
      businessUnits: ['Product'],
      departments: ['Engineering'],
      locations: ['Bengaluru'],
      branches: ['Bengaluru'],
      grades: ['G5', 'G6'],
      employmentTypes: ['FULL_TIME'],
      roles: ['EMPLOYEE'],
      employees: []
    },
    accrualRules: {
      type: 'MONTHLY',
      daysPerPeriod: 2,
      joiningDateBased: true,
      probationBased: true,
      probationMonths: 3,
      anniversaryBased: false,
      manualAllocation: false
    },
    carryForward: {
      enabled: true,
      maxDays: 10,
      expiryMonths: 3,
      partialCarryForward: true,
      unlimited: false
    },
    encashment: {
      enabled: true,
      maxDays: 8,
      minBalance: 5,
      taxRule: 'STANDARD',
      approvalRequired: true
    },
    approvalRules: {
      mode: 'SEQUENTIAL',
      levels: [
        { order: 1, approverType: 'IMMEDIATE_MANAGER' },
        { order: 2, approverType: 'HR' },
        { order: 3, approverType: 'DIRECTOR' }
      ],
      autoApproval: false
    },
    ...overrides
  };
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/reportingHierarchyService.js',
    'services/leaveAttendanceGovernanceService.js'
  ].forEach(load);
  seedLeavePolicyData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/leavePolicyConfigurationService.js');

  const svc = global.LeavePolicyConfigurationService;
  assert.ok(svc, 'LeavePolicyConfigurationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.LEAVE_TYPES), 'leave types must be immutable');
  assert.equal(global.__ARTHHRMS_LEAVE_POLICY_CONFIGURATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'createLeavePolicy',
    'updateLeavePolicy',
    'publishLeavePolicy',
    'rollbackLeavePolicy',
    'evaluateEligibility',
    'calculateAccrualProjection',
    'configureApprovalRules',
    'validateLeavePolicy',
    'simulateLeavePolicy',
    'generateLeaveAnalytics',
    'generatePolicyDashboard',
    'freezeLeavePolicyOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.LeavePolicyService, svc, 'LeavePolicyService alias should be available');
  assert.equal(global.LeaveAccrualEngine, svc, 'LeaveAccrualEngine alias should be available');
  assert.equal(global.LeaveEligibilityService, svc, 'LeaveEligibilityService alias should be available');
  assert.equal(global.LeaveApprovalConfigurator, svc, 'LeaveApprovalConfigurator alias should be available');
  assert.equal(global.LeavePolicyValidator, svc, 'LeavePolicyValidator alias should be available');
  assert.equal(global.LeaveSimulationService, svc, 'LeaveSimulationService alias should be available');
  assert.equal(global.LeaveAnalyticsService, svc, 'LeaveAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const before = protectedSnapshot();

  const created = svc.createLeavePolicy(validPolicy(), hrContext);
  assert.equal(created.success, true, 'leave policy creation should work');
  assert.equal(created.policy.status, 'DRAFT');
  assert.equal(created.policy.version, 1);
  assert.equal(created.governance.leaveBalancesUnaffected, true);
  assert.ok(created.policy.leaveTypes.some(row => row.type === 'ANNUAL_LEAVE'));
  assert.ok(Object.isFrozen(created), 'created policy output must be immutable');
  assert.equal(protectedSnapshot(), before, 'policy creation must not mutate leave balances or leave workflows');

  const duplicate = svc.createLeavePolicy(validPolicy({ policyName: 'Duplicate Policy' }), hrContext);
  assert.equal(duplicate.success, false, 'duplicate policy code should be blocked');
  assert.ok(duplicate.issues.some(issue => issue.code === 'DUPLICATE_POLICY_CODE'));

  const invalid = svc.validateLeavePolicy(validPolicy({
    policyCode: 'BAD-POLICY',
    effectiveDate: '2026-12-31',
    expiryDate: '2026-01-01',
    accrualRules: { type: 'BAD_RULE', daysPerPeriod: -2 },
    carryForward: { enabled: true, maxDays: -5 },
    encashment: { enabled: true, maxDays: 20, minBalance: -1 },
    approvalRules: { mode: 'SEQUENTIAL', levels: [{ order: 1, approverType: 'IMMEDIATE_MANAGER' }, { order: 2, approverType: 'IMMEDIATE_MANAGER' }] }
  }), hrContext);
  assert.equal(invalid.success, false, 'invalid policy should fail validation');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_DATE_RANGE'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_ACCRUAL_RULE'));
  assert.ok(invalid.issues.some(issue => issue.code === 'NEGATIVE_CARRY_FORWARD'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_ENCASHMENT_RULE'));
  assert.ok(invalid.issues.some(issue => issue.code === 'CIRCULAR_APPROVAL_CHAIN'));

  const policyId = created.policy.policyId;
  const eligibility = svc.evaluateEligibility({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-1' }, hrContext);
  assert.equal(eligibility.success, true, 'eligibility evaluation should run');
  assert.equal(eligibility.eligible, true, 'employee should match policy eligibility');
  assert.ok(eligibility.matchedCriteria.includes('department'));
  assert.equal(eligibility.readOnly, true);

  const ineligible = svc.evaluateEligibility({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-2' }, hrContext);
  assert.equal(ineligible.success, true);
  assert.equal(ineligible.eligible, false, 'HR employee should not match engineering policy');

  const accrual = svc.calculateAccrualProjection({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-1', asOfDate: '2026-06-30' }, hrContext);
  assert.equal(accrual.success, true, 'accrual projection should work');
  assert.ok(accrual.projectedAccrualDays > 0);
  assert.equal(accrual.accrualType, 'MONTHLY');
  assert.equal(accrual.readOnly, true);

  const approval = svc.configureApprovalRules({
    tenantSlug: 'tabsons',
    policyId,
    approvalRules: {
      mode: 'PARALLEL',
      levels: [
        { order: 1, approverType: 'IMMEDIATE_MANAGER' },
        { order: 1, approverType: 'HR' }
      ],
      autoApproval: false
    },
    reason: 'Parallel approval pilot'
  }, hrContext);
  assert.equal(approval.success, true, 'approval rules should update');
  assert.equal(approval.policy.approvalRules.mode, 'PARALLEL');
  assert.equal(approval.policy.version, 2);

  const published = svc.publishLeavePolicy({ tenantSlug: 'tabsons', policyId, approval: { approved: true, approvedBy: 'DIR-1', reason: 'Ready for go-live' } }, directorContext);
  assert.equal(published.success, true, 'policy publish should work with approval');
  assert.equal(published.policy.status, 'PUBLISHED');
  assert.equal(published.policy.version, 3);

  const simulation = svc.simulateLeavePolicy({
    tenantSlug: 'tabsons',
    policyId,
    employeeId: 'EMP-1',
    scenario: 'PROMOTION',
    changes: { employeeGrade: 'G6', department: 'Engineering' },
    months: 12
  }, hrContext);
  assert.equal(simulation.success, true, 'policy simulation should work');
  assert.equal(simulation.scenario, 'PROMOTION');
  assert.ok(simulation.projectedLeaveBalances.some(row => row.leaveType === 'ANNUAL_LEAVE'));
  assert.ok(simulation.projectedLeaveBalances.every(row => typeof row.projectedDays === 'number'));
  assert.equal(simulation.readOnly, true);
  assert.equal(simulation.employeeLeaveBalancesModified, false);
  assert.equal(protectedSnapshot(), before, 'simulation must not mutate existing employee leave balances or workflows');

  const updated = svc.updateLeavePolicy({ tenantSlug: 'tabsons', policyId, changes: { carryForward: { enabled: true, maxDays: 15, expiryMonths: 6 }, reason: 'Increase carry forward cap' } }, hrContext);
  assert.equal(updated.success, true, 'policy update should create a new version');
  assert.equal(updated.policy.version, 4);
  assert.equal(updated.policy.carryForward.maxDays, 15);

  const rollback = svc.rollbackLeavePolicy({ tenantSlug: 'tabsons', policyId, targetVersion: 3, reason: 'Rollback drill', approval: { approved: true, approvedBy: 'DIR-1', reason: 'Rollback drill' } }, directorContext);
  assert.equal(rollback.success, true, 'policy rollback should work');
  assert.equal(rollback.policy.version, 5);
  assert.equal(rollback.policy.carryForward.maxDays, 10);
  assert.equal(protectedSnapshot(), before, 'rollback must not mutate leave balances or leave workflows');

  const analytics = svc.generateLeaveAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'leave policy analytics should generate');
  assert.ok(analytics.analytics.policyCount >= 1);
  assert.ok(analytics.analytics.policyUsage >= 1);
  assert.ok(analytics.leavePolicyHealthScore >= 0);
  assert.ok(analytics.complianceScore >= 0);

  const dashboard = svc.generatePolicyDashboard({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.policyLibrary.length >= 1);
  assert.ok(dashboard.eligibilityMatrix.length >= 1);
  assert.ok(dashboard.approvalMatrix.length >= 1);
  assert.ok(dashboard.accrualRules.length >= 1);
  assert.ok(dashboard.simulation.latestSupportedScenarios.includes('PROMOTION'));
  assert.equal(dashboard.compatibility.existingLeaveWorkflowsPreserved, true);
  assert.equal(dashboard.compatibility.leaveBalancesUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC confidential|ABC Employee|abc@example.com|99|privateNote/i, 'dashboard must be tenant scoped and sanitized');

  const employeeBlocked = svc.createLeavePolicy(validPolicy({ policyCode: 'EMP-BLOCKED' }), employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot configure leave policies');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'LEAVE_POLICY_ACCESS_DENIED'));

  const crossTenant = svc.generatePolicyDashboard({ tenantSlug: 'abc' }, hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant policy access must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_LEAVE_POLICY_BLOCKED'));

  assert.ok(global.DB.get().leavePolicyDefinitions.length >= 1, 'leave policies should be persisted');
  assert.ok(global.DB.get().leavePolicyVersions.length >= 1, 'leave policy versions should be persisted');
  assert.ok(global.DB.get().leavePolicyRollbacks.length >= 1, 'leave policy rollback history should be persisted');
  assert.ok(global.DB.getAuditLogs().some(row => /LEAVE_POLICY/.test(row.actionType || row.action || '')), 'leave policy actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /LEAVE_POLICY/.test(row.eventType || row.category || '')), 'leave policy telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.LEAVE_POLICY_CREATED, 'leave policy metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'leave-policy-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Leave Policy Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Leave Policy Center/i);
  assert.match(dashboardHtml, /Eligibility Matrix/i);
  assert.match(dashboardHtml, /Accrual Rules/i);
  assert.match(dashboardHtml, /LeavePolicyConfigurationService/i);

  console.log('leavePolicyConfigurationService.test.js passed');
}

main();
