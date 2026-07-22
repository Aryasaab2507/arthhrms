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

function seedHeatmapData() {
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
    { id: 'EMP-3', empId: 'EMP-3', role: 'EMPLOYEE', department: 'HR', managerId: 'MGR-2', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-2', empId: 'MGR-2', role: 'MANAGER', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.executionHeatmapSnapshots = [
    { heatmapId: 'HM-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'ACTIVE', densityScore: 55, workloadPressure: 45, throughputScore: 82, kpiId: 'KPI-1', zone: 'NORMAL', strategicNotes: 'confidential engineering heat note' },
    { heatmapId: 'HM-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'HIGH_LOAD', densityScore: 78, workloadPressure: 84, throughputScore: 45, kpiId: 'KPI-2', zone: 'HIGH_LOAD', escalationCount: 2, bottleneckCount: 2, strategicNotes: 'private operations heat zone' },
    { heatmapId: 'HM-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'CONGESTED', densityScore: 88, workloadPressure: 91, throughputScore: 32, kpiId: 'KPI-4', zone: 'CONGESTED', escalationCount: 3, bottleneckCount: 3 },
    { heatmapId: 'HM-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'CRITICAL', densityScore: 94, workloadPressure: 96, throughputScore: 18, kpiId: 'KPI-3', zone: 'CRITICAL', escalationCount: 4, bottleneckCount: 2, accountabilityLoad: 5 },
    { heatmapId: 'HM-5', tenantSlug: 'tabsons', department: 'Finance', empId: 'EMP-1', ownerId: 'MGR-1', state: 'DEGRADED', densityScore: 72, workloadPressure: 70, throughputScore: 48, kpiId: 'KPI-5', zone: 'DEGRADED' },
    { heatmapId: 'HM-ARCH', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'ARCHIVED', densityScore: 20, workloadPressure: 15, throughputScore: 92, strategicNotes: 'immutable archived heatmap note' },
    { heatmapId: 'HM-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'CRITICAL', densityScore: 99, workloadPressure: 99, throughputScore: 5, kpiId: 'KPI-X', strategicNotes: 'ABC confidential heatmap' }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'IN_PROGRESS', progressPercent: 55, workloadUnits: 5, throughputScore: 76, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'BLOCKED', progressPercent: 20, workloadUnits: 9, throughputScore: 35, kpiId: 'KPI-2' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'ESCALATED', progressPercent: 10, workloadUnits: 8, throughputScore: 25, kpiId: 'KPI-4' },
    { executionId: 'EX-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'BLOCKED', progressPercent: 15, workloadUnits: 7, throughputScore: 20, kpiId: 'KPI-3' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'BLOCKED', progressPercent: 5, strategicNotes: 'ABC confidential execution' }
  ];
  data.strategicBottleneckRecords = [
    { bottleneckId: 'BN-1', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'DETECTED', severity: 'HIGH', queueAgeHours: 72, throughputScore: 32, kpiId: 'KPI-2', strategicNotes: 'private operations bottleneck' },
    { bottleneckId: 'BN-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'ESCALATED', severity: 'CRITICAL', queueAgeHours: 96, throughputScore: 20, kpiId: 'KPI-4' },
    { bottleneckId: 'BN-3', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'CRITICAL', severity: 'CRITICAL', queueAgeHours: 120, throughputScore: 18, kpiId: 'KPI-3' },
    { bottleneckId: 'BN-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'CRITICAL', severity: 'CRITICAL', strategicNotes: 'ABC confidential bottleneck' }
  ];
  data.workflowQueues = [
    { queueId: 'WQ-1', tenantSlug: 'tabsons', department: 'Operations', workflowId: 'WF-2', empId: 'EMP-2', ownerId: 'MGR-1', status: 'BLOCKED', queueAgeHours: 72, approvalPending: true },
    { queueId: 'WQ-2', tenantSlug: 'tabsons', department: 'Operations', workflowId: 'WF-3', empId: 'EMP-2', ownerId: 'MGR-1', status: 'DEGRADED', queueAgeHours: 96, approvalPending: true },
    { queueId: 'WQ-3', tenantSlug: 'tabsons', department: 'HR', workflowId: 'WF-4', empId: 'EMP-3', ownerId: 'MGR-2', status: 'FAILED', queueAgeHours: 120, approvalPending: true },
    { queueId: 'WQ-X', tenantSlug: 'abc', department: 'Finance', workflowId: 'WF-X', empId: 'EMP-X', ownerId: 'MGR-X', status: 'BLOCKED', strategicNotes: 'ABC confidential queue' }
  ];
  data.kpiScorecards = [
    { scorecardId: 'KSC-1', tenantSlug: 'tabsons', department: 'Engineering', ownerId: 'MGR-1', kpiId: 'KPI-1', state: 'HEALTHY', currentValue: 82, targetValue: 80, score: 82 },
    { scorecardId: 'KSC-2', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', kpiId: 'KPI-2', state: 'DEGRADED', currentValue: 38, targetValue: 75, score: 38, trend: -18 },
    { scorecardId: 'KSC-3', tenantSlug: 'tabsons', department: 'HR', ownerId: 'MGR-2', kpiId: 'KPI-3', state: 'AT_RISK', currentValue: 44, targetValue: 80, score: 44, trend: -12 },
    { scorecardId: 'KSC-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', kpiId: 'KPI-X', state: 'DEGRADED', strategicNotes: 'ABC confidential KPI' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', executionId: 'EX-1', empId: 'EMP-1', kpiId: 'KPI-1', progressPercent: 55, score: 72 },
    { id: 'PG-2', tenantSlug: 'tabsons', executionId: 'EX-2', empId: 'EMP-2', kpiId: 'KPI-2', progressPercent: 20, score: 38, degraded: true },
    { id: 'PG-3', tenantSlug: 'tabsons', executionId: 'EX-4', empId: 'EMP-3', kpiId: 'KPI-3', progressPercent: 15, score: 42, degraded: true },
    { id: 'PG-X', tenantSlug: 'abc', executionId: 'EX-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', department: 'Operations', escalationType: 'HEATMAP_CONGESTION', severity: 'HIGH', status: 'ESCALATED' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', department: 'Operations', escalationType: 'REPEATED_HEATMAP_HOTSPOT', severity: 'WARNING', status: 'OPEN' },
    { id: 'ESC-3', escalationId: 'ESC-3', tenantSlug: 'tabsons', department: 'HR', escalationType: 'WORKLOAD_PRESSURE', severity: 'HIGH', status: 'OPEN' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', department: 'Finance', escalationType: 'ABC_PRIVATE_HOTSPOT', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.leadershipAccountabilityReports = [
    { reportId: 'LAR-1', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', state: 'AT_RISK', responseHours: 56, accountabilityLoad: 4 },
    { reportId: 'LAR-2', tenantSlug: 'tabsons', department: 'HR', ownerId: 'MGR-2', state: 'ESCALATED', responseHours: 72, accountabilityLoad: 5 },
    { reportId: 'LAR-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', state: 'ESCALATED', strategicNotes: 'ABC confidential accountability' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', department: 'Operations', type: 'CONGESTION_DENSITY_SPIKE', status: 'DEGRADED', module: 'Execution Heatmap' },
    { eventId: 'WF-2', tenantSlug: 'tabsons', department: 'Operations', type: 'THROUGHPUT_DEGRADATION', status: 'FAILED', module: 'Execution Heatmap' },
    { eventId: 'WF-3', tenantSlug: 'tabsons', department: 'HR', type: 'WORKLOAD_OVERLOAD', status: 'BLOCKED', module: 'Execution Heatmap' },
    { eventId: 'WF-X', tenantSlug: 'abc', department: 'Finance', type: 'ABC_PRIVATE_HEATMAP', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/escalationCommandService.js',
    'services/performanceGovernanceService.js',
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/strategicDependencyService.js',
    'services/departmentExecutionBoardService.js',
    'services/quarterlyGoalService.js',
    'services/leadershipAccountabilityService.js',
    'services/strategicBottleneckService.js'
  ].forEach(load);
  loadIfExists('services/kpiScorecardService.js');
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/executionHeatmapService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedHeatmapData();

  const svc = global.ExecutionHeatmapService;
  assert.ok(svc, 'ExecutionHeatmapService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.EXECUTION_HEATMAP_STATES), 'heatmap states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_EXECUTION_HEATMAP_SELF_TEST__.passed, true, 'development self-test should cover heatmap failure cases');

  assert.equal(svc.classifyPerformanceDensity({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPerformanceDensity({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPerformanceDensity({ unsafeStrategicExposure: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPerformanceDensity({ unsafeStrategicOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyPerformanceDensity({ workloadOverload: true }), 'HIGH_RISK');
  assert.equal(svc.classifyPerformanceDensity({ kpiPressure: true }), 'WARNING');

  const employeeAssigned = svc.validateHeatmapScope({ tenantSlug: 'tabsons', empId: 'EMP-2', heatmapId: 'HM-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned workload heatmap');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_WORKLOAD_VISIBILITY_ONLY');

  const managerDepartment = svc.validateHeatmapScope({ tenantSlug: 'tabsons', department: 'Operations', heatmapId: 'HM-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department execution heatmaps');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_EXECUTION_HEATMAPS');

  const superAdminOverride = svc.validateHeatmapScope({ tenantSlug: 'tabsons', heatmapId: 'HM-2', heatmapMutation: true, strategicNotes: 'private heatmap override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify strategic execution heatmaps');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_STRATEGIC_HEATMAP_MODIFICATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /HM-2|private heatmap|strategicNotes/i);

  const platformScope = svc.validateHeatmapScope({ tenantSlug: 'tabsons', heatmapId: 'HM-2', ownerId: 'MGR-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant execution chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED'));

  const crossTenant = svc.validateHeatmapScope({ tenantSlug: 'abc', heatmapId: 'HM-X', ownerId: 'MGR-X', strategicNotes: 'ABC confidential heatmap' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant execution visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /HM-X|MGR-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validateHeatmapScope({ tenantSlug: 'tabsons', heatmapId: 'HM-ARCH', state: 'ARCHIVED', heatmapMutation: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived heatmap analytics must be immutable');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_HEATMAP_MUTATION_BLOCKED'));

  const malformed = svc.normalizeHeatmapPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed heatmap payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_HEATMAP_PAYLOAD'));

  const normalized = svc.normalizeHeatmapPayload({
    tenantSlug: 'tabsons',
    heatmapId: 'HM-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'high load',
    densityScore: 78,
    workloadPressure: 84,
    throughputScore: 45,
    kpiId: 'KPI-2',
    strategicNotes: 'private operations heat zone'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid heatmap payload should normalize');
  assert.equal(normalized.payload.state, 'HIGH_LOAD');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /HM-2|EMP-2|MGR-1|KPI-2|private operations|strategicNotes/i);

  const density = svc.evaluatePerformanceDensity({
    tenantSlug: 'tabsons',
    heatmapId: 'HM-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'HIGH_LOAD',
    densityScore: 78,
    workloadPressure: 84,
    throughputScore: 45
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(density.success, true, 'performance density governance should evaluate safely');
  assert.equal(density.performanceDensity.executionIntensityScoring, true);
  assert.equal(density.performanceDensity.congestionSeverityGrading, true);
  assert.equal(density.performanceDensity.strategicPerformanceZoning, true);
  assert.equal(density.performanceDensity.unsafeStrategicOverridesBlocked, true);

  const pressure = svc.detectExecutionPressure({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-29T00:00:00.000Z' });
  assert.equal(pressure.success, true, 'execution pressure detection should work');
  assert.ok(pressure.summary.overloadedDepartments >= 1);
  assert.ok(pressure.summary.executionCongestionClusters >= 1);
  assert.ok(pressure.summary.repeatedEscalationHotspots >= 1);
  assert.ok(pressure.summary.throughputDegradation >= 1);
  assert.ok(pressure.summary.stalledWorkflowDensity >= 1);
  assert.ok(pressure.summary.accountabilityOverloadPatterns >= 1);
  assert.ok(Object.isFrozen(pressure.heatZones), 'heat zones must be immutable');
  assert.doesNotMatch(JSON.stringify(pressure), /HM-X|MGR-X|ABC confidential|private operations|strategicNotes/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    executionHeatmapSnapshots: before.executionHeatmapSnapshots,
    departmentExecutionRecords: before.departmentExecutionRecords,
    strategicBottleneckRecords: before.strategicBottleneckRecords,
    workflowQueues: before.workflowQueues,
    kpiScorecards: before.kpiScorecards,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations,
    leadershipAccountabilityReports: before.leadershipAccountabilityReports,
    workflowEvents: before.workflowEvents
  });
  const report = svc.generateExecutionHeatmapReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'execution heatmap report should generate');
  assert.equal(report.readOnly, true, 'execution heatmap report must be read-only');
  assert.ok(report.executionHeatmapHealth.totalHeatZones >= 5);
  assert.ok(report.executionHeatmapHealth.highLoadZones >= 1);
  assert.ok(report.executionHeatmapHealth.congestedZones >= 1);
  assert.ok(report.executionHeatmapHealth.degradedZones >= 1);
  assert.ok(report.executionHeatmapHealth.criticalZones >= 1);
  assert.ok(report.performanceDensityGovernance.executionIntensityScoring >= 1);
  assert.ok(report.performanceDensityGovernance.congestionSeverityGrading >= 1);
  assert.ok(report.performanceDensityGovernance.kpiPerformanceDensityMapping >= 1);
  assert.ok(report.performanceDensityGovernance.escalationHotspotTracking >= 1);
  assert.ok(report.performanceDensityGovernance.workloadPressureAnalysis >= 1);
  assert.ok(report.performanceDensityGovernance.throughputDeclineMonitoring >= 1);
  assert.ok(report.performanceDensityGovernance.strategicPerformanceZoning >= 1);
  assert.equal(report.performanceDensityGovernance.unsafeStrategicOverride, false);
  assert.equal(report.performanceDensityGovernance.historicalHeatmapAnalyticsImmutable, true);
  assert.ok(report.workloadPressureIntelligence.overloadedDepartments >= 1);
  assert.ok(report.workloadPressureIntelligence.executionCongestionClusters >= 1);
  assert.ok(report.workloadPressureIntelligence.repeatedEscalationHotspots >= 1);
  assert.ok(report.workloadPressureIntelligence.throughputDegradation >= 1);
  assert.ok(report.workloadPressureIntelligence.stalledWorkflowDensity >= 1);
  assert.ok(report.workloadPressureIntelligence.accountabilityOverloadPatterns >= 1);
  assert.ok(report.kpiBottleneckIntegration.kpiLinkedHeatmaps >= 1);
  assert.ok(report.kpiBottleneckIntegration.bottleneckDensityOverlays >= 1);
  assert.ok(report.kpiBottleneckIntegration.escalationLinkedCongestion >= 1);
  assert.ok(report.kpiBottleneckIntegration.executionThroughputScoring >= 1);
  assert.ok(report.kpiBottleneckIntegration.departmentPerformanceZones >= 1);
  assert.equal(report.kpiBottleneckIntegration.unsafeKpiMutation, false);
  assert.ok(report.heatmapAnalytics.heatmapDensityTrends >= 1);
  assert.ok(report.heatmapAnalytics.congestionGrowth >= 1);
  assert.ok(report.heatmapAnalytics.escalationHotspotFrequency >= 1);
  assert.ok(report.heatmapAnalytics.throughputDeclinePatterns >= 1);
  assert.ok(report.heatmapAnalytics.overloadedDepartmentTrends >= 1);
  assert.ok(report.heatmapAnalytics.kpiPressureDistribution >= 1);
  assert.ok(report.heatmapAnalytics.operationalHealthChanges >= 0);
  assert.equal(report.visualizationGovernance.organizationWideHeatmaps, true);
  assert.ok(report.visualizationGovernance.departmentDensityGrids >= 1);
  assert.ok(report.visualizationGovernance.executionCongestionOverlays >= 1);
  assert.equal(report.visualizationGovernance.unsafeConfidentialExposure, false);
  assert.equal(report.accessGovernance.superAdminStrategicHeatmapModificationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantExecutionChain, false);
  assert.ok(report.integrationHealth.strategicBottleneckIntegrated, 'StrategicBottleneckService integration should be detected');
  assert.ok(report.integrationHealth.leadershipAccountabilityIntegrated, 'LeadershipAccountabilityService integration should be detected');
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.equal(report.integrationHealth.kpiScorecardIntegrated, !!global.KPIScorecardService, 'KPI scorecard integration should reflect optional dependency presence');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /HM-X|BN-X|EX-X|WQ-X|EMP-X|MGR-X|ABC confidential|private operations|confidential engineering|strategicNotes|salary|payroll|leave balance/i);
  assert.equal(JSON.stringify({
    executionHeatmapSnapshots: global.DB.get().executionHeatmapSnapshots,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    strategicBottleneckRecords: global.DB.get().strategicBottleneckRecords,
    workflowQueues: global.DB.get().workflowQueues,
    kpiScorecards: global.DB.get().kpiScorecards,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations,
    leadershipAccountabilityReports: global.DB.get().leadershipAccountabilityReports,
    workflowEvents: global.DB.get().workflowEvents
  }), historicalBefore, 'heatmap report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /HEATMAP|DENSITY|PRESSURE/.test(row.eventType || row.category || '')), 'heatmap telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.EXECUTION_HEATMAP_REPORTED, 'heatmap metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /HEATMAP|DENSITY|PRESSURE/.test(row.actionType || row.action || '')), 'heatmap actions should be audited safely');

  const originalKpi = global.KPIScorecardService;
  const originalBottleneck = global.StrategicBottleneckService;
  const originalLeadership = global.LeadershipAccountabilityService;
  const originalExecution = global.DepartmentExecutionBoardService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalTelemetry = global.WorkflowTelemetryService;
  try {
    delete global.KPIScorecardService;
    delete global.StrategicBottleneckService;
    delete global.LeadershipAccountabilityService;
    delete global.DepartmentExecutionBoardService;
    delete global.PerformanceGovernanceService;
    delete global.WorkflowTelemetryService;
    const degraded = svc.generateExecutionHeatmapReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing heatmap integrations should degrade safely');
    assert.equal(degraded.integrationHealth.kpiScorecardIntegrated, false);
    assert.equal(degraded.integrationHealth.strategicBottleneckIntegrated, false);
    assert.equal(degraded.integrationHealth.leadershipAccountabilityIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowTelemetryIntegrated, false);
  } finally {
    if (originalKpi) global.KPIScorecardService = originalKpi;
    if (originalBottleneck) global.StrategicBottleneckService = originalBottleneck;
    if (originalLeadership) global.LeadershipAccountabilityService = originalLeadership;
    if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalTelemetry) global.WorkflowTelemetryService = originalTelemetry;
  }

  console.log('executionHeatmapService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
