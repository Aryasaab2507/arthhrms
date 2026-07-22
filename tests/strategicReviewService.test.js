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
    pathname: '/manager.html',
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
    recordWorkflowMetric(type, metadata) { global.__metrics.push({ type, metadata }); return { success: true }; }
  };
  global.AuditService = {
    recordAudit(event, context) { global.__audits.push({ event, context }); return { success: true, recorded: true }; }
  };
}

function createPendingReviewFixture() {
  global.DB.migrate();
  const source = global.DB.get();
  source.employees.push(
    { id: 'EMP001', name: 'Review Manager', dept: 'Engineering', desig: 'Manager', managerId: null },
    { id: 'EMP005', name: 'Review Contributor', dept: 'Engineering', desig: 'Developer', managerId: 'EMP001' }
  );
  global.DB.save(source);
  const contributorId = global.DB.resolveEmployeeId('EMP005');
  const managerId = global.DB.getEmployee(contributorId).managerId;
  const deliverable = global.DB.createStrategicDeliverable({
    empId: contributorId,
    deliverableTitle: 'Reduce customer escalations',
    expectedOutcome: 'Escalations below 2 per month',
    deadlineDate: global.DB.today(),
    assignedBy: 'HR'
  });
  const contributorUpdate = global.DB.addDeliverableReview({
    deliverableId: deliverable.id,
    employeeProgressNote: 'Completed first remediation pass',
    reviewDate: global.DB.today()
  });
  return { contributorId, managerId, deliverable, contributorUpdate };
}

async function main() {
  setupRuntime();
  ['db.js', 'services/deliverableGovernanceService.js', 'services/strategicReviewService.js'].forEach(load);

  assert.ok(global.StrategicReviewService, 'StrategicReviewService should be exported');
  assert.equal(global.StrategicReviewService.normalizeReviewAction('approve progress'), 'APPROVE_PROGRESS');
  assert.equal(global.StrategicReviewService.normalizeReviewAction('complete'), 'COMPLETE_DELIVERABLE');

  const { contributorId, managerId, deliverable, contributorUpdate } = createPendingReviewFixture();
  assert.equal(contributorUpdate.reviewerAction, 'CONTRIBUTOR_UPDATE', 'contributor update must not auto-approve');

  const queue = global.StrategicReviewService.createReviewQueue({ reviewerId: managerId });
  assert.ok(Object.isFrozen(queue), 'review queue output should be immutable');
  const queued = queue.find(item => item.review_id === contributorUpdate.reviewId);
  assert.ok(queued, 'contributor update should create a pending review queue item');
  assert.equal(queued.deliverable_id, deliverable.id);
  assert.equal(queued.contributor_id, contributorId);
  assert.equal(queued.reviewer_id, managerId);
  assert.equal(queued.review_status, 'PENDING_REVIEW');

  const clarification = global.StrategicReviewService.performReviewAction(queued.review_id, 'REQUEST_CLARIFICATION', {
    reviewerId: managerId,
    remark: 'Please attach KPI evidence'
  });
  assert.equal(clarification.success, true);
  assert.equal(clarification.reviewAction, 'REQUEST_CLARIFICATION');
  assert.equal(global.DB.getStrategicDeliverables().find(d => d.id === deliverable.id).governanceState, 'NEEDS_CLARIFICATION');

  const secondUpdate = global.DB.addDeliverableReview({
    deliverableId: deliverable.id,
    employeeProgressNote: 'Evidence attached',
    reviewDate: global.DB.today()
  });
  const escalation = global.StrategicReviewService.performReviewAction(secondUpdate.reviewId, 'ESCALATE_RISK', {
    reviewerId: managerId,
    remark: 'Risk requires leadership visibility'
  });
  assert.equal(escalation.success, true);
  assert.equal(global.DB.getStrategicDeliverables().find(d => d.id === deliverable.id).governanceState, 'ESCALATED');

  const finalUpdate = global.DB.addDeliverableReview({
    deliverableId: deliverable.id,
    employeeProgressNote: 'Final KPI verified',
    reviewDate: global.DB.today()
  });
  const completion = global.StrategicReviewService.performReviewAction(finalUpdate.reviewId, 'COMPLETE_DELIVERABLE', {
    reviewerId: managerId,
    progressPercent: 100,
    closureRemarks: 'KPI validated by reviewer',
    kpiValidated: true
  });
  assert.equal(completion.success, true);
  const closed = global.DB.getStrategicDeliverables().find(d => d.id === deliverable.id);
  assert.equal(closed.governanceState, 'COMPLETED');
  assert.equal(closed.finalClosureStatus, 'Achieved');

  const snapshot = global.StrategicReviewService.getReviewCenterSnapshot({ reviewerId: managerId });
  assert.ok(Object.isFrozen(snapshot), 'snapshot should be immutable');
  assert.ok(snapshot.metrics.escalations >= 1, 'snapshot should count escalations');
  assert.ok(global.__metrics.length > 0, 'metrics integration should record review events');
  assert.ok(global.__audits.length > 0, 'audit integration should record review events');

  console.log('strategicReviewService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
