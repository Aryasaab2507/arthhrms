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

function seedAccessibilityData() {
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
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', department: 'Finance', salary: 999999, leaveBalance: 44 }
  ];
  data.accessibilityGovernanceHistory = [];
  data.accessibilityGovernanceAnalytics = [];
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

function samplePayload() {
  return {
    tenantSlug: 'tabsons',
    routeType: 'platform',
    standards: ['WCAG_2_1_AA'],
    landmarks: [
      { landmarkId: 'main-content', role: 'main', label: 'Platform control content', present: true, tenantSlug: 'tabsons' },
      { landmarkId: 'side-nav', role: 'navigation', label: 'Platform navigation', present: true, tenantSlug: 'tabsons' },
      { landmarkId: 'missing-search', role: 'search', label: '', present: false, tenantSlug: 'tabsons' },
      { landmarkId: 'abc-main', role: 'main', label: 'ABC private', present: true, tenantSlug: 'abc', salary: 999999 }
    ],
    controls: [
      { controlId: 'refresh-accessibility', controlType: 'button', label: 'Refresh Accessibility', ariaLabel: 'Refresh accessibility governance', keyboardReachable: true, focusVisible: true, tenantSlug: 'tabsons' },
      { controlId: 'smart-search-query', controlType: 'input', label: 'Search Query', ariaLabel: 'Search query', describedBy: 'smart-search-help', keyboardReachable: true, focusVisible: true, tenantSlug: 'tabsons' },
      { controlId: 'orphan-filter', controlType: 'select', label: '', ariaLabel: '', keyboardReachable: true, focusVisible: false, tenantSlug: 'tabsons' },
      { controlId: 'hidden-payroll', controlType: 'input', label: 'Salary', ariaLabel: 'Salary', keyboardReachable: true, focusVisible: true, tenantSlug: 'abc', salary: 888888, leaveBalance: 44 }
    ],
    tables: [
      { tableId: 'activity-feed-table', caption: 'Activity feed timeline', headerScopes: true, keyboardScrollable: true, rowHeaderPresent: true, tenantSlug: 'tabsons' },
      { tableId: 'audit-table', caption: '', headerScopes: false, keyboardScrollable: false, rowHeaderPresent: false, tenantSlug: 'tabsons' }
    ],
    dialogs: [
      { dialogId: 'platform-access-gate', role: 'dialog', ariaModal: true, labelledBy: 'platformGateTitle', focusTrap: true, escapeCloses: true, initialFocus: true, tenantSlug: 'tabsons' },
      { dialogId: 'legacy-modal', role: 'dialog', ariaModal: false, labelledBy: '', focusTrap: false, escapeCloses: false, initialFocus: false, tenantSlug: 'tabsons' }
    ],
    notifications: [
      { notificationId: 'toast', ariaLive: 'polite', role: 'status', dismissible: false, tenantSlug: 'tabsons' },
      { notificationId: 'incident-alert', ariaLive: '', role: '', priority: 'CRITICAL', tenantSlug: 'tabsons' }
    ],
    focusTargets: [
      { targetId: 'skip-to-content', keyboardReachable: true, focusVisible: true, tabIndex: 0, order: 1, tenantSlug: 'tabsons' },
      { targetId: 'side-nav', keyboardReachable: true, focusVisible: true, tabIndex: 0, order: 2, tenantSlug: 'tabsons' },
      { targetId: 'hidden-card', keyboardReachable: false, focusVisible: false, tabIndex: -1, order: 3, tenantSlug: 'tabsons' }
    ],
    colorPairs: [
      { pairId: 'primary-button', foreground: '#ffffff', background: '#1a56db', ratio: 7.2, largeText: false, tenantSlug: 'tabsons' },
      { pairId: 'muted-copy', foreground: '#94a3b8', background: '#ffffff', ratio: 2.4, largeText: false, tenantSlug: 'tabsons' }
    ],
    keyboardShortcuts: [
      { shortcutId: 'skip-main', keys: 'Alt+1', description: 'Skip to content', conflict: false, tenantSlug: 'tabsons' },
      { shortcutId: 'duplicate-command', keys: 'Ctrl+K', description: 'Search', conflict: true, tenantSlug: 'tabsons' }
    ],
    analytics: {
      keyboardNavigationUsage: 42,
      screenReaderCompatibilityIssues: 3,
      focusIssues: 2,
      accessibilityErrors: 5
    },
    metadata: {
      source: 'platform-control-test',
      confidentialEmployeeRecord: 'salary 999999 leaveBalance 44',
      rawPayload: 'private'
    }
  };
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
    'services/notificationCenterService.js',
    'services/smartSearchService.js',
    'services/globalActivityFeedService.js',
    'services/uxPermissionSimplificationService.js',
    'services/dashboardPerformanceService.js'
  ].forEach(load);
  seedAccessibilityData();

  let loadError = null;
  try {
    load('services/accessibilityGovernanceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.AccessibilityGovernanceService;
  assert.ok(svc, 'AccessibilityGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.validateAccessibilityCompliance, 'function');
  assert.equal(typeof svc.calculateAccessibilityScore, 'function');
  assert.equal(typeof svc.auditAccessibilityViolations, 'function');
  assert.equal(typeof svc.normalizeAccessibilityPayload, 'function');
  assert.equal(typeof svc.freezeAccessibilityOutput, 'function');
  assert.equal(typeof svc.generateAccessibilityGovernanceReport, 'function');
  assert.equal(global.__ARTHHRMS_ACCESSIBILITY_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover keyboard navigation, screen reader support, scoring, compliance validation, and immutability');

  const malformed = svc.normalizeAccessibilityPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed accessibility output');

  const payload = samplePayload();
  const context = {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  };

  const normalized = svc.normalizeAccessibilityPayload(payload, context);
  assert.equal(normalized.success, true, 'normalization should accept accessibility payload');
  assert.equal(normalized.controls.some(control => control.controlId === 'hidden-payroll'), false, 'cross-tenant controls should be filtered');
  assert.equal(normalized.landmarks.some(landmark => landmark.landmarkId === 'abc-main'), false, 'cross-tenant landmarks should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|888888|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC/i, 'normalized output must redact sensitive and cross-tenant data');
  assertImmutable(normalized, 'normalized accessibility output');

  const validation = svc.validateAccessibilityCompliance(normalized);
  assert.equal(validation.success, true, 'accessibility validation should run');
  assert.ok(validation.violations.some(row => row.violationCode === 'MISSING_CONTROL_LABEL'), 'missing control labels should be detected');
  assert.ok(validation.violations.some(row => row.violationCode === 'LOW_CONTRAST'), 'low contrast should be detected');
  assert.ok(validation.violations.some(row => row.violationCode === 'INACCESSIBLE_DIALOG'), 'inaccessible dialogs should be detected');
  assert.ok(validation.violations.some(row => row.violationCode === 'MISSING_LIVE_REGION'), 'critical notifications without live regions should be detected');
  assert.ok(validation.keyboardNavigation.logicalTabOrder === true, 'logical tab order should be evaluated');
  assert.ok(validation.screenReaderSupport.ariaCoverageScore < 100, 'screen reader coverage should reflect missing labels');
  assertImmutable(validation, 'accessibility validation output');

  const score = svc.calculateAccessibilityScore(validation);
  assert.equal(score.success, true, 'accessibility score should calculate');
  assert.ok(score.accessibilityScore < 90, 'violations should reduce accessibility score');
  assert.ok(score.usabilityScore < 95, 'focus and keyboard issues should reduce usability score');
  assert.ok(score.complianceScore < 90, 'WCAG compliance score should reflect violations');
  assert.match(score.complianceClass, /MODERATE|HIGH|CRITICAL/, 'accessibility risk should be classified');
  assertImmutable(score, 'accessibility score output');

  const audit = svc.auditAccessibilityViolations(validation);
  assert.equal(audit.success, true, 'accessibility violations should audit');
  assert.ok(audit.remediationRecommendations.some(row => /label|aria|contrast|focus|dialog/i.test(row.recommendation)), 'remediation recommendations should be generated');
  assert.equal(audit.governance.accessibilityGovernancePreserved, true);
  assertImmutable(audit, 'accessibility audit output');

  const report = svc.generateAccessibilityGovernanceReport(payload, context);
  assert.equal(report.success, true, 'accessibility governance report should generate');
  assert.equal(report.governance.backwardCompatibilityPreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.accessibilityGovernancePreserved, true);
  assert.equal(report.governance.rbacGovernancePreserved, true);
  assert.ok(report.accessibilityScore < 90, 'report should surface score');
  assert.ok(report.validation.violations.length >= 4, 'report should include violations');
  assert.ok(report.remediationRecommendations.length >= 4, 'report should include remediation recommendations');
  assert.doesNotMatch(JSON.stringify(report), /999999|888888|salary|leaveBalance|ABC|confidential/i, 'report must not leak sensitive or cross-tenant data');
  assertImmutable(report, 'accessibility report output');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.accessibilityGovernanceHistory || []).length >= 1, 'accessibility history should persist');
  assert.ok((dataAfterReport.accessibilityGovernanceAnalytics || []).length >= 1, 'accessibility analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /ACCESSIBILITY_GOVERNANCE|ACCESSIBILITY_REVIEW/.test(log.actionType || log.eventType || '')), 'audit integration should record accessibility governance review');

  const blockedTenantRole = svc.generateAccessibilityGovernanceReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1', tenantSlug: 'tabsons' }
  });
  assert.equal(blockedTenantRole.success, false, 'tenant roles should not access platform accessibility governance');
  assertImmutable(blockedTenantRole, 'blocked tenant role output');

  const blockedCrossTenant = svc.generateAccessibilityGovernanceReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant accessibility governance should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateAccessibilityGovernanceReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tabsons' },
    infrastructureOnly: true,
    monitoringOnly: true,
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely for infrastructure accessibility monitoring');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('accessibilityGovernanceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
