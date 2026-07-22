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
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.com',
    hostname: 'platform.arthhrms.com',
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

function seedOptimizationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', department: 'Operations', salary: 75000, leaveBalance: 11 },
    { id: 'EMP-X', empId: 'EMP-X', tenantSlug: 'abc', department: 'Finance', salary: 888888, leaveBalance: 44 }
  ];
  data.workflowEvents = Array.from({ length: 1500 }, (_, index) => ({
    eventId: `WF-${index + 1}`,
    tenantSlug: 'tabsons',
    type: index % 3 ? 'APPROVAL' : 'NOTIFICATION',
    status: index % 9 ? 'COMPLETED' : 'FAILED'
  })).concat([
    { eventId: 'WF-X', tenantSlug: 'abc', type: 'PAYROLL', status: 'FAILED', salary: 888888 }
  ]);
  data.renderOptimizationHistory = [];
  data.renderOptimizationAnalytics = [];
  global.DB.save(data);
}

function assertImmutable(value, label) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object') assert.ok(Object.isFrozen(item), `${label}[${index}] should be frozen`);
    });
  }
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantIsolationService.js',
    'services/dashboardPerformanceService.js',
    'services/mobileResponsivenessService.js',
    'services/smartSearchService.js',
    'services/globalActivityFeedService.js',
    'services/notificationCenterService.js'
  ].forEach(load);
  seedOptimizationData();

  let loadError = null;
  try {
    load('services/renderOptimizationService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.RenderOptimizationService;
  assert.ok(svc, 'RenderOptimizationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.lazyLoadModule, 'function');
  assert.equal(typeof svc.calculateRenderEfficiency, 'function');
  assert.equal(typeof svc.optimizeRenderCycle, 'function');
  assert.equal(typeof svc.normalizeOptimizationPayload, 'function');
  assert.equal(typeof svc.freezeOptimizationOutput, 'function');
  assert.equal(typeof svc.generateRenderOptimizationReport, 'function');
  assert.equal(global.__ARTHHRMS_RENDER_OPTIMIZATION_SELF_TEST__.passed, true, 'development self-test should cover lazy loading and render optimization cases');

  const malformed = svc.normalizeOptimizationPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed optimization output');

  const payload = {
    tenantSlug: 'tabsons',
    routes: [
      { routeId: 'platform-control', routeType: 'platform', loadDurationMs: 1450, moduleCount: 42, unusedStartupModules: 18, preloadedModules: 4, routeFrequency: 24 },
      { routeId: 'employee-portal', routeType: 'tenant', loadDurationMs: 760, moduleCount: 18, unusedStartupModules: 4, preloadedModules: 3, routeFrequency: 180 }
    ],
    modules: [
      { moduleId: 'activity-feed', moduleType: 'activity', estimatedKb: 260, initMs: 540, usedAtStartup: true, critical: false, deferred: false, authorized: true },
      { moduleId: 'smart-search', moduleType: 'search', estimatedKb: 180, initMs: 360, usedAtStartup: true, critical: false, deferred: false, authorized: true },
      { moduleId: 'notification-center', moduleType: 'notification', estimatedKb: 120, initMs: 220, usedAtStartup: false, critical: false, deferred: true, authorized: true },
      { moduleId: 'audit-log', moduleType: 'audit', estimatedKb: 300, initMs: 620, usedAtStartup: true, critical: false, deferred: false, authorized: true },
      { moduleId: 'payroll-private', moduleType: 'payroll', estimatedKb: 90, initMs: 120, usedAtStartup: false, critical: false, deferred: true, authorized: false, salary: 999999 }
    ],
    components: [
      { componentId: 'activity-feed-list', componentType: 'feed', renderDurationMs: 720, memoryMb: 180, recordCount: 3500, renderCycles: 12, virtualized: false, memoized: false, selectiveUpdates: false, batched: false },
      { componentId: 'search-results', componentType: 'search', renderDurationMs: 410, memoryMb: 120, recordCount: 2200, renderCycles: 8, virtualized: false, memoized: true, selectiveUpdates: false, batched: false },
      { componentId: 'notification-timeline', componentType: 'notification', renderDurationMs: 260, memoryMb: 88, recordCount: 850, renderCycles: 5, virtualized: true, memoized: true, selectiveUpdates: true, batched: true },
      { componentId: 'audit-table', componentType: 'audit', renderDurationMs: 680, memoryMb: 210, recordCount: 5200, renderCycles: 10, virtualized: false, memoized: false, selectiveUpdates: false, batched: false }
    ],
    dataSources: [
      { sourceId: 'activity-feed-events', recordCount: 3500, pageSize: 500, incremental: false, duplicateRequests: 6, cacheHitRate: 0.2, viewportBased: false, tenantSlug: 'tabsons' },
      { sourceId: 'search-index', recordCount: 2200, pageSize: 1000, incremental: false, duplicateRequests: 3, cacheHitRate: 0.3, viewportBased: false, tenantSlug: 'tabsons' },
      { sourceId: 'audit-logs', recordCount: 5200, pageSize: 1000, incremental: false, duplicateRequests: 5, cacheHitRate: 0.1, viewportBased: false, tenantSlug: 'tabsons' },
      { sourceId: 'other-tenant-payroll', recordCount: 10, pageSize: 10, incremental: true, duplicateRequests: 0, cacheHitRate: 1, viewportBased: true, tenantSlug: 'abc', salary: 888888 }
    ],
    metadata: {
      confidentialEmployeeRecord: 'salary 999999 leave balance 11',
      rawPayload: 'hidden'
    }
  };

  const context = {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  };

  const normalized = svc.normalizeOptimizationPayload(payload, context);
  assert.equal(normalized.success, true, 'normalization should accept render optimization payloads');
  assertImmutable(normalized, 'normalized optimization output');
  assert.equal(normalized.dataSources.some(source => source.sourceId === 'other-tenant-payroll'), false, 'cross-tenant data sources should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|888888|leaveBalance|salary|confidentialEmployeeRecord|rawPayload|ABC/i, 'normalized output must redact confidential fields and other tenants');

  const efficiency = svc.calculateRenderEfficiency(normalized);
  assert.equal(efficiency.success, true, 'render efficiency should calculate');
  assert.ok(efficiency.renderEfficiencyScore < 75, 'slow non-virtualized components should lower render efficiency');
  assert.ok(efficiency.memoryEfficiencyScore < 80, 'large memory usage should lower memory efficiency');
  assert.ok(efficiency.loadOptimizationScore < 80, 'startup-heavy modules should lower load score');
  assert.match(efficiency.optimizationClass, /HIGH|CRITICAL|MODERATE/, 'optimization risk should be classified');
  assertImmutable(efficiency, 'render efficiency output');

  const optimization = svc.optimizeRenderCycle(normalized);
  assert.equal(optimization.success, true, 'optimization plan should generate');
  assert.equal(optimization.governance.safeOptimizationOnly, true, 'optimization must be governance-safe');
  assert.ok(optimization.optimizations.virtualizeComponents.includes('activity-feed-list'), 'large feed should be virtualized');
  assert.ok(optimization.optimizations.virtualizeComponents.includes('audit-table'), 'large audit table should be virtualized');
  assert.ok(optimization.optimizations.deferModules.includes('activity-feed'), 'non-critical startup module should be deferred');
  assert.ok(optimization.optimizations.incrementalDataSources.includes('activity-feed-events'), 'large feed source should be incremental');
  assert.ok(optimization.optimizations.batchedRendering.includes('search-results'), 'search rendering should be batched');
  assertImmutable(optimization, 'render optimization output');

  const loaded = await svc.lazyLoadModule('LazyDemoModule', async () => ({ value: 'loaded', secretToken: 'hidden' }), {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    authorized: true,
    moduleTenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(loaded.success, true, 'authorized lazy module should load');
  assert.equal(loaded.moduleKey, 'LazyDemoModule');
  assert.equal(loaded.loadState, 'LOADED');
  assert.doesNotMatch(JSON.stringify(loaded), /secretToken|hidden/i, 'lazy load output should not expose raw module internals');
  assertImmutable(loaded, 'lazy load output');

  const blockedLazy = await svc.lazyLoadModule('PayrollPrivateModule', async () => ({ value: 'secret' }), {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' },
    infrastructureOnly: true,
    authorized: false,
    moduleTenantSlug: 'abc',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(blockedLazy.success, false, 'unauthorized lazy load should be blocked');
  assert.match(blockedLazy.classification, /BLOCK|SCOPE|UNAUTHORIZED/i);
  assertImmutable(blockedLazy, 'blocked lazy output');

  const report = svc.generateRenderOptimizationReport(payload, context);
  assert.equal(report.success, true, 'render optimization report should generate');
  assert.equal(report.governance.backwardCompatibilityPreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.renderingOptimizationGovernancePreserved, true);
  assert.equal(report.analytics.componentAnalytics.totalComponents, 4);
  assert.ok(report.optimization.optimizationOpportunities.length >= 5, 'optimization opportunities should be generated');
  assert.doesNotMatch(JSON.stringify(report), /999999|888888|leaveBalance|salary|ABC|confidential/i, 'report must not leak confidential or cross-tenant data');
  assertImmutable(report, 'render optimization report');
  assertImmutable(report.optimization.optimizationOpportunities, 'optimization opportunities');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.renderOptimizationHistory || []).length >= 1, 'render optimization history should persist immutably');
  assert.ok((dataAfterReport.renderOptimizationAnalytics || []).length >= 1, 'render optimization analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /RENDER_OPTIMIZATION_REVIEWED|RENDER_OPTIMIZATION_REPORT_GENERATED/.test(log.actionType || log.eventType || '')), 'audit integration should record render optimization review');

  const blockedTenant = svc.generateRenderOptimizationReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedTenant.success, false, 'cross-tenant render optimization report should be blocked');
  assert.match(blockedTenant.classification, /TENANT|SCOPE|BLOCK/i);
  assertImmutable(blockedTenant, 'blocked tenant output');

  const blockedRole = svc.generateRenderOptimizationReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(blockedRole.success, false, 'tenant roles should not access platform render optimization panel');
  assertImmutable(blockedRole, 'blocked role output');

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateRenderOptimizationReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' },
    infrastructureOnly: true,
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely for infrastructure monitoring');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('renderOptimizationService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
