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

function seedTimelineData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Stabilize onboarding SLA', department: 'Engineering', deadlineDate: '2026-05-20', startDate: '2026-05-01', progressPercent: 35, currentStatus: 'Open', governanceState: 'AT_RISK', kpiId: 'KPI-1', strategicNotes: 'confidential leadership note' },
    { id: 'DEL-2', deliverableId: 'DEL-2', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Close rollout blockers', department: 'Operations', deadlineDate: '2026-05-15', startDate: '2026-05-01', progressPercent: 20, currentStatus: 'Delayed', governanceState: 'ESCALATED', dependsOn: ['DEL-1'], kpiId: 'KPI-2', strategicNotes: 'private blocker note' },
    { id: 'DEL-3', deliverableId: 'DEL-3', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'HRH-1', deliverableTitle: 'Complete policy rollout', department: 'Engineering', deadlineDate: '2026-05-28', startDate: '2026-05-05', progressPercent: 100, currentStatus: 'Completed', finalClosureStatus: 'Completed', governanceState: 'COMPLETED', kpiId: 'KPI-3' },
    { id: 'DEL-4', deliverableId: 'DEL-4', tenantSlug: 'tabsons', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Resolve dependency chain', department: 'Operations', deadlineDate: '2026-06-10', startDate: '2026-05-10', progressPercent: 5, currentStatus: 'Open', governanceState: 'PLANNED', dependsOn: ['DEL-2'], kpiId: 'KPI-4' },
    { id: 'DEL-X', deliverableId: 'DEL-X', tenantSlug: 'abc', empId: 'EMP-X', reviewerId: 'MGR-X', strategicOwnerId: 'MGR-X', deliverableTitle: 'ABC private roadmap', department: 'Finance', deadlineDate: '2026-05-01', progressPercent: 10, currentStatus: 'Open', governanceState: 'DELAYED', strategicNotes: 'ABC confidential strategic timeline' }
  ];
  data.deliverableTimelineRecords = [
    { timelineId: 'TL-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', empId: 'EMP-1', ownerId: 'MGR-1', state: 'AT_RISK', startDate: '2026-05-01', dueDate: '2026-05-20', completedAt: '', progressPercent: 35, dependencyIds: [], kpiId: 'KPI-1', phase: 'Execution' },
    { timelineId: 'TL-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', empId: 'EMP-2', ownerId: 'MGR-1', state: 'DELAYED', startDate: '2026-05-01', dueDate: '2026-05-15', completedAt: '', progressPercent: 20, dependencyIds: ['MS-1'], kpiId: 'KPI-2', phase: 'Dependency' },
    { timelineId: 'TL-3', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-3', empId: 'EMP-1', ownerId: 'HRH-1', state: 'COMPLETED', startDate: '2026-05-05', dueDate: '2026-05-28', completedAt: '2026-05-25T00:00:00.000Z', progressPercent: 100, dependencyIds: ['MS-1'], kpiId: 'KPI-3', phase: 'Closure' },
    { timelineId: 'TL-4', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-4', empId: 'EMP-2', ownerId: 'MGR-1', state: 'ACTIVE', startDate: '2026-05-10', dueDate: '2026-06-10', completedAt: '', progressPercent: 5, dependencyIds: ['MS-2'], kpiId: 'KPI-4', phase: 'Planning' },
    { timelineId: 'TL-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', empId: 'EMP-X', ownerId: 'MGR-X', state: 'DELAYED', startDate: '2026-05-01', dueDate: '2026-05-05', progressPercent: 10, dependencyIds: [], kpiId: 'KPI-X', strategicNotes: 'ABC confidential timeline' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependsOnDeliverableId: 'DEL-1', dependsOnMilestoneId: 'MS-1', status: 'BLOCKED' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-4', dependsOnDeliverableId: 'DEL-2', dependsOnMilestoneId: 'MS-2', status: 'WAITING' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', dependsOnDeliverableId: 'DEL-Z', status: 'BLOCKED', strategicNotes: 'ABC private dependency' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', empId: 'EMP-1', reviewerId: 'MGR-1', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-22T00:00:00.000Z', risk_level: 'HIGH', escalation_state: 'AT_RISK' },
    { reviewId: 'REV-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', empId: 'EMP-2', reviewerId: 'MGR-1', reviewerAction: 'REQUEST_CLARIFICATION', review_status: 'NEEDS_CLARIFICATION', submitted_at: '2026-05-23T00:00:00.000Z', risk_level: 'HIGH', escalation_state: 'ESCALATED' },
    { reviewId: 'REV-X', tenantSlug: 'abc', deliverableId: 'DEL-X', empId: 'EMP-X', reviewerId: 'MGR-X', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', strategicNotes: 'ABC private review' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', empId: 'EMP-1', deliverableId: 'DEL-1', kpiId: 'KPI-1', state: 'MANAGER_REVIEW_PENDING', weightage: 40, dueDate: '2026-05-20' },
    { id: 'PG-2', tenantSlug: 'tabsons', empId: 'EMP-2', deliverableId: 'DEL-2', kpiId: 'KPI-2', state: 'HR_REVIEW_PENDING', weightage: 30, dueDate: '2026-05-15' },
    { id: 'PG-X', tenantSlug: 'abc', empId: 'EMP-X', deliverableId: 'DEL-X', kpiId: 'KPI-X', state: 'MANAGER_REVIEW_PENDING', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', escalationType: 'MILESTONE_DELAY', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', escalationType: 'REPEATED_DELAY', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-24T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', deliverableId: 'DEL-X', escalationType: 'ABC_PRIVATE_DELAY', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowDiscussions = [
    { discussionId: 'WD-1', tenantSlug: 'tabsons', workflowType: 'STRATEGIC_DELIVERABLE', workflowId: 'DEL-2', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-X', tenantSlug: 'abc', workflowType: 'STRATEGIC_DELIVERABLE', workflowId: 'DEL-X', state: 'ACTIVE', privateNote: 'ABC confidential discussion' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-TL-1', tenantSlug: 'tabsons', correlationId: 'DEL-2', type: 'MILESTONE_DELAYED', status: 'DEGRADED', module: 'Strategic Timeline', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-TL-2', tenantSlug: 'tabsons', correlationId: 'DEL-4', type: 'DEPENDENCY_BLOCKED', status: 'DEGRADED', module: 'Strategic Timeline', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'DEL-X', type: 'ABC_PRIVATE_DELAY', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/workflowDiscussionService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/deliverableTimelineService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedTimelineData();

  const svc = global.DeliverableTimelineService;
  assert.ok(svc, 'DeliverableTimelineService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.TIMELINE_STATES), 'timeline states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_DELIVERABLE_TIMELINE_SELF_TEST__.passed, true, 'development self-test should cover timeline failure cases');

  assert.equal(svc.classifyExecutionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant timeline visibility is critical');
  assert.equal(svc.classifyExecutionRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER', 'historical mutation is critical');
  assert.equal(svc.classifyExecutionRisk({ unsafeMilestoneOverride: true }), 'HIGH_RISK', 'unsafe milestone override is high risk');
  assert.equal(svc.classifyExecutionRisk({ dependencyLoop: true }), 'HIGH_RISK', 'dependency loop is high risk');
  assert.equal(svc.classifyExecutionRisk({ delayedMilestone: true }), 'WARNING', 'delayed milestone is warning risk');

  const employeeAssigned = svc.validateTimelineScope({ tenantSlug: 'tabsons', empId: 'EMP-1', deliverableId: 'DEL-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned deliverable timeline');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_DELIVERABLES_ONLY');

  const managerTeam = svc.validateTimelineScope({ tenantSlug: 'tabsons', empId: 'EMP-2', deliverableId: 'DEL-2', workflowId: 'DEL-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may view team execution timeline');
  assert.equal(managerTeam.visibility, 'TEAM_EXECUTION_VISIBILITY');

  const superAdminMutation = svc.validateTimelineScope({ tenantSlug: 'tabsons', deliverableId: 'DEL-2', empId: 'EMP-2', milestoneOverride: true, strategicNotes: 'private blocker note' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminMutation.allowed, false, 'SUPER_ADMIN must not modify strategic timelines');
  assert.ok(superAdminMutation.failures.some(item => item.failureCode === 'SUPER_ADMIN_TIMELINE_MUTATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminMutation), /DEL-2|EMP-2|private blocker|strategicNotes/i, 'SUPER_ADMIN failure must redact timeline details');

  const platformScope = svc.validateTimelineScope({ tenantSlug: 'tabsons', deliverableId: 'DEL-1', empId: 'EMP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in strategic execution chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_EXECUTION_CHAIN_BLOCKED'));

  const crossTenant = svc.validateTimelineScope({ tenantSlug: 'abc', deliverableId: 'DEL-X', empId: 'EMP-X', strategicNotes: 'ABC confidential timeline' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant timeline visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /DEL-X|EMP-X|ABC confidential|strategicNotes/i, 'cross-tenant timeline output must not leak details');

  const archivedMutation = svc.validateTimelineScope({ tenantSlug: 'tabsons', deliverableId: 'DEL-ARCH', state: 'ARCHIVED', mutationRequested: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived timeline mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_TIMELINE_MUTATION_BLOCKED'));

  const malformed = svc.normalizeTimelinePayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed timeline payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_TIMELINE_PAYLOAD'));

  const normalized = svc.normalizeTimelinePayload({
    tenantSlug: 'tabsons',
    deliverableId: 'DEL-1',
    milestoneId: 'MS-1',
    empId: 'EMP-1',
    state: 'active',
    dueDate: '2026-05-20',
    strategicNotes: 'confidential leadership note'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid timeline payload should normalize');
  assert.equal(normalized.payload.state, 'ACTIVE');
  assert.ok(Object.isFrozen(normalized), 'normalized timeline output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /DEL-1|MS-1|EMP-1|confidential leadership|strategicNotes/i, 'normalized output must redact raw timeline details');

  const dependencyLoop = svc.validateDependencyGraph({
    tenantSlug: 'tabsons',
    milestones: [
      { milestoneId: 'A', dependencyIds: ['B'] },
      { milestoneId: 'B', dependencyIds: ['A'] }
    ]
  }, { tenantSlug: 'tabsons' });
  assert.equal(dependencyLoop.success, false, 'dependency loop should fail safely');
  assert.ok(dependencyLoop.failures.some(item => item.failureCode === 'DEPENDENCY_LOOP_DETECTED'));

  const scheduling = svc.evaluateTimelineGovernance({
    tenantSlug: 'tabsons',
    deliverableId: 'DEL-2',
    milestoneId: 'MS-2',
    empId: 'EMP-2',
    dependencyIds: ['MS-1'],
    dueDate: '2026-05-15',
    state: 'DELAYED'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(scheduling.success, true, 'timeline governance should evaluate safely');
  assert.equal(scheduling.executionTimelineGovernance.dependencyAwareExecution, true);
  assert.equal(scheduling.executionTimelineGovernance.unsafeMilestoneOverridesBlocked, true);
  assert.equal(scheduling.executionTimelineGovernance.timelineVersioning, true);

  const escalated = svc.escalateDelayedMilestones({
    tenantSlug: 'tabsons',
    deliverableId: 'DEL-2',
    milestoneId: 'MS-2',
    empId: 'EMP-2',
    state: 'DELAYED',
    dueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'delay escalation should be governed');
  assert.equal(escalated.delayEscalation.delayedMilestoneEscalation, true);
  assert.equal(escalated.delayEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /DEL-2|MS-2|EMP-2/i, 'delay escalation output must redact raw timeline ids');

  const bottlenecks = svc.detectExecutionBottlenecks({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(bottlenecks.success, true, 'execution bottleneck detection should work');
  assert.ok(bottlenecks.summary.delayedMilestones >= 1, 'delayed milestones should be counted');
  assert.ok(bottlenecks.summary.dependencyBottlenecks >= 1, 'dependency bottlenecks should be counted');
  assert.ok(bottlenecks.summary.executionCongestion >= 1, 'execution congestion should be counted');
  assert.ok(bottlenecks.summary.overdueDeliverables >= 1, 'overdue deliverables should be counted');
  assert.ok(bottlenecks.summary.repeatedEscalationPatterns >= 1, 'repeated escalation patterns should be counted');
  assert.ok(bottlenecks.summary.stalledExecutionChains >= 1, 'stalled execution chains should be counted');
  assert.ok(Object.isFrozen(bottlenecks.signals), 'bottleneck signals must be immutable');
  assert.doesNotMatch(JSON.stringify(bottlenecks), /DEL-X|EMP-X|ABC confidential|private blocker|confidential leadership|strategicNotes/i, 'bottleneck output must redact raw and cross-tenant details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    strategicDeliverables: before.strategicDeliverables,
    deliverableTimelineRecords: before.deliverableTimelineRecords,
    deliverableDependencies: before.deliverableDependencies,
    deliverableReviews: before.deliverableReviews,
    escalations: before.escalations
  });
  const report = svc.generateDeliverableTimelineReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'deliverable timeline report should generate');
  assert.equal(report.readOnly, true, 'timeline report must be read-only');
  assert.ok(report.timelineHealth.totalMilestones >= 4, 'timeline health should aggregate milestones');
  assert.ok(report.timelineHealth.delayedMilestones >= 1, 'timeline health should show delayed milestones');
  assert.ok(report.dependencyGovernance.dependencyBottlenecks >= 1, 'dependency governance should aggregate bottlenecks');
  assert.ok(report.delayBottleneckIntelligence.overdueDeliverables >= 1, 'delay intelligence should show overdue deliverables');
  assert.ok(report.kpiPerformanceIntegration.kpiLinkedMilestones >= 1, 'KPI-linked milestones should be counted');
  assert.ok(report.timelineAnalytics.completionVelocity >= 0, 'timeline analytics should include completion velocity');
  assert.ok(report.workflowCommunicationIntegration.milestoneLinkedDiscussions >= 1, 'workflow discussion integration should be visible');
  assert.equal(report.accessGovernance.superAdminStrategicMutationAuthority, false, 'SUPER_ADMIN mutation authority remains blocked');
  assert.equal(report.accessGovernance.platformOwnerExecutionChain, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.strategicReviewIntegrated, 'StrategicReviewService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /DEL-X|EMP-X|ABC confidential|private blocker|confidential leadership|strategicNotes|salary|payroll/i, 'report must not expose confidential or cross-tenant timeline data');
  assert.equal(JSON.stringify({
    strategicDeliverables: global.DB.get().strategicDeliverables,
    deliverableTimelineRecords: global.DB.get().deliverableTimelineRecords,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    deliverableReviews: global.DB.get().deliverableReviews,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'timeline report must not mutate historical strategic records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /TIMELINE|DELIVERABLE|STRATEGIC_EXECUTION/.test(row.eventType || row.category || '')), 'timeline telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.DELIVERABLE_TIMELINE_REPORTED, 'timeline metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /TIMELINE|DELIVERABLE|STRATEGIC_EXECUTION/.test(row.actionType || row.action || '')), 'timeline actions should be audited safely');

  const originalStrategic = global.StrategicReviewService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalCommunication = global.CommunicationGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalWorkflowDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.StrategicReviewService;
    delete global.PerformanceGovernanceService;
    delete global.CommunicationGovernanceService;
    delete global.EscalationCommandService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateDeliverableTimelineReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing timeline dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.strategicReviewIntegrated, false, 'missing strategic review dependency should be visible');
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false, 'missing performance dependency should be visible');
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false, 'missing communication dependency should be visible');
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false, 'missing escalation dependency should be visible');
  } finally {
    if (originalStrategic) global.StrategicReviewService = originalStrategic;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalWorkflowDiscussion) global.WorkflowDiscussionService = originalWorkflowDiscussion;
  }

  console.log('deliverableTimelineService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
