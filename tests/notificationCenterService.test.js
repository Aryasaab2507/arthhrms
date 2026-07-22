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

function seedNotificationCenterData() {
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
    { id: 'HR-1', empId: 'HR-1', name: 'HR One', role: 'HR', tenantSlug: 'tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', name: 'Director One', role: 'DIRECTOR', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', name: 'Other Tenant Employee', role: 'EMPLOYEE', tenantSlug: 'abc', salary: 999999, leaveBalance: 42 }
  ];
  data.notifications = [
    {
      id: 'N-CRIT',
      notificationId: 'N-CRIT',
      tenantSlug: 'tabsons',
      toRole: 'HR',
      title: 'Security Incident',
      message: 'Critical runtime incident requires acknowledgement.',
      module: 'Incident Response',
      category: 'incident',
      channel: 'IN_APP',
      state: 'DELIVERED',
      priority: 'CRITICAL',
      readBy: [],
      correlationId: 'CORR-CENTER-1',
      createdAt: '2026-06-05T01:00:00.000Z',
      deliveredAt: '2026-06-05T01:01:00.000Z',
      dedupeKey: 'incident:tabsons:1'
    },
    {
      id: 'N-MGR',
      notificationId: 'N-MGR',
      tenantSlug: 'tabsons',
      toRole: 'MANAGER',
      targetRole: 'MANAGER',
      title: 'Approval Waiting',
      message: 'Managed workflow approval is waiting.',
      module: 'Workflow Approval',
      category: 'approval',
      channel: 'IN_APP',
      state: 'CREATED',
      priority: 'HIGH',
      readBy: [],
      correlationId: 'CORR-CENTER-2',
      createdAt: '2026-06-05T01:05:00.000Z'
    },
    {
      id: 'N-EMP',
      notificationId: 'N-EMP',
      tenantSlug: 'tabsons',
      toEmpId: 'EMP-1',
      title: 'Leave Request Viewed',
      message: 'Your leave request is now visible in the workflow.',
      module: 'Leave',
      category: 'leave',
      channel: 'IN_APP',
      state: 'VIEWED',
      priority: 'NORMAL',
      readBy: ['EMP-1'],
      correlationId: 'CORR-CENTER-3',
      createdAt: '2026-06-05T01:10:00.000Z',
      viewedAt: '2026-06-05T01:11:00.000Z'
    },
    {
      id: 'N-STRAT',
      notificationId: 'N-STRAT',
      tenantSlug: 'tabsons',
      toRole: 'DIRECTOR',
      title: 'Strategic Scorecard Drift',
      message: 'Executive KPI review has degraded trend indicators.',
      module: 'Strategic KPI',
      category: 'strategic',
      channel: 'IN_APP',
      state: 'DELIVERED',
      priority: 'HIGH',
      readBy: [],
      correlationId: 'CORR-CENTER-4',
      createdAt: '2026-06-05T01:12:00.000Z'
    },
    {
      id: 'N-ACK',
      notificationId: 'N-ACK',
      tenantSlug: 'tabsons',
      toRole: 'HR',
      title: 'HR Policy Acknowledged',
      message: 'Policy update was acknowledged.',
      module: 'HR Governance',
      category: 'hr',
      channel: 'EMAIL',
      state: 'ACKNOWLEDGED',
      priority: 'NORMAL',
      acknowledgedBy: 'HR-1',
      acknowledgedAt: '2026-06-05T01:13:00.000Z',
      correlationId: 'CORR-CENTER-5',
      createdAt: '2026-06-05T01:13:00.000Z'
    },
    {
      id: 'N-ARCH',
      notificationId: 'N-ARCH',
      tenantSlug: 'tabsons',
      toRole: 'HR',
      title: 'Archived Governance Notice',
      message: 'Archived safely.',
      module: 'System',
      category: 'system',
      channel: 'IN_APP',
      state: 'ARCHIVED',
      priority: 'LOW',
      correlationId: 'CORR-CENTER-6',
      createdAt: '2026-06-05T01:14:00.000Z'
    },
    {
      id: 'N-X',
      notificationId: 'N-X',
      tenantSlug: 'abc',
      toRole: 'HR',
      title: 'Payroll Exposure',
      message: 'Salary 999999 payrollAmount 999999 leave balance 42',
      module: 'Payroll',
      category: 'payroll',
      channel: 'IN_APP',
      state: 'DELIVERED',
      priority: 'CRITICAL',
      salary: 999999,
      leaveBalance: 42,
      correlationId: 'CORR-X',
      createdAt: '2026-06-05T01:15:00.000Z'
    }
  ];
  data.notificationDeliveryLogs = [
    { logId: 'DL-1', notificationId: 'N-CRIT', tenantSlug: 'tabsons', state: 'DELIVERED', timestamp: '2026-06-05T01:01:00.000Z' },
    { logId: 'DL-2', notificationId: 'N-EMP', tenantSlug: 'tabsons', state: 'VIEWED', timestamp: '2026-06-05T01:11:00.000Z' }
  ];
  data.notificationAcknowledgementRecords = [
    { acknowledgementId: 'ACK-1', notificationId: 'N-ACK', tenantSlug: 'tabsons', actorId: 'HR-1', timestamp: '2026-06-05T01:13:00.000Z' }
  ];
  global.DB.save(data);
}

