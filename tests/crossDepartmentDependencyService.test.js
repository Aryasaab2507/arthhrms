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
    style: { setProperty(){}, removeProperty(){} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
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
    origin: 'https://platform.arthhrms.com',
    hostname: 'platform.arthhrms.com',
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

function seedDependencyData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC' }
  ];
  data.crossDepartmentDependencies = [];
  data.dependencyHistory = [];
  data.dependencyGraphHistory = [];
  data.dependencyAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function assertImmutable(value, label) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item, index) => {
      if (item && typeof item === 'object') assert.ok(Object.isFrozen(item), `${label}.${index} should be frozen`);
    });
  }
}

function sampleDependencyPayload() {
  return {
    tenantSlug: 'tabsons',
    dependencies: [
      { tenantSlug: 'tabsons', dependencyId: 'DEP-ORG-HR', dependencyType: 'department', sourceId: 'Leadership', targetId: 'HR', sourceDepartment: 'Leadership', targetDepartment: 'HR', ownerId: 'DIR-1', assigneeId: 'HR-1', state: 'ACTIVE', progressPercent: 70, dueDate: '2026-06-25', critical: true },
      { tenantSlug: 'tabsons', dependencyId: 'DEP-HR-OPS', dependencyType: 'deliverable', sourceId: 'HR', targetId: 'Operations', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'HR-1', assigneeId: 'MGR-1', state: 'BLOCKED', progressPercent: 20, delayDays: 8, dueDate: '2026-06-12', blockerCount: 3, kpiId: 'KPI-OPS' },
      { tenantSlug: 'tabsons', dependencyId: 'DEP-OPS-FIN', dependencyType: 'approval', sourceId: 'Operations', targetId: 'Finance', sourceDepartment: 'Operations', targetDepartment: 'Finance', ownerId: 'MGR-1', assigneeId: 'FIN-1', state: 'DELAYED', progressPercent: 35, delayDays: 5, dueDate: '2026-06-15', approvalId: 'APR-1' },
      { tenantSlug: 'tabsons', dependencyId: 'DEP-FIN-CS', dependencyType: 'project', sourceId: 'Finance', targetId: 'Customer Success', sourceDepartment: 'Finance', targetDepartment: 'Customer Success', ownerId: 'FIN-1', assigneeId: 'CS-1', state: 'AT_RISK', progressPercent: 55, delayDays: 2, dueDate: '2026-06-20', projectId: 'PROJ-1' },
      { tenantSlug: 'tabsons', dependencyId: 'DEP-OKR-KR', dependencyType: 'key_result', sourceId: 'OKR-TEAM-1', targetId: 'KR-TEAM-1', sourceDepartment: 'HR', targetDepartment: 'HR', ownerId: 'MGR-2', assigneeId: 'EMP-1', state: 'NOT_STARTED', progressPercent: 0, dueDate: '2026-07-01' },
      { tenantSlug: 'abc', dependencyId: 'DEP-ABC', dependencyType: 'department', sourceId: 'ABC-HR', targetId: 'ABC-FIN', sourceDepartment: 'HR', targetDepartment: 'Finance', ownerId: 'ABC-1', assigneeId: 'ABC-2', state: 'BLOCKED', salary: 999999, confidentialNote: 'ABC private chain' }
    ],
    relationships: [
      { tenantSlug: 'tabsons', fromDependencyId: 'DEP-ORG-HR', toDependencyId: 'DEP-HR-OPS', relationshipType: 'upstream' },
      { tenantSlug: 'tabsons', fromDependencyId: 'DEP-HR-OPS', toDependencyId: 'DEP-OPS-FIN', relationshipType: 'blocking' },
      { tenantSlug: 'tabsons', fromDependencyId: 'DEP-OPS-FIN', toDependencyId: 'DEP-FIN-CS', relationshipType: 'downstream' },
      { tenantSlug: 'abc', fromDependencyId: 'DEP-ABC', toDependencyId: 'DEP-OTHER', relationshipType: 'hidden' }
    ],
    executionChains: [
      { tenantSlug: 'tabsons', chainId: 'CHAIN-1', departmentPath: ['Leadership', 'HR', 'Operations', 'Finance', 'Customer Success'], dependencyIds: ['DEP-ORG-HR', 'DEP-HR-OPS', 'DEP-OPS-FIN', 'DEP-FIN-CS'], state: 'BLOCKED', delayDays: 11 }
    ],
    aiSignals: {
      riskPredictions: [{ domain: 'dependency_execution', riskLevel: 'HIGH', riskScore: 78, confidenceScore: 74, explanation: 'Blocked HR to Operations dependency is delaying downstream approvals.' }],
      escalationPredictions: [{ domain: 'approval_dependency', escalationLevel: 'HIGH', escalationProbability: 72, urgencyScore: 70, explanation: 'Approval chain age is rising.' }],
      kpiForecasts: [{ domain: 'strategic_kpi', achievementProbability: 61, forecastConfidence: 68, explanation: 'KPI delivery depends on delayed Operations handoff.' }],
      performanceForecasts: [{ domain: 'department_performance', achievementProbability: 64, performanceLevel: 'AT_RISK', explanation: 'Cross-team collaboration delay affects execution velocity.' }]
    },
    analytics: {
      dependencyCompletionRate: 46,
      bottleneckFrequency: 3,
      blockedDependencyTrend: 2,
      crossTeamCollaborationTrend: 66,
      executionChainDelay: 11,
      strategicDependencyHealth: 58
    },
    metadata: {
      source: 'cross-department-test',
      rawPayload: 'salary 999999 confidential tenant data'
    }
  };
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/strategicDependencyService.js',
    'services/advancedOkrService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js',
    'services/organizationPerformanceForecastingService.js'
  ].forEach(load);
  seedDependencyData();

  let loadError = null;
  try {
    load('services/crossDepartmentDependencyService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.CrossDepartmentDependencyService;
  assert.ok(svc, 'CrossDepartmentDependencyService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.createDependency, 'function');
  assert.equal(typeof svc.analyzeCriticalPath, 'function');
  assert.equal(typeof svc.calculateDependencyHealth, 'function');
  assert.equal(typeof svc.buildDependencyGraph, 'function');
  assert.equal(typeof svc.normalizeDependencyPayload, 'function');
  assert.equal(typeof svc.freezeDependencyOutput, 'function');
  assert.equal(global.__ARTHHRMS_CROSS_DEPARTMENT_DEPENDENCY_SELF_TEST__.passed, true, 'development self-test should cover graph, critical path, bottlenecks, AI integration, and immutability');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };

  const malformed = svc.normalizeDependencyPayload('bad payload', directorContext);
  assert.equal(malformed.success, false, 'malformed dependency payload should fail safely');
  assertImmutable(malformed, 'malformed dependency output');

  const normalized = svc.normalizeDependencyPayload(sampleDependencyPayload(), directorContext);
  assert.equal(normalized.success, true, 'dependency payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.dependencies.length, 5, 'cross-tenant dependency records should be filtered');
  assert.equal(normalized.relationships.length, 3, 'cross-tenant relationship records should be filtered');
  assert.ok(normalized.dependencyGraph.edges.length >= 3, 'dependency graph should include relationships');
  assert.ok(normalized.relationshipGraph.nodes.length >= 4, 'relationship graph should include departments');
  assert.ok(normalized.executionGraph.chains.length >= 1, 'execution graph should include chains');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|confidentialNote|rawPayload|ABC private|DEP-ABC|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized dependency output');

  const created = svc.createDependency({
    tenantSlug: 'tabsons',
    dependencyType: 'objective',
    sourceId: 'OBJ-HR-1',
    targetId: 'OBJ-OPS-1',
    sourceDepartment: 'HR',
    targetDepartment: 'Operations',
    ownerId: 'HR-1',
    assigneeId: 'MGR-1',
    state: 'ACTIVE',
    progressPercent: 45
  }, directorContext);
  assert.equal(created.success, true, 'authorized director should create dependency');
  assert.equal(created.dependency.state, 'ACTIVE');
  assert.equal(created.governance.noAutonomousModifications, true);
  assertImmutable(created, 'created dependency output');

  const employeeBlocked = svc.createDependency({
    tenantSlug: 'tabsons',
    dependencyType: 'department',
    sourceDepartment: 'Leadership',
    targetDepartment: 'Finance',
    sourceId: 'Leadership',
    targetId: 'Finance',
    ownerId: 'EMP-1',
    state: 'ACTIVE'
  }, {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons', department: 'HR' }
  });
  assert.equal(employeeBlocked.success, false, 'employee must not create cross-department dependencies outside assigned scope');
  assert.match(employeeBlocked.classification, /UNAUTHORIZED|ROLE|GOVERNANCE|SCOPE/i);

  const platformBlocked = svc.createDependency({
    tenantSlug: 'tabsons',
    dependencyType: 'department',
    sourceDepartment: 'Leadership',
    targetDepartment: 'HR',
    sourceId: 'Leadership',
    targetId: 'HR',
    ownerId: 'PO-1',
    state: 'ACTIVE'
  }, {
    tenantSlug: 'tabsons',
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons', department: 'Platform' }
  });
  assert.equal(platformBlocked.success, false, 'PLATFORM_OWNER must not appear in tenant dependency chains');

  const graph = svc.buildDependencyGraph(sampleDependencyPayload(), directorContext);
  assert.equal(graph.success, true, 'dependency graph should build');
  assert.ok(graph.dependencyGraph.nodes.length >= 5);
  assert.ok(graph.relationshipGraph.edges.length >= 3);
  assert.ok(graph.executionGraph.chains.length >= 1);
  assertImmutable(graph, 'dependency graph output');

  const criticalPath = svc.analyzeCriticalPath(sampleDependencyPayload(), directorContext);
  assert.equal(criticalPath.success, true, 'critical path analysis should run');
  assert.ok(criticalPath.criticalPathScore > 0);
  assert.ok(criticalPath.bottleneckScore > 0);
  assert.ok(criticalPath.blockingChains.length >= 1);
  assert.ok(criticalPath.dependencyHotspots.length >= 1);
  assertImmutable(criticalPath, 'critical path output');

  const health = svc.calculateDependencyHealth(sampleDependencyPayload(), directorContext);
  assert.equal(health.success, true, 'dependency health should calculate');
  assert.ok(health.dependencyHealthScore > 0);
  assert.ok(health.executionDependencyScore > 0);
  assert.ok(health.collaborationScore > 0);
  assertImmutable(health, 'dependency health output');

  const report = svc.generateDependencyIntelligenceReport(sampleDependencyPayload(), directorContext);
  assert.equal(report.success, true, 'dependency intelligence report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.dependencyGraph.edges.length >= 3);
  assert.ok(report.criticalPath.criticalDependencies.length >= 1);
  assert.ok(report.bottleneckAnalysis.bottleneckHotspots.length >= 1);
  assert.ok(report.aiInsights.dependencyRisks.length >= 1);
  assert.ok(report.aiInsights.recommendedActions.length >= 1);
  assert.ok(report.analytics.dependencyCompletionRates >= 0);
  assert.equal(report.governance.aiAdvisoryOnly, true);
  assert.equal(report.governance.noWorkflowModification, true);
  assert.equal(report.governance.noOwnershipChange, true);
  assert.equal(report.governance.noExecutionPlanMutation, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|rawPayload|ABC private|DEP-ABC|abc/i, 'report must not leak confidential or cross-tenant dependency values');
  assertImmutable(report, 'dependency intelligence report');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.dependencyHistory || []).length >= 1, 'dependency history should persist immutably');
  assert.ok((dataAfter.dependencyGraphHistory || []).length >= 1, 'graph history should persist immutably');
  assert.ok((dataAfter.dependencyAnalyticsHistory || []).length >= 1, 'analytics history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /DEPENDENCY/.test(log.actionType || log.eventType || '')), 'audit integration should record dependency actions');

  const crossTenant = svc.generateDependencyIntelligenceReport({ ...sampleDependencyPayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(crossTenant.success, false, 'cross-tenant dependency report should be blocked');
  assert.match(crossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateDependencyIntelligenceReport(sampleDependencyPayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'Operations' }
  });
  assert.equal(managerScoped.success, true, 'manager dependency scope should generate');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_DEPENDENCY_VISIBILITY');
  assert.ok(managerScoped.dependencies.every(row => row.sourceDepartment === 'Operations' || row.targetDepartment === 'Operations' || row.assigneeId === 'MGR-1' || row.ownerId === 'MGR-1'), 'manager scope should not leak unrelated departments');

  const circular = svc.generateDependencyIntelligenceReport({
    tenantSlug: 'tabsons',
    dependencies: [
      { tenantSlug: 'tabsons', dependencyId: 'A', sourceId: 'A', targetId: 'B', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'HR-1', state: 'BLOCKED' },
      { tenantSlug: 'tabsons', dependencyId: 'B', sourceId: 'B', targetId: 'A', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', state: 'BLOCKED' }
    ],
    relationships: [
      { tenantSlug: 'tabsons', fromDependencyId: 'A', toDependencyId: 'B' },
      { tenantSlug: 'tabsons', fromDependencyId: 'B', toDependencyId: 'A' }
    ]
  }, directorContext);
  assert.equal(circular.success, true, 'circular dependencies should not throw');
  assert.equal(circular.edgeCases.circularDependenciesDetected, true);
  assert.ok(circular.dependencyWarnings.length >= 1);

  const orphan = svc.generateDependencyIntelligenceReport({
    tenantSlug: 'tabsons',
    dependencies: [
      { tenantSlug: 'tabsons', dependencyId: 'ORPHAN', sourceId: '', targetId: '', sourceDepartment: '', targetDepartment: '', state: 'ACTIVE' }
    ]
  }, directorContext);
  assert.equal(orphan.success, true, 'orphan dependency should not throw');
  assert.equal(orphan.edgeCases.orphanDependenciesDetected, true);
  assert.ok(orphan.dependencyWarnings.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalStrategic = global.StrategicDependencyService;
  const originalStrategicAlias = global.strategicDependencyService;
  const originalRisk = global.AIRiskPredictionService;
  const originalRiskAlias = global.aiRiskPredictionService;
  const originalKpi = global.AIKPIForecastingService;
  const originalKpiAlias = global.aiKpiForecastingService;
  const originalEsc = global.SmartEscalationPredictionService;
  const originalEscAlias = global.smartEscalationPredictionService;
  const originalPerf = global.OrganizationPerformanceForecastingService;
  const originalPerfAlias = global.organizationPerformanceForecastingService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.StrategicDependencyService;
  delete global.strategicDependencyService;
  delete global.AIRiskPredictionService;
  delete global.aiRiskPredictionService;
  delete global.AIKPIForecastingService;
  delete global.aiKpiForecastingService;
  delete global.SmartEscalationPredictionService;
  delete global.smartEscalationPredictionService;
  delete global.OrganizationPerformanceForecastingService;
  delete global.organizationPerformanceForecastingService;
  const dependencyAbsent = svc.generateDependencyIntelligenceReport(sampleDependencyPayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.strategicDependencyIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiKpiForecastingIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.smartEscalationPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.organizationPerformanceForecastingIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.StrategicDependencyService = originalStrategic;
  global.strategicDependencyService = originalStrategicAlias;
  global.AIRiskPredictionService = originalRisk;
  global.aiRiskPredictionService = originalRiskAlias;
  global.AIKPIForecastingService = originalKpi;
  global.aiKpiForecastingService = originalKpiAlias;
  global.SmartEscalationPredictionService = originalEsc;
  global.smartEscalationPredictionService = originalEscAlias;
  global.OrganizationPerformanceForecastingService = originalPerf;
  global.organizationPerformanceForecastingService = originalPerfAlias;

  console.log('crossDepartmentDependencyService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
