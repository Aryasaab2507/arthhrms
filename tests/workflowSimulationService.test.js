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
    style: { setProperty(){}, removeProperty(){} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
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
    origin: 'https://platform.arthhrms.com',
    hostname: 'platform.arthhrms.com',
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

function seedSimulationData() {
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
  data.workflowSimulationHistory = [];
  data.scenarioReportHistory = [];
  data.simulationAnalyticsHistory = [];
  data.auditLogs = [];
  data.leaveRequests = [
    { id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', department: 'HR', status: 'PENDING', days: 3 },
    { id: 'LEAVE-X', tenantSlug: 'abc', employeeId: 'ABC-1', department: 'Finance', status: 'PENDING', salary: 999999 }
  ];
  data.attendanceRecords = [
    { id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'EMP-2', department: 'Operations', status: 'LATE' },
    { id: 'ATT-X', tenantSlug: 'abc', employeeId: 'ABC-2', department: 'Finance', status: 'ABSENT', confidentialNote: 'ABC private attendance' }
  ];
  data.approvals = [
    { id: 'APR-1', tenantSlug: 'tabsons', department: 'Operations', approverDepartment: 'Leadership', status: 'PENDING', ageHours: 72 },
    { id: 'APR-X', tenantSlug: 'abc', department: 'Finance', status: 'PENDING', confidentialNote: 'ABC private approval' }
  ];
  data.onboardingWorkflows = [
    { id: 'ONB-1', tenantSlug: 'tabsons', department: 'HR', status: 'IN_PROGRESS', completionPercent: 55 }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', department: 'Operations', governanceState: 'AT_RISK', progressPercent: 44, deadlineDate: '2026-06-20', kpiId: 'KPI-1' },
    { id: 'DEL-X', deliverableId: 'DEL-X', tenantSlug: 'abc', department: 'Finance', governanceState: 'BLOCKED', confidentialNote: 'ABC private deliverable' }
  ];
  data.okrObjectives = [
    { tenantSlug: 'tabsons', objectiveId: 'OBJ-1', title: 'Improve execution velocity', level: 'department', department: 'Operations', status: 'ACTIVE', progressPercent: 62, ownerId: 'MGR-1' },
    { tenantSlug: 'abc', objectiveId: 'OBJ-X', title: 'ABC private OKR', level: 'department', department: 'Finance', salary: 999999 }
  ];
  data.crossDepartmentDependencies = [
    { tenantSlug: 'tabsons', dependencyId: 'DEP-1', dependencyType: 'approval', sourceDepartment: 'HR', targetDepartment: 'Operations', sourceId: 'HR', targetId: 'Operations', ownerId: 'HR-1', assigneeId: 'MGR-1', state: 'BLOCKED', delayDays: 6, blockerCount: 2, progressPercent: 25 },
    { tenantSlug: 'abc', dependencyId: 'DEP-X', dependencyType: 'department', sourceDepartment: 'Finance', targetDepartment: 'HR', state: 'BLOCKED', confidentialNote: 'ABC private chain' }
  ];
  global.DB.save(data);
}

function assertImmutable(value, label) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item, index) => {
      if (item && typeof item === 'object') assert.ok(Object.isFrozen(item), `${label}.${index} should be frozen`);
    });
  }
}

function liveRecordSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    leaveRequests: data.leaveRequests,
    attendanceRecords: data.attendanceRecords,
    approvals: data.approvals,
    onboardingWorkflows: data.onboardingWorkflows,
    strategicDeliverables: data.strategicDeliverables,
    okrObjectives: data.okrObjectives,
    crossDepartmentDependencies: data.crossDepartmentDependencies
  });
}

