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
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
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
  global.navigator = { userAgent: 'Node multi-region architecture test', platform: 'Win32' };
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

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug },
    now: '2026-06-30T14:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-30T14:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-30T14:00:00.000Z'
  };
}

function seedData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private region data' }
  ];
  data.regionalObservabilityHistory = [
    { tenantSlug: 'tabsons', regionCode: 'AP-SOUTH', apiLatencyMs: 92, availabilityPercent: 99.92, traceCount: 12, logCount: 45, timestamp: '2026-06-30T13:58:00.000Z', immutable: true },
    { tenantSlug: 'abc', regionCode: 'US-EAST', apiLatencyMs: 35, availabilityPercent: 99.99, privateNote: 'ABC private region data', immutable: true }
  ];
  data.observabilityMetricsHistory = [
    { tenantSlug: 'tabsons', metricType: 'APPLICATION', apiLatencyMs: 94, platformHealthScore: 91, immutable: true }
  ];
  data.enterpriseLogHistory = [
    { tenantSlug: 'tabsons', tenant_id: 'tabsons', regionCode: 'AP-SOUTH', level: 'INFO', category: 'SYSTEM', message: 'regional health', immutable: true }
  ];
  data.disasterRecoveryReportHistory = [
    { tenantSlug: 'tabsons', reportId: 'DRR-1', state: 'COMPLETED', recoveryReadinessScore: 88, businessContinuityScore: 86, immutable: true }
  ];
  data.regionRegistryHistory = [];
  data.tenantRegionAssignmentHistory = [];
  data.regionalConfigurationHistory = [];
  data.failoverPlanHistory = [];
  data.multiRegionDeploymentPlanHistory = [];
  data.regionalHealthHistory = [];
  data.infrastructureTopologyHistory = [];
  data.multiRegionAnalyticsHistory = [];
  data.auditLogs = [];
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
    'services/apiPayloadValidationService.js',
    'services/apiGatewayGovernanceService.js',
    'services/enterpriseRedisCacheService.js',
    'services/distributedQueueService.js',
    'services/horizontalScalabilityService.js',
    'services/infrastructureObservabilityService.js',
    'services/enterpriseLoggingPipelineService.js',
    'services/disasterRecoverySimulationService.js',
    'services/backupIntegrityVerificationService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/multiRegionArchitectureService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('MultiRegionArchitectureService should be exported');
    }
    throw error;
  }

  const svc = global.MultiRegionArchitectureService;
  assert.ok(svc, 'MultiRegionArchitectureService should be exported');
  assert.equal(global.multiRegionArchitectureService, svc, 'lowercase multi-region alias should be exported');
  assert.ok(Object.isFrozen(svc), 'multi-region service export should be frozen');
  ['RegionRegistry', 'RegionManager', 'FailoverPlanner', 'DeploymentPlanner', 'RegionalHealthService', 'InfrastructureTopologyBuilder'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['AP-SOUTH', 'EU-WEST', 'US-EAST', 'US-WEST'].forEach(region => {
    assert.ok(svc.SUPPORTED_REGION_CODES.includes(region), `${region} should be in the configurable default region registry`);
  });
  ['ACTIVE_PASSIVE', 'ACTIVE_ACTIVE_PREPARED'].forEach(topology => {
    assert.ok(svc.DEPLOYMENT_TOPOLOGIES.includes(topology), `${topology} topology should be supported`);
  });
  assert.equal(global.__ARTHHRMS_MULTI_REGION_SELF_TEST__.passed, true, 'development self-test should pass');

  const primary = svc.RegionRegistry.registerRegion({
    tenantSlug: 'tabsons',
    regionCode: 'AP-SOUTH',
    regionName: 'Asia Pacific South',
    status: 'ACTIVE',
    priority: 1,
    health: 'HEALTHY',
    failoverTarget: 'EU-WEST',
    deploymentState: 'ACTIVE',
    topology: 'ACTIVE_PASSIVE',
    provider: 'AWS_GLOBAL_ACCELERATOR',
    configuration: {
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      currency: 'INR',
      holidayCalendar: 'IN-COMPANY',
      complianceProfile: 'INDIA-DPDP',
      notificationProvider: 'SES-AP-SOUTH',
      storageEndpoint: 'https://storage.ap-south.example',
      secretKey: 'hidden-region-secret'
    }
  }, ownerContext());
  assert.equal(primary.success, true, 'primary region registration should succeed');
  assert.equal(primary.region.regionCode, 'AP-SOUTH');
  assert.equal(primary.region.activePassiveReady, true);
  assert.equal(primary.region.activeActivePrepared, true);
  assert.equal(primary.governance.backwardCompatibilityPreserved, true);
  assert.equal(primary.governance.tenantIsolationPreserved, true);
  assert.equal(primary.governance.multiRegionGovernancePreserved, true);
  assert.doesNotMatch(text(primary), /hidden-region-secret|secretKey/i, 'region registration output should redact secrets');

  const backup = svc.RegionRegistry.registerRegion({
    tenantSlug: 'tabsons',
    regionCode: 'EU-WEST',
    regionName: 'Europe West',
    status: 'STANDBY',
    priority: 2,
    health: 'HEALTHY',
    failoverTarget: 'US-EAST',
    deploymentState: 'PREPARED'
  }, ownerContext());
  assert.equal(backup.success, true, 'backup region registration should succeed');

  const unavailable = svc.RegionRegistry.registerRegion({
    tenantSlug: 'tabsons',
    regionCode: 'US-EAST',
    regionName: 'US East',
    status: 'DEGRADED',
    priority: 3,
    health: 'DEGRADED',
    failoverTarget: 'US-WEST',
    deploymentState: 'PREPARED'
  }, ownerContext());
  assert.equal(unavailable.success, true, 'degraded recovery region registration should still be modeled');

  const listed = svc.RegionRegistry.listRegions({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(listed.success, true, 'region registry listing should succeed');
  assert.ok(listed.regions.length >= 3, 'registry should include tenant-scoped regions');
  assert.ok(listed.regions.every(row => row.tenantSlug === 'tabsons'), 'region listing should be tenant scoped');
  assert.doesNotMatch(text(listed), /ABC private region data|privateNote/i, 'region listing must not leak other tenants');

  const config = svc.RegionManager.configureRegionalSettings({
    tenantSlug: 'tabsons',
    regionCode: 'AP-SOUTH',
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    currency: 'INR',
    holidayCalendar: 'IN-COMPANY',
    complianceProfile: 'INDIA-DPDP',
    notificationProvider: 'SES',
    storageEndpoint: 'https://storage.ap-south.example',
    regionalKmsPrepared: true,
    regionalSecretsPrepared: true,
    regionalCertificatesPrepared: true,
    regionalIdentityProviderPrepared: true
  }, ownerContext());
  assert.equal(config.success, true, 'regional settings should configure');
  assert.equal(config.configuration.timezone, 'Asia/Kolkata');
  assert.equal(config.configuration.currency, 'INR');
  assert.equal(config.security.regionalKmsPrepared, true);
  assert.equal(config.security.secretsSharedAcrossRegions, false, 'secrets must not be shared improperly between regions');

  const assignment = svc.RegionManager.assignTenantRegion({
    tenantSlug: 'tabsons',
    primaryRegion: 'AP-SOUTH',
    backupRegion: 'EU-WEST',
    recoveryRegion: 'US-EAST',
    migrationPreparation: true
  }, ownerContext());
  assert.equal(assignment.success, true, 'tenant region assignment should succeed');
  assert.equal(assignment.assignment.primaryRegion, 'AP-SOUTH');
  assert.equal(assignment.assignment.backupRegion, 'EU-WEST');
  assert.equal(assignment.assignment.recoveryRegion, 'US-EAST');
  assert.equal(assignment.liveMigrationImplemented, false, 'live migration must not be implemented');
  assert.equal(assignment.crossRegionDataMovementAllowed, false, 'cross-region movement should require explicit future governance');

  const failover = svc.FailoverPlanner.prepareFailoverPlan({
    tenantSlug: 'tabsons',
    primaryRegion: 'AP-SOUTH',
    targetRegion: 'EU-WEST',
    failoverType: 'HEALTH_BASED',
    rtoMinutes: 45,
    rpoMinutes: 15
  }, ownerContext());
  assert.equal(failover.success, true, 'failover preparation should succeed');
  assert.equal(failover.plan.failoverType, 'HEALTH_BASED');
  assert.equal(failover.plan.automaticFailoverPrepared, true);
  assert.equal(failover.plan.manualFailoverPrepared, true);
  assert.equal(failover.plan.disasterFailoverPrepared, true);
  assert.equal(failover.failoverExecutionEnabled, false, 'failover execution should remain disabled');
  assertScore(failover.failoverReadinessScore, 'failover readiness score');

  const conflict = svc.FailoverPlanner.prepareFailoverPlan({
    tenantSlug: 'tabsons',
    primaryRegion: 'AP-SOUTH',
    targetRegion: 'AP-SOUTH',
    failoverType: 'MANUAL'
  }, ownerContext());
  assert.equal(conflict.success, false, 'same-region failover target should be blocked');
  assert.equal(conflict.code, 'FAILOVER_CONFIGURATION_CONFLICT');

  const replication = svc.DeploymentPlanner.generateDeploymentPlan({
    tenantSlug: 'tabsons',
    topology: 'ACTIVE_PASSIVE',
    targetRegions: ['AP-SOUTH', 'EU-WEST', 'US-EAST'],
    globalDnsReady: true,
    globalLoadBalancerReady: true,
    databaseReplicationInterface: true,
    objectStorageReplicationInterface: true,
    cacheSynchronizationInterface: true,
    queueReplicationInterface: true
  }, ownerContext());
  assert.equal(replication.success, true, 'deployment plan should generate');
  assert.equal(replication.plan.topology, 'ACTIVE_PASSIVE');
  assert.equal(replication.plan.activeActiveFutureReady, true);
  assert.equal(replication.replicationInterfaces.databaseReplication.prepared, true);
  assert.equal(replication.replicationInterfaces.databaseReplication.engineImplemented, false);
  assert.equal(replication.replicationInterfaces.queueReplication.engineImplemented, false);
  assertScore(replication.deploymentReadinessScore, 'deployment readiness score');

  const health = svc.RegionalHealthService.evaluateRegionalHealth({
    tenantSlug: 'tabsons',
    regions: [
      { regionCode: 'AP-SOUTH', status: 'ACTIVE', apiLatencyMs: 88, availabilityPercent: 99.95, databaseLatencyMs: 42, queueLagMs: 120, logIngestionLagMs: 15, traceIngestionLagMs: 18 },
      { regionCode: 'EU-WEST', status: 'STANDBY', apiLatencyMs: 132, availabilityPercent: 99.7, databaseLatencyMs: 60, queueLagMs: 210, logIngestionLagMs: 28, traceIngestionLagMs: 30 },
      { regionCode: 'US-EAST', status: 'DEGRADED', apiLatencyMs: 260, availabilityPercent: 98.8, databaseLatencyMs: 92, queueLagMs: 620, logIngestionLagMs: 90, traceIngestionLagMs: 110 }
    ]
  }, directorContext());
  assert.equal(health.success, true, 'regional health should evaluate');
  assertScore(health.regionalHealthScore, 'regional health score');
  assertScore(health.availabilityScore, 'availability score');
  assert.ok(health.regionalMetrics.length >= 3);
  assert.ok(health.degradedRegions.some(row => row.regionCode === 'US-EAST'));

  const topology = svc.InfrastructureTopologyBuilder.buildInfrastructureTopology({
    tenantSlug: 'tabsons',
    regions: ['AP-SOUTH', 'EU-WEST', 'US-EAST'],
    topology: 'ACTIVE_PASSIVE'
  }, directorContext());
  assert.equal(topology.success, true, 'infrastructure topology should build');
  assert.ok(topology.topology.nodes.some(node => node.id === 'GLOBAL_DNS'));
  assert.ok(topology.topology.nodes.some(node => node.id === 'REGION_AP_SOUTH'));
  assert.ok(topology.topology.edges.some(edge => edge.from === 'GLOBAL_DNS' && edge.to === 'GLOBAL_LOAD_BALANCER'));
  assert.equal(topology.topology.activePassiveToday, true);
  assert.equal(topology.topology.activeActiveFutureReady, true);

  const report = svc.RegionManager.generateGlobalInfrastructureReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'global infrastructure report should generate');
  assert.equal(report.tenantSlug, 'tabsons');
  assert.equal(report.architecture.activePassiveToday, true);
  assert.equal(report.architecture.activeActiveFutureReady, true);
  assert.equal(report.dataReplication.databaseReplication.interfacePrepared, true);
  assert.equal(report.dataReplication.databaseReplication.engineImplemented, false);
  assert.equal(report.security.regionalKmsPrepared, true);
  assert.equal(report.security.secretsSharedAcrossRegions, false);
  assert.equal(report.observability.regionalMetrics, true);
  assert.equal(report.observability.globalAggregation, true);
  assertScore(report.regionalHealthScore, 'report regional health score');
  assertScore(report.availabilityScore, 'report availability score');
  assertScore(report.failoverReadinessScore, 'report failover readiness score');
  assertScore(report.deploymentReadinessScore, 'report deployment readiness score');
  assertScore(report.globalInfrastructureScore, 'report global infrastructure score');
  assert.doesNotMatch(text(report), /ABC private region data|privateNote|hidden-region-secret/i, 'global report must not leak cross-tenant or secret data');

  const denied = svc.RegionRegistry.registerRegion({
    tenantSlug: 'abc',
    regionCode: 'US-WEST',
    privateNote: 'ABC private region data'
  }, ownerContext('tabsons'));
  assert.equal(denied.success, false, 'cross-tenant region registration should be denied');
  assert.equal(denied.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(denied), /ABC private region data|privateNote/i, 'cross-tenant denial must not leak private data');

  const employeeDenied = svc.RegionManager.generateGlobalInfrastructureReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeDenied.success, false, 'employees should not access multi-region governance reports');
  assert.equal(employeeDenied.code, 'MULTI_REGION_GOVERNANCE_DENIED');

  const malformed = svc.RegionRegistry.registerRegion(null, ownerContext());
  assert.equal(malformed.success, false, 'malformed region payload should fail closed');
  assert.equal(malformed.code, 'MALFORMED_REGION_PAYLOAD');

  const frozen = svc.freezeMultiRegionOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'multi-region outputs should be deeply frozen');

  const stored = global.DB.get();
  assert.ok(stored.regionRegistryHistory.length >= 3, 'region registry history should be recorded');
  assert.ok(stored.tenantRegionAssignmentHistory.length >= 1, 'tenant region assignment history should be recorded');
  assert.ok(stored.regionalConfigurationHistory.length >= 1, 'regional configuration history should be recorded');
  assert.ok(stored.failoverPlanHistory.length >= 1, 'failover plan history should be recorded');
  assert.ok(stored.multiRegionDeploymentPlanHistory.length >= 1, 'deployment plan history should be recorded');
  assert.ok(stored.regionalHealthHistory.length >= 1, 'regional health history should be recorded');
  assert.ok(stored.infrastructureTopologyHistory.length >= 1, 'topology history should be recorded');
  assert.ok(stored.multiRegionAnalyticsHistory.length >= 1, 'multi-region analytics history should be recorded');
  assert.ok((stored.auditLogs || []).some(row => /REGION|FAILOVER|MULTI_REGION|GLOBAL_INFRASTRUCTURE/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'multi-region governance should be audited');
  assert.doesNotMatch(text(stored.regionRegistryHistory), /hidden-region-secret|ABC private region data|privateNote/i, 'histories should not persist secrets or cross-tenant private data');

  console.log('multiRegionArchitectureService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
