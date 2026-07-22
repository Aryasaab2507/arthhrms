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

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node enterprise certification suite test', platform: 'Win32' };
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

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1', now = '2026-07-03T13:00:00.000Z') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, department: 'Platform' },
    now
  };
}

function seedEnterpriseCertificationSuiteData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private enterprise certification data' }
  ];
  data.enterpriseCertificationSuiteHistory = [];
  data.enterpriseCertificationSuiteAuditHistory = [];
  data.enterpriseCertificationSuiteRecommendationHistory = [];
  data.enterpriseCertificationSuiteReportHistory = [];
  data.enterpriseCertificationSuiteScheduleHistory = [];
  data.auditLogs = [];

  data.environmentConfigurationHistory = [
    { tenantSlug: 'tabsons', key: 'DATABASE_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'REDIS_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'JWT_SECRET', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'QUEUE_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'abc', key: 'PRIVATE_ABC_SECRET', value: 'ABC private enterprise certification data', configured: true, immutable: true }
  ];
  data.infrastructureConfigurationHistory = [
    { tenantSlug: 'tabsons', component: 'database', status: 'READY', configured: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'redis', status: 'READY', configured: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'queue', status: 'READY', configured: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'cdn', status: 'READY', configured: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'storage', status: 'READY', configured: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'certificate', status: 'VALID', configured: true, immutable: true }
  ];
  data.observabilityHealthHistory = [
    { tenantSlug: 'tabsons', endpoint: '/health', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/ready', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/live', status: 'HEALTHY', immutable: true }
  ];
  data.observabilityMetricsHistory = [
    { tenantSlug: 'tabsons', apiLatencyMs: 155, databaseLatencyMs: 34, redisLatencyMs: 6, queueThroughput: 190, workerUtilization: 62, cacheHitRatio: 91, searchLatencyMs: 120, workflowLatencyMs: 210, aiResponseTimeMs: 880, platformHealthScore: 96, timestamp: '2026-07-03T12:55:00.000Z', immutable: true },
    { tenantSlug: 'abc', apiLatencyMs: 9, privateNote: 'ABC private enterprise certification data', immutable: true }
  ];
  data.observabilityAlertHistory = [
    { tenantSlug: 'tabsons', alertId: 'OBS-1', severity: 'INFO', status: 'ACKNOWLEDGED', immutable: true }
  ];
  data.enterpriseLogHistory = [
    { tenantSlug: 'tabsons', logId: 'LOG-1', level: 'INFO', category: 'APPLICATION', message: 'Certification signal.', immutable: true },
    { tenantSlug: 'abc', logId: 'LOG-ABC', level: 'CRITICAL', message: 'ABC private enterprise certification data', immutable: true }
  ];
  data.apiGatewayRequestHistory = [
    { tenantSlug: 'tabsons', requestId: 'REQ-1', statusCode: 200, latencyMs: 110, outcome: 'COMPLETED', immutable: true }
  ];
  data.apiGatewayRateLimitHistory = [
    { tenantSlug: 'tabsons', policyId: 'RL-1', scope: 'TENANT', state: 'ACTIVE', limitPerMinute: 200, immutable: true }
  ];
  data.distributedQueueJobs = [
    { tenantSlug: 'tabsons', jobId: 'JOB-1', state: 'COMPLETED', attempts: 1, immutable: true }
  ];
  data.distributedQueueWorkerHistory = [
    { tenantSlug: 'tabsons', workerId: 'WORKER-1', state: 'ACTIVE', concurrency: 8, immutable: true }
  ];
  data.enterpriseCacheMetricsHistory = [
    { tenantSlug: 'tabsons', hitRate: 91, missRate: 9, averageLookupMs: 5, state: 'HEALTHY', immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true }
  ];
  data.sessionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'SESS-1', distributedSessions: true, inactivityTimeoutMinutes: 30, state: 'ACTIVE', immutable: true }
  ];
  data.loginSecurityPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'LOGIN-1', mfaEnabled: true, lockoutThreshold: 5, state: 'ACTIVE', immutable: true }
  ];
  data.enterpriseSsoProviderHistory = [
    { tenantSlug: 'tabsons', providerId: 'SSO-1', protocol: 'OIDC', status: 'ACTIVE', immutable: true }
  ];
  data.scimProvisioningHistory = [
    { tenantSlug: 'tabsons', requestId: 'SCIM-1', status: 'COMPLETED', operation: 'CREATE_USER', immutable: true }
  ];
  data.validationRegistryRuleHistory = [
    { tenantSlug: 'tabsons', ruleId: 'VR-1', category: 'TENANT_VALIDATION', status: 'ACTIVE', immutable: true },
    { tenantSlug: 'tabsons', ruleId: 'VR-2', category: 'SECURITY_VALIDATION', status: 'ACTIVE', immutable: true }
  ];
  data.auditRetentionHistory = [
    { tenantSlug: 'tabsons', policyId: 'AUD-RET-1', retentionDays: 2555, immutable: true }
  ];
  data.tenantBackupHistory = [
    { tenantSlug: 'tabsons', backupId: 'BKP-1', state: 'COMPLETED', backupType: 'FULL_BACKUP', immutable: true }
  ];
  data.backupIntegrityVerificationHistory = [
    { tenantSlug: 'tabsons', verificationId: 'BIV-1', backupId: 'BKP-1', integrityStatus: 'PASSED', checksumMatched: true, immutable: true }
  ];
  data.backupCertificationHistory = [
    { tenantSlug: 'tabsons', certificationId: 'BCERT-1', backupId: 'BKP-1', certificationStatus: 'CERTIFIED', immutable: true }
  ];
  data.disasterRecoverySimulationHistory = [
    { tenantSlug: 'tabsons', simulationId: 'DR-1', status: 'COMPLETED', recoverySuccessful: true, rtoMinutes: 18, rpoMinutes: 5, immutable: true }
  ];
  data.workflowRecoveryHistory = [
    { tenantSlug: 'tabsons', workflowId: 'WF-1', state: 'COMPLETED', outcome: 'SUCCEEDED', immutable: true }
  ];
  data.notificationDeliveryTrackingHistory = [
    { tenantSlug: 'tabsons', notificationId: 'NOTIF-1', state: 'DELIVERED', channel: 'EMAIL', immutable: true }
  ];
  data.dataRetentionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'RET-1', scope: 'audit_logs', retentionDays: 2555, state: 'ACTIVE', immutable: true }
  ];
  data.complianceControlHistory = [
    { tenantSlug: 'tabsons', controlId: 'SOC2-SEC-01', framework: 'SOC2', status: 'IMPLEMENTED', evidenceStatus: 'COLLECTED', immutable: true },
    { tenantSlug: 'tabsons', controlId: 'ISO-AC-01', framework: 'ISO27001', status: 'IMPLEMENTED', evidenceStatus: 'COLLECTED', immutable: true }
  ];
  data.privacyProcessingActivityHistory = [
    { tenantSlug: 'tabsons', activityId: 'PRIV-1', legalBasis: 'CONTRACT', purpose: 'HR operations', immutable: true }
  ];
  data.developerApiCatalogHistory = [
    { tenantSlug: 'tabsons', apiId: 'API-EMP', module: 'Employees', path: '/api/v1/employees', status: 'STABLE', immutable: true },
    { tenantSlug: 'abc', apiId: 'API-ABC', module: 'Private', path: '/api/v1/private', status: 'STABLE', privateNote: 'ABC private enterprise certification data', immutable: true }
  ];
  data.openApiSpecHistory = [
    { tenantSlug: 'tabsons', specId: 'OPENAPI-1', version: 'v1', status: 'GENERATED', immutable: true }
  ];
  data.apiKeyHistory = [
    { tenantSlug: 'tabsons', keyId: 'KEY-1', status: 'ACTIVE', scopes: ['employees.read'], immutable: true }
  ];
  data.oauthClientHistory = [
    { tenantSlug: 'tabsons', clientId: 'OAUTH-1', status: 'ACTIVE', scopes: ['employees.read'], immutable: true }
  ];
  data.webhookSubscriptionHistory = [
    { tenantSlug: 'tabsons', subscriptionId: 'WH-1', status: 'ACTIVE', events: ['employee.created'], immutable: true }
  ];
  data.webhookDeliveryHistory = [
    { tenantSlug: 'tabsons', deliveryId: 'WHD-1', status: 'DELIVERED', immutable: true }
  ];
  data.integrationConnectorHistory = [
    { tenantSlug: 'tabsons', connectorId: 'CONN-1', provider: 'Microsoft 365', status: 'CONNECTED', health: 'HEALTHY', immutable: true }
  ];
  data.knowledgeDocumentHistory = [
    { tenantSlug: 'tabsons', documentId: 'DOC-1', title: 'Go-Live Runbook', status: 'INDEXED', approvalStatus: 'APPROVED', version: 2, immutable: true }
  ];
  data.knowledgeSearchHistory = [
    { tenantSlug: 'tabsons', searchId: 'KSEARCH-1', resultCount: 2, searchAccuracyScore: 91, immutable: true }
  ];
  data.enterpriseAiAgentHistory = [
    { tenantSlug: 'tabsons', registryId: 'AIREG-1', agentCount: 12, providerAgnostic: true, immutable: true }
  ];
  data.enterpriseAiMcpConnectionHistory = [
    { tenantSlug: 'tabsons', connectionId: 'MCP-1', status: 'CONFIGURED', providerAgnostic: true, immutable: true }
  ];
  data.enterpriseAiToolCallHistory = [
    { tenantSlug: 'tabsons', toolCallId: 'TOOL-1', toolName: 'KNOWLEDGE_RETRIEVAL', status: 'ROUTED', permissionGranted: true, executedDestructiveAction: false, immutable: true }
  ];
  data.enterpriseAiMemoryHistory = [
    { tenantSlug: 'tabsons', memoryId: 'MEM-1', conversationId: 'CONV-1', content: 'Tenant certification memory', immutable: true }
  ];
  data.aiAssistantResponseHistory = [
    { tenantSlug: 'tabsons', responseId: 'AIHR-1', confidenceScore: 90, citations: [{ documentId: 'DOC-1' }], externalProviderCalled: false, workflowExecuted: false, immutable: true }
  ];
  data.aiOperationsResponseHistory = [
    { tenantSlug: 'tabsons', responseId: 'AIOPS-1', confidenceScore: 92, recommendations: [{ executionStatus: 'RECOMMEND_ONLY' }], externalProviderCalled: false, workflowExecuted: false, productionDataModified: false, immutable: true }
  ];
  data.noCodeWorkflowDefinitionHistory = [
    { tenantSlug: 'tabsons', workflowId: 'NCWF-1', status: 'PUBLISHED', version: 1, immutable: true }
  ];
  data.workflowExecutionHistory = [
    { tenantSlug: 'tabsons', executionId: 'EXEC-1', status: 'COMPLETED', durationMs: 220, immutable: true }
  ];
  data.productionReadinessRecords = [
    { tenantSlug: 'tabsons', readinessId: 'READY-1', readinessState: 'CERTIFIED', operationalScore: 95, rollbackPrepared: true, stabilityVerified: true, immutable: true }
  ];
  data.employees = [
    { id: 'EMP-1', tenantSlug: 'tabsons', name: 'Private Employee', salary: 999999, leaveBalance: 12 },
    { id: 'EMP-X', tenantSlug: 'abc', name: 'ABC Private', privateNote: 'ABC private enterprise certification data' }
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

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/validationRegistryService.js',
    'services/productionReadinessService.js',
    'services/enterpriseProductionCertificationService.js',
    'services/infrastructureObservabilityService.js',
    'services/enterpriseLoggingPipelineService.js',
    'services/apiGatewayGovernanceService.js',
    'services/distributedQueueService.js',
    'services/backupIntegrityVerificationService.js',
    'services/disasterRecoverySimulationService.js',
    'services/complianceGovernanceService.js',
    'services/privacyComplianceService.js',
    'services/developerPlatformService.js',
    'services/webhookPlatformService.js',
    'services/integrationMarketplaceService.js',
    'services/tenantScopedRagService.js',
    'services/aiHrAssistantGovernanceService.js',
    'services/aiOperationsCopilotService.js',
    'services/advancedEnterpriseAiPlatformService.js'
  ].forEach(load);
  seedEnterpriseCertificationSuiteData();

  const before = {
    production: global.EnterpriseProductionCertificationService,
    advancedAi: global.AdvancedEnterpriseAIPlatformService,
    developer: global.DeveloperPlatformService,
    webhook: global.WebhookPlatformService
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseCertificationSuiteService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('EnterpriseCertificationSuiteService should be exported');
    }
    throw error;
  }

  const svc = global.EnterpriseCertificationSuiteService;
  assert.ok(svc, 'EnterpriseCertificationSuiteService should be exported');
  assert.equal(global.enterpriseCertificationSuiteService, svc, 'lowercase enterprise certification alias should be exported');
  assert.ok(Object.isFrozen(svc), 'enterprise certification suite export should be frozen');
  [
    'EnterpriseCertificationService',
    'ArchitectureValidator',
    'SecurityValidator',
    'PerformanceValidator',
    'ReliabilityValidator',
    'ComplianceValidator',
    'AIGovernanceValidator',
    'IntegrationValidator',
    'OperationalValidator',
    'ExecutiveReportGenerator',
    'EnterpriseScoreCalculator'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_CERTIFICATION_SUITE_SELF_TEST__.passed, true, 'development self-test should pass');

  const architecture = svc.ArchitectureValidator.validateArchitecture({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(architecture.success, true, 'architecture validator should execute');
  assertScore(architecture.architectureScore, 'architecture score');
  ['Multi-Tenant Isolation', 'RBAC', 'Workflow Engine', 'Database Architecture', 'Caching', 'Queue Infrastructure', 'API Gateway', 'Deployment Readiness'].forEach(name => {
    assert.ok(architecture.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const security = svc.SecurityValidator.validateSecurity({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(security.success, true, 'security validator should execute');
  assertScore(security.securityScore, 'security score');
  ['Authentication', 'SSO', 'SCIM', 'RBAC', 'API Security', 'Session Security', 'Rate Limiting', 'Tenant Isolation', 'Audit Logging'].forEach(name => {
    assert.ok(security.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const performance = svc.PerformanceValidator.validatePerformance({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(performance.success, true, 'performance validator should execute');
  assertScore(performance.performanceScore, 'performance score');
  ['API Latency', 'Queue Throughput', 'Redis Performance', 'Database Performance', 'Search Performance', 'Workflow Performance', 'AI Response Time'].forEach(name => {
    assert.ok(performance.metrics[name] !== undefined, `${name} metric should be measured`);
  });

  const reliability = svc.ReliabilityValidator.validateReliability({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(reliability.success, true, 'reliability validator should execute');
  assertScore(reliability.reliabilityScore, 'reliability score');
  ['Health Checks', 'Observability', 'Logging', 'Recovery', 'Backup Integrity', 'Disaster Recovery', 'Retry Framework', 'Notification Reliability'].forEach(name => {
    assert.ok(reliability.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const ai = svc.AIGovernanceValidator.validateAIGovernance({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(ai.success, true, 'AI governance validator should execute');
  assertScore(ai.aiGovernanceScore, 'AI governance score');
  ['RAG', 'Knowledge Retrieval', 'Agent Routing', 'MCP', 'Prompt Safety', 'Hallucination Prevention', 'Tool Permissions', 'Memory Isolation'].forEach(name => {
    assert.ok(ai.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const compliance = svc.ComplianceValidator.validateCompliance({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(compliance.success, true, 'compliance validator should execute');
  assertScore(compliance.complianceReadinessScore, 'compliance score');
  ['SOC 2', 'ISO 27001', 'GDPR', 'DPDP', 'Retention Policies', 'Audit Completeness'].forEach(name => {
    assert.ok(compliance.checks.some(row => row.name === name), `${name} should be checked`);
  });
  assert.equal(compliance.certificationClaims.soc2Certified, false, 'SOC 2 external certification should not be claimed');
  assert.equal(compliance.certificationClaims.iso27001Certified, false, 'ISO external certification should not be claimed');

  const integration = svc.IntegrationValidator.validateIntegrations({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(integration.success, true, 'integration validator should execute');
  assertScore(integration.integrationScore, 'integration score');
  ['REST APIs', 'OpenAPI', 'Developer Portal', 'Webhooks', 'Marketplace Connectors', 'OAuth Clients', 'SDK Generation', 'SCIM', 'SSO'].forEach(name => {
    assert.ok(integration.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const operations = svc.OperationalValidator.validateOperations({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(operations.success, true, 'operational validator should execute');
  assertScore(operations.operationalExcellenceScore, 'operational excellence score');
  ['Monitoring', 'Alerts', 'Logging', 'Incident Detection', 'Automation', 'Workflow Health', 'AI Operations'].forEach(name => {
    assert.ok(operations.checks.some(row => row.name === name), `${name} should be checked`);
  });

  const report = await svc.EnterpriseCertificationService.runEnterpriseCertification({
    tenantSlug: 'tabsons',
    runMode: 'GO_LIVE_REVIEW'
  }, ctx());
  assert.equal(report.success, true, 'enterprise certification suite should run');
  assert.equal(report.certificationStatus, 'ENTERPRISE_READY', 'fully seeded tenant should be enterprise ready');
  assertScore(report.scores.architectureScore, 'architecture score');
  assertScore(report.scores.securityScore, 'security score');
  assertScore(report.scores.performanceScore, 'performance score');
  assertScore(report.scores.reliabilityScore, 'reliability score');
  assertScore(report.scores.complianceReadinessScore, 'compliance score');
  assertScore(report.scores.aiGovernanceScore, 'AI governance score');
  assertScore(report.scores.integrationScore, 'integration score');
  assertScore(report.scores.operationalExcellenceScore, 'operational excellence score');
  assertScore(report.scores.overallEnterpriseReadiness, 'overall enterprise readiness');
  assert.ok(report.executiveSummary, 'executive summary should be generated');
  assert.ok(Array.isArray(report.criticalRisks), 'critical risks should be listed');
  assert.ok(Array.isArray(report.warnings), 'warnings should be listed');
  assert.ok(report.recommendations.length >= 1, 'recommendations should be generated');
  assert.ok(report.historicalTrends.length >= 1, 'historical trends should be generated');
  assert.ok(report.readinessTimeline.length >= 6, 'readiness timeline should be generated');
  assert.ok(report.architectureDiagram.nodes.length >= 8, 'architecture diagram should be generated');
  assert.equal(report.governance.productionDataModified, false, 'certification must not modify production data');
  assert.equal(report.governance.destructiveOperationsExecuted, false, 'certification must not execute destructive operations');
  assert.equal(report.governance.autoRemediationApplied, false, 'certification must not auto-remediate');
  assert.equal(report.governance.productionWorkflowsChanged, false, 'production workflows must not change');
  assert.equal(report.governance.tenantIsolationPreserved, true, 'tenant isolation should be preserved');
  assert.equal(report.goLiveRecommendation.recommendation, 'GO_LIVE_APPROVED_WITH_GOVERNANCE', 'go-live recommendation should be executive-ready');
  assert.ok(Object.isFrozen(report), 'enterprise certification report should be immutable');
  assert.doesNotMatch(text(report), /999999|Private Employee|ABC private enterprise certification data|PRIVATE_ABC_SECRET|API-ABC/i, 'certification output must not leak sensitive or cross-tenant data');

  const downloads = svc.ExecutiveReportGenerator.generateDownloadableReports({
    tenantSlug: 'tabsons',
    report
  }, ctx());
  assert.equal(downloads.success, true, 'downloadable reports should generate');
  ['Executive Summary', 'Architecture Assessment', 'Security Assessment', 'Compliance Report', 'Performance Report', 'Operations Report', 'AI Governance Report', 'Go-Live Checklist', 'Deployment Readiness Report'].forEach(name => {
    assert.ok(downloads.reports.some(row => row.name === name), `${name} should be available`);
  });
  assert.ok(downloads.reports.some(row => row.format === 'PDF'), 'PDF report metadata should be generated');
  assert.ok(downloads.reports.every(row => row.productionDataModified === false), 'reports must not modify production data');

  const blocked = await svc.EnterpriseCertificationService.runEnterpriseCertification({
    tenantSlug: 'tabsons',
    evidence: {
      criticalIssues: [{ code: 'API_GATEWAY_DOWN', domain: 'Integration', message: 'Gateway unavailable' }],
      apiLatencyMs: 4200,
      aiResponseTimeMs: 3800,
      disconnectedIntegrations: 3,
      expiredCertificates: 1,
      monitoringAvailable: false
    }
  }, ctx());
  assert.equal(blocked.success, true, 'blocked run should still produce a report');
  assert.equal(blocked.certificationStatus, 'BLOCKED', 'critical issues should block enterprise certification');
  assert.ok(blocked.criticalRisks.some(row => row.severity === 'CRITICAL'), 'critical risk should be visible');
  assert.ok(blocked.recommendations.some(row => /gateway|monitoring|certificate|integration/i.test(row.action)), 'blocked run should produce actionable recommendations');

  const score = svc.EnterpriseScoreCalculator.calculateEnterpriseScores({
    architectureScore: 99,
    securityScore: 98,
    performanceScore: 97,
    reliabilityScore: 99,
    complianceReadinessScore: 96,
    aiGovernanceScore: 98,
    integrationScore: 97,
    operationalExcellenceScore: 99,
    criticalRiskCount: 0
  });
  assert.equal(score.success, true, 'enterprise score calculator should run');
  assert.equal(score.certificationStatus, 'ENTERPRISE_READY');
  assertScore(score.overallEnterpriseReadiness, 'overall enterprise readiness score');

  const crossTenant = await svc.EnterpriseCertificationService.runEnterpriseCertification({
    tenantSlug: 'abc'
  }, ctx('PLATFORM_OWNER', 'tabsons', 'PO-1'));
  assert.equal(crossTenant.success, false, 'cross-tenant certification should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC private enterprise certification data/i, 'cross-tenant denial must not leak data');

  const employeeDenied = await svc.EnterpriseCertificationService.runEnterpriseCertification({
    tenantSlug: 'tabsons'
  }, ctx('EMPLOYEE', 'tabsons', 'EMP-1'));
  assert.equal(employeeDenied.success, false, 'employees should not run enterprise certification');
  assert.equal(employeeDenied.code, 'ENTERPRISE_CERTIFICATION_RBAC_DENIED');

  const schedule = svc.EnterpriseCertificationService.scheduleEnterpriseCertification({
    tenantSlug: 'tabsons',
    cadence: 'WEEKLY'
  }, ctx());
  assert.equal(schedule.success, true, 'scheduled certification metadata should be supported');
  assert.equal(schedule.schedule.background, true, 'certification should be background-ready');
  assert.equal(schedule.schedule.productionTrafficImpact, 'NONE');

  const db = global.DB.get();
  assert.ok(db.enterpriseCertificationSuiteHistory.every(row => row.immutable === true), 'certification suite history should be immutable');
  assert.ok(db.enterpriseCertificationSuiteRecommendationHistory.every(row => row.immutable === true), 'recommendation history should be immutable');
  assert.ok(db.enterpriseCertificationSuiteReportHistory.every(row => row.immutable === true), 'report history should be immutable');
  assert.ok(db.auditLogs.some(row => /ENTERPRISE_CERTIFICATION/.test(String(row.actionType || row.action || row.module || ''))), 'certification runs should be audited');
  assert.equal(db.employees.find(row => row.id === 'EMP-1').salary, 999999, 'business data must remain unchanged');
  assert.equal(global.EnterpriseProductionCertificationService, before.production, 'existing production certification service must remain unchanged');
  assert.equal(global.AdvancedEnterpriseAIPlatformService, before.advancedAi, 'existing advanced AI platform must remain unchanged');
  assert.equal(global.DeveloperPlatformService, before.developer, 'existing developer platform must remain unchanged');
  assert.equal(global.WebhookPlatformService, before.webhook, 'existing webhook platform must remain unchanged');

  console.log('enterpriseCertificationSuiteService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
