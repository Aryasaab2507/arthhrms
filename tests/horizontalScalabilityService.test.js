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
  global.navigator = { userAgent: 'Node horizontal scalability test', platform: 'Win32' };
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
    now: '2026-06-30T11:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-30T11:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-30T11:00:00.000Z'
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private scaling data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'ABC Private', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', privateNote: 'never expose' }
  ];
  data.horizontalScalingInstanceHistory = [];
  data.horizontalScalingWorkerHistory = [];
  data.horizontalScalingCapacityPlans = [];
  data.horizontalScalingMetricsHistory = [];
  data.horizontalScalingRecommendationHistory = [];
  data.horizontalScalingConfigurationHistory = [];
  data.distributedQueueJobs = [
    { jobId: 'DQ-1', tenantSlug: 'tabsons', jobType: 'notification_delivery', priority: 'HIGH', state: 'QUEUED', attempts: 0, maxAttempts: 3, immutable: true },
    { jobId: 'DQ-2', tenantSlug: 'tabsons', jobType: 'report_generation', priority: 'NORMAL', state: 'PROCESSING', attempts: 1, maxAttempts: 3, immutable: true },
    { jobId: 'DQ-X', tenantSlug: 'abc', jobType: 'payroll_calculations', priority: 'CRITICAL', state: 'QUEUED', privateNote: 'ABC private scaling data', immutable: true }
  ];
  data.cacheMetricsHistory = [
    { tenantSlug: 'tabsons', hitRate: 82, missRate: 18, memoryUsageMb: 128, timestamp: '2026-06-30T10:50:00.000Z', immutable: true }
  ];
  data.sessionHistory = [
    { sessionId: 'S-1', tenantSlug: 'tabsons', userId: 'EMP-1', state: 'ACTIVE', immutable: true }
  ];
  data.apiGatewayRequestHistory = [
    { requestId: 'REQ-1', tenantSlug: 'tabsons', method: 'GET', path: '/api/v1/employees', outcome: 'COMPLETED', latencyMs: 88, timestamp: '2026-06-30T10:58:00.000Z', immutable: true },
    { requestId: 'REQ-2', tenantSlug: 'tabsons', method: 'GET', path: '/api/v1/reports', outcome: 'COMPLETED', latencyMs: 142, timestamp: '2026-06-30T10:59:00.000Z', immutable: true }
  ];
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
    'services/sessionGovernanceService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/horizontalScalabilityService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.HorizontalScalabilityService;
  assert.ok(svc, 'HorizontalScalabilityService should be exported');
  assert.equal(global.horizontalScalabilityService, svc, 'lowercase scalability service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'scalability service export should be frozen');
  ['ScalabilityManager', 'CapacityPlanner', 'WorkerScaler', 'InfrastructureHealthService', 'ScalingRecommendationEngine', 'InfrastructureMetricsCollector'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['NGINX', 'HAPROXY', 'AWS_ALB', 'AZURE_APPLICATION_GATEWAY', 'GOOGLE_CLOUD_LOAD_BALANCER'].forEach(provider => {
    assert.ok(svc.LOAD_BALANCER_PROVIDERS.includes(provider), `${provider} load balancer provider should be supported`);
  });
  ['API_NODE', 'QUEUE_WORKER', 'BACKGROUND_WORKER', 'SCHEDULER_WORKER', 'NOTIFICATION_WORKER'].forEach(type => {
    assert.ok(svc.WORKER_TYPES.includes(type), `${type} worker type should be supported`);
  });
  assert.equal(global.__ARTHHRMS_HORIZONTAL_SCALABILITY_SELF_TEST__.passed, true, 'development self-test should pass');

  const instance = svc.ScalabilityManager.registerInstance({
    tenantSlug: 'tabsons',
    instanceId: 'api-node-a',
    instanceType: 'API_NODE',
    loadBalancerProvider: 'AWS_ALB',
    forwardedHeaders: {
      'x-forwarded-for': '10.0.0.10',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'hr.tabsons.example'
    },
    runtimeState: { processLocalSessions: false, inMemoryTenantCaches: false, singletonBusinessState: false, secret: 'hidden-secret' },
    metrics: { cpu: 62, memory: 58, responseTimeMs: 120, concurrentUsers: 180 }
  }, ownerContext());
  assert.equal(instance.success, true, 'instance registration should succeed');
  assert.equal(instance.instance.state, 'ACTIVE');
  assert.equal(instance.instance.stateless, true);
  assert.equal(instance.instance.loadBalancerReady, true);
  assert.equal(instance.governance.statelessArchitecturePreserved, true);
  assert.equal(instance.governance.tenantIsolationPreserved, true);
  assert.doesNotMatch(text(instance), /hidden-secret|secret/i, 'scalability outputs should not expose secrets');

  const stateless = svc.ScalabilityManager.assessStatelessArchitecture({
    tenantSlug: 'tabsons',
    runtimeState: { processLocalSessions: false, inMemoryTenantCaches: false, singletonBusinessState: false },
    sharedState: { redis: true, database: true, queue: true, objectStorage: true }
  }, ownerContext());
  assert.equal(stateless.success, true, 'stateless architecture assessment should succeed');
  assert.equal(stateless.statelessArchitecturePreserved, true);
  assert.equal(stateless.sharedState.redis, true);

  const sessionStrategy = svc.ScalabilityManager.validateDistributedSessionStrategy({
    tenantSlug: 'tabsons',
    instances: ['api-node-a', 'api-node-b'],
    sessionId: 'S-1',
    redisBacked: true,
    sharedAuthenticationState: true,
    logoutPropagation: true,
    tokenValidation: true,
    sessionRevocation: true
  }, ownerContext());
  assert.equal(sessionStrategy.success, true, 'distributed session strategy should validate');
  assert.equal(sessionStrategy.distributedSessionsReady, true);

  const worker = svc.WorkerScaler.scaleWorkerPool({
    tenantSlug: 'tabsons',
    workerType: 'QUEUE_WORKER',
    currentWorkers: 2,
    desiredWorkers: 5,
    queueLength: 240,
    workerUtilization: 91,
    autoscalingMode: 'RECOMMEND_ONLY'
  }, ownerContext());
  assert.equal(worker.success, true, 'worker pool scaling recommendation should succeed');
  assert.equal(worker.workerPool.workerType, 'QUEUE_WORKER');
  assert.equal(worker.workerPool.desiredWorkers, 5);
  assert.equal(worker.autonomousScalingExecuted, false, 'scaling preparation must not execute infrastructure changes');
  assert.ok(worker.recommendations.some(item => item.action === 'SCALE_OUT'), 'high utilization should recommend scale out');

  const plan = svc.CapacityPlanner.generateCapacityPlan({
    tenantSlug: 'tabsons',
    employeeTargets: [100, 500, 1000, 5000, 10000],
    currentEmployees: 320,
    averageRequestsPerEmployeePerDay: 22
  }, directorContext());
  assert.equal(plan.success, true, 'capacity planning should succeed');
  assert.deepEqual(plan.supportedEmployeeTargets, [100, 500, 1000, 5000, 10000]);
  assert.equal(plan.capacityTiers.length, 5);
  assert.ok(plan.capacityTiers.find(row => row.employees === 10000).expectedApiRequestsPerDay > plan.capacityTiers.find(row => row.employees === 100).expectedApiRequestsPerDay);
  assertScore(plan.capacityScore, 'capacity score');

  const health = svc.InfrastructureHealthService.evaluateInfrastructureHealth({
    tenantSlug: 'tabsons',
    metrics: {
      cpu: 78,
      memory: 72,
      queueLength: 240,
      responseTimeMs: 180,
      workerUtilization: 91,
      databaseUtilization: 64,
      cacheUtilization: 70,
      concurrentUsers: 420
    },
    redisAvailable: true,
    connectionPoolAvailable: true,
    loadBalancerHealthy: true
  }, directorContext());
  assert.equal(health.success, true, 'infrastructure health should evaluate');
  assertScore(health.scalabilityScore, 'scalability score');
  assertScore(health.infrastructureReadinessScore, 'infrastructure readiness score');
  assertScore(health.capacityScore, 'capacity score');
  assert.equal(health.degradationMode, 'NONE');

  const redisDown = svc.InfrastructureHealthService.evaluateInfrastructureHealth({
    tenantSlug: 'tabsons',
    metrics: { cpu: 60, memory: 60, queueLength: 40, responseTimeMs: 140, workerUtilization: 62 },
    redisAvailable: false,
    connectionPoolAvailable: true,
    loadBalancerHealthy: true
  }, directorContext());
  assert.equal(redisDown.success, true, 'Redis outage should degrade gracefully');
  assert.equal(redisDown.degradationMode, 'DATABASE_QUEUE_FALLBACK');
  assert.ok(redisDown.warnings.some(item => item.code === 'REDIS_UNAVAILABLE'));

  const recommendations = svc.ScalingRecommendationEngine.generateScalingRecommendations({
    tenantSlug: 'tabsons',
    metrics: { cpu: 86, memory: 82, queueLength: 380, responseTimeMs: 420, workerUtilization: 93, concurrentUsers: 520 }
  }, directorContext());
  assert.equal(recommendations.success, true, 'scaling recommendations should generate');
  assert.ok(recommendations.recommendations.some(item => item.action === 'ADD_API_NODES'));
  assert.ok(recommendations.recommendations.some(item => item.action === 'SCALE_WORKERS'));
  assert.ok(recommendations.autonomousInfrastructureChanges === false);

  const metrics = svc.InfrastructureMetricsCollector.collectMetrics({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(metrics.success, true, 'metrics should collect');
  assert.ok(metrics.requestsPerSecond >= 0);
  assert.ok(metrics.concurrentUsers >= 0);
  assert.ok(metrics.activeWorkers >= 0);
  assertScore(metrics.scalabilityScore, 'metrics scalability score');

  const report = svc.ScalabilityManager.generateScalabilityReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'scalability operations report should render');
  assert.equal(report.architecture.statelessApplication, true);
  assert.equal(report.loadBalancerReadiness.xForwardedHeaders, true);
  assert.equal(report.databaseScaling.readReplicasReady, true);
  assert.equal(report.autoscaling.kubernetesFutureReady, true);
  assert.ok(report.activeInstances.length >= 1);
  assert.ok(report.workerHealth.length >= 1);
  assertScore(report.scalabilityScore, 'report scalability score');
  assertScore(report.infrastructureReadinessScore, 'report infrastructure readiness score');
  assertScore(report.capacityScore, 'report capacity score');
  assert.doesNotMatch(text(report), /never expose|ABC Private|ABC private scaling data|secret/i, 'reports must not expose cross-tenant or secret data');

  const denied = svc.ScalabilityManager.registerInstance({
    tenantSlug: 'abc',
    instanceId: 'api-node-x',
    instanceType: 'API_NODE',
    runtimeState: { singletonBusinessState: true, privateNote: 'ABC private scaling data' }
  }, ownerContext('tabsons'));
  assert.equal(denied.success, false, 'cross-tenant scaling action should be denied');
  assert.equal(denied.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(denied), /ABC private scaling data|privateNote|ABC Private/i, 'cross-tenant denial must not leak tenant data');

  const employeeDenied = svc.CapacityPlanner.generateCapacityPlan({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeDenied.success, false, 'employees should not access scalability capacity planning');
  assert.equal(employeeDenied.code, 'SCALABILITY_GOVERNANCE_DENIED');

  const frozen = svc.freezeScalabilityOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'scalability outputs should be deeply frozen');

  const data = global.DB.get();
  assert.ok(data.horizontalScalingInstanceHistory.length >= 1, 'instance history should be recorded');
  assert.ok(data.horizontalScalingWorkerHistory.length >= 1, 'worker history should be recorded');
  assert.ok(data.horizontalScalingCapacityPlans.length >= 1, 'capacity plan history should be recorded');
  assert.ok(data.horizontalScalingMetricsHistory.length >= 1, 'metrics history should be recorded');
  assert.ok(data.horizontalScalingRecommendationHistory.length >= 1, 'recommendation history should be recorded');
  assert.ok(data.horizontalScalingConfigurationHistory.length >= 1, 'configuration history should be recorded');
  assert.ok((data.auditLogs || []).some(row => /SCALABILITY|HORIZONTAL_SCALING|CAPACITY|WORKER_SCALING/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'scalability governance should be audited');
  assert.doesNotMatch(text(data.horizontalScalingInstanceHistory), /hidden-secret|ABC Private|never expose|ABC private scaling data/i, 'scalability histories should not persist secrets or cross-tenant private data');

  console.log('horizontalScalabilityService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
