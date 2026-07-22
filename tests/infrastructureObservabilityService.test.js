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
  global.navigator = { userAgent: 'Node infrastructure observability test', platform: 'Win32' };
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
    now: '2026-06-30T12:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-30T12:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-30T12:00:00.000Z'
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private observability data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'ABC Private', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', privateNote: 'never expose observability' }
  ];
  data.apiGatewayRequestHistory = [
    { requestId: 'REQ-1', tenantSlug: 'tabsons', method: 'GET', path: '/api/v1/employees', outcome: 'COMPLETED', latencyMs: 88, durationMs: 95, statusCode: 200, timestamp: '2026-06-30T11:58:00.000Z', immutable: true },
    { requestId: 'REQ-2', tenantSlug: 'tabsons', method: 'POST', path: '/api/v1/reports', outcome: 'FAILED', latencyMs: 820, durationMs: 840, statusCode: 500, timestamp: '2026-06-30T11:59:00.000Z', immutable: true },
    { requestId: 'REQ-X', tenantSlug: 'abc', method: 'GET', path: '/api/v1/private', outcome: 'COMPLETED', latencyMs: 42, statusCode: 200, privateNote: 'ABC private observability data', immutable: true }
  ];
  data.cacheMetricsHistory = [
    { tenantSlug: 'tabsons', hitRate: 84, missRate: 16, memoryUsageMb: 148, timestamp: '2026-06-30T11:56:00.000Z', immutable: true },
    { tenantSlug: 'abc', hitRate: 99, missRate: 1, memoryUsageMb: 3, privateNote: 'ABC private observability data', immutable: true }
  ];
  data.distributedQueueJobs = [
    { jobId: 'DQ-1', tenantSlug: 'tabsons', jobType: 'notification_delivery', priority: 'HIGH', state: 'QUEUED', attempts: 0, maxAttempts: 3, immutable: true },
    { jobId: 'DQ-2', tenantSlug: 'tabsons', jobType: 'report_generation', priority: 'NORMAL', state: 'PROCESSING', attempts: 1, maxAttempts: 3, immutable: true },
    { jobId: 'DQ-X', tenantSlug: 'abc', jobType: 'payroll_calculations', priority: 'CRITICAL', state: 'QUEUED', privateNote: 'ABC private observability data', immutable: true }
  ];
  data.sessionHistory = [
    { sessionId: 'S-1', tenantSlug: 'tabsons', userId: 'EMP-1', state: 'ACTIVE', immutable: true },
    { sessionId: 'S-X', tenantSlug: 'abc', userId: 'EMP-X', state: 'ACTIVE', privateNote: 'ABC private observability data', immutable: true }
  ];
  data.loginSecurityAttemptHistory = [
    { attemptId: 'LA-1', tenantSlug: 'tabsons', outcome: 'FAILED', riskScore: 64, immutable: true }
  ];
  data.horizontalScalingWorkerHistory = [
    { workerPoolId: 'HSW-1', tenantSlug: 'tabsons', workerType: 'QUEUE_WORKER', currentWorkers: 2, desiredWorkers: 3, queueLength: 80, workerUtilization: 68, immutable: true }
  ];
  data.observabilityMetricsHistory = [];
  data.observabilityTraceHistory = [];
  data.observabilityHealthHistory = [];
  data.observabilityAlertHistory = [];
  data.observabilityServiceMapHistory = [];
  data.observabilityConfigHistory = [];
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
    'services/horizontalScalabilityService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/infrastructureObservabilityService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('InfrastructureObservabilityService should be exported');
    }
    throw error;
  }

  const svc = global.InfrastructureObservabilityService;
  assert.ok(svc, 'InfrastructureObservabilityService should be exported');
  assert.equal(global.infrastructureObservabilityService, svc, 'lowercase observability service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'observability service export should be frozen');
  ['TelemetryService', 'MetricsCollector', 'TracingService', 'HealthCheckService', 'AlertManager', 'ServiceMapBuilder'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['OPENTELEMETRY', 'PROMETHEUS', 'GRAFANA', 'DATADOG', 'NEW_RELIC', 'AZURE_MONITOR'].forEach(provider => {
    assert.ok(svc.OBSERVABILITY_PROVIDERS.includes(provider), `${provider} compatibility should be declared`);
  });
  assert.equal(global.__ARTHHRMS_INFRASTRUCTURE_OBSERVABILITY_SELF_TEST__.passed, true, 'development self-test should pass');

  const applicationMetrics = svc.MetricsCollector.collectApplicationMetrics({
    tenantSlug: 'tabsons',
    requestCount: 240,
    activeUsers: 38,
    activeSessions: 22,
    authenticationFailures: 1,
    databaseLatencyMs: 42
  }, ownerContext());
  assert.equal(applicationMetrics.success, true, 'application metrics should collect');
  assert.equal(applicationMetrics.tenantSlug, 'tabsons');
  assert.ok(applicationMetrics.apiLatencyMs >= 0);
  assert.ok(applicationMetrics.requestCount >= 240);
  assert.ok(applicationMetrics.errorRate >= 0);
  assert.ok(applicationMetrics.cacheHitRatio >= 0);
  assert.ok(applicationMetrics.queueThroughput >= 0);
  assertScore(applicationMetrics.platformHealthScore, 'application platform health score');
  assert.doesNotMatch(text(applicationMetrics), /ABC private|never expose|token|secret/i, 'application metrics must not expose cross-tenant or secret data');

  const infrastructureMetrics = svc.MetricsCollector.collectInfrastructureMetrics({
    tenantSlug: 'tabsons',
    cpu: 72,
    memory: 64,
    disk: 58,
    network: 46,
    redisLatencyMs: 7,
    postgresqlLatencyMs: 38,
    queueWorkers: 4,
    backgroundWorkers: 2
  }, ownerContext());
  assert.equal(infrastructureMetrics.success, true, 'infrastructure metrics should collect');
  assertScore(infrastructureMetrics.infrastructureHealthScore, 'infrastructure health score');
  assert.ok(infrastructureMetrics.utilization.cpu === 72);

  const trace = svc.TracingService.startTrace({
    tenantSlug: 'tabsons',
    requestPath: '/api/v1/employees',
    method: 'GET',
    serviceName: 'Gateway',
    spans: [
      { name: 'api', service: 'API', durationMs: 28, status: 'OK' },
      { name: 'database', service: 'Database', durationMs: 41, status: 'OK' },
      { name: 'queue', service: 'Queue', durationMs: 12, status: 'OK' }
    ],
    headers: { authorization: 'Bearer secret-token', 'x-debug': 'never expose' }
  }, ownerContext());
  assert.equal(trace.success, true, 'distributed trace should start');
  assert.ok(trace.traceId && trace.spanId && trace.correlationId, 'trace identifiers should be generated');
  assert.equal(trace.tenantSlug, 'tabsons');
  assert.ok(trace.timeline.length >= 3, 'trace timeline should include spans');
  assert.doesNotMatch(text(trace), /secret-token|authorization|never expose/i, 'trace output must sanitize headers and secrets');

  const health = svc.HealthCheckService.runHealthChecks({
    tenantSlug: 'tabsons',
    dependencies: {
      database: true,
      redis: true,
      queue: true,
      storage: true,
      notifications: true,
      authentication: true
    }
  }, ownerContext());
  assert.equal(health.success, true, 'health checks should run');
  assert.equal(health.endpoints.health.path, '/health');
  assert.equal(health.endpoints.ready.path, '/ready');
  assert.equal(health.endpoints.live.path, '/live');
  assert.equal(health.summary.status, 'HEALTHY');
  assertScore(health.availabilityScore, 'availability score');

  const degraded = svc.HealthCheckService.runHealthChecks({
    tenantSlug: 'tabsons',
    dependencies: { database: true, redis: false, queue: true, storage: true, notifications: false, authentication: true }
  }, ownerContext());
  assert.equal(degraded.success, true, 'degraded health checks should still return safely');
  assert.ok(['DEGRADED', 'CRITICAL'].includes(degraded.summary.status));
  assert.ok(degraded.alertRecommendations.some(row => row.severity === 'WARNING' || row.severity === 'CRITICAL'));

  const alerts = svc.AlertManager.evaluateAlerts({
    tenantSlug: 'tabsons',
    metrics: {
      apiLatencyMs: 920,
      errorRate: 12,
      queueBacklog: 360,
      redisAvailable: false,
      databaseAvailable: true,
      workerFailures: 2,
      authenticationFailures: 7,
      diskFreePercent: 8
    }
  }, ownerContext());
  assert.equal(alerts.success, true, 'alerts should evaluate');
  assert.ok(alerts.alerts.some(alert => alert.rule === 'API_LATENCY'));
  assert.ok(alerts.alerts.some(alert => alert.rule === 'REDIS_UNAVAILABLE'));
  assert.ok(alerts.alerts.some(alert => alert.severity === 'CRITICAL'));
  assertScore(alerts.serviceReliabilityScore, 'alert reliability score');

  const acknowledged = svc.AlertManager.acknowledgeAlert({
    tenantSlug: 'tabsons',
    alertId: alerts.alerts[0].alertId,
    acknowledgementNote: 'Investigating from platform operations.'
  }, ownerContext());
  assert.equal(acknowledged.success, true, 'alert acknowledgement should succeed');
  assert.equal(acknowledged.alert.status, 'ACKNOWLEDGED');

  const serviceMap = svc.ServiceMapBuilder.buildServiceMap({
    tenantSlug: 'tabsons',
    dependencies: {
      gateway: 'HEALTHY',
      api: 'HEALTHY',
      redis: 'DEGRADED',
      database: 'HEALTHY',
      queue: 'HEALTHY',
      notifications: 'DEGRADED',
      storage: 'HEALTHY'
    }
  }, directorContext());
  assert.equal(serviceMap.success, true, 'service map should build');
  assert.ok(serviceMap.nodes.some(node => node.id === 'gateway'));
  assert.ok(serviceMap.edges.some(edge => edge.from === 'gateway' && edge.to === 'api'));
  assertScore(serviceMap.operationalMaturityScore, 'operational maturity score');

  const report = svc.TelemetryService.generateObservabilityReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'observability report should generate');
  assert.equal(report.tenantSlug, 'tabsons');
  assert.ok(report.architecture.vendorNeutral);
  assert.ok(report.dashboards.infrastructureObservabilityCenter);
  assert.ok(report.tracing.distributedTracingReady);
  assert.ok(report.health.endpoints.health.path === '/health');
  assert.ok(report.serviceMap.nodes.length >= 7);
  assertScore(report.platformHealthScore, 'report platform health score');
  assertScore(report.infrastructureHealthScore, 'report infrastructure health score');
  assertScore(report.serviceReliabilityScore, 'report service reliability score');
  assertScore(report.availabilityScore, 'report availability score');
  assertScore(report.operationalMaturityScore, 'report operational maturity score');
  assert.equal(report.performance.monitoringOverheadCpuPercent <= 2, true, 'monitoring overhead should stay under 2 percent CPU');
  assert.equal(report.performance.memoryBudgetMb <= 100, true, 'monitoring memory budget should stay under 100MB RAM');
  assert.doesNotMatch(text(report), /ABC private|never expose observability|secret-token|authorization/i, 'report should not leak cross-tenant or sensitive data');

  const denied = svc.MetricsCollector.collectApplicationMetrics({
    tenantSlug: 'abc',
    requestCount: 1,
    privateNote: 'ABC private observability data'
  }, ownerContext('tabsons'));
  assert.equal(denied.success, false, 'cross-tenant observability access should be denied');
  assert.equal(denied.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(denied), /ABC private observability data|privateNote/i, 'cross-tenant denial must not leak private data');

  const employeeDenied = svc.TelemetryService.generateObservabilityReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeDenied.success, false, 'employees should not access infrastructure observability reports');
  assert.equal(employeeDenied.code, 'OBSERVABILITY_GOVERNANCE_DENIED');

  const frozen = svc.freezeObservabilityOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'observability outputs should be deeply frozen');

  const stored = global.DB.get();
  assert.ok(stored.observabilityMetricsHistory.length >= 2, 'metrics history should be recorded');
  assert.ok(stored.observabilityTraceHistory.length >= 1, 'trace history should be recorded');
  assert.ok(stored.observabilityHealthHistory.length >= 1, 'health history should be recorded');
  assert.ok(stored.observabilityAlertHistory.length >= 1, 'alert history should be recorded');
  assert.ok(stored.observabilityServiceMapHistory.length >= 1, 'service map history should be recorded');
  assert.ok(stored.observabilityConfigHistory.length >= 1, 'observability configuration history should be recorded');
  assert.ok((stored.auditLogs || []).some(row => /OBSERVABILITY|TELEMETRY|HEALTH|ALERT/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'observability governance should be audited');
  assert.doesNotMatch(text(stored.observabilityMetricsHistory), /ABC private|never expose observability|secret-token|authorization/i, 'observability histories should not persist secrets or cross-tenant data');

  console.log('infrastructureObservabilityService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
