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

function seedPipelineData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.cicdPipelineRecords = [
    {
      pipelineId: 'PIPE-READY',
      releaseId: 'REL-CICD-1',
      tenantSlug: 'tenant-a',
      pipelineState: 'READY',
      sourceValid: true,
      dependenciesValid: true,
      testsPassed: true,
      securityValid: true,
      deploymentValidated: true,
      readinessCertified: true,
      releaseGovernanceValid: true,
      productionApprovalGranted: true,
      rollbackReady: true,
      approvalStatus: 'APPROVED',
      deploymentExecuted: false,
      createdAt: '2026-06-02T08:00:00.000Z',
      validationResults: [
        { stage: 'SOURCE_VALIDATION', passed: true },
        { stage: 'TEST_VALIDATION', passed: true },
        { stage: 'SECURITY_VALIDATION', passed: true }
      ],
      salary: 123000,
      leaveBalance: 11,
      metadata: { rawDocumentUrl: 'private://tenant-a/build-log.txt', confidentialEmployeeRecord: 'hidden' }
    },
    {
      pipelineId: 'PIPE-BLOCKED',
      releaseId: 'REL-CICD-2',
      tenantSlug: 'tenant-a',
      pipelineState: 'FAILED',
      sourceValid: true,
      dependenciesValid: false,
      testsPassed: false,
      securityValid: false,
      deploymentValidated: false,
      readinessCertified: false,
      releaseGovernanceValid: false,
      productionApprovalGranted: false,
      rollbackReady: false,
      approvalStatus: 'PENDING',
      governanceViolation: true,
      createdAt: '2026-06-02T09:00:00.000Z'
    }
  ];
  data.deploymentValidationRecords = [
    { deploymentId: 'DEP-CICD-1', releaseId: 'REL-CICD-1', tenantSlug: 'tenant-a', deploymentState: 'READY', rollbackReady: true, validationFailed: false },
    { deploymentId: 'DEP-CICD-2', releaseId: 'REL-CICD-2', tenantSlug: 'tenant-a', deploymentState: 'DEGRADED', rollbackReady: false, validationFailed: true }
  ];
  data.productionReadinessRecords = [
    { readinessId: 'READY-CICD-1', releaseId: 'REL-CICD-1', tenantSlug: 'tenant-a', readinessState: 'APPROVED', certificationApproved: true, releaseSignoff: true }
  ];
  data.safeReleaseRecords = [
    { safeReleaseId: 'SAFE-CICD-1', releaseId: 'REL-CICD-1', tenantSlug: 'tenant-a', releaseState: 'ACTIVE', releaseApproved: true, rollbackReady: true }
  ];
  data.environmentPromotionRecords = [
    { promotionId: 'PROMO-CICD-1', releaseId: 'REL-CICD-1', tenantSlug: 'tenant-a', promotionState: 'PROMOTION_READY', environmentConsistent: true }
  ];
  data.auditLogs = [
    { auditId: 'AUD-CICD-1', tenantSlug: 'tenant-a', actionType: 'CICD_PIPELINE_CREATED', auditState: 'RECORDED', severity: 'INFO' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 123000, leaveBalance: 11 }
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
    'services/globalAuditVisibilityService.js',
    'services/platformHealthMonitoringService.js',
    'services/deploymentValidationService.js',
    'services/productionReadinessService.js',
    'services/safeReleaseGovernanceService.js',
    'services/environmentActivationService.js',
    'services/environmentSnapshotService.js',
    'services/cicdGovernanceService.js'
  ].forEach(load);

  seedPipelineData();

  const svc = global.CICDGovernanceService;
  assert.ok(svc, 'CICDGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'CI/CD governance service export must be immutable');
  assert.ok(Object.isFrozen(svc.PIPELINE_STATES), 'pipeline states must be immutable');
  assert.deepEqual(svc.PIPELINE_STATES, ['CREATED', 'QUEUED', 'VALIDATING', 'APPROVAL_REQUIRED', 'READY', 'EXECUTING', 'FAILED', 'COMPLETED', 'ARCHIVED']);
  assert.ok(Object.isFrozen(svc.PIPELINE_STAGES), 'pipeline stages must be immutable');
  assert.equal(typeof svc.validatePipelineGovernance, 'function', 'validatePipelineGovernance helper should be exported');
  assert.equal(typeof svc.calculatePipelineConfidence, 'function', 'calculatePipelineConfidence helper should be exported');
  assert.equal(typeof svc.calculateReleaseQuality, 'function', 'calculateReleaseQuality helper should be exported');
  assert.equal(typeof svc.normalizePipelinePayload, 'function', 'normalizePipelinePayload helper should be exported');
  assert.equal(typeof svc.freezePipelineOutput, 'function', 'freezePipelineOutput helper should be exported');
  assert.equal(typeof svc.generateCICDGovernanceReport, 'function', 'generateCICDGovernanceReport helper should be exported');
  assert.equal(global.__ARTHHRMS_CICD_GOVERNANCE_SELF_TEST__.passed, true, 'CI/CD self-test should cover governance failure cases');

  const malformed = svc.normalizePipelinePayload(null, {});
  assert.equal(malformed.success, false, 'malformed pipeline payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed pipeline output should be immutable');

  const normalized = svc.normalizePipelinePayload({
    pipelineId: 'PIPE-NORMALIZE',
    releaseId: 'REL-CICD-3',
    pipelineState: 'approval required',
    tenantSlug: 'tenant-a',
    sourceValid: true,
    dependenciesValid: true,
    testsPassed: true,
    securityValid: true,
    deploymentValidated: true,
    readinessCertified: true,
    releaseGovernanceValid: true,
    productionApprovalGranted: false,
    rollbackReady: true,
    salary: 123000,
    leaveBalance: 11,
    metadata: { rawDocumentUrl: 'private://tenant-a/build-log.txt', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(normalized.success, true, 'pipeline normalization should work');
  assert.equal(normalized.pipeline.pipelineState, 'APPROVAL_REQUIRED');
  assert.ok(Object.isFrozen(normalized), 'normalized pipeline output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /123000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'pipeline output must not expose tenant business data');

  const ownerGovernance = svc.validatePipelineGovernance({
    ...normalized.pipeline,
    productionApprovalGranted: true
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(ownerGovernance.allowed, true, 'PLATFORM_OWNER should access isolated CI/CD governance');
  assert.equal(ownerGovernance.pipelineBlocked, false, 'fully valid pipeline should not be blocked');

  const tenantBlocked = svc.validatePipelineGovernance({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantBlocked.allowed, false, 'tenant roles must never access CI/CD governance');

  const superAdminExecuteBlocked = svc.validatePipelineGovernance({ executionRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminExecuteBlocked.allowed, false, 'SUPER_ADMIN must not execute tenant release pipelines');

  const archivedMutation = svc.validatePipelineGovernance({ pipelineState: 'ARCHIVED', executionRequested: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived pipeline history must be immutable');

  const blocked = svc.validatePipelineGovernance({
    pipelineId: 'PIPE-BLOCK',
    sourceValid: true,
    dependenciesValid: false,
    testsPassed: false,
    securityValid: false,
    deploymentValidated: false,
    readinessCertified: false,
    releaseGovernanceValid: false,
    productionApprovalGranted: false,
    rollbackReady: false,
    emergencyBlockActive: true
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(blocked.pipelineBlocked, true, 'governance failures should block deployment');
  assert.ok(blocked.blockingConditions.length >= 6, 'blocking conditions should be explained');

  const confidence = svc.calculatePipelineConfidence(blocked);
  assert.ok(confidence.pipelineConfidenceScore < 60, 'blocked pipelines should have low confidence');
  assert.ok(['HIGH', 'CRITICAL'].includes(confidence.riskClassification), 'blocked pipelines should classify as high risk');

  const quality = svc.calculateReleaseQuality(ownerGovernance);
  assert.ok(quality.releaseQualityScore >= 80, 'valid release should have high quality score');
  assert.ok(quality.governanceComplianceScore >= 80, 'valid release should have high governance compliance');

  const report = svc.generateCICDGovernanceReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(report.success, true, 'CI/CD governance report should run');
  assert.equal(report.pipelineGovernanceModel.state, 'APPROVAL_REQUIRED');
  assert.ok(report.activePipelines.length >= 1, 'active pipelines should be summarized');
  assert.ok(report.validationResults.stageResults.length >= 8, 'validation stage results should be summarized');
  assert.ok(report.governanceStatus.governanceGatesEnforced, 'governance gates should be enforced');
  assert.ok(report.releaseQuality.releaseQualityScore >= 0);
  assert.ok(report.pipelineConfidence.pipelineConfidenceScore >= 0);
  assert.ok(report.pipelineAnalytics.failedValidations >= 1, 'failed validations should be tracked');
  assert.ok(report.governanceIntegrations.deploymentValidationIntegrated, 'deployment validation integration should be reported');
  assert.ok(report.auditSummary.pipelineActionsAuditable, 'pipeline auditability should be preserved');
  assert.ok(Object.isFrozen(report), 'CI/CD report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /123000|"leaveBalance"|private:\/\/|hidden|secret-token|employees|payroll/i, 'CI/CD report must not expose tenant business data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /CICD/.test(row.eventType)), 'CI/CD governance should emit telemetry');
  assert.ok(global.DB.getAuditLogs().some(row => /CICD/.test(row.actionType || row.action || '')), 'CI/CD governance should audit actions');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.CICD_GOVERNANCE_REPORTED, 'CI/CD governance should emit metrics');

  console.log('cicdGovernanceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
