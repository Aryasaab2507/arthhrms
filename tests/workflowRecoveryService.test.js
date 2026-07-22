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
  global.navigator = { userAgent: 'Node workflow recovery test', platform: 'Win32' };
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
  data.workflowFailureHistory = [
    { failureId: 'FAIL-ABC', workflowId: 'WF-ABC', tenantSlug: 'abc', state: 'RECOVERABLE', classification: 'API_FAILURE', timestamp: '2026-06-20T00:00:00.000Z', internalNote: 'ABC confidential' }
  ];
  data.workflowRecoveryHistory = [];
  data.workflowSnapshotHistory = [];
  data.workflowRecoveryAnalytics = [];
  data.auditLogs = [];
  data.notifications = [];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  load('db.js');
  load('services/auditService.js');
  load('services/errorService.js');
  load('services/errorHandlingFrameworkService.js');
  seedData();
  global.__ARTHHRMS_DEV__ = false;
  load('services/validationRegistryService.js');

  const notifications = [];
  const incidents = [];
  global.NotificationCenterService = {
    createNotification(payload) { notifications.push(payload); return { success: true, notification: { notificationId: `N-${notifications.length}` } }; }
  };
  global.operationsMonitoringService = {
    createIncident(payload) { incidents.push(payload); return { incidentId: `INC-${incidents.length}` }; }
  };

  global.__ARTHHRMS_DEV__ = true;
  load('services/workflowRecoveryService.js');

  const svc = global.WorkflowRecoveryService;
  assert.ok(svc, 'WorkflowRecoveryService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.WORKFLOW_STATES, [
    'CREATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RECOVERABLE',
    'RETRYING', 'ROLLED_BACK', 'ABANDONED'
  ]);
  assert.deepEqual(svc.RECOVERY_ACTIONS, ['RETRY', 'ROLLBACK', 'RESUME', 'MANUAL_REVIEW', 'ABANDON']);
  assert.equal(global.__ARTHHRMS_WORKFLOW_RECOVERY_SELF_TEST__.passed, true, 'development self-test should pass');
  [
    'detectWorkflowFailure', 'classifyFailure', 'retryWorkflow', 'rollbackWorkflow',
    'restoreWorkflowState', 'calculateRecoveryHealth', 'freezeRecoveryOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const context = {
    tenantSlug: 'tabsons', validatedTenantAccess: true,
    actor: { id: 'SA-1', role: 'SUPER_ADMIN', tenantSlug: 'tabsons' },
    now: '2026-06-21T00:00:00.000Z'
  };

  const failureInput = {
    workflowId: 'WF-1', workflowType: 'LEAVE_APPROVAL', tenantSlug: 'tabsons',
    state: 'PROCESSING', ownerId: 'EMP-1', source: 'api',
    error: { name: 'TimeoutError', message: 'Request timed out after 30000ms at C:\\private\\workflow.js' },
    stateData: { approvalId: 'APR-1', privateValue: 'salary-90000' }
  };
  const failure = svc.detectWorkflowFailure(failureInput, context);
  assert.equal(failure.success, true);
  assert.equal(failure.failure.classification, 'TIMEOUT_FAILURE');
  assert.equal(failure.failure.state, 'RECOVERABLE');
  assert.equal(failure.failure.recoveryRecommendation, 'RETRY');
  assert.ok(failure.failure.snapshotId);
  assert.ok(Object.isFrozen(failure));
  assert.doesNotMatch(JSON.stringify(failure), /private|salary-90000|C:\\private|30000ms/i, 'public failure output must not expose payloads or internal diagnostics');

  const historyAfterFirstFailure = global.DB.get().workflowFailureHistory.length;
  const duplicate = svc.detectWorkflowFailure(failureInput, context);
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.duplicatePrevented, true, 'duplicate failure reports should be idempotent');
  assert.equal(global.DB.get().workflowFailureHistory.length, historyAfterFirstFailure);

  assert.equal(svc.classifyFailure({ errorCode: 'VALIDATION_ERROR' }).classification, 'VALIDATION_FAILURE');
  assert.equal(svc.classifyFailure({ dependency: 'NotificationCenter', message: 'dependency unavailable' }).classification, 'DEPENDENCY_FAILURE');
  assert.equal(svc.classifyFailure({ partialExecution: true }).classification, 'PARTIAL_EXECUTION_FAILURE');
  assert.equal(svc.classifyFailure({ interrupted: true }).classification, 'INTERRUPTION_FAILURE');
  assert.doesNotThrow(() => svc.classifyFailure(null));

  const employeeDenied = svc.detectWorkflowFailure(
    { ...failureInput, workflowId: 'WF-EMPLOYEE' },
    { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } }
  );
  assert.equal(employeeDenied.success, false);
  assert.equal(employeeDenied.code, 'RECOVERY_GOVERNANCE_DENIED');
  const tenantDenied = svc.detectWorkflowFailure(
    { ...failureInput, workflowId: 'WF-ABC-DENIED', tenantSlug: 'abc' }, context
  );
  assert.equal(tenantDenied.success, false);
  assert.equal(tenantDenied.code, 'TENANT_ACCESS_DENIED');

  const retryFailure = await svc.retryWorkflow({ workflowId: 'WF-1', retryHandler: () => ({ success: false }) }, context);
  assert.equal(retryFailure.success, false);
  assert.equal(retryFailure.state, 'RECOVERABLE');
  assert.equal(retryFailure.retryCount, 1);
  const retrySuccess = await svc.retryWorkflow({ workflowId: 'WF-1', retryHandler: () => ({ success: true }) }, context);
  assert.equal(retrySuccess.success, true);
  assert.equal(retrySuccess.state, 'COMPLETED');
  assert.equal(retrySuccess.retryCount, 2);
  assert.equal((await svc.retryWorkflow({ workflowId: 'WF-1', retryHandler: () => ({ success: true }) }, context)).code, 'WORKFLOW_NOT_RECOVERABLE');

  const limitFailure = svc.detectWorkflowFailure({ ...failureInput, workflowId: 'WF-LIMIT', error: { message: 'API failure' } }, context);
  assert.equal(limitFailure.success, true);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await svc.retryWorkflow({ workflowId: 'WF-LIMIT', retryHandler: () => ({ success: false }) }, context);
    assert.equal(result.retryCount, attempt + 1);
  }
  const retryLimit = await svc.retryWorkflow({ workflowId: 'WF-LIMIT', retryHandler: () => ({ success: true }) }, context);
  assert.equal(retryLimit.success, false);
  assert.equal(retryLimit.code, 'RETRY_LIMIT_REACHED');
  assert.equal(retryLimit.requiresManualReview, true);

  svc.detectWorkflowFailure({ ...failureInput, workflowId: 'WF-CONCURRENT' }, context);
  let releaseRetry;
  const pendingRetry = svc.retryWorkflow({
    workflowId: 'WF-CONCURRENT',
    retryHandler: () => new Promise(resolve => { releaseRetry = resolve; })
  }, context);
  await Promise.resolve();
  const concurrentRetry = await svc.retryWorkflow({ workflowId: 'WF-CONCURRENT', retryHandler: () => ({ success: true }) }, context);
  assert.equal(concurrentRetry.code, 'RECOVERY_ALREADY_IN_PROGRESS');
  releaseRetry({ success: true });
  assert.equal((await pendingRetry).success, true);

  const restoreFailure = svc.detectWorkflowFailure({ ...failureInput, workflowId: 'WF-RESTORE', stateData: { step: 2 } }, context);
  const restored = svc.restoreWorkflowState({ workflowId: 'WF-RESTORE', snapshotId: restoreFailure.failure.snapshotId }, context);
  assert.equal(restored.success, true);
  assert.equal(restored.state, 'PROCESSING');
  assert.doesNotMatch(JSON.stringify(restored), /stateData|privateValue|salary/i, 'restoration output should remain metadata only');

  const corruptFailure = svc.detectWorkflowFailure({ ...failureInput, workflowId: 'WF-CORRUPT', stateData: { step: 3 } }, context);
  const corruptData = global.DB.get();
  const corruptSnapshot = corruptData.workflowSnapshotHistory.find(row => row.snapshotId === corruptFailure.failure.snapshotId);
  corruptSnapshot.stateData.step = 999;
  global.DB.save(corruptData);
  const corruptRestore = svc.restoreWorkflowState({ workflowId: 'WF-CORRUPT', snapshotId: corruptFailure.failure.snapshotId }, context);
  assert.equal(corruptRestore.success, false);
  assert.equal(corruptRestore.code, 'CHECKPOINT_INTEGRITY_FAILED');

  const rollbackFailure = svc.detectWorkflowFailure({ ...failureInput, workflowId: 'WF-ROLLBACK', ownerId: 'EMP-2', state: 'PENDING', stateData: { step: 1 } }, context);
  const rolledBack = await svc.rollbackWorkflow({ workflowId: 'WF-ROLLBACK', snapshotId: rollbackFailure.failure.snapshotId, rollbackHandler: () => ({ success: true }) }, context);
  assert.equal(rolledBack.success, true);
  assert.equal(rolledBack.state, 'ROLLED_BACK');
  const doubleRollback = await svc.rollbackWorkflow({ workflowId: 'WF-ROLLBACK', rollbackHandler: () => ({ success: true }) }, context);
  assert.equal(doubleRollback.success, false);
  assert.equal(doubleRollback.code, 'WORKFLOW_ALREADY_ROLLED_BACK');

  const review = svc.requestManualReview({ workflowId: 'WF-LIMIT', reason: 'Retry limit reached' }, context);
  assert.equal(review.success, true);
  assert.equal(review.action, 'MANUAL_REVIEW');
  const abandoned = svc.abandonWorkflow({ workflowId: 'WF-LIMIT', reason: 'Governed closure' }, context);
  assert.equal(abandoned.success, true);
  assert.equal(abandoned.state, 'ABANDONED');

  const health = svc.calculateRecoveryHealth({ tenantSlug: 'tabsons' }, context);
  assert.equal(health.success, true);
  assert.ok(health.recoveryScore >= 0 && health.recoveryScore <= 100);
  assert.ok(health.workflowResilienceScore >= 0 && health.workflowResilienceScore <= 100);
  assert.ok(health.operationalHealthScore >= 0 && health.operationalHealthScore <= 100);
  assert.ok(health.analytics.failureRate >= 0 && health.analytics.failureRate <= 100);
  assert.ok(health.analytics.retryRate >= 0 && health.analytics.retryRate <= 100);
  assert.doesNotMatch(JSON.stringify(health), /WF-ABC|ABC confidential|salary-90000|privateValue/i, 'recovery analytics must remain tenant scoped and sanitized');
  assert.ok(Object.isFrozen(health));
  const hrHealth = svc.calculateRecoveryHealth({ tenantSlug: 'tabsons' }, { ...context, actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } });
  assert.equal(hrHealth.success, true, 'HR receives tenant-scoped workflow visibility');
  const employeeStatus = svc.getWorkflowRecoveryStatus({ workflowId: 'WF-1' }, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } });
  assert.equal(employeeStatus.success, true, 'employee can view an owned workflow status');
  assert.equal(svc.getWorkflowRecoveryStatus({ workflowId: 'WF-ROLLBACK' }, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } }).success, false);

  const beforeEngineFailure = global.DB.get().workflowFailureHistory.length;
  global.__ARTHHRMS_DEV__ = false;
  global.authService = {
    getCurrentUser() {
      return { id: 'SA-1', role: 'SUPER_ADMIN', tenantSlug: 'tabsons', source: 'supabase', roleTrusted: true };
    }
  };
  global.WorkflowHandlers = {
    getHandler() { return true; },
    executeHandler(handlerName) {
      if (handlerName === 'notificationHandler') {
        return { handler: handlerName, failed: true, result: { success: false, warnings: [{ message: 'Notification dependency unavailable' }] } };
      }
      return { handler: handlerName, failed: false, result: { success: true, metadata: {} } };
    }
  };
  load('services/workflowEngine.js');
  const engineResult = global.workflowEngine.emitWorkflowEvent('GENERIC_NOTIFICATION', {
    eventId: 'WF-ENGINE-FAILURE', actorRole: 'HR', actorId: 'HR-1',
    metadata: { tenantSlug: 'tabsons' }, suppressNotification: true
  });
  assert.ok(engineResult.failedHandlers.length >= 1);
  assert.ok(global.DB.get().workflowFailureHistory.slice(beforeEngineFailure)
    .some(row => row.workflowId === 'WF-ENGINE-FAILURE'), 'workflow engine failures should hand off to recovery governance');

  const data = global.DB.get();
  assert.ok(data.workflowFailureHistory.some(row => row.tenantSlug === 'tabsons'));
  assert.ok(data.workflowRecoveryHistory.some(row => row.action === 'RETRY'));
  assert.ok(data.workflowRecoveryHistory.some(row => row.action === 'ROLLBACK'));
  assert.ok(data.auditLogs.some(row => /WORKFLOW_(FAILURE|RECOVERY|RETRY|ROLLBACK|RESTOR)/.test(String(row.actionType || row.action || row.type || ''))));
  assert.ok(notifications.length >= 1, 'manual review and terminal recovery states should notify governance');
  assert.ok(incidents.length >= 1, 'workflow failures should integrate with runtime monitoring');
  const frozen = svc.freezeRecoveryOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));

  console.log('workflowRecoveryService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
