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

function seedBillingData() {
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
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', companyName: 'Tenant A', status: 'ACTIVE', planType: 'enterprise', quotaBytes: 10000 },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', companyName: 'Tenant B', status: 'ACTIVE', planType: 'growth', quotaBytes: 8000, privateNote: 'Tenant B confidential renewal' },
    { tenantId: 'TENANT-C', tenantSlug: 'tenant-c', companyName: 'Tenant C', status: 'INACTIVE', planType: 'trial', quotaBytes: 2000 }
  ];
  data.employees = [
    { id: 'EMP-A1', empId: 'EMP-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', role: 'EMPLOYEE', salary: 90000, leaveBalance: 11 },
    { id: 'EMP-B1', empId: 'EMP-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', role: 'EMPLOYEE', salary: 88000, leaveBalance: 9, privateNote: 'Tenant B confidential employee' }
  ];
  data.tenantBillingRecords = [
    {
      billingId: 'BILL-A1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      subscriptionId: 'SUB-A1',
      billingState: 'PAST_DUE',
      planKey: 'enterprise',
      planTier: 'ENTERPRISE',
      usageTier: 'HIGH_USAGE',
      invoiceState: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
      renewalStatus: 'FAILED',
      renewalFailures: 2,
      billingRestriction: true,
      abnormalUsageGrowth: true,
      storageGrowthBytes: 8200,
      workflowUsage: 155,
      featureUsage: 42,
      onboardingActivation: 9,
      amountDue: 50000,
      salary: 90000,
      leaveBalance: 11,
      metadata: { rawInvoiceUrl: 'https://billing.example/private/invoice.pdf', note: 'confidential billing payload' },
      createdAt: '2026-05-31T00:00:00.000Z'
    },
    {
      billingId: 'BILL-A-ARCHIVE',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      subscriptionId: 'SUB-A-OLD',
      billingState: 'ARCHIVED',
      planKey: 'starter',
      paymentStatus: 'PAID',
      archivedAt: '2026-04-30T00:00:00.000Z'
    },
    {
      billingId: 'BILL-B1',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      subscriptionId: 'SUB-B1',
      billingState: 'ACTIVE',
      planKey: 'growth',
      paymentStatus: 'PAID',
      renewalStatus: 'HEALTHY',
      amountDue: 25000,
      privatePayload: 'Tenant B financial payload',
      createdAt: '2026-05-31T01:00:00.000Z'
    }
  ];
  data.billingPlanRecords = [
    { planKey: 'trial', planName: 'Trial', tier: 'TRIAL', active: true },
    { planKey: 'enterprise', planName: 'Enterprise', tier: 'ENTERPRISE', active: true },
    { planKey: 'growth', planName: 'Growth', tier: 'GROWTH', active: true, privateNote: 'private pricing note' }
  ];
  data.invoiceFoundationRecords = [
    { invoiceId: 'INV-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', subscriptionId: 'SUB-A1', invoiceState: 'PAYMENT_FAILED', renewalFailure: true, amountDue: 50000 },
    { invoiceId: 'INV-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', subscriptionId: 'SUB-B1', invoiceState: 'PAID', amountDue: 25000, privatePayload: 'Tenant B invoice' }
  ];
  data.paymentStateRecords = [
    { id: 'PAY-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', paymentStatus: 'FAILED', retryCount: 2 },
    { id: 'PAY-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', paymentStatus: 'PAID', privatePayload: 'Tenant B payment' }
  ];
  data.tenantUsageRecords = [
    { usageId: 'USAGE-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', usageState: 'HIGH_CONSUMPTION', workflowEvents: 150, storageGrowthBytes: 8200, featureEvents: 42, activitySpike: true },
    { usageId: 'USAGE-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', usageState: 'ACTIVE', workflowEvents: 20, storageGrowthBytes: 2200, featureEvents: 8, privatePayload: 'Tenant B usage' }
  ];
  data.workflowTelemetryEvents = [
    { eventId: 'WT-A1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', eventType: 'BILLING_RENEWAL_FAILED', status: 'FAILED' },
    { eventId: 'WT-B1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', eventType: 'PRIVATE_BILLING_EVENT', status: 'FAILED', confidentialPayload: 'Tenant B hidden' }
  ];
  data.auditLogs = [];
  data.workflowTelemetry = [];
  data.orchestrationMetrics = [];
  global.DB.save(data);
}

