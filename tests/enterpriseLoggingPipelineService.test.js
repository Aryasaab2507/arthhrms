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
  global.navigator = { userAgent: 'Node enterprise logging test', platform: 'Win32' };
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
    now: '2026-06-30T13:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-30T13:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-30T13:00:00.000Z'
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private logging data' }
  ];
  data.enterpriseLogHistory = [];
  data.logTransportHistory = [];
  data.logRetentionHistory = [];
  data.logSearchHistory = [];
  data.logAnalyticsHistory = [];
  data.logConfigHistory = [];
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
    'services/apiPayloadValidationService.js',
    'services/apiGatewayGovernanceService.js',
    'services/enterpriseRedisCacheService.js',
    'services/distributedQueueService.js',
    'services/sessionGovernanceService.js',
    'services/horizontalScalabilityService.js',
    'services/infrastructureObservabilityService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseLoggingPipelineService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('EnterpriseLoggingPipelineService should be exported');
    }
    throw error;
  }

  const svc = global.EnterpriseLoggingPipelineService;
  assert.ok(svc, 'EnterpriseLoggingPipelineService should be exported');
  assert.equal(global.enterpriseLoggingPipelineService, svc, 'lowercase logging service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'logging service export should be frozen');
  ['StructuredLogger', 'LoggingMiddleware', 'LogTransport', 'LogRetentionManager', 'LogSearchService', 'LogAnalyticsCollector'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['ELK_STACK', 'OPENSEARCH', 'LOKI', 'DATADOG', 'SPLUNK', 'AZURE_MONITOR', 'GOOGLE_CLOUD_LOGGING'].forEach(provider => {
    assert.ok(svc.LOG_PROVIDERS.includes(provider), `${provider} compatibility should be declared`);
  });
  ['APPLICATION', 'SECURITY', 'AUDIT', 'AUTHENTICATION', 'API', 'DATABASE', 'CACHE', 'QUEUE', 'WORKFLOW', 'NOTIFICATION', 'BACKGROUND_WORKER', 'SYSTEM'].forEach(category => {
    assert.ok(svc.LOG_CATEGORIES.includes(category), `${category} log category should be supported`);
  });
  ['TRACE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].forEach(level => {
    assert.ok(svc.LOG_LEVELS.includes(level), `${level} log level should be supported`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_LOGGING_SELF_TEST__.passed, true, 'development self-test should pass');

  const appLog = svc.StructuredLogger.writeLog({
    tenantSlug: 'tabsons',
    level: 'info',
    category: 'application',
    service: 'employee-api',
    module: 'Employee',
    eventType: 'EMPLOYEE_SEARCH',
    action: 'SEARCH_EMPLOYEES',
    status: 'SUCCESS',
    message: 'Employee search completed for user asha@example.com',
    requestId: 'REQ-100',
    traceId: 'TRACE-100',
    spanId: 'SPAN-100',
    correlationId: 'CORR-100',
    durationMs: 42,
    metadata: {
      resultCount: 12,
      email: 'asha@example.com',
      phone: '+91-9999999999',
      password: 'NeverLogMe123',
      token: 'secret-token',
      apiKey: 'api-key-secret',
      cookie: 'sessionid=abc',
      nested: { refreshToken: 'refresh-secret', safe: true }
    }
  }, ownerContext());
  assert.equal(appLog.success, true, 'structured application log should be written');
  assert.equal(appLog.log.level, 'INFO');
  assert.equal(appLog.log.category, 'APPLICATION');
  assert.equal(appLog.log.tenant_id, 'tabsons');
  assert.equal(appLog.log.user_id, 'PO-1');
  assert.equal(appLog.log.request_id, 'REQ-100');
  assert.equal(appLog.log.trace_id, 'TRACE-100');
  assert.equal(appLog.log.span_id, 'SPAN-100');
  assert.equal(appLog.log.correlation_id, 'CORR-100');
  assert.equal(appLog.log.event_type, 'EMPLOYEE_SEARCH');
  assert.equal(appLog.log.duration_ms, 42);
  assert.equal(appLog.log.nonBlocking, true, 'logging should be non-blocking');
  assert.equal(appLog.log.jsonStructured, true, 'logs should be JSON structured');
  assert.doesNotMatch(text(appLog), /NeverLogMe123|secret-token|api-key-secret|refresh-secret|sessionid=abc|asha@example.com|\+91-9999999999/i, 'structured logs must redact secrets and personal identifiers');

  const securityLog = svc.StructuredLogger.writeLog({
    tenantSlug: 'tabsons',
    level: 'critical',
    category: 'security',
    service: 'auth-service',
    module: 'Authentication',
    eventType: 'BRUTE_FORCE_DETECTED',
    action: 'LOCK_ACCOUNT',
    status: 'BLOCKED',
    message: 'Repeated login failures blocked.',
    requestId: 'REQ-SEC',
    traceId: 'TRACE-SEC',
    correlationId: 'CORR-SEC',
    metadata: { ip: '10.0.0.1', username: 'private-user@example.com' }
  }, ownerContext());
  assert.equal(securityLog.success, true, 'security log should write');
  assert.equal(securityLog.log.retentionDays, 2555, 'security logs should default to seven-year retention');

  const apiLog = svc.LoggingMiddleware.logRequest({
    tenantSlug: 'tabsons',
    method: 'POST',
    path: '/api/v1/employees',
    statusCode: 500,
    durationMs: 880,
    requestId: 'REQ-API',
    traceId: 'TRACE-API',
    spanId: 'SPAN-API',
    correlationId: 'CORR-API',
    userId: 'USR-API',
    headers: { authorization: 'Bearer api-secret', cookie: 'sid=secret' },
    body: { password: 'bad', employeeName: 'Private Person' }
  }, ownerContext());
  assert.equal(apiLog.success, true, 'API middleware log should write');
  assert.equal(apiLog.log.category, 'API');
  assert.equal(apiLog.log.status, 'ERROR');
  assert.doesNotMatch(text(apiLog), /api-secret|sid=secret|Private Person|password/i, 'middleware logs must sanitize request details');

  const transport = svc.LogTransport.flushBuffer({ tenantSlug: 'tabsons', batchSize: 25, compression: true }, ownerContext());
  assert.equal(transport.success, true, 'log transport should flush buffered logs');
  assert.ok(transport.transport.batchSize <= 25);
  assert.equal(transport.transport.asynchronous, true);
  assert.equal(transport.transport.requestBlocking, false);

  const search = svc.LogSearchService.searchLogs({
    tenantSlug: 'tabsons',
    level: 'ERROR',
    category: 'API',
    requestId: 'REQ-API',
    traceId: 'TRACE-API',
    dateFrom: '2026-06-30T00:00:00.000Z',
    dateTo: '2026-06-30T23:59:59.000Z'
  }, directorContext());
  assert.equal(search.success, true, 'log search should work');
  assert.equal(search.results.length, 1, 'log search should filter by category, level, request, trace, and date');
  assert.equal(search.results[0].request_id, 'REQ-API');
  assert.equal(search.indexedSearch, true, 'search should report indexed mode');
  assert.doesNotMatch(text(search), /ABC private|api-secret|Private Person/i, 'search results must remain sanitized and tenant-scoped');

  const correlation = svc.LogSearchService.reconstructRequest({
    tenantSlug: 'tabsons',
    correlationId: 'CORR-API'
  }, directorContext());
  assert.equal(correlation.success, true, 'correlation reconstruction should work');
  assert.equal(correlation.request.correlation_id, 'CORR-API');
  assert.ok(correlation.timeline.length >= 1);

  const retention = svc.LogRetentionManager.evaluateRetention({
    tenantSlug: 'tabsons',
    policies: {
      SECURITY: 2555,
      AUDIT: 2555,
      APPLICATION: 90,
      DEBUG: 30
    }
  }, ownerContext());
  assert.equal(retention.success, true, 'retention evaluation should work');
  assert.equal(retention.policies.SECURITY.retentionDays, 2555);
  assert.equal(retention.policies.AUDIT.retentionDays, 2555);
  assert.equal(retention.policies.APPLICATION.retentionDays, 90);
  assert.equal(retention.policies.DEBUG.retentionDays, 30);
  assertScore(retention.retentionComplianceScore, 'retention compliance score');

  const archive = svc.LogRetentionManager.archiveExpiredLogs({
    tenantSlug: 'tabsons',
    referenceDate: '2033-07-01T00:00:00.000Z'
  }, ownerContext());
  assert.equal(archive.success, true, 'automatic archival should run');
  assert.ok(archive.archivedCount >= 1, 'expired logs should be archived');
  assert.equal(archive.hardDeletePerformed, false, 'retention should not hard-delete logs');

  const analytics = svc.LogAnalyticsCollector.generateLogAnalytics({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(analytics.success, true, 'log analytics should generate');
  assert.ok(analytics.errorFrequency >= 1);
  assert.ok(analytics.apiFailures >= 1);
  assert.ok(analytics.authenticationFailures >= 0);
  assertScore(analytics.loggingHealthScore, 'logging health score');
  assertScore(analytics.operationalScore, 'operational score');
  assertScore(analytics.incidentReadinessScore, 'incident readiness score');

  const report = svc.LogAnalyticsCollector.generateEnterpriseLogReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'enterprise log report should generate');
  assert.equal(report.tenantSlug, 'tabsons');
  assert.ok(report.architecture.providerAgnostic);
  assert.ok(report.dashboard.enterpriseLogCenter);
  assert.ok(report.search.indexedSearch);
  assert.ok(report.performance.asynchronousLogging);
  assert.ok(report.performance.requestsNeverBlocked);
  assertScore(report.loggingHealthScore, 'report logging health score');
  assertScore(report.operationalScore, 'report operational score');
  assertScore(report.incidentReadinessScore, 'report incident readiness score');
  assert.doesNotMatch(text(report), /ABC private|NeverLogMe123|secret-token|private-user@example.com|Private Person/i, 'report should not expose cross-tenant data or sensitive values');

  const denied = svc.StructuredLogger.writeLog({
    tenantSlug: 'abc',
    level: 'INFO',
    category: 'APPLICATION',
    message: 'ABC private logging data',
    metadata: { privateNote: 'ABC private logging data' }
  }, ownerContext('tabsons'));
  assert.equal(denied.success, false, 'cross-tenant logging action should be denied');
  assert.equal(denied.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(denied), /ABC private logging data|privateNote/i, 'cross-tenant denial must not leak private data');

  const employeeDenied = svc.LogSearchService.searchLogs({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeDenied.success, false, 'employees should not access centralized log search');
  assert.equal(employeeDenied.code, 'LOGGING_GOVERNANCE_DENIED');

  const malformed = svc.StructuredLogger.writeLog(null, ownerContext());
  assert.equal(malformed.success, true, 'malformed log payloads should degrade into safe structured logs');
  assert.equal(malformed.log.category, 'APPLICATION');

  const transportDown = svc.LogTransport.flushBuffer({ tenantSlug: 'tabsons', storageAvailable: false }, ownerContext());
  assert.equal(transportDown.success, true, 'transport storage outages should degrade safely');
  assert.equal(transportDown.transport.degradationMode, 'LOCAL_BUFFER_ONLY');

  const frozen = svc.freezeLoggingOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'logging outputs should be deeply frozen');

  const stored = global.DB.get();
  assert.ok(stored.enterpriseLogHistory.length >= 4, 'log history should be recorded');
  assert.ok(stored.logTransportHistory.length >= 1, 'transport history should be recorded');
  assert.ok(stored.logRetentionHistory.length >= 1, 'retention history should be recorded');
  assert.ok(stored.logSearchHistory.length >= 1, 'search history should be recorded');
  assert.ok(stored.logAnalyticsHistory.length >= 1, 'analytics history should be recorded');
  assert.ok(stored.logConfigHistory.length >= 1, 'logging config history should be recorded');
  assert.ok((stored.auditLogs || []).some(row => /LOGGING|LOG_SEARCH|LOG_RETENTION|LOG_EXPORT|STRUCTURED_LOG/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'logging governance should be audited');
  assert.doesNotMatch(text(stored.enterpriseLogHistory), /NeverLogMe123|secret-token|api-key-secret|refresh-secret|sessionid=abc|private-user@example.com|ABC private logging data/i, 'log histories should not persist secrets or cross-tenant private data');

  console.log('enterpriseLoggingPipelineService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
