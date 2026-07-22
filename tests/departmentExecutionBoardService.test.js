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
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0', platform: 'Win32' };
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

function seedExecutionData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-28';
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
    { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-3', empId: 'EMP-3', role: 'EMPLOYEE', department: 'HR', managerId: 'MGR-2', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-4', empId: 'EMP-4', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-3', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-2', empId: 'MGR-2', role: 'MANAGER', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-3', empId: 'MGR-3', role: 'MANAGER', department: 'Finance', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', deliverableId: 'DEL-1', milestoneId: 'MS-1', state: 'IN_PROGRESS', dueDate: '2026-05-20', progressPercent: 40, workloadUnits: 5, kpiId: 'KPI-1', ownershipChanges: 1, strategicNotes: 'confidential engineering execution' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-2', milestoneId: 'MS-2', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, kpiId: 'KPI-2', ownershipChanges: 2, blockerType: 'DEPENDENCY' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-4', milestoneId: 'MS-4', state: 'ESCALATED', dueDate: '2026-05-12', progressPercent: 10, workloadUnits: 8, kpiId: 'KPI-4', ownershipChanges: 3 },
    { executionId: 'EX-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', deliverableId: 'DEL-3', milestoneId: 'MS-3', state: 'REVIEW_PENDING', dueDate: '2026-05-18', progressPercent: 65, workloadUnits: 2, kpiId: 'KPI-3' },
    { executionId: 'EX-5', tenantSlug: 'tabsons', department: 'Finance', empId: 'EMP-4', ownerId: 'MGR-3', deliverableId: 'DEL-5', milestoneId: 'MS-5', state: 'COMPLETED', dueDate: '2026-05-25', progressPercent: 100, workloadUnits: 1, kpiId: 'KPI-5' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', deliverableId: 'DEL-X', milestoneId: 'MS-X', state: 'BLOCKED', dueDate: '2026-05-05', progressPercent: 5, workloadUnits: 10, strategicNotes: 'ABC confidential execution chain' }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Engineering', deadlineDate: '2026-05-20', progressPercent: 40, governanceState: 'IN_PROGRESS', kpiId: 'KPI-1', strategicNotes: 'confidential engineering roadmap' },
    { id: 'DEL-2', deliverableId: 'DEL-2', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Operations', deadlineDate: '2026-05-15', progressPercent: 20, governanceState: 'BLOCKED', dependsOn: ['DEL-1'], kpiId: 'KPI-2', strategicNotes: 'private operations blocker' },
    { id: 'DEL-3', deliverableId: 'DEL-3', tenantSlug: 'tabsons', empId: 'EMP-3', reviewerId: 'MGR-2', strategicOwnerId: 'HRH-1', department: 'HR', deadlineDate: '2026-05-18', progressPercent: 65, governanceState: 'REVIEW_PENDING', dependsOn: ['DEL-2'], kpiId: 'KPI-3' },
    { id: 'DEL-4', deliverableId: 'DEL-4', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Operations', deadlineDate: '2026-05-12', progressPercent: 10, governanceState: 'ESCALATED', dependsOn: ['DEL-3'], kpiId: 'KPI-4' },
    { id: 'DEL-5', deliverableId: 'DEL-5', tenantSlug: 'tabsons', empId: 'EMP-4', reviewerId: 'MGR-3', strategicOwnerId: 'MGR-3', department: 'Finance', deadlineDate: '2026-05-25', progressPercent: 100, governanceState: 'COMPLETED', kpiId: 'KPI-5' },
    { id: 'DEL-X', deliverableId: 'DEL-X', tenantSlug: 'abc', empId: 'EMP-X', reviewerId: 'MGR-X', strategicOwnerId: 'MGR-X', department: 'Finance', deadlineDate: '2026-05-01', progressPercent: 5, governanceState: 'BLOCKED', strategicNotes: 'ABC confidential deliverable' }
  ];
  data.deliverableTimelineRecords = [
    { timelineId: 'TL-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', empId: 'EMP-1', ownerId: 'MGR-1', department: 'Engineering', state: 'IN_PROGRESS', dueDate: '2026-05-20', progressPercent: 40, kpiId: 'KPI-1' },
    { timelineId: 'TL-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', empId: 'EMP-2', ownerId: 'MGR-1', department: 'Operations', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, dependencyIds: ['MS-1'], kpiId: 'KPI-2' },
    { timelineId: 'TL-3', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-3', empId: 'EMP-3', ownerId: 'MGR-2', department: 'HR', state: 'REVIEW_PENDING', dueDate: '2026-05-18', progressPercent: 65, dependencyIds: ['MS-2'], kpiId: 'KPI-3' },
    { timelineId: 'TL-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', empId: 'EMP-X', ownerId: 'MGR-X', department: 'Finance', state: 'BLOCKED', dueDate: '2026-05-05', progressPercent: 5, strategicNotes: 'ABC confidential timeline' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependsOnDeliverableId: 'DEL-1', sourceDepartment: 'Operations', targetDepartment: 'Engineering', ownerId: 'MGR-1', empId: 'EMP-2', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-15', kpiId: 'KPI-2' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-4', dependsOnDeliverableId: 'DEL-3', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', empId: 'EMP-2', state: 'AT_RISK', status: 'WAITING', dueDate: '2026-05-12', kpiId: 'KPI-4' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', sourceDepartment: 'Finance', targetDepartment: 'Finance', ownerId: 'MGR-X', empId: 'EMP-X', state: 'BLOCKED', status: 'BLOCKED', strategicNotes: 'ABC confidential dependency' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', empId: 'EMP-1', kpiId: 'KPI-1', state: 'MANAGER_REVIEW_PENDING', weightage: 30 },
    { id: 'PG-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', empId: 'EMP-2', kpiId: 'KPI-2', state: 'HR_REVIEW_PENDING', weightage: 40 },
    { id: 'PG-X', tenantSlug: 'abc', deliverableId: 'DEL-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', deliverableId: 'DEL-2', executionId: 'EX-2', escalationType: 'EXECUTION_BLOCKED', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', deliverableId: 'DEL-4', executionId: 'EX-3', escalationType: 'REPEATED_EXECUTION_DELAY', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', deliverableId: 'DEL-X', executionId: 'EX-X', escalationType: 'ABC_PRIVATE_EXECUTION', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowDiscussions = [
    { discussionId: 'WD-1', tenantSlug: 'tabsons', workflowType: 'DEPARTMENT_EXECUTION', workflowId: 'EX-2', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-2', tenantSlug: 'tabsons', workflowType: 'STRATEGIC_DELIVERABLE', workflowId: 'DEL-4', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-X', tenantSlug: 'abc', workflowType: 'DEPARTMENT_EXECUTION', workflowId: 'EX-X', state: 'ACTIVE', privateNote: 'ABC confidential discussion' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-EX-1', tenantSlug: 'tabsons', correlationId: 'EX-2', type: 'EXECUTION_BLOCKED', status: 'DEGRADED', module: 'Department Execution', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-EX-2', tenantSlug: 'tabsons', correlationId: 'EX-3', type: 'OWNERSHIP_CONGESTION', status: 'DEGRADED', module: 'Department Execution', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'EX-X', type: 'ABC_PRIVATE_EXECUTION', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/asyncJobService.js',
    'services/tenantIsolationService.js',
    'services/workflowEngine.js',
    'services/deliverableGovernanceService.js',
    'services/strategicReviewService.js',
    'services/escalationCommandService.js',
    'services/performanceGovernanceService.js',
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/deliverableTimelineService.js',
    'services/strategicDependencyService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/departmentExecutionBoardService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedExecutionData();

  const svc = global.DepartmentExecutionBoardService;
  assert.ok(svc, 'DepartmentExecutionBoardService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.EXECUTION_STATES), 'execution states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_DEPARTMENT_EXECUTION_SELF_TEST__.passed, true, 'development self-test should cover execution failure cases');

  assert.equal(svc.classifyExecutionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyExecutionRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyExecutionRisk({ unsafeOwnershipOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyExecutionRisk({ blockedExecution: true }), 'HIGH_RISK');
  assert.equal(svc.classifyExecutionRisk({ workloadImbalance: true }), 'WARNING');

  const employeeAssigned = svc.validateExecutionBoardScope({ tenantSlug: 'tabsons', empId: 'EMP-2', executionId: 'EX-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned execution');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_EXECUTION_ONLY');

  const managerTeam = svc.validateExecutionBoardScope({ tenantSlug: 'tabsons', empId: 'EMP-3', executionId: 'EX-4' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-2', empId: 'MGR-2' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may view team execution');
  assert.equal(managerTeam.visibility, 'TEAM_EXECUTION_VISIBILITY');

  const superAdminOverride = svc.validateExecutionBoardScope({ tenantSlug: 'tabsons', executionId: 'EX-2', empId: 'EMP-2', ownershipOverride: true, strategicNotes: 'private ownership note' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify department execution ownership');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_EXECUTION_OWNERSHIP_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /EX-2|EMP-2|private ownership|strategicNotes/i);

  const platformScope = svc.validateExecutionBoardScope({ tenantSlug: 'tabsons', executionId: 'EX-2', empId: 'EMP-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in operational execution chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_OPERATIONAL_CHAIN_BLOCKED'));

  const crossTenant = svc.validateExecutionBoardScope({ tenantSlug: 'abc', executionId: 'EX-X', empId: 'EMP-X', strategicNotes: 'ABC confidential execution chain' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant execution visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /EX-X|EMP-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validateExecutionBoardScope({ tenantSlug: 'tabsons', executionId: 'EX-ARCH', state: 'ARCHIVED', ownershipOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived execution mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_EXECUTION_MUTATION_BLOCKED'));

  const malformed = svc.normalizeExecutionPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed execution payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_EXECUTION_PAYLOAD'));

  const normalized = svc.normalizeExecutionPayload({
    tenantSlug: 'tabsons',
    executionId: 'EX-2',
    deliverableId: 'DEL-2',
    empId: 'EMP-2',
    state: 'in progress',
    department: 'Operations',
    strategicNotes: 'private ownership note'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid execution payload should normalize');
  assert.equal(normalized.payload.state, 'IN_PROGRESS');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /EX-2|DEL-2|EMP-2|private ownership|strategicNotes/i);

  const accountability = svc.evaluateAccountabilityGovernance({
    tenantSlug: 'tabsons',
    executionId: 'EX-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    state: 'BLOCKED'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(accountability.success, true, 'accountability governance should evaluate safely');
  assert.equal(accountability.accountabilityGovernance.workloadBalancing, true);
  assert.equal(accountability.accountabilityGovernance.unsafeOwnershipOverridesBlocked, true);
  assert.equal(accountability.accountabilityGovernance.ownershipAuditTrails, true);

  const workload = svc.analyzeWorkloadDistribution({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(workload.success, true, 'workload distribution should work');
  assert.ok(workload.summary.overloadedTeams >= 1);
  assert.ok(workload.summary.underutilizedExecutionCapacity >= 1);
  assert.ok(workload.summary.delayedOwnershipResponse >= 1);
  assert.ok(workload.summary.workloadCongestion >= 1);
  assert.ok(workload.summary.executionImbalance >= 1);
  assert.ok(workload.summary.bottleneckOwnershipConcentration >= 1);
  assert.ok(Object.isFrozen(workload.signals), 'workload signals must be immutable');
  assert.doesNotMatch(JSON.stringify(workload), /EX-X|EMP-X|ABC confidential|confidential engineering|strategicNotes/i);

  const bottlenecks = svc.detectOperationalBottlenecks({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(bottlenecks.success, true, 'bottleneck detection should work');
  assert.ok(bottlenecks.summary.blockedExecutionChains >= 1);
  assert.ok(bottlenecks.summary.repeatedEscalations >= 1);
  assert.ok(bottlenecks.summary.dependencyLinkedDelays >= 1);
  assert.ok(bottlenecks.summary.unresolvedOperationalBottlenecks >= 1);
  assert.ok(bottlenecks.summary.executionStagnation >= 1);
  assert.ok(bottlenecks.summary.accountabilityFailures >= 1);
  assert.ok(Object.isFrozen(bottlenecks.signals), 'bottleneck signals must be immutable');

  const escalated = svc.escalateBlockedExecution({
    tenantSlug: 'tabsons',
    executionId: 'EX-2',
    deliverableId: 'DEL-2',
    empId: 'EMP-2',
    state: 'BLOCKED',
    dueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'blocked execution escalation should be governed');
  assert.equal(escalated.blockedExecutionEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /EX-2|DEL-2|EMP-2/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    departmentExecutionRecords: before.departmentExecutionRecords,
    strategicDeliverables: before.strategicDeliverables,
    deliverableTimelineRecords: before.deliverableTimelineRecords,
    deliverableDependencies: before.deliverableDependencies,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations
  });
  const report = svc.generateDepartmentExecutionReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'department execution report should generate');
  assert.equal(report.readOnly, true, 'department execution report must be read-only');
  assert.ok(report.executionBoardHealth.totalExecutions >= 5);
  assert.ok(report.executionBoardHealth.blockedExecutions >= 1);
  assert.ok(report.executionBoardHealth.completedExecutions >= 1);
  assert.ok(report.workloadDistribution.overloadedTeams >= 1);
  assert.ok(report.workloadDistribution.workloadCongestion >= 1);
  assert.ok(report.accountabilityGovernance.ownershipAssignments >= 1);
  assert.equal(report.accountabilityGovernance.unsafeOwnershipOverride, false);
  assert.equal(report.accountabilityGovernance.historicalExecutionImmutable, true);
  assert.ok(report.bottleneckIntelligence.blockedExecutionChains >= 1);
  assert.ok(report.bottleneckIntelligence.dependencyLinkedDelays >= 1);
  assert.ok(report.kpiPerformanceIntegration.kpiLinkedExecutions >= 1);
  assert.equal(report.kpiPerformanceIntegration.unsafeKpiMutation, false);
  assert.ok(report.workflowCommunicationIntegration.executionLinkedCollaboration >= 1);
  assert.ok(report.executionAnalytics.completionRate >= 0);
  assert.ok(report.executionAnalytics.executionVelocity >= 0);
  assert.ok(report.executionAnalytics.escalationFrequency >= 1);
  assert.ok(report.executionAnalytics.ownershipChanges >= 1);
  assert.ok(report.executionAnalytics.workloadImbalance >= 1);
  assert.ok(report.executionAnalytics.blockedExecutionTrends >= 1);
  assert.ok(report.executionAnalytics.departmentExecutionHealth >= 0);
  assert.equal(report.accessGovernance.superAdminExecutionOwnershipAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerOperationalChain, false);
  assert.ok(report.integrationHealth.strategicDependencyIntegrated, 'StrategicDependencyService integration should be detected');
  assert.ok(report.integrationHealth.deliverableTimelineIntegrated, 'DeliverableTimelineService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /EX-X|DEL-X|EMP-X|ABC confidential|private operations|confidential engineering|strategicNotes|salary|payroll/i);
  assert.equal(JSON.stringify({
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    strategicDeliverables: global.DB.get().strategicDeliverables,
    deliverableTimelineRecords: global.DB.get().deliverableTimelineRecords,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'execution report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /EXECUTION|DEPARTMENT_EXECUTION/.test(row.eventType || row.category || '')), 'execution telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.DEPARTMENT_EXECUTION_REPORTED, 'execution metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /EXECUTION|DEPARTMENT_EXECUTION/.test(row.actionType || row.action || '')), 'execution actions should be audited safely');

  const originalDependency = global.StrategicDependencyService;
  const originalTimeline = global.DeliverableTimelineService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalCommunication = global.CommunicationGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.StrategicDependencyService;
    delete global.DeliverableTimelineService;
    delete global.PerformanceGovernanceService;
    delete global.CommunicationGovernanceService;
    delete global.EscalationCommandService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateDepartmentExecutionReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing execution integrations should degrade safely');
    assert.equal(degraded.integrationHealth.strategicDependencyIntegrated, false);
    assert.equal(degraded.integrationHealth.deliverableTimelineIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowDiscussionIntegrated, false);
  } finally {
    if (originalDependency) global.StrategicDependencyService = originalDependency;
    if (originalTimeline) global.DeliverableTimelineService = originalTimeline;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
  }

  console.log('departmentExecutionBoardService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
