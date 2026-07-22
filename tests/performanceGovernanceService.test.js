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
    insertBefore(){},
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
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32'
  };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
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

function seedPerformanceData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', email: 'one@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', email: 'two@example.com', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'HR One', email: 'hr@example.com', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Tenant Employee', email: 'x@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', managerId: 'MGR-X' }
  ];
  data.reviewCycles = [
    { id: 'RC-1', reviewCycleId: 'RC-1', tenantSlug: 'tabsons', name: 'Q2 2026 Review', startDate: '2026-04-01', endDate: '2026-06-30', status: 'Active', cycleType: 'QUARTERLY' },
    { id: 'RC-X', reviewCycleId: 'RC-X', tenantSlug: 'abc', name: 'ABC Private Cycle', startDate: '2026-04-01', endDate: '2026-06-30', status: 'Active', cycleType: 'QUARTERLY' }
  ];
  data.performanceGoals = [
    {
      id: 'PG-1',
      reviewId: 'REV-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      managerId: 'MGR-1',
      reviewerId: 'MGR-1',
      reviewCycleId: 'RC-1',
      kraTitle: 'Reduce support turnaround',
      targetMetric: 'Close 90% escalations within SLA',
      weightage: 40,
      dueDate: '2026-05-10',
      status: 'Self Reviewed',
      state: 'MANAGER_REVIEW_PENDING',
      selfRating: 4,
      selfComments: 'private growth evidence',
      managerRating: '',
      managerComments: 'manager private note',
      calibrationNote: 'calibration secret'
    },
    {
      id: 'PG-2',
      reviewId: 'REV-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      managerId: 'MGR-1',
      reviewerId: 'HR-1',
      reviewCycleId: 'RC-1',
      kraTitle: 'Improve onboarding quality',
      targetMetric: '95% onboarding completion',
      weightage: 30,
      dueDate: '2026-05-12',
      status: 'Escalated',
      state: 'HR_REVIEW_PENDING',
      clarificationLoops: 3,
      selfRating: 3,
      managerRating: 3,
      managerComments: 'requires confidential HR review'
    },
    {
      id: 'PG-X',
      reviewId: 'REV-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      managerId: 'MGR-X',
      reviewerId: 'MGR-X',
      reviewCycleId: 'RC-X',
      kraTitle: 'ABC secret goal',
      targetMetric: 'private target',
      status: 'Self Reviewed',
      state: 'MANAGER_REVIEW_PENDING',
      finalRating: 5,
      selfComments: 'abc private performance comment'
    }
  ];
  data.appraisals = [
    {
      id: 'AP-1',
      appraisalId: 'AP-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      managerId: 'MGR-1',
      reviewerId: 'HR-1',
      reviewCycleId: 'RC-1',
      status: 'HR_REVIEW_PENDING',
      state: 'HR_REVIEW_PENDING',
      finalRating: 4,
      promotionRecommended: true,
      incrementNote: 'private compensation recommendation',
      finalizedOn: ''
    },
    {
      id: 'AP-X',
      appraisalId: 'AP-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      managerId: 'MGR-X',
      reviewCycleId: 'RC-X',
      status: 'Finalized',
      finalRating: 5,
      incrementNote: 'abc private increment'
    }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'KPI execution', deadlineDate: '2026-05-05', progressPercent: 40, currentStatus: 'Open', governanceState: 'AT_RISK' },
    { id: 'DEL-X', deliverableId: 'DEL-X', tenantSlug: 'abc', empId: 'EMP-X', reviewerId: 'MGR-X', deliverableTitle: 'ABC secret KPI', progressPercent: 100, currentStatus: 'Closed' }
  ];
  data.deliverableReviews = [
    { reviewId: 'DR-1', deliverableId: 'DEL-1', tenantSlug: 'tabsons', empId: 'EMP-1', reviewerId: 'MGR-1', reviewerAction: 'CONTRIBUTOR_UPDATE', reviewStatus: 'PENDING_REVIEW', submitted_at: '2026-05-08', risk_level: 'HIGH' },
    { reviewId: 'DR-X', deliverableId: 'DEL-X', tenantSlug: 'abc', empId: 'EMP-X', reviewerAction: 'CONTRIBUTOR_UPDATE', reviewStatus: 'PENDING_REVIEW', privateNote: 'abc strategic private' }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', escalationType: 'PERFORMANCE_REVIEW_DELAY', severity: 'HIGH', status: 'ESCALATED', reviewerId: 'MGR-1', contributorId: 'EMP-2', createdAt: '2026-05-22T01:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', escalationType: 'APPRAISAL_SECRET', severity: 'HIGH', status: 'ESCALATED', privateNote: 'abc performance secret' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-PERF-1', tenantSlug: 'tabsons', jobType: 'APPRAISAL_WORKFLOW', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'REV-1' },
    { jobId: 'JOB-PERF-X', tenantSlug: 'abc', jobType: 'PERFORMANCE_REVIEW_REMINDER', state: 'FAILED', priority: 'HIGH', retryAttempts: 3, maxRetries: 3, correlationId: 'REV-X', payload: { finalRating: 5, feedback: 'abc private feedback' } }
  ];
  data.performanceGovernanceRuns = [];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/asyncJobService.js',
    'services/tenantIsolationService.js',
    'services/workflowEngine.js',
    'services/strategicReviewService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/performanceGovernanceService.js');
  seedPerformanceData();

  const svc = global.PerformanceGovernanceService;
  assert.ok(svc, 'PerformanceGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.REVIEW_STATES), 'review states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_PERFORMANCE_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyPerformanceRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant performance visibility is critical');
  assert.equal(svc.classifyPerformanceRisk({ appraisalBypass: true }), 'HIGH_RISK', 'unsafe appraisal bypass is high risk');
  assert.equal(svc.classifyPerformanceRisk({ malformedReview: true }), 'WARNING', 'malformed review payload is warning risk');

  const employeeOwn = svc.validatePerformanceScope({ tenantSlug: 'tabsons', empId: 'EMP-1', reviewId: 'REV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own reviews');
  assert.equal(employeeOwn.visibility, 'OWN_REVIEWS_ONLY');

  const managerDirect = svc.validatePerformanceScope({ tenantSlug: 'tabsons', empId: 'EMP-1', reviewId: 'REV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerDirect.allowed, true, 'manager may access direct report reviews');
  assert.equal(managerDirect.visibility, 'DIRECT_REPORT_REVIEWS');

  const superAdminRaw = svc.validatePerformanceScope({ tenantSlug: 'tabsons', empId: 'EMP-1', reviewId: 'REV-1', managerComments: 'manager private note', finalRating: 4 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not view raw appraisal records by default');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_APPRAISAL_ACCESS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /manager private|finalRating|managerComments/i, 'SUPER_ADMIN failure output must redact appraisal details');

  const platformScope = svc.validatePerformanceScope({ tenantSlug: 'tabsons', empId: 'EMP-1', reviewId: 'REV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear inside appraisal hierarchy');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_PERFORMANCE_ACCESS_BLOCKED'));

  const crossTenant = svc.validatePerformanceScope({ tenantSlug: 'abc', empId: 'EMP-X', reviewId: 'REV-X', selfComments: 'abc private performance comment' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant performance visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /EMP-X|REV-X|abc private|selfComments/i, 'cross-tenant failure must not leak performance data');

  const malformed = svc.validateReviewPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed review payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_REVIEW_PAYLOAD'));

  const bypass = svc.validateReviewPayload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    reviewCycleId: 'RC-1',
    state: 'APPROVED',
    skipHrReview: true,
    finalRating: 5,
    managerComments: 'direct approval private comment'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(bypass.success, false, 'manager direct appraisal approval must be blocked');
  assert.ok(bypass.failures.some(item => item.failureCode === 'UNSAFE_APPRAISAL_WORKFLOW_BYPASS'));
  assert.doesNotMatch(JSON.stringify(bypass), /direct approval private|managerComments|finalRating/i, 'workflow bypass output must be redacted');

  const platformReviewer = svc.validateReviewPayload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    reviewerChain: [{ role: 'MANAGER', id: 'MGR-1' }, { role: 'PLATFORM_OWNER', id: 'PO-1' }]
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.ok(platformReviewer.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_APPRAISAL_CHAIN_BLOCKED'), 'PLATFORM_OWNER must be excluded from appraisal chains');

  const normalized = svc.normalizeReviewPayload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    reviewId: 'REV-1',
    state: 'manager review pending',
    selfComments: 'private growth evidence',
    finalRating: 4
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized review output must be immutable');
  assert.equal(normalized.payload.state, 'MANAGER_REVIEW_PENDING');
  assert.doesNotMatch(JSON.stringify(normalized), /private growth|finalRating|selfComments/i, 'normalized payload should not expose feedback or ratings');

  const congestion = svc.detectReviewerCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-23T00:00:00.000Z' });
  assert.equal(congestion.success, true, 'reviewer congestion should be detected safely');
  assert.ok(congestion.summary.delayedReviews >= 2, 'delayed reviews should be counted');
  assert.ok(congestion.summary.reviewerCongestion >= 1, 'reviewer congestion should be visible');
  assert.ok(Object.isFrozen(congestion.reviewers), 'reviewer congestion output must be immutable');
  assert.doesNotMatch(JSON.stringify(congestion), /abc private|manager private|finalRating|selfRating|managerRating/i, 'congestion output must not leak confidential review fields');

  const dataBefore = global.DB.get();
  const performanceBefore = JSON.stringify({
    performanceGoals: dataBefore.performanceGoals,
    appraisals: dataBefore.appraisals,
    reviewCycles: dataBefore.reviewCycles
  });
  const schedule = svc.scheduleAppraisalWorkflow({
    tenantSlug: 'tabsons',
    reviewId: 'REV-1',
    empId: 'EMP-1',
    reviewCycleId: 'RC-1',
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'appraisal workflow scheduling should work');
  assert.ok(schedule.asyncJob, 'appraisal workflow scheduling should integrate with async jobs');
  assert.equal(JSON.stringify({
    performanceGoals: global.DB.get().performanceGoals,
    appraisals: global.DB.get().appraisals,
    reviewCycles: global.DB.get().reviewCycles
  }), performanceBefore, 'appraisal scheduling must not mutate historical performance records');

  const report = svc.generatePerformanceGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-23T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'performance governance report should generate safely');
  assert.equal(report.readOnly, true, 'performance governance report should be read-only');
  assert.ok(report.reviewCycleHealth.totalCycles >= 1, 'review cycle health should be visible');
  assert.ok(report.appraisalWorkflow.pendingReviews >= 2, 'pending appraisal workflow should be visible');
  assert.ok(report.kpiIntegration.linkedStrategicDeliverables >= 1, 'KPI-linked review visibility should be integrated');
  assert.ok(report.reviewerGovernance.reviewerCongestion >= 1, 'reviewer governance should expose congestion indicators');
  assert.equal(report.accessGovernance.superAdminAppraisalAccess, false, 'SUPER_ADMIN appraisal access remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /EMP-X|AP-X|PG-X|abc private|private growth|manager private|finalRating|managerRating|selfRating|incrementNote/i, 'report must not expose cross-tenant or confidential appraisal data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /PERFORMANCE_GOVERNANCE|APPRAISAL_WORKFLOW/.test(row.eventType || row.category || '')), 'performance telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.PERFORMANCE_GOVERNANCE_REPORTED, 'performance governance metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /PERFORMANCE_GOVERNANCE|APPRAISAL_WORKFLOW/.test(row.actionType || row.action || '')), 'performance actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleAppraisalWorkflow({ tenantSlug: 'tabsons', reviewId: 'REV-SELF', empId: 'EMP-1' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true,
      preview: true
    });
    assert.equal(degraded.success, true, 'missing async/notification dependencies should degrade safely');
    assert.equal(degraded.asyncJob.success, false, 'degraded schedule should be governance-visible without async dependency');
  } finally {
    if (originalAsync) global.AsyncJobService = originalAsync;
    if (originalNotify) global.NotificationOrchestrationService = originalNotify;
  }

  console.log('performanceGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
