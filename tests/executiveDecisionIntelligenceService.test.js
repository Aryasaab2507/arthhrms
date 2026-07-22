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

function seedExecutiveData() {
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
  data.executiveInsightHistory = [];
  data.executiveBriefingHistory = [];
  data.executiveRecommendationHistory = [];
  data.executiveAnalyticsHistory = [];
  data.auditLogs = [];
  data.okrObjectives = [
    { tenantSlug: 'tabsons', objectiveId: 'OBJ-1', title: 'Improve execution velocity', level: 'department', department: 'Operations', status: 'ACTIVE', progressPercent: 62, ownerId: 'MGR-1' },
    { tenantSlug: 'abc', objectiveId: 'OBJ-X', title: 'ABC hidden OKR', department: 'Finance', salary: 999999 }
  ];
  data.kpiScorecards = [
    { tenantSlug: 'tabsons', kpiId: 'KPI-1', domain: 'strategic_kpi', department: 'Operations', achievementProbability: 61, forecastConfidence: 70 },
    { tenantSlug: 'abc', kpiId: 'KPI-X', domain: 'payroll', salary: 999999, confidentialNote: 'ABC private KPI' }
  ];
  data.crossDepartmentDependencies = [
    { tenantSlug: 'tabsons', dependencyId: 'DEP-1', sourceDepartment: 'HR', targetDepartment: 'Operations', state: 'BLOCKED', delayDays: 6 },
    { tenantSlug: 'abc', dependencyId: 'DEP-X', sourceDepartment: 'Finance', targetDepartment: 'HR', confidentialNote: 'ABC private dependency' }
  ];
  data.workflowSimulationHistory = [
    { tenantSlug: 'tabsons', simulationId: 'SIM-1', state: 'CONFIGURED', domains: ['approval', 'dependency_chain'] },
    { tenantSlug: 'abc', simulationId: 'SIM-X', state: 'CONFIGURED', confidentialNote: 'ABC private simulation' }
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
    okrObjectives: data.okrObjectives,
    kpiScorecards: data.kpiScorecards,
    crossDepartmentDependencies: data.crossDepartmentDependencies,
    workflowSimulationHistory: data.workflowSimulationHistory
  });
}

