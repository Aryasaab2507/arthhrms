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

function seedNotificationData() {
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
    { id: 'EMP-1', empId: 'EMP-1', name: 'Contributor One', role: 'EMPLOYEE', tenantSlug: 'tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', name: 'Manager One', role: 'MANAGER', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', name: 'Other Tenant Employee', role: 'EMPLOYEE', tenantSlug: 'abc', salary: 999999 }
  ];
  data.notifications = [
    {
      id: 'N-1',
      notificationId: 'N-1',
      tenantSlug: 'tabsons',
      toRole: 'MANAGER',
      toEmpId: '',
      title: 'Strategic Review Pending',
      message: 'Review delayed strategic deliverable.',
      module: 'Strategic Deliverables',
      channel: 'IN_APP',
      state: 'QUEUED',
      priority: 'HIGH',
      readBy: [],
      correlationId: 'CORR-N-1',
      createdAt: '2026-05-22T01:00:00.000Z'
    },
    {
      id: 'N-2',
      notificationId: 'N-2',
      tenantSlug: 'tabsons',
      toRole: 'HR',
      title: 'Onboarding Failure',
      message: 'Invite activation failed.',
      module: 'Onboarding',
      channel: 'EMAIL',
      state: 'FAILED',
      priority: 'HIGH',
      retryAttempts: 2,
      readBy: [],
      correlationId: 'CORR-N-2',
      createdAt: '2026-05-22T01:10:00.000Z'
    },
    {
      id: 'N-3',
      notificationId: 'N-3',
      tenantSlug: 'abc',
      toRole: 'HR',
      title: 'Payroll Exposure',
      message: 'Salary 999999 payrollAmount 999999',
      module: 'Payroll',
      channel: 'IN_APP',
      state: 'QUEUED',
      priority: 'CRITICAL',
      salary: 999999,
      payrollAmount: 999999,
      readBy: [],
      correlationId: 'CORR-X',
      createdAt: '2026-05-22T01:20:00.000Z'
    }
  ];
  data.workflowEvents = [
    { eventId: 'WF-N-1', correlationId: 'CORR-N-1', type: 'DELIVERABLE_OVERDUE', status: 'OVERDUE', module: 'Strategic Deliverables', tenantSlug: 'tabsons', createdAt: '2026-05-22T00:45:00.000Z' }
  ];
  data.escalations = [
    { escalationId: 'ESC-N-1', correlationId: 'CORR-N-1', severity: 'HIGH', status: 'ESCALATED', tenantSlug: 'tabsons', reviewerId: 'MGR-1', createdAt: '2026-05-22T00:50:00.000Z' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-N-1', deliverableId: 'DEL-N-1', correlationId: 'CORR-N-1', reviewerId: 'MGR-1', empId: 'EMP-1', review_status: 'PENDING_REVIEW', risk_level: 'HIGH', tenantSlug: 'tabsons' }
  ];
  global.DB.save(data);

  global.WorkflowTelemetryService.emitTelemetry('NOTIFICATION', 'SEEDED_NOTIFICATION_EVENT', {
    source: 'notification-test',
    correlationId: 'CORR-N-1',
    severity: 'WARNING',
    metadata: { tenantSlug: 'tabsons' }
  });
  global.OrchestrationMetricsService.recordNotificationMetric('SEEDED_NOTIFICATION_EVENT');
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
    'services/escalationPolicyService.js',
    'services/strategicReviewService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/notificationOrchestrationService.js');
  seedNotificationData();

  const svc = global.NotificationOrchestrationService;
  assert.ok(svc, 'NotificationOrchestrationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.NOTIFICATION_STATES), 'notification states must be immutable');
  assert.equal(global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyNotificationPriority({ crossTenant: true }), 'CRITICAL', 'cross-tenant anomaly alerts classify as critical');
  assert.equal(svc.classifyNotificationPriority({ type: 'delayed_strategic_review' }), 'HIGH', 'delayed strategic review classifies as high');
  assert.equal(svc.classifyDeliveryFailure({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant delivery classifies as critical blocker');
  assert.equal(svc.classifyDeliveryFailure({ retryAttempts: 4 }), 'HIGH_RISK', 'repeated failed retries classify as high risk');

  const scope = svc.validateNotificationScope({ tenantSlug: 'abc', metadata: { salary: 123456 }, toRole: 'HR' }, { tenantSlug: 'tabsons' });
  assert.equal(scope.allowed, false, 'cross-tenant notification scope must be blocked');
  assert.ok(scope.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(scope), /123456|salary/i, 'scope failures must not expose sensitive fields');

  const payload = {
    tenantSlug: 'tabsons',
    toRole: 'MANAGER',
    title: 'Delayed strategic review',
    message: 'Please review contributor update. salary=999999 payrollAmount=999999',
    module: 'Strategic Deliverables',
    type: 'delayed_strategic_review',
    metadata: { salary: 999999, payrollAmount: 999999, note: 'safe' },
    correlationId: 'CORR-N-1'
  };
  const before = JSON.stringify(payload);
  const normalized = svc.normalizeNotificationPayload(payload, { tenantSlug: 'tabsons' });
  assert.equal(JSON.stringify(payload), before, 'normalization must not mutate caller payload');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.priority, 'HIGH');
  assert.ok(Object.isFrozen(normalized), 'normalized notification payload must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|payrollAmount/i, 'normalized payload must redact sensitive payroll data');

  const created = svc.orchestrateNotification(payload, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(created.success, true, 'notification orchestration should queue safely');
  assert.equal(created.notification.state, 'QUEUED', 'orchestrated notifications should start queued');
  assert.equal(created.notification.tenantSlug, 'tabsons');
  assert.ok(created.deliveryPlan.futureAsyncReady, 'delivery plan should support future async queues');
  assert.ok(Object.isFrozen(created.notification), 'queued notification output must be immutable');
  assert.doesNotMatch(JSON.stringify(created), /999999|salary|payrollAmount/i, 'orchestrated notification must not leak sensitive data');

  const dataAfterCreate = global.DB.get();
  assert.ok(dataAfterCreate.notifications.some(row => row.notificationId === created.notification.notificationId || row.id === created.notification.notificationId), 'queued notification should be persisted compatibly');

  const retry = svc.scheduleNotificationRetry(created.notification, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    maxRetries: 3
  });
  assert.equal(retry.success, true, 'retry scheduling should work');
  assert.equal(retry.notification.state, 'RETRY_PENDING');
  assert.ok(retry.notification.retryAttempts <= 3, 'retry attempts must remain bounded');

  const spam = svc.detectNotificationSpamLoops([
    { tenantSlug: 'tabsons', toRole: 'MANAGER', title: 'Same', message: 'Repeat', module: 'Workflow', correlationId: 'CORR-SPAM' },
    { tenantSlug: 'tabsons', toRole: 'MANAGER', title: 'Same', message: 'Repeat', module: 'Workflow', correlationId: 'CORR-SPAM' },
    { tenantSlug: 'tabsons', toRole: 'MANAGER', title: 'Same', message: 'Repeat', module: 'Workflow', correlationId: 'CORR-SPAM' },
    { tenantSlug: 'tabsons', toRole: 'MANAGER', title: 'Same', message: 'Repeat', module: 'Workflow', correlationId: 'CORR-SPAM' }
  ], { tenantSlug: 'tabsons', threshold: 3 });
  assert.equal(spam.spamLoopDetected, true, 'spam loop detection should flag repeated notifications');
  assert.ok(Object.isFrozen(spam.duplicates), 'spam loop output must be immutable');

  const center = svc.getInAppNotificationCenter({ tenantSlug: 'tabsons', role: 'MANAGER', empId: 'MGR-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(center.success, true, 'in-app notification center should render safely');
  assert.ok(center.unreadCount >= 1, 'unread notifications should be visible');
  assert.ok(center.grouped.some(group => group.groupKey === 'Strategic Deliverables'), 'strategic notifications should be grouped');
  assert.ok(Object.isFrozen(center.notifications), 'in-app notification outputs must be immutable');
  assert.doesNotMatch(JSON.stringify(center), /999999|salary|Payroll Exposure|Other Tenant/i, 'in-app center must remain tenant-scoped and redacted');

  const report = svc.generateNotificationGovernanceReport({ tenantSlug: 'tabsons', correlationId: 'CORR-N-1' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(report.success, true, 'notification governance report should complete');
  assert.equal(report.readOnly, true, 'governance report should be read-only by default');
  assert.ok(report.deliveryHealth.totalNotifications >= 3, 'delivery health should include tenant notifications');
  assert.ok(report.deliveryHealth.failedDeliveries >= 1, 'failed delivery count should be visible');
  assert.ok(report.retryQueue.retryPending >= 1, 'retry queue visibility should include scheduled retry');
  assert.ok(report.escalationAlerts.alertDensity >= 1, 'escalation alert density should be visible');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|payrollAmount|Payroll Exposure/i, 'governance report must filter sensitive and cross-tenant data');

  const ack = svc.acknowledgeNotification(created.notification.notificationId, { actor: { role: 'platform_owner', id: 'PO-1' }, tenantSlug: 'tabsons' });
  assert.equal(ack.success, true, 'acknowledgement should work');
  assert.equal(ack.notification.state, 'ACKNOWLEDGED', 'acknowledgement should mark notification state');

  assert.ok(global.DB.getAuditLogs().some(row => /NOTIFICATION_/.test(row.actionType || row.action || '')), 'notification orchestration actions should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /NOTIFICATION_/.test(row.eventType)), 'notification orchestration telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().notifications.NOTIFICATION_ORCHESTRATED, 'notification metrics should aggregate safely');

  const previousDelivery = global.notificationService;
  global.notificationService = null;
  const degraded = svc.generateNotificationGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing notification dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'NOTIFICATION_DELIVERY_UNAVAILABLE'));
  global.notificationService = previousDelivery;

  const malformed = svc.orchestrateNotification('bad-payload', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, false, 'malformed payloads should be blocked safely');
  assert.equal(malformed.classification, 'HIGH_RISK', 'malformed payloads should not silently pass notification governance');
}

main();
