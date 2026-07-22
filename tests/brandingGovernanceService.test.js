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
    style: { setProperty() {}, removeProperty() {} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
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
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return fakeEl(); },
    addEventListener() {},
    body: fakeEl(),
    documentElement: fakeEl()
  };
}

function seedBrandingData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.brandingGovernanceHistory = [];
  data.themeGovernanceHistory = [];
  data.brandingGovernanceAnalytics = [];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', salary: 75000, leaveBalance: 12 },
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', salary: 999999, leaveBalance: 44 }
  ];
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
    themeState: 'CUSTOM',
    themeMode: 'dark',
    profile: {
      profileId: 'BRAND-tabsons',
      companyName: 'Tabsons Industries',
      platformName: 'Tabsons HR Portal',
      identityLabel: 'People Operations',
      logoUrl: 'https://assets.example.com/tabsons/logo.svg',
      faviconUrl: 'https://assets.example.com/tabsons/favicon.ico',
      typography: 'Inter',
      loginScreenBranding: true,
      emailBrandingPrepared: true,
      pdfBrandingPrepared: true
    },
    colors: {
      primary: '#1a56db',
      secondary: '#0ea5e9',
      accent: '#059669',
      background: '#0f172a',
      surface: '#ffffff',
      text: '#f8fafc'
    },
    themeVariables: {
      '--brand-primary': '#1a56db',
      '--brand-secondary': '#0ea5e9',
      '--brand-accent': '#059669'
    },
    assets: [
      { assetId: 'logo', type: 'logo', url: 'https://assets.example.com/tabsons/logo.svg', tenantSlug: 'tabsons' },
      { assetId: 'abc-logo', type: 'logo', url: 'https://assets.example.com/abc/logo.svg', tenantSlug: 'abc', salary: 999999 }
    ],
    analytics: {
      themeUsage: 18,
      darkModeAdoption: 6,
      brandingActivations: 3,
      brandingChanges: 4,
      themePerformanceImpactMs: 22,
      customizationTrend: 71
    },
    metadata: {
      source: 'branding-governance-test',
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
    'services/tenantIsolationService.js',
    'services/tenantGovernanceService.js',
    'services/uxPermissionSimplificationService.js',
    'services/accessibilityGovernanceService.js',
    'services/notificationCenterService.js'
  ].forEach(load);
  seedBrandingData();

  let loadError = null;
  try {
    load('services/brandingGovernanceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.BrandingGovernanceService;
  assert.ok(svc, 'BrandingGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.applyTheme, 'function');
  assert.equal(typeof svc.validateBrandingProfile, 'function');
  assert.equal(typeof svc.calculateBrandingScore, 'function');
  assert.equal(typeof svc.normalizeBrandingPayload, 'function');
  assert.equal(typeof svc.freezeBrandingOutput, 'function');
  assert.equal(typeof svc.generateBrandingGovernanceReport, 'function');
  assert.equal(global.__ARTHHRMS_BRANDING_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover theme switching, tenant isolation, validation, accessibility, and immutability');

  const malformed = svc.normalizeBrandingPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed branding output');

  const payload = samplePayload();
  const context = {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1', tenantSlug: 'tabsons' }
  };

  const normalized = svc.normalizeBrandingPayload(payload, context);
  assert.equal(normalized.success, true, 'branding payload should normalize');
  assert.equal(normalized.assets.some(asset => asset.assetId === 'abc-logo'), false, 'cross-tenant branding assets should be filtered');
  assert.equal(normalized.themeState, 'CUSTOM');
  assert.equal(normalized.themeMode, 'DARK');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC/i, 'normalized output must redact sensitive and cross-tenant data');
  assertImmutable(normalized, 'normalized branding output');

  const validation = svc.validateBrandingProfile(normalized);
  assert.equal(validation.success, true, 'branding validation should run');
  assert.equal(validation.tenantIsolation.brandingCacheLeakageBlocked, true);
  assert.equal(validation.whiteLabelGovernance.safeFallbackAvailable, true);
  assert.equal(validation.accessibilityGovernance.accessibilityPreserved, true);
  assert.ok(validation.validationResults.length >= 1, 'validation should include positive validation results');
  assertImmutable(validation, 'branding validation output');

  const score = svc.calculateBrandingScore(validation);
  assert.equal(score.success, true, 'branding score should calculate');
  assert.ok(score.themeComplianceScore >= 80, 'valid theme should have strong compliance');
  assert.ok(score.brandingReadinessScore >= 80, 'valid branding should have strong readiness');
  assert.ok(score.brandingAdoptionScore >= 0, 'adoption score should be present');
  assertImmutable(score, 'branding score output');

  const applied = svc.applyTheme(normalized, {
    ...context,
    dryRun: true,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(applied.success, true, 'theme apply should support dry-run switching');
  assert.equal(applied.appliedTheme.themeMode, 'DARK');
  assert.equal(applied.performance.fullPageReloadRequired, false);
  assert.equal(applied.governance.brandingGovernancePreserved, true);
  assertImmutable(applied, 'applied branding output');

  const report = svc.generateBrandingGovernanceReport(payload, context);
  assert.equal(report.success, true, 'branding governance report should generate');
  assert.equal(report.themeEngine.themeState, 'VALIDATED');
  assert.equal(report.whiteLabelGovernance.tenantBrandingIsolation, true);
  assert.equal(report.governance.backwardCompatibilityPreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.brandingGovernancePreserved, true);
  assert.equal(report.accessibilityGovernance.accessibilityPreserved, true);
  assert.ok(report.themeComplianceScore >= 80);
  assert.ok(report.brandingReadinessScore >= 80);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|ABC|confidential/i, 'report must not leak sensitive or cross-tenant branding data');
  assertImmutable(report, 'branding report output');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.brandingGovernanceHistory || []).length >= 1, 'branding history should persist');
  assert.ok((dataAfterReport.themeGovernanceHistory || []).length >= 1, 'theme history should persist');
  assert.ok((dataAfterReport.brandingGovernanceAnalytics || []).length >= 1, 'branding analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /BRANDING_GOVERNANCE|THEME_CHANGE|WHITE_LABEL/.test(log.actionType || log.eventType || '')), 'audit integration should record branding governance');

  const invalid = svc.validateBrandingProfile(svc.normalizeBrandingPayload({
    tenantSlug: 'tabsons',
    routeType: 'platform',
    profile: { companyName: '', logoUrl: 'javascript:alert(1)', faviconUrl: 'private://tenant/favicon.ico' },
    colors: { primary: 'blue', text: '#999999', background: '#ffffff' },
    themeVariables: { '--brand-primary': 'broken' }
  }, context));
  assert.equal(invalid.success, true, 'invalid profile should validate without throwing');
  assert.ok(invalid.validationResults.some(row => row.status === 'BLOCKED' || row.status === 'WARNING'), 'invalid profile should produce governance findings');

  const blockedTenantRole = svc.generateBrandingGovernanceReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1', tenantSlug: 'tabsons' }
  });
  assert.equal(blockedTenantRole.success, false, 'tenant roles should not access platform branding governance yet');
  assertImmutable(blockedTenantRole, 'blocked tenant role output');

  const blockedCrossTenant = svc.generateBrandingGovernanceReport({ ...payload, tenantSlug: 'abc' }, context);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant branding governance should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  const dependencyAbsent = svc.generateBrandingGovernanceReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1', tenantSlug: 'tabsons' },
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;

  console.log('brandingGovernanceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
