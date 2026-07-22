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

function seedCostData() {
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
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', companyName: 'Tenant A', status: 'ACTIVE', quotaBytes: 10000 },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', companyName: 'Tenant B', status: 'ACTIVE', quotaBytes: 5000, privateNote: 'Tenant B cost forecast is confidential' }
  ];
  data.employees = [
    { id: 'EMP-A1', empId: 'EMP-A1', tenantSlug: 'tenant-a', role: 'HR', salary: 120000, leaveBalance: 9, privateNote: 'employee confidential data' },
    { id: 'EMP-B1', empId: 'EMP-B1', tenantSlug: 'tenant-b', role: 'EMPLOYEE', salary: 84000, leaveBalance: 7, privateNote: 'Tenant B confidential employee' }
  ];
  data.platformCostRecords = [
    {
      costId: 'COST-A1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      costState: 'COST_SPIKE',
      costType: 'STORAGE_COST',
      storageCost: 90,
      workflowExecutionCost: 72,
      notificationCost: 36,
      deploymentCost: 28,
      operationalEfficiencyScore: 41,
      resourceUnits: 226,
      optimizationOpportunity: true,
      costAnomaly: true,
      salary: 120000,
      leaveBalance: 9,
      metadata: { rawDocumentPath: 'private://tenant-a/payroll-costs.csv', confidentialNote: 'salary payload' },
      createdAt: '2026-06-01T00:00:00.000Z'
    },
    {
      costId: 'COST-A-ARCHIVE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      costState: 'ARCHIVED',
      costType: 'INFRASTRUCTURE_CONSUMPTION',
      storageCost: 12,
      workflowExecutionCost: 8,
      notificationCost: 3,
      deploymentCost: 4,
      archivedAt: '2026-04-01T00:00:00.000Z'
    },
    {
      costId: 'COST-B1',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      costState: 'HIGH_USAGE',
      costType: 'WORKFLOW_EXECUTION_COST',
      storageCost: 40,
      workflowExecutionCost: 55,
      privatePayload: 'Tenant B raw confidential cost internals',
      createdAt: '2026-06-01T01:00:00.000Z'
    }
  ];
  data.storageUsageRecords = [
    { id: 'ST-A1', tenantSlug: 'tenant-a', sizeBytes: 6100, storageCost: 42, state: 'ACTIVE' },
    { id: 'ST-A2', tenantSlug: 'tenant-a', sizeBytes: 3900, storageCost: 39, state: 'DEGRADED', suspiciousAccess: true },
    { id: 'ST-B1', tenantSlug: 'tenant-b', sizeBytes: 4200, storageCost: 30, privatePath: 'tenant-b/private/object' }
  ];
  data.storageHardeningRecords = [
    { id: 'SH-A1', tenantSlug: 'tenant-a', storageState: 'ACTIVE', quotaUtilization: 91, costAnomaly: true },
    { id: 'SH-B1', tenantSlug: 'tenant-b', storageState: 'ACTIVE', quotaUtilization: 64, confidentialPayload: 'Tenant B storage internals' }
  ];
  data.workflowTelemetryEvents = [
    { eventId: 'WT-A1', tenantSlug: 'tenant-a', eventType: 'WORKFLOW_COMPLETED', status: 'COMPLETED', executionCost: 13 },
    { eventId: 'WT-A2', tenantSlug: 'tenant-a', eventType: 'APPROVAL_DELAY', status: 'DEGRADED', executionCost: 31 },
    { eventId: 'WT-B1', tenantSlug: 'tenant-b', eventType: 'PAYROLL_PRIVATE', status: 'FAILED', salary: 84000 }
  ];
  data.workflowEvents = [
    { eventId: 'WF-A1', tenantSlug: 'tenant-a', status: 'PENDING', type: 'APPROVAL_DELAY', executionCost: 18 },
    { eventId: 'WF-A2', tenantSlug: 'tenant-a', status: 'FAILED', type: 'ESCALATION', executionCost: 23 }
  ];
  data.notifications = [
    { id: 'N-A1', tenantSlug: 'tenant-a', status: 'FAILED', notificationCost: 6 },
    { id: 'N-A2', tenantSlug: 'tenant-a', status: 'DELIVERED', notificationCost: 3 }
  ];
  data.deploymentValidationRecords = [
    { id: 'DV-A1', tenantSlug: 'tenant-a', deploymentState: 'DEGRADED', deploymentCost: 21, failedJobs: 2 }
  ];
  data.tenantUsageRecords = [
    { usageId: 'USAGE-A1', tenantSlug: 'tenant-a', usageState: 'HIGH_CONSUMPTION', workflowEvents: 120, storageGrowthBytes: 10000, operationalDensity: 82 },
    { usageId: 'USAGE-B1', tenantSlug: 'tenant-b', usageState: 'SPIKE_DETECTED', privatePayload: 'Tenant B usage raw' }
  ];
  data.tenantBillingRecords = [
    { billingId: 'BILL-A1', tenantSlug: 'tenant-a', billingState: 'ACTIVE', planKey: 'enterprise', usageTier: 'HIGH_USAGE' }
  ];
  data.auditLogs = [];
  data.workflowTelemetry = [];
  data.orchestrationMetrics = [];
  global.DB.save(data);
}

