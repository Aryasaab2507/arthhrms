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

function seedOKRData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.okrObjectives = [];
  data.okrKeyResults = [];
  data.okrHistory = [];
  data.okrProgressHistory = [];
  data.okrStrategicReviews = [];
  data.auditLogs = [];
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

function sampleOKRPayload() {
  return {
    tenantSlug: 'tabsons',
    objectives: [
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-ORG-1', title: 'Strengthen enterprise execution', level: 'organization', ownerId: 'DIR-1', ownerRole: 'DIRECTOR', department: 'Leadership', status: 'ACTIVE', parentObjectiveId: null, dependencies: [], progressPercent: 70 },
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-HR-1', title: 'Improve employee lifecycle velocity', level: 'department', ownerId: 'HR-1', ownerRole: 'HR', department: 'HR', status: 'ACTIVE', parentObjectiveId: 'OBJ-ORG-1', dependencies: ['OBJ-ORG-1'], progressPercent: 62 },
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-TEAM-1', title: 'Reduce approval turnaround', level: 'team', ownerId: 'MGR-1', ownerRole: 'MANAGER', department: 'HR', team: 'People Ops', status: 'AT_RISK', parentObjectiveId: 'OBJ-HR-1', dependencies: ['OBJ-HR-1'], progressPercent: 54 },
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-IND-1', title: 'Complete onboarding checklist improvements', level: 'individual', ownerId: 'EMP-1', ownerRole: 'EMPLOYEE', department: 'HR', team: 'People Ops', status: 'ACTIVE', parentObjectiveId: 'OBJ-TEAM-1', dependencies: ['OBJ-TEAM-1'], progressPercent: 44, contributorId: 'EMP-1' },
      { tenantSlug: 'abc', objectiveId: 'OBJ-ABC-1', title: 'ABC confidential payroll objective', level: 'organization', ownerId: 'ABC-OWNER', department: 'Finance', salary: 999999, leaveBalance: 44, confidentialNote: 'ABC tenant must be ignored' }
    ],
    keyResults: [
      { tenantSlug: 'tabsons', keyResultId: 'KR-ORG-1', objectiveId: 'OBJ-ORG-1', title: 'Reach 80% strategic execution health', targetValue: 100, currentValue: 72, forecastedCompletion: 80, confidenceScore: 76, status: 'IN_PROGRESS' },
      { tenantSlug: 'tabsons', keyResultId: 'KR-HR-1', objectiveId: 'OBJ-HR-1', title: 'Cut lifecycle queue age by 30%', targetValue: 100, currentValue: 58, forecastedCompletion: 68, confidenceScore: 64, status: 'IN_PROGRESS' },
      { tenantSlug: 'tabsons', keyResultId: 'KR-TEAM-1', objectiveId: 'OBJ-TEAM-1', title: 'Resolve approval bottlenecks', targetValue: 60, currentValue: 30, forecastedCompletion: 45, confidenceScore: 52, status: 'AT_RISK' },
      { tenantSlug: 'tabsons', keyResultId: 'KR-IND-1', objectiveId: 'OBJ-IND-1', title: 'Ship checklist changes', targetValue: 50, currentValue: 22, forecastedCompletion: 36, confidenceScore: 55, status: 'IN_PROGRESS' },
      { tenantSlug: 'abc', keyResultId: 'KR-ABC-1', objectiveId: 'OBJ-ABC-1', title: 'ABC hidden result', targetValue: 999, currentValue: 1, salary: 999999 }
    ],
    dependencies: [
      { tenantSlug: 'tabsons', fromObjectiveId: 'OBJ-HR-1', toObjectiveId: 'OBJ-ORG-1', type: 'alignment' },
      { tenantSlug: 'tabsons', fromObjectiveId: 'OBJ-TEAM-1', toObjectiveId: 'OBJ-HR-1', type: 'execution' }
    ],
    contributions: [
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-IND-1', contributorId: 'EMP-1', department: 'HR', contributionPercent: 44 }
    ],
    aiSignals: {
      riskIndicators: [{ domain: 'approval_bottlenecks', riskLevel: 'HIGH', riskScore: 71, reason: 'Approval delay trend is rising' }],
      kpiForecasts: [{ domain: 'strategic_kpis', achievementProbability: 63, forecastConfidence: 72, explanation: 'Strategic KPI trajectory is at risk' }],
      performanceForecasts: [{ domain: 'department_performance', achievementProbability: 61, performanceLevel: 'AT_RISK', explanation: 'Department performance needs review' }]
    },
    analytics: {
      completionRate: 58,
      objectiveSuccessRate: 62,
      keyResultAchievementRate: 54,
      departmentAlignment: 74,
      strategicExecutionVelocity: 60,
      accountabilityTrend: 68
    },
    metadata: {
      source: 'advanced-okr-test',
      confidentialEmployeeRecord: 'salary 999999 leaveBalance 44',
      rawPayload: 'private'
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
    'services/quarterlyGoalService.js',
    'services/departmentExecutionBoardService.js',
    'services/leadershipAccountabilityService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js',
    'services/organizationPerformanceForecastingService.js'
  ].forEach(load);
  seedOKRData();

  let loadError = null;
  try {
    load('services/advancedOkrService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.AdvancedOKRService;
  assert.ok(svc, 'AdvancedOKRService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.createObjective, 'function');
  assert.equal(typeof svc.createKeyResult, 'function');
  assert.equal(typeof svc.calculateAlignmentScore, 'function');
  assert.equal(typeof svc.calculateExecutionScore, 'function');
  assert.equal(typeof svc.normalizeOKRPayload, 'function');
  assert.equal(typeof svc.freezeOKROutput, 'function');
  assert.equal(typeof svc.generateOKRGovernanceReport, 'function');
  assert.equal(global.__ARTHHRMS_ADVANCED_OKR_SELF_TEST__.passed, true, 'development self-test should cover lifecycle, key result tracking, alignment, AI insight integration, and immutability');

  const malformed = svc.normalizeOKRPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed OKR output');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };
  const normalized = svc.normalizeOKRPayload(sampleOKRPayload(), directorContext);
  assert.equal(normalized.success, true, 'OKR payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.objectives.length, 4, 'cross-tenant objectives should be filtered');
  assert.equal(normalized.keyResults.length, 4, 'cross-tenant key results should be filtered');
  assert.ok(normalized.objectiveHierarchy.length >= 1, 'objective hierarchy should be built');
  assert.ok(normalized.linkageChains.some(chain => chain.join('>') === 'OBJ-ORG-1>OBJ-HR-1>OBJ-TEAM-1>OBJ-IND-1'), 'complete OKR linkage chain should be tracked');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC tenant|abc/i, 'normalized output must redact sensitive and cross-tenant OKR values');
  assertImmutable(normalized, 'normalized OKR output');

  const createdObjective = svc.createObjective({
    tenantSlug: 'tabsons',
    title: 'Launch customer success OKR',
    level: 'department',
    ownerId: 'DIR-1',
    department: 'Customer Success',
    status: 'DRAFT',
    parentObjectiveId: 'OBJ-ORG-1'
  }, directorContext);
  assert.equal(createdObjective.success, true, 'authorized director should create objective');
  assert.equal(createdObjective.objective.status, 'DRAFT');
  assert.equal(createdObjective.governance.noApprovalBypass, true);
  assertImmutable(createdObjective, 'created objective output');

  const employeeBlocked = svc.createObjective({
    tenantSlug: 'tabsons',
    title: 'Unauthorized org OKR',
    level: 'organization',
    ownerId: 'EMP-1',
    department: 'HR'
  }, {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(employeeBlocked.success, false, 'employee must not create organization OKR');
  assert.match(employeeBlocked.classification, /UNAUTHORIZED|ROLE|GOVERNANCE/i);

  const createdKeyResult = svc.createKeyResult({
    tenantSlug: 'tabsons',
    objectiveId: createdObjective.objective.objectiveId,
    title: 'Reach activation readiness',
    targetValue: 100,
    currentValue: 25,
    forecastedCompletion: 55,
    confidenceScore: 61,
    status: 'IN_PROGRESS'
  }, directorContext);
  assert.equal(createdKeyResult.success, true, 'authorized key result should be created');
  assert.equal(createdKeyResult.keyResult.status, 'IN_PROGRESS');
  assert.equal(createdKeyResult.governance.noTargetChangeByAI, true);
  assertImmutable(createdKeyResult, 'created key result output');

  const alignment = svc.calculateAlignmentScore(normalized, directorContext);
  assert.equal(alignment.success, true, 'alignment score should calculate');
  assert.ok(alignment.alignmentScore > 0);
  assert.ok(alignment.accountabilityScore > 0);
  assert.ok(alignment.crossTeamAlignmentScore >= 0);
  assertImmutable(alignment, 'alignment output');

  const execution = svc.calculateExecutionScore(normalized, directorContext);
  assert.equal(execution.success, true, 'execution score should calculate');
  assert.ok(execution.executionScore > 0);
  assert.ok(execution.strategicHealthScore > 0);
  assert.ok(execution.keyResultAchievementRate >= 0);
  assertImmutable(execution, 'execution output');

  const report = svc.generateOKRGovernanceReport(sampleOKRPayload(), directorContext);
  assert.equal(report.success, true, 'OKR governance report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.objectiveHierarchy.length >= 1);
  assert.ok(report.alignmentMap.length >= 1);
  assert.ok(report.progressIndicators.length >= 1);
  assert.ok(report.completionForecasts.length >= 1);
  assert.ok(report.dependencyWarnings.length >= 1);
  assert.ok(report.accountabilityVisibility.length >= 1);
  assert.ok(report.aiInsights.goalRiskIndicators.length >= 1);
  assert.ok(report.aiInsights.recommendedActions.length >= 1);
  assert.equal(report.governance.strategicGovernancePreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.noApprovalBypass, true);
  assert.equal(report.governance.noUnauthorizedGoalModification, true);
  assert.equal(report.governance.noAIObjectiveMutation, true);
  assert.equal(report.governance.noAIApproval, true);
  assert.equal(report.governance.noAITargetChange, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC tenant|abc/i, 'report must not leak confidential or cross-tenant OKR values');
  assertImmutable(report, 'OKR governance report output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.okrHistory || []).length >= 2, 'OKR history should persist immutably');
  assert.ok((dataAfter.okrProgressHistory || []).length >= 1, 'OKR progress history should persist immutably');
  assert.ok((dataAfter.okrStrategicReviews || []).length >= 1, 'strategic reviews should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /OKR|OBJECTIVE|KEY_RESULT/.test(log.actionType || log.eventType || '')), 'audit integration should record OKR actions');

  const blockedCrossTenant = svc.generateOKRGovernanceReport({ ...sampleOKRPayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant OKR report should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateOKRGovernanceReport(sampleOKRPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(managerScoped.success, true, 'manager OKR scope should generate');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_TEAM_OKR_VISIBILITY');
  assert.ok(managerScoped.objectives.every(row => row.department === 'HR' || row.level === 'individual'), 'manager scope should not leak other departments');

  const circular = svc.generateOKRGovernanceReport({
    tenantSlug: 'tabsons',
    objectives: [
      { tenantSlug: 'tabsons', objectiveId: 'A', title: 'A', level: 'department', ownerId: 'MGR-1', department: 'HR', parentObjectiveId: 'B', dependencies: ['B'] },
      { tenantSlug: 'tabsons', objectiveId: 'B', title: 'B', level: 'team', ownerId: 'MGR-1', department: 'HR', parentObjectiveId: 'A', dependencies: ['A'] }
    ],
    keyResults: []
  }, directorContext);
  assert.equal(circular.success, true, 'circular dependencies should not throw');
  assert.equal(circular.edgeCases.circularDependenciesDetected, true);
  assert.ok(circular.dependencyWarnings.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalRisk = global.AIRiskPredictionService;
  const originalRiskAlias = global.aiRiskPredictionService;
  const originalKpi = global.AIKPIForecastingService;
  const originalKpiAlias = global.aiKpiForecastingService;
  const originalPerformance = global.OrganizationPerformanceForecastingService;
  const originalPerformanceAlias = global.organizationPerformanceForecastingService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.AIRiskPredictionService;
  delete global.aiRiskPredictionService;
  delete global.AIKPIForecastingService;
  delete global.aiKpiForecastingService;
  delete global.OrganizationPerformanceForecastingService;
  delete global.organizationPerformanceForecastingService;
  const dependencyAbsent = svc.generateOKRGovernanceReport(sampleOKRPayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiKpiForecastingIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.organizationPerformanceForecastingIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.AIRiskPredictionService = originalRisk;
  global.aiRiskPredictionService = originalRiskAlias;
  global.AIKPIForecastingService = originalKpi;
  global.aiKpiForecastingService = originalKpiAlias;
  global.OrganizationPerformanceForecastingService = originalPerformance;
  global.organizationPerformanceForecastingService = originalPerformanceAlias;

  console.log('advancedOkrService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