function sampleSimulationPayload() {
  return {
    tenantSlug: 'tabsons',
    simulationName: 'Q3 execution resilience scenario',
    domains: ['approval', 'leave', 'attendance', 'onboarding', 'strategic_initiative', 'okr', 'deliverable', 'department_execution', 'dependency_chain'],
    baseline: {
      approvalCycleHours: 48,
      staffingLevel: 100,
      deliverableDelayDays: 0,
      kpiTargetIndex: 100,
      workflowThroughput: 72,
      executionVelocity: 64,
      riskScore: 42
    },
    scenarios: [
      { tenantSlug: 'tabsons', scenarioId: 'SCN-OPT', scenarioType: 'optimistic', approvalDelayChangePercent: -10, staffingChangePercent: 5, deliverableSlipDays: 0, kpiTargetChangePercent: 5, dependencyDelayDays: 0 },
      { tenantSlug: 'tabsons', scenarioId: 'SCN-EXP', scenarioType: 'expected', approvalDelayChangePercent: 20, staffingChangePercent: 0, deliverableSlipDays: 7, kpiTargetChangePercent: 15, dependencyDelayDays: 4 },
      { tenantSlug: 'tabsons', scenarioId: 'SCN-PES', scenarioType: 'pessimistic', approvalDelayChangePercent: 40, staffingChangePercent: -15, deliverableSlipDays: 14, kpiTargetChangePercent: 20, dependencyDelayDays: 9 },
      { tenantSlug: 'abc', scenarioId: 'SCN-ABC', scenarioType: 'custom', approvalDelayChangePercent: 99, confidentialNote: 'ABC private scenario', salary: 999999 }
    ],
    records: {
      approvals: [
        { tenantSlug: 'tabsons', id: 'APR-1', department: 'Operations', status: 'PENDING', ageHours: 72 },
        { tenantSlug: 'abc', id: 'APR-X', department: 'Finance', status: 'PENDING', confidentialNote: 'ABC private approval' }
      ],
      dependencies: [
        { tenantSlug: 'tabsons', dependencyId: 'DEP-1', sourceDepartment: 'HR', targetDepartment: 'Operations', state: 'BLOCKED', delayDays: 6 },
        { tenantSlug: 'abc', dependencyId: 'DEP-X', sourceDepartment: 'Finance', targetDepartment: 'HR', confidentialNote: 'ABC private dependency' }
      ],
      kpis: [
        { tenantSlug: 'tabsons', kpiId: 'KPI-1', domain: 'strategic_kpi', currentValue: 64, targetValue: 100 },
        { tenantSlug: 'abc', kpiId: 'KPI-X', currentValue: 1, targetValue: 999, salary: 999999 }
      ],
      workforce: [
        { tenantSlug: 'tabsons', department: 'HR', staffingLevel: 92, absentRate: 6 },
        { tenantSlug: 'abc', department: 'Finance', staffingLevel: 20, confidentialNote: 'ABC private workforce' }
      ]
    },
    aiSignals: {
      riskPredictions: [{ domain: 'approval_workflow', riskLevel: 'HIGH', riskScore: 74, confidenceScore: 73, explanation: 'Approval duration is trending above baseline.' }],
      kpiForecasts: [{ domain: 'strategic_kpi', achievementProbability: 59, forecastConfidence: 69, explanation: 'KPI target increase reduces achievement probability.' }],
      performanceForecasts: [{ domain: 'department_execution', performanceLevel: 'AT_RISK', achievementProbability: 63, explanation: 'Staffing pressure reduces execution confidence.' }],
      escalationPredictions: [{ domain: 'dependency_chain', escalationLevel: 'HIGH', escalationProbability: 71, urgencyScore: 76, explanation: 'Blocked dependency chain may need human escalation.' }],
      dependencyInsights: [{ domain: 'dependency_chain', bottleneckScore: 68, explanation: 'Operations handoff is a projected bottleneck.' }]
    },
    analytics: {
      simulationFrequency: 4,
      forecastDeviation: 12,
      predictedBottlenecks: 3,
      planningEffectiveness: 74,
      executionConfidence: 61
    },
    metadata: {
      source: 'workflow-simulation-test',
      rawPayload: 'salary 999999 confidential tenant data'
    }
  };
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/crossDepartmentDependencyService.js',
    'services/advancedOkrService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js',
    'services/organizationPerformanceForecastingService.js'
  ].forEach(load);
  seedSimulationData();

  let loadError = null;
  try {
    load('services/workflowSimulationService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.WorkflowSimulationService;
  assert.ok(svc, 'WorkflowSimulationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.createSimulation, 'function');
  assert.equal(typeof svc.runScenarioModel, 'function');
  assert.equal(typeof svc.calculateImpactScore, 'function');
  assert.equal(typeof svc.generateSimulationInsights, 'function');
  assert.equal(typeof svc.normalizeSimulationPayload, 'function');
  assert.equal(typeof svc.freezeSimulationOutput, 'function');
  assert.equal(typeof svc.generateWorkflowSimulationReport, 'function');
  assert.equal(global.__ARTHHRMS_WORKFLOW_SIMULATION_SELF_TEST__.passed, true, 'development self-test should cover simulation, scenario modeling, impacts, AI integration, and immutability');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };

  const malformed = svc.normalizeSimulationPayload('bad payload', directorContext);
  assert.equal(malformed.success, false, 'malformed simulation payload should fail safely');
  assertImmutable(malformed, 'malformed simulation output');

  const normalized = svc.normalizeSimulationPayload(sampleSimulationPayload(), directorContext);
  assert.equal(normalized.success, true, 'simulation payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.scenarios.length, 3, 'cross-tenant scenarios should be filtered');
  assert.equal(normalized.records.approvals.length, 1, 'cross-tenant approvals should be filtered');
  assert.equal(normalized.records.dependencies.length, 1, 'cross-tenant dependencies should be filtered');
  assert.equal(normalized.domains.includes('dependency_chain'), true);
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|confidentialNote|rawPayload|ABC private|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized simulation output');

  const liveBeforeCreate = liveRecordSnapshot();
  const created = svc.createSimulation(sampleSimulationPayload(), directorContext);
  assert.equal(created.success, true, 'authorized director should create simulation');
  assert.equal(created.simulation.state, 'CONFIGURED');
  assert.equal(created.governance.readOnlySimulation, true);
  assert.equal(created.governance.noLiveRecordModification, true);
  assert.equal(liveRecordSnapshot(), liveBeforeCreate, 'simulation creation must not mutate live records');
  assertImmutable(created, 'created simulation output');

  const employeeBlocked = svc.createSimulation({
    ...sampleSimulationPayload(),
    domains: ['strategic_initiative', 'department_execution'],
    scenarioScope: 'organization'
  }, {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(employeeBlocked.success, false, 'employee must not create organization-wide simulations');
  assert.match(employeeBlocked.classification, /UNAUTHORIZED|SCOPE|GOVERNANCE|ROLE/i);

  const platformBlocked = svc.createSimulation(sampleSimulationPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons', department: 'Platform' }
  });
  assert.equal(platformBlocked.success, false, 'PLATFORM_OWNER must have governance visibility only');

  const liveBeforeRun = liveRecordSnapshot();
  const scenarios = svc.runScenarioModel(sampleSimulationPayload(), directorContext);
  assert.equal(scenarios.success, true, 'scenario modeling should run');
  assert.equal(scenarios.scenarioResults.length, 3);
  assert.ok(scenarios.scenarioResults.every(row => row.impactScore >= 0 && row.executionScore >= 0));
  assert.ok(scenarios.projectedOutcomes.length >= 3);
  assert.ok(scenarios.timelineImpact.totalDelayDays >= 0);
  assert.ok(scenarios.dependencyImpact.projectedBlockedDependencies >= 0);
  assert.equal(liveRecordSnapshot(), liveBeforeRun, 'scenario modeling must not mutate live records');
  assertImmutable(scenarios, 'scenario model output');

  const impact = svc.calculateImpactScore(sampleSimulationPayload(), directorContext);
  assert.equal(impact.success, true, 'impact scoring should run');
  assert.ok(impact.impactScore > 0);
  assert.ok(impact.riskImpactScore > 0);
  assert.ok(impact.forecastImpactScore >= 0);
  assertImmutable(impact, 'impact score output');

  const insights = svc.generateSimulationInsights(sampleSimulationPayload(), directorContext);
  assert.equal(insights.success, true, 'AI insights should generate');
  assert.ok(insights.simulationInsights.length >= 1);
  assert.ok(insights.projectedBottlenecks.length >= 1);
  assert.ok(insights.recommendedActions.length >= 1);
  assert.equal(insights.advisoryOnly, true);
  assertImmutable(insights, 'simulation insights output');

  const report = svc.generateWorkflowSimulationReport(sampleSimulationPayload(), directorContext);
  assert.equal(report.success, true, 'simulation report should generate');
  assert.equal(report.readOnly, true);
  assert.equal(report.temporary, true);
  assert.equal(report.isolated, true);
  assert.ok(report.scenarioComparison.length >= 3);
  assert.ok(report.projectedOutcomes.length >= 3);
  assert.ok(report.impactAnalysis.impactScore > 0);
  assert.ok(report.aiInsights.recommendedActions.length >= 1);
  assert.ok(report.analytics.simulationEffectivenessScore >= 0);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.noApprovalModification, true);
  assert.equal(report.governance.noProductionDataImpact, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|rawPayload|ABC private|abc/i, 'report must not leak confidential or cross-tenant simulation values');
  assertImmutable(report, 'workflow simulation report');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.workflowSimulationHistory || []).length >= 1, 'simulation history should persist immutably');
  assert.ok((dataAfter.scenarioReportHistory || []).length >= 1, 'scenario reports should persist immutably');
  assert.ok((dataAfter.simulationAnalyticsHistory || []).length >= 1, 'simulation analytics should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /SIMULATION/.test(log.actionType || log.eventType || '')), 'audit integration should record simulation actions');

  const crossTenant = svc.generateWorkflowSimulationReport({ ...sampleSimulationPayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(crossTenant.success, false, 'cross-tenant simulation report should be blocked');
  assert.match(crossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateWorkflowSimulationReport(sampleSimulationPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'Operations' }
  });
  assert.equal(managerScoped.success, true, 'manager simulation scope should generate');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_SIMULATION_VISIBILITY');
  assert.ok(managerScoped.records.approvals.every(row => row.department === 'Operations' || row.approverDepartment === 'Operations'), 'manager scope should not leak unrelated approvals');

  const invalidScenario = svc.runScenarioModel({
    tenantSlug: 'tabsons',
    scenarios: [{ tenantSlug: 'tabsons', scenarioId: 'BAD', scenarioType: 'custom', approvalDelayChangePercent: 'not-a-number' }]
  }, directorContext);
  assert.equal(invalidScenario.success, true, 'invalid scenario values should degrade safely');
  assert.ok(invalidScenario.edgeCases.invalidScenariosDetected);

  const circularDependency = svc.generateWorkflowSimulationReport({
    ...sampleSimulationPayload(),
    dependencyGraph: {
      relationships: [
        { fromDependencyId: 'A', toDependencyId: 'B' },
        { fromDependencyId: 'B', toDependencyId: 'A' }
      ]
    }
  }, directorContext);
  assert.equal(circularDependency.success, true, 'circular dependency simulation should not throw');
  assert.equal(circularDependency.edgeCases.circularDependenciesDetected, true);
  assert.ok(circularDependency.simulationWarnings.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalDependency = global.CrossDepartmentDependencyService;
  const originalDependencyAlias = global.crossDepartmentDependencyService;
  const originalRisk = global.AIRiskPredictionService;
  const originalRiskAlias = global.aiRiskPredictionService;
  const originalKpi = global.AIKPIForecastingService;
  const originalKpiAlias = global.aiKpiForecastingService;
  const originalEsc = global.SmartEscalationPredictionService;
  const originalEscAlias = global.smartEscalationPredictionService;
  const originalPerf = global.OrganizationPerformanceForecastingService;
  const originalPerfAlias = global.organizationPerformanceForecastingService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.CrossDepartmentDependencyService;
  delete global.crossDepartmentDependencyService;
  delete global.AIRiskPredictionService;
  delete global.aiRiskPredictionService;
  delete global.AIKPIForecastingService;
  delete global.aiKpiForecastingService;
  delete global.SmartEscalationPredictionService;
  delete global.smartEscalationPredictionService;
  delete global.OrganizationPerformanceForecastingService;
  delete global.organizationPerformanceForecastingService;
  const dependencyAbsent = svc.generateWorkflowSimulationReport(sampleSimulationPayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.dependencyIntelligenceIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiKpiForecastingIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.smartEscalationPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.organizationPerformanceForecastingIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.CrossDepartmentDependencyService = originalDependency;
  global.crossDepartmentDependencyService = originalDependencyAlias;
  global.AIRiskPredictionService = originalRisk;
  global.aiRiskPredictionService = originalRiskAlias;
  global.AIKPIForecastingService = originalKpi;
  global.aiKpiForecastingService = originalKpiAlias;
  global.SmartEscalationPredictionService = originalEsc;
  global.smartEscalationPredictionService = originalEscAlias;
  global.OrganizationPerformanceForecastingService = originalPerf;
  global.organizationPerformanceForecastingService = originalPerfAlias;

  console.log('workflowSimulationService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
