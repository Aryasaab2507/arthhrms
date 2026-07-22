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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
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
  global.navigator = { userAgent: 'Node enterprise production certification test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, department: 'Platform' },
    now: '2026-07-01T12:00:00.000Z'
  };
}

function seedCertificationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private production data' }
  ];
  data.enterpriseProductionCertificationHistory = [];
  data.enterpriseProductionCertificationAuditHistory = [];
  data.enterpriseProductionCertificationRecommendationHistory = [];
  data.enterpriseProductionCertificationScheduleHistory = [];
  data.auditLogs = [];

  data.environmentConfigurationHistory = [
    { tenantSlug: 'tabsons', key: 'DATABASE_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'REDIS_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'JWT_SECRET', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'SMTP_PROVIDER', configured: true, immutable: true },
    { tenantSlug: 'abc', key: 'PRIVATE_ABC_SECRET', configured: true, value: 'ABC private production data', immutable: true }
  ];
  data.infrastructureConfigurationHistory = [
    { tenantSlug: 'tabsons', component: 'certificate', configured: true, status: 'VALID', immutable: true },
    { tenantSlug: 'tabsons', component: 'storage_bucket', configured: true, status: 'READY', immutable: true },
    { tenantSlug: 'tabsons', component: 'cdn', configured: true, status: 'READY', immutable: true },
    { tenantSlug: 'tabsons', component: 'email_provider', configured: true, status: 'READY', immutable: true },
    { tenantSlug: 'tabsons', component: 'sms_provider', configured: true, status: 'READY', immutable: true },
    { tenantSlug: 'tabsons', component: 'push_provider', configured: true, status: 'READY', immutable: true }
  ];
  data.observabilityHealthHistory = [
    { tenantSlug: 'tabsons', endpoint: '/health', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/ready', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/live', status: 'HEALTHY', immutable: true }
  ];
  data.observabilityMetricsHistory = [
    { tenantSlug: 'tabsons', apiLatencyMs: 180, databaseLatencyMs: 45, redisLatencyMs: 7, queueThroughput: 140, workerUtilization: 58, cacheHitRatio: 87, dashboardPerformanceScore: 96, platformHealthScore: 94, timestamp: '2026-07-01T11:55:00.000Z', immutable: true },
    { tenantSlug: 'abc', apiLatencyMs: 20, privateNote: 'ABC private production data', immutable: true }
  ];
  data.observabilityAlertHistory = [
    { tenantSlug: 'tabsons', alertId: 'OBS-WARN', severity: 'INFO', status: 'ACKNOWLEDGED', rule: 'INFO_ONLY', immutable: true }
  ];
  data.enterpriseLogHistory = [
    { tenantSlug: 'tabsons', logId: 'LOG-OK', level: 'INFO', category: 'APPLICATION', message: 'Production certification seed.', immutable: true },
    { tenantSlug: 'abc', logId: 'LOG-ABC', level: 'ERROR', message: 'ABC private production data', immutable: true }
  ];
  data.distributedQueueJobs = [
    { tenantSlug: 'tabsons', jobId: 'DQ-OK', state: 'COMPLETED', jobType: 'notification_delivery', attempts: 1, immutable: true }
  ];
  data.distributedQueueWorkerHistory = [
    { tenantSlug: 'tabsons', workerId: 'W-1', state: 'ACTIVE', concurrency: 4, immutable: true }
  ];
  data.notificationDeliveryTrackingHistory = [
    { tenantSlug: 'tabsons', notificationId: 'N-OK', state: 'DELIVERED', channel: 'EMAIL', immutable: true }
  ];
  data.tenantBackupHistory = [
    { tenantSlug: 'tabsons', backupId: 'BKP-1', state: 'COMPLETED', backupType: 'FULL_BACKUP', integrityHash: 'abc123', immutable: true }
  ];
  data.backupIntegrityVerificationHistory = [
    { tenantSlug: 'tabsons', verificationId: 'BIV-1', backupId: 'BKP-1', integrityStatus: 'PASSED', checksumMatched: true, immutable: true }
  ];
  data.backupCertificationHistory = [
    { tenantSlug: 'tabsons', certificationId: 'BCERT-1', backupId: 'BKP-1', certificationStatus: 'CERTIFIED', immutable: true }
  ];
  data.disasterRecoverySimulationHistory = [
    { tenantSlug: 'tabsons', simulationId: 'DR-1', status: 'COMPLETED', recoverySuccessful: true, rtoMinutes: 20, rpoMinutes: 5, immutable: true }
  ];
  data.dataRetentionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'RET-1', scope: 'audit_logs', retentionDays: 2555, state: 'ACTIVE', immutable: true }
  ];
  data.softDeleteRecoveryHistory = [
    { tenantSlug: 'tabsons', recoveryId: 'REC-1', state: 'RESTORABLE', immutable: true }
  ];
  data.apiGatewayRequestHistory = [
    { tenantSlug: 'tabsons', requestId: 'REQ-1', statusCode: 200, latencyMs: 140, outcome: 'COMPLETED', immutable: true }
  ];
  data.apiGatewayRateLimitHistory = [
    { tenantSlug: 'tabsons', policyId: 'RL-1', scope: 'TENANT', limitPerMinute: 200, state: 'ACTIVE', immutable: true }
  ];
  data.validationRegistryRuleHistory = [
    { tenantSlug: 'tabsons', ruleId: 'VR-1', category: 'TENANT_VALIDATION', status: 'ACTIVE', immutable: true },
    { tenantSlug: 'tabsons', ruleId: 'VR-2', category: 'SECURITY_VALIDATION', status: 'ACTIVE', immutable: true }
  ];
  data.sessionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'SESS-1', inactivityTimeoutMinutes: 30, distributedSessions: true, state: 'ACTIVE', immutable: true }
  ];
  data.loginSecurityPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'LOGIN-1', lockoutThreshold: 5, rateLimitEnabled: true, state: 'ACTIVE', immutable: true }
  ];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.auditRetentionHistory = [
    { tenantSlug: 'tabsons', policyId: 'AUDRET-1', retentionDays: 2555, immutable: true }
  ];
  data.knowledgeDocumentHistory = [
    { tenantSlug: 'tabsons', documentId: 'DOC-1', title: 'Production Runbook', status: 'INDEXED', approvalStatus: 'APPROVED', version: 2, immutable: true }
  ];
  data.knowledgeSearchIndex = [
    { tenantSlug: 'tabsons', documentId: 'DOC-1', chunkId: 'CHK-1', title: 'Production Runbook', snippet: 'Production go-live requires certification gates and rollback readiness.', score: 92, immutable: true }
  ];
  data.aiAssistantResponseHistory = [
    { tenantSlug: 'tabsons', responseId: 'AIHR-1', confidenceScore: 88, citations: [{ documentId: 'DOC-1' }], externalProviderCalled: false, workflowExecuted: false, immutable: true }
  ];
  data.aiOperationsResponseHistory = [
    { tenantSlug: 'tabsons', responseId: 'AIOPS-1', confidenceScore: 90, recommendations: [{ executionStatus: 'RECOMMEND_ONLY' }], externalProviderCalled: false, workflowExecuted: false, productionDataModified: false, immutable: true }
  ];
  data.featureRolloutRecords = [
    { tenantSlug: 'tabsons', featureKey: 'enterprise-certification', rolloutState: 'ACTIVE', immutable: true }
  ];
  data.workflowRecoveryHistory = [
    { tenantSlug: 'tabsons', workflowId: 'WF-OK', state: 'COMPLETED', action: 'RETRY', outcome: 'SUCCEEDED', immutable: true }
  ];
  data.productionReadinessRecords = [
    { tenantSlug: 'tabsons', readinessId: 'READY-1', readinessState: 'CERTIFIED', readinessType: 'PRODUCTION_READINESS', operationalScore: 94, rollbackPrepared: true, stabilityVerified: true, environmentConsistent: true, immutable: true }
  ];
  data.employees = [
    { id: 'EMP-1', tenantSlug: 'tabsons', name: 'Private Employee', salary: 999999, leaveBalance: 12 },
    { id: 'EMP-X', tenantSlug: 'abc', name: 'ABC Private', privateNote: 'ABC private production data' }
  ];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/validationRegistryService.js',
    'services/productionReadinessService.js',
    'services/infrastructureObservabilityService.js',
    'services/enterpriseLoggingPipelineService.js',
    'services/apiGatewayGovernanceService.js',
    'services/distributedQueueService.js',
    'services/backupIntegrityVerificationService.js',
    'services/disasterRecoverySimulationService.js',
    'services/tenantScopedRagService.js',
    'services/aiHrAssistantGovernanceService.js',
    'services/aiOperationsCopilotService.js'
  ].forEach(load);
  seedCertificationData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseProductionCertificationService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('EnterpriseProductionCertificationService should be exported');
    }
    throw error;
  }

  const svc = global.EnterpriseProductionCertificationService;
  assert.ok(svc, 'EnterpriseProductionCertificationService should be exported');
  assert.equal(global.enterpriseProductionCertificationService, svc, 'lowercase production certification alias should be exported');
  assert.ok(Object.isFrozen(svc), 'production certification export should be frozen');
  [
    'ProductionCertificationService',
    'InfrastructureValidator',
    'SecurityValidator',
    'ReliabilityValidator',
    'PerformanceValidator',
    'ReadinessScoreCalculator',
    'ProductionCertificateGenerator'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_PRODUCTION_CERTIFICATION_SELF_TEST__.passed, true, 'development self-test should pass');

  const infrastructure = svc.InfrastructureValidator.validateInfrastructure({
    tenantSlug: 'tabsons'
  }, ctx());
  assert.equal(infrastructure.success, true, 'infrastructure validator should execute');
  assertScore(infrastructure.infrastructureScore, 'infrastructure score');
  assert.ok(infrastructure.checks.some(row => row.domain === 'Infrastructure'), 'infrastructure checks should include infrastructure domain');
  assert.ok(infrastructure.checks.some(row => row.name === 'Environment Variables'), 'environment variables should be checked');
  assert.ok(infrastructure.checks.some(row => row.name === 'Health Endpoints'), 'health endpoints should be checked');

  const security = svc.SecurityValidator.validateSecurity({
    tenantSlug: 'tabsons'
  }, ctx());
  assert.equal(security.success, true, 'security validator should execute');
  assertScore(security.securityScore, 'security score');
  ['Password Policy', 'Session Management', 'Authentication', 'Authorization', 'RBAC', 'API Validation', 'Rate Limiting', 'Tenant Isolation', 'Audit Logging', 'Secret Management'].forEach(name => {
    assert.ok(security.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const performance = svc.PerformanceValidator.validatePerformance({
    tenantSlug: 'tabsons'
  }, ctx());
  assert.equal(performance.success, true, 'performance validator should execute');
  assertScore(performance.performanceScore, 'performance score');
  assert.ok(performance.metrics.apiResponseTimeMs <= 3000, 'API response time metric should be captured');
  assert.ok(performance.metrics.aiResponseTimeMs <= 3000, 'AI response time metric should be captured');

  const reliability = svc.ReliabilityValidator.validateReliability({
    tenantSlug: 'tabsons'
  }, ctx());
  assert.equal(reliability.success, true, 'reliability validator should execute');
  assertScore(reliability.reliabilityScore, 'reliability score');
  assert.ok(reliability.checks.some(row => row.name === 'Backup Integrity'), 'backup integrity should be checked');
  assert.ok(reliability.checks.some(row => row.name === 'Disaster Recovery'), 'disaster recovery should be checked');

  const readyReport = svc.ProductionCertificationService.runCertification({
    tenantSlug: 'tabsons',
    runMode: 'MANUAL'
  }, ctx());
  assert.equal(readyReport.success, true, 'certification framework should run');
  assert.equal(readyReport.certificationStatus, 'PRODUCTION_READY', 'fully seeded tenant should be production ready');
  assert.equal(readyReport.productionCertificate.certificationBlocked, false, 'ready certification should not be blocked');
  assertScore(readyReport.scores.infrastructure, 'infrastructure readiness');
  assertScore(readyReport.scores.security, 'security readiness');
  assertScore(readyReport.scores.performance, 'performance readiness');
  assertScore(readyReport.scores.reliability, 'reliability readiness');
  assertScore(readyReport.scores.governance, 'governance readiness');
  assertScore(readyReport.scores.compliance, 'compliance readiness');
  assertScore(readyReport.scores.aiReadiness, 'AI readiness');
  assertScore(readyReport.scores.overallProductionScore, 'overall production score');
  assert.equal(readyReport.governance.productionDataModified, false, 'certification must not modify production data');
  assert.equal(readyReport.governance.automaticFixesApplied, false, 'certification must not auto-fix issues');
  assert.equal(readyReport.governance.existingWorkflowsUnmodified, true, 'existing workflows must remain unmodified');
  assert.equal(readyReport.complianceReadiness.soc2.claimsCertification, false, 'SOC 2 readiness must not claim certification');
  assert.equal(readyReport.complianceReadiness.iso27001.claimsCertification, false, 'ISO readiness must not claim certification');
  assert.ok(readyReport.goLiveChecklist.length >= 8, 'go-live checklist should be generated');
  assert.ok(Object.isFrozen(readyReport), 'certification report should be immutable');
  assert.doesNotMatch(text(readyReport), /999999|Private Employee|ABC private production data|PRIVATE_ABC_SECRET/i, 'certification output must not leak sensitive data');

  const blocked = svc.ProductionCertificationService.runCertification({
    tenantSlug: 'tabsons',
    evidence: {
      environmentVariables: { DATABASE_URL: false },
      databaseConnected: false,
      redisConnected: false,
      queueConnected: false,
      healthEndpoints: { health: false, ready: false, live: true },
      criticalIssues: [{ code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' }],
      apiResponseTimeMs: 4200,
      aiResponseTimeMs: 3600
    }
  }, ctx());
  assert.equal(blocked.success, true, 'blocked certification should still produce report');
  assert.equal(blocked.certificationStatus, 'BLOCKED', 'critical issues should block certification');
  assert.equal(blocked.productionCertificate.certificationBlocked, true, 'certificate should be blocked');
  assert.ok(blocked.failedChecks.some(row => row.severity === 'CRITICAL'), 'critical failed checks should be listed');
  assert.ok(blocked.recommendations.some(row => /database|health|redis|queue/i.test(row.action)), 'actionable recommendations should be generated');

  const score = svc.ReadinessScoreCalculator.calculateReadinessScores({
    infrastructureScore: 99,
    securityScore: 98,
    performanceScore: 97,
    reliabilityScore: 99,
    governanceScore: 98,
    complianceScore: 92,
    aiReadinessScore: 96,
    criticalBlockers: 0
  });
  assert.equal(score.success, true, 'readiness score calculator should run');
  assert.equal(score.certificationStatus, 'PRODUCTION_READY');
  assertScore(score.overallProductionScore, 'overall production score');

  const certificate = svc.ProductionCertificateGenerator.generateProductionCertificate({
    tenantSlug: 'tabsons',
    scores: score.scores,
    failedChecks: [],
    warnings: [{ code: 'COMPLIANCE_READINESS_ONLY' }]
  }, ctx());
  assert.equal(certificate.success, true, 'production certificate generator should run');
  assert.equal(certificate.certificate.certificationBlocked, false);
  assert.equal(certificate.certificate.humanGoLiveDecisionRequired, true, 'go-live remains a human decision');
  assert.equal(certificate.certificate.autoDeploymentTriggered, false, 'certificate must not trigger deployment');

  const crossTenant = svc.ProductionCertificationService.runCertification({
    tenantSlug: 'abc'
  }, ctx('PLATFORM_OWNER', 'tabsons', 'PO-1'));
  assert.equal(crossTenant.success, false, 'cross-tenant certification should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC private production data/i, 'cross-tenant denial must not leak data');

  const employeeDenied = svc.ProductionCertificationService.runCertification({
    tenantSlug: 'tabsons'
  }, ctx('EMPLOYEE', 'tabsons', 'EMP-1'));
  assert.equal(employeeDenied.success, false, 'tenant roles should not run production certification');
  assert.equal(employeeDenied.code, 'PRODUCTION_CERTIFICATION_RBAC_DENIED');

  const schedule = svc.ProductionCertificationService.scheduleCertification({
    tenantSlug: 'tabsons',
    cadence: 'DAILY'
  }, ctx());
  assert.equal(schedule.success, true, 'scheduled execution metadata should be supported');
  assert.equal(schedule.schedule.asynchronous, true, 'certification should be async-ready');
  assert.equal(schedule.schedule.productionTrafficImpact, 'NONE');

  const db = global.DB.get();
  assert.ok(db.enterpriseProductionCertificationHistory.every(row => row.immutable === true), 'certification history should be immutable');
  assert.ok(db.enterpriseProductionCertificationRecommendationHistory.every(row => row.immutable === true), 'recommendation history should be immutable');
  assert.ok(db.auditLogs.some(row => /PRODUCTION_CERTIFICATION/.test(String(row.actionType || row.action || row.module || ''))), 'certification runs should be audited');
  assert.deepEqual(db.employees.find(row => row.id === 'EMP-1').salary, 999999, 'business data must remain unchanged');

  console.log('enterpriseProductionCertificationService.test.js passed');
}

main();
