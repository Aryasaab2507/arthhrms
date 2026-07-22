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

function seedPredictionData() {
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
  data.strategicDelayPredictions = [
    { predictionId: 'PRED-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'MONITORING', probability: 28, milestoneId: 'MS-1', dependencyId: 'DEP-1', kpiId: 'KPI-1', forecastWindowDays: 14, strategicNotes: 'confidential engineering forecast' },
    { predictionId: 'PRED-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'HIGH_RISK', probability: 82, milestoneId: 'MS-2', dependencyId: 'DEP-2', kpiId: 'KPI-2', forecastWindowDays: 10, queueAgeHours: 80, throughputScore: 34, strategicNotes: 'private operations prediction' },
    { predictionId: 'PRED-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'CRITICAL_RISK', probability: 94, milestoneId: 'MS-3', dependencyId: 'DEP-3', kpiId: 'KPI-4', forecastWindowDays: 7, queueAgeHours: 120, throughputScore: 20, escalationProbability: 88 },
    { predictionId: 'PRED-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'ESCALATED', probability: 90, milestoneId: 'MS-4', dependencyId: 'DEP-4', kpiId: 'KPI-3', forecastWindowDays: 5, queueAgeHours: 110, throughputScore: 18, workloadPressure: 96 },
    { predictionId: 'PRED-ARCH', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'ARCHIVED', probability: 12, strategicNotes: 'immutable archived prediction note' },
    { predictionId: 'PRED-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'CRITICAL_RISK', probability: 99, milestoneId: 'MS-X', dependencyId: 'DEP-X', kpiId: 'KPI-X', strategicNotes: 'ABC confidential prediction' }
  ];
  data.executionHeatmapSnapshots = [
    { heatmapId: 'HM-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'ACTIVE', densityScore: 55, workloadPressure: 45, throughputScore: 82, kpiId: 'KPI-1' },
    { heatmapId: 'HM-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'HIGH_LOAD', densityScore: 78, workloadPressure: 84, throughputScore: 45, kpiId: 'KPI-2', escalationCount: 2, bottleneckCount: 2, strategicNotes: 'private operations heat zone' },
    { heatmapId: 'HM-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'CONGESTED', densityScore: 88, workloadPressure: 91, throughputScore: 32, kpiId: 'KPI-4', escalationCount: 3, bottleneckCount: 3 },
    { heatmapId: 'HM-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'CRITICAL', densityScore: 94, workloadPressure: 96, throughputScore: 18, kpiId: 'KPI-3', escalationCount: 4, bottleneckCount: 2 },
    { heatmapId: 'HM-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'CRITICAL', densityScore: 99, workloadPressure: 99, throughputScore: 5, kpiId: 'KPI-X', strategicNotes: 'ABC confidential heatmap' }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', milestoneId: 'MS-1', state: 'IN_PROGRESS', dueDate: '2026-06-10', progressPercent: 55, workloadUnits: 5, throughputScore: 76, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', milestoneId: 'MS-2', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, throughputScore: 35, kpiId: 'KPI-2' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', milestoneId: 'MS-3', state: 'ESCALATED', dueDate: '2026-05-10', progressPercent: 10, workloadUnits: 8, throughputScore: 25, kpiId: 'KPI-4' },
    { executionId: 'EX-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', milestoneId: 'MS-4', state: 'BLOCKED', dueDate: '2026-05-20', progressPercent: 15, workloadUnits: 7, throughputScore: 20, kpiId: 'KPI-3' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', milestoneId: 'MS-X', state: 'BLOCKED', progressPercent: 5, strategicNotes: 'ABC confidential execution' }
  ];
  data.strategicBottleneckRecords = [
    { bottleneckId: 'BN-1', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'DETECTED', severity: 'HIGH', queueAgeHours: 72, throughputScore: 32, kpiId: 'KPI-2', strategicNotes: 'private operations bottleneck' },
    { bottleneckId: 'BN-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', state: 'ESCALATED', severity: 'CRITICAL', queueAgeHours: 96, throughputScore: 20, kpiId: 'KPI-4' },
    { bottleneckId: 'BN-3', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', state: 'CRITICAL', severity: 'CRITICAL', queueAgeHours: 120, throughputScore: 18, kpiId: 'KPI-3' },
    { bottleneckId: 'BN-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', state: 'CRITICAL', severity: 'CRITICAL', strategicNotes: 'ABC confidential bottleneck' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', sourceDepartment: 'Engineering', targetDepartment: 'Operations', ownerId: 'MGR-1', empId: 'EMP-1', state: 'ACTIVE', status: 'ACTIVE', dueDate: '2026-06-15', kpiId: 'KPI-1' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', sourceDepartment: 'Operations', targetDepartment: 'Engineering', ownerId: 'MGR-1', empId: 'EMP-2', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-15', kpiId: 'KPI-2' },
    { dependencyId: 'DEP-3', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-3', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', empId: 'EMP-2', state: 'AT_RISK', status: 'WAITING', dueDate: '2026-05-10', kpiId: 'KPI-4' },
    { dependencyId: 'DEP-4', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-4', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'MGR-2', empId: 'EMP-3', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-20', kpiId: 'KPI-3' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', sourceDepartment: 'Finance', targetDepartment: 'Finance', ownerId: 'MGR-X', empId: 'EMP-X', state: 'BLOCKED', status: 'BLOCKED', strategicNotes: 'ABC confidential dependency' }
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
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', department: 'Operations', escalationType: 'PREDICTED_DELAY', severity: 'HIGH', status: 'ESCALATED' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', department: 'Operations', escalationType: 'FORECAST_GROWTH', severity: 'WARNING', status: 'OPEN' },
    { id: 'ESC-3', escalationId: 'ESC-3', tenantSlug: 'tabsons', department: 'HR', escalationType: 'WORKLOAD_FORECAST', severity: 'HIGH', status: 'OPEN' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', department: 'Finance', escalationType: 'ABC_PRIVATE_FORECAST', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.leadershipAccountabilityReports = [
    { reportId: 'LAR-1', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', state: 'AT_RISK', responseHours: 56, accountabilityLoad: 4 },
    { reportId: 'LAR-2', tenantSlug: 'tabsons', department: 'HR', ownerId: 'MGR-2', state: 'ESCALATED', responseHours: 72, accountabilityLoad: 5 },
    { reportId: 'LAR-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', state: 'ESCALATED', strategicNotes: 'ABC confidential accountability' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', department: 'Operations', type: 'CONGESTION_PREDICTION_SPIKE', status: 'DEGRADED', module: 'Strategic Delay Prediction' },
    { eventId: 'WF-2', tenantSlug: 'tabsons', department: 'Operations', type: 'THROUGHPUT_DECLINE_PREDICTION', status: 'FAILED', module: 'Strategic Delay Prediction' },
    { eventId: 'WF-3', tenantSlug: 'tabsons', department: 'HR', type: 'WORKLOAD_OVERLOAD_FORECAST', status: 'BLOCKED', module: 'Strategic Delay Prediction' },
    { eventId: 'WF-X', tenantSlug: 'abc', department: 'Finance', type: 'ABC_PRIVATE_FORECAST', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/strategicBottleneckService.js',
    'services/executionHeatmapService.js'
  ].forEach(load);
  loadIfExists('services/kpiScorecardService.js');
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/strategicDelayPredictionService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedPredictionData();

  const svc = global.StrategicDelayPredictionService;
  assert.ok(svc, 'StrategicDelayPredictionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.PREDICTION_STATES), 'prediction states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_STRATEGIC_DELAY_PREDICTION_SELF_TEST__.passed, true, 'development self-test should cover prediction failure cases');

  assert.equal(svc.classifyPredictionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPredictionRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPredictionRisk({ unsafeStrategicExposure: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPredictionRisk({ unsafePredictiveOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyPredictionRisk({ congestionForecasting: true }), 'HIGH_RISK');
  assert.equal(svc.classifyPredictionRisk({ kpiDegradation: true }), 'WARNING');

  const employeeAssigned = svc.validatePredictionScope({ tenantSlug: 'tabsons', empId: 'EMP-2', predictionId: 'PRED-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned predictions');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_PREDICTION_VISIBILITY_ONLY');

  const managerDepartment = svc.validatePredictionScope({ tenantSlug: 'tabsons', department: 'Operations', predictionId: 'PRED-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department predictions');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_PREDICTION_VISIBILITY');

  const superAdminOverride = svc.validatePredictionScope({ tenantSlug: 'tabsons', predictionId: 'PRED-2', predictiveOverride: true, strategicNotes: 'private predictive override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify predictive execution intelligence');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_PREDICTIVE_MODIFICATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /PRED-2|private predictive|strategicNotes/i);

  const platformScope = svc.validatePredictionScope({ tenantSlug: 'tabsons', predictionId: 'PRED-2', ownerId: 'MGR-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant execution chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED'));

  const crossTenant = svc.validatePredictionScope({ tenantSlug: 'abc', predictionId: 'PRED-X', ownerId: 'MGR-X', strategicNotes: 'ABC confidential prediction' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant predictive visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /PRED-X|MGR-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validatePredictionScope({ tenantSlug: 'tabsons', predictionId: 'PRED-ARCH', state: 'ARCHIVED', predictiveOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived prediction records must be immutable');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_PREDICTION_MUTATION_BLOCKED'));

  const malformed = svc.normalizePredictionPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed prediction payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_PREDICTION_PAYLOAD'));

  const normalized = svc.normalizePredictionPayload({
    tenantSlug: 'tabsons',
    predictionId: 'PRED-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'high risk',
    probability: 82,
    forecastWindowDays: 10,
    milestoneId: 'MS-2',
    dependencyId: 'DEP-2',
    kpiId: 'KPI-2',
    strategicNotes: 'private operations prediction'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid prediction payload should normalize');
  assert.equal(normalized.payload.state, 'HIGH_RISK');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /PRED-2|EMP-2|MGR-1|MS-2|DEP-2|KPI-2|private operations|strategicNotes/i);

  const governance = svc.evaluatePredictiveGovernance({
    tenantSlug: 'tabsons',
    predictionId: 'PRED-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'HIGH_RISK',
    probability: 82,
    forecastWindowDays: 10
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(governance.success, true, 'predictive governance should evaluate safely');
  assert.equal(governance.predictiveExecutionGovernance.milestoneRiskForecasting, true);
  assert.equal(governance.predictiveExecutionGovernance.congestionForecasting, true);
  assert.equal(governance.predictiveExecutionGovernance.predictiveMitigationRecommendations, true);
  assert.equal(governance.predictiveExecutionGovernance.unsafeStrategicOverridesBlocked, true);

  const anomalies = svc.detectForecastAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-29T00:00:00.000Z' });
  assert.equal(anomalies.success, true, 'forecast anomaly detection should work');
  assert.ok(anomalies.summary.congestionPredictionSpikes >= 1);
  assert.ok(anomalies.summary.escalationForecastGrowth >= 1);
  assert.ok(anomalies.summary.kpiDegradationProbability >= 1);
  assert.ok(anomalies.summary.workloadOverloadForecasts >= 1);
  assert.ok(anomalies.summary.throughputDeclinePredictions >= 1);
  assert.ok(anomalies.summary.dependencySlowdownPredictions >= 1);
  assert.ok(Object.isFrozen(anomalies.forecasts), 'forecasts must be immutable');
  assert.doesNotMatch(JSON.stringify(anomalies), /PRED-X|MGR-X|ABC confidential|private operations|strategicNotes/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    strategicDelayPredictions: before.strategicDelayPredictions,
    executionHeatmapSnapshots: before.executionHeatmapSnapshots,
    departmentExecutionRecords: before.departmentExecutionRecords,
    strategicBottleneckRecords: before.strategicBottleneckRecords,
    deliverableDependencies: before.deliverableDependencies,
    workflowQueues: before.workflowQueues,
    kpiScorecards: before.kpiScorecards,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations,
    leadershipAccountabilityReports: before.leadershipAccountabilityReports,
    workflowEvents: before.workflowEvents
  });
  const report = svc.generateStrategicDelayPredictionReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'strategic delay prediction report should generate');
  assert.equal(report.readOnly, true, 'prediction report must be read-only');
  assert.ok(report.predictionHealth.totalPredictions >= 4);
  assert.ok(report.predictionHealth.highRiskPredictions >= 1);
  assert.ok(report.predictionHealth.criticalRiskPredictions >= 1);
  assert.ok(report.predictionHealth.escalatedPredictions >= 1);
  assert.ok(report.predictiveExecutionGovernance.milestoneRiskForecasting >= 1);
  assert.ok(report.predictiveExecutionGovernance.dependencyDelayPrediction >= 1);
  assert.ok(report.predictiveExecutionGovernance.executionSlowdownScoring >= 1);
  assert.ok(report.predictiveExecutionGovernance.escalationProbabilityGrading >= 1);
  assert.ok(report.predictiveExecutionGovernance.congestionForecasting >= 1);
  assert.ok(report.predictiveExecutionGovernance.predictiveMitigationRecommendations >= 1);
  assert.ok(report.predictiveExecutionGovernance.executionTrendForecasting >= 1);
  assert.equal(report.predictiveExecutionGovernance.unsafeStrategicOverride, false);
  assert.equal(report.predictiveExecutionGovernance.historicalPredictionRecordsImmutable, true);
  assert.ok(report.kpiBottleneckForecasting.kpiDegradationProbability >= 1);
  assert.ok(report.kpiBottleneckForecasting.executionCongestionGrowth >= 1);
  assert.ok(report.kpiBottleneckForecasting.dependencyLinkedSlowdownForecasts >= 1);
  assert.ok(report.kpiBottleneckForecasting.escalationLikelihoodSpikes >= 1);
  assert.ok(report.kpiBottleneckForecasting.overloadedDepartmentForecasts >= 1);
  assert.ok(report.kpiBottleneckForecasting.stalledExecutionChainPredictions >= 1);
  assert.equal(report.kpiBottleneckForecasting.unsafeKpiMutation, false);
  assert.ok(report.heatmapExecutionIntegration.heatmapBasedForecasting >= 1);
  assert.ok(report.heatmapExecutionIntegration.congestionPredictionOverlays >= 1);
  assert.ok(report.heatmapExecutionIntegration.workloadPressureForecasting >= 1);
  assert.ok(report.heatmapExecutionIntegration.executionThroughputForecasting >= 1);
  assert.ok(report.heatmapExecutionIntegration.strategicRiskTrendProjections >= 1);
  assert.ok(report.forecastAnalytics.predictionAccuracyTrends >= 0);
  assert.ok(report.forecastAnalytics.escalationProbabilityGrowth >= 1);
  assert.ok(report.forecastAnalytics.forecastCongestionPatterns >= 1);
  assert.ok(report.forecastAnalytics.workloadOverloadForecasts >= 1);
  assert.ok(report.forecastAnalytics.kpiDegradationTrends >= 1);
  assert.ok(report.forecastAnalytics.dependencySlowdownPredictions >= 1);
  assert.ok(report.forecastAnalytics.executionThroughputDeclineForecasts >= 1);
  assert.equal(report.predictiveVisualizationGovernance.unsafeConfidentialExposure, false);
  assert.equal(report.accessGovernance.superAdminPredictiveModificationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantExecutionChain, false);
  assert.ok(report.integrationHealth.executionHeatmapIntegrated, 'ExecutionHeatmapService integration should be detected');
  assert.ok(report.integrationHealth.strategicBottleneckIntegrated, 'StrategicBottleneckService integration should be detected');
  assert.ok(report.integrationHealth.leadershipAccountabilityIntegrated, 'LeadershipAccountabilityService integration should be detected');
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.equal(report.integrationHealth.kpiScorecardIntegrated, !!global.KPIScorecardService, 'KPI scorecard integration should reflect optional dependency presence');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /PRED-X|HM-X|BN-X|EX-X|DEP-X|WQ-X|EMP-X|MGR-X|ABC confidential|private operations|confidential engineering|strategicNotes|salary|payroll|leave balance/i);
  assert.equal(JSON.stringify({
    strategicDelayPredictions: global.DB.get().strategicDelayPredictions,
    executionHeatmapSnapshots: global.DB.get().executionHeatmapSnapshots,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    strategicBottleneckRecords: global.DB.get().strategicBottleneckRecords,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    workflowQueues: global.DB.get().workflowQueues,
    kpiScorecards: global.DB.get().kpiScorecards,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations,
    leadershipAccountabilityReports: global.DB.get().leadershipAccountabilityReports,
    workflowEvents: global.DB.get().workflowEvents
  }), historicalBefore, 'prediction report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /PREDICTION|FORECAST|DELAY/.test(row.eventType || row.category || '')), 'prediction telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STRATEGIC_DELAY_PREDICTION_REPORTED, 'prediction metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /PREDICTION|FORECAST|DELAY/.test(row.actionType || row.action || '')), 'prediction actions should be audited safely');

  const originalKpi = global.KPIScorecardService;
  const originalHeatmap = global.ExecutionHeatmapService;
  const originalBottleneck = global.StrategicBottleneckService;
  const originalLeadership = global.LeadershipAccountabilityService;
  const originalDependency = global.StrategicDependencyService;
  const originalExecution = global.DepartmentExecutionBoardService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalTelemetry = global.WorkflowTelemetryService;
  try {
    delete global.KPIScorecardService;
    delete global.ExecutionHeatmapService;
    delete global.StrategicBottleneckService;
    delete global.LeadershipAccountabilityService;
    delete global.StrategicDependencyService;
    delete global.DepartmentExecutionBoardService;
    delete global.PerformanceGovernanceService;
    delete global.WorkflowTelemetryService;
    const degraded = svc.generateStrategicDelayPredictionReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing prediction integrations should degrade safely');
    assert.equal(degraded.integrationHealth.kpiScorecardIntegrated, false);
    assert.equal(degraded.integrationHealth.executionHeatmapIntegrated, false);
    assert.equal(degraded.integrationHealth.strategicBottleneckIntegrated, false);
    assert.equal(degraded.integrationHealth.leadershipAccountabilityIntegrated, false);
    assert.equal(degraded.integrationHealth.strategicDependencyIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowTelemetryIntegrated, false);
  } finally {
    if (originalKpi) global.KPIScorecardService = originalKpi;
    if (originalHeatmap) global.ExecutionHeatmapService = originalHeatmap;
    if (originalBottleneck) global.StrategicBottleneckService = originalBottleneck;
    if (originalLeadership) global.LeadershipAccountabilityService = originalLeadership;
    if (originalDependency) global.StrategicDependencyService = originalDependency;
    if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalTelemetry) global.WorkflowTelemetryService = originalTelemetry;
  }

  console.log('strategicDelayPredictionService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
