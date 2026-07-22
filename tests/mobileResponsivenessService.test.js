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
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0 Mobile', platform: 'Win32' };
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

function seedResponsiveData() {
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
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', role: 'EMPLOYEE', department: 'Operations', salary: 75000, leaveBalance: 14 },
    { id: 'EMP-X', empId: 'EMP-X', tenantSlug: 'abc', role: 'EMPLOYEE', department: 'Finance', salary: 888888, leaveBalance: 44 }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', type: 'APPROVAL', status: 'COMPLETED' },
    { eventId: 'WF-X', tenantSlug: 'abc', type: 'PAYROLL', status: 'FAILED', salary: 888888 }
  ];
  data.mobileResponsivenessHistory = [];
  data.mobileResponsivenessAnalytics = [];
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
    'services/dashboardPerformanceService.js',
    'services/platformAnalyticsService.js'
  ].forEach(load);
  seedResponsiveData();

  let loadError = null;
  try {
    load('services/mobileResponsivenessService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.MobileResponsivenessService;
  assert.ok(svc, 'MobileResponsivenessService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.detectViewportType, 'function');
  assert.equal(typeof svc.calculateResponsiveScore, 'function');
  assert.equal(typeof svc.optimizeResponsiveLayout, 'function');
  assert.equal(typeof svc.normalizeResponsivePayload, 'function');
  assert.equal(typeof svc.freezeResponsiveOutput, 'function');
  assert.equal(typeof svc.generateMobileExperienceReport, 'function');
  assert.equal(global.__ARTHHRMS_MOBILE_RESPONSIVENESS_SELF_TEST__.passed, true, 'development self-test should cover responsive failure cases');

  assert.equal(svc.detectViewportType({ width: 390, height: 844 }).viewportType, 'TINY_MOBILE');
  assert.equal(svc.detectViewportType({ width: 640, height: 920 }).viewportType, 'MOBILE');
  assert.equal(svc.detectViewportType({ width: 820, height: 1180 }).viewportType, 'TABLET');
  assert.equal(svc.detectViewportType({ width: 1280, height: 800 }).viewportType, 'LAPTOP');
  assert.equal(svc.detectViewportType({ width: 1680, height: 980 }).viewportType, 'ULTRA_WIDE');

  const malformed = svc.normalizeResponsivePayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed responsive output');

  const payload = {
    tenantSlug: 'tabsons',
    devices: [
      { viewportId: 'iphone-small', width: 390, height: 844, orientation: 'portrait', renderMs: 420, interactionLatencyMs: 180, memoryMb: 92 },
      { viewportId: 'tablet', width: 820, height: 1180, orientation: 'portrait', renderMs: 360, interactionLatencyMs: 130, memoryMb: 108 },
      { viewportId: 'desktop', width: 1366, height: 768, orientation: 'landscape', renderMs: 180, interactionLatencyMs: 70, memoryMb: 96 },
      { viewportId: 'ultra', width: 1920, height: 1080, orientation: 'landscape', renderMs: 190, interactionLatencyMs: 80, memoryMb: 100 }
    ],
    dashboards: [
      {
        dashboardId: 'platform-control',
        dashboardType: 'platform-control',
        viewportWidth: 390,
        cardColumns: 4,
        formColumns: 2,
        tableMinWidth: 860,
        horizontalOverflow: true,
        tableScrollEnabled: false,
        navDrawerAvailable: false,
        touchTargetPx: 34,
        chartAdaptive: false,
        desktopLayoutPreserved: true,
        salary: 999999,
        leaveBalance: 12
      },
      {
        dashboardId: 'director',
        dashboardType: 'director',
        viewportWidth: 820,
        cardColumns: 3,
        formColumns: 1,
        tableMinWidth: 620,
        horizontalOverflow: false,
        tableScrollEnabled: true,
        navDrawerAvailable: true,
        touchTargetPx: 42,
        chartAdaptive: true,
        desktopLayoutPreserved: true
      }
    ],
    forms: [
      { formId: 'leave-form', viewportWidth: 390, columns: 2, validationInline: false, touchTargetPx: 34 },
      { formId: 'onboarding-form', viewportWidth: 820, columns: 2, validationInline: true, touchTargetPx: 42 }
    ],
    tables: [
      { tableId: 'attendance-table', viewportWidth: 390, minWidth: 860, scrollEnabled: false, expandableRows: false },
      { tableId: 'audit-table', viewportWidth: 820, minWidth: 920, scrollEnabled: true, expandableRows: true }
    ],
    navigation: [
      { navId: 'platform-side', viewportWidth: 390, drawerAvailable: false, collapsible: false, hiddenActionsExposed: false },
      { navId: 'employee-side', viewportWidth: 640, drawerAvailable: true, collapsible: true, hiddenActionsExposed: false }
    ],
    metadata: {
      confidentialEmployeeRecord: 'salary 999999 leave balance 12',
      rawTenantDocument: 'hidden'
    }
  };

  const context = {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  };

  const normalized = svc.normalizeResponsivePayload(payload, context);
  assert.equal(normalized.success, true, 'normalization should accept responsive payloads');
  assertImmutable(normalized, 'normalized responsive output');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|leaveBalance|salary|confidentialEmployeeRecord|rawTenantDocument|ABC|888888/i, 'normalized output must redact confidential fields and other tenants');

  const score = svc.calculateResponsiveScore(normalized);
  assert.equal(score.success, true, 'responsive score should calculate');
  assert.ok(score.mobileUsabilityScore < 80, 'mobile layout issues should lower usability score');
  assert.ok(score.responsiveReadinessScore < 85, 'responsive readiness should reflect current issues');
  assert.match(score.responsiveClass, /HIGH|CRITICAL|MODERATE/, 'responsive class should classify risk');
  assertImmutable(score, 'responsive score output');

  const optimized = svc.optimizeResponsiveLayout(normalized);
  assert.equal(optimized.success, true, 'optimization plan should be generated');
  assert.equal(optimized.governance.safeOptimizationOnly, true, 'optimization must be governance-safe');
  assert.ok(optimized.optimizations.mobileNavigationDrawers.includes('platform-side'), 'missing mobile drawer should be recommended');
  assert.ok(optimized.optimizations.singleColumnForms.includes('leave-form'), 'mobile forms should be single column');
  assert.ok(optimized.optimizations.tableScrollContainers.includes('attendance-table'), 'wide mobile tables should gain scroll containers');
  assert.ok(optimized.optimizations.touchTargetHardening.includes('platform-control'), 'small touch targets should be hardened');
  assert.ok(optimized.optimizations.ultraWideConstraints.includes('ultra'), 'ultra-wide constraints should be recommended');
  assertImmutable(optimized, 'responsive optimization output');

  const report = svc.generateMobileExperienceReport(payload, context);
  assert.equal(report.success, true, 'mobile experience report should generate');
  assert.equal(report.governance.backwardCompatibilityPreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.mobileUXGovernancePreserved, true);
  assert.equal(report.analytics.deviceDistribution.tinyMobile, 1);
  assert.equal(report.analytics.deviceDistribution.tablet, 1);
  assert.equal(report.analytics.deviceDistribution.ultraWide, 1);
  assert.ok(report.optimization.optimizationOpportunities.length >= 4, 'mobile recommendations should be generated');
  assert.doesNotMatch(JSON.stringify(report), /999999|leaveBalance|salary|ABC|888888|confidential/i, 'report must not leak confidential or cross-tenant data');
  assertImmutable(report, 'mobile experience report');
  assertImmutable(report.optimization.optimizationOpportunities, 'responsive opportunities');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.mobileResponsivenessHistory || []).length >= 1, 'responsive history should persist immutably');
  assert.ok((dataAfterReport.mobileResponsivenessAnalytics || []).length >= 1, 'responsive analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /MOBILE_UX_REVIEWED|MOBILE_EXPERIENCE_REPORT_GENERATED/.test(log.actionType || log.eventType || '')), 'audit integration should record mobile UX review');

  const blockedTenant = svc.generateMobileExperienceReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedTenant.success, false, 'cross-tenant responsive report should be blocked');
  assert.match(blockedTenant.classification, /TENANT|SCOPE|BLOCK/i);
  assertImmutable(blockedTenant, 'blocked tenant output');

  const blockedRole = svc.generateMobileExperienceReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(blockedRole.success, false, 'tenant roles should not access platform mobile UX governance panel');
  assertImmutable(blockedRole, 'blocked role output');

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateMobileExperienceReport(payload, {
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

  console.log('mobileResponsivenessService.test.js passed');
}

main();