function loadRuntime() {
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
    'services/notificationOrchestrationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/notificationCenterService.js');
  seedNotificationCenterData();
}

function main() {
  loadRuntime();
  const svc = global.NotificationCenterService;
  assert.ok(svc, 'NotificationCenterService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.NOTIFICATION_STATES), 'notification states must be immutable');
  assert.deepEqual(Object.values(svc.NOTIFICATION_STATES), ['CREATED', 'DELIVERED', 'VIEWED', 'ACKNOWLEDGED', 'DISMISSED', 'EXPIRED', 'ARCHIVED']);
  assert.deepEqual(Object.values(svc.PRIORITIES), ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
  assert.equal(global.__ARTHHRMS_NOTIFICATION_CENTER_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.calculateNotificationPriority({ category: 'incident', title: 'Critical security alert' }), 'CRITICAL', 'critical incidents must sort first');
  assert.equal(svc.calculateNotificationPriority({ category: 'approval', type: 'approval_waiting' }), 'HIGH', 'approval blockers should classify high');
  assert.equal(svc.calculateNotificationPriority({ category: 'hr', title: 'FYI' }), 'NORMAL', 'ordinary HR notices should default to normal');

  const malformed = svc.normalizeNotificationPayload('bad-payload', { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payloads should be rejected safely');
  assert.ok(Object.isFrozen(malformed), 'malformed result should still be immutable');

  const payload = {
    tenantSlug: 'tabsons',
    toRole: 'HR',
    title: 'Runtime incident acknowledgement',
    message: 'Security incident requires acknowledgement. salary=999999 leave balance 42',
    module: 'Incident Response',
    category: 'incident',
    dedupeKey: 'center:create:1',
    metadata: { salary: 999999, leaveBalance: 42, safe: 'kept' },
    correlationId: 'CORR-CENTER-CREATE'
  };
  const before = JSON.stringify(payload);
  const normalized = svc.normalizeNotificationPayload(payload, { tenantSlug: 'tabsons' });
  assert.equal(JSON.stringify(payload), before, 'normalization must not mutate caller payload');
  assert.equal(normalized.success, true, 'valid payload should normalize');
  assert.equal(normalized.notification.state, 'CREATED');
  assert.equal(normalized.notification.priority, 'CRITICAL');
  assert.ok(Object.isFrozen(normalized.notification), 'normalized notification output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|leave balance/i, 'normalized payload must filter confidential values');

  const created = svc.createNotification(payload, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(created.success, true, 'notification creation should work');
  assert.equal(created.notification.state, 'CREATED');
  assert.equal(created.notification.tenantSlug, 'tabsons');
  assert.ok(Object.isFrozen(created.notification), 'created notification output must be immutable');

  const duplicate = svc.createNotification(payload, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(duplicate.success, true, 'duplicate creation should degrade safely');
  assert.equal(duplicate.duplicatePrevented, true, 'duplicate delivery must be prevented');
  const duplicateRows = global.DB.get().notifications.filter(row => row.dedupeKey === 'center:create:1');
  assert.equal(duplicateRows.length, 1, 'duplicate notification should not be delivered twice');

  const employeeCenter = svc.generateNotificationCenterReport({ tenantSlug: 'tabsons', role: 'EMPLOYEE', empId: 'EMP-1' }, {
    actor: { role: 'employee', id: 'EMP-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(employeeCenter.success, true, 'employee notification center should render');
  assert.ok(employeeCenter.sections.recentNotifications.some(row => row.notificationId === 'N-EMP'), 'employee should see personal notification');
  assert.ok(!employeeCenter.sections.recentNotifications.some(row => row.notificationId === 'N-MGR'), 'employee should not see manager workflow notifications');
  assert.doesNotMatch(JSON.stringify(employeeCenter), /Payroll Exposure|999999|salary|leave balance|Other Tenant/i, 'employee center must not leak cross-tenant or confidential data');

  const managerCenter = svc.generateNotificationCenterReport({ tenantSlug: 'tabsons', role: 'MANAGER', empId: 'MGR-1' }, {
    actor: { role: 'manager', id: 'MGR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(managerCenter.success, true, 'manager notification center should render');
  assert.ok(managerCenter.sections.unreadNotifications.some(row => row.notificationId === 'N-MGR'), 'manager should see managed workflow notification');
  assert.ok(!managerCenter.sections.recentNotifications.some(row => row.notificationId === 'N-STRAT'), 'manager should not see director strategic notification by default');

  const hrCenter = svc.generateNotificationCenterReport({ tenantSlug: 'tabsons', role: 'HR', empId: 'HR-1' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(hrCenter.success, true, 'HR notification center should render');
  assert.ok(hrCenter.sections.priorityNotifications[0].priority === 'CRITICAL', 'critical notifications should appear first');
  assert.ok(hrCenter.sections.acknowledgedNotifications.some(row => row.notificationId === 'N-ACK'), 'acknowledged section should include acknowledged notices');
  assert.ok(hrCenter.sections.archivedNotifications.some(row => row.notificationId === 'N-ARCH'), 'archived section should include archived notices');
  assert.ok(hrCenter.analytics.unreadCount >= 1, 'unread counts should be tracked');
  assert.ok(hrCenter.deliveryTracking.deliveryRate >= 0, 'delivery rate should be calculated');
  assert.ok(hrCenter.acknowledgement.acknowledgementRate >= 0, 'acknowledgement rate should be calculated');
  assert.ok(hrCenter.engagement.engagementRate >= 0, 'engagement rate should be calculated');
  assert.ok(Object.isFrozen(hrCenter.sections.priorityNotifications), 'section outputs must be immutable');
  assert.doesNotMatch(JSON.stringify(hrCenter), /Payroll Exposure|999999|salary|leave balance|Other Tenant/i, 'HR center must remain tenant-scoped and redacted');

  const ack = svc.acknowledgeNotification('N-CRIT', {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(ack.success, true, 'acknowledgement should work');
  assert.equal(ack.notification.state, 'ACKNOWLEDGED', 'acknowledgement should mark notification state');
  assert.ok(global.DB.get().notificationAcknowledgementRecords.some(row => row.notificationId === 'N-CRIT'), 'acknowledgement history should be preserved');
  assert.ok(Object.isFrozen(ack.notification), 'acknowledgement output must be immutable');

  const bulk = svc.bulkNotificationAction('DISMISS', ['N-MGR'], {
    actor: { role: 'manager', id: 'MGR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(bulk.success, true, 'bulk dismiss should work');
  assert.equal(bulk.results[0].notification.state, 'DISMISSED', 'bulk action should update lifecycle state');
  assert.ok(Object.isFrozen(bulk.results), 'bulk outputs must be immutable');

  assert.ok(global.DB.getAuditLogs().some(row => /NOTIFICATION_CENTER|NOTIFICATION_ACKNOWLEDGED|NOTIFICATION_DISMISSED/.test(row.actionType || row.action || '')), 'notification center actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /NOTIFICATION_CENTER|NOTIFICATION_ACKNOWLEDGED|NOTIFICATION_DISMISSED/.test(row.eventType)), 'notification center telemetry should emit safely');

  const previousAudit = global.AuditService;
  global.AuditService = null;
  const degraded = svc.generateNotificationCenterReport({ tenantSlug: 'tabsons', role: 'HR', empId: 'HR-1' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true });
  assert.equal(degraded.success, true, 'missing audit dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'AUDIT_UNAVAILABLE'), 'dependency absence should be visible without throwing');
  global.AuditService = previousAudit;

  const crossTenantCreate = svc.createNotification({ ...payload, tenantSlug: 'abc', dedupeKey: 'center:create:x' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(crossTenantCreate.success, false, 'cross-tenant notification creation must be blocked');
  assert.ok(Object.isFrozen(crossTenantCreate), 'blocked outputs must be immutable');
}

main();
