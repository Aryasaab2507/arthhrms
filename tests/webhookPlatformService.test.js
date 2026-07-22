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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node webhook platform test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'HR', tenantSlug = 'tabsons', id = 'HR-1', now = '2026-07-03T10:00:00.000Z') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, source: 'supabase', roleTrusted: true },
    now
  };
}

function seedWebhookData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private webhook data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', tenantSlug: 'tabsons', email: 'employee@tabsons.com', name: 'Webhook Employee', salary: 900000 },
    { id: 'EMP-ABC', empId: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', email: 'secret@abc.example', privateNote: 'ABC private webhook data' }
  ];
  data.users = [
    { id: 'USR-1', tenantSlug: 'tabsons', email: 'hr@tabsons.com', role: 'hr', password: 'LocalPasswordStillWorks!' }
  ];
  [
    'webhookSubscriptionHistory',
    'webhookEventHistory',
    'webhookDeliveryHistory',
    'webhookRetryHistory',
    'webhookDeadLetterHistory',
    'webhookSecurityHistory',
    'webhookAuditHistory',
    'webhookAnalyticsHistory',
    'distributedQueueJobs',
    'distributedQueueJobHistory',
    'distributedQueueLifecycleHistory',
    'enterpriseLogHistory',
    'auditLogs'
  ].forEach(key => { data[key] = []; });
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/validationRegistryService.js',
    'services/apiPayloadValidationService.js',
    'services/distributedQueueService.js',
    'services/apiGatewayGovernanceService.js',
    'services/enterpriseLoggingPipelineService.js'
  ].forEach(load);
  seedWebhookData();

  const before = {
    userCount: global.DB.get().users.length,
    employeeCount: global.DB.get().employees.length,
    localPassword: global.DB.get().users.find(user => user.id === 'USR-1')?.password
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/webhookPlatformService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('WebhookPlatformService should be exported');
    }
    throw error;
  }

  const svc = global.WebhookPlatformService;
  assert.ok(svc, 'WebhookPlatformService should be exported');
  assert.equal(global.webhookPlatformService, svc, 'lowercase webhook alias should be exported');
  assert.ok(Object.isFrozen(svc), 'webhook export should be frozen');
  ['WebhookService', 'EventPublisher', 'WebhookDispatcher', 'RetryEngine', 'SignatureService', 'DeliveryMonitor', 'WebhookHealthService'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_WEBHOOK_PLATFORM_SELF_TEST__.passed, true, 'development self-test should pass');
  ['EMPLOYEE_CREATED', 'LEAVE_APPROVED', 'PAYROLL_GENERATED', 'LOGIN_FAILURE', 'WORKFLOW_COMPLETED'].forEach(eventType => {
    assert.ok(svc.EVENT_CATALOG.includes(eventType), `${eventType} should be in the event catalog`);
  });

  const insecure = svc.WebhookService.createWebhook({
    tenantSlug: 'tabsons',
    name: 'Insecure HRIS',
    url: 'http://hooks.example.com/hr',
    secret: 'insecure-secret',
    events: ['employee.created']
  }, ctx());
  assert.equal(insecure.success, false, 'HTTP webhook URLs should be blocked');
  assert.equal(insecure.code, 'WEBHOOK_HTTPS_REQUIRED');

  const subscription = svc.WebhookService.createWebhook({
    tenantSlug: 'tabsons',
    name: 'Workforce Events',
    url: 'https://hooks.example.com/hr',
    secret: 'tabsons-webhook-secret-v1',
    headers: { 'X-Integration': 'hris', Authorization: 'Bearer must-not-leak' },
    events: ['employee.created', 'leave.approved', 'payroll.generated'],
    retryPolicy: { strategy: 'EXPONENTIAL', maxAttempts: 3 },
    ipAllowlist: ['203.0.113.10'],
    status: 'ACTIVE'
  }, ctx());
  assert.equal(subscription.success, true, 'webhook subscription should be created');
  assert.equal(subscription.subscription.tenantSlug, 'tabsons');
  assert.equal(subscription.subscription.status, 'ACTIVE');
  assert.equal(subscription.subscription.secretConfigured, true);
  assert.equal(subscription.subscription.events.includes('EMPLOYEE_CREATED'), true);
  assert.equal(subscription.subscription.retryPolicy.maxAttempts, 3);
  assert.equal(subscription.governance.tenantIsolationPreserved, true);
  assert.equal(subscription.governance.eventGovernancePreserved, true);
  assert.equal(subscription.governance.existingBusinessWorkflowsPreserved, true);
  assert.doesNotMatch(text(subscription), /tabsons-webhook-secret-v1|must-not-leak|Authorization|LocalPasswordStillWorks/i, 'subscription output must redact secrets');

  const paused = svc.WebhookService.pauseDelivery({
    tenantSlug: 'tabsons',
    subscriptionId: subscription.subscription.subscriptionId,
    reason: 'maintenance window'
  }, ctx('HR'));
  assert.equal(paused.success, true, 'delivery pause should work');
  assert.equal(paused.subscription.status, 'PAUSED');
  const resumed = svc.WebhookService.resumeDelivery({
    tenantSlug: 'tabsons',
    subscriptionId: subscription.subscription.subscriptionId
  }, ctx('HR'));
  assert.equal(resumed.success, true, 'delivery resume should work');
  assert.equal(resumed.subscription.status, 'ACTIVE');

  const signed = svc.SignatureService.generateSignature({
    tenantSlug: 'tabsons',
    payload: { ok: true },
    secret: 'tabsons-webhook-secret-v1',
    timestamp: '2026-07-03T10:00:00.000Z'
  }, ctx());
  assert.equal(signed.success, true, 'signature generation should work');
  assert.doesNotMatch(text(signed), /tabsons-webhook-secret-v1/i, 'signature output must not reveal secrets');
  const verified = svc.SignatureService.verifySignature({
    tenantSlug: 'tabsons',
    payload: { ok: true },
    secret: 'tabsons-webhook-secret-v1',
    timestamp: signed.timestamp,
    signature: signed.signature,
    deliveryId: 'VERIFY-1'
  }, ctx());
  assert.equal(verified.success, true, 'signature verification should work');
  const replay = svc.SignatureService.verifySignature({
    tenantSlug: 'tabsons',
    payload: { ok: true },
    secret: 'tabsons-webhook-secret-v1',
    timestamp: signed.timestamp,
    signature: signed.signature,
    deliveryId: 'VERIFY-1'
  }, ctx());
  assert.equal(replay.success, false, 'signature replay should be blocked');
  assert.equal(replay.code, 'WEBHOOK_REPLAY_BLOCKED');
  const stale = svc.SignatureService.verifySignature({
    tenantSlug: 'tabsons',
    payload: { ok: true },
    secret: 'tabsons-webhook-secret-v1',
    timestamp: '2026-07-03T09:00:00.000Z',
    signature: signed.signature,
    deliveryId: 'VERIFY-STALE'
  }, ctx());
  assert.equal(stale.code, 'WEBHOOK_TIMESTAMP_INVALID', 'stale timestamps should be rejected');

  const published = svc.EventPublisher.publishEvent({
    tenantSlug: 'tabsons',
    eventId: 'EVT-EMP-1',
    eventType: 'employee.created',
    source: 'Employee',
    payload: {
      employeeId: 'EMP-1',
      email: 'employee@tabsons.com',
      salary: 900000,
      token: 'event-secret',
      privateNote: 'never expose'
    }
  }, ctx('HR'));
  assert.equal(published.success, true, 'business event should publish');
  assert.equal(published.event.eventType, 'EMPLOYEE_CREATED');
  assert.equal(published.queuedDeliveries.length, 1, 'matching subscriptions should receive queued deliveries');
  assert.equal(published.architecture.eventBus, true);
  assert.equal(published.architecture.deliveryQueue, true);
  assert.doesNotMatch(text(published), /event-secret|900000|never expose|employee@tabsons\.com/i, 'event outputs must be sanitized');

  const duplicate = svc.EventPublisher.publishEvent({
    tenantSlug: 'tabsons',
    eventId: 'EVT-EMP-1',
    eventType: 'employee.created',
    payload: { employeeId: 'EMP-1' }
  }, ctx('HR'));
  assert.equal(duplicate.success, true, 'duplicate publish should be safe');
  assert.equal(duplicate.code, 'DUPLICATE_EVENT_SUPPRESSED');
  assert.equal(duplicate.duplicatePrevented, true);

  const received = [];
  const dispatch = await svc.WebhookDispatcher.dispatchPendingDeliveries({
    tenantSlug: 'tabsons',
    deliveryAdapter: request => {
      received.push(request);
      return { success: true, statusCode: 204, latencyMs: 92 };
    }
  }, ctx());
  assert.equal(dispatch.success, true, 'pending webhook deliveries should dispatch');
  assert.equal(dispatch.deliveredCount, 1);
  assert.equal(received.length, 1, 'adapter should receive exactly one delivery');
  assert.equal(received[0].url, 'https://hooks.example.com/hr');
  assert.equal(received[0].headers['X-ArthHRMS-Event'], 'EMPLOYEE_CREATED');
  assert.ok(received[0].headers['X-ArthHRMS-Signature'], 'delivery should include an HMAC signature');
  assert.ok(received[0].headers['X-ArthHRMS-Timestamp'], 'delivery should include a timestamp');
  assert.ok(received[0].idempotencyKey, 'delivery should include an idempotency key');
  assert.doesNotMatch(text(received[0]), /tabsons-webhook-secret-v1|must-not-leak|Authorization|event-secret|900000|never expose/i, 'delivery request must not expose secrets or sensitive payloads');

  const failedEvent = svc.EventPublisher.publishEvent({
    tenantSlug: 'tabsons',
    eventId: 'EVT-PAY-1',
    eventType: 'payroll.generated',
    source: 'Payroll',
    payload: { payrollRunId: 'PAY-1', amount: 10000 }
  }, ctx('HR'));
  assert.equal(failedEvent.success, true);
  const failedDeliveryId = failedEvent.queuedDeliveries[0].deliveryId;
  const firstFailure = await svc.WebhookDispatcher.dispatchPendingDeliveries({
    tenantSlug: 'tabsons',
    deliveryAdapter: () => ({ success: false, statusCode: 503, errorCode: 'ENDPOINT_UNAVAILABLE' })
  }, ctx());
  assert.equal(firstFailure.failedCount, 1, 'failed delivery should be tracked');
  assert.equal(firstFailure.retryCount, 1, 'failed delivery should enter retry queue');

  const retryTwo = await svc.RetryEngine.retryDelivery({
    tenantSlug: 'tabsons',
    deliveryId: failedDeliveryId,
    deliveryAdapter: () => ({ success: false, statusCode: 503, errorCode: 'ENDPOINT_UNAVAILABLE' })
  }, ctx('HR', 'tabsons', 'HR-1', '2026-07-03T10:01:00.000Z'));
  assert.equal(retryTwo.success, true);
  assert.equal(retryTwo.delivery.state, 'RETRYING');
  assert.equal(retryTwo.delivery.attempt, 2);
  const retryThree = await svc.RetryEngine.retryDelivery({
    tenantSlug: 'tabsons',
    deliveryId: failedDeliveryId,
    deliveryAdapter: () => ({ success: false, statusCode: 503, errorCode: 'ENDPOINT_UNAVAILABLE' })
  }, ctx('HR', 'tabsons', 'HR-1', '2026-07-03T10:02:00.000Z'));
  assert.equal(retryThree.success, true, 'retry exhaustion should be handled safely');
  assert.equal(retryThree.delivery.state, 'DEAD_LETTER');
  assert.equal(retryThree.deadLettered, true);

  const deadLetters = svc.RetryEngine.inspectDeadLetters({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(deadLetters.success, true, 'dead-letter queue should be inspectable');
  assert.ok(deadLetters.deadLetterQueue.some(row => row.deliveryId === failedDeliveryId), 'dead letter queue should contain exhausted delivery');

  const abcSubscription = svc.WebhookService.createWebhook({
    tenantSlug: 'abc',
    name: 'ABC Private',
    url: 'https://hooks.abc.example/hr',
    secret: 'abc-webhook-secret',
    events: ['employee.created']
  }, ctx('HR', 'abc', 'HR-ABC'));
  assert.equal(abcSubscription.success, true);
  const crossTenant = svc.EventPublisher.publishEvent({
    tenantSlug: 'abc',
    eventId: 'EVT-ABC-1',
    eventType: 'employee.created',
    payload: { employeeId: 'EMP-ABC', privateNote: 'ABC private webhook data' }
  }, ctx('HR', 'tabsons'));
  assert.equal(crossTenant.success, false, 'cross-tenant event publishing should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC private webhook data|EMP-ABC|secret@abc/i, 'cross-tenant denial must not leak tenant data');

  const report = svc.WebhookHealthService.generateWebhookOperationsReport({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(report.success, true, 'webhook operations report should generate');
  assert.equal(report.architecture.eventBus, true);
  assert.equal(report.architecture.webhookDispatcher, true);
  assert.equal(report.architecture.deliveryQueue, true);
  assert.equal(report.architecture.retryEngine, true);
  assert.equal(report.security.hmacSha256Signatures, true);
  assert.equal(report.security.httpsOnly, true);
  assert.equal(report.security.secretRotation, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.eventGovernancePreserved, true);
  assert.equal(report.governance.existingBusinessWorkflowsPreserved, true);
  assertScore(report.webhookHealthScore, 'webhook health score');
  assertScore(report.deliverySuccessRate, 'delivery success rate');
  assertScore(report.integrationReliabilityScore, 'integration reliability score');
  assert.ok(report.analytics.eventsPublished >= 2, 'events should be counted');
  assert.ok(report.analytics.eventsDelivered >= 1, 'deliveries should be counted');
  assert.ok(report.analytics.retries >= 2, 'retries should be counted');
  assert.ok(report.deadLetterQueue.length >= 1, 'DLQ should be represented');
  assert.doesNotMatch(text(report), /ABC private webhook data|abc-webhook-secret|tabsons-webhook-secret|LocalPasswordStillWorks|Authorization|900000|employee@tabsons\.com/i, 'report must be tenant scoped and sanitized');
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.analytics), 'report outputs should be immutable');

  const rotated = svc.WebhookService.rotateSecret({
    tenantSlug: 'tabsons',
    subscriptionId: subscription.subscription.subscriptionId,
    secret: 'tabsons-webhook-secret-v2'
  }, ctx());
  assert.equal(rotated.success, true, 'secret rotation should work');
  assert.equal(rotated.subscription.secretConfigured, true);
  assert.doesNotMatch(text(rotated), /tabsons-webhook-secret-v2|tabsons-webhook-secret-v1/i, 'rotated secret should not be exposed');

  const deleted = svc.WebhookService.deleteWebhook({
    tenantSlug: 'tabsons',
    subscriptionId: subscription.subscription.subscriptionId
  }, ctx());
  assert.equal(deleted.success, true, 'webhook delete should soft delete');
  assert.equal(deleted.subscription.status, 'DELETED');

  const after = global.DB.get();
  assert.equal(after.users.length, before.userCount, 'webhook platform must not modify auth users');
  assert.equal(after.employees.length, before.employeeCount, 'webhook platform must not modify employees');
  assert.equal(after.users.find(user => user.id === 'USR-1')?.password, before.localPassword, 'existing authentication credentials must remain untouched');
  [
    'webhookSubscriptionHistory',
    'webhookEventHistory',
    'webhookDeliveryHistory',
    'webhookRetryHistory',
    'webhookDeadLetterHistory',
    'webhookAuditHistory',
    'webhookAnalyticsHistory'
  ].forEach(key => {
    assert.ok(Array.isArray(after[key]), `${key} should exist`);
    assert.ok(after[key].length >= 1, `${key} should record rows`);
    assert.ok(after[key].every(row => row.immutable === true), `${key} rows should be immutable`);
  });
  assert.ok((after.auditLogs || []).some(row => /WEBHOOK/.test(String(row.eventType || row.actionType || row.action || row.module || ''))), 'webhook actions should be audited');
  assert.doesNotMatch(text(after.webhookSubscriptionHistory), /tabsons-webhook-secret|abc-webhook-secret|Authorization|must-not-leak/i, 'stored subscription history must not contain raw secrets');
  assert.doesNotMatch(text(after.webhookEventHistory), /employee@tabsons\.com|900000|event-secret|ABC private webhook data/i, 'stored event history must be sanitized');

  const frozen = svc.freezeWebhookOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'webhook outputs should be deeply frozen');

  console.log('webhookPlatformService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
