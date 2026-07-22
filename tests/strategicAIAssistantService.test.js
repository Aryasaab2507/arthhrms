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

function seedAssistantData() {
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
  data.assistantConversationHistory = [];
  data.assistantRecommendationHistory = [];
  data.assistantAnalyticsHistory = [];
  data.auditLogs = [];
  data.okrObjectives = [
    { tenantSlug: 'tabsons', objectiveId: 'OBJ-1', title: 'Improve execution velocity', department: 'Operations', status: 'AT_RISK', progressPercent: 54, ownerId: 'MGR-1' },
    { tenantSlug: 'abc', objectiveId: 'OBJ-X', title: 'ABC hidden OKR', department: 'Finance', salary: 999999 }
  ];
  data.kpiScorecards = [
    { tenantSlug: 'tabsons', kpiId: 'KPI-1', domain: 'kpi_achievement', department: 'Operations', kpiName: 'Strategic delivery', achievementProbability: 58, forecastConfidence: 73 },
    { tenantSlug: 'abc', kpiId: 'KPI-X', domain: 'payroll', salary: 999999, confidentialNote: 'ABC private KPI' }
  ];
  data.crossDepartmentDependencies = [
    { tenantSlug: 'tabsons', dependencyId: 'DEP-1', sourceDepartment: 'HR', targetDepartment: 'Operations', state: 'BLOCKED', delayDays: 7, bottleneckScore: 74 },
    { tenantSlug: 'abc', dependencyId: 'DEP-X', sourceDepartment: 'Finance', targetDepartment: 'HR', confidentialNote: 'ABC private dependency' }
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
    crossDepartmentDependencies: data.crossDepartmentDependencies
  });
}

