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
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', correlationId: 'CORR-ESC-1', eventId: 'WF-ESC-1', escalationType: 'SLA_BREACH', severity: 'HIGH', status: 'ESCALATED', reviewerId: 'MGR-1', contributorId: 'EMP-1', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', correlationId: 'CORR-ESC-1', eventId: 'WF-ESC-2', escalationType: 'REVIEW_BOTTLENECK', severity: 'HIGH', status: 'PENDING_REVIEW', reviewerId: 'MGR-1', contributorId: 'EMP-2', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:10:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', correlationId: 'CORR-X', eventId: 'WF-X', escalationType: 'PAYROLL_RISK', severity: 'CRITICAL', status: 'ESCALATED', tenantSlug: 'abc', salary: 999999, employeeName: 'Other Tenant', createdAt: '2026-05-22T01:20:00.000Z' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-ESC-1', correlationId: 'CORR-ESC-1', type: 'WORKFLOW_RETRY', status: 'FAILED', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T00:45:00.000Z' },
    { eventId: 'WF-ESC-2', correlationId: 'CORR-ESC-1', type: 'DELIVERABLE_OVERDUE', status: 'OVERDUE', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T00:50:00.000Z' },
    { eventId: 'WF-X', correlationId: 'CORR-X', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'abc', payrollAmount: 999999, createdAt: '2026-05-22T02:00:00.000Z' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-1', deliverableId: 'DEL-1', correlationId: 'CORR-ESC-1', reviewerId: 'MGR-1', empId: 'EMP-1', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', escalation_state: 'ESCALATED', tenantSlug: 'tabsons' },
    { reviewId: 'REV-2', deliverableId: 'DEL-2', correlationId: 'CORR-ESC-1', reviewerId: 'MGR-1', empId: 'EMP-2', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-11T00:00:00.000Z', risk_level: 'MEDIUM', escalation_state: 'UNDER_REVIEW', tenantSlug: 'tabsons' },
    { reviewId: 'REV-X', deliverableId: 'DEL-X', correlationId: 'CORR-X', reviewerId: 'MGR-X', empId: 'EMP-X', reviewerAction: 'CONTRIBUTOR_UPDATE', review_status: 'PENDING_REVIEW', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', tenantSlug: 'abc', salary: 999999 }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-1', deliverableId: 'DEL-1', empId: 'EMP-1', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Delayed KPI', deadlineDate: '2026-05-01', currentStatus: 'Open', progressPercent: 40, tenantSlug: 'tabsons' },
    { id: 'DEL-2', deliverableId: 'DEL-2', empId: 'EMP-2', reviewerId: 'MGR-1', strategicOwnerId: 'MGR-1', deliverableTitle: 'Blocked Rollout', deadlineDate: '2026-05-03', currentStatus: 'At Risk', progressPercent: 20, tenantSlug: 'tabsons' }
  ];
  data.pendingActions = [
    { id: 'PA-1', correlationId: 'CORR-ESC-1', actionType: 'STRATEGIC_REVIEW', title: 'Review delayed deliverable', status: 'PENDING', reviewerId: 'MGR-1', tenantSlug: 'tabsons', dueAt: '2026-05-12T00:00:00.000Z' },
    { id: 'PA-2', correlationId: 'CORR-ESC-1', actionType: 'CONTRIBUTOR_BLOCKED', title: 'Contributor waiting for dependency', status: 'BLOCKED', contributorId: 'EMP-2', tenantSlug: 'tabsons', dueAt: '2026-05-12T00:00:00.000Z' }
  ];
  data.authInvites = [
    { inviteId: 'INV-1', correlationId: 'CORR-ESC-1', status: 'FAILED', role: 'employee', tenantSlug: 'tabsons', createdAt: '2026-05-22T00:00:00.000Z' }
  ];
  global.DB.save(data);

  global.WorkflowTraceStore = {
    getTraceByEventId(eventId) {
      if (eventId !== 'WF-ESC-1') return [];
      return [
        { eventId: 'WF-ESC-1', correlationId: 'CORR-ESC-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T00:40:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-ESC-1', correlationId: 'CORR-ESC-1', eventType: 'ESCALATION_HANDLER_FAILED', handler: 'escalationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T00:42:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    },
    getTraceByCorrelationId(correlationId) {
      if (correlationId !== 'CORR-ESC-1') return [];
      return [
        { eventId: 'WF-ESC-1', correlationId: 'CORR-ESC-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T00:40:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-ESC-1', correlationId: 'CORR-ESC-1', eventType: 'ESCALATION_HANDLER_FAILED', handler: 'escalationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T00:42:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    }
  };

  global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', 'ESCALATION_SPIKE', {
    correlationId: 'CORR-ESC-1',
    eventId: 'WF-ESC-1',
    severity: 'HIGH',
    metadata: { tenantSlug: 'tabsons', escalationType: 'SLA_BREACH' }
  });
  global.OrchestrationMetricsService.recordEscalationMetric('SLA_BREACH', 'HIGH');
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
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js',
    'services/escalationPolicyService.js',
    'services/strategicReviewService.js',
    'services/eventReplayService.js',
    'services/operationsMonitoringService.js',
    'services/incidentTimelineService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/escalationCommandService.js');
  seedEscalationData();

  const svc = global.EscalationCommandService;
  assert.ok(svc, 'EscalationCommandService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ESCALATION_STATES), 'escalation states must be immutable');
  assert.equal(global.__ARTHHRMS_ESCALATION_COMMAND_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyEscalationSeverity({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant escalation visibility classifies as critical blocker');
  assert.equal(svc.classifyEscalationSeverity({ approvalDeadlocks: 2 }), 'HIGH_RISK', 'approval deadlocks classify as high risk');
  assert.equal(svc.classifyEscalationSeverity({ reviewerQueue: 4 }), 'WARNING', 'reviewer congestion classifies as warning');

  const scope = svc.validateEscalationScope({ tenantSlug: 'abc', metadata: { salary: 123456 } }, { tenantSlug: 'tabsons' });
  assert.equal(scope.allowed, false, 'cross-tenant escalation scope must be blocked');
  assert.ok(scope.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(scope), /123456|salary/i, 'scope failures must not expose sensitive fields');

  const bottlenecks = svc.detectWorkflowBottlenecks({ tenantSlug: 'tabsons', correlationId: 'CORR-ESC-1' }, { tenantSlug: 'tabsons' });
  assert.equal(bottlenecks.success, true, 'workflow bottleneck detection should work');
  assert.ok(bottlenecks.summary.delayedApprovals >= 2, 'delayed approval queue should be detected');
  assert.ok(bottlenecks.summary.reviewerCongestion >= 1, 'reviewer congestion should be detected');
  assert.ok(bottlenecks.summary.contributorBlockage >= 1, 'contributor blockage should be detected');
  assert.ok(Object.isFrozen(bottlenecks.bottlenecks), 'bottleneck output must be immutable');
  assert.doesNotMatch(JSON.stringify(bottlenecks), /999999|salary|Other Tenant/i, 'bottlenecks must not expose sensitive or cross-tenant data');

  const chains = svc.correlateEscalationChains({ tenantSlug: 'tabsons', correlationId: 'CORR-ESC-1', eventId: 'WF-ESC-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(chains.success, true, 'escalation correlation should work');
  assert.ok(chains.chains.some(row => row.chainType === 'ESCALATION_SPIKE'));
  assert.ok(chains.chains.some(row => row.chainType === 'WORKFLOW_BOTTLENECK'));
  assert.ok(chains.chains.some(row => row.chainType === 'REPLAY_ESCALATION'));
  assert.ok(chains.chains.some(row => row.chainType === 'CONTRIBUTOR_BLOCKAGE'));

  const dataBefore = JSON.stringify(global.DB.get());
  const preview = svc.generateEscalationCommandReport({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-ESC-1',
    eventId: 'WF-ESC-1',
    filters: { severity: 'HIGH_RISK' }
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(JSON.stringify(global.DB.get()), dataBefore, 'preview report must not mutate historical escalation chains');
  assert.equal(preview.success, true, 'escalation command report should complete safely');
  assert.equal(preview.readOnly, true, 'escalation monitoring should be read-only by default');
  assert.ok(['HIGH_RISK', 'CRITICAL_BLOCKER'].includes(preview.severity), 'seeded escalation congestion should raise risk');
  assert.ok(preview.summary.escalationDensity >= 2, 'escalation density should be visible');
  assert.ok(preview.summary.reviewerCongestion >= 1, 'reviewer congestion summary should be visible');
  assert.ok(preview.summary.contributorBlockage >= 1, 'contributor blockage summary should be visible');
  assert.ok(preview.replay.linked === true, 'replay-linked escalation visibility should be exposed');
  assert.ok(Object.isFrozen(preview), 'report must be immutable');
  assert.ok(Object.isFrozen(preview.chains.chains), 'nested escalation chains must be immutable');
  assert.doesNotMatch(JSON.stringify(preview), /999999|payrollAmount|salary|Other Tenant/i, 'report must not expose sensitive HR or cross-tenant data');

  const action = svc.recordEscalationAction('ACKNOWLEDGE_ESCALATION', { tenantSlug: 'tabsons', escalationId: 'ESC-1', correlationId: 'CORR-ESC-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(action.success, true, 'escalation action should return auditable result');
  assert.equal(action.historicalChainsMutated, false, 'escalation action must not mutate historical chains');
  assert.ok(global.DB.getAuditLogs().some(row => /ESCALATION_ACKNOWLEDGED|ESCALATION_COMMAND/.test(row.actionType || row.action || '')), 'escalation actions should be audited safely');

  const audited = svc.generateEscalationCommandReport({ tenantSlug: 'tabsons', correlationId: 'CORR-ESC-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(audited.success, true);
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ESCALATION_COMMAND|ESCALATION_CONGESTION/.test(row.eventType)), 'escalation command telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ESCALATION_COMMAND_REPORTED, 'escalation command metrics should aggregate safely');

  const originalReplay = global.EventReplayService;
  global.EventReplayService = null;
  const degraded = svc.generateEscalationCommandReport({ tenantSlug: 'tabsons', correlationId: 'CORR-ESC-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing replay dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'EVENT_REPLAY_UNAVAILABLE'));
  global.EventReplayService = originalReplay;

  const malformed = svc.generateEscalationCommandReport('bad-input', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.severity, 'HIGH_RISK', 'malformed payloads should not silently pass escalation governance');
}

main();
