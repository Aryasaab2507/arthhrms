const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0', platform: 'Win32' };
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

function seedUsageData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Tenant A'
  };
  data.platformTenants = [
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', companyName: 'Tenant A', status: 'ACTIVE', quotaBytes: 10000, lastActiveAt: '2026-05-31T00:00:00.000Z' },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', companyName: 'Tenant B', status: 'ACTIVE', quotaBytes: 7000, lastActiveAt: '2026-05-30T00:00:00.000Z', privateNote: 'Tenant B confidential growth plan' },
    { tenantId: 'TENANT-C', tenantSlug: 'tenant-c', companyName: 'Tenant C', status: 'INACTIVE', quotaBytes: 4000, lastActiveAt: '2026-04-01T00:00:00.000Z' }
  ];
  data.employees = [
    { id: 'EMP-A1', empId: 'EMP-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', role: 'EMPLOYEE', salary: 90000, leaveBalance: 11, privateNote: 'confidential employee data' },
    { id: 'EMP-A2', empId: 'EMP-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', role: 'MANAGER', salary: 120000, leaveBalance: 8 },
    { id: 'EMP-B1', empId: 'EMP-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', role: 'EMPLOYEE', salary: 88000, leaveBalance: 9, privateNote: 'Tenant B confidential employee' }
  ];
  data.tenantUsageRecords = [
    {
      usageId: 'USAGE-A1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      usageState: 'HIGH_CONSUMPTION',
      usageType: 'WORKFLOW_CONSUMPTION',
      workflowEvents: 140,
      storageGrowthBytes: 8200,
      featureEvents: 48,
      onboardingCompletions: 12,
      notificationThroughput: 90,
      operationalDensity: 76,
      executionUtilization: 83,
      activitySpike: true,
      usageAnomaly: true,
      salary: 90000,
      leaveBalance: 11,
      metadata: { rawDocumentUrl: 'https://storage.example/private/tenant-a/payroll.pdf', note: 'confidential payload' },
      createdAt: '2026-05-31T00:00:00.000Z'
    },
    {
      usageId: 'USAGE-ARCHIVE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      usageState: 'ARCHIVED',
      usageType: 'TENANT_ACTIVITY',
      workflowEvents: 10,
      storageGrowthBytes: 100,
      featureEvents: 3,
      archivedAt: '2026-04-30T00:00:00.000Z'
    },
    {
      usageId: 'USAGE-B1',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      usageState: 'SPIKE_DETECTED',
      usageType: 'STORAGE_UTILIZATION',
      workflowEvents: 88,
      storageGrowthBytes: 6400,
      featureEvents: 28,
      activitySpike: true,
      privatePayload: 'Tenant B raw confidential usage',
      createdAt: '2026-05-31T01:00:00.000Z'
    }
  ];
  data.workflowTelemetryEvents = [
    { eventId: 'WT-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', eventType: 'WORKFLOW_COMPLETED', status: 'COMPLETED' },
    { eventId: 'WT-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', eventType: 'APPROVAL_DELAY', status: 'DEGRADED' },
    { eventId: 'WT-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', eventType: 'PRIVATE_B_WORKFLOW', status: 'FAILED', confidentialPayload: 'hidden' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'COMPLETED', type: 'ONBOARDING' },
    { eventId: 'WF-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'PENDING', type: 'APPROVAL_DELAY' },
    { eventId: 'WF-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', status: 'FAILED', type: 'PAYROLL', salary: 88000 }
  ];
  data.featureUsageEvents = [
    { eventId: 'FU-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', featureKey: 'reports', eventType: 'FEATURE_USED', status: 'OK' },
    { eventId: 'FU-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', featureKey: 'analytics', eventType: 'FEATURE_CRASH', status: 'FAILED' },
    { eventId: 'FU-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', featureKey: 'payroll', eventType: 'FEATURE_USED', status: 'OK', privatePayload: 'Tenant B salary analytics' }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', featureKey: 'reports', rolloutState: 'ACTIVE', usageCount: 24, adoptionCount: 12, failureCount: 1 },
    { rolloutId: 'ROL-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', featureKey: 'analytics', rolloutState: 'DEGRADED', usageCount: 4, adoptionCount: 1, failureCount: 3 },
    { rolloutId: 'ROL-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', featureKey: 'payroll', rolloutState: 'ACTIVE', usageCount: 11, adoptionCount: 5, failureCount: 0, confidentialNote: 'Tenant B private rollout' }
  ];
  data.storageUsageRecords = [
    { id: 'ST-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', sizeBytes: 5000, state: 'ACTIVE' },
    { id: 'ST-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', sizeBytes: 3200, state: 'DEGRADED', suspiciousAccess: true },
    { id: 'ST-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', sizeBytes: 6400, state: 'ACTIVE', privatePath: 'tenant-b/private/object' }
  ];
  data.notifications = [
    { id: 'N-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'DELIVERED' },
    { id: 'N-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'FAILED' },
    { id: 'N-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', status: 'FAILED', privateMessage: 'Tenant B confidential' }
  ];
  data.employeeOnboarding = [
    { id: 'ONB-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'COMPLETED' },
    { id: 'ONB-A2', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', status: 'COMPLETED' },
    { id: 'ONB-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', status: 'IN_PROGRESS' }
  ];
  data.auditLogs = [];
  data.workflowTelemetry = [];
  data.orchestrationMetrics = [];
  global.DB.save(data);
}

function assertNoConfidentialOutput(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /"salary"\s*:|"leaveBalance"\s*:|"payrollAmount"\s*:|rawDocumentUrl|privatePayload|confidential payload|Tenant B raw|Tenant B salary|privatePath|EMP-A1|EMP-B1/i);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantIsolationService.js',
    'services/platformAnalyticsService.js',
    'services/tenantGovernanceService.js',
    'services/featureRolloutService.js',
    'services/storageHardeningService.js',
    'services/tenantUsageIntelligenceService.js'
  ].forEach(load);
  seedUsageData();

  const svc = global.TenantUsageIntelligenceService;
  assert.ok(svc, 'TenantUsageIntelligenceService should be exported');
  assert.ok(Object.isFrozen(svc), 'tenant usage service export must be immutable');
  assert.ok(Object.isFrozen(svc.USAGE_STATES), 'usage states must be immutable');
  assert.deepEqual(svc.USAGE_STATES, ['ACTIVE', 'LOW_ACTIVITY', 'HIGH_CONSUMPTION', 'DEGRADED', 'SPIKE_DETECTED', 'RESTRICTED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_TENANT_USAGE_SELF_TEST__.passed, true, 'development self-test should cover tenant usage failure cases');

  const platformControlHtml = fs.readFileSync(path.resolve(__dirname, '..', 'platform-control.html'), 'utf8');
  assert.doesNotMatch(platformControlHtml, /document\.getElementById\('tenantUsageScope'\)\.value=permissionGovernanceTenantSlug\(\);/, 'blank tenant usage scope should remain aggregate in platform-control');
  assert.doesNotMatch(platformControlHtml, /tenantSlug:\(document\.getElementById\('tenantUsageScope'\)\?\.value\|\|''\)\.trim\(\)\|\|permissionGovernanceTenantSlug\(\)/, 'tenant usage report input should preserve blank aggregate scope');

  const malformed = svc.normalizeUsagePayload(null, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(malformed.success, false, 'malformed usage payloads should fail safely');

  const original = { state: 'spike detected', usageType: 'feature engagement', tenantSlug: 'Tenant_A', salary: 100, metadata: { rawDocumentUrl: 'https://storage.example/raw' } };
  const before = JSON.stringify(original);
  const normalized = svc.normalizeUsagePayload(original, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(JSON.stringify(original), before, 'normalization must not mutate original payloads');
  assert.equal(normalized.success, true);
  assert.equal(normalized.payload.state, 'SPIKE_DETECTED');
  assert.equal(normalized.payload.usageType, 'FEATURE_ENGAGEMENT');
  assert.ok(Object.isFrozen(normalized), 'normalized usage output must be immutable');
  assertNoConfidentialOutput(normalized);

  assert.equal(svc.classifyUsageRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyUsageRisk({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyUsageRisk({ activitySpike: true, usageAnomaly: true }), 'HIGH_RISK');
  assert.equal(svc.classifyUsageRisk({ featureAbandonment: true }), 'WARNING');

  const ownerScope = svc.validateUsageScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER may view isolated tenant usage intelligence');
  assert.equal(ownerScope.metadata.usageAnalyticsAuthority, true);

  const tenantRole = svc.validateUsageScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(tenantRole.allowed, false, 'tenant roles must never access platform tenant usage intelligence');

  const superAdminPayroll = svc.validateUsageScope({ tenantSlug: 'tenant-a', hrAnalyticsAccess: true, exportConfidentialAnalytics: true, salaryVisibility: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminPayroll.allowed, false, 'SUPER_ADMIN must not gain HR/payroll usage visibility');

  const superAdminInfra = svc.validateUsageScope({ infrastructureOnly: true, loadMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN may view infrastructure-only usage load monitoring');
  assert.equal(superAdminInfra.metadata.usageAnalyticsAuthority, false);

  const superAdminCrossTenant = svc.validateUsageScope({ infrastructureOnly: true, loadMonitoring: true, targetTenantSlug: 'tenant-b' }, {
    routeType: 'platform',
    tenantSlug: 'tenant-a',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminCrossTenant.allowed, false, 'SUPER_ADMIN cross-tenant usage traversal must be blocked');

  const archivedMutation = svc.validateUsageScope({ usageState: 'ARCHIVED', mutationRequested: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical archived usage records must be immutable');

  const anomalies = svc.detectUsageAnomalies({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(anomalies.success, true, 'usage anomaly detection should succeed');
  assert.ok(anomalies.summary.activitySpikes >= 1, 'activity spikes should be detected');
  assert.ok(anomalies.summary.storageAnomalies >= 1, 'storage anomalies should be detected');
  assert.ok(anomalies.summary.featureAbandonment >= 1, 'feature abandonment should be detected');
  assertNoConfidentialOutput(anomalies);

  const report = svc.generateTenantUsageReport({ tenantSlug: 'tenant-a', usageState: 'HIGH_CONSUMPTION' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: false,
    skipTelemetry: false,
    skipMetrics: false
  });
  assert.equal(report.success, true, 'tenant usage report should generate');
  assert.ok(Object.isFrozen(report), 'tenant usage report output must be immutable');
  assert.ok(report.tenantUsageOverview);
  assert.ok(report.consumptionAnalytics);
  assert.ok(report.featureEngagement);
  assert.ok(report.storageIntegration);
  assert.ok(report.tenantIntelligence);
  assert.ok(report.tenantIntelligence.organizationUtilizationScore > 0, 'organization utilization scoring should be generated');
  assert.ok(report.tenantIntelligence.tenantGrowthTrends > 0, 'tenant growth intelligence should be generated');
  assert.ok(report.accessGovernance);
  assert.ok(Array.isArray(report.usageSummaries));
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.equal(report.accessGovernance.superAdminHrPayrollVisibility, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assertNoConfidentialOutput(report);

  const infraReport = svc.generateTenantUsageReport({ infrastructureOnly: true, loadMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'SUPER_ADMIN infrastructure-only usage report should generate');
  assert.equal(infraReport.accessGovernance.superAdminInfrastructureOnly, true);
  assert.equal(infraReport.accessGovernance.superAdminHrPayrollVisibility, false);
  assert.equal(infraReport.usageSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant consumption summaries');
  assertNoConfidentialOutput(infraReport);

  const frozen = svc.freezeUsageOutput({ salary: 1, nested: { leaveBalance: 2, safeCount: 3 } });
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.nested));
  assert.equal(frozen.nested.safeCount, 3);
  assertNoConfidentialOutput(frozen);

  const originalPlatformAnalytics = global.PlatformAnalyticsService;
  const originalFeatureRollout = global.FeatureRolloutService;
  const originalStorageHardening = global.StorageHardeningService;
  delete global.PlatformAnalyticsService;
  delete global.platformAnalyticsService;
  delete global.FeatureRolloutService;
  delete global.featureRolloutService;
  delete global.StorageHardeningService;
  delete global.storageHardeningService;
  const degradedIntegration = svc.generateTenantUsageReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degradedIntegration.success, true, 'tenant usage report should tolerate optional dependency absence');
  assert.equal(degradedIntegration.integrationHealth.platformAnalyticsIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.featureRolloutIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.storageAnalyticsIntegrated, false);
  assertNoConfidentialOutput(degradedIntegration);
  global.PlatformAnalyticsService = originalPlatformAnalytics;
  global.platformAnalyticsService = originalPlatformAnalytics;
  global.FeatureRolloutService = originalFeatureRollout;
  global.featureRolloutService = originalFeatureRollout;
  global.StorageHardeningService = originalStorageHardening;
  global.storageHardeningService = originalStorageHardening;

  const afterData = global.DB.get();
  assert.ok((afterData.auditLogs || []).some(row => /TENANT_USAGE/i.test([row.action, row.type, row.eventType].join(' '))), 'usage analytics access should be auditable');
  assert.ok((afterData.workflowTelemetry || []).some(row => /TENANT_USAGE/i.test([row.eventType, row.metricType, row.type].join(' '))), 'usage analytics should emit workflow telemetry');
  assert.ok((afterData.orchestrationMetrics || []).some(row => /tenant_usage/i.test([row.metric, row.metricType, row.name].join(' '))), 'usage analytics should emit metrics');

  console.log('tenantUsageIntelligenceService tests passed');
}

main();