function sampleAssistantPayload() {
  return {
    tenantSlug: 'tabsons',
    query: 'What are our top risks, which OKRs are at risk, and what bottlenecks exist?',
    mode: 'strategic_insights',
    knowledgeDomains: [
      'kpi_intelligence',
      'okr_intelligence',
      'dependency_intelligence',
      'escalation_intelligence',
      'executive_intelligence',
      'workforce_intelligence',
      'operational_intelligence',
      'governance_intelligence'
    ],
    kpiIntelligence: [
      { tenantSlug: 'tabsons', domain: 'kpi_intelligence', department: 'Operations', kpiName: 'Strategic delivery', achievementProbability: 58, forecastConfidence: 73, explanation: 'Strategic delivery KPI is forecasted below target.' },
      { tenantSlug: 'abc', domain: 'payroll', salary: 999999, confidentialNote: 'ABC private KPI' }
    ],
    okrIntelligence: [
      { tenantSlug: 'tabsons', domain: 'okr_intelligence', department: 'Operations', objectiveId: 'OBJ-1', title: 'Improve execution velocity', progressPercent: 54, status: 'AT_RISK' },
      { tenantSlug: 'abc', domain: 'okr_intelligence', title: 'ABC hidden OKR', salary: 999999 }
    ],
    dependencyIntelligence: [
      { tenantSlug: 'tabsons', domain: 'dependency_intelligence', department: 'Operations', dependencyId: 'DEP-1', state: 'BLOCKED', bottleneckScore: 74, explanation: 'HR to Operations handoff is blocked.' },
      { tenantSlug: 'abc', domain: 'dependency_intelligence', confidentialNote: 'ABC private dependency' }
    ],
    escalationIntelligence: [
      { tenantSlug: 'tabsons', domain: 'escalation_intelligence', department: 'Operations', escalationProbability: 72, urgencyScore: 76, explanation: 'Approval delay may require leadership attention.' }
    ],
    executiveIntelligence: [
      { tenantSlug: 'tabsons', domain: 'executive_intelligence', severity: 'HIGH', title: 'Execution risk needs review', reason: 'Risk, KPI, and dependency signals are converging.', confidenceScore: 78 }
    ],
    workforceIntelligence: [
      { tenantSlug: 'tabsons', domain: 'workforce_intelligence', department: 'HR', signal: 'Workforce capacity pressure', score: 68 }
    ],
    operationalIntelligence: [
      { tenantSlug: 'tabsons', domain: 'operational_intelligence', department: 'Operations', signal: 'Throughput declining', score: 62 }
    ],
    governanceIntelligence: [
      { tenantSlug: 'tabsons', domain: 'governance_intelligence', control: 'AI advisory only', status: 'ENFORCED' }
    ],
    analytics: {
      questionCategories: { risks: 4, okrs: 2, bottlenecks: 2 },
      assistantUsage: 6,
      recommendationUsage: 3,
      responseConfidence: 72,
      insightEffectiveness: 76,
      searchEffectiveness: 70
    },
    metadata: {
      source: 'assistant-test',
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
    'services/workflowSimulationService.js',
    'services/executiveDecisionIntelligenceService.js'
  ].forEach(load);
  seedAssistantData();

  let loadError = null;
  try {
    load('services/strategicAIAssistantService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.StrategicAIAssistantService;
  assert.ok(svc, 'StrategicAIAssistantService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.processAssistantQuery, 'function');
  assert.equal(typeof svc.buildContextualResponse, 'function');
  assert.equal(typeof svc.calculateResponseConfidence, 'function');
  assert.equal(typeof svc.explainAssistantResponse, 'function');
  assert.equal(typeof svc.normalizeAssistantPayload, 'function');
  assert.equal(typeof svc.freezeAssistantOutput, 'function');
  assert.equal(global.__ARTHHRMS_STRATEGIC_AI_ASSISTANT_SELF_TEST__.passed, true, 'development self-test should cover query, context, RBAC, explainability, and immutability');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };

  const malformed = svc.normalizeAssistantPayload({ tenantSlug: 'tabsons', query: '' }, directorContext);
  assert.equal(malformed.success, false, 'empty assistant query should fail safely');
  assertImmutable(malformed, 'malformed assistant output');

  const normalized = svc.normalizeAssistantPayload(sampleAssistantPayload(), directorContext);
  assert.equal(normalized.success, true, 'assistant payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.kpiIntelligence.length, 1, 'cross-tenant KPI intelligence should be filtered');
  assert.equal(normalized.okrIntelligence.length, 1, 'cross-tenant OKR intelligence should be filtered');
  assert.equal(normalized.dependencyIntelligence.length, 1, 'cross-tenant dependency intelligence should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|confidentialNote|rawPayload|ABC private|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized assistant output');

  const liveBefore = liveRecordSnapshot();
  const processed = svc.processAssistantQuery(sampleAssistantPayload(), directorContext);
  assert.equal(processed.success, true, 'assistant query should process');
  assert.ok(processed.answer.includes('Operations') || processed.answer.includes('risk') || processed.answer.includes('OKR'));
  assert.ok(processed.evidence.length >= 3, 'assistant response should include evidence');
  assert.ok(processed.recommendations.length >= 1, 'assistant should provide advisory recommendations');
  assert.ok(processed.reasoningSummary, 'assistant response should include reasoning summary');
  assert.ok(processed.confidenceScore >= 0, 'assistant should include confidence');
  assert.equal(processed.governance.aiAdvisoryOnly, true);
  assert.equal(processed.governance.noAutonomousActions, true);
  assert.equal(processed.governance.noWorkflowExecution, true);
  assert.equal(processed.governance.noRecordModification, true);
  assert.equal(processed.governance.tenantIsolationPreserved, true);
  assert.equal(liveRecordSnapshot(), liveBefore, 'assistant must not mutate business records');
  assert.doesNotMatch(JSON.stringify(processed), /999999|salary|rawPayload|ABC private|abc/i, 'assistant response must not leak sensitive or cross-tenant values');
  assertImmutable(processed, 'processed assistant response');

  const contextual = svc.buildContextualResponse(sampleAssistantPayload(), directorContext);
  assert.equal(contextual.success, true, 'contextual response should build');
  assert.equal(contextual.context.role, 'DIRECTOR');
  assert.equal(contextual.context.tenantSlug, 'tabsons');
  assert.ok(contextual.context.knowledgeCoverageScore >= 0);
  assert.ok(contextual.response.evidence.length >= 1);
  assertImmutable(contextual, 'contextual assistant response');

  const confidence = svc.calculateResponseConfidence(sampleAssistantPayload(), directorContext);
  assert.equal(confidence.success, true, 'response confidence should calculate');
  assert.ok(confidence.assistantAdoptionScore >= 0);
  assert.ok(confidence.knowledgeCoverageScore >= 0);
  assert.ok(confidence.responseEffectivenessScore >= 0);
  assertImmutable(confidence, 'assistant confidence output');

  const explained = svc.explainAssistantResponse({
    answer: 'Operations has elevated delivery risk.',
    evidence: ['KPI achievement probability 58%', 'Dependency DEP-1 blocked'],
    recommendations: ['Review blocked HR to Operations handoff'],
    confidenceScore: 74
  }, directorContext);
  assert.equal(explained.success, true, 'assistant explainability should work');
  assert.ok(explained.explanation.reasoningSummary);
  assert.ok(explained.explanation.evidence.length >= 2);
  assert.ok(explained.explanation.confidenceScore >= 0);
  assert.notEqual(explained.explanation.reasoningSummary, 'AI says so');
  assertImmutable(explained, 'assistant explanation output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.assistantConversationHistory || []).length >= 1, 'conversation history should persist immutably');
  assert.ok((dataAfter.assistantRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.assistantAnalyticsHistory || []).length >= 1, 'analytics history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /ASSISTANT|QUESTION|INTELLIGENCE/.test(log.actionType || log.eventType || '')), 'audit integration should record assistant interactions');

  const crossTenant = svc.processAssistantQuery({ ...sampleAssistantPayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(crossTenant.success, false, 'cross-tenant assistant query should be blocked');
  assert.match(crossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.processAssistantQuery(sampleAssistantPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'Operations' }
  });
  assert.equal(managerScoped.success, true, 'manager assistant scope should generate department response');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_ASSISTANT_VISIBILITY');
  assert.ok(managerScoped.context.department === 'Operations');
  assert.doesNotMatch(JSON.stringify(managerScoped), /HR workforce capacity/i, 'manager scope should not expose unrelated department-only workforce signals');

  const platformBlocked = svc.processAssistantQuery(sampleAssistantPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons', department: 'Platform' }
  });
  assert.equal(platformBlocked.success, false, 'PLATFORM_OWNER has governance visibility only, not tenant assistant execution');

  const sparse = svc.processAssistantQuery({ tenantSlug: 'tabsons', query: 'What should I know?', knowledgeDomains: ['governance_intelligence'] }, directorContext);
  assert.equal(sparse.success, true, 'sparse assistant data should not throw');
  assert.equal(sparse.edgeCases.sparseDatasetsDetected, true);
  assert.ok(sparse.assistantWarnings.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalExecutive = global.ExecutiveDecisionIntelligenceService;
  const originalExecutiveAlias = global.executiveDecisionIntelligenceService;
  const originalRisk = global.AIRiskPredictionService;
  const originalRiskAlias = global.aiRiskPredictionService;
  const originalKpi = global.AIKPIForecastingService;
  const originalKpiAlias = global.aiKpiForecastingService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.ExecutiveDecisionIntelligenceService;
  delete global.executiveDecisionIntelligenceService;
  delete global.AIRiskPredictionService;
  delete global.aiRiskPredictionService;
  delete global.AIKPIForecastingService;
  delete global.aiKpiForecastingService;
  const dependencyAbsent = svc.processAssistantQuery(sampleAssistantPayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.executiveIntelligenceIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiKpiForecastingIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.ExecutiveDecisionIntelligenceService = originalExecutive;
  global.executiveDecisionIntelligenceService = originalExecutiveAlias;
  global.AIRiskPredictionService = originalRisk;
  global.aiRiskPredictionService = originalRiskAlias;
  global.AIKPIForecastingService = originalKpi;
  global.aiKpiForecastingService = originalKpiAlias;

  console.log('strategicAIAssistantService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
