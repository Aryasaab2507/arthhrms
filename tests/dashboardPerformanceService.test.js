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

function seedPerformanceData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.employees = Array.from({ length: 140 }, (_, index) => ({
    id: `EMP-${index + 1}`,
    empId: `EMP-${index + 1}`,
    tenantSlug: 'tabsons',
    role: index === 0 ? 'MANAGER' : 'EMPLOYEE',
    department: index % 2 ? 'Engineering' : 'Operations',
    salary: 90000 + index,
    leaveBalance: 12
  })).concat([
    { id: 'EMP-X', empId: 'EMP-X', tenantSlug: 'abc', role: 'EMPLOYEE', department: 'Finance', salary: 888888, leaveBalance: 44 }
  ]);
  data.workflowEvents = Array.from({ length: 1800 }, (_, index) => ({
    eventId: `WF-${index + 1}`,
    tenantSlug: 'tabsons',
    type: index % 3 ? 'APPROVAL' : 'NOTIFICATION',
    status: index % 7 ? 'COMPLETED' : 'FAILED',
    createdAt: '2026-06-05T06:00:00.000Z'
  })).concat([
    { eventId: 'WF-X', tenantSlug: 'abc', type: 'PAYROLL', status: 'FAILED', salary: 888888 }
  ]);
  data.notifications = Array.from({ length: 650 }, (_, index) => ({
    id: `N-${index + 1}`,
    tenantSlug: 'tabsons',
    state: index % 8 ? 'DELIVERED' : 'CREATED',
    priority: index % 17 ? 'NORMAL' : 'HIGH'
  }));
  data.searchAnalytics = [
    { id: 'SA-1', tenantSlug: 'tabsons', latencyMs: 420, resultCount: 900 },
    { id: 'SA-X', tenantSlug: 'abc', latencyMs: 900, confidentialPayroll: 'salary 888888' }
  ];
  data.globalActivityFeedAnalytics = [
    { id: 'AF-1', tenantSlug: 'tabsons', latencyMs: 520, activityVolume: 1800 },
    { id: 'AF-X', tenantSlug: 'abc', latencyMs: 700, privateNote: 'ABC salary 888888' }
  ];
  data.notificationCenterAnalytics = [
    { id: 'NC-1', tenantSlug: 'tabsons', latencyMs: 260, unreadCount: 80 },
    { id: 'NC-X', tenantSlug: 'abc', latencyMs: 430, privateNote: 'ABC leave balance 44' }
  ];
  data.dashboardPerformanceHistory = [];
  data.dashboardPerformanceAnalytics = [];
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

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantIsolationService.js',
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/notificationCenterService.js',
    'services/smartSearchService.js',
    'services/globalActivityFeedService.js',
    'services/platformAnalyticsService.js',
    'services/runtimeEnvironmentHealthService.js'
  ].forEach(load);
  seedPerformanceData();

  let loadError = null;
  try {
    load('services/dashboardPerformanceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.DashboardPerformanceService;
  assert.ok(svc, 'DashboardPerformanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.calculatePerformanceScore, 'function');
  assert.equal(typeof svc.detectSlowComponents, 'function');
  assert.equal(typeof svc.optimizeDashboardRendering, 'function');
  assert.equal(typeof svc.normalizePerformancePayload, 'function');
  assert.equal(typeof svc.freezePerformanceOutput, 'function');
  assert.equal(typeof svc.generateDashboardPerformanceReport, 'function');
  assert.equal(global.__ARTHHRMS_DASHBOARD_PERFORMANCE_SELF_TEST__.passed, true, 'development self-test should cover dashboard performance failure cases');

  const malformed = svc.normalizePerformancePayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed performance output');

  const payload = {
    tenantSlug: 'tabsons',
    dashboards: [
      {
        dashboardId: 'platform-control',
        dashboardType: 'platform-control',
        pageLoadMs: 2400,
        renderTimeMs: 680,
        queryTimeMs: 530,
        memoryMb: 190,
        interactionLatencyMs: 360,
        renderCycles: 12,
        widgetCount: 24,
        recordCount: 2800,
        fullPageRefresh: true,
        duplicateRequests: 9,
        redundantCalculations: 7,
        blockingOperation: true,
        salary: 999999,
        leaveBalance: 12
      }
    ],
    widgets: [
      { widgetId: 'activity-feed', serviceName: 'GlobalActivityFeedService', renderTimeMs: 640, queryTimeMs: 520, recordCount: 3200, renderCycles: 11, virtualized: false },
      { widgetId: 'smart-search', serviceName: 'SmartSearchService', renderTimeMs: 240, queryTimeMs: 410, recordCount: 2600, renderCycles: 8, virtualized: false },
      { widgetId: 'notification-center', serviceName: 'NotificationCenterService', renderTimeMs: 310, queryTimeMs: 260, recordCount: 900, renderCycles: 5, deferred: false }
    ],
    interactions: [
      { interactionId: 'search-typeahead', latencyMs: 390, category: 'search' },
      { interactionId: 'feed-scroll', latencyMs: 420, category: 'activity' }
    ],
    metadata: {
      confidentialEmployeeRecord: 'salary 999999 leave balance 12',
      rawPayload: 'hidden'
    }
  };

  const context = {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  };

  const normalized = svc.normalizePerformancePayload(payload, context);
  assert.equal(normalized.success, true, 'normalization should accept dashboard payloads');
  assertImmutable(normalized, 'normalized performance output');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|leaveBalance|salary|confidentialEmployeeRecord|rawPayload|ABC|888888/i, 'normalized output must redact confidential fields and other tenants');

  const score = svc.calculatePerformanceScore(normalized);
  assert.equal(score.performanceClass, 'CRITICAL', 'slow dashboard should classify as critical');
  assert.ok(score.performanceScore < 70, 'slow dashboard should receive a reduced score');
  assert.ok(score.responsivenessScore < 70, 'interaction latency should lower responsiveness');
  assertImmutable(score, 'performance score output');

  const slow = svc.detectSlowComponents(normalized);
  assert.equal(slow.success, true, 'slow component detection should work');
  assert.ok(slow.slowComponents.some(component => component.componentId === 'activity-feed'), 'activity feed should be detected as slow');
  assert.ok(slow.slowComponents.some(component => component.reasonCodes.includes('LARGE_DATASET_WITHOUT_VIRTUALIZATION')), 'large non-virtualized widgets should be flagged');
  assert.ok(slow.optimizationOpportunities.length >= 3, 'optimization opportunities should be generated');
  assertImmutable(slow, 'slow component output');

  const optimized = svc.optimizeDashboardRendering(normalized);
  assert.equal(optimized.success, true, 'optimization plan should be generated');
  assert.equal(optimized.governance.safeOptimizationOnly, true, 'optimization must be governance-safe');
  assert.ok(optimized.optimizations.widgetVirtualization.includes('activity-feed'), 'large activity feed should be virtualized');
  assert.ok(optimized.optimizations.deferredRendering.includes('notification-center'), 'notification center should be deferred');
  assert.ok(optimized.optimizations.incrementalRefresh.length > 0, 'incremental refresh recommendations should exist');
  assertImmutable(optimized, 'optimization output');

  const report = svc.generateDashboardPerformanceReport(payload, context);
  assert.equal(report.success, true, 'dashboard performance report should generate');
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.performanceGovernancePreserved, true);
  assert.equal(report.integrationHealth.smartSearchIntegrated, true);
  assert.equal(report.integrationHealth.globalActivityFeedIntegrated, true);
  assert.equal(report.integrationHealth.notificationCenterIntegrated, true);
  assert.equal(report.integrationHealth.platformAnalyticsIntegrated, true);
  assert.equal(report.integrationHealth.runtimeHealthIntegrated, true);
  assert.equal(report.analytics.widgetPerformance.totalWidgets, 3);
  assert.ok(report.optimization.optimizationOpportunities.length >= 3);
  assert.doesNotMatch(JSON.stringify(report), /999999|leaveBalance|salary|ABC|888888|confidential/i, 'report must not leak confidential or cross-tenant data');
  assertImmutable(report, 'dashboard performance report');
  assertImmutable(report.slowComponents, 'slow components');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.dashboardPerformanceHistory || []).length >= 1, 'performance history should persist immutably');
  assert.ok((dataAfterReport.dashboardPerformanceAnalytics || []).length >= 1, 'performance analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /DASHBOARD_PERFORMANCE_REVIEWED|DASHBOARD_PERFORMANCE_REPORT_GENERATED/.test(log.actionType || log.eventType || '')), 'audit integration should record performance review');

  const blockedTenant = svc.generateDashboardPerformanceReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedTenant.success, false, 'cross-tenant performance report should be blocked');
  assert.match(blockedTenant.classification, /TENANT|SCOPE|BLOCK/i);
  assertImmutable(blockedTenant, 'blocked tenant output');

  const blockedRole = svc.generateDashboardPerformanceReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(blockedRole.success, false, 'tenant roles should not access platform performance panel');
  assertImmutable(blockedRole, 'blocked role output');

  const originalSmartSearch = global.SmartSearchService;
  const originalActivityFeed = global.GlobalActivityFeedService;
  const originalNotificationCenter = global.NotificationCenterService;
  delete global.SmartSearchService;
  delete global.GlobalActivityFeedService;
  delete global.NotificationCenterService;
  const dependencyAbsent = svc.generateDashboardPerformanceReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' },
    infrastructureOnly: true,
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely for infrastructure monitoring');
  assert.equal(dependencyAbsent.integrationHealth.smartSearchIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.globalActivityFeedIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.notificationCenterIntegrated, false);
  global.SmartSearchService = originalSmartSearch;
  global.GlobalActivityFeedService = originalActivityFeed;
  global.NotificationCenterService = originalNotificationCenter;

  console.log('dashboardPerformanceService.test.js passed');
}

main();
