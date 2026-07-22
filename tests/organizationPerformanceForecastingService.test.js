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

function seedPerformanceForecastData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.organizationPerformanceForecastHistory = [];
  data.organizationPerformanceForecastAnalytics = [];
  data.organizationPerformanceRecommendationHistory = [];
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

function samplePerformancePayload() {
  return {
    tenantSlug: 'tabsons',
    performanceDomains: [
      'organization_performance',
      'department_performance',
      'workforce_productivity',
      'strategic_execution',
      'deliverable_completion',
      'operational_efficiency',
      'governance_compliance',
      'leadership_accountability'
    ],
    kpiTrends: [
      { tenantSlug: 'tabsons', domain: 'organization_performance', department: 'Leadership', metricName: 'Org KPI health', currentValue: 76, target: 88, historicalValues: [66, 70, 73, 76], velocity: 64 },
      { tenantSlug: 'tabsons', domain: 'department_performance', department: 'HR', metricName: 'HR service quality', currentValue: 81, target: 90, historicalValues: [72, 76, 79, 81], velocity: 70 },
      { tenantSlug: 'abc', domain: 'payroll', department: 'Finance', salary: 999999, leaveBalance: 44, currentValue: 1, historicalValues: [1, 1], evidence: 'ABC tenant must be ignored' }
    ],
    completionVelocity: [
      { tenantSlug: 'tabsons', domain: 'strategic_execution', department: 'Leadership', velocity: 62, completionRate: 68, delayedCount: 3 },
      { tenantSlug: 'tabsons', domain: 'deliverable_completion', department: 'Product', velocity: 58, completionRate: 64, delayedCount: 4 }
    ],
    productivityPatterns: [
      { tenantSlug: 'tabsons', department: 'Operations', productivityScore: 73, engagementScore: 66, workloadPressure: 58 },
      { tenantSlug: 'tabsons', department: 'HR', productivityScore: 78, engagementScore: 70, workloadPressure: 42 }
    ],
    workforceEngagement: [
      { tenantSlug: 'tabsons', department: 'Operations', engagementScore: 68, absenteeismRisk: 18 },
      { tenantSlug: 'tabsons', department: 'HR', engagementScore: 72, absenteeismRisk: 12 }
    ],
    operationalBottlenecks: [
      { tenantSlug: 'tabsons', domain: 'operational_efficiency', department: 'Operations', severity: 'HIGH', delayDays: 6, blockageCount: 3 },
      { tenantSlug: 'tabsons', domain: 'governance_compliance', department: 'Compliance', severity: 'MODERATE', delayDays: 3, blockageCount: 1 }
    ],
    escalationHistory: [
      { tenantSlug: 'tabsons', domain: 'leadership_accountability', department: 'Leadership', severity: 'HIGH', ageHours: 42, resolved: false }
    ],
    strategicExecution: [
      { tenantSlug: 'tabsons', department: 'Leadership', status: 'AT_RISK', completionRate: 66, velocity: 60, delayedMilestones: 3 }
    ],
    departmentHistory: [
      { tenantSlug: 'tabsons', department: 'HR', performanceScore: 80, trend: 8 },
      { tenantSlug: 'tabsons', department: 'Operations', performanceScore: 72, trend: -5 }
    ],
    analytics: {
      forecastAccuracy: 82,
      achievementRate: 67,
      productivityTrend: 14,
      departmentTrend: 10,
      strategicExecutionTrend: 18,
      workforceTrend: 12,
      operationalEfficiencyTrend: 9
    },
    metadata: {
      source: 'org-performance-test',
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
    'services/performanceGovernanceService.js',
    'services/departmentExecutionBoardService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js'
  ].forEach(load);
  seedPerformanceForecastData();

  let loadError = null;
  try {
    load('services/organizationPerformanceForecastingService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.OrganizationPerformanceForecastingService;
  assert.ok(svc, 'OrganizationPerformanceForecastingService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generatePerformanceForecast, 'function');
  assert.equal(typeof svc.calculatePerformanceScore, 'function');
  assert.equal(typeof svc.explainPerformanceForecast, 'function');
  assert.equal(typeof svc.normalizePerformancePayload, 'function');
  assert.equal(typeof svc.freezePerformanceOutput, 'function');
  assert.equal(global.__ARTHHRMS_ORGANIZATION_PERFORMANCE_FORECASTING_SELF_TEST__.passed, true, 'development self-test should cover forecasting, confidence scoring, explainability, tenant isolation, and immutability');

  const malformed = svc.normalizePerformancePayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed performance forecast output');

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };
  const normalized = svc.normalizePerformancePayload(samplePerformancePayload(), context);
  assert.equal(normalized.success, true, 'performance payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.performanceDomains.length, 8);
  assert.equal(normalized.kpiTrends.length, 2, 'cross-tenant KPI and performance history should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC tenant|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized performance output');

  const score = svc.calculatePerformanceScore(normalized, context);
  assert.equal(score.success, true, 'performance score should calculate');
  assert.ok(score.performanceScore > 0);
  assert.ok(score.confidenceScore > 0);
  assert.ok(score.momentumScore >= 0);
  assert.ok(score.stabilityScore >= 0);
  assert.ok(score.achievementProbability >= 0);
  assert.match(score.performanceLevel, /EXCEEDING_EXPECTATIONS|ON_TRACK|AT_RISK|CRITICAL/);
  assertImmutable(score, 'performance score output');

  const explanation = svc.explainPerformanceForecast({
    domain: 'strategic_execution',
    department: 'Leadership',
    performanceLevel: 'AT_RISK',
    performanceScore: 67,
    achievementProbability: 61,
    contributingFactors: ['completion velocity trails target', 'strategic execution history contains delayed milestones'],
    assumptions: ['tenant-scoped historical execution signals remain comparable'],
    recommendedActions: ['Ask a human leader to review milestone blockers before changing goals']
  }, context);
  assert.equal(explanation.success, true, 'performance explanation should generate');
  assert.ok(explanation.explanation.length > 20);
  assert.ok(explanation.contributingFactors.length >= 2);
  assert.ok(explanation.assumptions.length >= 1);
  assert.ok(explanation.recommendedActions.length >= 1);
  assert.doesNotMatch(JSON.stringify(explanation), /AI predicts poor performance/i);
  assertImmutable(explanation, 'explanation output');

  const report = svc.generatePerformanceForecast(samplePerformancePayload(), context);
  assert.equal(report.success, true, 'organization performance forecast report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.forecasts.length >= 5, 'multiple organization performance domains should produce forecasts');
  assert.ok(report.projectedOutcomes.length >= 1);
  assert.ok(report.achievementForecasts.length >= 1);
  assert.ok(report.performanceWarnings.length >= 1);
  assert.ok(report.opportunityForecasts.length >= 1);
  assert.ok(report.recommendedActions.length >= 1);
  assert.equal(report.governance.aiGovernancePreserved, true);
  assert.equal(report.governance.noAutonomousActions, true);
  assert.equal(report.governance.noKpiMutation, true);
  assert.equal(report.governance.noGoalMutation, true);
  assert.equal(report.governance.noEmployeeRecordMutation, true);
  assert.equal(report.governance.noWorkflowMutation, true);
  assert.equal(report.governance.noPermissionChanges, true);
  assert.equal(report.governance.noGovernanceModification, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.humanApprovalRequired, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.ok(report.forecasts.every(row => row.explanation && row.contributingFactors.length && row.assumptions.length && row.recommendedActions.length && row.confidenceLevel));
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC tenant|abc/i, 'report must not leak confidential or cross-tenant performance history');
  assertImmutable(report, 'organization performance forecast output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.organizationPerformanceForecastHistory || []).length >= 1, 'forecast history should persist immutably');
  assert.ok((dataAfter.organizationPerformanceForecastAnalytics || []).length >= 1, 'performance analytics should persist immutably');
  assert.ok((dataAfter.organizationPerformanceRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /ORG_PERFORMANCE|PERFORMANCE_FORECAST/.test(log.actionType || log.eventType || '')), 'audit integration should record organization performance forecasting access');

  const blockedCrossTenant = svc.generatePerformanceForecast({ ...samplePerformancePayload(), tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant performance forecasting should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generatePerformanceForecast(samplePerformancePayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(managerScoped.success, true, 'manager-scoped forecast should safely return department scope');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_PERFORMANCE_FORECAST_VISIBILITY');
  assert.ok(managerScoped.forecasts.every(row => row.department === 'HR' || row.domain === 'workforce_productivity'));

  const insufficient = svc.generatePerformanceForecast({ tenantSlug: 'tabsons', performanceDomains: ['organization_performance'] }, context);
  assert.equal(insufficient.success, true, 'sparse performance datasets should not throw');
  assert.equal(insufficient.dataQuality.insufficientHistoricalData, true);
  assert.ok(insufficient.forecasts.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generatePerformanceForecast(samplePerformancePayload(), {
    ...context,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('organizationPerformanceForecastingService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
