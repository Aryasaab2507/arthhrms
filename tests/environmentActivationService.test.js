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

function safeStagingReport() {
  return {
    readiness: 'READY',
    riskLevel: 'SAFE',
    failures: [],
    warnings: [],
    metadata: {
      rlsBypassed: false,
      serviceRoleExposed: false,
      productionDataMutated: false,
      tenantIsolationPreserved: true
    },
    sections: [
      { validationType: 'RLS', passed: true, failures: [], warnings: [] },
      { validationType: 'AUTH', passed: true, failures: [], warnings: [] },
      { validationType: 'ONBOARDING', passed: true, failures: [], warnings: [] }
    ]
  };
}

function safeFlags() {
  return {
    USE_SUPABASE_AUTH: true,
    USE_SUPABASE_INVITES: true,
    REQUIRE_EMAIL_VERIFIED: true,
    REQUIRE_APP_METADATA_ROLE: true,
    ALLOW_LOCAL_AUTH_FALLBACK: false,
    ALLOW_ANONYMOUS_AUTH: false,
    ENABLE_ANONYMOUS_AUTH: false,
    ANONYMOUS_AUTH_ENABLED: false,
    SUPABASE_ANON_AUTH_ENABLED: false,
    PRODUCTION_MODE: true,
    PILOT_MODE: false,
    DEVELOPMENT_MODE: false,
    DEMO_MODE: false
  };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/featureFlagValidator.js',
    'services/environmentGovernanceService.js',
    'services/stagingValidationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/environmentActivationService.js');

  assert.ok(global.EnvironmentActivationService, 'EnvironmentActivationService should be exported');
  assert.ok(Object.isFrozen(global.EnvironmentActivationService), 'service export must be frozen');
  assert.ok(Object.isFrozen(global.EnvironmentActivationService.ENVIRONMENT_STATES), 'environment states must be immutable');
  assert.equal(global.__ARTHHRMS_ENVIRONMENT_ACTIVATION_SELF_TEST__.passed, true, 'development self-test should pass');

  assert.equal(global.EnvironmentActivationService.normalizeEnvironmentState('production'), 'FULL_PRODUCTION');
  assert.equal(global.EnvironmentActivationService.normalizeEnvironmentState('limited-production'), 'LIMITED_PRODUCTION');

  const directPath = global.EnvironmentActivationService.validatePromotionPath('DEVELOPMENT', 'FULL_PRODUCTION');
  assert.equal(directPath.valid, false, 'direct production promotion should be blocked');
  assert.ok(directPath.failures.some(item => item.failureCode === 'DIRECT_PROMOTION_BLOCKED'));

  const pilotPath = global.EnvironmentActivationService.validatePromotionPath('STAGING', 'PILOT');
  assert.equal(pilotPath.valid, true, 'staging to pilot should be a valid staged promotion');

  const governedProductionPath = global.EnvironmentActivationService.validatePromotionPath('STAGING', 'FULL_PRODUCTION', 'staging_to_full_production');
  assert.equal(governedProductionPath.valid, true, 'governed staging to production promotion should be valid after promotion gates');

  const failedStaging = global.EnvironmentActivationService.validateEnvironmentReadiness({
    currentEnvironment: 'STAGING',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionPath: 'limited_to_full_production',
    stagingValidationReport: { readiness: 'BLOCKED', failures: [{ failureCode: 'RLS_FAILED', severity: 'CRITICAL_BLOCKER', message: 'RLS failed' }] },
    flags: safeFlags(),
    config: { SUPABASE_URL: 'https://prod-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_prod' },
    origin: 'https://platform.arthhrms.com'
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(failedStaging.ready, false, 'failed staging validation must block production promotion');
  assert.ok(failedStaging.failures.some(item => item.failureCode === 'FAILED_STAGING_VALIDATION_BLOCKED'));

  const unsafeFlags = global.EnvironmentActivationService.validateEnvironmentReadiness({
    currentEnvironment: 'LIMITED_PRODUCTION',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionPath: 'limited_to_full_production',
    stagingValidationReport: safeStagingReport(),
    flags: { ...safeFlags(), ALLOW_LOCAL_AUTH_FALLBACK: true, USE_SUPABASE_AUTH: false, ALLOW_ANONYMOUS_AUTH: true },
    config: { SUPABASE_URL: 'https://prod-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_prod' },
    origin: 'https://platform.arthhrms.com'
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(unsafeFlags.ready, false, 'unsafe production flags must block activation');
  assert.ok(unsafeFlags.failures.some(item => item.failureCode === 'LOCAL_AUTH_FALLBACK_PRODUCTION_BLOCKED'));
  assert.ok(unsafeFlags.failures.some(item => item.failureCode === 'SUPABASE_AUTH_REQUIRED_FOR_PRODUCTION'));
  assert.ok(unsafeFlags.failures.some(item => item.failureCode === 'ANONYMOUS_AUTH_HIGH_RISK'));

  const mismatch = global.EnvironmentActivationService.validateEnvironmentReadiness({
    currentEnvironment: 'LIMITED_PRODUCTION',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionPath: 'limited_to_full_production',
    stagingValidationReport: safeStagingReport(),
    flags: safeFlags(),
    config: { SUPABASE_URL: 'https://staging-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_staging' },
    origin: 'http://localhost:5173'
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(mismatch.ready, false, 'environment mismatch must block production readiness');
  assert.ok(mismatch.failures.some(item => item.failureCode === 'LOCALHOST_FULL_PRODUCTION_BLOCKED'));
  assert.ok(mismatch.failures.some(item => item.failureCode === 'SUPABASE_ENVIRONMENT_MISMATCH'));

  const crossTenant = global.EnvironmentActivationService.validateEnvironmentReadiness({
    currentEnvironment: 'LIMITED_PRODUCTION',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionPath: 'limited_to_full_production',
    stagingValidationReport: {
      ...safeStagingReport(),
      failures: [{ failureCode: 'CROSS_TENANT_VISIBILITY', severity: 'CRITICAL_BLOCKER', message: 'Tenant leak' }]
    },
    flags: safeFlags(),
    config: { SUPABASE_URL: 'https://prod-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_prod' },
    origin: 'https://platform.arthhrms.com'
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(crossTenant.ready, false, 'cross-tenant failures must block promotion');
  assert.ok(crossTenant.failures.some(item => item.failureCode === 'CROSS_TENANT_VISIBILITY_BLOCKED'));

  const beforeEnvironment = JSON.stringify(global.DB.getEnvironmentState ? global.DB.getEnvironmentState() : global.DB.get().environmentState || {});
  const validationOnly = global.EnvironmentActivationService.requestEnvironmentPromotion({
    currentEnvironment: 'LIMITED_PRODUCTION',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionPath: 'limited_to_full_production',
    validationOnly: true,
    stagingValidationReport: safeStagingReport(),
    flags: safeFlags(),
    config: { SUPABASE_URL: 'https://prod-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_prod' },
    origin: 'https://platform.arthhrms.com'
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(validationOnly.success, true);
  assert.equal(validationOnly.activated, false, 'validation-only mode must not activate environment');
  assert.equal(JSON.stringify(global.DB.getEnvironmentState ? global.DB.getEnvironmentState() : global.DB.get().environmentState || {}), beforeEnvironment, 'validation-only mode must not mutate environment state');
  assert.ok(Object.isFrozen(validationOnly), 'promotion output must be immutable');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ENVIRONMENT_ACTIVATION/.test(row.eventType)), 'activation validation should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ENVIRONMENT_ACTIVATION/.test(row.actionType || row.action || '')), 'activation validation should audit actions safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ENVIRONMENT_ACTIVATION_VALIDATED, 'activation validation should aggregate metrics safely');

  assert.ok(Object.isFrozen(global.EnvironmentActivationService.PROMOTION_STATES), 'promotion states must be immutable');
  assert.deepEqual(global.EnvironmentActivationService.PROMOTION_STATES, ['STAGING', 'VALIDATING', 'APPROVAL_PENDING', 'PROMOTION_READY', 'PROMOTING', 'DEGRADED', 'PROMOTED', 'ARCHIVED']);
  assert.equal(typeof global.EnvironmentActivationService.normalizePromotionPayload, 'function', 'normalizePromotionPayload helper should be exported');
  assert.equal(typeof global.EnvironmentActivationService.verifyEnvironmentParity, 'function', 'verifyEnvironmentParity helper should be exported');
  assert.equal(typeof global.EnvironmentActivationService.calculatePromotionConfidence, 'function', 'calculatePromotionConfidence helper should be exported');
  assert.equal(typeof global.EnvironmentActivationService.validatePromotionEligibility, 'function', 'validatePromotionEligibility helper should be exported');
  assert.equal(typeof global.EnvironmentActivationService.generateEnvironmentPromotionReport, 'function', 'generateEnvironmentPromotionReport helper should be exported');
  assert.equal(global.__ARTHHRMS_ENVIRONMENT_PROMOTION_SELF_TEST__.passed, true, 'promotion self-test should cover environment transition failure cases');

  const malformedPromotion = global.EnvironmentActivationService.normalizePromotionPayload(Symbol('bad-promotion'));
  assert.equal(malformedPromotion.success, false, 'malformed promotion payloads should fail safely');
  assert.ok(Object.isFrozen(malformedPromotion), 'malformed promotion output should be immutable');

  const normalizedPromotion = global.EnvironmentActivationService.normalizePromotionPayload({
    promotionId: 'PROMO-NORM',
    state: 'approval pending',
    fromEnvironment: 'staging',
    targetEnvironment: 'production',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocumentUrl: 'private://release-cert.pdf', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  });
  assert.equal(normalizedPromotion.success, true, 'promotion payload should normalize');
  assert.equal(normalizedPromotion.payload.promotionState, 'APPROVAL_PENDING');
  assert.equal(normalizedPromotion.payload.fromEnvironment, 'STAGING');
  assert.equal(normalizedPromotion.payload.targetEnvironment, 'FULL_PRODUCTION');
  assert.doesNotMatch(JSON.stringify(normalizedPromotion), /90000|"leaveBalance"|private:\/\/release-cert|hidden|secret-token/i, 'promotion outputs must filter confidential fields');

  const parityInput = {
    staging: {
      configuration: { runtime: 'supabase', auth: 'required' },
      featureFlags: { USE_SUPABASE_AUTH: true, ALLOW_LOCAL_AUTH_FALLBACK: false },
      schemaVersion: '2026.06.01',
      migrationVersion: '2026.06.01',
      permissions: { hr: 'tenant-scoped', employee: 'own-records' },
      serviceDependencies: { database: 'ready', storage: 'ready' }
    },
    production: {
      configuration: { runtime: 'supabase', auth: 'required' },
      featureFlags: { USE_SUPABASE_AUTH: true, ALLOW_LOCAL_AUTH_FALLBACK: false },
      schemaVersion: '2026.06.01',
      migrationVersion: '2026.06.01',
      permissions: { hr: 'tenant-scoped', employee: 'own-records' },
      serviceDependencies: { database: 'ready', storage: 'ready' }
    }
  };
  const parity = global.EnvironmentActivationService.verifyEnvironmentParity(parityInput);
  assert.equal(parity.success, true, 'environment parity should run');
  assert.equal(parity.environmentConsistent, true, 'matching environments should be consistent');
  assert.equal(parity.environmentConsistencyScore, 100, 'matching environments should score 100');
  assert.ok(Object.isFrozen(parity.environmentValidationResults), 'parity validation results should be immutable');

  const mismatchParity = global.EnvironmentActivationService.verifyEnvironmentParity({
    staging: parityInput.staging,
    production: { ...parityInput.production, schemaVersion: '2026.06.02', permissions: { hr: 'global', employee: 'own-records' } }
  });
  assert.equal(mismatchParity.environmentConsistent, false, 'environment mismatches should be detected');
  assert.ok(mismatchParity.environmentConsistencyScore < 100, 'environment mismatches should reduce consistency score');
  assert.ok(mismatchParity.environmentValidationResults.some(row => row.passed === false), 'mismatch rows should be surfaced safely');

  const blockedEligibility = global.EnvironmentActivationService.validatePromotionEligibility({
    promotionId: 'PROMO-BLOCKED',
    fromEnvironment: 'STAGING',
    targetEnvironment: 'FULL_PRODUCTION',
    approvalRequested: true,
    readinessCertified: false,
    deploymentValidated: false,
    healthValidated: false,
    criticalIncidentExists: true,
    activeEmergencyOverride: true,
    rollbackReady: false,
    environmentParity: mismatchParity
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(blockedEligibility.eligible, false, 'hard blockers should block promotion eligibility');
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'CERTIFICATION_MISSING_BLOCKS_PROMOTION'));
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'CRITICAL_INCIDENT_BLOCKS_PROMOTION'));
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'ACTIVE_EMERGENCY_OVERRIDE_BLOCKS_PROMOTION'));
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'DEPLOYMENT_VALIDATION_BLOCKS_PROMOTION'));
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'ENVIRONMENT_MISMATCH_BLOCKS_PROMOTION'));
  assert.ok(blockedEligibility.failures.some(item => item.failureCode === 'ROLLBACK_READINESS_BLOCKS_PROMOTION'));

  const superAdminBlocked = global.EnvironmentActivationService.validatePromotionEligibility({
    promotionId: 'PROMO-SA',
    fromEnvironment: 'STAGING',
    targetEnvironment: 'FULL_PRODUCTION',
    approvalRequested: true,
    readinessCertified: true,
    deploymentValidated: true,
    rolloutStabilized: true,
    migrationVerified: true,
    rbacValidated: true,
    auditValidated: true,
    healthValidated: true,
    rollbackReady: true,
    environmentParity: parity
  }, { actor: { role: 'SUPER_ADMIN', id: 'SA1' }, routeType: 'platform' });
  assert.equal(superAdminBlocked.eligible, false, 'SUPER_ADMIN must not approve production promotion');
  assert.ok(superAdminBlocked.failures.some(item => item.failureCode === 'SUPER_ADMIN_PROMOTION_AUTHORITY_BLOCKED'));

  const healthyConfidence = global.EnvironmentActivationService.calculatePromotionConfidence({
    readinessCertified: true,
    deploymentValidated: true,
    rolloutStabilized: true,
    migrationVerified: true,
    rbacValidated: true,
    auditValidated: true,
    healthValidated: true,
    rollbackReady: true,
    environmentParity: parity
  });
  assert.equal(healthyConfidence.success, true, 'promotion confidence should run');
  assert.ok(healthyConfidence.promotionConfidenceScore >= 90, 'healthy promotion gates should score high confidence');
  assert.equal(healthyConfidence.promotionBlocked, false);

  const report = global.EnvironmentActivationService.generateEnvironmentPromotionReport({
    promotionId: 'PROMO-READY',
    fromEnvironment: 'STAGING',
    targetEnvironment: 'FULL_PRODUCTION',
    promotionState: 'PROMOTION_READY',
    approvalStatus: 'APPROVED',
    approvals: [{ approverRole: 'PLATFORM_OWNER', status: 'APPROVED' }],
    readinessCertified: true,
    deploymentValidated: true,
    rolloutStabilized: true,
    migrationVerified: true,
    rbacValidated: true,
    auditValidated: true,
    healthValidated: true,
    rollbackReady: true,
    environmentParity: parityInput,
    promotions: [
      { promotionId: 'PROMO-READY', state: 'promotion ready', fromEnvironment: 'staging', targetEnvironment: 'production', approvalStatus: 'APPROVED' },
      { promotionId: 'PROMO-BLOCKED', state: 'degraded', fromEnvironment: 'staging', targetEnvironment: 'production', approvalStatus: 'PENDING', deploymentValidated: false }
    ]
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(report.success, true, 'promotion report should run');
  assert.equal(report.promotionGovernanceModel.state, 'PROMOTION_READY');
  assert.equal(report.environmentValidation.environmentConsistencyScore, 100);
  assert.ok(report.promotionConfidence.promotionConfidenceScore >= 90);
  assert.equal(report.promotionSafety.promotionBlocked, false);
  assert.ok(report.blockedPromotions.length >= 1, 'blocked promotion history should be visible');
  assert.ok(Object.isFrozen(report), 'promotion report should be immutable');
  assert.ok(Object.isFrozen(report.promotionHistory), 'promotion history should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /salary|leaveBalance|private:\/\/|secret-token/i, 'promotion report should not expose confidential fields');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ENVIRONMENT_PROMOTION/.test(row.eventType)), 'promotion governance should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ENVIRONMENT_PROMOTION/.test(row.actionType || row.action || '')), 'promotion governance should audit actions safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ENVIRONMENT_PROMOTION_GOVERNANCE_REPORTED, 'promotion governance should aggregate metrics safely');

  console.log('environmentActivationService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
