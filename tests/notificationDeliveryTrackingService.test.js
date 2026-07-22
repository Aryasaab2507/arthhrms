const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Node notification reliability test', platform: 'Win32' };
  global.location = { hostname: 'tabsons.arthhrms.example', pathname: '/platform-control.html' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', email: 'employee@example.com', tenantSlug: 'tabsons', role: 'EMPLOYEE' },
    { id: 'HR-1', empId: 'HR-1', email: 'hr@example.com', tenantSlug: 'tabsons', role: 'HR' },
    { id: 'EMP-ABC', empId: 'EMP-ABC', email: 'secret@abc.example', tenantSlug: 'abc', role: 'EMPLOYEE' }
  ];
  data.notificationDeliveryTrackingHistory = [
    { trackingId: 'NDT-ABC', notificationId: 'N-ABC', tenantSlug: 'abc', channel: 'EMAIL', state: 'DELIVERED', recipientId: 'EMP-ABC', internalNote: 'ABC confidential', occurredAt: '2026-06-20T00:00:00.000Z' }
  ];
  data.notificationEngagementTrackingHistory = [];
  data.notificationDeliveryRetryHistory = [];
  data.notificationDeliveryAnalyticsHistory = [];
  data.auditLogs = [];
  data.notifications = [];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  load('db.js');
  load('services/auditService.js');
  seedData();
  global.__ARTHHRMS_DEV__ = false;
  load('services/validationRegistryService.js');

  const recoveryHandoffs = [];
  global.WorkflowRecoveryService = {
    detectWorkflowFailure(payload) { recoveryHandoffs.push(payload); return { success: true }; }
  };

  global.__ARTHHRMS_DEV__ = true;
  load('services/notificationDeliveryTrackingService.js');
  const svc = global.NotificationDeliveryTrackingService;
  assert.ok(svc, 'NotificationDeliveryTrackingService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.NOTIFICATION_STATES, [
    'CREATED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'OPENED', 'ACKNOWLEDGED',
    'FAILED', 'EXPIRED', 'CANCELLED', 'RETRYING'
  ]);
  assert.deepEqual(svc.DELIVERY_CHANNELS, ['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
  assert.equal(global.__ARTHHRMS_NOTIFICATION_DELIVERY_SELF_TEST__.passed, true);
  [
    'trackNotificationDelivery', 'classifyDeliveryFailure', 'retryNotification',
    'calculateDeliveryReliability', 'generateNotificationMetrics', 'getNotificationDeliveryStatus',
    'freezeNotificationOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const context = {
    tenantSlug: 'tabsons', now: '2026-06-21T00:00:00.000Z',
    actor: { id: 'SA-1', role: 'SUPER_ADMIN', tenantSlug: 'tabsons' }
  };

  const created = svc.trackNotificationDelivery({
    notificationId: 'N-1', tenantSlug: 'tabsons', channel: 'EMAIL', state: 'CREATED',
    recipientId: 'EMP-1', recipient: 'employee@example.com', source: 'NOTIFICATION_CENTER', correlationId: 'CORR-1',
    occurredAt: '2026-06-21T00:00:00.000Z'
  }, context);
  assert.equal(created.success, true);
  assert.equal(created.delivery.state, 'CREATED');
  assert.ok(Object.isFrozen(created) && Object.isFrozen(created.delivery));
  assert.doesNotMatch(JSON.stringify(created), /employee@example\.com|recipientAddress|secret/i, 'public output must not expose delivery addresses');

  for (const [state, occurredAt] of [
    ['QUEUED', '2026-06-21T00:00:01.000Z'],
    ['PROCESSING', '2026-06-21T00:00:02.000Z'],
    ['SENT', '2026-06-21T00:00:03.000Z'],
    ['DELIVERED', '2026-06-21T00:01:03.000Z'],
    ['OPENED', '2026-06-21T00:02:03.000Z'],
    ['ACKNOWLEDGED', '2026-06-21T00:03:03.000Z']
  ]) {
    const tracked = svc.trackNotificationDelivery({
      notificationId: 'N-1', tenantSlug: 'tabsons', channel: 'EMAIL', state,
      recipientId: 'EMP-1', recipient: 'employee@example.com', providerEventId: `EVENT-${state}`, occurredAt
    }, context);
    assert.equal(tracked.success, true, `${state} should be tracked`);
    assert.equal(tracked.delivery.state, state);
  }

  const historyBeforeDuplicate = global.DB.get().notificationDeliveryTrackingHistory.length;
  const duplicate = svc.trackNotificationDelivery({
    notificationId: 'N-1', tenantSlug: 'tabsons', channel: 'EMAIL', state: 'ACKNOWLEDGED',
    recipientId: 'EMP-1', providerEventId: 'EVENT-ACKNOWLEDGED', occurredAt: '2026-06-21T00:03:03.000Z'
  }, context);
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(global.DB.get().notificationDeliveryTrackingHistory.length, historyBeforeDuplicate);

  const invalidTransition = svc.trackNotificationDelivery({
    notificationId: 'N-1', tenantSlug: 'tabsons', channel: 'EMAIL', state: 'SENT', recipientId: 'EMP-1'
  }, context);
  assert.equal(invalidTransition.success, false);
  assert.equal(invalidTransition.code, 'INVALID_DELIVERY_TRANSITION');

  const invalidRecipient = svc.trackNotificationDelivery({
    notificationId: 'N-BAD', tenantSlug: 'tabsons', channel: 'EMAIL', state: 'CREATED', recipient: 'bad-email'
  }, context);
  assert.equal(invalidRecipient.success, false);
  assert.equal(invalidRecipient.code, 'INVALID_NOTIFICATION_RECIPIENT');
  assert.equal(svc.classifyDeliveryFailure({ channel: 'EMAIL', errorCode: 'INVALID_RECIPIENT' }).classification, 'INVALID_RECIPIENT');
  assert.equal(svc.classifyDeliveryFailure({ channel: 'SMS', message: 'provider outage' }).classification, 'CHANNEL_OUTAGE');
  assert.equal(svc.classifyDeliveryFailure({ channel: 'PUSH', message: 'delivery timeout' }).classification, 'DELIVERY_TIMEOUT');
  assert.equal(svc.classifyDeliveryFailure({ errorCode: 'RATE_LIMIT' }).classification, 'RATE_LIMITED');
  assert.doesNotThrow(() => svc.classifyDeliveryFailure(null));

  const tenantDenied = svc.trackNotificationDelivery({
    notificationId: 'N-CROSS', tenantSlug: 'abc', channel: 'IN_APP', state: 'CREATED', recipientId: 'EMP-ABC'
  }, context);
  assert.equal(tenantDenied.success, false);
  assert.equal(tenantDenied.code, 'TENANT_ACCESS_DENIED');
  const employeeTrackDenied = svc.trackNotificationDelivery({
    notificationId: 'N-EMP-DENIED', tenantSlug: 'tabsons', channel: 'IN_APP', state: 'CREATED', recipientId: 'EMP-1'
  }, { tenantSlug: 'tabsons', actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } });
  assert.equal(employeeTrackDenied.code, 'NOTIFICATION_GOVERNANCE_DENIED');

  const failNotification = id => {
    svc.trackNotificationDelivery({ notificationId: id, tenantSlug: 'tabsons', channel: 'SMS', state: 'CREATED', recipientId: 'EMP-1', recipient: '+919876543210' }, context);
    svc.trackNotificationDelivery({ notificationId: id, tenantSlug: 'tabsons', channel: 'SMS', state: 'QUEUED', recipientId: 'EMP-1' }, context);
    svc.trackNotificationDelivery({ notificationId: id, tenantSlug: 'tabsons', channel: 'SMS', state: 'PROCESSING', recipientId: 'EMP-1' }, context);
    return svc.trackNotificationDelivery({ notificationId: id, tenantSlug: 'tabsons', channel: 'SMS', state: 'FAILED', recipientId: 'EMP-1', errorCode: 'PROVIDER_OUTAGE', message: 'SMS provider outage' }, context);
  };

  const initialRetryFailure = failNotification('N-RETRY');
  assert.equal(initialRetryFailure.success, true);
  assert.equal(initialRetryFailure.delivery.failureReason, 'CHANNEL_OUTAGE');
  const retryFailure = await svc.retryNotification({ notificationId: 'N-RETRY', retryHandler: () => ({ success: false, errorCode: 'TIMEOUT' }) }, context);
  assert.equal(retryFailure.success, false);
  assert.equal(retryFailure.state, 'FAILED');
  assert.equal(retryFailure.retryCount, 1);
  assert.equal(global.DB.get().notificationDeliveryTrackingHistory.filter(row => row.notificationId === 'N-RETRY' && row.state === 'FAILED').at(-1).retryCount, 1);
  const retrySuccess = await svc.retryNotification({ notificationId: 'N-RETRY', retryHandler: () => ({ success: true, providerMessageId: 'MSG-2' }) }, context);
  assert.equal(retrySuccess.success, true);
  assert.equal(retrySuccess.state, 'SENT');
  assert.equal(retrySuccess.retryCount, 2);
  assert.equal((await svc.retryNotification({ notificationId: 'N-RETRY', retryHandler: () => ({ success: true }) }, context)).code, 'NOTIFICATION_NOT_RETRYABLE');

  failNotification('N-LIMIT');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const retry = await svc.retryNotification({ notificationId: 'N-LIMIT', retryHandler: () => ({ success: false }) }, context);
    assert.equal(retry.retryCount, attempt);
  }
  const limit = await svc.retryNotification({ notificationId: 'N-LIMIT', retryHandler: () => ({ success: true }) }, context);
  assert.equal(limit.code, 'RETRY_LIMIT_REACHED');
  assert.equal(limit.requiresManualReview, true);
  assert.ok(recoveryHandoffs.some(row => row.workflowId === 'NOTIFICATION-N-LIMIT'), 'retry exhaustion should integrate with workflow recovery');

  failNotification('N-CONCURRENT');
  let releaseRetry;
  const pendingRetry = svc.retryNotification({ notificationId: 'N-CONCURRENT', retryHandler: () => new Promise(resolve => { releaseRetry = resolve; }) }, context);
  await Promise.resolve();
  const concurrent = await svc.retryNotification({ notificationId: 'N-CONCURRENT', retryHandler: () => ({ success: true }) }, context);
  assert.equal(concurrent.code, 'RETRY_ALREADY_IN_PROGRESS');
  releaseRetry({ success: true });
  assert.equal((await pendingRetry).success, true);

  failNotification('N-LATE');
  const lateDelivery = svc.trackNotificationDelivery({
    notificationId: 'N-LATE', tenantSlug: 'tabsons', channel: 'SMS', state: 'DELIVERED', recipientId: 'EMP-1',
    providerEventId: 'LATE-CONFIRMATION', occurredAt: '2026-06-21T00:05:00.000Z', lateConfirmation: true
  }, context);
  assert.equal(lateDelivery.success, true);
  assert.equal(lateDelivery.delivery.lateConfirmation, true);

  const report = svc.calculateDeliveryReliability({ tenantSlug: 'tabsons' }, context);
  assert.equal(report.success, true);
  assert.ok(report.communicationHealthScore >= 0 && report.communicationHealthScore <= 100);
  assert.ok(report.deliveryReliabilityScore >= 0 && report.deliveryReliabilityScore <= 100);
  assert.ok(report.engagementScore >= 0 && report.engagementScore <= 100);
  assert.ok(report.analytics.averageDeliveryLatencyMs >= 0);
  assert.ok(report.channelAnalytics.some(row => row.channel === 'EMAIL'));
  assert.doesNotMatch(JSON.stringify(report), /N-ABC|ABC confidential|secret@abc/i, 'analytics must remain tenant scoped');
  assert.ok(Object.isFrozen(report));
  assert.equal(svc.generateNotificationMetrics({ tenantSlug: 'tabsons' }, context).success, true);

  const hrReport = svc.calculateDeliveryReliability({ tenantSlug: 'tabsons' }, { ...context, actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } });
  assert.equal(hrReport.success, true);
  const employeeReport = svc.calculateDeliveryReliability({ tenantSlug: 'tabsons' }, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } });
  assert.equal(employeeReport.success, true);
  assert.ok(employeeReport.deliveryHistory.every(row => row.recipientId === 'EMP-1'));
  assert.equal(svc.getNotificationDeliveryStatus({ notificationId: 'N-1' }, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } }).success, true);
  assert.equal(svc.getNotificationDeliveryStatus({ notificationId: 'N-LIMIT' }, { ...context, actor: { id: 'EMP-2', role: 'EMPLOYEE', tenantSlug: 'tabsons' } }).success, false);

  global.__ARTHHRMS_DEV__ = false;
  load('services/notificationCenterService.js');
  const centerResult = global.NotificationCenterService.createNotification({
    notificationId: 'N-CENTER', tenantSlug: 'tabsons', toEmpId: 'EMP-1', category: 'HR', channel: 'IN_APP', title: 'Center integration', message: 'Tracked once.'
  }, { tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } });
  assert.equal(centerResult.success, true);
  global.NotificationCenterService.updateNotificationState('N-CENTER', 'DELIVERED', { tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } });
  const centerTracking = global.DB.get().notificationDeliveryTrackingHistory.filter(row => row.notificationId === 'N-CENTER');
  assert.ok(centerTracking.some(row => row.state === 'DELIVERED'), `Notification Center lifecycle should hand off to reliability tracking: ${JSON.stringify(centerTracking)}`);

  load('services/inviteMailDeliveryService.js');
  const inviteResult = global.InviteMailDeliveryService.sendEmployeeInvite({
    tenantSlug: 'tabsons', employeeId: 'EMP-1', email: 'employee@example.com', name: 'Employee One'
  }, {
    tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' },
    providerAdapter: { provider: 'SMTP', send: () => ({ ok: true, providerMessageId: 'INV-MSG-1' }) }
  });
  assert.equal(inviteResult.success, true);
  assert.ok(global.DB.get().notificationDeliveryTrackingHistory.some(row => row.notificationId === inviteResult.invitation.invitationId && row.state === 'SENT' && row.source === 'INVITE_DELIVERY'), 'invite delivery should hand off to reliability tracking');

  const data = global.DB.get();
  assert.ok(data.notificationDeliveryTrackingHistory.some(row => row.tenantSlug === 'tabsons'));
  assert.ok(data.notificationEngagementTrackingHistory.some(row => row.state === 'OPENED'));
  assert.ok(data.notificationDeliveryRetryHistory.some(row => row.action === 'RETRY'));
  assert.ok(data.notificationDeliveryAnalyticsHistory.length >= 1);
  assert.ok(data.auditLogs.some(row => /NOTIFICATION_(DELIVERY|RETRY|ACKNOWLEDGED|FAILED)/.test(String(row.actionType || row.action || row.type || ''))));
  const frozen = svc.freezeNotificationOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));

  console.log('notificationDeliveryTrackingService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