function assertNoConfidentialOutput(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /"salary"\s*:|"leaveBalance"\s*:|"payrollAmount"\s*:|rawDocumentPath|privatePayload|privatePath|salary payload|Tenant B raw|Tenant B usage|Tenant B cost|Tenant B storage|EMP-A1|EMP-B1/i);
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
    'services/tenantUsageIntelligenceService.js',
    'services/tenantBillingService.js',
    'services/storageHardeningService.js',
    'services/platformCostMonitoringService.js'
  ].forEach(load);
  seedCostData();

  const svc = global.PlatformCostMonitoringService;
  assert.ok(svc, 'PlatformCostMonitoringService should be exported');
  assert.ok(Object.isFrozen(svc), 'platform cost service export must be immutable');
  assert.ok(Object.isFrozen(svc.COST_STATES), 'cost states must be immutable');
  assert.deepEqual(svc.COST_STATES, ['NORMAL', 'MONITORING', 'HIGH_USAGE', 'COST_SPIKE', 'DEGRADED', 'OPTIMIZATION_REQUIRED', 'ALERTED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_PLATFORM_COST_SELF_TEST__.passed, true, 'development self-test should cover platform cost failure cases');

  const platformControlHtml = fs.readFileSync(path.resolve(__dirname, '..', 'platform-control.html'), 'utf8');
  assert.match(platformControlHtml, /services\/platformCostMonitoringService\.js/, 'platform-control must load platform cost monitoring service');
  assert.match(platformControlHtml, /id="platformCostCards"/, 'platform-control must render isolated platform cost console');
  assert.doesNotMatch(platformControlHtml, /platformCostScope'\)\?\.value\|\|''\)\.trim\(\)\|\|permissionGovernanceTenantSlug\(\)/, 'blank platform cost scope should remain aggregate');

  const malformed = svc.normalizeCostPayload(null, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(malformed.success, false, 'malformed cost payloads should fail safely');

  const original = { state: 'cost spike', costType: 'workflow execution cost', tenantSlug: 'Tenant_A', salary: 100, metadata: { rawDocumentPath: 'private://raw' } };
  const before = JSON.stringify(original);
  const normalized = svc.normalizeCostPayload(original, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(JSON.stringify(original), before, 'normalization must not mutate original payloads');
  assert.equal(normalized.success, true);
  assert.equal(normalized.payload.state, 'COST_SPIKE');
  assert.equal(normalized.payload.costType, 'WORKFLOW_EXECUTION_COST');
  assert.ok(Object.isFrozen(normalized), 'normalized cost output must be immutable');
  assertNoConfidentialOutput(normalized);

  assert.equal(svc.classifyCostRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyCostRisk({ salaryVisibility: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyCostRisk({ costAnomaly: true, state: 'COST_SPIKE' }), 'HIGH_RISK');
  assert.equal(svc.classifyCostRisk({ optimizationOpportunity: true }), 'WARNING');

  const ownerScope = svc.validateCostScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER may view isolated platform cost intelligence');
  assert.equal(ownerScope.metadata.costAnalyticsAuthority, true);

  const tenantRole = svc.validateCostScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'DIRECTOR', id: 'DIR-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(tenantRole.allowed, false, 'tenant roles must never access platform cost intelligence');

  const superAdminPayroll = svc.validateCostScope({ tenantSlug: 'tenant-a', hrAnalyticsAccess: true, salaryVisibility: true, payrollVisibility: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminPayroll.allowed, false, 'SUPER_ADMIN must not gain HR/payroll visibility from cost analytics');

  const superAdminInfra = svc.validateCostScope({ infrastructureOnly: true, resourceMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN may view infrastructure-only cost monitoring');
  assert.equal(superAdminInfra.metadata.costAnalyticsAuthority, false);

  const superAdminCrossTenant = svc.validateCostScope({ infrastructureOnly: true, resourceMonitoring: true, targetTenantSlug: 'tenant-b' }, {
    routeType: 'platform',
    tenantSlug: 'tenant-a',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminCrossTenant.allowed, false, 'SUPER_ADMIN cross-tenant cost traversal must be blocked');

  const archivedMutation = svc.validateCostScope({ costState: 'ARCHIVED', mutationRequested: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical archived cost records must be immutable');

  const anomalies = svc.detectInfrastructureAnomalies({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(anomalies.success, true, 'infrastructure anomaly detection should succeed');
  assert.ok(anomalies.summary.infrastructureSpikes >= 1, 'infrastructure spikes should be detected');
  assert.ok(anomalies.summary.storageCostAnomalies >= 1, 'storage cost anomalies should be detected');
  assert.ok(anomalies.summary.workflowExecutionOverload >= 1, 'workflow execution overload should be detected');
  assert.ok(anomalies.summary.optimizationOpportunities >= 1, 'optimization opportunities should be detected');
  assertNoConfidentialOutput(anomalies);

  const report = svc.generatePlatformCostReport({ tenantSlug: 'tenant-a', costState: 'COST_SPIKE' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: false,
    skipTelemetry: false,
    skipMetrics: false
  });
  assert.equal(report.success, true, 'platform cost report should generate');
  assert.ok(Object.isFrozen(report), 'platform cost report output must be immutable');
  assert.ok(report.costGovernanceModel);
  assert.ok(report.infrastructureAnalytics);
  assert.ok(report.storageWorkflowIntegration);
  assert.ok(report.resourceEfficiency);
  assert.ok(report.costIntelligence);
  assert.ok(report.accessGovernance);
  assert.ok(Array.isArray(report.costSummaries));
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.equal(report.accessGovernance.superAdminHrPayrollVisibility, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assertNoConfidentialOutput(report);

  const infraReport = svc.generatePlatformCostReport({ infrastructureOnly: true, resourceMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'SUPER_ADMIN infrastructure-only cost report should generate');
  assert.equal(infraReport.accessGovernance.superAdminInfrastructureOnly, true);
  assert.equal(infraReport.accessGovernance.superAdminHrPayrollVisibility, false);
  assert.equal(infraReport.costSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant cost summaries');
  assertNoConfidentialOutput(infraReport);

  const frozen = svc.freezeCostOutput({ salary: 1, nested: { leaveBalance: 2, safeCount: 3 } });
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.nested));
  assert.equal(frozen.nested.safeCount, 3);
  assertNoConfidentialOutput(frozen);

  const originalUsage = global.TenantUsageIntelligenceService;
  const originalBilling = global.TenantBillingService;
  const originalStorage = global.StorageHardeningService;
  const originalAnalytics = global.PlatformAnalyticsService;
  delete global.TenantUsageIntelligenceService;
  delete global.tenantUsageIntelligenceService;
  delete global.TenantBillingService;
  delete global.tenantBillingService;
  delete global.StorageHardeningService;
  delete global.storageHardeningService;
  delete global.PlatformAnalyticsService;
  delete global.platformAnalyticsService;
  const degradedIntegration = svc.generatePlatformCostReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degradedIntegration.success, true, 'platform cost report should tolerate optional dependency absence');
  assert.equal(degradedIntegration.integrationHealth.tenantUsageIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.tenantBillingIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.storageAnalyticsIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.platformAnalyticsIntegrated, false);
  assertNoConfidentialOutput(degradedIntegration);
  global.TenantUsageIntelligenceService = originalUsage;
  global.tenantUsageIntelligenceService = originalUsage;
  global.TenantBillingService = originalBilling;
  global.tenantBillingService = originalBilling;
  global.StorageHardeningService = originalStorage;
  global.storageHardeningService = originalStorage;
  global.PlatformAnalyticsService = originalAnalytics;
  global.platformAnalyticsService = originalAnalytics;

  const afterData = global.DB.get();
  assert.ok((afterData.auditLogs || []).some(row => /PLATFORM_COST/i.test([row.action, row.type, row.eventType].join(' '))), 'cost analytics access should be auditable');
  assert.ok((afterData.workflowTelemetry || []).some(row => /PLATFORM_COST/i.test([row.eventType, row.metricType, row.type].join(' '))), 'cost analytics should emit workflow telemetry');
  assert.ok((afterData.orchestrationMetrics || []).some(row => /platform_cost/i.test([row.metric, row.metricType, row.name].join(' '))), 'cost analytics should emit metrics');

  console.log('platformCostMonitoringService tests passed');
}

main();
