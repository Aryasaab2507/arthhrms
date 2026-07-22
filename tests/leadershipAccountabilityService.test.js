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

function loadIfExists(file) {
  if (fs.existsSync(path.resolve(__dirname, '..', file))) load(file);
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

function seedLeadershipData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-29';
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
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.leadershipAccountabilityReports = [
    { reportId: 'LR-1', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', executiveId: 'DIR-1', ownerId: 'MGR-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-1', goalId: 'QG-1', executionId: 'EX-1', state: 'ACTIVE', completionPercent: 72, reviewDueDate: '2026-06-15', responseHours: 18, checkpointCount: 2, executiveNotes: 'confidential engineering leadership note' },
    { reportId: 'LR-2', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', executiveId: 'DIR-1', ownerId: 'MGR-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-2', goalId: 'QG-2', executionId: 'EX-2', state: 'AT_RISK', completionPercent: 35, reviewDueDate: '2026-05-15', responseHours: 64, escalationId: 'ESC-1', ownershipChanges: 2, executiveNotes: 'private operations accountability gap' },
    { reportId: 'LR-3', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', executiveId: 'DIR-1', ownerId: 'MGR-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-4', goalId: 'QG-4', executionId: 'EX-3', state: 'ESCALATED', completionPercent: 15, reviewDueDate: '2026-05-10', responseHours: 80, escalationId: 'ESC-2', ownershipChanges: 3 },
    { reportId: 'LR-4', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'HR', executiveId: 'HRH-1', ownerId: 'HRH-1', accountabilityOwnerId: 'HRH-1', kpiId: 'KPI-3', goalId: 'QG-3', executionId: 'EX-4', state: 'UNDER_REVIEW', completionPercent: 65, reviewDueDate: '2026-05-24', responseHours: 28, checkpointCount: 1 },
    { reportId: 'LR-5', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Finance', executiveId: 'DIR-1', ownerId: 'MGR-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-5', goalId: 'QG-5', executionId: 'EX-5', state: 'COMPLETED', completionPercent: 100, reviewDueDate: '2026-05-25', responseHours: 12, verifiedAt: '2026-05-25T00:00:00.000Z' },
    { reportId: 'LR-ARCH', tenantSlug: 'tabsons', quarter: '2026-Q1', department: 'Engineering', executiveId: 'DIR-1', ownerId: 'MGR-1', accountabilityOwnerId: 'MGR-1', state: 'ARCHIVED', completionPercent: 100, archivedAt: '2026-04-01T00:00:00.000Z', executiveNotes: 'immutable archived leadership note' },
    { reportId: 'LR-X', tenantSlug: 'abc', quarter: '2026-Q2', department: 'Finance', executiveId: 'MGR-X', ownerId: 'MGR-X', accountabilityOwnerId: 'MGR-X', kpiId: 'KPI-X', goalId: 'QG-X', executionId: 'EX-X', state: 'AT_RISK', completionPercent: 5, reviewDueDate: '2026-05-01', executiveNotes: 'ABC confidential leadership report' }
  ];
  data.leadershipScorecards = [
    { scorecardId: 'LS-1', tenantSlug: 'tabsons', department: 'Engineering', ownerId: 'MGR-1', state: 'ACTIVE', completionPercent: 72, kpiId: 'KPI-1' },
    { scorecardId: 'LS-2', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', state: 'AT_RISK', completionPercent: 35, kpiId: 'KPI-2' },
    { scorecardId: 'LS-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', state: 'AT_RISK', executiveNotes: 'ABC confidential scorecard' }
  ];
  data.kpiScorecards = [
    { scorecardId: 'KSC-1', tenantSlug: 'tabsons', department: 'Engineering', ownerId: 'MGR-1', kpiId: 'KPI-1', state: 'HEALTHY', currentValue: 82, targetValue: 80, score: 82 },
    { scorecardId: 'KSC-2', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', kpiId: 'KPI-2', state: 'DEGRADED', currentValue: 38, targetValue: 75, score: 38, trend: -18 },
    { scorecardId: 'KSC-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', kpiId: 'KPI-X', state: 'DEGRADED', executiveNotes: 'ABC confidential KPI' }
  ];
  data.quarterlyGoals = [
    { goalId: 'QG-1', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-1', state: 'ACTIVE', progressPercent: 55 },
    { goalId: 'QG-2', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-2', state: 'AT_RISK', progressPercent: 20, dueDate: '2026-05-15' },
    { goalId: 'QG-4', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-4', state: 'ESCALATED', progressPercent: 10, dueDate: '2026-05-10', escalationId: 'ESC-1' },
    { goalId: 'QG-X', tenantSlug: 'abc', quarter: '2026-Q2', department: 'Finance', ownerId: 'EMP-X', accountabilityOwnerId: 'MGR-X', kpiId: 'KPI-X', state: 'AT_RISK', strategicNotes: 'ABC confidential goal' }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'IN_PROGRESS', progressPercent: 55, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, kpiId: 'KPI-2' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'ESCALATED', dueDate: '2026-05-10', progressPercent: 10, workloadUnits: 8, kpiId: 'KPI-4' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'BLOCKED', progressPercent: 5, strategicNotes: 'ABC confidential execution' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', goalId: 'QG-1', executionId: 'EX-1', empId: 'EMP-1', kpiId: 'KPI-1', progressPercent: 55, score: 72 },
    { id: 'PG-2', tenantSlug: 'tabsons', goalId: 'QG-2', executionId: 'EX-2', empId: 'EMP-2', kpiId: 'KPI-2', progressPercent: 20, score: 38, degraded: true },
    { id: 'PG-X', tenantSlug: 'abc', goalId: 'QG-X', executionId: 'EX-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', goalId: 'QG-2', executionId: 'EX-2', escalationType: 'ACCOUNTABILITY_GAP', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', goalId: 'QG-4', executionId: 'EX-3', escalationType: 'REPEATED_LEADERSHIP_DELAY', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', goalId: 'QG-X', executionId: 'EX-X', escalationType: 'ABC_PRIVATE_LEADERSHIP', severity: 'CRITICAL', executiveNotes: 'ABC confidential escalation' }
  ];
  data.workflowDiscussions = [
    { discussionId: 'WD-L-1', tenantSlug: 'tabsons', workflowType: 'LEADERSHIP_REVIEW', workflowId: 'LR-2', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-L-2', tenantSlug: 'tabsons', workflowType: 'GOVERNANCE_ESCALATION', workflowId: 'LR-3', state: 'ACTIVE', unresolved: true },
    { discussionId: 'WD-X', tenantSlug: 'abc', workflowType: 'LEADERSHIP_REVIEW', workflowId: 'LR-X', state: 'ACTIVE', privateNote: 'ABC confidential discussion' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-L-1', tenantSlug: 'tabsons', correlationId: 'LR-2', type: 'LEADERSHIP_REVIEW_DELAYED', status: 'DEGRADED', module: 'Leadership Accountability', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-L-2', tenantSlug: 'tabsons', correlationId: 'LR-3', type: 'ACCOUNTABILITY_ESCALATED', status: 'FAILED', module: 'Leadership Accountability', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'LR-X', type: 'ABC_PRIVATE_LEADERSHIP', status: 'FAILED', executiveNotes: 'ABC confidential workflow' }
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
    'services/departmentExecutionBoardService.js',
    'services/quarterlyGoalService.js'
  ].forEach(load);
  loadIfExists('services/kpiScorecardService.js');
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/leadershipAccountabilityService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedLeadershipData();

  const svc = global.LeadershipAccountabilityService;
  assert.ok(svc, 'LeadershipAccountabilityService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ACCOUNTABILITY_STATES), 'accountability states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_LEADERSHIP_ACCOUNTABILITY_SELF_TEST__.passed, true, 'development self-test should cover leadership failure cases');

  assert.equal(svc.classifyLeadershipRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyLeadershipRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyLeadershipRisk({ unsafeExecutiveOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyLeadershipRisk({ governanceEscalation: true }), 'HIGH_RISK');
  assert.equal(svc.classifyLeadershipRisk({ delayedExecutiveReview: true }), 'WARNING');

  const ownVisibility = svc.validateLeadershipScope({ tenantSlug: 'tabsons', ownerId: 'EMP-2', reportId: 'LR-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(ownVisibility.allowed, true, 'employee may view own accountability only');
  assert.equal(ownVisibility.visibility, 'OWN_ACCOUNTABILITY_VISIBILITY');

  const managerDepartment = svc.validateLeadershipScope({ tenantSlug: 'tabsons', department: 'Operations', reportId: 'LR-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department accountability');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_ACCOUNTABILITY_VISIBILITY');

  const superAdminOverride = svc.validateLeadershipScope({ tenantSlug: 'tabsons', reportId: 'LR-2', executiveOverride: true, executiveNotes: 'private executive override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify executive accountability reports');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_ACCOUNTABILITY_MODIFICATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /LR-2|private executive|executiveNotes/i);

  const platformScope = svc.validateLeadershipScope({ tenantSlug: 'tabsons', reportId: 'LR-2', ownerId: 'MGR-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant leadership chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_LEADERSHIP_CHAIN_BLOCKED'));

  const crossTenant = svc.validateLeadershipScope({ tenantSlug: 'abc', reportId: 'LR-X', ownerId: 'MGR-X', executiveNotes: 'ABC confidential leadership report' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant leadership visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /LR-X|MGR-X|ABC confidential|executiveNotes/i);

  const archivedMutation = svc.validateLeadershipScope({ tenantSlug: 'tabsons', reportId: 'LR-ARCH', state: 'ARCHIVED', executiveOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived accountability report mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_ACCOUNTABILITY_MUTATION_BLOCKED'));

  const malformed = svc.normalizeLeadershipPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed leadership payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_LEADERSHIP_PAYLOAD'));

  const normalized = svc.normalizeLeadershipPayload({
    tenantSlug: 'tabsons',
    reportId: 'LR-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'at risk',
    quarter: '2026-Q2',
    kpiId: 'KPI-2',
    executiveNotes: 'private operations accountability gap'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid leadership payload should normalize');
  assert.equal(normalized.payload.state, 'AT_RISK');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /LR-2|MGR-1|KPI-2|private operations|executiveNotes/i);

  const governance = svc.evaluateExecutiveGovernance({
    tenantSlug: 'tabsons',
    reportId: 'LR-2',
    ownerId: 'MGR-1',
    accountabilityOwnerId: 'MGR-1',
    department: 'Operations',
    kpiId: 'KPI-2',
    state: 'AT_RISK'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(governance.success, true, 'executive governance should evaluate safely');
  assert.equal(governance.executiveGovernance.leadershipOwnershipAssignment, true);
  assert.equal(governance.executiveGovernance.unsafeExecutiveOverridesBlocked, true);
  assert.equal(governance.executiveGovernance.accountabilityVersionHistory, true);

  const bottlenecks = svc.detectGovernanceBottlenecks({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-29T00:00:00.000Z' });
  assert.equal(bottlenecks.success, true, 'governance bottleneck detection should work');
  assert.ok(bottlenecks.summary.delayedExecutiveReviews >= 1);
  assert.ok(bottlenecks.summary.repeatedEscalationOwnership >= 1);
  assert.ok(bottlenecks.summary.unresolvedAccountabilityGaps >= 1);
  assert.ok(bottlenecks.summary.leadershipBottlenecks >= 1);
  assert.ok(bottlenecks.summary.strategicExecutionFailures >= 1);
  assert.ok(bottlenecks.summary.kpiLinkedGovernanceDegradation >= 1);
  assert.ok(Object.isFrozen(bottlenecks.signals), 'bottleneck signals must be immutable');
  assert.doesNotMatch(JSON.stringify(bottlenecks), /LR-X|MGR-X|ABC confidential|private operations|executiveNotes/i);

  const escalated = svc.escalateAccountabilityGap({
    tenantSlug: 'tabsons',
    reportId: 'LR-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'AT_RISK',
    reviewDueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'accountability gap escalation should be governed');
  assert.equal(escalated.accountabilityEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /LR-2|MGR-1/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    leadershipAccountabilityReports: before.leadershipAccountabilityReports,
    leadershipScorecards: before.leadershipScorecards,
    kpiScorecards: before.kpiScorecards,
    quarterlyGoals: before.quarterlyGoals,
    departmentExecutionRecords: before.departmentExecutionRecords,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations
  });
  const report = svc.generateLeadershipAccountabilityReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'leadership accountability report should generate');
  assert.equal(report.readOnly, true, 'leadership accountability report must be read-only');
  assert.ok(report.leadershipAccountabilityHealth.totalReports >= 5);
  assert.ok(report.leadershipAccountabilityHealth.atRiskReports >= 1);
  assert.ok(report.leadershipAccountabilityHealth.escalatedReports >= 1);
  assert.ok(report.executiveGovernance.leadershipOwnershipAssignments >= 1);
  assert.equal(report.executiveGovernance.unsafeExecutiveOverride, false);
  assert.equal(report.executiveGovernance.historicalAccountabilityReportsImmutable, true);
  assert.ok(report.accountabilityRiskIntelligence.delayedExecutiveReviews >= 1);
  assert.ok(report.accountabilityRiskIntelligence.kpiLinkedGovernanceDegradation >= 1);
  assert.ok(report.kpiExecutionIntegration.kpiLinkedAccountability >= 1);
  assert.equal(report.kpiExecutionIntegration.unsafeKpiMutation, false);
  assert.ok(report.workflowCommunicationIntegration.leadershipReviewDiscussions >= 1);
  assert.ok(report.leadershipAnalytics.executiveCompletionRate >= 0);
  assert.ok(report.leadershipAnalytics.accountabilityResponseTimes >= 0);
  assert.ok(report.leadershipAnalytics.escalationLinkedLeadershipTrends >= 1);
  assert.ok(report.leadershipAnalytics.departmentLeadershipPerformance >= 0);
  assert.equal(report.accessGovernance.superAdminAccountabilityModificationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantLeadershipChain, false);
  assert.ok(report.integrationHealth.quarterlyGoalIntegrated, 'QuarterlyGoalService integration should be detected');
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.equal(report.integrationHealth.kpiScorecardIntegrated, !!global.KPIScorecardService, 'KPI scorecard integration should reflect optional dependency presence');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /LR-X|KSC-X|QG-X|EMP-X|MGR-X|ABC confidential|private operations|confidential engineering|executiveNotes|salary|payroll|leave balance/i);
  assert.equal(JSON.stringify({
    leadershipAccountabilityReports: global.DB.get().leadershipAccountabilityReports,
    leadershipScorecards: global.DB.get().leadershipScorecards,
    kpiScorecards: global.DB.get().kpiScorecards,
    quarterlyGoals: global.DB.get().quarterlyGoals,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'leadership report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /LEADERSHIP|ACCOUNTABILITY/.test(row.eventType || row.category || '')), 'leadership telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.LEADERSHIP_ACCOUNTABILITY_REPORTED, 'leadership metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /LEADERSHIP|ACCOUNTABILITY/.test(row.actionType || row.action || '')), 'leadership actions should be audited safely');

  const originalKpi = global.KPIScorecardService;
  const originalQuarterly = global.QuarterlyGoalService;
  const originalExecution = global.DepartmentExecutionBoardService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalCommunication = global.CommunicationGovernanceService;
  const originalDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.KPIScorecardService;
    delete global.QuarterlyGoalService;
    delete global.DepartmentExecutionBoardService;
    delete global.PerformanceGovernanceService;
    delete global.EscalationCommandService;
    delete global.CommunicationGovernanceService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateLeadershipAccountabilityReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing leadership integrations should degrade safely');
    assert.equal(degraded.integrationHealth.kpiScorecardIntegrated, false);
    assert.equal(degraded.integrationHealth.quarterlyGoalIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowDiscussionIntegrated, false);
  } finally {
    if (originalKpi) global.KPIScorecardService = originalKpi;
    if (originalQuarterly) global.QuarterlyGoalService = originalQuarterly;
    if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
  }

  console.log('leadershipAccountabilityService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