function assertNoConfidentialOutput(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /"salary"\s*:|"leaveBalance"\s*:|"payrollAmount"\s*:|rawInvoiceUrl|privatePayload|confidential billing payload|Tenant B financial|Tenant B invoice|Tenant B payment|Tenant B usage|EMP-A1|EMP-B1/i);
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
    'services/tenantUsageIntelligenceService.js',
    'services/tenantBillingService.js'
  ].forEach(load);
  seedBillingData();

  const svc = global.TenantBillingService;
  assert.ok(svc, 'TenantBillingService should be exported');
  assert.ok(Object.isFrozen(svc), 'tenant billing service export must be immutable');
  assert.ok(Object.isFrozen(svc.BILLING_STATES), 'billing states must be immutable');
  assert.deepEqual(svc.BILLING_STATES, ['TRIAL', 'ACTIVE', 'PAST_DUE', 'LIMITED', 'SUSPENDED', 'CANCELLED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_TENANT_BILLING_SELF_TEST__.passed, true, 'development self-test should cover billing failure cases');

  const malformed = svc.normalizeBillingPayload(null, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(malformed.success, false, 'malformed billing payloads should fail safely');

  const original = { state: 'past due', planKey: 'Enterprise', tenantSlug: 'Tenant_A', salary: 100, metadata: { rawInvoiceUrl: 'https://billing.example/raw' } };
  const before = JSON.stringify(original);
  const normalized = svc.normalizeBillingPayload(original, { actor: { role: 'PLATFORM_OWNER' } });
  assert.equal(JSON.stringify(original), before, 'normalization must not mutate original payloads');
  assert.equal(normalized.success, true);
  assert.equal(normalized.payload.state, 'PAST_DUE');
  assert.equal(normalized.payload.planKey, 'enterprise');
  assert.ok(Object.isFrozen(normalized), 'normalized billing output must be immutable');
  assertNoConfidentialOutput(normalized);

  assert.equal(svc.classifyBillingRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyBillingRisk({ financialExposure: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyBillingRisk({ renewalFailures: 2, billingRestriction: true }), 'HIGH_RISK');
  assert.equal(svc.classifyBillingRisk({ downgradeTrend: true }), 'WARNING');

  const ownerScope = svc.validateBillingScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER may view isolated billing governance');
  assert.equal(ownerScope.metadata.billingGovernanceAuthority, true);

  const tenantRole = svc.validateBillingScope({ tenantSlug: 'tenant-a', aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'DIRECTOR', id: 'DIR-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(tenantRole.allowed, false, 'tenant roles must never access platform billing governance');

  const superAdminFinancial = svc.validateBillingScope({ tenantSlug: 'tenant-a', financialGovernanceAccess: true, planAssignmentRequested: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminFinancial.allowed, false, 'SUPER_ADMIN must not gain financial governance access');

  const superAdminInfra = svc.validateBillingScope({ infrastructureOnly: true, billingInfrastructureMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN may view infrastructure-only billing health');
  assert.equal(superAdminInfra.metadata.billingGovernanceAuthority, false);

  const superAdminCrossTenant = svc.validateBillingScope({ infrastructureOnly: true, billingInfrastructureMonitoring: true, targetTenantSlug: 'tenant-b' }, {
    routeType: 'platform',
    tenantSlug: 'tenant-a',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' }
  });
  assert.equal(superAdminCrossTenant.allowed, false, 'SUPER_ADMIN cross-tenant billing traversal must be blocked');

  const archivedMutation = svc.validateBillingScope({ billingState: 'ARCHIVED', mutationRequested: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical archived billing records must be immutable');

  const anomalies = svc.detectBillingAnomalies({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(anomalies.success, true, 'billing anomaly detection should succeed');
  assert.ok(anomalies.summary.renewalFailures >= 1, 'renewal failures should be detected');
  assert.ok(anomalies.summary.subscriptionAnomalies >= 1, 'subscription anomalies should be detected');
  assert.ok(anomalies.summary.abnormalUsageGrowth >= 1, 'abnormal usage growth should be detected');
  assertNoConfidentialOutput(anomalies);

  const report = svc.generateTenantBillingReport({ tenantSlug: 'tenant-a', billingState: 'PAST_DUE' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: false,
    skipTelemetry: false,
    skipMetrics: false
  });
  assert.equal(report.success, true, 'tenant billing report should generate');
  assert.ok(Object.isFrozen(report), 'tenant billing report output must be immutable');
  assert.ok(report.billingGovernanceOverview);
  assert.ok(report.subscriptionLifecycle);
  assert.ok(report.renewalGovernance);
  assert.ok(report.analyticsIntegration);
  assert.ok(report.billingIntelligence);
  assert.ok(report.accessGovernance);
  assert.ok(Array.isArray(report.billingSummaries));
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.equal(report.accessGovernance.payrollVisibility, false);
  assert.equal(report.accessGovernance.superAdminFinancialGovernanceAccess, false);
  assert.equal(report.accessGovernance.platformOwnerTenantRbacIsolation, true);
  assertNoConfidentialOutput(report);

  const infraReport = svc.generateTenantBillingReport({ infrastructureOnly: true, billingInfrastructureMonitoring: true, tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tenant-a' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'SUPER_ADMIN infrastructure-only billing report should generate');
  assert.equal(infraReport.accessGovernance.superAdminInfrastructureOnly, true);
  assert.equal(infraReport.accessGovernance.superAdminFinancialGovernanceAccess, false);
  assert.equal(infraReport.billingSummaries.length, 0, 'SUPER_ADMIN infrastructure view must not expose tenant financial summaries');
  assertNoConfidentialOutput(infraReport);

  const frozen = svc.freezeBillingOutput({ amountDue: 1, salary: 2, nested: { leaveBalance: 3, subscriptionCount: 4 } });
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.nested));
  assert.equal(frozen.nested.subscriptionCount, 4);
  assertNoConfidentialOutput(frozen);

  const originalUsage = global.TenantUsageIntelligenceService;
  const originalPlatform = global.PlatformAnalyticsService;
  delete global.TenantUsageIntelligenceService;
  delete global.tenantUsageIntelligenceService;
  delete global.PlatformAnalyticsService;
  delete global.platformAnalyticsService;
  const degradedIntegration = svc.generateTenantBillingReport({ tenantSlug: 'tenant-a' }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degradedIntegration.success, true, 'billing report should tolerate optional dependency absence');
  assert.equal(degradedIntegration.integrationHealth.tenantUsageIntegrated, false);
  assert.equal(degradedIntegration.integrationHealth.platformAnalyticsIntegrated, false);
  assertNoConfidentialOutput(degradedIntegration);
  global.TenantUsageIntelligenceService = originalUsage;
  global.tenantUsageIntelligenceService = originalUsage;
  global.PlatformAnalyticsService = originalPlatform;
  global.platformAnalyticsService = originalPlatform;

  const afterData = global.DB.get();
  assert.ok((afterData.auditLogs || []).some(row => /TENANT_BILLING/i.test([row.action, row.type, row.eventType].join(' '))), 'billing governance access should be auditable');
  assert.ok((afterData.workflowTelemetry || []).some(row => /TENANT_BILLING/i.test([row.eventType, row.metricType, row.type].join(' '))), 'billing governance should emit workflow telemetry');
  assert.ok((afterData.orchestrationMetrics || []).some(row => /tenant_billing/i.test([row.metric, row.metricType, row.name].join(' '))), 'billing governance should emit metrics');

  console.log('tenantBillingService tests passed');
}

main();
