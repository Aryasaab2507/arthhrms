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

function seedDependencyData() {
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
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Engineering', deadlineDate: '2026-05-20', progressPercent: 35, governanceState: 'AT_RISK', kpiId: 'KPI-1', strategicNotes: 'confidential engineering roadmap' },
    { id: 'DEL-2', deliverableId: 'DEL-2', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Operations', deadlineDate: '2026-05-15', progressPercent: 20, governanceState: 'ESCALATED', dependsOn: ['DEL-1'], kpiId: 'KPI-2', strategicNotes: 'private operations blocker' },
    { id: 'DEL-3', deliverableId: 'DEL-3', tenantSlug: 'tabsons', empId: 'EMP-3', reviewerId: 'MGR-2', strategicOwnerId: 'HRH-1', department: 'HR', deadlineDate: '2026-05-18', progressPercent: 15, governanceState: 'DELAYED', dependsOn: ['DEL-2'], kpiId: 'KPI-3', strategicNotes: 'confidential HR dependency' },
    { id: 'DEL-4', deliverableId: 'DEL-4', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', department: 'Operations', deadlineDate: '2026-06-10', progressPercent: 90, governanceState: 'ACTIVE', dependsOn: ['DEL-3'], kpiId: 'KPI-4' },
    { id: 'DEL-X', deliverableId: 'DEL-X', tenantSlug: 'abc', empId: 'EMP-X', reviewerId: 'MGR-X', strategicOwnerId: 'MGR-X', department: 'Finance', deadlineDate: '2026-05-01', progressPercent: 5, governanceState: 'BLOCKED', strategicNotes: 'ABC confidential dependency chain' }
  ];
  data.deliverableTimelineRecords = [
    { timelineId: 'TL-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', empId: 'EMP-1', ownerId: 'MGR-1', department: 'Engineering', state: 'AT_RISK', dueDate: '2026-05-20', progressPercent: 35, dependencyIds: [], kpiId: 'KPI-1' },
    { timelineId: 'TL-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', empId: 'EMP-2', ownerId: 'MGR-1', department: 'Operations', state: 'DELAYED', dueDate: '2026-05-15', progressPercent: 20, dependencyIds: ['MS-1'], kpiId: 'KPI-2' },
    { timelineId: 'TL-3', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-3', empId: 'EMP-3', ownerId: 'MGR-2', department: 'HR', state: 'BLOCKED', dueDate: '2026-05-18', progressPercent: 15, dependencyIds: ['MS-2'], kpiId: 'KPI-3' },
    { timelineId: 'TL-4', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-4', empId: 'EMP-2', ownerId: 'MGR-1', department: 'Operations', state: 'ACTIVE', dueDate: '2026-06-10', progressPercent: 90, dependencyIds: ['MS-3'], kpiId: 'KPI-4' },
    { timelineId: 'TL-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', empId: 'EMP-X', ownerId: 'MGR-X', department: 'Finance', state: 'BLOCKED', dueDate: '2026-05-05', progressPercent: 5, strategicNotes: 'ABC confidential timeline' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', dependencyType: 'MILESTONE_DEPENDENCY', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependsOnDeliverableId: 'DEL-1', dependsOnMilestoneId: 'MS-1', sourceDepartment: 'Operations', targetDepartment: 'Engineering', ownerId: 'MGR-1', empId: 'EMP-2', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-15', kpiId: 'KPI-2', strategicNotes: 'private dependency note' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', dependencyType: 'DEPARTMENT_DEPENDENCY', deliverableId: 'DEL-3', milestoneId: 'MS-3', dependsOnDeliverableId: 'DEL-2', dependsOnMilestoneId: 'MS-2', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'MGR-2', empId: 'EMP-3', state: 'AT_RISK', status: 'WAITING', dueDate: '2026-05-18', kpiId: 'KPI-3' },
    { dependencyId: 'DEP-3', tenantSlug: 'tabsons', dependencyType: 'WORKFLOW_DEPENDENCY', deliverableId: 'DEL-4', milestoneId: 'MS-4', dependsOnDeliverableId: 'DEL-3', dependsOnMilestoneId: 'MS-3', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', empId: 'EMP-2', state: 'ACTIVE', status: 'LINKED', dueDate: '2026-06-10', kpiId: 'KPI-4' },
    { dependencyId: 'DEP-4', tenantSlug: 'tabsons', dependencyType: 'KPI_LINKED_DEPENDENCY', deliverableId: 'DEL-1', milestoneId: 'MS-1', dependsOnDeliverableId: '', dependsOnMilestoneId: '', sourceDepartment: 'Engineering', targetDepartment: 'Leadership', ownerId: 'MGR-1', empId: 'EMP-1', state: 'RESOLVED', status: 'RESOLVED', dueDate: '2026-05-20', kpiId: 'KPI-1' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', dependencyType: 'RESOURCE_DEPENDENCY', deliverableId: 'DEL-X', milestoneId: 'MS-X', dependsOnDeliverableId: 'DEL-Z', sourceDepartment: 'Finance', targetDepartment: 'Finance', ownerId: 'MGR-X', empId: 'EMP-X', state: 'BLOCKED', status: 'BLOCKED', strategicNotes: 'ABC confidential dependency' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', kpiId: 'KPI-1', state: 'MANAGER_REVIEW_PENDING', weightage: 30 },
    { id: 'PG-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', kpiId: 'KPI-2', state: 'HR_REVIEW_PENDING', weightage: 40 },
    { id: 'PG-X', tenantSlug: 'abc', deliverableId: 'DEL-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependencyId: 'DEP-1', escalationType: 'DEPENDENCY_BLOCKED', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-3', dependencyId: 'DEP-2', escalationType: 'CASCADING_DELAY', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', deliverableId: 'DEL-X', dependencyId: 'DEP-X', escalationType: 'ABC_PRIVATE_DEPENDENCY', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowDiscussions = [
    { discussionId: 'WD-1', tenantSlug: 'tabsons', workflowType: 'STRATEGIC_DEPENDENCY', workflowId: 'DEP-1', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-2', tenantSlug: 'tabsons', workflowType: 'STRATEGIC_DELIVERABLE', workflowId: 'DEL-3', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-X', tenantSlug: 'abc', workflowType: 'STRATEGIC_DEPENDENCY', workflowId: 'DEP-X', state: 'ACTIVE', privateNote: 'ABC confidential discussion' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-DEP-1', tenantSlug: 'tabsons', correlationId: 'DEP-1', type: 'DEPENDENCY_BLOCKED', status: 'DEGRADED', module: 'Strategic Dependency', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-DEP-2', tenantSlug: 'tabsons', correlationId: 'DEP-2', type: 'CASCADING_DELAY', status: 'DEGRADED', module: 'Strategic Dependency', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'DEP-X', type: 'ABC_PRIVATE_DEPENDENCY', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/deliverableTimelineService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/strategicDependencyService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedDependencyData();

  const svc = global.StrategicDependencyService;
  assert.ok(svc, 'StrategicDependencyService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.DEPENDENCY_STATES), 'dependency states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_STRATEGIC_DEPENDENCY_SELF_TEST__.passed, true, 'development self-test should cover dependency failure cases');

  assert.equal(svc.classifyDependencyRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyDependencyRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyDependencyRisk({ circularDependency: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyDependencyRisk({ unsafeDependencyMutation: true }), 'HIGH_RISK');
  assert.equal(svc.classifyDependencyRisk({ dependencyDeadlock: true }), 'HIGH_RISK');
  assert.equal(svc.classifyDependencyRisk({ cascadingDelay: true }), 'WARNING');

  const employeeAssigned = svc.validateDependencyScope({ tenantSlug: 'tabsons', empId: 'EMP-2', deliverableId: 'DEL-2', dependencyId: 'DEP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned dependencies');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_DEPENDENCIES_ONLY');

  const managerTeam = svc.validateDependencyScope({ tenantSlug: 'tabsons', empId: 'EMP-3', deliverableId: 'DEL-3', dependencyId: 'DEP-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-2', empId: 'MGR-2' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may view team dependencies');
  assert.equal(managerTeam.visibility, 'TEAM_DEPENDENCY_VISIBILITY');

  const superAdminMutation = svc.validateDependencyScope({ tenantSlug: 'tabsons', dependencyId: 'DEP-1', deliverableId: 'DEL-2', empId: 'EMP-2', dependencyMutation: true, strategicNotes: 'private dependency note' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminMutation.allowed, false, 'SUPER_ADMIN must not modify strategic dependency chains');
  assert.ok(superAdminMutation.failures.some(item => item.failureCode === 'SUPER_ADMIN_DEPENDENCY_MUTATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminMutation), /DEP-1|DEL-2|EMP-2|private dependency|strategicNotes/i);

  const platformScope = svc.validateDependencyScope({ tenantSlug: 'tabsons', dependencyId: 'DEP-1', deliverableId: 'DEL-2', empId: 'EMP-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in dependency chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_DEPENDENCY_CHAIN_BLOCKED'));

  const crossTenant = svc.validateDependencyScope({ tenantSlug: 'abc', dependencyId: 'DEP-X', deliverableId: 'DEL-X', empId: 'EMP-X', strategicNotes: 'ABC confidential dependency' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant dependency visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /DEP-X|DEL-X|EMP-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validateDependencyScope({ tenantSlug: 'tabsons', dependencyId: 'DEP-ARCH', state: 'ARCHIVED', dependencyMutation: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived dependency mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_DEPENDENCY_MUTATION_BLOCKED'));

  const malformed = svc.normalizeDependencyPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed dependency payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_DEPENDENCY_PAYLOAD'));

  const normalized = svc.normalizeDependencyPayload({
    tenantSlug: 'tabsons',
    dependencyId: 'DEP-1',
    deliverableId: 'DEL-2',
    milestoneId: 'MS-2',
    empId: 'EMP-2',
    dependencyType: 'milestone dependency',
    state: 'active',
    strategicNotes: 'private dependency note'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid dependency payload should normalize');
  assert.equal(normalized.payload.state, 'ACTIVE');
  assert.equal(normalized.payload.dependencyType, 'MILESTONE_DEPENDENCY');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /DEP-1|DEL-2|MS-2|EMP-2|private dependency|strategicNotes/i);

  const circular = svc.validateDependencyGraph({
    tenantSlug: 'tabsons',
    dependencies: [
      { dependencyId: 'A', deliverableId: 'A', dependsOnDeliverableId: 'B' },
      { dependencyId: 'B', deliverableId: 'B', dependsOnDeliverableId: 'A' }
    ]
  }, { tenantSlug: 'tabsons' });
  assert.equal(circular.success, false, 'circular dependency should fail safely');
  assert.ok(circular.failures.some(item => item.failureCode === 'CIRCULAR_DEPENDENCY_BLOCKED'));

  const deadlocks = svc.detectDependencyDeadlocks({
    tenantSlug: 'tabsons',
    dependencies: [
      { deliverableId: 'A', dependsOnDeliverableId: 'B', state: 'BLOCKED' },
      { deliverableId: 'B', dependsOnDeliverableId: 'C', state: 'BLOCKED' },
      { deliverableId: 'C', dependsOnDeliverableId: 'A', state: 'BLOCKED' }
    ]
  }, { tenantSlug: 'tabsons' });
  assert.equal(deadlocks.success, true, 'deadlock detection should complete safely');
  assert.ok(deadlocks.summary.executionDeadlocks >= 1, 'deadlocks should be detected');
  assert.ok(Object.isFrozen(deadlocks.signals), 'deadlock signals must be immutable');

  const governance = svc.evaluateDependencyGraphGovernance({
    tenantSlug: 'tabsons',
    dependencyId: 'DEP-1',
    deliverableId: 'DEL-2',
    empId: 'EMP-2',
    state: 'BLOCKED',
    dependencyIds: ['DEP-4']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(governance.success, true, 'dependency graph governance should evaluate safely');
  assert.equal(governance.dependencyGraphGovernance.directedDependencyGraphs, true);
  assert.equal(governance.dependencyGraphGovernance.graphTraversalSafeguards, true);
  assert.equal(governance.dependencyGraphGovernance.circularDependencyCorruptionBlocked, true);

  const escalated = svc.escalateBlockedDependencies({
    tenantSlug: 'tabsons',
    dependencyId: 'DEP-1',
    deliverableId: 'DEL-2',
    milestoneId: 'MS-2',
    empId: 'EMP-2',
    state: 'BLOCKED',
    dueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'blocked dependency escalation should be governed');
  assert.equal(escalated.blockedDependencyEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /DEP-1|DEL-2|MS-2|EMP-2/i);

  const cascading = svc.detectCascadingDelays({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(cascading.success, true, 'cascading delay intelligence should work');
  assert.ok(cascading.summary.cascadingMilestoneDelays >= 1);
  assert.ok(cascading.summary.dependencyBottlenecks >= 1);
  assert.ok(cascading.summary.blockedExecutionChains >= 1);
  assert.ok(cascading.summary.departmentCongestion >= 1);
  assert.ok(cascading.summary.unresolvedDependencyEscalation >= 1);
  assert.ok(cascading.summary.executionDeadlocks >= 0);
  assert.doesNotMatch(JSON.stringify(cascading), /DEP-X|DEL-X|EMP-X|ABC confidential|private dependency|strategicNotes/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    strategicDeliverables: before.strategicDeliverables,
    deliverableTimelineRecords: before.deliverableTimelineRecords,
    deliverableDependencies: before.deliverableDependencies,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations
  });
  const report = svc.generateStrategicDependencyReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'strategic dependency report should generate');
  assert.equal(report.readOnly, true, 'dependency report must be read-only');
  assert.ok(report.dependencyGraphHealth.totalDependencies >= 4);
  assert.ok(report.dependencyGraphHealth.blockedDependencies >= 1);
  assert.ok(report.cascadingDelayIntelligence.cascadingMilestoneDelays >= 1);
  assert.ok(report.cascadingDelayIntelligence.blockedExecutionChains >= 1);
  assert.ok(report.crossDepartmentExecution.interDepartmentFlows >= 1);
  assert.ok(report.crossDepartmentExecution.executionHandoffDelays >= 1);
  assert.ok(report.crossDepartmentExecution.organizationalBottlenecks >= 1);
  assert.ok(report.kpiPerformanceIntegration.kpiLinkedDependencies >= 1);
  assert.equal(report.kpiPerformanceIntegration.unsafeKpiMutation, false);
  assert.ok(report.dependencyAnalytics.dependencyCongestion >= 1);
  assert.ok(report.dependencyAnalytics.dependencyChainComplexity >= 1);
  assert.ok(report.workflowCommunicationIntegration.dependencyLinkedDiscussions >= 1);
  assert.equal(report.accessGovernance.superAdminDependencyMutationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerDependencyChain, false);
  assert.ok(report.integrationHealth.deliverableTimelineIntegrated, 'DeliverableTimelineService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /DEP-X|DEL-X|EMP-X|ABC confidential|private dependency|confidential engineering|strategicNotes|salary|payroll/i);
  assert.equal(JSON.stringify({
    strategicDeliverables: global.DB.get().strategicDeliverables,
    deliverableTimelineRecords: global.DB.get().deliverableTimelineRecords,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'dependency report must not mutate historical strategic records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /DEPENDENCY|STRATEGIC_DEPENDENCY/.test(row.eventType || row.category || '')), 'dependency telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STRATEGIC_DEPENDENCY_REPORTED, 'dependency metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /DEPENDENCY|STRATEGIC_DEPENDENCY/.test(row.actionType || row.action || '')), 'dependency actions should be audited safely');

  const originalTimeline = global.DeliverableTimelineService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalCommunication = global.CommunicationGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.DeliverableTimelineService;
    delete global.PerformanceGovernanceService;
    delete global.CommunicationGovernanceService;
    delete global.EscalationCommandService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateStrategicDependencyReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing dependency integrations should degrade safely');
    assert.equal(degraded.integrationHealth.deliverableTimelineIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowDiscussionIntegrated, false);
  } finally {
    if (originalTimeline) global.DeliverableTimelineService = originalTimeline;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
  }

  console.log('strategicDependencyService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
