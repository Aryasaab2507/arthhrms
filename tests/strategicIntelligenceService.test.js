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
    style: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
    appendChild(){},
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
  global.location = {
    href: '',
    origin: 'https://hrms.example.com',
    pathname: '/director.html',
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
  global.__metrics = [];
  global.__audits = [];
  global.OrchestrationMetricsService = {
    recordWorkflowMetric(type, metadata) {
      global.__metrics.push({ type, metadata });
      return { success: true };
    }
  };
  global.AuditService = {
    recordAudit(event, context) {
      global.__audits.push({ event, context });
      return { success: true, recorded: true };
    }
  };
}

function seedStrategicIntelligenceFixture() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-20';
  const source = global.DB.get();
  source.employees.push(
    { id: 'EMP001', name: 'Strategic Manager', dept: 'Engineering', desig: 'Manager', managerId: null },
    { id: 'EMP003', name: 'Finance Contributor', dept: 'Finance', desig: 'Analyst', managerId: 'HRH001' },
    { id: 'EMP005', name: 'Strategic Contributor', dept: 'Engineering', desig: 'Developer', managerId: 'EMP001' },
    { id: 'DIR001', name: 'Executive Director', dept: 'Leadership', desig: 'Director', managerId: null },
    { id: 'HRH001', name: 'HR Head', dept: 'Hr', desig: 'HR Head', managerId: null }
  );
  source.users.push(
    { id: 'USR-DIR', role: 'director', empId: 'DIR001', email: 'director@example.com' },
    { id: 'USR-HRH', role: 'hr_head', empId: 'HRH001', email: 'hr-head@example.com' }
  );
  global.DB.save(source);

  const contributorId = global.DB.resolveEmployeeId('EMP005');
  const managerId = global.DB.getEmployee(contributorId).managerId;
  const financeContributorId = global.DB.resolveEmployeeId('EMP003');

  const delayed = global.DB.createStrategicDeliverable({
    empId: contributorId,
    managerId,
    deliverableTitle: 'Stabilize onboarding SLA',
    expectedOutcome: 'Pilot onboarding activation below 48 hours',
    deadlineDate: '2026-05-01',
    priority: 'Critical',
    assignedBy: 'HR',
    progressPercent: 35
  });

  const finance = global.DB.createStrategicDeliverable({
    empId: financeContributorId,
    managerId: 'HRH001',
    deliverableTitle: 'Close payroll reconciliation variance',
    expectedOutcome: 'Zero unresolved payroll variance',
    deadlineDate: '2026-05-16',
    priority: 'High',
    assignedBy: 'HR',
    progressPercent: 55
  });

  const contributorUpdate = global.DB.addDeliverableReview({
    deliverableId: delayed.id,
    employeeProgressNote: 'Dependency blocked by operations',
    reviewDate: '2026-05-11'
  });

  global.StrategicReviewService.performReviewAction(contributorUpdate.reviewId, 'ESCALATE_RISK', {
    reviewerId: managerId,
    remark: 'Blocked strategic KPI needs director visibility'
  });

  const pendingFinanceReview = global.DB.addDeliverableReview({
    deliverableId: finance.id,
    employeeProgressNote: 'Finance reconciliation evidence attached',
    reviewDate: '2026-05-17'
  });

  return { delayed, finance, contributorUpdate, pendingFinanceReview, managerId };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/deliverableGovernanceService.js',
    'services/escalationPolicyService.js',
    'services/strategicReviewService.js',
    'services/strategicIntelligenceService.js'
  ].forEach(load);

  assert.ok(global.StrategicIntelligenceService, 'StrategicIntelligenceService should be exported');
  const fixture = seedStrategicIntelligenceFixture();

  const context = { role: 'director', empId: 'DIR001', metadata: { requestId: 'REQ-1' } };
  const beforeContext = JSON.stringify(context);
  const board = global.StrategicIntelligenceService.generateStrategicIntelligenceBoard(context);

  assert.equal(JSON.stringify(context), beforeContext, 'director context should never be mutated');
  assert.equal(board.success, true);
  assert.equal(board.scope, 'ORGANIZATION');
  assert.equal(board.directorMode, 'READ_ONLY_OVERSIGHT');
  assert.equal(board.visibilityRules.canApproveContributorUpdates, false);
  assert.equal(board.visibilityRules.canManageContributorTasks, false);
  assert.equal(board.visibilityRules.canBypassReviewerWorkflow, false);
  assert.ok(!board.allowedDirectorActions.includes('APPROVE_PROGRESS'), 'director board must not expose reviewer execution actions');
  assert.ok(Object.isFrozen(board), 'director board output should be immutable');

  assert.ok(board.executiveKpis.totalDeliverables >= 2, 'board should count strategic deliverables');
  assert.ok(board.executiveKpis.overdueDeliverablePercent > 0, 'board should expose overdue deliverable percentage');
  assert.ok(board.executiveKpis.escalationDensity > 0, 'board should expose escalation density');
  assert.ok(Array.isArray(board.executiveKpis.quarterlyCompletionTrend), 'board should expose quarterly trend visibility');

  const engineeringHealth = board.departmentHealth.find(item => item.department === 'Engineering');
  assert.ok(engineeringHealth, 'department health should include Engineering');
  assert.ok(engineeringHealth.delayedDeliverables >= 1, 'department health should count delayed deliverables');

  assert.ok(board.reviewBacklog.totalPending >= 1, 'review backlog should include pending contributor reviews');
  assert.ok(board.reviewBacklog.queue.every(item => item.review_id), 'review backlog items should remain compatible with review queue records');

  assert.ok(board.organizationRiskBoard.some(risk =>
    ['HIGH_RISK_DELIVERABLE', 'DEPARTMENT_DELAY', 'ESCALATION_CLUSTER', 'REVIEW_BOTTLENECK'].includes(risk.category)
  ), 'risk board should surface organization-wide strategic risks');
  assert.ok(board.escalationIntelligence.totalEscalations >= 1, 'escalation intelligence should aggregate escalation activity');

  const health = global.StrategicIntelligenceService.calculateDepartmentHealth('Engineering');
  assert.ok(Object.isFrozen(health), 'department health helper output should be immutable');
  assert.ok(health.healthScore <= 100);

  const density = global.StrategicIntelligenceService.calculateEscalationDensity();
  assert.ok(Object.isFrozen(density), 'escalation density output should be immutable');
  assert.ok(density.densityPercent >= 0);

  const malformedRisk = global.StrategicIntelligenceService.normalizeStrategicRisk(null);
  assert.ok(Object.isFrozen(malformedRisk), 'malformed risk normalization should still return immutable output');
  assert.equal(malformedRisk.category, 'HIGH_RISK_DELIVERABLE');

  const acknowledgement = global.StrategicIntelligenceService.acknowledgeStrategicRisk(board.organizationRiskBoard[0].riskId, {
    actorRole: 'director',
    actorId: 'DIR001',
    remark: 'Reviewed for executive intervention'
  });
  assert.equal(acknowledgement.success, true);
  assert.equal(acknowledgement.replayVisible, true);
  assert.ok(Object.isFrozen(acknowledgement), 'acknowledgement output should be immutable');
  assert.ok(global.__audits.some(row => row.event.eventType === 'STRATEGIC_RISK_ACKNOWLEDGED'), 'risk acknowledgement should be auditable');
  assert.ok(global.__metrics.some(row => row.type === 'STRATEGIC_RISK_ACKNOWLEDGED'), 'risk acknowledgement should record metrics');

  assert.equal(global.StrategicIntelligenceService.canDirectorExecuteReviewAction('APPROVE_PROGRESS'), false);
  assert.equal(global.StrategicIntelligenceService.canDirectorExecuteReviewAction('ACKNOWLEDGE_RISK'), true);
  assert.ok(fixture.delayed.id, 'fixture should preserve existing deliverable records');

  console.log('strategicIntelligenceService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
