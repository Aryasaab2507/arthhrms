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
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
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

function seedTenantData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TENANT-A', companyId: 'TENANT-A', companyName: 'Pilot Tenant' };
  data.platformGovernance = {
    ...(data.platformGovernance || {}),
    features: {
      reports: { key: 'reports', label: 'Reports', enabled: true, rolloutState: 'BETA', rolloutStage: 'PILOT_ENABLED', tenantRollouts: [{ tenantId: 'TENANT-A', enabled: true, rolloutState: 'BETA' }] },
      payroll: { key: 'payroll', label: 'Payroll', enabled: false, rolloutState: 'DISABLED', rolloutStage: 'DEVELOPMENT_ONLY' },
      aiInsights: { key: 'aiInsights', label: 'AI Insights', enabled: true, experimental: true, rolloutState: 'LIMITED_ROLLOUT', rolloutStage: 'LIMITED_PRODUCTION' }
    }
  };
  data.employees = [
    { id: 'EMP-A1', name: 'Tenant A', tenantId: 'TENANT-A', companyId: 'TENANT-A', role: 'employee', salary: 90000, leaveBalance: 12 },
    { id: 'EMP-B1', name: 'Tenant B', tenantId: 'TENANT-B', companyId: 'TENANT-B', role: 'employee', salary: 80000, leaveBalance: 8 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-A1', featureKey: 'reports', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', rolloutState: 'BETA', rolloutPercentage: 25, usageCount: 18, adoptionCount: 9, failureCount: 1, crashCount: 0, rollbackCount: 0, dependencyKeys: ['workflowEngine'], updatedAt: '2026-05-28T00:00:00.000Z' },
    { rolloutId: 'ROL-A2', featureKey: 'aiInsights', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', rolloutState: 'DEGRADED', rolloutPercentage: 40, usageCount: 6, adoptionCount: 2, failureCount: 3, crashCount: 2, rollbackCount: 1, dependencyKeys: ['reports'], updatedAt: '2026-05-28T01:00:00.000Z', confidentialNote: 'salary cohort issue' },
    { rolloutId: 'ROL-B1', featureKey: 'reports', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'ACTIVE', rolloutPercentage: 100, usageCount: 5, adoptionCount: 3, failureCount: 0, crashCount: 0, rollbackCount: 0, privatePayload: 'Tenant B confidential rollout' }
  ];
  data.featureUsageEvents = [
    { eventId: 'FUSE-1', featureKey: 'reports', tenantId: 'TENANT-A', eventType: 'FEATURE_USED', status: 'OK' },
    { eventId: 'FUSE-2', featureKey: 'aiInsights', tenantId: 'TENANT-A', eventType: 'FEATURE_CRASH', status: 'FAILED', salary: 90000 },
    { eventId: 'FUSE-B1', featureKey: 'reports', tenantId: 'TENANT-B', eventType: 'FEATURE_USED', status: 'OK', confidentialEmployeeRecord: 'hidden' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-FEAT-1', featureKey: 'reports', tenantId: 'TENANT-A', status: 'COMPLETED' },
    { eventId: 'WF-FEAT-2', featureKey: 'aiInsights', tenantId: 'TENANT-A', status: 'DEGRADED' }
  ];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/featureFlagValidator.js',
    'services/environmentGovernanceService.js',
    'services/platformGovernanceService.js',
    'services/platformAnalyticsService.js',
    'services/featureRolloutService.js'
  ].forEach(load);

  seedTenantData();

  assert.ok(global.FeatureRolloutService, 'FeatureRolloutService should be exported');
  assert.ok(Object.isFrozen(global.FeatureRolloutService), 'feature rollout service export must be immutable');
  assert.ok(Object.isFrozen(global.FeatureRolloutService.ROLLOUT_STATES), 'enterprise rollout states must be immutable');
  assert.deepEqual(global.FeatureRolloutService.ROLLOUT_STATES, ['DISABLED', 'INTERNAL_TESTING', 'BETA', 'LIMITED_ROLLOUT', 'ACTIVE', 'DEGRADED', 'ROLLBACK_PENDING', 'ARCHIVED']);
  assert.ok(Object.isFrozen(global.FeatureRolloutService.ROLLOUT_STAGES), 'rollout stages must be immutable');
  assert.deepEqual(global.FeatureRolloutService.ROLLOUT_STAGES, ['DEVELOPMENT_ONLY', 'STAGING_ONLY', 'PILOT_ENABLED', 'LIMITED_PRODUCTION', 'GLOBAL_PRODUCTION']);
  assert.equal(global.__ARTHHRMS_FEATURE_ROLLOUT_SELF_TEST__.passed, true, 'development self-test should cover rollout failure cases');

  const originalFeature = { key: 'aiInsights', label: 'AI Insights', enabled: false, experimental: true };
  const originalSnapshot = JSON.stringify(originalFeature);
  const normalized = global.FeatureRolloutService.normalizeFeatureFlag(originalFeature, { environment: 'PILOT' });
  assert.equal(JSON.stringify(originalFeature), originalSnapshot, 'normalization must not mutate original feature flags');
  assert.ok(Object.isFrozen(normalized), 'normalized feature output should be immutable');
  assert.equal(normalized.riskLevel, 'WARNING', 'experimental analytics should classify as warning');

  const localFallback = global.FeatureRolloutService.validateFeatureActivation('ALLOW_LOCAL_AUTH_FALLBACK', { enabled: true }, {
    actor: { role: 'platform_owner', id: 'PO1' },
    environment: 'PRODUCTION',
    flags: {
      PRODUCTION_MODE: true,
      USE_SUPABASE_AUTH: true,
      REQUIRE_EMAIL_VERIFIED: true,
      ALLOW_LOCAL_AUTH_FALLBACK: false
    }
  });
  assert.equal(localFallback.allowed, false, 'local auth fallback must be blocked in production');
  assert.ok(localFallback.failures.some(item => item.severity === 'CRITICAL' && item.failureCode === 'PRODUCTION_LOCAL_AUTH_FALLBACK'), 'unsafe production auth fallback should be critical');

  const authDisabled = global.FeatureRolloutService.validateFeatureActivation('USE_SUPABASE_AUTH', { enabled: false }, {
    actor: { role: 'platform_owner', id: 'PO1' },
    environment: 'PRODUCTION',
    flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: true, REQUIRE_EMAIL_VERIFIED: true }
  });
  assert.equal(authDisabled.allowed, false, 'production cannot disable Supabase auth through rollout');
  assert.ok(authDisabled.failures.some(item => item.failureCode === 'PRODUCTION_SUPABASE_AUTH_REQUIRED'));

  const superAdminGlobal = global.FeatureRolloutService.validateFeatureActivation('payroll', { enabled: true, rolloutStage: 'GLOBAL_PRODUCTION' }, {
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    environment: 'PRODUCTION',
    scope: 'global',
    flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: true, REQUIRE_EMAIL_VERIFIED: true }
  });
  assert.equal(superAdminGlobal.allowed, false, 'SUPER_ADMIN must not globally activate platform rollout');
  assert.ok(superAdminGlobal.failures.some(item => item.failureCode === 'GLOBAL_ROLLOUT_PLATFORM_OWNER_REQUIRED'));

  const tenantRollout = global.FeatureRolloutService.validateFeatureActivation('reports', {
    enabled: true,
    rolloutStage: 'PILOT_ENABLED',
    targetTenantId: 'TENANT-A',
    scope: 'tenant'
  }, {
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    environment: 'PILOT',
    tenantId: 'TENANT-A',
    scope: 'tenant'
  });
  assert.equal(tenantRollout.allowed, false, 'SUPER_ADMIN must not activate tenant business features');
  assert.ok(tenantRollout.failures.some(item => item.failureCode === 'SUPER_ADMIN_TENANT_FEATURE_ACTIVATION_BLOCKED'));

  const ownerTenantRollout = global.FeatureRolloutService.validateFeatureActivation('reports', {
    enabled: true,
    rolloutStage: 'PILOT_ENABLED',
    targetTenantId: 'TENANT-A',
    scope: 'tenant'
  }, {
    actor: { role: 'platform_owner', id: 'PO1' },
    environment: 'PILOT',
    tenantId: 'TENANT-A',
    scope: 'tenant'
  });
  assert.equal(ownerTenantRollout.allowed, true, 'PLATFORM_OWNER may activate tenant-scoped business features safely');
  assert.equal(tenantRollout.scope, 'tenant');

  const crossTenant = global.FeatureRolloutService.validateFeatureActivation('reports', {
    enabled: true,
    rolloutStage: 'PILOT_ENABLED',
    targetTenantId: 'TENANT-B',
    scope: 'tenant'
  }, {
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    environment: 'PILOT',
    tenantId: 'TENANT-A',
    scope: 'tenant'
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant rollout leakage must be blocked');
  assert.ok(crossTenant.failures.some(item => item.severity === 'CRITICAL' && item.failureCode === 'CROSS_TENANT_ROLLOUT_BLOCKED'));

  const ownerGlobal = global.FeatureRolloutService.validateFeatureActivation('aiInsights', {
    enabled: true,
    rolloutStage: 'GLOBAL_PRODUCTION'
  }, {
    actor: { role: 'platform_owner', id: 'PO1' },
    environment: 'PRODUCTION',
    flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: true, REQUIRE_EMAIL_VERIFIED: true }
  });
  assert.equal(ownerGlobal.allowed, true, 'platform owner can globally roll out non-critical feature when production safety passes');
  assert.ok(ownerGlobal.warnings.some(item => item.warningCode === 'RISKY_FEATURE_ACTIVATION'));

  const view = global.FeatureRolloutService.getFeatureGovernanceView({
    features: global.DB.getPlatformGovernance().features,
    actor: { role: 'platform_owner', id: 'PO1' },
    environment: 'PRODUCTION',
    flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: true, REQUIRE_EMAIL_VERIFIED: true }
  });
  assert.equal(view.success, true);
  assert.ok(view.features.length > 0, 'feature governance view should include existing flags');
  assert.ok(view.riskyFlags >= 1, 'risky flags should be counted');
  assert.ok(Object.isFrozen(view), 'feature governance view should be immutable');
  assert.ok(Object.isFrozen(view.features), 'feature rows should be immutable');
  assert.ok(view.features.every(row => Object.isFrozen(row)), 'feature rows should not expose mutable references');

  const malformed = global.FeatureRolloutService.validateFeatureActivation(null, 'bad-updates', {
    actor: { role: 'platform_owner' },
    environment: 'PRODUCTION'
  });
  assert.equal(malformed.allowed, false, 'malformed feature activation should fail safely');

  const rolloutScope = global.FeatureRolloutService.validateRolloutScope({
    featureKey: 'reports',
    targetTenantId: 'TENANT-A',
    activationRequested: true,
    rolloutState: 'BETA'
  }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(rolloutScope.allowed, true, 'PLATFORM_OWNER rollout scope should be allowed inside platform-control');

  const tenantRoleScope = global.FeatureRolloutService.validateRolloutScope({ featureKey: 'reports', activationRequested: true }, {
    routeType: 'tenant',
    actor: { role: 'director', id: 'DIR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access rollout governance');
  assert.ok(tenantRoleScope.failures.some(item => item.failureCode === 'TENANT_ROLE_ROLLOUT_GOVERNANCE_BLOCKED'));

  const archivedMutation = global.FeatureRolloutService.validateRolloutScope({ featureKey: 'reports', rolloutState: 'ARCHIVED', activationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived rollout history must be immutable');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_ROLLOUT_MUTATION_BLOCKED'));

  const normalizedPayload = global.FeatureRolloutService.normalizeFeaturePayload({
    featureKey: 'aiInsights',
    rolloutState: 'limited rollout',
    rolloutPercentage: 40,
    targetTenantId: 'TENANT-A',
    salary: 90000,
    leaveBalance: 12,
    confidentialEmployeeRecord: 'hidden'
  });
  assert.equal(normalizedPayload.success, true, 'feature payload should normalize');
  assert.equal(normalizedPayload.payload.rolloutState, 'LIMITED_ROLLOUT');
  assert.ok(Object.isFrozen(normalizedPayload), 'normalized rollout payload must be immutable');
  assert.doesNotMatch(JSON.stringify(normalizedPayload), /salary|leaveBalance|90000|hidden/i);

  const degradation = global.FeatureRolloutService.detectRolloutDegradation({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(degradation.success, true, 'rollout degradation detection should work');
  assert.ok(degradation.summary.rolloutFailures >= 1);
  assert.ok(degradation.summary.degradedFeatureBehavior >= 1);
  assert.ok(degradation.summary.featureCrashIndicators >= 1);
  assert.ok(degradation.summary.rollbackFrequency >= 1);
  assert.doesNotMatch(JSON.stringify(degradation), /salary|leaveBalance|Tenant B confidential|hidden/i);

  const rollback = global.FeatureRolloutService.validateRollbackGovernance({
    featureKey: 'aiInsights',
    targetTenantId: 'TENANT-A',
    rolloutState: 'ROLLBACK_PENDING',
    rollbackType: 'staged',
    dependencyKeys: ['reports']
  }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(rollback.success, true, 'rollback governance should validate');
  assert.equal(rollback.rollbackGovernance.stagedRollback, true);
  assert.equal(rollback.rollbackGovernance.rollbackDependencyValidation, true);

  const before = JSON.stringify({
    featureRolloutRecords: global.DB.get().featureRolloutRecords,
    featureUsageEvents: global.DB.get().featureUsageEvents,
    platformGovernance: global.DB.get().platformGovernance
  });
  const report = global.FeatureRolloutService.generateFeatureRolloutReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(report.success, true, 'feature rollout report should generate');
  assert.equal(report.featureFlagModel.states.length, 8);
  assert.equal(report.accessGovernance.crossTenantRolloutLeakageBlocked, true);
  assert.equal(report.accessGovernance.superAdminActivationAuthority, false);
  assert.equal(report.accessGovernance.platformIsolationPreserved, true);
  assert.ok(report.featureHealth.rolloutFailures >= 1);
  assert.ok(report.featureAdoptionAnalytics.tenantFeatureAdoption >= 1);
  assert.ok(report.rollbackGovernance.rollbackAuditTrails >= 1);
  assert.ok(report.platformAnalyticsIntegration.adoptionHealth >= 0);
  assert.ok(Object.isFrozen(report), 'feature rollout report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /salary|leaveBalance|EMP-A1|Tenant B confidential|privatePayload|confidentialEmployeeRecord/i);
  assert.equal(JSON.stringify({
    featureRolloutRecords: global.DB.get().featureRolloutRecords,
    featureUsageEvents: global.DB.get().featureUsageEvents,
    platformGovernance: global.DB.get().platformGovernance
  }), before, 'feature rollout governance must not mutate historical records');

  const recentTelemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(recentTelemetry.some(row => /FEATURE_ROLLOUT/.test(row.eventType)), 'rollout decisions should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /FEATURE_ROLLOUT/.test(row.actionType || row.action || '')), 'rollout decisions should be audited safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.FEATURE_ROLLOUT_REPORTED, 'feature rollout metrics should aggregate safely');

  const originalTelemetry = global.WorkflowTelemetryService;
  const originalPlatformAnalytics = global.PlatformAnalyticsService;
  try {
    delete global.WorkflowTelemetryService;
    delete global.PlatformAnalyticsService;
    const degraded = global.FeatureRolloutService.generateFeatureRolloutReport({}, {
      routeType: 'platform',
      actor: { role: 'platform_owner', id: 'PO1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing rollout integrations should degrade safely');
    assert.equal(degraded.integrationHealth.workflowTelemetryIntegrated, false);
    assert.equal(degraded.integrationHealth.platformAnalyticsIntegrated, false);
  } finally {
    if (originalTelemetry) global.WorkflowTelemetryService = originalTelemetry;
    if (originalPlatformAnalytics) global.PlatformAnalyticsService = originalPlatformAnalytics;
  }

  console.log('featureRolloutService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
