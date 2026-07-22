const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

let networkCalls = 0;
function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.fetch = async () => { networkCalls += 1; throw new Error('Network access is forbidden in performance service tests.'); };
  global.XMLHttpRequest = class ForbiddenXMLHttpRequest { open() { networkCalls += 1; throw new Error('XHR is forbidden.'); } };
  global.navigator = { userAgent: 'Node Performance UAT test', platform: 'Win32', onLine: true };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/performance-testing-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'ADMIN', tenantSlug = 'tabsons', id = 'ADMIN-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-19T10:00:00.000Z' };
}

const TABLES = [
  'performanceTestSuites', 'performanceTestRuns', 'performanceTestSamples', 'performanceTestEvents',
  'performanceBenchmarks', 'performanceScalabilityAnalyses', 'performanceCapacityPlans',
  'performanceTestAnalytics', 'performanceTestExports', 'performanceTestBackgroundJobs',
  'performanceTestCheckpoints', 'performanceTestAuditHistory'
];

const PROTECTED_TABLES = [
  'employees', 'attendance', 'leaveRequests', 'leaveBalances', 'payroll', 'payrollRuns',
  'payrollRecords', 'documents', 'notifications', 'recruitment', 'performanceReviews',
  'reports', 'workflows', 'approvals', 'asyncJobs', 'distributedQueueJobs',
  'enterpriseRedisCacheMetrics', 'gatewayRequestHistory', 'observabilityMetricsHistory',
  'observabilityHealthHistory', 'workerPools', 'sessions'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [
    { tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'private company data' }
  ];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', salary: 60000, employeeEmail: 'employee@example.test' },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', salary: 999999, privateNote: 'private company data' }
  ];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'APPROVED' }];
  data.leaveBalances = [{ id: 'LB-1', tenantSlug: 'tabsons', employeeId: 'E1', balance: 12 }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.payrollRuns = [{ id: 'PAYRUN-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.payrollRecords = [{ id: 'PAYREC-1', tenantSlug: 'tabsons', employeeId: 'E1', net: 50000 }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.recruitment = [{ id: 'REC-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.performanceReviews = [{ id: 'PERF-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'COMPLETE' }];
  data.reports = [{ id: 'REPORT-1', tenantSlug: 'tabsons', status: 'GENERATED' }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.asyncJobs = [{ jobId: 'ASYNC-1', tenantSlug: 'tabsons', state: 'QUEUED' }];
  data.distributedQueueJobs = [{ jobId: 'DQ-1', tenantSlug: 'tabsons', state: 'QUEUED', payload: { secret: 'hidden' } }];
  data.enterpriseRedisCacheMetrics = [{ tenantSlug: 'tabsons', hitRate: 90, memoryUsageMb: 128 }];
  data.gatewayRequestHistory = [{ requestId: 'REQ-1', tenantSlug: 'tabsons', latencyMs: 90, outcome: 'COMPLETED' }];
  data.observabilityMetricsHistory = [{ metricId: 'MET-1', tenantSlug: 'tabsons', cpuPercent: 40 }];
  data.observabilityHealthHistory = [{ healthId: 'HEALTH-1', tenantSlug: 'tabsons', state: 'HEALTHY' }];
  data.workerPools = [{ workerPoolId: 'WORK-1', tenantSlug: 'tabsons', currentWorkers: 4 }];
  data.sessions = [{ sessionId: 'SESSION-1', tenantSlug: 'tabsons', state: 'ACTIVE' }];
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  const snapshot = {};
  PROTECTED_TABLES.forEach(table => { snapshot[table] = data[table]; });
  return JSON.stringify(snapshot);
}

function metricCore(row) {
  return {
    testType: row.testType, suiteCode: row.suiteCode, phase: row.phase,
    employeeCount: row.employeeCount, virtualUsers: row.virtualUsers,
    responseTimeMs: row.responseTimeMs, p95ResponseTimeMs: row.p95ResponseTimeMs,
    requestsPerSecond: row.requestsPerSecond, errorRate: row.errorRate,
    cpuPercent: row.cpuPercent, memoryPercent: row.memoryPercent
  };
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js', 'services/asyncJobService.js'].forEach(load);
  seed();
  global.__ARTHHRMS_DEV__ = true;
  load('services/performanceTestService.js');

  const svc = global.PerformanceTestService;
  assert.ok(svc, 'PerformanceTestService should be exported');
  assert.equal(global.performanceTestService, svc, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service API should be immutable');
  [
    'PerformanceTestService', 'LoadTestEngine', 'StressTestEngine', 'BenchmarkService',
    'ScalabilityAnalyzer', 'CapacityPlanner', 'PerformanceAnalyticsService'
  ].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  assert.equal(global.__ARTHHRMS_PERFORMANCE_TEST_SELF_TEST__.passed, true, 'development self-test should pass');
  assert.deepEqual(svc.WORKLOAD_LEVELS, [200, 500, 1000, 5000, 10000, 50000, 100000]);
  assert.deepEqual(svc.ENDURANCE_HOURS, [6, 12, 24, 48]);
  assert.equal(svc.SPIKE_PATTERNS.length, 7);
  assert.equal(svc.API_GROUPS.length, 8);
  assert.equal(svc.DATABASE_CHECKS.length, 8);
  assert.equal(svc.BACKGROUND_SERVICES.length, 7);
  assert.equal(svc.FRONTEND_METRICS.length, 7);
  assert.equal(svc.SCALING_MODES.length, 6);

  const before = protectedSnapshot();
  const initialized = svc.initializeSuiteLibrary({ tenantSlug: 'tabsons' }, ctx('PLATFORM_OWNER'));
  assert.equal(initialized.success, true);
  assert.equal(initialized.suiteCount, 15);
  const again = svc.initializeSuiteLibrary({ tenantSlug: 'tabsons' }, ctx('PLATFORM_OWNER'));
  assert.equal(again.suitesAdded, 0, 'suite initialization should be idempotent');
  const listed = svc.listSuites({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  [
    'EMPLOYEE_LOGIN', 'DASHBOARD', 'ATTENDANCE', 'LEAVE', 'PAYROLL', 'RECRUITMENT',
    'PERFORMANCE', 'ANALYTICS', 'REPORTS', 'NOTIFICATIONS', 'DOCUMENT_UPLOAD',
    'API_PERFORMANCE', 'DATABASE_QUERIES', 'BACKGROUND_JOBS', 'CUSTOM_SUITES'
  ].forEach(code => assert.ok(listed.suites.some(row => row.code === code), `${code} should be predefined`));
  const custom = svc.createCustomSuite({ tenantSlug: 'tabsons', code: 'PILOT_API', name: 'Pilot API', category: 'API', target: 'Approved staging API observations' }, ctx('PLATFORM_OWNER'));
  assert.equal(custom.success, true);

  const productionBlocked = svc.startBenchmark({ tenantSlug: 'tabsons', environment: 'PRODUCTION' }, ctx('PLATFORM_OWNER'));
  assert.equal(productionBlocked.code, 'PERFORMANCE_PRODUCTION_TARGET_BLOCKED');
  const aliasBlocked = svc.startBenchmark({ tenantSlug: 'tabsons', environment: 'STAGING', targetAlias: 'live-primary' }, ctx('PLATFORM_OWNER'));
  assert.equal(aliasBlocked.code, 'PERFORMANCE_PRODUCTION_TARGET_BLOCKED');
  const networkBlocked = svc.startBenchmark({ tenantSlug: 'tabsons', environment: 'STAGING', targetUrl: 'https://staging.example.test' }, ctx('PLATFORM_OWNER'));
  assert.equal(networkBlocked.code, 'PERFORMANCE_NETWORK_TARGET_FORBIDDEN');

  const selectedCodes = ['EMPLOYEE_LOGIN', 'DASHBOARD', 'PAYROLL', 'API_PERFORMANCE', 'DATABASE_QUERIES', 'BACKGROUND_JOBS', 'DOCUMENT_UPLOAD', 'NOTIFICATIONS'];
  const selectedIds = listed.suites.filter(row => selectedCodes.includes(row.code)).map(row => row.suiteId);
  const startInput = {
    tenantSlug: 'tabsons', name: 'Enterprise Scale Pilot', environment: 'PERFORMANCE',
    suiteIds: selectedIds, testTypes: svc.TEST_TYPES, randomSeed: 'UAT-06-DETERMINISTIC',
    workloadProfile: { employeeCount: 100000, recordCount: 10000000, concurrentSessions: 10000, concurrentApiRequests: 5000, documentStorageGb: 1024, notificationVolume: 1000000 }
  };
  const started = svc.startBenchmark(startInput, ctx('PLATFORM_OWNER'));
  assert.equal(started.success, true);
  assert.equal(started.run.environment, 'PERFORMANCE');
  assert.equal(started.run.reproducible, true);
  assert.equal(started.run.exportable, true);
  assert.equal(started.run.productionDataModified, false);
  assert.equal(started.run.productionTrafficGenerated, false);
  assert.equal(started.run.networkRequestsIssued, false);
  assert.ok(started.run.manifestFingerprint);
  const runId = started.run.runId;

  const paused = svc.pauseBenchmark({ tenantSlug: 'tabsons', runId, expectedVersion: started.run.version, reason: 'Checkpoint test.' }, ctx('PLATFORM_OWNER'));
  assert.equal(paused.run.status, 'PAUSED');
  const resumed = svc.resumeBenchmark({ tenantSlug: 'tabsons', runId, expectedVersion: paused.run.version }, ctx('PLATFORM_OWNER'));
  assert.equal(resumed.run.status, 'RUNNING');
  const stale = svc.recordBenchmarkSample({ tenantSlug: 'tabsons', runId, responseTimeMs: 100, successRate: 100, errorRate: 0, requestsPerSecond: 100, cpuPercent: 10, memoryPercent: 20, expectedVersion: 1 }, ctx('PLATFORM_OWNER'));
  assert.equal(stale.code, 'PERFORMANCE_RUN_VERSION_CONFLICT');
  const invalid = svc.recordBenchmarkSample({ tenantSlug: 'tabsons', runId, responseTimeMs: 100 }, ctx('PLATFORM_OWNER'));
  assert.equal(invalid.code, 'PERFORMANCE_SAMPLE_INVALID');
  const crossTenantSample = svc.recordBenchmarkSample({ tenantSlug: 'tabsons', runId, sourceTenantSlug: 'abc', responseTimeMs: 100, successRate: 100, errorRate: 0, requestsPerSecond: 100, cpuPercent: 10, memoryPercent: 20 }, ctx('PLATFORM_OWNER'));
  assert.equal(crossTenantSample.code, 'TENANT_ACCESS_DENIED');
  const observed = svc.recordBenchmarkSample({
    tenantSlug: 'tabsons', runId, sourceTenantSlug: 'tabsons', suiteCode: 'API_PERFORMANCE',
    testType: 'LOAD', phase: 'APPROVED_STAGING_OBSERVATION', employeeCount: 100000,
    virtualUsers: 10000, concurrentApiRequests: 5000, responseTimeMs: 420,
    p50ResponseTimeMs: 220, p95ResponseTimeMs: 760, p99ResponseTimeMs: 1300,
    successRate: 99.8, errorRate: 0.2, requestsPerSecond: 4100, transactionsPerMinute: 246000,
    cpuPercent: 68, memoryPercent: 71, databaseLatencyMs: 90, redisLatencyMs: 8,
    queueBacklog: 200, databaseStability: 99, connectionPoolUtilization: 70,
    cacheHitRate: 92, fcpMs: 1000, lcpMs: 1800, ttiMs: 2500,
    bundleSizeKb: 820, routeLoadMs: 480, dashboardRenderMs: 620,
    mobilePerformanceScore: 91, submissionId: 'OBSERVED-1', expectedVersion: resumed.run.version
  }, ctx('PLATFORM_OWNER'));
  assert.equal(observed.success, true);
  assert.equal(observed.sample.source, 'EXTERNAL_OBSERVATION');
  assert.equal(observed.sample.productionDataModified, false);
  const observedReplay = svc.recordBenchmarkSample({
    tenantSlug: 'tabsons', runId, responseTimeMs: 9999, successRate: 1, errorRate: 99,
    requestsPerSecond: 1, cpuPercent: 99, memoryPercent: 99, submissionId: 'OBSERVED-1'
  }, ctx('PLATFORM_OWNER'));
  assert.equal(observedReplay.code, 'PERFORMANCE_SAMPLE_REPLAYED');
  assert.equal(observedReplay.runVersion, observed.runVersion);

  let version = observed.runVersion;
  const loadRun = svc.simulateLoadTest({ tenantSlug: 'tabsons', runId, simulationId: 'LOAD-1', expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(loadRun.success, true);
  assert.deepEqual([...new Set(loadRun.samples.map(row => row.employeeCount))], [200, 500, 1000, 5000, 10000, 50000, 100000]);
  assert.ok(loadRun.samples.every(row => row.productionTrafficGenerated === false && row.networkRequestsIssued === false));
  version = loadRun.runVersion;
  const replay = svc.simulateLoadTest({ tenantSlug: 'tabsons', runId, simulationId: 'LOAD-1', expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(replay.code, 'PERFORMANCE_SIMULATION_REPLAYED');
  assert.equal(replay.runVersion, version);

  const stress = svc.simulateStressTest({ tenantSlug: 'tabsons', runId, simulationId: 'STRESS-1', expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(stress.success, true);
  assert.ok(stress.samples.some(row => row.phase.startsWith('BEYOND_CAPACITY')));
  assert.ok(stress.samples.some(row => row.recoveryTimeMs > 0));
  version = stress.runVersion;
  const spike = svc.simulateSpikeTest({ tenantSlug: 'tabsons', runId, simulationId: 'SPIKE-1', expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(spike.success, true);
  assert.deepEqual([...new Set(spike.samples.map(row => row.spikePattern))], svc.SPIKE_PATTERNS);
  version = spike.runVersion;
  const endurance = svc.simulateEnduranceTest({ tenantSlug: 'tabsons', runId, simulationId: 'ENDURANCE-1', memoryLeakPercentPerHour: 0, connectionLeakPercentPerHour: 0, expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(endurance.success, true);
  assert.deepEqual([...new Set(endurance.samples.map(row => row.enduranceHours))], [6, 12, 24, 48]);
  assert.ok(endurance.samples.every(row => row.memoryLeakDetected === false && row.connectionLeakDetected === false));
  version = endurance.runVersion;
  const scalingSimulation = svc.simulateScalabilityTest({ tenantSlug: 'tabsons', runId, simulationId: 'SCALING-1', expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(scalingSimulation.success, true);
  assert.deepEqual([...new Set(scalingSimulation.samples.map(row => row.scaleMode))], svc.SCALING_MODES);
  version = scalingSimulation.runVersion;

  const benchmark = svc.generateBenchmark({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(benchmark.success, true);
  assert.ok(benchmark.benchmark.p50ResponseTimeMs > 0);
  assert.ok(benchmark.benchmark.p95ResponseTimeMs >= benchmark.benchmark.p50ResponseTimeMs);
  assert.ok(benchmark.benchmark.p99ResponseTimeMs >= benchmark.benchmark.p95ResponseTimeMs);
  assert.ok(benchmark.benchmark.requestsPerSecond > 0);
  assert.ok(benchmark.benchmark.transactionsPerMinute > 0);
  assert.ok(benchmark.benchmark.failurePoint, 'stress testing should identify a governed failure point');
  assert.ok(Number.isFinite(benchmark.benchmark.performanceScore));
  assert.equal(benchmark.benchmark.productionDataModified, false);
  const scalability = svc.analyzeScalability({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(scalability.success, true);
  assert.equal(scalability.scalability.modeReadiness.length, 6);
  assert.ok(scalability.scalability.loadCurve.length >= 7);
  const capacity = svc.generateCapacityPlan({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(capacity.success, true);
  assert.equal(capacity.capacityPlan.targetCoverage.length, 6);
  assert.equal(capacity.capacityPlan.requiredCapacity.employees, 100000);
  assert.equal(capacity.capacityPlan.requiredCapacity.records, 10000000);
  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(analytics.success, true);
  ['performanceScore', 'scalabilityScore', 'infrastructureHealthScore', 'capacityScore', 'productionReadinessScore'].forEach(key => assert.ok(Number.isFinite(analytics.analytics[key]), `${key} should be generated`));
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'LOAD').covered, true);
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'STRESS').covered, true);
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'SPIKE').covered, true);
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'ENDURANCE').covered, true);
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'SCALABILITY').covered, true);
  assert.equal(analytics.analytics.testCoverage.find(row => row.testType === 'CAPACITY').covered, true);

  const scheduled = svc.scheduleBenchmark({ tenantSlug: 'tabsons', environment: 'PERFORMANCE', runId, scheduleReference: 'NIGHTLY-UAT', approvedQueueDispatch: false }, ctx('PLATFORM_OWNER'));
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.job.queueDispatchSuppressed, true);
  assert.equal(scheduled.job.productionTrafficImpact, 'NONE');
  const productionSchedule = svc.scheduleBenchmark({ tenantSlug: 'tabsons', environment: 'LIVE' }, ctx('PLATFORM_OWNER'));
  assert.equal(productionSchedule.code, 'PERFORMANCE_PRODUCTION_TARGET_BLOCKED');

  const completed = svc.completeBenchmark({ tenantSlug: 'tabsons', runId, expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(completed.success, true);
  assert.equal(completed.run.status, 'COMPLETED');
  assert.ok(['PASSED', 'REVIEW_REQUIRED'].includes(completed.run.outcome));
  assert.ok(Number.isFinite(completed.run.productionReadinessScore));

  const jsonExport = svc.exportReport({ tenantSlug: 'tabsons', runId, format: 'JSON' }, ctx('DIRECTOR'));
  assert.equal(jsonExport.success, true);
  const json = JSON.parse(jsonExport.exportContent);
  assert.equal(json.productionDataIncluded, false);
  assert.equal(json.productionTrafficGenerated, false);
  assert.ok(json.executiveSummary);
  assert.ok(json.technicalSummary);
  assert.ok(json.charts.latency.length > 0);
  assert.ok(json.recommendations.length > 0);
  assert.equal(jsonExport.exportContent.includes('private company data'), false);
  assert.equal(jsonExport.exportContent.includes('employee@example.test'), false);
  assert.doesNotMatch(jsonExport.exportContent, /netSalary|payrollRecords|PAYREC-1|PAY-1/, 'payroll fields and record identifiers should not be exported');
  const csvExport = svc.exportReport({ tenantSlug: 'tabsons', runId, format: 'CSV' }, ctx('DIRECTOR'));
  assert.match(csvExport.exportContent, /^test_type,suite,phase,employees,virtual_users/);
  const excelExport = svc.exportReport({ tenantSlug: 'tabsons', runId, format: 'EXCEL' }, ctx('DIRECTOR'));
  assert.match(excelExport.exportContent, /^<\?xml version="1\.0"\?><Workbook/);
  assert.match(excelExport.exportContent, /Worksheet ss:Name="Benchmarks"/);
  assert.match(excelExport.exportContent, /Worksheet ss:Name="Chart Data"/);
  assert.match(excelExport.exportContent, /Worksheet ss:Name="Recommendations"/);
  const pdfExport = svc.exportReport({ tenantSlug: 'tabsons', runId, format: 'PDF' }, ctx('DIRECTOR'));
  assert.match(pdfExport.exportContent, /^%PDF-1\.4/);
  assert.match(pdfExport.exportContent, /%%EOF$/);
  [jsonExport, csvExport, excelExport, pdfExport].forEach(response => {
    assert.equal(response.export.productionDataIncluded, false);
    assert.equal(response.export.chartsIncluded, true);
    assert.ok(response.export.fingerprint);
  });

  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', runId }, ctx('DIRECTOR'));
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.activeRun.status, 'COMPLETED');
  assert.equal(dashboard.suites.length, selectedIds.length);
  assert.ok(dashboard.samples.length > 0);
  assert.ok(dashboard.liveMetrics.length > 0);
  assert.ok(dashboard.charts.latency.length > 0);
  assert.ok(dashboard.benchmark);
  assert.ok(dashboard.analytics);
  assert.ok(dashboard.capacityPlan);
  assert.equal(dashboard.exports.length, 4);
  assert.ok(dashboard.timeline.length > 0);

  const deterministic = svc.startBenchmark(startInput, ctx('PLATFORM_OWNER'));
  assert.equal(deterministic.run.manifestFingerprint, started.run.manifestFingerprint, 'identical workload manifests should fingerprint identically');
  const deterministicLoad = svc.simulateLoadTest({ tenantSlug: 'tabsons', runId: deterministic.run.runId, simulationId: 'LOAD-1', expectedVersion: deterministic.run.version }, ctx('PLATFORM_OWNER'));
  assert.deepEqual(metricCore(deterministicLoad.samples[0]), metricCore(loadRun.samples[0]), 'synthetic benchmarks should be repeatable for the same seed and manifest');
  const deterministicCancelled = svc.cancelBenchmark({ tenantSlug: 'tabsons', runId: deterministic.run.runId, expectedVersion: deterministicLoad.runVersion, reason: 'Repeatability check complete.' }, ctx('PLATFORM_OWNER'));
  assert.equal(deterministicCancelled.run.status, 'CANCELLED');

  const edge = svc.startBenchmark({ ...startInput, name: 'Database Outage Drill', suiteIds: [listed.suites.find(row => row.code === 'DATABASE_QUERIES').suiteId], edgeCases: ['DATABASE_OUTAGE'] }, ctx('PLATFORM_OWNER'));
  const edgeLoad = svc.simulateLoadTest({ tenantSlug: 'tabsons', runId: edge.run.runId, simulationId: 'EDGE-DB', employeeLevels: [200], expectedVersion: edge.run.version }, ctx('PLATFORM_OWNER'));
  assert.ok(edgeLoad.samples.every(row => row.databaseStability === 0));
  assert.ok(edgeLoad.samples.every(row => row.healthState === 'CRITICAL'));
  const edgeCancelled = svc.cancelBenchmark({ tenantSlug: 'tabsons', runId: edge.run.runId, expectedVersion: edgeLoad.runVersion, reason: 'Outage drill complete.' }, ctx('PLATFORM_OWNER'));
  assert.equal(edgeCancelled.success, true);

  const crossTenant = svc.listSuites({ tenantSlug: 'abc' }, ctx('DIRECTOR', 'tabsons'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  const employeeDenied = svc.generateDashboard({ tenantSlug: 'tabsons', runId }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(employeeDenied.code, 'PERFORMANCE_VIEW_RBAC_DENIED');
  assert.equal(global.DB.get().performanceTestRuns.some(row => row.tenantSlug === 'abc'), false);
  assert.equal(networkCalls, 0, 'the service must not issue network traffic');
  assert.equal(protectedSnapshot(), before, 'performance testing must not modify business or infrastructure production collections');

  const data = global.DB.get();
  assert.ok(data.performanceTestSamples.length > 100, 'enterprise benchmark samples should be retained');
  assert.ok(data.performanceTestCheckpoints.length > 0, 'recovery checkpoints should be retained');
  assert.ok(data.performanceTestAuditHistory.some(row => row.actionType === 'PERFORMANCE_BENCHMARK_STARTED'));
  assert.ok(data.performanceTestAuditHistory.some(row => row.actionType === 'PERFORMANCE_REPORT_EXPORTED'));
  assert.ok(data.performanceTestAuditHistory.every(row => row.immutable === true));
  assert.ok(data.performanceTestEvents.every(row => row.immutable === true));
  assert.equal(JSON.stringify(data.performanceTestRuns).includes('private company data'), false);

  const htmlPath = path.resolve(__dirname, '..', 'performance-testing-center.html');
  assert.equal(fs.existsSync(htmlPath), true, 'the Performance Testing Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Performance Testing Center/);
  assert.match(html, /performanceTestService\.js/);
  assert.match(html, /Latency Percentiles/);
  assert.match(html, /Capacity Planning/);
  assert.match(html, /canvas id="latencyChart"/);

  console.log('Performance test service tests passed.');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
