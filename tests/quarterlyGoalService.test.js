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

function seedGoalData() {
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
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-2', empId: 'MGR-2', role: 'MANAGER', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.quarterlyGoals = [
    { goalId: 'QG-1', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', objectiveType: 'QUARTERLY_GOAL', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-1', milestoneId: 'MS-1', deliverableId: 'DEL-1', state: 'ACTIVE', progressPercent: 55, dueDate: '2026-06-30', checkpointCount: 2, strategicNotes: 'confidential engineering objective' },
    { goalId: 'QG-2', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', objectiveType: 'DEPARTMENT_OBJECTIVE', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-2', milestoneId: 'MS-2', deliverableId: 'DEL-2', state: 'AT_RISK', progressPercent: 20, dueDate: '2026-05-15', checkpointCount: 1, blockerType: 'DEPENDENCY', strategicNotes: 'private operations goal blocker' },
    { goalId: 'QG-3', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'HR', objectiveType: 'KPI_LINKED_OBJECTIVE', ownerId: 'EMP-3', accountabilityOwnerId: 'MGR-2', kpiId: 'KPI-3', milestoneId: 'MS-3', deliverableId: 'DEL-3', state: 'REVIEW_PENDING', progressPercent: 75, dueDate: '2026-06-15', checkpointCount: 3 },
    { goalId: 'QG-4', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', objectiveType: 'ESCALATION_LINKED_OBJECTIVE', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-4', milestoneId: 'MS-4', deliverableId: 'DEL-4', state: 'ESCALATED', progressPercent: 10, dueDate: '2026-05-10', checkpointCount: 1, escalationId: 'ESC-1' },
    { goalId: 'QG-5', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', objectiveType: 'STRATEGIC_MILESTONE', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-5', milestoneId: 'MS-5', deliverableId: 'DEL-5', state: 'COMPLETED', progressPercent: 100, dueDate: '2026-05-25', checkpointCount: 4 },
    { goalId: 'QG-ARCH', tenantSlug: 'tabsons', quarter: '2026-Q1', department: 'Engineering', objectiveType: 'QUARTERLY_GOAL', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-ARCH', state: 'ARCHIVED', progressPercent: 100, archivedAt: '2026-04-01T00:00:00.000Z', strategicNotes: 'immutable archived note' },
    { goalId: 'QG-X', tenantSlug: 'abc', quarter: '2026-Q2', department: 'Finance', objectiveType: 'QUARTERLY_GOAL', ownerId: 'EMP-X', accountabilityOwnerId: 'MGR-X', kpiId: 'KPI-X', milestoneId: 'MS-X', deliverableId: 'DEL-X', state: 'AT_RISK', progressPercent: 5, dueDate: '2026-05-05', strategicNotes: 'ABC confidential strategic goal' }
  ];
  data.strategicObjectives = [
    { objectiveId: 'OBJ-1', tenantSlug: 'tabsons', goalId: 'QG-1', department: 'Engineering', ownerId: 'EMP-1', kpiId: 'KPI-1', state: 'ACTIVE', progressPercent: 55 },
    { objectiveId: 'OBJ-2', tenantSlug: 'tabsons', goalId: 'QG-2', department: 'Operations', ownerId: 'EMP-2', kpiId: 'KPI-2', state: 'AT_RISK', progressPercent: 20, dueDate: '2026-05-15' },
    { objectiveId: 'OBJ-X', tenantSlug: 'abc', goalId: 'QG-X', department: 'Finance', ownerId: 'EMP-X', kpiId: 'KPI-X', state: 'AT_RISK', strategicNotes: 'ABC confidential objective' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', goalId: 'QG-1', deliverableId: 'DEL-1', empId: 'EMP-1', kpiId: 'KPI-1', state: 'MANAGER_REVIEW_PENDING', progressPercent: 55, score: 72 },
    { id: 'PG-2', tenantSlug: 'tabsons', goalId: 'QG-2', deliverableId: 'DEL-2', empId: 'EMP-2', kpiId: 'KPI-2', state: 'HR_REVIEW_PENDING', progressPercent: 20, score: 38, degraded: true },
    { id: 'PG-X', tenantSlug: 'abc', goalId: 'QG-X', deliverableId: 'DEL-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', goalId: 'QG-1', empId: 'EMP-1', ownerId: 'MGR-1', deliverableId: 'DEL-1', milestoneId: 'MS-1', state: 'IN_PROGRESS', dueDate: '2026-06-10', progressPercent: 55, workloadUnits: 5, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', goalId: 'QG-2', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-2', milestoneId: 'MS-2', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, kpiId: 'KPI-2' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', goalId: 'QG-4', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-4', milestoneId: 'MS-4', state: 'ESCALATED', dueDate: '2026-05-10', progressPercent: 10, workloadUnits: 8, kpiId: 'KPI-4' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', goalId: 'QG-X', empId: 'EMP-X', ownerId: 'MGR-X', deliverableId: 'DEL-X', milestoneId: 'MS-X', state: 'BLOCKED', dueDate: '2026-05-05', progressPercent: 5, workloadUnits: 10, strategicNotes: 'ABC confidential execution chain' }
  ];
  data.deliverableTimelineRecords = [
    { timelineId: 'TL-1', tenantSlug: 'tabsons', goalId: 'QG-1', deliverableId: 'DEL-1', milestoneId: 'MS-1', empId: 'EMP-1', ownerId: 'MGR-1', department: 'Engineering', state: 'ACTIVE', dueDate: '2026-06-10', progressPercent: 55, kpiId: 'KPI-1' },
    { timelineId: 'TL-2', tenantSlug: 'tabsons', goalId: 'QG-2', deliverableId: 'DEL-2', milestoneId: 'MS-2', empId: 'EMP-2', ownerId: 'MGR-1', department: 'Operations', state: 'AT_RISK', dueDate: '2026-05-15', progressPercent: 20, dependencyIds: ['MS-1'], kpiId: 'KPI-2' },
    { timelineId: 'TL-X', tenantSlug: 'abc', goalId: 'QG-X', deliverableId: 'DEL-X', milestoneId: 'MS-X', empId: 'EMP-X', ownerId: 'MGR-X', department: 'Finance', state: 'DELAYED', dueDate: '2026-05-05', progressPercent: 5, strategicNotes: 'ABC confidential timeline' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', goalId: 'QG-2', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependsOnDeliverableId: 'DEL-1', sourceDepartment: 'Operations', targetDepartment: 'Engineering', ownerId: 'MGR-1', empId: 'EMP-2', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-15', kpiId: 'KPI-2' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', goalId: 'QG-4', deliverableId: 'DEL-4', milestoneId: 'MS-4', dependsOnDeliverableId: 'DEL-3', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', empId: 'EMP-2', state: 'AT_RISK', status: 'WAITING', dueDate: '2026-05-10', kpiId: 'KPI-4' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', goalId: 'QG-X', deliverableId: 'DEL-X', milestoneId: 'MS-X', sourceDepartment: 'Finance', targetDepartment: 'Finance', ownerId: 'MGR-X', empId: 'EMP-X', state: 'BLOCKED', status: 'BLOCKED', strategicNotes: 'ABC confidential dependency' }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', goalId: 'QG-2', deliverableId: 'DEL-2', executionId: 'EX-2', escalationType: 'GOAL_BLOCKED', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', goalId: 'QG-4', deliverableId: 'DEL-4', executionId: 'EX-3', escalationType: 'REPEATED_OBJECTIVE_DELAY', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', goalId: 'QG-X', deliverableId: 'DEL-X', executionId: 'EX-X', escalationType: 'ABC_PRIVATE_GOAL', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowDiscussions = [
    { discussionId: 'WD-1', tenantSlug: 'tabsons', workflowType: 'QUARTERLY_GOAL', workflowId: 'QG-2', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-2', tenantSlug: 'tabsons', workflowType: 'STRATEGIC_OBJECTIVE', workflowId: 'QG-4', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-X', tenantSlug: 'abc', workflowType: 'QUARTERLY_GOAL', workflowId: 'QG-X', state: 'ACTIVE', privateNote: 'ABC confidential discussion' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-G-1', tenantSlug: 'tabsons', correlationId: 'QG-2', type: 'GOAL_BLOCKED', status: 'DEGRADED', module: 'Quarterly Goal', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-G-2', tenantSlug: 'tabsons', correlationId: 'QG-4', type: 'OBJECTIVE_DELAY', status: 'DEGRADED', module: 'Quarterly Goal', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'QG-X', type: 'ABC_PRIVATE_GOAL', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/strategicDependencyService.js',
    'services/departmentExecutionBoardService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/quarterlyGoalService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedGoalData();

  const svc = global.QuarterlyGoalService;
  assert.ok(svc, 'QuarterlyGoalService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.GOAL_STATES), 'goal states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_QUARTERLY_GOAL_SELF_TEST__.passed, true, 'development self-test should cover quarterly goal failure cases');

  assert.equal(svc.classifyGoalRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyGoalRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyGoalRisk({ unsafeStrategicOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyGoalRisk({ delayedObjective: true }), 'HIGH_RISK');
  assert.equal(svc.classifyGoalRisk({ kpiDegradation: true }), 'WARNING');

  const employeeAssigned = svc.validateGoalScope({ tenantSlug: 'tabsons', ownerId: 'EMP-2', goalId: 'QG-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned objectives');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_OBJECTIVES_ONLY');

  const managerDepartment = svc.validateGoalScope({ tenantSlug: 'tabsons', department: 'Operations', goalId: 'QG-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department goals');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_GOAL_VISIBILITY');

  const superAdminOverride = svc.validateGoalScope({ tenantSlug: 'tabsons', goalId: 'QG-2', strategicOverride: true, strategicNotes: 'private objective override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify strategic organizational goals');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_STRATEGIC_MODIFICATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /QG-2|private objective|strategicNotes/i);

  const platformScope = svc.validateGoalScope({ tenantSlug: 'tabsons', goalId: 'QG-2', ownerId: 'EMP-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant strategic chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_STRATEGIC_CHAIN_BLOCKED'));

  const crossTenant = svc.validateGoalScope({ tenantSlug: 'abc', goalId: 'QG-X', ownerId: 'EMP-X', strategicNotes: 'ABC confidential strategic goal' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant goal visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /QG-X|EMP-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validateGoalScope({ tenantSlug: 'tabsons', goalId: 'QG-ARCH', state: 'ARCHIVED', strategicOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived goal mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_GOAL_MUTATION_BLOCKED'));

  const malformed = svc.normalizeGoalPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed goal payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_GOAL_PAYLOAD'));

  const normalized = svc.normalizeGoalPayload({
    tenantSlug: 'tabsons',
    goalId: 'QG-2',
    ownerId: 'EMP-2',
    department: 'Operations',
    state: 'at risk',
    quarter: '2026-Q2',
    kpiId: 'KPI-2',
    strategicNotes: 'private objective blocker'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid goal payload should normalize');
  assert.equal(normalized.payload.state, 'AT_RISK');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /QG-2|EMP-2|KPI-2|private objective|strategicNotes/i);

  const governance = svc.evaluateObjectiveGovernance({
    tenantSlug: 'tabsons',
    goalId: 'QG-2',
    ownerId: 'EMP-2',
    accountabilityOwnerId: 'MGR-1',
    department: 'Operations',
    kpiId: 'KPI-2',
    state: 'AT_RISK'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(governance.success, true, 'objective governance should evaluate safely');
  assert.equal(governance.objectiveGovernance.kpiLinkedGoalTracking, true);
  assert.equal(governance.objectiveGovernance.unsafeStrategicOverridesBlocked, true);
  assert.equal(governance.objectiveGovernance.objectiveVersionHistory, true);

  const blockers = svc.detectStrategicBlockers({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(blockers.success, true, 'strategic blocker detection should work');
  assert.ok(blockers.summary.delayedObjectives >= 1);
  assert.ok(blockers.summary.stalledExecution >= 1);
  assert.ok(blockers.summary.kpiDegradation >= 1);
  assert.ok(blockers.summary.repeatedEscalationPatterns >= 1);
  assert.ok(blockers.summary.departmentGoalCongestion >= 1);
  assert.ok(blockers.summary.unresolvedStrategicBlockers >= 1);
  assert.ok(Object.isFrozen(blockers.signals), 'blocker signals must be immutable');
  assert.doesNotMatch(JSON.stringify(blockers), /QG-X|EMP-X|ABC confidential|private operations|strategicNotes/i);

  const escalated = svc.escalateDelayedObjective({
    tenantSlug: 'tabsons',
    goalId: 'QG-2',
    ownerId: 'EMP-2',
    department: 'Operations',
    state: 'AT_RISK',
    dueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'delayed objective escalation should be governed');
  assert.equal(escalated.delayedObjectiveEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /QG-2|EMP-2/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    quarterlyGoals: before.quarterlyGoals,
    strategicObjectives: before.strategicObjectives,
    performanceGoals: before.performanceGoals,
    departmentExecutionRecords: before.departmentExecutionRecords,
    deliverableTimelineRecords: before.deliverableTimelineRecords,
    deliverableDependencies: before.deliverableDependencies,
    escalations: before.escalations
  });
  const report = svc.generateQuarterlyGoalReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'quarterly goal report should generate');
  assert.equal(report.readOnly, true, 'quarterly goal report must be read-only');
  assert.ok(report.quarterlyGoalHealth.totalGoals >= 5);
  assert.ok(report.quarterlyGoalHealth.atRiskGoals >= 1);
  assert.ok(report.quarterlyGoalHealth.escalatedGoals >= 1);
  assert.ok(report.strategicObjectiveGovernance.objectiveAssignments >= 1);
  assert.equal(report.strategicObjectiveGovernance.unsafeStrategicOverride, false);
  assert.equal(report.strategicObjectiveGovernance.historicalGoalRecordsImmutable, true);
  assert.ok(report.goalRiskIntelligence.delayedObjectives >= 1);
  assert.ok(report.goalRiskIntelligence.kpiDegradation >= 1);
  assert.ok(report.kpiPerformanceIntegration.kpiLinkedGoals >= 1);
  assert.equal(report.kpiPerformanceIntegration.unsafeKpiMutation, false);
  assert.ok(report.executionDependencyIntegration.dependencyLinkedObjectives >= 1);
  assert.ok(report.executionDependencyIntegration.departmentExecutionMapping >= 1);
  assert.ok(report.goalAnalytics.quarterlyCompletionRate >= 0);
  assert.ok(report.goalAnalytics.executionVelocity >= 0);
  assert.ok(report.goalAnalytics.escalationLinkedObjectives >= 1);
  assert.ok(report.goalAnalytics.departmentGoalPerformance >= 0);
  assert.equal(report.accessGovernance.superAdminStrategicModificationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantStrategicChain, false);
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.ok(report.integrationHealth.strategicDependencyIntegrated, 'StrategicDependencyService integration should be detected');
  assert.ok(report.integrationHealth.deliverableTimelineIntegrated, 'DeliverableTimelineService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /QG-X|OBJ-X|EMP-X|ABC confidential|private operations|confidential engineering|strategicNotes|salary|payroll/i);
  assert.equal(JSON.stringify({
    quarterlyGoals: global.DB.get().quarterlyGoals,
    strategicObjectives: global.DB.get().strategicObjectives,
    performanceGoals: global.DB.get().performanceGoals,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    deliverableTimelineRecords: global.DB.get().deliverableTimelineRecords,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'quarterly goal report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /GOAL|QUARTERLY_GOAL/.test(row.eventType || row.category || '')), 'goal telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.QUARTERLY_GOAL_REPORTED, 'goal metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /GOAL|QUARTERLY_GOAL/.test(row.actionType || row.action || '')), 'goal actions should be audited safely');

  const originalDepartmentExecution = global.DepartmentExecutionBoardService;
  const originalDependency = global.StrategicDependencyService;
  const originalTimeline = global.DeliverableTimelineService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalCommunication = global.CommunicationGovernanceService;
  try {
    delete global.DepartmentExecutionBoardService;
    delete global.StrategicDependencyService;
    delete global.DeliverableTimelineService;
    delete global.PerformanceGovernanceService;
    delete global.EscalationCommandService;
    delete global.CommunicationGovernanceService;
    const degraded = svc.generateQuarterlyGoalReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing goal integrations should degrade safely');
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.strategicDependencyIntegrated, false);
    assert.equal(degraded.integrationHealth.deliverableTimelineIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false);
  } finally {
    if (originalDepartmentExecution) global.DepartmentExecutionBoardService = originalDepartmentExecution;
    if (originalDependency) global.StrategicDependencyService = originalDependency;
    if (originalTimeline) global.DeliverableTimelineService = originalTimeline;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
  }

  console.log('quarterlyGoalService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
