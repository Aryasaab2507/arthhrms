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

function seedDeploymentData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.environmentState = { mode: 'LIMITED_PRODUCTION', updatedAt: '2026-05-30T09:00:00.000Z' };
  data.platformTenants = [
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', lifecycleState: 'PRODUCTION_ACTIVE' },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', lifecycleState: 'DEGRADED' }
  ];
  data.deploymentValidationRecords = [
    {
      deploymentId: 'DEPLOY-1',
      releaseId: 'REL-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      deploymentState: 'VALIDATING',
      deploymentType: 'PRODUCTION_RELEASE',
      severity: 'HIGH_RISK',
      environment: 'PRODUCTION',
      validationFailures: 2,
      migrationInstability: true,
      rollbackReady: true,
      rollbackActivated: false,
      releaseApprovalCheckpoint: true,
      environmentDrift: true,
      correlationId: 'CORR-DEPLOY-1',
      createdAt: '2026-05-30T10:00:00.000Z',
      salary: 99000,
      leaveBalance: 8,
      metadata: { rawDocumentUrl: 'private://tenant-a/release.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      deploymentId: 'DEPLOY-ARCHIVED',
      releaseId: 'REL-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      deploymentState: 'ARCHIVED',
      deploymentType: 'ROLLBACK_READINESS',
      severity: 'WARNING',
      rollbackReady: true,
      migrationVerified: true,
      correlationId: 'CORR-DEPLOY-2',
      createdAt: '2026-05-20T10:00:00.000Z'
    }
  ];
  data.deploymentLogs = [
    { deploymentLogId: 'DLOG-1', correlationId: 'CORR-DEPLOY-1', eventType: 'DEPLOYMENT_BLOCKED', status: 'BLOCKED', severity: 'HIGH', environment: 'PRODUCTION', deploymentStage: 'LIMITED_PRODUCTION', tenantSlug: 'tenant-a' }
  ];
  data.migrationValidationRecords = [
    { migrationId: 'MIG-1', correlationId: 'CORR-DEPLOY-1', status: 'FAILED', environment: 'PRODUCTION', tenantSlug: 'tenant-a', failureCount: 2 }
  ];
  data.stagingValidationReports = [
    { validationId: 'STAGE-1', readiness: 'BLOCKED', environment: 'STAGING', failures: [{ failureCode: 'RLS_VALIDATION_FAILED', severity: 'CRITICAL_BLOCKER' }], metadata: { productionDataMutated: false } }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-DEPLOY-1', correlationId: 'CORR-DEPLOY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', incidentState: 'ESCALATED', severity: 'CRITICAL', durationMinutes: 110 }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-DEPLOY-1', correlationId: 'CORR-DEPLOY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', healthState: 'CRITICAL', failureRate: 21, latencyMs: 2100 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-DEPLOY-1', correlationId: 'CORR-DEPLOY-1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'ROLLBACK_PENDING', failureCount: 5, confidentialNote: 'salary cohort affected' }
  ];
  data.emergencyOverrideRecords = [
    { emergencyId: 'EMG-DEPLOY-1', correlationId: 'CORR-DEPLOY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', emergencyState: 'RECOVERY_ACTIVE', emergencyType: 'FEATURE_ROLLBACK', rollbackActivated: true, recoveryMinutes: 40 }
  ];
  data.auditLogs = [
    { auditId: 'AUD-DEPLOY-1', correlationId: 'CORR-DEPLOY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', actionType: 'DEPLOYMENT_VALIDATION_STARTED', auditState: 'ESCALATED', severity: 'HIGH_RISK' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 99000, leaveBalance: 8 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', salary: 73000, leaveBalance: 5 }
  ];
  global.DB.save(data);
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
    'services/platformAnalyticsService.js',
    'services/tenantGovernanceService.js',
    'services/featureRolloutService.js',
    'services/globalIncidentService.js',
    'services/platformHealthMonitoringService.js',
    'services/globalAuditVisibilityService.js',
    'services/emergencyOverrideService.js',
    'services/deploymentSafetyService.js',
    'services/environmentGovernanceService.js',
    'services/stagingValidationService.js',
    'services/deploymentValidationService.js'
  ].forEach(load);

  seedDeploymentData();

  assert.ok(global.DeploymentValidationService, 'DeploymentValidationService should be exported');
  assert.ok(Object.isFrozen(global.DeploymentValidationService), 'deployment validation service export must be immutable');
  assert.ok(Object.isFrozen(global.DeploymentValidationService.DEPLOYMENT_STATES), 'deployment states must be immutable');
  assert.deepEqual(global.DeploymentValidationService.DEPLOYMENT_STATES, ['DRAFT', 'VALIDATING', 'READY', 'DEPLOYING', 'DEGRADED', 'ROLLBACK_READY', 'RELEASED', 'ARCHIVED']);
  assert.ok(Object.isFrozen(global.DeploymentValidationService.RISK_LEVELS), 'deployment risk levels must be immutable');
  assert.deepEqual(global.DeploymentValidationService.RISK_LEVELS, ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
  assert.equal(typeof global.DeploymentValidationService.validateDeploymentReadiness, 'function', 'validateDeploymentReadiness helper should exist');
  assert.equal(typeof global.DeploymentValidationService.calculateDeploymentRisk, 'function', 'calculateDeploymentRisk helper should exist');
  assert.equal(typeof global.DeploymentValidationService.verifyReleaseDependencies, 'function', 'verifyReleaseDependencies helper should exist');
  assert.equal(global.__ARTHHRMS_DEPLOYMENT_VALIDATION_SELF_TEST__.passed, true, 'development self-test should cover deployment governance failure cases');

  const malformed = global.DeploymentValidationService.normalizeDeploymentPayload(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.DeploymentValidationService.normalizeDeploymentPayload({
    deploymentId: 'DEPLOY-NORM',
    state: 'rollback ready',
    deploymentType: 'migration verification',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'deployment payload should normalize');
  assert.equal(normalized.payload.deploymentState, 'ROLLBACK_READY');
  assert.equal(normalized.payload.deploymentType, 'MIGRATION_VERIFICATION');
  assert.ok(Object.isFrozen(normalized), 'normalized deployment output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential deployment fields must be filtered');

  const preparingNormalized = global.DeploymentValidationService.normalizeDeploymentPayload({
    deploymentId: 'DEPLOY-DRAFT',
    state: 'preparing',
    deploymentType: 'pre release validation'
  });
  assert.equal(preparingNormalized.payload.deploymentState, 'DRAFT', 'legacy preparing state should normalize to Task 83 DRAFT state');

  const ownerScope = global.DeploymentValidationService.validateDeploymentScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated deployment governance');
  assert.equal(ownerScope.releaseAuthority, true, 'PLATFORM_OWNER should retain final deployment authority');

  const tenantRoleScope = global.DeploymentValidationService.validateDeploymentScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access deployment governance center');

  const superAdminBypass = global.DeploymentValidationService.validateDeploymentScope({ releaseBypass: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass release governance validation');

  const superAdminMonitor = global.DeploymentValidationService.validateDeploymentScope({ infrastructureOnly: true, monitoringOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminMonitor.allowed, true, 'SUPER_ADMIN can access infrastructure deployment visibility only');
  assert.equal(superAdminMonitor.releaseAuthority, false);

  const crossTenantMonitor = global.DeploymentValidationService.validateDeploymentScope({ infrastructureOnly: true, monitoringOnly: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantMonitor.allowed, false, 'cross-tenant deployment visibility should be blocked');

  const archivedMutation = global.DeploymentValidationService.validateDeploymentScope({ deploymentState: 'ARCHIVED', releaseBypass: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived deployment history must be immutable');

  assert.equal(global.DeploymentValidationService.classifyDeploymentRisk({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.DeploymentValidationService.classifyDeploymentRisk({ migrationInstability: true, validationFailures: 2 }), 'HIGH_RISK');

  const risk = global.DeploymentValidationService.calculateDeploymentRisk({
    failedValidationChecks: 2,
    dependencyFailures: 1,
    migrationRisks: 1,
    configurationIssues: 1,
    unresolvedIncidents: 1,
    unresolvedOutages: 1
  });
  assert.equal(risk.riskLevel, 'CRITICAL', 'critical deployment risk should be generated');
  assert.ok(risk.riskScore >= 90, 'critical deployment risk score should be high');
  assert.ok(Object.isFrozen(risk), 'risk output should be immutable');

  const readiness = global.DeploymentValidationService.validateDeploymentReadiness({
    environmentReady: false,
    migrationsValidated: false,
    rbacIntegrity: true,
    tenantIsolation: true,
    workflowIntegrity: false,
    auditIntegrity: true,
    featureCompatibility: false,
    billingCompatibility: true,
    dependenciesValid: false,
    rollbackReady: true
  }, { routeType: 'platform', actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(readiness.success, true, 'deployment readiness validation should run');
  assert.equal(readiness.validationResults.environmentReadiness.passed, false);
  assert.equal(readiness.validationResults.databaseMigrations.passed, false);
  assert.equal(readiness.validationResults.tenantIsolation.passed, true);
  assert.equal(readiness.rollbackReadiness.rollbackPrepared, true);
  assert.ok(readiness.blockedDeploymentReasons.length >= 1, 'failed readiness checks should block deployment');
  assert.ok(Object.isFrozen(readiness), 'readiness output should be immutable');

  const dependencies = global.DeploymentValidationService.verifyReleaseDependencies({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencies.success, true, 'release dependency validation should run');
  assert.equal(dependencies.deploymentBlocked, true, 'active critical incident/health/emergency signals should block deployment');
  assert.ok(dependencies.blockedDeploymentReasons.some(reason => /incident|health|emergency/i.test(reason.message)), 'incident, health, or emergency blockers should be reported');
  assert.ok(Object.isFrozen(dependencies), 'dependency output should be immutable');

  const instability = global.DeploymentValidationService.detectReleaseInstability({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(instability.success, true, 'release instability detection should run');
  assert.ok(instability.deploymentRiskIntelligence.failedValidationPatterns >= 1, 'failed validation patterns should be tracked');
  assert.ok(instability.deploymentRiskIntelligence.migrationInstability >= 1, 'migration instability should be tracked');

  const report = global.DeploymentValidationService.generateDeploymentValidationReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'deployment report should generate for PLATFORM_OWNER');
  assert.equal(report.accessGovernance.crossTenantDeploymentLeakageBlocked, true);
  assert.equal(report.accessGovernance.superAdminReleaseBypassAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assert.equal(report.releaseGovernance.validationWorkflows >= 1, true, 'validation workflows should be summarized');
  assert.equal(report.releaseGovernance.readinessScore >= 0, true, 'readiness score should be generated');
  assert.equal(report.releaseGovernance.releaseApprovalRequired, true, 'release approval workflow should be represented');
  assert.ok(Array.isArray(report.validationResults), 'validation results should be available for dashboard rendering');
  assert.ok(Array.isArray(report.blockedDeploymentReasons), 'blocked deployment reasons should be available');
  assert.equal(report.deploymentRiskScore.riskLevel, 'CRITICAL', 'critical deployment blockers should influence risk score');
  assert.equal(report.deploymentRiskScore.deploymentBlocked, true, 'critical incident/health/emergency dependencies should block release');
  assert.ok(report.deploymentHistory.totalDeployments >= 1, 'deployment history should be summarized');
  assert.equal(report.rollbackReadiness.rollbackReadyDeployments >= 1, true, 'rollback readiness should be summarized');
  assert.equal(report.incidentHealthIntegration.deploymentLinkedDegradation >= 1, true, 'incident/health integration should summarize deployment degradation');
  assert.equal(report.releaseAnalytics.deploymentSuccessRates >= 0, true, 'release analytics should be generated');
  assert.ok(Object.isFrozen(report), 'deployment report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /99000|73000|"leaveBalance"|Alice Salary|Bob Private|private:\/\/tenant-a|salary cohort|private payroll|rawDocument/i, 'deployment report must not expose confidential tenant data');

  const infraReport = global.DeploymentValidationService.generateDeploymentValidationReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only deployment report should generate for SUPER_ADMIN');
  assert.equal(infraReport.deploymentSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant deployment rows');
  assert.equal(infraReport.accessGovernance.superAdminReleaseBypassAuthority, false, 'SUPER_ADMIN must not gain release bypass authority');

  const frozen = global.DeploymentValidationService.freezeDeploymentOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen), 'freezeDeploymentOutput should freeze root output');
  assert.ok(Object.isFrozen(frozen.nested), 'freezeDeploymentOutput should deep-freeze nested output');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeDeploymentOutput should filter confidential fields');

  const savedEmergency = global.EmergencyOverrideService;
  const savedEmergencyAlias = global.emergencyOverrideService;
  const savedHealth = global.PlatformHealthMonitoringService;
  const savedHealthAlias = global.platformHealthMonitoringService;
  const savedIncident = global.GlobalIncidentService;
  const savedIncidentAlias = global.globalIncidentService;
  delete global.EmergencyOverrideService;
  delete global.emergencyOverrideService;
  delete global.PlatformHealthMonitoringService;
  delete global.platformHealthMonitoringService;
  delete global.GlobalIncidentService;
  delete global.globalIncidentService;
  const dependencyAbsentReport = global.DeploymentValidationService.generateDeploymentValidationReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalIncidentIntegrated, false, 'missing incident dependency should be visible');
  assert.equal(dependencyAbsentReport.integrationHealth.platformHealthIntegrated, false, 'missing health dependency should be visible');
  global.EmergencyOverrideService = savedEmergency;
  global.emergencyOverrideService = savedEmergencyAlias;
  global.PlatformHealthMonitoringService = savedHealth;
  global.platformHealthMonitoringService = savedHealthAlias;
  global.GlobalIncidentService = savedIncident;
  global.globalIncidentService = savedIncidentAlias;

  let auditCount = 0;
  let telemetryCount = 0;
  let metricCount = 0;
  global.AuditService = { recordAudit(event) { auditCount += 1; return { success: true, event }; } };
  global.WorkflowTelemetryService = { emitTelemetry(category, eventType, payload) { telemetryCount += 1; return { success: true, category, eventType, payload }; } };
  global.OrchestrationMetricsService = { recordWorkflowMetric(name, payload) { metricCount += 1; return { success: true, name, payload }; } };
  const audited = global.DeploymentValidationService.generateDeploymentValidationReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true);
  assert.ok(auditCount >= 1, 'deployment visibility access should be auditable');
  assert.ok(telemetryCount >= 1, 'deployment governance should emit telemetry when available');
  assert.ok(metricCount >= 1, 'deployment governance should record metrics when available');

  console.log('deploymentValidationService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
