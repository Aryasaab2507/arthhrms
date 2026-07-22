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

function seedInvestigationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.auditLogs = [
    {
      id: 'AL1002',
      auditId: 'AUD-1002',
      date: '2026-05-22T03:00:00.000Z',
      eventId: 'WF-INV-1',
      correlationId: 'CORR-INV-1',
      actorRole: 'manager',
      actorId: 'MGR-1',
      actionType: 'APPROVE_PROGRESS',
      module: 'Strategic Deliverables',
      targetId: 'DEL-1',
      description: 'Reviewer approved progress',
      tenantSlug: 'tabsons',
      severity: 'INFO',
      metadata: { tenantSlug: 'tabsons', safe: true }
    },
    {
      id: 'AL1001',
      auditId: 'AUD-1001',
      date: '2026-05-22T02:00:00.000Z',
      eventId: 'WF-INV-1',
      correlationId: 'CORR-INV-1',
      actorRole: 'employee',
      actorId: 'EMP-1',
      actionType: 'CONTRIBUTOR_UPDATE',
      module: 'Strategic Deliverables',
      targetId: 'DEL-1',
      description: 'Contributor update submitted',
      tenantSlug: 'tabsons',
      severity: 'INFO',
      metadata: { tenantSlug: 'tabsons', salary: 123456, leaveBalance: 22 }
    },
    {
      id: 'AL-X',
      auditId: 'AUD-X',
      date: '2026-05-22T02:30:00.000Z',
      eventId: 'WF-X',
      correlationId: 'CORR-X',
      actorRole: 'hr',
      actorId: 'HR-X',
      actionType: 'PAYROLL_VIEW',
      module: 'Payroll',
      targetId: 'PAY-X',
      description: 'Other tenant payroll audit',
      tenantSlug: 'abc',
      severity: 'CRITICAL',
      metadata: { tenantSlug: 'abc', payrollAmount: 999999, employeeName: 'Other Tenant' }
    }
  ];
  data.workflowEvents = [
    { eventId: 'WF-INV-1', correlationId: 'CORR-INV-1', type: 'DELIVERABLE_REVIEWED', status: 'COMPLETED', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T02:45:00.000Z' },
    { eventId: 'WF-INV-2', correlationId: 'CORR-INV-1', type: 'DELIVERABLE_OVERDUE', status: 'OVERDUE', module: 'Strategic Deliverables', tenantSlug: 'tabsons', severity: 'HIGH', createdAt: '2026-05-22T03:30:00.000Z' },
    { eventId: 'WF-X', correlationId: 'CORR-X', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'abc', salary: 999999, createdAt: '2026-05-22T04:00:00.000Z' }
  ];
  data.escalations = [
    { id: 'ESC-1', correlationId: 'CORR-INV-1', escalationType: 'SLA_BREACH', severity: 'HIGH', tenantSlug: 'tabsons', createdAt: '2026-05-22T03:40:00.000Z' }
  ];
  data.authInvites = [
    { inviteId: 'INV-1', correlationId: 'CORR-INV-1', email: 'new@tabsons.test', status: 'FAILED', role: 'employee', tenantSlug: 'tabsons', createdAt: '2026-05-22T01:00:00.000Z' }
  ];
  data.sessionGovernance = {
    sessions: [
      { sessionId: 'SES-1', correlationId: 'CORR-INV-1', userId: 'EMP-1', role: 'employee', tenantSlug: 'tabsons', state: 'SUSPICIOUS', riskLevel: 'HIGH', lastActivityAt: '2026-05-22T03:10:00.000Z', device: { browser: 'Chrome', os: 'Windows' } },
      { sessionId: 'SES-X', userId: 'EMP-X', role: 'employee', tenantSlug: 'abc', state: 'SUSPICIOUS', riskLevel: 'CRITICAL', lastActivityAt: '2026-05-22T03:20:00.000Z', device: { browser: 'Chrome', os: 'Windows' } }
    ]
  };
  global.DB.save(data);

  global.WorkflowTraceStore = {
    getTraceByEventId(eventId) {
      if (eventId !== 'WF-INV-1') return [];
      return [
        { eventId: 'WF-INV-1', correlationId: 'CORR-INV-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T02:40:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-INV-1', correlationId: 'CORR-INV-1', eventType: 'HANDLER_EXECUTION_FAILED', handler: 'notificationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T02:41:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    },
    getTraceByCorrelationId(correlationId) {
      if (correlationId !== 'CORR-INV-1') return [];
      return [
        { eventId: 'WF-INV-1', correlationId: 'CORR-INV-1', eventType: 'WORKFLOW_RECEIVED', handler: 'workflowEngine', status: 'RECEIVED', severity: 'INFO', timestamp: '2026-05-22T02:40:00.000Z', metadata: { tenantSlug: 'tabsons' } },
        { eventId: 'WF-INV-1', correlationId: 'CORR-INV-1', eventType: 'HANDLER_EXECUTION_FAILED', handler: 'notificationHandler', status: 'FAILED', severity: 'HIGH', timestamp: '2026-05-22T02:41:00.000Z', metadata: { tenantSlug: 'tabsons' } }
      ];
    }
  };

  global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', 'RBAC_PERMISSION_VIOLATION', {
    correlationId: 'CORR-INV-1',
    eventId: 'WF-INV-1',
    severity: 'HIGH',
    metadata: { tenantSlug: 'tabsons', violation: true }
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
    'services/eventReplayService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/auditInvestigationService.js');
  seedInvestigationData();

  const svc = global.AuditInvestigationService;
  assert.ok(svc, 'AuditInvestigationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.INVESTIGATION_STATES), 'investigation states must be immutable');
  assert.equal(global.__ARTHHRMS_AUDIT_INVESTIGATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyInvestigationSeverity({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant events classify as critical blockers');
  assert.equal(svc.classifyInvestigationSeverity({ failedOnboarding: 3 }), 'HIGH_RISK', 'repeated onboarding failures classify as high risk');
  assert.equal(svc.classifyInvestigationSeverity({ suspiciousSessions: 1 }), 'WARNING', 'suspicious session spike classifies as warning');

  const scope = svc.validateInvestigationScope({ tenantSlug: 'abc', metadata: { salary: 123456 } }, { tenantSlug: 'tabsons' });
  assert.equal(scope.allowed, false, 'cross-tenant forensic scope must be blocked');
  assert.ok(scope.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(scope), /123456|salary/i, 'scope failures must not expose sensitive fields');

  const timeline = svc.reconstructForensicTimeline({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-INV-1',
    eventId: 'WF-INV-1'
  }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(timeline.success, true, 'forensic reconstruction should work');
  assert.ok(timeline.timeline.length >= 6, 'timeline should include audit, workflow, replay, session, escalation, and onboarding events');
  assert.deepEqual(timeline.timeline.map(row => row.timestamp).slice().sort(), timeline.timeline.map(row => row.timestamp), 'timeline should be sorted');
  assert.ok(timeline.timeline.some(row => row.source === 'replay'), 'replay timeline rows should be linked');
  assert.ok(Object.isFrozen(timeline.timeline), 'timeline output should be immutable');
  assert.doesNotMatch(JSON.stringify(timeline), /999999|123456|payrollAmount|leaveBalance|salary|Other Tenant/i, 'timeline must not expose sensitive or cross-tenant data');

  const correlated = svc.correlateInvestigationEvents({ correlationId: 'CORR-INV-1', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(correlated.success, true, 'event correlation should work');
  assert.ok(correlated.trails.some(row => row.trailType === 'RBAC_VIOLATION'));
  assert.ok(correlated.trails.some(row => row.trailType === 'SUSPICIOUS_ACCESS'));
  assert.ok(correlated.trails.some(row => row.trailType === 'REPLAY_TRACE'));

  const dataBefore = JSON.stringify(global.DB.get());
  const preview = svc.generateAuditInvestigationReport({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-INV-1',
    eventId: 'WF-INV-1',
    filters: { severity: 'HIGH_RISK' }
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(JSON.stringify(global.DB.get()), dataBefore, 'preview investigation must not mutate historical records');
  assert.equal(preview.success, true, 'audit investigation report should complete safely');
  assert.equal(preview.readOnly, true, 'investigation reports must be read-only');
  assert.ok(preview.timeline.timeline.length >= timeline.timeline.length, 'report should include forensic timeline');
  assert.ok(preview.correlations.trails.length >= correlated.trails.length, 'report should include correlated trails');
  assert.ok(preview.replay.linked === true, 'report should expose replay-linked investigation visibility');
  assert.ok(Object.isFrozen(preview), 'investigation report must be immutable');
  assert.ok(Object.isFrozen(preview.timeline.timeline), 'nested timeline must be immutable');
  assert.doesNotMatch(JSON.stringify(preview), /999999|123456|payrollAmount|leaveBalance|salary|Other Tenant/i, 'report must not expose sensitive HR or cross-tenant data');

  const audited = svc.generateAuditInvestigationReport({ tenantSlug: 'tabsons', correlationId: 'CORR-INV-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(audited.success, true);
  assert.ok(global.DB.getAuditLogs().some(row => /AUDIT_INVESTIGATION|FORENSIC_ACCESS/.test(row.actionType || row.action || '')), 'investigation access should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /AUDIT_INVESTIGATION|FORENSIC/.test(row.eventType)), 'investigation telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.AUDIT_INVESTIGATION_REPORTED, 'investigation metrics should aggregate safely');

  const originalReplay = global.EventReplayService;
  global.EventReplayService = null;
  const degraded = svc.generateAuditInvestigationReport({ tenantSlug: 'tabsons', correlationId: 'CORR-INV-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing replay dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'EVENT_REPLAY_UNAVAILABLE'));
  global.EventReplayService = originalReplay;

  const malformed = svc.generateAuditInvestigationReport('bad-input', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.severity, 'HIGH_RISK', 'malformed payloads should not silently pass investigation');
}

main();
