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

function seedKPIData() {
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
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-2', empId: 'MGR-2', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.kpiScorecards = [
    { scorecardId: 'SC-1', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', kpiId: 'KPI-1', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-2', targetValue: 90, actualValue: 82, benchmarkThreshold: 80, weight: 30, state: 'HEALTHY', trend: 'UP', goalId: 'QG-1', milestoneId: 'MS-1', executiveNotes: 'confidential engineering scorecard' },
    { scorecardId: 'SC-2', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', kpiId: 'KPI-2', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', targetValue: 95, actualValue: 42, benchmarkThreshold: 80, weight: 40, state: 'DEGRADED', trend: 'DOWN', goalId: 'QG-2', milestoneId: 'MS-2', deliverableId: 'DEL-2', escalationId: 'ESC-1', executiveNotes: 'private KPI degradation note' },
    { scorecardId: 'SC-3', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', kpiId: 'KPI-3', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', targetValue: 75, actualValue: 50, benchmarkThreshold: 70, weight: 20, state: 'AT_RISK', trend: 'DOWN', goalId: 'QG-3', milestoneId: 'MS-3' },
    { scorecardId: 'SC-4', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'HR', kpiId: 'KPI-4', ownerId: 'HR-1', accountabilityOwnerId: 'HRH-1', targetValue: 85, actualValue: 85, benchmarkThreshold: 75, weight: 10, state: 'REVIEW_PENDING', trend: 'FLAT', goalId: 'QG-4' },
    { scorecardId: 'SC-5', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', kpiId: 'KPI-5', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-2', targetValue: 80, actualValue: 100, benchmarkThreshold: 80, weight: 20, state: 'HEALTHY', trend: 'UP', goalId: 'QG-5' },
    { scorecardId: 'SC-ARCH', tenantSlug: 'tabsons', quarter: '2026-Q1', department: 'Engineering', kpiId: 'KPI-ARCH', ownerId: 'EMP-1', state: 'ARCHIVED', actualValue: 94, benchmarkThreshold: 80, executiveNotes: 'immutable KPI archive' },
    { scorecardId: 'SC-X', tenantSlug: 'abc', quarter: '2026-Q2', department: 'Finance', kpiId: 'KPI-X', ownerId: 'EMP-X', accountabilityOwnerId: 'MGR-X', targetValue: 90, actualValue: 10, benchmarkThreshold: 80, state: 'DEGRADED', trend: 'DOWN', executiveNotes: 'ABC confidential KPI scorecard' }
  ];
  data.kpiBenchmarks = [
    { benchmarkId: 'BM-1', tenantSlug: 'tabsons', kpiId: 'KPI-1', department: 'Engineering', threshold: 80, targetValue: 90 },
    { benchmarkId: 'BM-2', tenantSlug: 'tabsons', kpiId: 'KPI-2', department: 'Operations', threshold: 80, targetValue: 95, congested: true },
    { benchmarkId: 'BM-X', tenantSlug: 'abc', kpiId: 'KPI-X', department: 'Finance', threshold: 80, privateNote: 'ABC confidential benchmark' }
  ];
  data.quarterlyGoals = [
    { goalId: 'QG-1', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Engineering', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-2', kpiId: 'KPI-1', state: 'ACTIVE', progressPercent: 55 },
    { goalId: 'QG-2', tenantSlug: 'tabsons', quarter: '2026-Q2', department: 'Operations', ownerId: 'EMP-2', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-2', state: 'AT_RISK', progressPercent: 20, dueDate: '2026-05-15' },
    { goalId: 'QG-X', tenantSlug: 'abc', quarter: '2026-Q2', department: 'Finance', ownerId: 'EMP-X', accountabilityOwnerId: 'MGR-X', kpiId: 'KPI-X', state: 'AT_RISK', strategicNotes: 'ABC confidential strategic goal' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', goalId: 'QG-1', empId: 'EMP-1', kpiId: 'KPI-1', state: 'MANAGER_REVIEW_PENDING', progressPercent: 55, score: 72 },
    { id: 'PG-2', tenantSlug: 'tabsons', goalId: 'QG-2', empId: 'EMP-2', kpiId: 'KPI-2', state: 'HR_REVIEW_PENDING', progressPercent: 20, score: 38, degraded: true },
    { id: 'PG-X', tenantSlug: 'abc', goalId: 'QG-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', goalId: 'QG-1', empId: 'EMP-1', ownerId: 'MGR-2', deliverableId: 'DEL-1', milestoneId: 'MS-1', state: 'IN_PROGRESS', dueDate: '2026-06-10', progressPercent: 55, workloadUnits: 5, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', goalId: 'QG-2', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-2', milestoneId: 'MS-2', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, kpiId: 'KPI-2' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', goalId: 'QG-X', empId: 'EMP-X', ownerId: 'MGR-X', deliverableId: 'DEL-X', state: 'BLOCKED', progressPercent: 5, workloadUnits: 10, kpiId: 'KPI-X', strategicNotes: 'ABC confidential execution chain' }
  ];
  data.deliverableTimelineRecords = [
    { timelineId: 'TL-1', tenantSlug: 'tabsons', goalId: 'QG-1', deliverableId: 'DEL-1', milestoneId: 'MS-1', department: 'Engineering', state: 'ACTIVE', progressPercent: 55, kpiId: 'KPI-1' },
    { timelineId: 'TL-2', tenantSlug: 'tabsons', goalId: 'QG-2', deliverableId: 'DEL-2', milestoneId: 'MS-2', department: 'Operations', state: 'AT_RISK', progressPercent: 20, dependencyIds: ['MS-1'], kpiId: 'KPI-2' },
    { timelineId: 'TL-X', tenantSlug: 'abc', goalId: 'QG-X', deliverableId: 'DEL-X', milestoneId: 'MS-X', department: 'Finance', state: 'DELAYED', progressPercent: 5, kpiId: 'KPI-X', strategicNotes: 'ABC confidential timeline' }
  ];
  data.escalations = [
    { id: 'ESC-1', tenantSlug: 'tabsons', kpiId: 'KPI-2', goalId: 'QG-2', escalationType: 'KPI_DEGRADED', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', tenantSlug: 'tabsons', kpiId: 'KPI-3', goalId: 'QG-3', escalationType: 'BENCHMARK_MISS', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-X', tenantSlug: 'abc', kpiId: 'KPI-X', goalId: 'QG-X', escalationType: 'ABC_PRIVATE_KPI', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-KPI-1', tenantSlug: 'tabsons', correlationId: 'KPI-2', type: 'KPI_DEGRADATION', status: 'DEGRADED', module: 'KPI Scorecard', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-KPI-2', tenantSlug: 'tabsons', correlationId: 'KPI-3', type: 'BENCHMARK_CONGESTION', status: 'DEGRADED', module: 'KPI Scorecard', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'KPI-X', type: 'ABC_PRIVATE_KPI', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/kpiScorecardService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedKPIData();

  const svc = global.KPIScorecardService;
  assert.ok(svc, 'KPIScorecardService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.KPI_STATES), 'KPI states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_KPI_SCORECARD_SELF_TEST__.passed, true, 'development self-test should cover KPI scorecard failure cases');

  assert.equal(svc.classifyKPIRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyKPIRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyKPIRisk({ unsafeKPIOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyKPIRisk({ degradedKPI: true }), 'HIGH_RISK');
  assert.equal(svc.classifyKPIRisk({ benchmarkCongestion: true }), 'WARNING');

  const employeeAssigned = svc.validateKPIScope({ tenantSlug: 'tabsons', ownerId: 'EMP-2', kpiId: 'KPI-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned KPIs');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_KPI_ONLY');

  const managerDepartment = svc.validateKPIScope({ tenantSlug: 'tabsons', department: 'Operations', kpiId: 'KPI-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department KPIs');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_KPI_VISIBILITY');

  const superAdminOverride = svc.validateKPIScope({ tenantSlug: 'tabsons', kpiId: 'KPI-2', kpiOverride: true, executiveNotes: 'private KPI override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify strategic KPI scoring');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_KPI_MUTATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /KPI-2|private KPI|executiveNotes/i);

  const platformScope = svc.validateKPIScope({ tenantSlug: 'tabsons', kpiId: 'KPI-2', ownerId: 'EMP-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant KPI chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_KPI_CHAIN_BLOCKED'));

  const crossTenant = svc.validateKPIScope({ tenantSlug: 'abc', kpiId: 'KPI-X', ownerId: 'EMP-X', executiveNotes: 'ABC confidential KPI scorecard' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant KPI visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /KPI-X|EMP-X|ABC confidential|executiveNotes/i);

  const archivedMutation = svc.validateKPIScope({ tenantSlug: 'tabsons', kpiId: 'KPI-ARCH', state: 'ARCHIVED', kpiOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived KPI mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_KPI_MUTATION_BLOCKED'));

  const malformed = svc.normalizeKPIPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed KPI payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_KPI_PAYLOAD'));

  const normalized = svc.normalizeKPIPayload({
    tenantSlug: 'tabsons',
    kpiId: 'KPI-2',
    ownerId: 'EMP-2',
    department: 'Operations',
    state: 'degraded',
    quarter: '2026-Q2',
    benchmarkThreshold: 80,
    actualValue: 42,
    executiveNotes: 'private KPI degradation note'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid KPI payload should normalize');
  assert.equal(normalized.payload.state, 'DEGRADED');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /KPI-2|EMP-2|private KPI|executiveNotes/i);

  const benchmark = svc.evaluateBenchmarkGovernance({
    tenantSlug: 'tabsons',
    kpiId: 'KPI-2',
    ownerId: 'EMP-2',
    department: 'Operations',
    targetValue: 95,
    actualValue: 42,
    benchmarkThreshold: 80,
    state: 'DEGRADED'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(benchmark.success, true, 'benchmark governance should evaluate safely');
  assert.equal(benchmark.benchmarkGovernance.benchmarkThresholdGovernance, true);
  assert.equal(benchmark.benchmarkGovernance.unsafeKPIOverridesBlocked, true);
  assert.equal(benchmark.benchmarkGovernance.kpiVersionHistory, true);

  const degradation = svc.detectStrategicKPIDegradation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(degradation.success, true, 'KPI degradation detection should work');
  assert.ok(degradation.summary.kpiDegradation >= 1);
  assert.ok(degradation.summary.repeatedPerformanceDrops >= 1);
  assert.ok(degradation.summary.executionLinkedKPIFailures >= 1);
  assert.ok(degradation.summary.strategicBottlenecks >= 1);
  assert.ok(degradation.summary.departmentKPICongestion >= 1);
  assert.ok(degradation.summary.unresolvedEscalationLinkedKPIRisks >= 1);
  assert.ok(Object.isFrozen(degradation.signals), 'degradation signals must be immutable');
  assert.doesNotMatch(JSON.stringify(degradation), /KPI-X|EMP-X|ABC confidential|private KPI|executiveNotes/i);

  const escalated = svc.escalateDegradedKPI({
    tenantSlug: 'tabsons',
    kpiId: 'KPI-2',
    ownerId: 'EMP-2',
    department: 'Operations',
    state: 'DEGRADED',
    actualValue: 42,
    benchmarkThreshold: 80
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'degraded KPI escalation should be governed');
  assert.equal(escalated.degradedKPIEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /KPI-2|EMP-2/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    kpiScorecards: before.kpiScorecards,
    kpiBenchmarks: before.kpiBenchmarks,
    quarterlyGoals: before.quarterlyGoals,
    performanceGoals: before.performanceGoals,
    departmentExecutionRecords: before.departmentExecutionRecords,
    deliverableTimelineRecords: before.deliverableTimelineRecords,
    escalations: before.escalations
  });
  const report = svc.generateKPIScorecardReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'KPI scorecard report should generate');
  assert.equal(report.readOnly, true, 'KPI scorecard report must be read-only');
  assert.ok(report.kpiScorecardHealth.totalScorecards >= 5);
  assert.ok(report.kpiScorecardHealth.degradedScorecards >= 1);
  assert.ok(report.kpiScorecardHealth.atRiskScorecards >= 1);
  assert.ok(report.kpiGovernance.kpiTargetManagement >= 1);
  assert.equal(report.kpiGovernance.unsafeKPIOverride, false);
  assert.equal(report.kpiGovernance.historicalKPIScorecardsImmutable, true);
  assert.ok(report.trendIntelligence.kpiDegradation >= 1);
  assert.ok(report.trendIntelligence.executionLinkedKPIFailures >= 1);
  assert.ok(report.performanceBenchmarking.departmentBenchmarkComparisons >= 1);
  assert.ok(report.performanceBenchmarking.benchmarkAchievementHealth >= 0);
  assert.ok(report.goalExecutionIntegration.kpiLinkedGoals >= 1);
  assert.ok(report.goalExecutionIntegration.executionAwareScorecards >= 1);
  assert.equal(report.goalExecutionIntegration.unsafeExecutionMutation, false);
  assert.ok(report.kpiAnalytics.kpiCompletionRate >= 0);
  assert.ok(report.kpiAnalytics.degradedKPIFrequency >= 1);
  assert.ok(report.kpiAnalytics.escalationLinkedKPIImpact >= 1);
  assert.ok(report.kpiAnalytics.departmentKPIPerformance >= 0);
  assert.equal(report.accessGovernance.superAdminKPIMutationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantKPIChain, false);
  assert.ok(report.integrationHealth.quarterlyGoalIntegrated, 'QuarterlyGoalService integration should be detected');
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.ok(report.integrationHealth.performanceGovernanceIntegrated, 'PerformanceGovernanceService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /KPI-X|SC-X|EMP-X|ABC confidential|private KPI|confidential engineering|executiveNotes|salary|payroll/i);
  assert.equal(JSON.stringify({
    kpiScorecards: global.DB.get().kpiScorecards,
    kpiBenchmarks: global.DB.get().kpiBenchmarks,
    quarterlyGoals: global.DB.get().quarterlyGoals,
    performanceGoals: global.DB.get().performanceGoals,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    deliverableTimelineRecords: global.DB.get().deliverableTimelineRecords,
    escalations: global.DB.get().escalations
  }), historicalBefore, 'KPI scorecard report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /KPI|SCORECARD/.test(row.eventType || row.category || '')), 'KPI telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.KPI_SCORECARD_REPORTED, 'KPI metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /KPI|SCORECARD/.test(row.actionType || row.action || '')), 'KPI actions should be audited safely');

  const originalQuarterlyGoal = global.QuarterlyGoalService;
  const originalDepartmentExecution = global.DepartmentExecutionBoardService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalCommunication = global.CommunicationGovernanceService;
  try {
    delete global.QuarterlyGoalService;
    delete global.DepartmentExecutionBoardService;
    delete global.PerformanceGovernanceService;
    delete global.EscalationCommandService;
    delete global.CommunicationGovernanceService;
    const degraded = svc.generateKPIScorecardReport({ tenantSlug: 'tabsons', quarter: '2026-Q2' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing KPI integrations should degrade safely');
    assert.equal(degraded.integrationHealth.quarterlyGoalIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationGovernanceIntegrated, false);
  } finally {
    if (originalQuarterlyGoal) global.QuarterlyGoalService = originalQuarterlyGoal;
    if (originalDepartmentExecution) global.DepartmentExecutionBoardService = originalDepartmentExecution;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
  }

  console.log('kpiScorecardService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
