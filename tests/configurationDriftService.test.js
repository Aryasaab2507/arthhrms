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

function seedConfigurationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.configurationBaselines = [
    {
      baselineId: 'BASE-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      baselineState: 'CONSISTENT',
      environment: 'PRODUCTION',
      version: '2026.06.01',
      configuration: {
        env: { SUPABASE_URL: 'https://prod-project.supabase.co', REQUIRE_EMAIL_VERIFIED: true },
        featureFlags: { payroll: true, reports: true },
        deploymentSettings: { runtime: 'production', releaseChannel: 'stable' },
        rbac: { hr: 'tenant-scoped', super_admin: 'infrastructure-only' },
        tenantIsolation: { rls: true, tenantBoundary: 'strict' },
        workflowSettings: { approvals: 'strict' },
        notificationSettings: { channel: 'verified' },
        serviceDependencies: { database: 'ready', storage: 'ready' }
      },
      metadata: { rawDocumentUrl: 'private://tenant-a/baseline.pdf', confidentialEmployeeRecord: 'hidden' }
    }
  ];
  data.environmentConfigurationRecords = [
    {
      configId: 'CFG-STAGE',
      environment: 'STAGING',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      configuration: {
        env: { SUPABASE_URL: 'https://staging-project.supabase.co', REQUIRE_EMAIL_VERIFIED: true },
        featureFlags: { payroll: true, reports: false },
        deploymentSettings: { runtime: 'staging', releaseChannel: 'candidate' },
        rbac: { hr: 'tenant-scoped', super_admin: 'infrastructure-only' },
        tenantIsolation: { rls: true, tenantBoundary: 'strict' },
        workflowSettings: { approvals: 'strict' },
        notificationSettings: { channel: 'verified' },
        serviceDependencies: { database: 'ready', storage: 'ready' }
      }
    },
    {
      configId: 'CFG-PROD',
      environment: 'PRODUCTION',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      configuration: {
        env: { SUPABASE_URL: 'https://prod-project.supabase.co', REQUIRE_EMAIL_VERIFIED: false },
        featureFlags: { payroll: true, reports: true },
        deploymentSettings: { runtime: 'production', releaseChannel: 'stable' },
        rbac: { hr: 'tenant-wide', super_admin: 'business-admin' },
        tenantIsolation: { rls: false, tenantBoundary: 'relaxed' },
        workflowSettings: { approvals: 'relaxed' },
        notificationSettings: { channel: 'unverified' },
        serviceDependencies: { database: 'ready', storage: 'degraded' }
      },
      salary: 99000,
      leaveBalance: 8
    }
  ];
  data.configurationDriftRecords = [
    {
      driftId: 'DRIFT-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      driftState: 'DRIFT_DETECTED',
      severity: 'HIGH',
      environment: 'PRODUCTION',
      driftCategory: 'tenantIsolation',
      remediationStatus: 'OPEN',
      remediationMinutes: 45,
      correlationId: 'CORR-CONFIG-1',
      salary: 99000,
      leaveBalance: 8,
      metadata: { rawDocumentUrl: 'private://tenant-a/drift.pdf', confidentialEmployeeRecord: 'hidden' }
    },
    {
      driftId: 'DRIFT-ARCHIVED',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      driftState: 'ARCHIVED',
      severity: 'LOW',
      environment: 'STAGING',
      driftCategory: 'featureFlags',
      remediationStatus: 'RESOLVED',
      correlationId: 'CORR-CONFIG-2'
    }
  ];
  data.deploymentValidationRecords = [
    { deploymentId: 'DEPLOY-CONFIG-1', tenantSlug: 'tenant-a', environmentDrift: true, configurationIssues: 2, deploymentState: 'VALIDATING', correlationId: 'CORR-CONFIG-1' }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-CONFIG-1', tenantSlug: 'tenant-a', healthState: 'DEGRADED', failureRate: 8, correlationId: 'CORR-CONFIG-1' }
  ];
  data.auditLogs = [
    { auditId: 'AUD-CONFIG-1', tenantSlug: 'tenant-a', actionType: 'CONFIGURATION_DRIFT_DETECTED', auditState: 'RECORDED', severity: 'HIGH_RISK', correlationId: 'CORR-CONFIG-1' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 99000, leaveBalance: 8 }
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
    'services/globalAuditVisibilityService.js',
    'services/platformHealthMonitoringService.js',
    'services/deploymentValidationService.js',
    'services/environmentActivationService.js',
    'services/safeReleaseGovernanceService.js',
    'services/configurationDriftService.js'
  ].forEach(load);

  seedConfigurationData();

  const svc = global.ConfigurationDriftService;
  assert.ok(svc, 'ConfigurationDriftService should be exported');
  assert.ok(Object.isFrozen(svc), 'configuration drift service export must be immutable');
  assert.ok(Object.isFrozen(svc.DRIFT_STATES), 'drift states must be immutable');
  assert.deepEqual(svc.DRIFT_STATES, ['CONSISTENT', 'MONITORING', 'DRIFT_DETECTED', 'WARNING', 'HIGH_RISK', 'REMEDIATING', 'RESOLVED', 'ARCHIVED']);
  assert.deepEqual(svc.DRIFT_SEVERITIES, ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);
  assert.equal(typeof svc.detectConfigurationDrift, 'function', 'detectConfigurationDrift helper should be exported');
  assert.equal(typeof svc.calculateConsistencyScore, 'function', 'calculateConsistencyScore helper should be exported');
  assert.equal(typeof svc.classifyDriftSeverity, 'function', 'classifyDriftSeverity helper should be exported');
  assert.equal(typeof svc.normalizeConfigurationPayload, 'function', 'normalizeConfigurationPayload helper should be exported');
  assert.equal(typeof svc.freezeConfigurationOutput, 'function', 'freezeConfigurationOutput helper should be exported');
  assert.equal(typeof svc.generateConfigurationDriftReport, 'function', 'generateConfigurationDriftReport helper should be exported');
  assert.equal(global.__ARTHHRMS_CONFIGURATION_DRIFT_SELF_TEST__.passed, true, 'configuration drift self-test should cover failure cases');

  const malformed = svc.normalizeConfigurationPayload(null, {});
  assert.equal(malformed.success, false, 'malformed configuration payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed output should be immutable');

  const normalized = svc.normalizeConfigurationPayload({
    configurationId: 'CFG-NORM',
    driftState: 'high risk',
    environment: 'production',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocumentUrl: 'private://config.pdf', confidentialEmployeeRecord: 'hidden', token: 'secret-token' }
  });
  assert.equal(normalized.success, true, 'configuration payload should normalize');
  assert.equal(normalized.payload.driftState, 'HIGH_RISK');
  assert.equal(normalized.payload.environment, 'PRODUCTION');
  assert.ok(Object.isFrozen(normalized), 'normalized output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/config|hidden|secret-token/i, 'confidential configuration fields must be filtered');

  const ownerScope = svc.validateConfigurationScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated configuration governance');
  assert.equal(ownerScope.configurationAuthority, true);

  const tenantScope = svc.validateConfigurationScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantScope.allowed, false, 'tenant roles must never access configuration drift governance');

  const superAdminRemediation = svc.validateConfigurationScope({ remediationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminRemediation.allowed, false, 'SUPER_ADMIN must not remediate configuration drift');

  const superAdminMonitor = svc.validateConfigurationScope({ infrastructureOnly: true, monitoringOnly: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA1' }
  });
  assert.equal(superAdminMonitor.allowed, true, 'SUPER_ADMIN may monitor infrastructure drift only');
  assert.equal(superAdminMonitor.configurationAuthority, false);

  const archivedMutation = svc.validateConfigurationScope({ driftState: 'ARCHIVED', remediationRequested: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived configuration history must be immutable');

  const drift = svc.detectConfigurationDrift({
    baseline: {
      env: { REQUIRE_EMAIL_VERIFIED: true },
      featureFlags: { reports: true },
      rbac: { super_admin: 'infrastructure-only' },
      tenantIsolation: { rls: true },
      serviceDependencies: { storage: 'ready' }
    },
    active: {
      env: { REQUIRE_EMAIL_VERIFIED: false },
      featureFlags: { reports: false },
      rbac: { super_admin: 'business-admin' },
      tenantIsolation: { rls: false },
      serviceDependencies: { storage: 'degraded' }
    }
  });
  assert.equal(drift.driftDetected, true, 'configuration drift should be detected');
  assert.ok(drift.driftItems.some(item => item.category === 'RBAC_CONFIGURATION'), 'RBAC drift should be categorized');
  assert.ok(drift.driftItems.some(item => item.category === 'TENANT_ISOLATION_CONFIGURATION'), 'tenant isolation drift should be categorized');
  assert.ok(Object.isFrozen(drift), 'drift detection output should be immutable');

  const score = svc.calculateConsistencyScore(drift);
  assert.equal(score.environmentConsistent, false, 'drifted environment should be inconsistent');
  assert.ok(score.consistencyScore < 100, 'drift should reduce consistency score');
  assert.ok(score.driftRiskScore > 0, 'drift should produce risk score');
  assert.ok(score.remediationPriorityScore > 0, 'drift should produce remediation priority');

  assert.equal(svc.classifyDriftSeverity({ securityImpact: true, tenantImpact: true }), 'CRITICAL');
  assert.equal(svc.classifyDriftSeverity({ deploymentImpact: true }), 'HIGH');

  const report = svc.generateConfigurationDriftReport({
    tenantSlug: 'tenant-a',
    remediationRequested: true,
    baseline: {
      env: { REQUIRE_EMAIL_VERIFIED: true },
      featureFlags: { reports: true },
      rbac: { super_admin: 'infrastructure-only' },
      tenantIsolation: { rls: true },
      serviceDependencies: { storage: 'ready' }
    },
    active: {
      env: { REQUIRE_EMAIL_VERIFIED: false },
      featureFlags: { reports: false },
      rbac: { super_admin: 'business-admin' },
      tenantIsolation: { rls: false },
      serviceDependencies: { storage: 'degraded' }
    }
  }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO1' }
  });
  assert.equal(report.success, true, 'configuration drift report should run');
  assert.equal(report.driftGovernanceModel.state, 'HIGH_RISK');
  assert.equal(report.driftDetection.driftDetected, true);
  assert.equal(report.environmentConsistency.environmentConsistent, false);
  assert.ok(report.driftAnalytics.driftFrequency >= 1, 'drift analytics should summarize history');
  assert.ok(report.remediationGovernance.remediationRequired, 'remediation should be required for active drift');
  assert.ok(report.governanceIntegrations.deploymentValidationIntegrated, 'deployment validation integration should be reported');
  assert.ok(report.auditSummary.configurationActionsAuditable, 'auditability should be preserved');
  assert.ok(Object.isFrozen(report), 'configuration drift report should be immutable');
  assert.doesNotMatch(JSON.stringify(report), /99000|"leaveBalance"|private:\/\/|hidden|secret-token/i, 'report must not expose confidential tenant data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /CONFIGURATION_DRIFT/.test(row.eventType)), 'drift governance should emit telemetry');
  assert.ok(global.DB.getAuditLogs().some(row => /CONFIGURATION_DRIFT/.test(row.actionType || row.action || '')), 'drift governance should audit actions');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.CONFIGURATION_DRIFT_GOVERNANCE_REPORTED, 'drift governance should emit metrics');

  console.log('configurationDriftService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
