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

function seedRiskData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.aiRiskPredictionHistory = [];
  data.aiRiskPredictionAnalytics = [];
  data.aiRiskRecommendationHistory = [];
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

function sampleRiskPayload() {
  return {
    tenantSlug: 'tabsons',
    riskDomains: [
      'leave_management',
      'attendance_compliance',
      'employee_lifecycle',
      'approval_bottlenecks',
      'strategic_initiatives',
      'project_execution',
      'operational_governance',
      'escalation_workflows'
    ],
    historicalActivity: [
      { tenantSlug: 'tabsons', domain: 'leave_management', department: 'HR', status: 'delayed', ageHours: 72, severity: 'high', evidence: 'Leave approval queue older than SLA' },
      { tenantSlug: 'tabsons', domain: 'attendance_compliance', department: 'Operations', status: 'warning', ageHours: 30, severity: 'moderate', evidence: 'Repeated late regularization' },
      { tenantSlug: 'abc', domain: 'payroll', department: 'Finance', status: 'critical', ageHours: 999, salary: 999999, leaveBalance: 44, evidence: 'ABC tenant must be ignored' }
    ],
    approvals: [
      { tenantSlug: 'tabsons', department: 'HR', status: 'pending', ageHours: 58, approverRole: 'MANAGER' },
      { tenantSlug: 'tabsons', department: 'Operations', status: 'pending', ageHours: 44, approverRole: 'DIRECTOR' }
    ],
    escalations: [
      { tenantSlug: 'tabsons', department: 'HR', state: 'OPEN', severity: 'HIGH', ageHours: 26 },
      { tenantSlug: 'tabsons', department: 'Operations', state: 'OPEN', severity: 'CRITICAL', ageHours: 18 }
    ],
    workflowFailures: [
      { tenantSlug: 'tabsons', department: 'HR', workflowType: 'LEAVE_APPROVAL', failureCount: 4, ageHours: 36 },
      { tenantSlug: 'tabsons', department: 'Operations', workflowType: 'ATTENDANCE_REVIEW', failureCount: 2, ageHours: 20 }
    ],
    complianceIssues: [
      { tenantSlug: 'tabsons', department: 'Operations', issueType: 'ATTENDANCE_EXCEPTION', severity: 'HIGH', unresolved: true }
    ],
    strategicExecution: [
      { tenantSlug: 'tabsons', department: 'Leadership', initiative: 'Q2 Delivery', status: 'DELAYED', delayDays: 9, escalationLinked: true },
      { tenantSlug: 'tabsons', department: 'Product', initiative: 'Policy Automation', status: 'AT_RISK', delayDays: 5 }
    ],
    incidents: [
      { tenantSlug: 'tabsons', department: 'IT', severity: 'HIGH', status: 'OPEN', ageHours: 14 }
    ],
    analytics: {
      predictionAccuracy: 81,
      falsePositiveRate: 9,
      falseNegativeRate: 6,
      riskEscalationTrend: 18,
      departmentRiskTrend: 22
    },
    metadata: {
      source: 'ai-risk-test',
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
    'services/smartSearchService.js',
    'services/globalActivityFeedService.js',
    'services/platformAnalyticsService.js',
    'services/performanceGovernanceService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  seedRiskData();

  let loadError = null;
  try {
    load('services/aiRiskPredictionService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.AIRiskPredictionService;
  assert.ok(svc, 'AIRiskPredictionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generateRiskPrediction, 'function');
  assert.equal(typeof svc.calculateRiskScore, 'function');
  assert.equal(typeof svc.explainPrediction, 'function');
  assert.equal(typeof svc.normalizePredictionPayload, 'function');
  assert.equal(typeof svc.freezePredictionOutput, 'function');
  assert.equal(global.__ARTHHRMS_AI_RISK_PREDICTION_SELF_TEST__.passed, true, 'development self-test should cover prediction, explainability, tenant isolation, confidence scoring, and immutability');

  const malformed = svc.normalizePredictionPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed risk output');

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };
  const normalized = svc.normalizePredictionPayload(sampleRiskPayload(), context);
  assert.equal(normalized.success, true, 'risk payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.riskDomains.length, 8);
  assert.equal(normalized.historicalActivity.length, 2, 'cross-tenant historical data should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC tenant|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized risk output');

  const score = svc.calculateRiskScore(normalized, context);
  assert.equal(score.success, true, 'risk score should calculate');
  assert.ok(score.riskScore >= 60, 'risk score should reflect elevated signals');
  assert.match(score.riskLevel, /HIGH|CRITICAL/);
  assert.ok(score.confidenceScore > 0);
  assert.ok(score.trendScore >= 0);
  assert.ok(score.volatilityScore >= 0);
  assertImmutable(score, 'risk score output');

  const explanation = svc.explainPrediction({
    domain: 'approval_bottlenecks',
    riskLevel: 'HIGH',
    riskScore: 78,
    evidence: ['Two approval queues exceeded SLA', 'Open escalation remains unresolved'],
    contributingFactors: ['approval delay', 'escalation growth']
  }, context);
  assert.equal(explanation.success, true, 'prediction explanation should generate');
  assert.ok(explanation.reason.length > 20);
  assert.ok(explanation.evidence.length >= 2);
  assert.ok(explanation.contributingFactors.length >= 2);
  assert.notEqual(explanation.reason, 'AI thinks so');
  assert.doesNotMatch(JSON.stringify(explanation), /AI thinks so/i);
  assertImmutable(explanation, 'explanation output');

  const report = svc.generateRiskPrediction(sampleRiskPayload(), context);
  assert.equal(report.success, true, 'risk prediction report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.predictedRisks.length >= 4, 'multiple risk domains should produce predictions');
  assert.ok(report.activeRisks.length >= 1);
  assert.ok(report.emergingRisks.length >= 1);
  assert.ok(report.recommendedActions.length >= 1);
  assert.equal(report.governance.aiGovernancePreserved, true);
  assert.equal(report.governance.noAutonomousActions, true);
  assert.equal(report.governance.noRecordMutation, true);
  assert.equal(report.governance.noPermissionChanges, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.humanApprovalRequired, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.ok(report.predictedRisks.every(row => row.reason && row.evidence.length && row.contributingFactors.length && row.confidenceLevel));
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC tenant|abc/i, 'report must not leak confidential or cross-tenant signals');
  assertImmutable(report, 'risk report output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.aiRiskPredictionHistory || []).length >= 1, 'prediction history should persist immutably');
  assert.ok((dataAfter.aiRiskPredictionAnalytics || []).length >= 1, 'risk analytics should persist immutably');
  assert.ok((dataAfter.aiRiskRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /AI_RISK|RISK_PREDICTION/.test(log.actionType || log.eventType || '')), 'audit integration should record AI risk access');

  const blockedCrossTenant = svc.generateRiskPrediction({ ...sampleRiskPayload(), tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant prediction should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const employeeScoped = svc.generateRiskPrediction(sampleRiskPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(employeeScoped.success, true, 'employee-scoped prediction should safely return personal/assigned scope');
  assert.equal(employeeScoped.visibility.scope, 'ASSIGNED_RISK_VISIBILITY_ONLY');
  assert.ok(employeeScoped.predictedRisks.every(row => row.department === 'HR' || row.domain === 'employee_lifecycle'));

  const insufficient = svc.generateRiskPrediction({ tenantSlug: 'tabsons', riskDomains: ['leave_management'] }, context);
  assert.equal(insufficient.success, true, 'sparse datasets should not throw');
  assert.equal(insufficient.dataQuality.insufficientHistoricalData, true);
  assert.ok(insufficient.predictedRisks.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateRiskPrediction(sampleRiskPayload(), {
    ...context,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('aiRiskPredictionService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
