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

function seedAsyncJobData() {
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
  data.asyncJobs = [
    {
      jobId: 'JOB-1',
      tenantSlug: 'tabsons',
      jobType: 'NOTIFICATION_DELIVERY',
      state: 'QUEUED',
      priority: 'HIGH',
      retryAttempts: 0,
      maxRetries: 3,
      scheduledAt: '2026-05-22T01:00:00.000Z',
      correlationId: 'CORR-JOB-1',
      createdAt: '2026-05-22T00:55:00.000Z'
    },
    {
      jobId: 'JOB-2',
      tenantSlug: 'tabsons',
      jobType: 'ESCALATION_BATCH',
      state: 'RETRY_PENDING',
      priority: 'CRITICAL',
      retryAttempts: 2,
      maxRetries: 3,
      scheduledAt: '2026-05-22T01:05:00.000Z',
      correlationId: 'CORR-JOB-2',
      createdAt: '2026-05-22T00:58:00.000Z'
    },
    {
      jobId: 'JOB-3',
      tenantSlug: 'tabsons',
      jobType: 'REPLAY_PROCESSING',
      state: 'FAILED',
      priority: 'HIGH',
      retryAttempts: 3,
      maxRetries: 3,
      scheduledAt: '2026-05-22T01:10:00.000Z',
      correlationId: 'CORR-JOB-3',
      createdAt: '2026-05-22T00:59:00.000Z'
    },
    {
      jobId: 'JOB-X',
      tenantSlug: 'abc',
      jobType: 'PAYROLL_GENERATION',
      state: 'QUEUED',
      priority: 'HIGH',
      retryAttempts: 0,
      salary: 999999,
      payrollAmount: 999999,
      payload: { payrollAmount: 999999, salary: 999999 },
      correlationId: 'CORR-X',
      createdAt: '2026-05-22T01:20:00.000Z'
    }
  ];
  data.workflowEvents = [
    { eventId: 'WF-JOB-1', correlationId: 'CORR-JOB-1', type: 'DELAYED_NOTIFICATION', status: 'QUEUED', module: 'Notifications', tenantSlug: 'tabsons', createdAt: '2026-05-22T00:50:00.000Z' }
  ];
  data.notifications = [
    { id: 'N-JOB-1', notificationId: 'N-JOB-1', tenantSlug: 'tabsons', toRole: 'MANAGER', title: 'Delayed notification', message: 'Delivery pending.', module: 'Notifications', state: 'QUEUED', priority: 'HIGH', createdAt: '2026-05-22T00:51:00.000Z' }
  ];
  global.DB.save(data);

  global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', 'SEEDED_ASYNC_JOB_EVENT', {
    source: 'async-job-test',
    correlationId: 'CORR-JOB-1',
    severity: 'WARNING',
    metadata: { tenantSlug: 'tabsons' }
  });
  global.OrchestrationMetricsService.recordWorkflowMetric('SEEDED_ASYNC_JOB_EVENT', { tenantSlug: 'tabsons' });
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
    'services/escalationCommandService.js',
    'services/eventReplayService.js',
    'services/operationsMonitoringService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/asyncJobService.js');
  seedAsyncJobData();

  const svc = global.AsyncJobService;
  assert.ok(svc, 'AsyncJobService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.JOB_STATES), 'job states must be immutable');
  assert.ok(Object.isFrozen(svc.JOB_TYPES), 'job types must be immutable');
  assert.equal(global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyAsyncJobPriority({ crossTenant: true }), 'CRITICAL', 'cross-tenant job risk classifies as critical');
  assert.equal(svc.classifyAsyncJobPriority({ jobType: 'PAYROLL_GENERATION' }), 'HIGH', 'payroll generation jobs classify high');
  assert.equal(svc.classifyAsyncJobPriority({ jobType: 'TELEMETRY_AGGREGATION' }), 'NORMAL', 'telemetry aggregation jobs classify normal');
  assert.equal(svc.classifyJobFailure({ retryAttempts: 99, maxRetries: 3 }), 'CRITICAL_BLOCKER', 'infinite retry loops classify as critical blockers');
  assert.equal(svc.classifyJobFailure({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant jobs classify as critical blockers');

  const blocked = svc.validateAsyncJobScope({ tenantSlug: 'abc', jobType: 'PAYROLL_GENERATION', payload: { salary: 123456 } }, { tenantSlug: 'tabsons' });
  assert.equal(blocked.allowed, false, 'cross-tenant async job must be blocked');
  assert.ok(blocked.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(blocked), /123456|salary/i, 'scope output must not expose sensitive data');

  const payload = {
    tenantSlug: 'tabsons',
    jobType: 'PAYROLL_GENERATION',
    payload: { payrollAmount: 999999, salary: 999999, period: '2026-05' },
    metadata: { salary: 999999, source: 'pilot' },
    correlationId: 'CORR-JOB-PAYROLL'
  };
  const before = JSON.stringify(payload);
  const normalized = svc.normalizeJobPayload(payload, { tenantSlug: 'tabsons' });
  assert.equal(JSON.stringify(payload), before, 'normalization must not mutate caller payload');
  assert.equal(normalized.state, 'QUEUED');
  assert.equal(normalized.jobType, 'PAYROLL_GENERATION');
  assert.equal(normalized.priority, 'HIGH');
  assert.ok(Object.isFrozen(normalized), 'normalized job output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|payrollAmount/i, 'normalized job output must redact sensitive data');

  const queued = svc.enqueueJob(payload, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(queued.success, true, 'enqueue should work safely');
  assert.equal(queued.job.state, 'QUEUED');
  assert.equal(queued.job.tenantSlug, 'tabsons');
  assert.ok(queued.queueAdapter.futureQueueReady, 'queue adapter should be future migration compatible');
  assert.ok(Object.isFrozen(queued.job), 'queued job output must be immutable');
  assert.doesNotMatch(JSON.stringify(queued), /999999|salary|payrollAmount/i, 'queued job output must not leak sensitive data');
  assert.ok(global.DB.get().asyncJobs.some(row => row.jobId === queued.job.jobId), 'queued job should persist compatibly');

  const scheduled = svc.scheduleJob({
    tenantSlug: 'tabsons',
    jobType: 'ONBOARDING_IMPORT',
    payload: { batchId: 'B-1' },
    schedule: { runAt: '2026-05-23T08:30:00.000Z' }
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(scheduled.success, true, 'scheduling should work');
  assert.equal(scheduled.job.state, 'SCHEDULED');
  assert.equal(scheduled.job.scheduledAt, '2026-05-23T08:30:00.000Z');

  const retry = svc.scheduleRetry(queued.job, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    maxRetries: 3
  });
  assert.equal(retry.success, true, 'retry scheduling should work');
  assert.equal(retry.job.state, 'RETRY_PENDING');
  assert.ok(retry.job.retryAttempts <= 3, 'retry attempts must remain bounded');
  assert.ok(retry.retryPlan.backoffMs >= 1000, 'retry scheduling should use backoff');

  const deadLetter = svc.scheduleRetry({ ...queued.job, retryAttempts: 3, maxRetries: 3 }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    maxRetries: 3
  });
  assert.equal(deadLetter.success, true, 'dead-letter transition should complete safely');
  assert.equal(deadLetter.job.state, 'FAILED');
  assert.equal(deadLetter.deadLettered, true, 'jobs beyond retry limit should be dead-lettered');

  const loops = svc.detectRetryLoops([
    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 1, correlationId: 'CORR-LOOP' },
    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 2, correlationId: 'CORR-LOOP' },
    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 3, correlationId: 'CORR-LOOP' },
    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 4, correlationId: 'CORR-LOOP' }
  ], { tenantSlug: 'tabsons', threshold: 3 });
  assert.equal(loops.retryLoopDetected, true, 'retry loop detection should flag repeated retries');
  assert.ok(Object.isFrozen(loops.loops), 'retry loop output must be immutable');

  const processing = svc.processDueJobs({ tenantSlug: 'tabsons', limit: 3, dryRun: true }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(processing.success, true, 'due job processing should run safely in dry-run mode');
  assert.equal(processing.dryRun, true, 'dry-run processing must remain mutation-free');
  assert.ok(processing.processed.length >= 1, 'due job processing should surface eligible jobs');

  const report = svc.generateAsyncJobGovernanceReport({ tenantSlug: 'tabsons' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(report.success, true, 'async governance report should complete');
  assert.equal(report.readOnly, true, 'governance report should be read-only');
  assert.ok(report.queueHealth.activeJobs >= 1, 'active job count should be visible');
  assert.ok(report.retryQueues.retryPending >= 1, 'retry queue should be visible');
  assert.ok(report.failedJobs.failed >= 1, 'failed job summary should be visible');
  assert.ok(report.scheduledJobs.scheduled >= 1, 'scheduled jobs should be visible');
  assert.ok(report.queueCompatibility.supabaseEdgeFunctions === true, 'queue compatibility should include Supabase Edge Functions');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|payrollAmount|JOB-X/i, 'report must filter sensitive and cross-tenant data');

  assert.ok(global.DB.getAuditLogs().some(row => /ASYNC_JOB_/.test(row.actionType || row.action || '')), 'async job actions should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ASYNC_JOB_/.test(row.eventType)), 'async job telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ASYNC_JOB_ENQUEUED, 'async job metrics should aggregate safely');

  const previousNotification = global.NotificationOrchestrationService;
  global.NotificationOrchestrationService = null;
  const degraded = svc.generateAsyncJobGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing notification dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'NOTIFICATION_ORCHESTRATION_UNAVAILABLE'));
  global.NotificationOrchestrationService = previousNotification;

  const malformed = svc.enqueueJob('bad-payload', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, false, 'malformed payloads should be blocked safely');
  assert.equal(malformed.classification, 'HIGH_RISK', 'malformed payloads should not silently pass async governance');
}

main();