function sampleExecutivePayload() {
  return {
    tenantSlug: 'tabsons',
    briefingCadence: 'weekly',
    intelligenceDomains: [
      'organizational_performance',
      'workforce_health',
      'strategic_execution',
      'department_performance',
      'risk_exposure',
      'kpi_achievement',
      'dependency_health',
      'operational_efficiency'
    ],
    kpiForecasts: [
      { tenantSlug: 'tabsons', domain: 'kpi_achievement', department: 'Operations', achievementProbability: 61, forecastConfidence: 70, explanation: 'Operations KPI is below the quarterly target path.' },
      { tenantSlug: 'abc', domain: 'payroll', achievementProbability: 1, salary: 999999, confidentialNote: 'ABC private KPI' }
    ],
    riskPredictions: [
      { tenantSlug: 'tabsons', domain: 'risk_exposure', riskLevel: 'HIGH', riskScore: 78, confidenceScore: 74, explanation: 'Approval delay and dependency blockage are converging.' },
      { tenantSlug: 'abc', domain: 'risk_exposure', riskLevel: 'CRITICAL', confidentialNote: 'ABC private risk' }
    ],
    escalationPredictions: [
      { tenantSlug: 'tabsons', domain: 'strategic_execution', escalationLevel: 'HIGH', escalationProbability: 71, urgencyScore: 76, explanation: 'Blocked dependency chain may require leadership attention.' }
    ],
    okrProgress: [
      { tenantSlug: 'tabsons', objectiveId: 'OBJ-1', domain: 'strategic_execution', department: 'Operations', progressPercent: 62, status: 'ACTIVE', title: 'Improve execution velocity' },
      { tenantSlug: 'abc', objectiveId: 'OBJ-X', domain: 'strategic_execution', salary: 999999 }
    ],
    dependencyIntelligence: [
      { tenantSlug: 'tabsons', domain: 'dependency_health', department: 'Operations', dependencyHealthScore: 58, bottleneckScore: 68, explanation: 'HR to Operations handoff is blocked.' },
      { tenantSlug: 'abc', domain: 'dependency_health', confidentialNote: 'ABC private dependency' }
    ],
    workflowSimulations: [
      { tenantSlug: 'tabsons', domain: 'operational_efficiency', scenarioType: 'expected', impactScore: 46, executionScore: 63, projectedOutcome: 'Moderate execution impact expected.' },
      { tenantSlug: 'abc', domain: 'operational_efficiency', salary: 999999 }
    ],
    organizationalTrends: [
      { tenantSlug: 'tabsons', domain: 'organizational_performance', trendScore: 66, momentumScore: 61, department: 'Organization' },
      { tenantSlug: 'tabsons', domain: 'workforce_health', trendScore: 72, momentumScore: 68, department: 'HR' }
    ],
    departmentPerformance: [
      { tenantSlug: 'tabsons', domain: 'department_performance', department: 'Operations', performanceScore: 64, confidenceScore: 72 },
      { tenantSlug: 'tabsons', domain: 'department_performance', department: 'HR', performanceScore: 74, confidenceScore: 75 }
    ],
    analytics: {
      recommendationUsage: 4,
      executiveEngagement: 71,
      recommendationAccuracy: 76,
      insightEffectiveness: 73,
      strategicHealthTrend: 62
    },
    metadata: {
      source: 'executive-decision-test',
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
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js',
    'services/organizationPerformanceForecastingService.js',
    'services/advancedOkrService.js',
    'services/crossDepartmentDependencyService.js',
    'services/workflowSimulationService.js'
  ].forEach(load);
  seedExecutiveData();

  let loadError = null;
  try {
    load('services/executiveDecisionIntelligenceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.ExecutiveDecisionIntelligenceService;
  assert.ok(svc, 'ExecutiveDecisionIntelligenceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generateExecutiveInsights, 'function');
  assert.equal(typeof svc.buildExecutiveBriefing, 'function');
  assert.equal(typeof svc.calculateStrategicReadiness, 'function');
  assert.equal(typeof svc.explainRecommendation, 'function');
  assert.equal(typeof svc.normalizeExecutivePayload, 'function');
  assert.equal(typeof svc.freezeExecutiveOutput, 'function');
  assert.equal(typeof svc.generateExecutiveDecisionReport, 'function');
  assert.equal(global.__ARTHHRMS_EXECUTIVE_DECISION_SELF_TEST__.passed, true, 'development self-test should cover insights, briefings, recommendations, explainability, and immutability');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };

  const malformed = svc.normalizeExecutivePayload('bad payload', directorContext);
  assert.equal(malformed.success, false, 'malformed executive payload should fail safely');
  assertImmutable(malformed, 'malformed executive output');

  const normalized = svc.normalizeExecutivePayload(sampleExecutivePayload(), directorContext);
  assert.equal(normalized.success, true, 'executive payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.kpiForecasts.length, 1, 'cross-tenant KPI forecasts should be filtered');
  assert.equal(normalized.riskPredictions.length, 1, 'cross-tenant risks should be filtered');
  assert.equal(normalized.okrProgress.length, 1, 'cross-tenant OKRs should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|confidentialNote|rawPayload|ABC private|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized executive output');

  const liveBefore = liveRecordSnapshot();
  const insights = svc.generateExecutiveInsights(sampleExecutivePayload(), directorContext);
  assert.equal(insights.success, true, 'executive insights should generate');
  assert.ok(insights.insights.length >= 4);
  assert.ok(insights.opportunities.length >= 1);
  assert.ok(insights.warnings.length >= 1);
  assert.ok(insights.recommendations.length >= 1);
  assert.equal(insights.governance.aiAdvisoryOnly, true);
  assert.equal(insights.governance.noAutonomousDecisions, true);
  assert.equal(liveRecordSnapshot(), liveBefore, 'executive insights must not mutate business records');
  assertImmutable(insights, 'executive insights output');

  const briefing = svc.buildExecutiveBriefing(sampleExecutivePayload(), directorContext);
  assert.equal(briefing.success, true, 'executive briefing should generate');
  assert.equal(briefing.briefings.daily.period, 'daily');
  assert.equal(briefing.briefings.weekly.period, 'weekly');
  assert.equal(briefing.briefings.monthly.period, 'monthly');
  assert.equal(briefing.briefings.quarterly.period, 'quarterly');
  assert.ok(briefing.briefings.weekly.topRisks.length >= 1);
  assert.ok(briefing.briefings.weekly.topOpportunities.length >= 1);
  assert.ok(briefing.briefings.weekly.executiveSummary);
  assertImmutable(briefing, 'executive briefing output');

  const readiness = svc.calculateStrategicReadiness(sampleExecutivePayload(), directorContext);
  assert.equal(readiness.success, true, 'strategic readiness should calculate');
  assert.ok(readiness.executiveIntelligenceScore >= 0);
  assert.ok(readiness.leadershipEffectivenessScore >= 0);
  assert.ok(readiness.strategicReadinessScore >= 0);
  assertImmutable(readiness, 'strategic readiness output');

  const explained = svc.explainRecommendation({
    domain: 'dependency_health',
    severity: 'HIGH',
    reason: 'Dependency handoff is blocked',
    evidence: ['dependency health 58%', 'bottleneck score 68%'],
    contributingFactors: ['blocked HR to Operations chain'],
    confidenceScore: 74,
    expectedImpact: 'Reduce execution delay risk'
  }, directorContext);
  assert.equal(explained.success, true, 'recommendation explainability should work');
  assert.ok(explained.recommendation.reason);
  assert.ok(explained.recommendation.supportingEvidence.length >= 1);
  assert.ok(explained.recommendation.contributingFactors.length >= 1);
  assert.ok(explained.recommendation.expectedImpact);
  assert.notEqual(explained.recommendation.reason, 'AI recommends this');
  assertImmutable(explained, 'explain recommendation output');

  const report = svc.generateExecutiveDecisionReport(sampleExecutivePayload(), directorContext);
  assert.equal(report.success, true, 'executive decision report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.decisionSummaries.length >= 1);
  assert.ok(report.executiveBriefings.weekly.topRisks.length >= 1);
  assert.ok(report.strategicRecommendations.length >= 1);
  assert.ok(report.expectedOutcomes.length >= 1);
  assert.ok(report.impactForecasts.length >= 1);
  assert.ok(report.intelligenceTimeline.length >= 1);
  assert.equal(report.governance.noAutonomousDecisions, true);
  assert.equal(report.governance.noBusinessRecordModification, true);
  assert.equal(report.governance.noGoalMutation, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|rawPayload|ABC private|abc/i, 'report must not leak confidential or cross-tenant executive values');
  assertImmutable(report, 'executive decision report');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.executiveInsightHistory || []).length >= 1, 'insight history should persist immutably');
  assert.ok((dataAfter.executiveBriefingHistory || []).length >= 1, 'briefing history should persist immutably');
  assert.ok((dataAfter.executiveRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.executiveAnalyticsHistory || []).length >= 1, 'analytics history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /EXECUTIVE|INTELLIGENCE|BRIEFING/.test(log.actionType || log.eventType || '')), 'audit integration should record executive actions');

  const crossTenant = svc.generateExecutiveDecisionReport({ ...sampleExecutivePayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(crossTenant.success, false, 'cross-tenant executive report should be blocked');
  assert.match(crossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateExecutiveDecisionReport(sampleExecutivePayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'Operations' }
  });
  assert.equal(managerScoped.success, true, 'manager executive scope should generate department intelligence');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_INTELLIGENCE_VISIBILITY');
  assert.ok(managerScoped.departmentPerformance.every(row => row.department === 'Operations'), 'manager scope should not leak unrelated department performance');

  const platformBlocked = svc.generateExecutiveDecisionReport(sampleExecutivePayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons', department: 'Platform' }
  });
  assert.equal(platformBlocked.success, false, 'PLATFORM_OWNER has governance visibility only, not tenant executive intelligence execution');

  const sparse = svc.generateExecutiveDecisionReport({ tenantSlug: 'tabsons', intelligenceDomains: ['risk_exposure'] }, directorContext);
  assert.equal(sparse.success, true, 'sparse executive data should not throw');
  assert.equal(sparse.edgeCases.sparseDatasetsDetected, true);
  assert.ok(sparse.executiveWarnings.length >= 1);

  const conflicting = svc.generateExecutiveDecisionReport({
    ...sampleExecutivePayload(),
    recommendations: [
      { tenantSlug: 'tabsons', domain: 'kpi_achievement', action: 'Increase KPI target', severity: 'HIGH' },
      { tenantSlug: 'tabsons', domain: 'kpi_achievement', action: 'Reduce KPI target', severity: 'HIGH' }
    ]
  }, directorContext);
  assert.equal(conflicting.success, true, 'conflicting recommendations should not throw');
  assert.equal(conflicting.edgeCases.conflictingRecommendationsDetected, true);
  assert.ok(conflicting.executiveWarnings.some(row => /CONFLICT/.test(row.warningCode || '')));

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalRisk = global.AIRiskPredictionService;
  const originalRiskAlias = global.aiRiskPredictionService;
  const originalKpi = global.AIKPIForecastingService;
  const originalKpiAlias = global.aiKpiForecastingService;
  const originalEsc = global.SmartEscalationPredictionService;
  const originalEscAlias = global.smartEscalationPredictionService;
  const originalPerf = global.OrganizationPerformanceForecastingService;
  const originalPerfAlias = global.organizationPerformanceForecastingService;
  const originalOkr = global.AdvancedOKRService;
  const originalOkrAlias = global.advancedOkrService;
  const originalDependency = global.CrossDepartmentDependencyService;
  const originalDependencyAlias = global.crossDepartmentDependencyService;
  const originalSimulation = global.WorkflowSimulationService;
  const originalSimulationAlias = global.workflowSimulationService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.AIRiskPredictionService;
  delete global.aiRiskPredictionService;
  delete global.AIKPIForecastingService;
  delete global.aiKpiForecastingService;
  delete global.SmartEscalationPredictionService;
  delete global.smartEscalationPredictionService;
  delete global.OrganizationPerformanceForecastingService;
  delete global.organizationPerformanceForecastingService;
  delete global.AdvancedOKRService;
  delete global.advancedOkrService;
  delete global.CrossDepartmentDependencyService;
  delete global.crossDepartmentDependencyService;
  delete global.WorkflowSimulationService;
  delete global.workflowSimulationService;
  const dependencyAbsent = svc.generateExecutiveDecisionReport(sampleExecutivePayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiKpiForecastingIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.smartEscalationPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.organizationPerformanceForecastingIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.advancedOkrIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.dependencyIntelligenceIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.workflowSimulationIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.AIRiskPredictionService = originalRisk;
  global.aiRiskPredictionService = originalRiskAlias;
  global.AIKPIForecastingService = originalKpi;
  global.aiKpiForecastingService = originalKpiAlias;
  global.SmartEscalationPredictionService = originalEsc;
  global.smartEscalationPredictionService = originalEscAlias;
  global.OrganizationPerformanceForecastingService = originalPerf;
  global.organizationPerformanceForecastingService = originalPerfAlias;
  global.AdvancedOKRService = originalOkr;
  global.advancedOkrService = originalOkrAlias;
  global.CrossDepartmentDependencyService = originalDependency;
  global.crossDepartmentDependencyService = originalDependencyAlias;
  global.WorkflowSimulationService = originalSimulation;
  global.workflowSimulationService = originalSimulationAlias;

  console.log('executiveDecisionIntelligenceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
