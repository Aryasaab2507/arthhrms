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

function seedIncidentData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.workflowEvents = [
    { eventId: 'WF-INC-1', correlationId: 'CORR-INC-1', type: 'WORKFLOW_FAILED_SAFE', status: 'FAILED', module: 'Workflow', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:10:00.000Z' },
    { eventId: 'WF-INC-2', correlationId: 'CORR-INC-1', type: 'DELIVERABLE_OVERDUE', status: 'OVERDUE', module: 'Strategic Deliverables', tenantSlug: 'tabsons', severity: 'HIGH', createdAt: '2026-05-22T01:30:00.000Z' },
    { eventId: 'WF-X', correlationId: 'CORR-X', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'abc', salary: 999999, employeeName: 'Other Tenant', createdAt: '2026-05-22T02:00:00.000Z' }
  ];
  data.operationIncidents = [
    { incidentId: 'INC-1', correlationId: 'CORR-INC-1', severity: 'CRITICAL', module: 'Workflow', title: 'Workflow failure cluster', status: 'Open', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:20:00.000Z' },
    { incidentId: 'INC-X', correlationId: 'CORR-X', severity: 'CRITICAL', module: 'Payroll', title: 'Other tenant incident', status: 'Open', tenantSlug: 'abc', createdAt: '2026-05-22T02:10:00.000Z', payrollAmount: 999999 }
  ];
  data.serviceErrorLogs = [
    { errorId: 'ERR-1', correlationId: 'CORR-INC-1', severity: 'HIGH', module: 'Auth', message: 'Invite activation failed', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:00:00.000Z' },
    { errorId: 'ERR-X', correlationId: 'CORR-X', severity: 'HIGH', module: 'Payroll', message: 'Other tenant payroll failed', tenantSlug: 'abc', createdAt: '2026-05-22T02:30:00.000Z', salary: 999999 }
  ];
  data.authInvites = [
    { inviteId: 'INV-1', correlationId: 'CORR-INC-1', email: 'new1@tabsons.test', role: 'employee', tenantSlug: 'tabsons', status: 'FAILED', createdAt: '2026-05-22T00:50:00.000Z' },
    { inviteId: 'INV-2', correlationId: 'CORR-INC-1', email: 'new2@tabsons.test', role: 'employee', tenantSlug: 'tabsons', status: 'EXPIRED', createdAt: '2026-05-22T00:55:00.000Z' }
  ];
  data.escalations = [
    { id: 'ESC-1', correlationId: 'CORR-INC-1', escalationType: 'SLA_BREACH', severity: 'HIGH', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:35:00.000Z' },
    { id: 'ESC-2', correlationId: 'CORR-INC-1', escalationType: 'REVIEW_BOTTLENECK', severity: 'HIGH', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:40:00.000Z' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-1', correlationId: 'CORR-INC-1', review_status: 'PENDING', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', tenantSlug: 'tabsons' }
  ];
  data.deploymentLogs = [
    { deploymentLogId: 'DEP-1', correlationId: 'CORR-INC-1', eventType: 'DEPLOYMENT_BLOCKED', status: 'BLOCKED', severity: 'HIGH', tenantSlug: 'tabsons', loggedAt: '2026-05-22T01:45:00.000Z' }
  ];
  data.sessionGovernance = {
    sessions: [
      { sessionId: 'SES-1', correlationId: 'CORR-INC-1', userId: 'USR-1', role: 'employee', tenantSlug: 'tabsons', state: 'SUSPICIOUS', riskLevel: 'HIGH', lastActivityAt: '2026-05-22T01:25:00.000Z', device: { browser: 'Chrome', os: 'Windows' } },
      { sessionId: 'SES-X', correlationId: 'CORR-X', userId: 'USR-X', role: 'employee', tenantSlug: 'abc', state: 'SUSPICIOUS', riskLevel: 'CRITICAL', lastActivityAt: '2026-05-22T02:20:00.000Z', device: { browser: 'Chrome', os: 'Windows' } }
    ]
  };
  global.DB.save(data);

  global.WorkflowTraceStore = {
    getTraceByEventId(eventId) {
      if (eventId !== 'WF-INC-1') return [];
      return [
        { eventId: 'WF-INC-1', correlationId: 'CORR-INC-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T01:05:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-INC-1', correlationId: 'CORR-INC-1', eventType: 'HANDLER_EXECUTION_FAILED', handler: 'notificationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T01:06:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    },
    getTraceByCorrelationId(correlationId) {
      if (correlationId !== 'CORR-INC-1') return [];
      return [
        { eventId: 'WF-INC-1', correlationId: 'CORR-INC-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T01:05:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-INC-1', correlationId: 'CORR-INC-1', eventType: 'HANDLER_EXECUTION_FAILED', handler: 'notificationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T01:06:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    }
  };

  global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', 'WORKFLOW_FAILED_SAFE', {
    correlationId: 'CORR-INC-1',
    eventId: 'WF-INC-1',
    severity: 'HIGH',
    metadata: { tenantSlug: 'tabsons', source: 'workflowEngine' }
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
    'services/platformGovernanceService.js',
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js',
    'services/sessionGovernanceService.js',
    'services/eventReplayService.js',
    'services/operationsMonitoringService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/incidentTimelineService.js');
  seedIncidentData();

  const svc = global.IncidentTimelineService;
  assert.ok(svc, 'IncidentTimelineService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.INCIDENT_STATES), 'incident states must be immutable');
  assert.equal(global.__ARTHHRMS_INCIDENT_TIMELINE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyIncidentSeverity({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant incidents classify as critical blockers');
  assert.equal(svc.classifyIncidentSeverity({ onboardingFailures: 2 }), 'HIGH_RISK', 'repeated onboarding breakdowns classify as high risk');
  assert.equal(svc.classifyIncidentSeverity({ replayTimeouts: 1 }), 'WARNING', 'replay timeout spikes classify as warning');

  const scope = svc.validateIncidentScope({ tenantSlug: 'abc', metadata: { salary: 123456 } }, { tenantSlug: 'tabsons' });
  assert.equal(scope.allowed, false, 'cross-tenant incident scope must be blocked');
  assert.ok(scope.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(scope), /123456|salary/i, 'scope failures must not expose sensitive fields');

  const timeline = svc.reconstructIncidentTimeline({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-INC-1',
    eventId: 'WF-INC-1'
  }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(timeline.success, true, 'incident reconstruction should work');
  assert.ok(timeline.timeline.length >= 9, 'timeline should include workflow, replay, telemetry, sessions, deployment, escalation, onboarding, and operational incidents');
  assert.deepEqual(timeline.timeline.map(row => row.timestamp).slice().sort(), timeline.timeline.map(row => row.timestamp), 'incident timeline should be sorted');
  assert.ok(timeline.timeline.some(row => row.source === 'replay'), 'replay-linked timeline rows should be present');
  assert.ok(timeline.timeline.some(row => row.source === 'deployment'), 'deployment incident rows should be present');
  assert.ok(Object.isFrozen(timeline.timeline), 'timeline output should be immutable');
  assert.doesNotMatch(JSON.stringify(timeline), /999999|payrollAmount|salary|Other Tenant/i, 'timeline must not expose sensitive or cross-tenant data');

  const correlated = svc.correlateRuntimeFailures({ correlationId: 'CORR-INC-1', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(correlated.success, true, 'failure correlation should work');
  assert.ok(correlated.chains.some(row => row.chainType === 'WORKFLOW_FAILURE'));
  assert.ok(correlated.chains.some(row => row.chainType === 'ONBOARDING_BREAKDOWN'));
  assert.ok(correlated.chains.some(row => row.chainType === 'ESCALATION_CONGESTION'));
  assert.ok(correlated.chains.some(row => row.chainType === 'SUSPICIOUS_ACCESS'));
  assert.ok(correlated.chains.some(row => row.chainType === 'REPLAY_LINKED'));

  const dataBefore = JSON.stringify(global.DB.get());
  const preview = svc.generateIncidentTimelineReport({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-INC-1',
    eventId: 'WF-INC-1',
    filters: { severity: 'HIGH_RISK' }
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(JSON.stringify(global.DB.get()), dataBefore, 'preview incident report must not mutate historical records');
  assert.equal(preview.success, true, 'incident timeline report should complete safely');
  assert.equal(preview.readOnly, true, 'incident timeline reports must be read-only');
  assert.ok(['HIGH_RISK', 'CRITICAL_BLOCKER'].includes(preview.severity), 'seeded incident should raise risk');
  assert.ok(preview.summary.timelineEvents >= timeline.timeline.length, 'report should include incident timeline');
  assert.ok(preview.summary.failureChains >= correlated.chains.length, 'report should include correlated failure chains');
  assert.ok(preview.replay.linked === true, 'report should expose replay-linked incident visibility');
  assert.ok(Object.isFrozen(preview), 'incident report must be immutable');
  assert.ok(Object.isFrozen(preview.timeline.timeline), 'nested timeline must be immutable');
  assert.doesNotMatch(JSON.stringify(preview), /999999|payrollAmount|salary|Other Tenant/i, 'report must not expose sensitive HR or cross-tenant data');

  const audited = svc.generateIncidentTimelineReport({ tenantSlug: 'tabsons', correlationId: 'CORR-INC-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(audited.success, true);
  assert.ok(global.DB.getAuditLogs().some(row => /INCIDENT_TIMELINE|INCIDENT_RESPONSE/.test(row.actionType || row.action || '')), 'incident timeline access should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /INCIDENT_TIMELINE|RUNTIME_FAILURE/.test(row.eventType)), 'incident timeline telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.INCIDENT_TIMELINE_REPORTED, 'incident timeline metrics should aggregate safely');

  const originalReplay = global.EventReplayService;
  global.EventReplayService = null;
  const degraded = svc.generateIncidentTimelineReport({ tenantSlug: 'tabsons', correlationId: 'CORR-INC-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing replay dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'EVENT_REPLAY_UNAVAILABLE'));
  global.EventReplayService = originalReplay;

  const malformed = svc.generateIncidentTimelineReport('bad-input', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.severity, 'HIGH_RISK', 'malformed payloads should not silently pass incident timeline checks');
}

main();
