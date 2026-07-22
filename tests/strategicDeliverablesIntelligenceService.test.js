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

function seedStrategicCenterData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-22';
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', name: 'Contributor One', dept: 'Engineering', department: 'Engineering', role: 'employee', tenantSlug: 'tabsons', salary: 900000, leaveBalance: 12 },
    { id: 'EMP-2', empId: 'EMP-2', name: 'Contributor Two', dept: 'Operations', department: 'Operations', role: 'employee', tenantSlug: 'tabsons', salary: 800000 },
    { id: 'MGR-1', empId: 'MGR-1', name: 'Reviewer One', dept: 'Engineering', department: 'Engineering', role: 'manager', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', name: 'Other Tenant', dept: 'Finance', department: 'Finance', role: 'employee', tenantSlug: 'abc', payrollAmount: 999999 }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', correlationId: 'CORR-STRAT-1', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Stabilize onboarding SLA', expectedOutcome: 'Pilot onboarding below 48 hours', department: 'Engineering', deadlineDate: '2026-05-01', currentStatus: 'Open', governanceState: 'ESCALATED', progressPercent: 35, tenantSlug: 'tabsons' },
    { id: 'DEL-2', deliverableId: 'DEL-2', correlationId: 'CORR-STRAT-1', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Close rollout blockers', expectedOutcome: 'Pilot rollout unblocked', department: 'Operations', deadlineDate: '2026-05-03', currentStatus: 'At Risk', governanceState: 'AT_RISK', progressPercent: 20, tenantSlug: 'tabsons' },
    { id: 'DEL-3', deliverableId: 'DEL-3', correlationId: 'CORR-STRAT-1', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Complete policy rollout', department: 'Engineering', deadlineDate: '2026-05-20', currentStatus: 'Completed', finalClosureStatus: 'Completed', progressPercent: 100, tenantSlug: 'tabsons' },
    { id: 'DEL-X', deliverableId: 'DEL-X', correlationId: 'CORR-X', empId: 'EMP-X', reviewerId: 'MGR-X', strategicOwnerId: 'MGR-X', deliverableTitle: 'Other tenant payroll', department: 'Finance', deadlineDate: '2026-05-01', currentStatus: 'Open', progressPercent: 10, tenantSlug: 'abc', salary: 999999 }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-1', deliverableId: 'DEL-1', correlationId: 'CORR-STRAT-1', reviewerId: 'MGR-1', empId: 'EMP-1', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', escalation_state: 'ESCALATED', tenantSlug: 'tabsons' },
    { reviewId: 'REV-2', deliverableId: 'DEL-2', correlationId: 'CORR-STRAT-1', reviewerId: 'MGR-1', empId: 'EMP-2', reviewerAction: 'REQUEST_CLARIFICATION', review_status: 'NEEDS_CLARIFICATION', submitted_at: '2026-05-11T00:00:00.000Z', risk_level: 'MEDIUM', escalation_state: 'UNDER_REVIEW', tenantSlug: 'tabsons' },
    { reviewId: 'REV-3', deliverableId: 'DEL-1', correlationId: 'CORR-STRAT-1', reviewerId: 'MGR-1', empId: 'EMP-1', reviewerAction: 'REQUEST_CLARIFICATION', review_status: 'NEEDS_CLARIFICATION', submitted_at: '2026-05-12T00:00:00.000Z', risk_level: 'MEDIUM', escalation_state: 'UNDER_REVIEW', tenantSlug: 'tabsons' },
    { reviewId: 'REV-X', deliverableId: 'DEL-X', correlationId: 'CORR-X', reviewerId: 'MGR-X', empId: 'EMP-X', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', tenantSlug: 'abc', salary: 999999 }
  ];
  data.pendingActions = [
    { id: 'PA-1', correlationId: 'CORR-STRAT-1', actionType: 'STRATEGIC_REVIEW', title: 'Review delayed deliverable', status: 'PENDING', reviewerId: 'MGR-1', tenantSlug: 'tabsons', dueAt: '2026-05-12T00:00:00.000Z' },
    { id: 'PA-2', correlationId: 'CORR-STRAT-1', actionType: 'CONTRIBUTOR_BLOCKED', title: 'Contributor waiting for dependency', status: 'BLOCKED', contributorId: 'EMP-2', tenantSlug: 'tabsons', dueAt: '2026-05-12T00:00:00.000Z' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-STRAT-1', correlationId: 'CORR-STRAT-1', type: 'STRATEGIC_EXECUTION_DELAYED', status: 'FAILED', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:00:00.000Z' },
    { eventId: 'WF-STRAT-2', correlationId: 'CORR-STRAT-1', type: 'KPI_DEGRADATION', status: 'DEGRADED', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:10:00.000Z' },
    { eventId: 'WF-X', correlationId: 'CORR-X', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'abc', salary: 999999, createdAt: '2026-05-22T01:20:00.000Z' }
  ];
  data.escalations = [
    { id: 'ESC-1', correlationId: 'CORR-STRAT-1', eventId: 'WF-STRAT-1', escalationType: 'SLA_BREACH', severity: 'HIGH', status: 'ESCALATED', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:30:00.000Z' },
    { id: 'ESC-X', correlationId: 'CORR-X', eventId: 'WF-X', escalationType: 'PAYROLL_RISK', severity: 'CRITICAL', tenantSlug: 'abc', payrollAmount: 999999, createdAt: '2026-05-22T01:40:00.000Z' }
  ];
  global.DB.save(data);

  global.WorkflowTraceStore = {
    getTraceByEventId(eventId) {
      if (eventId !== 'WF-STRAT-1') return [];
      return [
        { eventId: 'WF-STRAT-1', correlationId: 'CORR-STRAT-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T00:55:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-STRAT-1', correlationId: 'CORR-STRAT-1', eventType: 'STRATEGIC_EXECUTION_DEGRADED', handler: 'strategicHandler', status: 'DEGRADED', severity: 'HIGH', timestamp: '2026-05-22T00:57:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    },
    getTraceByCorrelationId(correlationId) {
      if (correlationId !== 'CORR-STRAT-1') return [];
      return [
        { eventId: 'WF-STRAT-1', correlationId: 'CORR-STRAT-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T00:55:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-STRAT-1', correlationId: 'CORR-STRAT-1', eventType: 'STRATEGIC_EXECUTION_DEGRADED', handler: 'strategicHandler', status: 'DEGRADED', severity: 'HIGH', timestamp: '2026-05-22T00:57:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    }
  };

  global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', 'KPI_DEGRADATION', {
    correlationId: 'CORR-STRAT-1',
    eventId: 'WF-STRAT-1',
    severity: 'HIGH',
    metadata: { tenantSlug: 'tabsons', source: 'strategicExecution' }
  });
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/deliverableGovernanceService.js',
    'services/escalationPolicyService.js',
    'services/strategicReviewService.js',
    'services/eventReplayService.js',
    'services/operationsMonitoringService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/strategicIntelligenceService.js');
  seedStrategicCenterData();

  const svc = global.StrategicIntelligenceService;
  assert.ok(svc, 'StrategicIntelligenceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.STRATEGIC_STATES), 'strategic states must be immutable');
  assert.equal(global.__ARTHHRMS_STRATEGIC_DELIVERABLES_INTELLIGENCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyStrategicRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant strategic visibility classifies as critical blocker');
  assert.equal(svc.classifyStrategicRisk({ executionFailures: 2 }), 'HIGH_RISK', 'repeated strategic execution failure classifies as high risk');
  assert.equal(svc.classifyStrategicRisk({ reviewerCongestion: 1 }), 'WARNING', 'reviewer congestion increase classifies as warning');

  const scope = svc.validateStrategicScope({ tenantSlug: 'abc', metadata: { salary: 123456 } }, { tenantSlug: 'tabsons' });
  assert.equal(scope.allowed, false, 'cross-tenant strategic scope must be blocked');
  assert.ok(scope.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(scope), /123456|salary/i, 'scope failures must not expose sensitive fields');

  const bottlenecks = svc.detectStrategicBottlenecks({ tenantSlug: 'tabsons', correlationId: 'CORR-STRAT-1' }, { tenantSlug: 'tabsons' });
  assert.equal(bottlenecks.success, true, 'strategic bottleneck detection should work');
  assert.ok(bottlenecks.summary.delayedDeliverables >= 2, 'delayed deliverables should be detected');
  assert.ok(bottlenecks.summary.contributorBlockage >= 1, 'contributor blockage should be detected');
  assert.ok(bottlenecks.summary.reviewerCongestion >= 1, 'reviewer congestion should be detected');
  assert.ok(Object.isFrozen(bottlenecks.bottlenecks), 'bottleneck output must be immutable');
  assert.doesNotMatch(JSON.stringify(bottlenecks), /999999|900000|salary|payrollAmount|Other Tenant/i, 'bottlenecks must not expose sensitive or cross-tenant data');

  const chains = svc.correlateStrategicExecution({ tenantSlug: 'tabsons', correlationId: 'CORR-STRAT-1', eventId: 'WF-STRAT-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(chains.success, true, 'strategic execution correlation should work');
  assert.ok(chains.chains.some(row => row.chainType === 'KPI_DEGRADATION'));
  assert.ok(chains.chains.some(row => row.chainType === 'ESCALATION_LINKED'));
  assert.ok(chains.chains.some(row => row.chainType === 'CONTRIBUTOR_BLOCKAGE'));
  assert.ok(chains.chains.some(row => row.chainType === 'REPLAY_STRATEGIC'));

  const dataBefore = JSON.stringify(global.DB.get());
  const preview = svc.generateStrategicDeliverablesIntelligenceReport({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-STRAT-1',
    eventId: 'WF-STRAT-1'
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(JSON.stringify(global.DB.get()), dataBefore, 'preview report must not mutate historical strategic records');
  assert.equal(preview.success, true, 'strategic deliverables intelligence report should complete safely');
  assert.equal(preview.readOnly, true, 'strategic monitoring should be read-only by default');
  assert.ok(['HIGH_RISK', 'CRITICAL_BLOCKER'].includes(preview.severity), 'seeded strategic congestion should raise risk');
  assert.ok(preview.kpiGovernance.kpiCompletionRate >= 0, 'KPI completion rate should be visible');
  assert.ok(preview.kpiGovernance.delayedDeliverables >= 2, 'delayed deliverables should be visible');
  assert.ok(preview.contributorAccountability.blockedContributors >= 1, 'contributor accountability should be visible');
  assert.ok(preview.reviewerPerformance.reviewerCongestion >= 1, 'reviewer performance should be visible');
  assert.ok(preview.replay.linked === true, 'replay-linked strategic visibility should be exposed');
  assert.ok(Object.isFrozen(preview), 'report must be immutable');
  assert.ok(Object.isFrozen(preview.executionChains.chains), 'nested strategic chains must be immutable');
  assert.doesNotMatch(JSON.stringify(preview), /999999|900000|payrollAmount|salary|leaveBalance|Other Tenant/i, 'report must not expose sensitive HR or cross-tenant data');

  const audited = svc.generateStrategicDeliverablesIntelligenceReport({ tenantSlug: 'tabsons', correlationId: 'CORR-STRAT-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(audited.success, true);
  assert.ok(global.DB.getAuditLogs().some(row => /STRATEGIC_INTELLIGENCE|KPI_GOVERNANCE/.test(row.actionType || row.action || '')), 'strategic governance access should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /STRATEGIC_INTELLIGENCE|KPI_DEGRADATION|STRATEGIC_CONGESTION/.test(row.eventType)), 'strategic intelligence telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STRATEGIC_INTELLIGENCE_REPORTED, 'strategic intelligence metrics should aggregate safely');

  const originalReplay = global.EventReplayService;
  global.EventReplayService = null;
  const degraded = svc.generateStrategicDeliverablesIntelligenceReport({ tenantSlug: 'tabsons', correlationId: 'CORR-STRAT-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing replay dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'EVENT_REPLAY_UNAVAILABLE'));
  global.EventReplayService = originalReplay;

  const malformed = svc.generateStrategicDeliverablesIntelligenceReport('bad-input', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.severity, 'HIGH_RISK', 'malformed payloads should not silently pass strategic governance');
}

main();
