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
    style: { setProperty(){}, removeProperty(){} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
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

function seedPreferenceData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.users = [
    { id: 'U-1', empId: 'EMP-1', tenantSlug: 'tabsons', role: 'employee', email: 'one@example.com' },
    { id: 'U-2', empId: 'EMP-2', tenantSlug: 'tabsons', role: 'manager', email: 'two@example.com' },
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', role: 'employee', email: 'abc@example.com' }
  ];
  data.employees = [
    { id: 'EMP-1', tenantSlug: 'tabsons', name: 'One', salary: 75000, leaveBalance: 12 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'ABC', salary: 999999, leaveBalance: 44 }
  ];
  data.userPreferenceRecords = [];
  data.userPreferenceHistory = [];
  data.userPreferenceAnalytics = [];
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
    userId: 'U-1',
    preferenceState: 'CUSTOMIZED',
    preferences: {
      theme: {
        mode: 'dark',
        selectedTheme: 'tenant-dark',
        accentColor: '#1a56db'
      },
      dashboard: {
        layout: 'compact',
        widgets: ['attendance', 'leave', 'notifications', 'smart-search'],
        hiddenWidgets: ['legacy'],
        defaultRoute: 'employee-dashboard'
      },
      notifications: {
        channels: ['in_app', 'email'],
        digestFrequency: 'daily',
        quietHours: { start: '21:00', end: '07:00' },
        mutedCategories: ['marketing']
      },
      navigation: {
        shortcuts: ['attendance', 'leave', 'approvals'],
        pinnedModules: ['notifications', 'smart-search']
      },
      accessibility: {
        reducedMotion: true,
        highContrast: false,
        fontScale: 1.1,
        keyboardMode: true
      },
      search: {
        savedSearches: ['my approvals', 'open leave'],
        defaultScope: 'global'
      },
      display: {
        density: 'compact',
        language: 'en-IN',
        timezone: 'Asia/Kolkata'
      }
    },
    analytics: {
      themeAdoption: 8,
      dashboardCustomization: 5,
      notificationPreferenceUsage: 4,
      accessibilityPreferenceUsage: 2,
      preferenceResetFrequency: 0
    },
    metadata: {
      source: 'preference-test',
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
    'services/brandingGovernanceService.js',
    'services/accessibilityGovernanceService.js',
    'services/notificationCenterService.js',
    'services/smartSearchService.js',
    'services/uxPermissionSimplificationService.js',
    'services/tenantIsolationService.js'
  ].forEach(load);
  seedPreferenceData();

  let loadError = null;
  try {
    load('services/userPreferenceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.UserPreferenceService;
  assert.ok(svc, 'UserPreferenceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.saveUserPreferences, 'function');
  assert.equal(typeof svc.loadUserPreferences, 'function');
  assert.equal(typeof svc.restoreDefaultPreferences, 'function');
  assert.equal(typeof svc.normalizePreferencePayload, 'function');
  assert.equal(typeof svc.freezePreferenceOutput, 'function');
  assert.equal(typeof svc.generatePreferenceReport, 'function');
  assert.equal(global.__ARTHHRMS_USER_PREFERENCE_SELF_TEST__.passed, true, 'development self-test should cover persistence, theme, notification, accessibility, and immutability');

  const malformed = svc.normalizePreferencePayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed preference output');

  const payload = samplePayload();
  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'U-1', empId: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }
  };

  const normalized = svc.normalizePreferencePayload(payload, context);
  assert.equal(normalized.success, true, 'preference payload should normalize');
  assert.equal(normalized.userId, 'U-1');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.preferenceState, 'CUSTOMIZED');
  assert.equal(normalized.preferences.theme.mode, 'DARK');
  assert.equal(normalized.preferences.accessibility.reducedMotion, true);
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC/i, 'normalized output must redact sensitive values');
  assertImmutable(normalized, 'normalized preference output');

  const saved = svc.saveUserPreferences(payload, context);
  assert.equal(saved.success, true, 'preferences should save');
  assert.equal(saved.preferenceRecord.preferenceState, 'ACTIVE');
  assert.equal(saved.governance.personalPreferencesOnly, true);
  assert.equal(saved.governance.rbacGovernancePreserved, true);
  assert.equal(saved.integrationHealth.themeIntegrated, true);
  assert.equal(saved.integrationHealth.accessibilityIntegrated, true);
  assert.equal(saved.integrationHealth.notificationCenterIntegrated, true);
  assertImmutable(saved, 'saved preference output');

  const loaded = svc.loadUserPreferences({ userId: 'U-1', tenantSlug: 'tabsons' }, context);
  assert.equal(loaded.success, true, 'preferences should load');
  assert.equal(loaded.preferenceRecord.userId, 'U-1');
  assert.equal(loaded.preferenceRecord.preferences.theme.mode, 'DARK');
  assert.equal(loaded.preferenceRecord.preferences.display.density, 'COMPACT');
  assertImmutable(loaded, 'loaded preference output');

  const report = svc.generatePreferenceReport({ userId: 'U-1', tenantSlug: 'tabsons' }, context);
  assert.equal(report.success, true, 'preference report should generate');
  assert.ok(report.personalizationAdoptionScore >= 0);
  assert.ok(report.preferenceUtilizationScore >= 0);
  assert.equal(report.governance.userPreferenceGovernancePreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.personalization.personalizationNeverChangesPermissions, true);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|ABC|confidential/i, 'report must not leak sensitive or cross-user data');
  assertImmutable(report, 'preference report output');

  const restored = svc.restoreDefaultPreferences({ userId: 'U-1', tenantSlug: 'tabsons' }, context);
  assert.equal(restored.success, true, 'default restore should succeed');
  assert.equal(restored.preferenceRecord.preferenceState, 'RESET');
  assert.equal(restored.preferenceRecord.preferences.theme.mode, 'DEFAULT');
  assertImmutable(restored, 'restored preference output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.userPreferenceRecords || []).some(row => row.userId === 'U-1'), 'preference record should persist');
  assert.ok((dataAfter.userPreferenceHistory || []).length >= 2, 'preference history should persist');
  assert.ok((dataAfter.userPreferenceAnalytics || []).length >= 1, 'preference analytics should persist');
  assert.ok((dataAfter.auditLogs || []).some(log => /USER_PREFERENCE|PREFERENCE_RESET|PREFERENCE_UPDATE/.test(log.actionType || log.eventType || '')), 'audit integration should record preference changes');

  const blockedOtherUser = svc.loadUserPreferences({ userId: 'U-2', tenantSlug: 'tabsons' }, context);
  assert.equal(blockedOtherUser.success, false, 'users should not load another user preferences');
  assert.match(blockedOtherUser.classification, /USER|SCOPE|BLOCK/i);
  assertImmutable(blockedOtherUser, 'blocked other user output');

  const blockedCrossTenant = svc.saveUserPreferences({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant preference saves should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const invalid = svc.normalizePreferencePayload({
    tenantSlug: 'tabsons',
    userId: 'U-1',
    preferenceState: 'broken',
    preferences: {
      theme: { mode: 'neon', accentColor: 'blue' },
      accessibility: { fontScale: 99 },
      notifications: { digestFrequency: 'every second', channels: ['sms', 'private'] },
      display: { density: 'chaos', language: '<script>', timezone: '' }
    }
  }, context);
  assert.equal(invalid.success, true, 'invalid preference values should normalize safely');
  assert.equal(invalid.preferences.theme.mode, 'DEFAULT');
  assert.ok(invalid.validationWarnings.length >= 3, 'invalid values should produce warnings');

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.saveUserPreferences(payload, {
    ...context,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('userPreferenceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
