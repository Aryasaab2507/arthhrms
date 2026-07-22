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

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node distributed queue test', platform: 'Win32' };
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

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function seedData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC queue private data' }
  ];
  data.distributedQueueJobs = [
    {
      jobId: 'DQ-SEED-HIGH',
      tenantSlug: 'tabsons',
      jobType: 'notification_delivery',
      priority: 'HIGH',
      state: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      queuedAt: '2026-06-28T09:55:00.000Z',
      correlationId: 'CORR-SEED-HIGH',
      traceId: 'TRACE-SEED-HIGH',
      payloadSummary: { keys: ['notificationId'], sizeBytes: 24 },
      immutable: true
    },
    {
      jobId: 'DQ-SEED-LOW',
      tenantSlug: 'tabsons',
      jobType: 'cleanup_jobs',
      priority: 'LOW',
      state: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      queuedAt: '2026-06-28T09:56:00.000Z',
      correlationId: 'CORR-SEED-LOW',
      traceId: 'TRACE-SEED-LOW',
      payloadSummary: { keys: ['cleanupScope'], sizeBytes: 28 },
      immutable: true
    },
    {
      jobId: 'DQ-ABC-PRIVATE',
      tenantSlug: 'abc',
      jobType: 'payroll_calculations',
      priority: 'CRITICAL',
      state: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      queuedAt: '2026-06-28T09:57:00.000Z',
      privateNote: 'ABC queue private data',
      payload: { salary: 999999, token: 'abc-secret-token' },
      immutable: true
    }
  ];
  data.distributedQueueWorkerHistory = [
    { workerId: 'WORKER-SEED', tenantSlug: 'tabsons', state: 'ACTIVE', lastHeartbeatAt: '2026-06-28T09:59:00.000Z', immutable: true }
  ];
  data.distributedQueueJobHistory = [];
  data.distributedQueueLifecycleHistory = [];
  data.distributedQueueRetryHistory = [];
  data.distributedQueueDeadLetterHistory = [];
  data.distributedQueueScheduleHistory = [];
  data.distributedQueueMetricsHistory = [];
  data.auditLogs = [];
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
    'services/asyncJobService.js',
    'services/workflowRecoveryService.js',
    'services/notificationDeliveryTrackingService.js',
    'services/enterpriseRedisCacheService.js',
    'services/enterpriseAssetDeliveryService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/distributedQueueService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.DistributedQueueService;
  assert.ok(svc, 'DistributedQueueService should be exported');
  assert.equal(global.distributedQueueService, svc, 'lowercase queue service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'queue service export should be frozen');
  ['QueueManager', 'JobScheduler', 'RetryManager', 'DeadLetterManager', 'WorkerManager', 'QueueMetricsCollector'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['REDIS_STREAMS', 'BULLMQ', 'RABBITMQ', 'AMAZON_SQS', 'AZURE_SERVICE_BUS'].forEach(provider => {
    assert.ok(svc.BROKER_PROVIDERS.includes(provider), `${provider} broker provider should be supported`);
  });
  ['email_delivery', 'notification_delivery', 'employee_import', 'excel_processing', 'report_generation', 'payroll_calculations', 'audit_exports', 'ai_processing', 'backup_jobs', 'cleanup_jobs'].forEach(type => {
    assert.ok(svc.JOB_TYPES.includes(type), `${type} job type should be supported`);
  });
  ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'BACKGROUND'].forEach(priority => {
    assert.ok(svc.PRIORITIES.includes(priority), `${priority} priority should be supported`);
  });
  ['CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING', 'DELAYED', 'CANCELLED', 'DEAD_LETTER'].forEach(state => {
    assert.ok(svc.JOB_STATES.includes(state), `${state} job state should be supported`);
  });
  assert.equal(global.__ARTHHRMS_DISTRIBUTED_QUEUE_SELF_TEST__.passed, true, 'development self-test should pass');

  const created = svc.QueueManager.createJob({
    tenantSlug: 'tabsons',
    jobType: 'email_delivery',
    priority: 'HIGH',
    payload: { email: 'employee@example.com', token: 'secret-token', message: 'Welcome' },
    idempotencyKey: 'invite-email-1'
  }, ownerContext());
  assert.equal(created.success, true, 'job creation should succeed');
  assert.equal(created.job.state, 'QUEUED');
  assert.equal(created.job.tenantSlug, 'tabsons');
  assert.equal(created.job.priority, 'HIGH');
  assert.ok(created.job.correlationId, 'job should include a correlation id');
  assert.ok(created.job.traceId, 'job should include a trace id');
  assert.equal(created.governance.tenantIsolationPreserved, true);
  assert.equal(created.governance.duplicateExecutionPrevented, true);
  assert.equal(created.governance.queueGovernancePreserved, true);
  assert.doesNotMatch(text(created), /secret-token|token/i, 'queue output should not expose tokens or secrets');

  const duplicate = svc.QueueManager.createJob({
    tenantSlug: 'tabsons',
    jobType: 'email_delivery',
    priority: 'HIGH',
    payload: { email: 'employee@example.com' },
    idempotencyKey: 'invite-email-1'
  }, ownerContext());
  assert.equal(duplicate.success, true, 'duplicate idempotency should return safely');
  assert.equal(duplicate.code, 'DUPLICATE_JOB_SUPPRESSED');
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(duplicate.job.jobId, created.job.jobId, 'duplicate creation should not create another executable job');

  const crossTenant = svc.QueueManager.createJob({
    tenantSlug: 'abc',
    jobType: 'payroll_calculations',
    priority: 'CRITICAL',
    payload: { salary: 999999, token: 'abc-secret-token', privateNote: 'ABC queue private data' }
  }, ownerContext('tabsons'));
  assert.equal(crossTenant.success, false, 'cross-tenant job creation should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC queue private data|999999|abc-secret-token/i, 'cross-tenant denial must not leak private job data');

  const critical = svc.QueueManager.createJob({
    tenantSlug: 'tabsons',
    jobType: 'backup_jobs',
    priority: 'CRITICAL',
    payload: { backupId: 'BKP-1' },
    idempotencyKey: 'critical-backup-1'
  }, ownerContext());
  assert.equal(critical.success, true, 'critical job should enqueue');

  const claimed = svc.WorkerManager.claimNextJob({ tenantSlug: 'tabsons', workerId: 'WORKER-1' }, ownerContext());
  assert.equal(claimed.success, true, 'worker should claim a job');
  assert.equal(claimed.job.jobId, critical.job.jobId, 'workers should process higher priority jobs first');
  assert.equal(claimed.job.state, 'PROCESSING');
  assert.equal(claimed.job.workerId, 'WORKER-1');

  const completed = svc.WorkerManager.completeJob({
    tenantSlug: 'tabsons',
    jobId: claimed.job.jobId,
    workerId: 'WORKER-1',
    result: { processed: true, token: 'hidden' }
  }, ownerContext());
  assert.equal(completed.success, true, 'worker should complete claimed job');
  assert.equal(completed.job.state, 'COMPLETED');
  assert.doesNotMatch(text(completed), /hidden|token/i, 'completion result should be sanitized');

  const unavailableAdapter = {
    enqueue() { throw new Error('broker unavailable'); },
    publish() { throw new Error('broker unavailable'); }
  };
  global.ARTHHRMS_QUEUE_BROKER_ADAPTER = unavailableAdapter;
  const fallback = svc.QueueManager.createJob({
    tenantSlug: 'tabsons',
    jobType: 'report_generation',
    priority: 'NORMAL',
    payload: { reportId: 'RPT-1' },
    idempotencyKey: 'report-fallback-1'
  }, ownerContext());
  delete global.ARTHHRMS_QUEUE_BROKER_ADAPTER;
  assert.equal(fallback.success, true, 'broker outage should fall back to durable local queue state');
  assert.equal(fallback.governance.brokerUnavailableHandled, true);

  const scheduled = svc.JobScheduler.scheduleJob({
    tenantSlug: 'tabsons',
    jobType: 'report_generation',
    priority: 'NORMAL',
    runAt: '2026-06-28T10:15:00.000Z',
    recurrence: 'ONCE',
    payload: { reportId: 'RPT-SCHEDULED' },
    idempotencyKey: 'report-scheduled-1'
  }, ownerContext());
  assert.equal(scheduled.success, true, 'scheduled job should be accepted');
  assert.equal(scheduled.job.state, 'DELAYED');

  const earlyRelease = svc.JobScheduler.releaseDueJobs({ tenantSlug: 'tabsons' }, ownerContext());
  assert.equal(earlyRelease.success, true, 'early due-job release should run safely');
  assert.equal(earlyRelease.releasedJobs.some(job => job.jobId === scheduled.job.jobId), false, 'future jobs should not be released early');

  const dueRelease = svc.JobScheduler.releaseDueJobs({ tenantSlug: 'tabsons' }, { ...ownerContext(), now: '2026-06-28T10:16:00.000Z' });
  assert.equal(dueRelease.success, true, 'due jobs should release');
  assert.ok(dueRelease.releasedJobs.some(job => job.jobId === scheduled.job.jobId), 'scheduled job should move to queue when due');

  const retryJob = svc.QueueManager.createJob({
    tenantSlug: 'tabsons',
    jobType: 'notification_delivery',
    priority: 'HIGH',
    payload: { notificationId: 'N-RETRY' },
    idempotencyKey: 'notification-retry-1'
  }, ownerContext());
  assert.equal(retryJob.success, true, 'retry seed job should enqueue');

  const failOne = svc.RetryManager.recordFailure({
    tenantSlug: 'tabsons',
    jobId: retryJob.job.jobId,
    errorCode: 'SMTP_TIMEOUT',
    strategy: 'EXPONENTIAL'
  }, ownerContext());
  assert.equal(failOne.success, true, 'first failure should be retryable');
  assert.equal(failOne.job.state, 'RETRYING');
  assert.equal(failOne.retryPlan.attempt, 1);
  assert.ok(failOne.retryPlan.nextRunAt, 'retry should include next run time');

  const failTwo = svc.RetryManager.recordFailure({
    tenantSlug: 'tabsons',
    jobId: retryJob.job.jobId,
    errorCode: 'SMTP_TIMEOUT',
    strategy: 'EXPONENTIAL'
  }, ownerContext());
  assert.equal(failTwo.success, true, 'second failure should stay bounded');
  assert.equal(failTwo.job.state, 'RETRYING');
  assert.equal(failTwo.retryPlan.attempt, 2);

  const failThree = svc.RetryManager.recordFailure({
    tenantSlug: 'tabsons',
    jobId: retryJob.job.jobId,
    errorCode: 'SMTP_TIMEOUT',
    strategy: 'EXPONENTIAL'
  }, ownerContext());
  assert.equal(failThree.success, true, 'third failure should move to dead letter queue');
  assert.equal(failThree.job.state, 'DEAD_LETTER');
  assert.equal(failThree.deadLettered, true);
  assert.equal(failThree.governance.infiniteRetriesPrevented, true);

  const deadLetters = svc.DeadLetterManager.inspectDeadLetters({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(deadLetters.success, true, 'dead letters should be inspectable');
  assert.ok(deadLetters.jobs.some(job => job.jobId === retryJob.job.jobId), 'dead-letter queue should contain exhausted job');
  assert.ok(deadLetters.failureReports.some(report => report.jobId === retryJob.job.jobId), 'dead-letter failure report should be generated');

  const retriedDeadLetter = svc.DeadLetterManager.retryDeadLetter({ tenantSlug: 'tabsons', jobId: retryJob.job.jobId }, ownerContext());
  assert.equal(retriedDeadLetter.success, true, 'dead-letter job should be manually retryable under governance');
  assert.equal(retriedDeadLetter.job.state, 'QUEUED');
  assert.equal(retriedDeadLetter.job.attempts, 0, 'manual DLQ retry should reset attempts for a fresh bounded cycle');

  const cancelled = svc.QueueManager.cancelJob({
    tenantSlug: 'tabsons',
    jobId: fallback.job.jobId,
    reason: 'superseded by later report'
  }, ownerContext());
  assert.equal(cancelled.success, true, 'queued jobs should be cancellable under governance');
  assert.equal(cancelled.job.state, 'CANCELLED');

  const tenantClaim = svc.WorkerManager.claimNextJob({ tenantSlug: 'tabsons', workerId: 'WORKER-TABSONS' }, ownerContext('tabsons'));
  assert.equal(tenantClaim.success, true, 'tenant worker should claim a tenant-scoped job');
  assert.notEqual(tenantClaim.job.jobId, 'DQ-ABC-PRIVATE', 'tenant worker must not claim another tenant job');
  assert.doesNotMatch(text(tenantClaim), /ABC queue private data|abc-secret-token|999999/i, 'tenant worker claim must not leak other tenant data');

  const employeeReport = svc.QueueManager.generateQueueOperationsReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeReport.success, false, 'employees cannot access queue operations center');
  assert.equal(employeeReport.code, 'QUEUE_GOVERNANCE_DENIED');

  const metrics = svc.QueueMetricsCollector.collectMetrics({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(metrics.success, true, 'queue metrics should collect');
  assert.ok(metrics.analytics.queueDepth >= 0, 'queue depth should be tracked');
  assert.ok(metrics.analytics.processingLatencyMs >= 0, 'processing latency should be tracked');
  assert.ok(metrics.analytics.workerUtilization >= 0, 'worker utilization should be tracked');
  assert.ok(metrics.analytics.deadLetterSize >= 0, 'dead-letter size should be tracked');
  assert.ok(metrics.analytics.throughput >= 0, 'throughput should be tracked');
  assertScore(metrics.queueHealthScore, 'queue health score');
  assertScore(metrics.workerEfficiencyScore, 'worker efficiency score');
  assertScore(metrics.processingScore, 'processing score');

  const report = svc.QueueManager.generateQueueOperationsReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'queue operations report should generate');
  assert.equal(report.architecture.application, true);
  assert.equal(report.architecture.queueProducer, true);
  assert.equal(report.architecture.messageBroker, true);
  assert.equal(report.architecture.workerPool, true);
  assert.equal(report.architecture.databaseServices, true);
  assert.ok(report.architecture.supportedBrokers.includes('BullMQ'));
  assert.ok(report.activeQueues.length >= 1, 'active queues should be visible');
  assert.ok(Array.isArray(report.retryQueue), 'retry queue should be visible');
  assert.ok(Array.isArray(report.deadLetterQueue), 'dead-letter queue should be visible');
  assert.ok(Array.isArray(report.workerStatus), 'worker status should be visible');
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.queueGovernancePreserved, true);
  assert.equal(report.governance.duplicateExecutionPrevented, true);
  assert.equal(report.governance.jobLossPrevented, true);
  assert.doesNotMatch(text(report), /ABC queue private data|DQ-ABC-PRIVATE|abc-secret-token|999999/i, 'operations report must remain tenant scoped and sanitized');
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.analytics), 'operations report should be immutable');

  const malformed = svc.QueueManager.createJob('bad-payload', ownerContext());
  assert.equal(malformed.success, false, 'malformed queue payload should fail safely');
  assert.equal(malformed.code, 'MALFORMED_QUEUE_PAYLOAD');
  assert.ok(Object.isFrozen(malformed));

  const data = global.DB.get();
  [
    'distributedQueueJobHistory',
    'distributedQueueLifecycleHistory',
    'distributedQueueRetryHistory',
    'distributedQueueDeadLetterHistory',
    'distributedQueueScheduleHistory',
    'distributedQueueMetricsHistory'
  ].forEach(key => {
    assert.ok(Array.isArray(data[key]), `${key} should exist`);
    assert.ok(data[key].length >= 1, `${key} should record immutable rows`);
    assert.ok(data[key].every(row => row.immutable === true), `${key} rows must be immutable`);
  });
  assert.ok((data.auditLogs || []).some(row => /QUEUE_|JOB_|DEAD_LETTER/.test(String(row.actionType || row.action || row.type || ''))), 'queue actions should be audited');

  const frozen = svc.freezeQueueOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'queue outputs should be deeply frozen');

  console.log('distributedQueueService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
