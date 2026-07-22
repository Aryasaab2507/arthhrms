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

function seedReadinessData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.environmentState = { mode: 'LIMITED_PRODUCTION', updatedAt: '2026-05-31T09:00:00.000Z' };
  data.productionReadinessRecords = [
    {
      readinessId: 'READY-1',
      certificationId: 'CERT-1',
      releaseId: 'REL-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      readinessState: 'IN_REVIEW',
      readinessType: 'RELEASE_CERTIFICATION',
      severity: 'HIGH_RISK',
      environment: 'PRODUCTION',
      checklistFailures: 2,
      rollbackPrepared: false,
      stabilityVerified: false,
      environmentConsistent: false,
      approvalCheckpoint: true,
      certificationBlocked: true,
      operationalScore: 62,
      correlationId: 'CORR-READY-1',
      createdAt: '2026-05-31T10:00:00.000Z',
      salary: 99000,
      leaveBalance: 8,
      metadata: { rawDocumentUrl: 'private://tenant-a/release-cert.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      readinessId: 'READY-ARCHIVED',
      certificationId: 'CERT-ARCHIVED',
      releaseId: 'REL-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      readinessState: 'ARCHIVED',
      readinessType: 'ROLLBACK_PREPAREDNESS',
      severity: 'WARNING',
      rollbackPrepared: true,
      stabilityVerified: true,
      environmentConsistent: true,
      correlationId: 'CORR-READY-2',
      createdAt: '2026-05-20T10:00:00.000Z'
    }
  ];
  data.readinessChecklistRecords = [
    { checklistId: 'CHK-1', correlationId: 'CORR-READY-1', tenantSlug: 'tenant-a', status: 'FAILED', failures: [{ code: 'ENVIRONMENT_INCONSISTENCY' }], environment: 'PRODUCTION' }
  ];
  data.stabilityVerificationRecords = [
    { stabilityId: 'STAB-1', correlationId: 'CORR-READY-1', tenantSlug: 'tenant-a', status: 'DEGRADED', rollbackInstability: true, stabilityScore: 58 }
  ];
  data.deploymentValidationRecords = [
    { deploymentId: 'DEPLOY-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', deploymentState: 'FAILED', validationFailures: 2, rollbackReady: false, migrationInstability: true, environmentDrift: true }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', incidentState: 'CRITICAL', severity: 'CRITICAL', durationMinutes: 130 }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', healthState: 'CRITICAL', failureRate: 18, latencyMs: 1900 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'ROLLBACK_PENDING', failureCount: 5, confidentialNote: 'salary cohort affected' }
  ];
  data.emergencyOverrideRecords = [
    { emergencyId: 'EMG-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', emergencyState: 'RECOVERY_ACTIVE', emergencyType: 'FEATURE_ROLLBACK', rollbackActivated: true, recoveryMinutes: 40 }
  ];
  data.globalAuditRecords = [
    { auditId: 'GAUD-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', auditState: 'OPEN', severity: 'CRITICAL', unresolvedFindings: 2, actionType: 'READINESS_AUDIT_FINDING' }
  ];
  data.auditLogs = [
    { auditId: 'AUD-READY-1', correlationId: 'CORR-READY-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', actionType: 'READINESS_VALIDATION_STARTED', auditState: 'ESCALATED', severity: 'HIGH_RISK' }
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
    'services/deploymentValidationService.js',
    'services/productionReadinessService.js'
  ].forEach(load);

  seedReadinessData();

  assert.ok(global.ProductionReadinessService, 'ProductionReadinessService should be exported');
  assert.ok(Object.isFrozen(global.ProductionReadinessService), 'production readiness service export must be immutable');
  assert.ok(Object.isFrozen(global.ProductionReadinessService.READINESS_STATES), 'readiness states must be immutable');
  assert.deepEqual(global.ProductionReadinessService.READINESS_STATES, ['DRAFT', 'IN_REVIEW', 'VALIDATING', 'BLOCKED', 'READY', 'CERTIFIED', 'RELEASE_READY', 'ARCHIVED']);
  assert.ok(Object.isFrozen(global.ProductionReadinessService.READINESS_SCORE_LEVELS), 'readiness score levels must be immutable');
  assert.deepEqual(global.ProductionReadinessService.READINESS_SCORE_LEVELS, ['NOT_READY', 'PARTIALLY_READY', 'READY', 'PRODUCTION_CERTIFIED']);
  assert.equal(typeof global.ProductionReadinessService.validateProductionReadiness, 'function', 'validateProductionReadiness helper should be exported');
  assert.equal(typeof global.ProductionReadinessService.calculateReadinessScore, 'function', 'calculateReadinessScore helper should be exported');
  assert.equal(typeof global.ProductionReadinessService.verifyCertificationRequirements, 'function', 'verifyCertificationRequirements helper should be exported');
  assert.equal(global.__ARTHHRMS_PRODUCTION_READINESS_SELF_TEST__.passed, true, 'development self-test should cover readiness governance failure cases');

  const malformed = global.ProductionReadinessService.normalizeReadinessPayload(null, {});
  assert.equal(malformed.success, false, 'malformed readiness payloads should fail safely');

  const normalized = global.ProductionReadinessService.normalizeReadinessPayload({
    readinessId: 'READY-NORM',
    state: 'release ready',
    readinessType: 'rollback preparedness',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'readiness payload should normalize');
  assert.equal(normalized.payload.readinessState, 'RELEASE_READY');
  assert.equal(normalized.payload.readinessType, 'ROLLBACK_PREPAREDNESS');
  assert.ok(Object.isFrozen(normalized), 'normalized readiness output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential readiness fields must be filtered');

  const notReadyScore = global.ProductionReadinessService.calculateReadinessScore({
    infrastructureReady: false,
    deploymentReady: false,
    migrationReady: false,
    securityReady: false,
    tenantIsolationReady: true,
    rollbackReady: false,
    auditReady: false,
    observabilityReady: false,
    performanceReady: false,
    criticalIncidentExists: true,
    healthStateCritical: true,
    deploymentValidationFailed: true,
    rollbackReadinessIncomplete: true,
    emergencyOverrideActive: true,
    unresolvedAuditFindings: true
  });
  assert.equal(notReadyScore.success, true, 'readiness scoring should run');
  assert.equal(notReadyScore.scoreLevel, 'NOT_READY');
  assert.equal(notReadyScore.certificationBlocked, true, 'hard blockers must prevent certification');
  assert.equal(notReadyScore.releaseEligibility.releaseEligible, false, 'blocked readiness should not be release eligible');

  const certifiedScore = global.ProductionReadinessService.calculateReadinessScore({
    infrastructureReady: true,
    deploymentReady: true,
    migrationReady: true,
    securityReady: true,
    tenantIsolationReady: true,
    rollbackReady: true,
    auditReady: true,
    observabilityReady: true,
    performanceReady: true,
    certificationApproved: true,
    releaseSignoff: true
  });
  assert.equal(certifiedScore.scoreLevel, 'PRODUCTION_CERTIFIED', 'fully satisfied gates should certify production readiness');
  assert.equal(certifiedScore.releaseEligibility.releaseEligible, true);

  const readinessValidation = global.ProductionReadinessService.validateProductionReadiness({
    infrastructureReady: true,
    deploymentReady: true,
    migrationReady: false,
    securityReady: true,
    tenantIsolationReady: true,
    rollbackReady: false,
    auditReady: true,
    observabilityReady: false,
    performanceReady: true
  }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(readinessValidation.success, true, 'production readiness validation should run with partial readiness');
  assert.equal(readinessValidation.validationResults.migrationReadiness.passed, false, 'partial readiness should preserve category failures');
  assert.equal(readinessValidation.releaseEligibility.releaseEligible, false, 'partial readiness should not be eligible for release');

  const ownerScope = global.ProductionReadinessService.validateReadinessScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated readiness governance');
  assert.equal(ownerScope.certificationAuthority, true, 'PLATFORM_OWNER should retain final certification authority');

  const tenantRoleScope = global.ProductionReadinessService.validateReadinessScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access production governance center');

  const superAdminBypass = global.ProductionReadinessService.validateReadinessScope({ certificationBypass: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass production certification governance');

  const superAdminMonitor = global.ProductionReadinessService.validateReadinessScope({ infrastructureOnly: true, readinessVerification: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminMonitor.allowed, true, 'SUPER_ADMIN can verify infrastructure readiness only');
  assert.equal(superAdminMonitor.certificationAuthority, false);

  const crossTenantMonitor = global.ProductionReadinessService.validateReadinessScope({ infrastructureOnly: true, readinessVerification: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantMonitor.allowed, false, 'cross-tenant readiness visibility should be blocked');

  const archivedMutation = global.ProductionReadinessService.validateReadinessScope({ readinessState: 'ARCHIVED', certificationBypass: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived production certification history must be immutable');

  assert.equal(global.ProductionReadinessService.classifyReadinessRisk({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.ProductionReadinessService.classifyReadinessRisk({ environmentConsistent: false, checklistFailures: 2 }), 'HIGH_RISK');

  const certificationRequirements = global.ProductionReadinessService.verifyCertificationRequirements({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(certificationRequirements.success, true, 'certification requirements should verify');
  assert.equal(certificationRequirements.certificationBlocked, true, 'critical operational blockers must block certification');
  assert.equal(certificationRequirements.releaseEligibility.releaseEligible, false, 'blocked certification must block release eligibility');
  assert.ok(certificationRequirements.blockedCertificationReasons.length >= 5, 'all major blocker classes should be reported');

  const instability = global.ProductionReadinessService.detectReleaseInstability({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(instability.success, true, 'release instability detection should run');
  assert.ok(instability.operationalReadinessIntelligence.failedCertificationPatterns >= 1, 'failed certification patterns should be tracked');
  assert.ok(instability.operationalReadinessIntelligence.environmentInconsistencies >= 1, 'environment inconsistency should be tracked');
  assert.ok(instability.operationalReadinessIntelligence.rollbackInstability >= 1, 'rollback instability should be tracked');

  const report = global.ProductionReadinessService.generateProductionReadinessReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'production readiness report should generate for PLATFORM_OWNER');
  assert.equal(report.accessGovernance.crossTenantDeploymentLeakageBlocked, true);
  assert.equal(report.accessGovernance.superAdminCertificationBypassAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assert.ok(report.readinessChecklist, 'readiness checklist completion should be generated');
  assert.ok(report.readinessScore, 'readiness score should be generated');
  assert.ok(report.certificationGovernance, 'certification governance should be generated');
  assert.equal(report.releaseEligibility.releaseEligible, false, 'critical blockers should prevent release eligibility');
  assert.ok(report.blockedCertificationReasons.length >= 1, 'blocked certification reasons should be visible as safe summaries');
  assert.ok(Array.isArray(report.certificationHistory), 'certification history should be summarized immutably');
  assert.equal(report.readinessScore.scoreLevel, 'NOT_READY', 'critical blockers should downgrade readiness score');
  assert.equal(report.releaseCertification.readinessChecklistWorkflows >= 1, true, 'checklist workflows should be summarized');
  assert.equal(report.rollbackPreparedness.rollbackPreparedReleases >= 1, true, 'rollback preparedness should be summarized');
  assert.equal(report.incidentDeploymentIntegration.deploymentLinkedReadinessFailures >= 1, true, 'incident/deployment integration should summarize readiness failures');
  assert.equal(report.readinessAnalytics.certificationGovernanceHealth >= 0, true, 'readiness analytics should be generated');
  assert.ok(Object.isFrozen(report), 'production readiness report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /99000|73000|"leaveBalance"|Alice Salary|Bob Private|private:\/\/tenant-a|salary cohort|rawDocument/i, 'readiness report must not expose confidential tenant data');

  const infraReport = global.ProductionReadinessService.generateProductionReadinessReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only readiness report should generate for SUPER_ADMIN');
  assert.equal(infraReport.readinessSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant readiness rows');
  assert.equal(infraReport.accessGovernance.superAdminCertificationBypassAuthority, false, 'SUPER_ADMIN must not gain certification bypass authority');

  const frozen = global.ProductionReadinessService.freezeReadinessOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen), 'freezeReadinessOutput should freeze root output');
  assert.ok(Object.isFrozen(frozen.nested), 'freezeReadinessOutput should deep-freeze nested output');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeReadinessOutput should filter confidential fields');

  const savedDeployment = global.DeploymentValidationService;
  const savedHealth = global.PlatformHealthMonitoringService;
  const savedIncident = global.GlobalIncidentService;
  const savedAuditVisibility = global.GlobalAuditVisibilityService;
  const savedEmergency = global.EmergencyOverrideService;
  const savedDeploymentLower = global.deploymentValidationService;
  const savedHealthLower = global.platformHealthMonitoringService;
  const savedIncidentLower = global.globalIncidentService;
  const savedAuditVisibilityLower = global.globalAuditVisibilityService;
  const savedEmergencyLower = global.emergencyOverrideService;
  delete global.DeploymentValidationService;
  delete global.PlatformHealthMonitoringService;
  delete global.GlobalIncidentService;
  delete global.GlobalAuditVisibilityService;
  delete global.EmergencyOverrideService;
  delete global.deploymentValidationService;
  delete global.platformHealthMonitoringService;
  delete global.globalIncidentService;
  delete global.globalAuditVisibilityService;
  delete global.emergencyOverrideService;
  const dependencyAbsentReport = global.ProductionReadinessService.generateProductionReadinessReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  global.DeploymentValidationService = savedDeployment;
  global.PlatformHealthMonitoringService = savedHealth;
  global.GlobalIncidentService = savedIncident;
  global.GlobalAuditVisibilityService = savedAuditVisibility;
  global.EmergencyOverrideService = savedEmergency;
  global.deploymentValidationService = savedDeploymentLower;
  global.platformHealthMonitoringService = savedHealthLower;
  global.globalIncidentService = savedIncidentLower;
  global.globalAuditVisibilityService = savedAuditVisibilityLower;
  global.emergencyOverrideService = savedEmergencyLower;
  assert.equal(dependencyAbsentReport.integrationHealth.deploymentValidationIntegrated, false, 'missing deployment dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalIncidentIntegrated, false, 'missing incident dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.platformHealthIntegrated, false, 'missing health dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalAuditVisibilityIntegrated, false, 'missing audit visibility dependency should be reflected safely');
  assert.equal(dependencyAbsentReport.integrationHealth.emergencyOverrideIntegrated, false, 'missing emergency dependency should be reflected safely');

  let auditCount = 0;
  let telemetryCount = 0;
  let metricCount = 0;
  global.AuditService = { recordAudit(event) { auditCount += 1; return { success: true, event }; } };
  global.WorkflowTelemetryService = { emitTelemetry(category, eventType, payload) { telemetryCount += 1; return { success: true, category, eventType, payload }; } };
  global.OrchestrationMetricsService = { recordWorkflowMetric(name, payload) { metricCount += 1; return { success: true, name, payload }; } };
  const audited = global.ProductionReadinessService.generateProductionReadinessReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true);
  assert.ok(auditCount >= 1, 'readiness visibility access should be auditable');
  assert.ok(telemetryCount >= 1, 'readiness governance should emit telemetry when available');
  assert.ok(metricCount >= 1, 'readiness governance should record metrics when available');

  console.log('productionReadinessService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
