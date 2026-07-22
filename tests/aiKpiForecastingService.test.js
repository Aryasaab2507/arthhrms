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

function seedForecastData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.aiKpiForecastHistory = [];
  data.aiKpiForecastAnalytics = [];
  data.aiKpiRecommendationHistory = [];
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

function sampleForecastPayload() {
  return {
    tenantSlug: 'tabsons',
    forecastHorizons: ['weekly', 'monthly', 'quarterly', 'annual'],
    kpiDomains: [
      'attendance_kpis',
      'leave_kpis',
      'hr_kpis',
      'operational_kpis',
      'strategic_kpis',
      'department_kpis',
      'project_kpis',
      'workforce_kpis'
    ],
    kpis: [
      {
        tenantSlug: 'tabsons',
        kpiId: 'KPI-ATT-1',
        domain: 'attendance_kpis',
        department: 'Operations',
        name: 'Attendance compliance',
        target: 95,
        currentValue: 89,
        historicalValues: [82, 84, 86, 88, 89],
        period: 'monthly',
        direction: 'UP'
      },
      {
        tenantSlug: 'tabsons',
        kpiId: 'KPI-LEAVE-1',
        domain: 'leave_kpis',
        department: 'HR',
        name: 'Leave SLA',
        target: 92,
        currentValue: 78,
        historicalValues: [90, 87, 84, 80, 78],
        period: 'monthly',
        direction: 'DOWN'
      },
      {
        tenantSlug: 'tabsons',
        kpiId: 'KPI-STRAT-1',
        domain: 'strategic_kpis',
        department: 'Leadership',
        name: 'Strategic completion',
        target: 85,
        currentValue: 67,
        historicalValues: [55, 60, 62, 64, 67],
        period: 'quarterly',
        direction: 'UP',
        executionVelocity: 62
      },
      {
        tenantSlug: 'abc',
        kpiId: 'ABC-KPI',
        domain: 'payroll_kpis',
        department: 'Finance',
        target: 999,
        currentValue: 1,
        salary: 999999,
        leaveBalance: 44,
        historicalValues: [1, 1],
        evidence: 'ABC tenant must be ignored'
      }
    ],
    goals: [
      { tenantSlug: 'tabsons', goalId: 'G-1', department: 'Leadership', targetCompletion: 85, currentCompletion: 66, velocity: 62, state: 'ACTIVE' }
    ],
    executionSignals: [
      { tenantSlug: 'tabsons', department: 'Product', velocity: 58, delayedMilestones: 3, completionRate: 66 }
    ],
    analytics: {
      forecastAccuracy: 82,
      targetAchievementRate: 64,
      forecastDeviation: 12,
      departmentForecastTrend: 18,
      strategicForecastTrend: 22
    },
    metadata: {
      source: 'kpi-forecast-test',
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
    'services/performanceGovernanceService.js',
    'services/aiRiskPredictionService.js'
  ].forEach(load);
  seedForecastData();

  let loadError = null;
  try {
    load('services/aiKpiForecastingService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.AIKPIForecastingService;
  assert.ok(svc, 'AIKPIForecastingService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generateKPIForecast, 'function');
  assert.equal(typeof svc.calculateForecastConfidence, 'function');
  assert.equal(typeof svc.explainForecast, 'function');
  assert.equal(typeof svc.normalizeForecastPayload, 'function');
  assert.equal(typeof svc.freezeForecastOutput, 'function');
  assert.equal(global.__ARTHHRMS_AI_KPI_FORECASTING_SELF_TEST__.passed, true, 'development self-test should cover forecasting, confidence scoring, explainability, tenant isolation, and immutability');

  const malformed = svc.normalizeForecastPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed forecast output');

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };
  const normalized = svc.normalizeForecastPayload(sampleForecastPayload(), context);
  assert.equal(normalized.success, true, 'forecast payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.forecastHorizons.length, 4);
  assert.equal(normalized.kpiDomains.length, 8);
  assert.equal(normalized.kpis.length, 3, 'cross-tenant KPI history should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC tenant|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized forecast output');

  const confidence = svc.calculateForecastConfidence(normalized, context);
  assert.equal(confidence.success, true, 'forecast confidence should calculate');
  assert.ok(confidence.forecastConfidence > 0);
  assert.ok(confidence.trendConfidence > 0);
  assert.ok(confidence.achievementProbability >= 0);
  assert.ok(confidence.volatilityScore >= 0);
  assert.match(confidence.confidenceLevel, /LOW|MODERATE|HIGH/);
  assertImmutable(confidence, 'confidence output');

  const explanation = svc.explainForecast({
    domain: 'strategic_kpis',
    kpiName: 'Strategic completion',
    forecastConfidence: 78,
    achievementProbability: 64,
    projectedValue: 75,
    target: 85,
    forecastDrivers: ['completion velocity improved', 'target gap remains open'],
    assumptions: ['historic strategic execution values remain comparable'],
    trendAnalysis: 'Upward trend is present, but current velocity does not fully close the target gap.'
  }, context);
  assert.equal(explanation.success, true, 'forecast explanation should generate');
  assert.ok(explanation.explanation.length > 20);
  assert.ok(explanation.forecastDrivers.length >= 2);
  assert.ok(explanation.assumptions.length >= 1);
  assert.ok(explanation.trendAnalysis.length > 20);
  assert.doesNotMatch(JSON.stringify(explanation), /AI predicts this/i);
  assertImmutable(explanation, 'explanation output');

  const report = svc.generateKPIForecast(sampleForecastPayload(), context);
  assert.equal(report.success, true, 'KPI forecast report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.forecasts.length >= 3, 'multiple KPI domains should produce forecasts');
  assert.ok(report.projectedOutcomes.length >= 3);
  assert.ok(report.likelyOutcomes.length >= 3);
  assert.ok(report.riskAdjustedForecasts.length >= 3);
  assert.ok(report.targetAchievementForecasts.length >= 3);
  assert.ok(report.recommendedActions.length >= 1);
  assert.equal(report.governance.aiGovernancePreserved, true);
  assert.equal(report.governance.noAutonomousActions, true);
  assert.equal(report.governance.noKpiTargetMutation, true);
  assert.equal(report.governance.noPerformanceRecordMutation, true);
  assert.equal(report.governance.noStrategicGoalMutation, true);
  assert.equal(report.governance.noPermissionChanges, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.humanApprovalRequired, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.ok(report.forecasts.every(row => row.explanation && row.forecastDrivers.length && row.assumptions.length && row.trendAnalysis && row.confidenceLevel));
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC tenant|abc/i, 'report must not leak confidential or cross-tenant KPI history');
  assertImmutable(report, 'forecast report output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.aiKpiForecastHistory || []).length >= 1, 'forecast history should persist immutably');
  assert.ok((dataAfter.aiKpiForecastAnalytics || []).length >= 1, 'forecast analytics should persist immutably');
  assert.ok((dataAfter.aiKpiRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /AI_KPI|KPI_FORECAST/.test(log.actionType || log.eventType || '')), 'audit integration should record AI KPI forecast access');

  const blockedCrossTenant = svc.generateKPIForecast({ ...sampleForecastPayload(), tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant forecasting should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateKPIForecast(sampleForecastPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(managerScoped.success, true, 'manager-scoped forecast should safely return department scope');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_KPI_FORECAST_VISIBILITY');
  assert.ok(managerScoped.forecasts.every(row => row.department === 'HR' || row.domain === 'workforce_kpis'));

  const insufficient = svc.generateKPIForecast({ tenantSlug: 'tabsons', kpiDomains: ['attendance_kpis'] }, context);
  assert.equal(insufficient.success, true, 'sparse KPI datasets should not throw');
  assert.equal(insufficient.dataQuality.insufficientKpiHistory, true);
  assert.ok(insufficient.forecasts.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateKPIForecast(sampleForecastPayload(), {
    ...context,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('aiKpiForecastingService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
