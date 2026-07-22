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

function seedEscalationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.smartEscalationPredictionHistory = [];
  data.smartEscalationPredictionAnalytics = [];
  data.smartEscalationRecommendationHistory = [];
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

function sampleEscalationPayload() {
  return {
    tenantSlug: 'tabsons',
    escalationDomains: [
      'leave_approvals',
      'attendance_disputes',
      'payroll_governance',
      'employee_lifecycle_actions',
      'workflow_approvals',
      'strategic_deliverables',
      'project_execution',
      'operational_incidents',
      'compliance_reviews'
    ],
    approvals: [
      { tenantSlug: 'tabsons', domain: 'leave_approvals', department: 'HR', status: 'pending', ageHours: 72, responseTimeHours: 60, priority: 'high', evidence: 'Leave approval queue exceeded SLA' },
      { tenantSlug: 'tabsons', domain: 'workflow_approvals', department: 'Operations', status: 'pending', ageHours: 44, responseTimeHours: 40, priority: 'moderate', evidence: 'Workflow approval has not moved' },
      { tenantSlug: 'abc', domain: 'payroll_governance', department: 'Finance', status: 'pending', ageHours: 999, salary: 999999, leaveBalance: 44, evidence: 'ABC tenant must be ignored' }
    ],
    workflows: [
      { tenantSlug: 'tabsons', domain: 'workflow_approvals', department: 'Operations', status: 'stagnant', ageHours: 48, blocked: true, retryCount: 3 },
      { tenantSlug: 'tabsons', domain: 'project_execution', department: 'Product', status: 'blocked', ageHours: 36, blocked: true, retryCount: 2 }
    ],
    unresolvedActions: [
      { tenantSlug: 'tabsons', domain: 'employee_lifecycle_actions', department: 'HR', status: 'unresolved', ageHours: 54, ownerResponseHours: 50 },
      { tenantSlug: 'tabsons', domain: 'compliance_reviews', department: 'Operations', status: 'open', ageHours: 38, ownerResponseHours: 32 }
    ],
    historicalEscalations: [
      { tenantSlug: 'tabsons', domain: 'leave_approvals', department: 'HR', severity: 'HIGH', resolved: false, ageHours: 48 },
      { tenantSlug: 'tabsons', domain: 'operational_incidents', department: 'IT', severity: 'CRITICAL', resolved: false, ageHours: 18 }
    ],
    incidents: [
      { tenantSlug: 'tabsons', domain: 'operational_incidents', department: 'IT', severity: 'HIGH', status: 'OPEN', ageHours: 20 }
    ],
    bottlenecks: [
      { tenantSlug: 'tabsons', domain: 'strategic_deliverables', department: 'Leadership', blockageCount: 3, delayDays: 9, escalationLinked: true }
    ],
    responseTimes: [
      { tenantSlug: 'tabsons', department: 'HR', averageResponseHours: 42 },
      { tenantSlug: 'tabsons', department: 'Operations', averageResponseHours: 34 }
    ],
    completionVelocity: [
      { tenantSlug: 'tabsons', department: 'Product', velocity: 55, stalledCount: 3 },
      { tenantSlug: 'tabsons', department: 'Leadership', velocity: 52, stalledCount: 2 }
    ],
    analytics: {
      predictionAccuracy: 80,
      falsePositiveRate: 8,
      falseNegativeRate: 6,
      bottleneckTrend: 22,
      departmentEscalationTrend: 18,
      strategicEscalationTrend: 24
    },
    metadata: {
      source: 'smart-escalation-test',
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
    'services/escalationCommandService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js'
  ].forEach(load);
  seedEscalationData();

  let loadError = null;
  try {
    load('services/smartEscalationPredictionService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.SmartEscalationPredictionService;
  assert.ok(svc, 'SmartEscalationPredictionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generateEscalationPrediction, 'function');
  assert.equal(typeof svc.calculateEscalationProbability, 'function');
  assert.equal(typeof svc.explainEscalationRisk, 'function');
  assert.equal(typeof svc.normalizeEscalationPayload, 'function');
  assert.equal(typeof svc.freezeEscalationOutput, 'function');
  assert.equal(global.__ARTHHRMS_SMART_ESCALATION_PREDICTION_SELF_TEST__.passed, true, 'development self-test should cover prediction, confidence scoring, explainability, tenant isolation, and immutability');

  const malformed = svc.normalizeEscalationPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed escalation output');

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };
  const normalized = svc.normalizeEscalationPayload(sampleEscalationPayload(), context);
  assert.equal(normalized.success, true, 'escalation payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.escalationDomains.length, 9);
  assert.equal(normalized.approvals.length, 2, 'cross-tenant approvals should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC tenant|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized escalation output');

  const probability = svc.calculateEscalationProbability(normalized, context);
  assert.equal(probability.success, true, 'escalation probability should calculate');
  assert.ok(probability.escalationProbability >= 50, 'probability should reflect delayed approvals and blocked workflows');
  assert.ok(probability.confidenceScore > 0);
  assert.ok(probability.urgencyScore > 0);
  assert.ok(probability.impactScore > 0);
  assert.match(probability.escalationLevel, /MODERATE|HIGH|CRITICAL/);
  assertImmutable(probability, 'probability output');

  const explanation = svc.explainEscalationRisk({
    domain: 'workflow_approvals',
    department: 'Operations',
    escalationLevel: 'HIGH',
    escalationProbability: 78,
    evidence: ['Approval has exceeded SLA', 'Workflow is stagnant'],
    contributingFactors: ['approval delay', 'workflow stagnation'],
    recommendedActions: ['Ask a human owner to review bottleneck evidence']
  }, context);
  assert.equal(explanation.success, true, 'escalation explanation should generate');
  assert.ok(explanation.explanation.length > 20);
  assert.ok(explanation.evidence.length >= 2);
  assert.ok(explanation.contributingFactors.length >= 2);
  assert.ok(explanation.recommendedActions.length >= 1);
  assert.doesNotMatch(JSON.stringify(explanation), /AI predicts escalation/i);
  assertImmutable(explanation, 'explanation output');

  const report = svc.generateEscalationPrediction(sampleEscalationPayload(), context);
  assert.equal(report.success, true, 'smart escalation report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.predictedEscalations.length >= 5, 'multiple escalation domains should produce predictions');
  assert.ok(report.likelyEscalations.length >= 1);
  assert.ok(report.emergingEscalations.length >= 1);
  assert.ok(report.recurringEscalations.length >= 1);
  assert.ok(report.blockedWorkflowAlerts.length >= 1);
  assert.ok(report.recommendedActions.length >= 1);
  assert.equal(report.governance.aiGovernancePreserved, true);
  assert.equal(report.governance.noAutonomousActions, true);
  assert.equal(report.governance.noEscalationTrigger, true);
  assert.equal(report.governance.noWorkflowMutation, true);
  assert.equal(report.governance.noApprovalModification, true);
  assert.equal(report.governance.noApprovalChainChange, true);
  assert.equal(report.governance.noRecordMutation, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.humanApprovalRequired, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.ok(report.predictedEscalations.every(row => row.explanation && row.evidence.length && row.contributingFactors.length && row.confidenceLevel && row.recommendedActions.length));
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC tenant|abc/i, 'report must not leak confidential or cross-tenant escalation history');
  assertImmutable(report, 'smart escalation report output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.smartEscalationPredictionHistory || []).length >= 1, 'prediction history should persist immutably');
  assert.ok((dataAfter.smartEscalationPredictionAnalytics || []).length >= 1, 'escalation analytics should persist immutably');
  assert.ok((dataAfter.smartEscalationRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /SMART_ESCALATION|ESCALATION_PREDICTION/.test(log.actionType || log.eventType || '')), 'audit integration should record smart escalation access');

  const blockedCrossTenant = svc.generateEscalationPrediction({ ...sampleEscalationPayload(), tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant prediction should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateEscalationPrediction(sampleEscalationPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(managerScoped.success, true, 'manager-scoped prediction should safely return department scope');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_ESCALATION_PREDICTION_VISIBILITY');
  assert.ok(managerScoped.predictedEscalations.every(row => row.department === 'HR' || row.domain === 'employee_lifecycle_actions'));

  const insufficient = svc.generateEscalationPrediction({ tenantSlug: 'tabsons', escalationDomains: ['leave_approvals'] }, context);
  assert.equal(insufficient.success, true, 'sparse escalation datasets should not throw');
  assert.equal(insufficient.dataQuality.insufficientHistory, true);
  assert.ok(insufficient.predictedEscalations.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateEscalationPrediction(sampleEscalationPayload(), {
    ...context,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('smartEscalationPredictionService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
