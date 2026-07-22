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

function seedAuditData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    tenantSlug: 'tenant-a',
    companyId: 'TENANT-A',
    companyName: 'Alpha Tenant'
  };
  data.platformTenants = [
    { tenantId: 'TENANT-A', tenantSlug: 'tenant-a', companyName: 'Alpha Tenant', lifecycleState: 'PRODUCTION_ACTIVE' },
    { tenantId: 'TENANT-B', tenantSlug: 'tenant-b', companyName: 'Beta Tenant', lifecycleState: 'DEGRADED' }
  ];
  data.auditLogs = [
    {
      id: 'AUD-ACTIVE',
      auditId: 'AUD-ACTIVE',
      date: '2026-05-30T10:00:00.000Z',
      eventId: 'WF-AUD-1',
      correlationId: 'CORR-AUD-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      actorRole: 'platform_owner',
      actionType: 'GLOBAL_INCIDENT_REPORTED',
      module: 'Global Incident',
      description: 'Incident escalation audit',
      severity: 'HIGH_RISK',
      auditState: 'ESCALATED',
      salary: 90000,
      leaveBalance: 12,
      metadata: { confidentialEmployeeRecord: 'hidden', rawDocumentUrl: 'private://tenant-a/doc.pdf' }
    },
    {
      id: 'AUD-ROLLOUT',
      auditId: 'AUD-ROLLOUT',
      date: '2026-05-30T11:00:00.000Z',
      eventId: 'ROL-AUD-1',
      correlationId: 'CORR-AUD-1',
      tenantId: 'TENANT-B',
      tenantSlug: 'tenant-b',
      actorRole: 'platform_owner',
      actionType: 'FEATURE_ROLLOUT_CHANGED',
      module: 'Feature Rollout',
      description: 'Rollout governance event',
      severity: 'WARNING',
      auditState: 'CORRELATED',
      metadata: { tenantSlug: 'tenant-b', confidentialNote: 'salary cohort issue' }
    },
    {
      id: 'AUD-ARCHIVED',
      auditId: 'AUD-ARCHIVED',
      date: '2026-05-20T10:00:00.000Z',
      eventId: 'ARCH-AUD-1',
      correlationId: 'CORR-ARCH-1',
      tenantId: 'TENANT-A',
      tenantSlug: 'tenant-a',
      actorRole: 'system',
      actionType: 'AUDIT_ARCHIVED',
      module: 'Audit',
      description: 'Archived audit record',
      severity: 'INFO',
      auditState: 'ARCHIVED'
    },
    {
      id: 'AUD-INFRA',
      auditId: 'AUD-INFRA',
      date: '2026-05-31T09:00:00.000Z',
      eventId: 'INFRA-AUD-1',
      correlationId: 'CORR-INFRA-1',
      actionType: 'INFRASTRUCTURE_HEALTH_CHECK_FAILED',
      module: 'Infrastructure Operations',
      source: 'platformRuntime',
      description: 'Tenantless infrastructure audit signal',
      severity: 'WARNING',
      auditState: 'FLAGGED',
      metadata: { nodeId: 'worker-1', rawDocumentUrl: 'private://infra/raw-dump.txt', privatePayload: 'infra secret payload' }
    }
  ];
  data.workflowEvents = [
    { eventId: 'WF-AUD-1', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-A', status: 'FAILED', eventType: 'WORKFLOW_FAILED', module: 'workflow', salary: 80000 },
    { eventId: 'WF-AUD-2', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-B', status: 'BLOCKED', eventType: 'APPROVAL_BLOCKED', module: 'workflow' }
  ];
  data.platformIncidents = [
    { incidentId: 'INC-AUD-1', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', incidentType: 'WORKFLOW_OUTAGE', incidentState: 'ESCALATED', severity: 'HIGH_RISK', durationMinutes: 90 }
  ];
  data.platformHealthRecords = [
    { healthId: 'HLT-AUD-1', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', healthType: 'WORKFLOW_THROUGHPUT', healthState: 'DEGRADED', failureRate: 18, latencyMs: 1800 }
  ];
  data.featureRolloutRecords = [
    { rolloutId: 'ROL-AUD-1', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-B', tenantSlug: 'tenant-b', rolloutState: 'DEGRADED', failureCount: 5, confidentialNote: 'salary cohort issue' }
  ];
  data.escalations = [
    { id: 'ESC-AUD-1', correlationId: 'CORR-AUD-1', tenantId: 'TENANT-A', tenantSlug: 'tenant-a', severity: 'HIGH', status: 'ESCALATED' }
  ];
  data.employees = [
    { id: 'EMP-A1', name: 'Alice Salary', tenantId: 'TENANT-A', salary: 90000, leaveBalance: 12 },
    { id: 'EMP-B1', name: 'Bob Private', tenantId: 'TENANT-B', salary: 70000, leaveBalance: 4 }
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
    'services/globalAuditVisibilityService.js'
  ].forEach(load);

  seedAuditData();

  assert.ok(global.GlobalAuditVisibilityService, 'GlobalAuditVisibilityService should be exported');
  assert.ok(Object.isFrozen(global.GlobalAuditVisibilityService), 'global audit service export must be immutable');
  assert.ok(Object.isFrozen(global.GlobalAuditVisibilityService.AUDIT_STATES), 'audit states must be immutable');
  assert.deepEqual(global.GlobalAuditVisibilityService.AUDIT_STATES, ['RECORDED', 'VERIFIED', 'CORRELATED', 'FLAGGED', 'ESCALATED', 'REVIEWED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_GLOBAL_AUDIT_SELF_TEST__.passed, true, 'development self-test should cover audit governance failure cases');

  const malformed = global.GlobalAuditVisibilityService.normalizeAuditPayload(null, {});
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');

  const normalized = global.GlobalAuditVisibilityService.normalizeAuditPayload({
    auditId: 'AUD-NORM',
    state: 'flagged',
    auditType: 'incident',
    salary: 90000,
    leaveBalance: 12,
    metadata: { rawDocument: 'private://doc', confidentialEmployeeRecord: 'hidden' }
  });
  assert.equal(normalized.success, true, 'audit payload should normalize');
  assert.equal(normalized.payload.auditState, 'FLAGGED');
  assert.equal(normalized.payload.auditType, 'INCIDENT_AUDIT');
  assert.ok(Object.isFrozen(normalized), 'normalized audit output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /90000|"leaveBalance"|private:\/\/doc|hidden/i, 'confidential audit fields must be filtered');

  const ownerScope = global.GlobalAuditVisibilityService.validateAuditScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(ownerScope.allowed, true, 'PLATFORM_OWNER should access isolated audit governance');

  const tenantRoleScope = global.GlobalAuditVisibilityService.validateAuditScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    actor: { role: 'HR', id: 'HR1', tenantId: 'TENANT-A' }
  });
  assert.equal(tenantRoleScope.allowed, false, 'tenant roles must never access global audit visibility');

  const superAdminBlocked = global.GlobalAuditVisibilityService.validateAuditScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminBlocked.allowed, false, 'SUPER_ADMIN must not access broad governance audit analytics');

  const superAdminInfra = global.GlobalAuditVisibilityService.validateAuditScope({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN can access infrastructure-only audit visibility');
  assert.equal(superAdminInfra.visibility, 'INFRASTRUCTURE_AUDIT_VISIBILITY');

  const crossTenantInfra = global.GlobalAuditVisibilityService.validateAuditScope({ infrastructureOnly: true, targetTenantId: 'TENANT-B' }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' }
  });
  assert.equal(crossTenantInfra.allowed, false, 'cross-tenant infrastructure audit scope should be blocked');

  const archivedMutation = global.GlobalAuditVisibilityService.validateAuditScope({ auditState: 'ARCHIVED', auditOverride: true }, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical audit mutation must be blocked after archival');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_AUDIT_MUTATION_BLOCKED'));
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'UNSAFE_AUDIT_OVERRIDE_BLOCKED'));

  assert.equal(global.GlobalAuditVisibilityService.classifyAuditSeverity({ severity: 'critical' }), 'CRITICAL_BLOCKER');
  assert.equal(global.GlobalAuditVisibilityService.classifyAuditSeverity({ escalationCount: 3 }), 'HIGH_RISK');

  const anomalies = global.GlobalAuditVisibilityService.detectGovernanceAnomalies({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(anomalies.success, true, 'governance anomaly detection should generate safely');
  assert.ok(anomalies.auditCorrelationIntelligence.incidentLinkedAudits >= 1, 'incident-linked audits should be detected');
  assert.ok(anomalies.auditCorrelationIntelligence.rolloutLinkedGovernanceEvents >= 1, 'rollout-linked governance should be detected');
  assert.ok(anomalies.auditCorrelationIntelligence.escalationAuditChains >= 1, 'escalation audit chains should be detected');
  assert.ok(Object.isFrozen(anomalies), 'anomaly output should be immutable');

  const report = global.GlobalAuditVisibilityService.generateGlobalAuditReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(report.success, true, 'global audit report should generate');
  assert.ok(report.crossSystemAuditGovernance.governanceEventTracing, 'governance tracing should be represented');
  assert.ok(report.auditCorrelationIntelligence.incidentLinkedAudits >= 1, 'incident audit correlation should integrate');
  assert.ok(report.incidentFeatureIntegration.operationalDegradationCorrelations >= 1, 'health/incident integration should be represented');
  assert.ok(report.auditAnalytics.auditEventFrequency >= 1, 'audit analytics should count events');
  assert.equal(report.accessGovernance.salaryVisibility, false, 'salary visibility must be blocked');
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false, 'leave balance visibility must be blocked');
  assert.equal(report.accessGovernance.platformIsolationPreserved, true, 'platform isolation must be preserved');
  assert.doesNotMatch(JSON.stringify(report), /90000|80000|70000|"leaveBalance"|Alice Salary|Bob Private|private:\/\/tenant-a|salary cohort|private payroll|rawDocument/i, 'global audit report must not expose confidential tenant data');

  const infraReport = global.GlobalAuditVisibilityService.generateGlobalAuditReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'super_admin', id: 'SA1', tenantId: 'TENANT-A' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(infraReport.success, true, 'infrastructure-only audit report should generate for SUPER_ADMIN');
  assert.ok(infraReport.auditSummaries.length >= 1, 'SUPER_ADMIN infrastructure view should include tenantless infrastructure audit rows');
  assert.ok(infraReport.auditSummaries.every(row => !row.tenantSlug && !row.tenantId), 'SUPER_ADMIN infrastructure view must not expose tenant audit rows');
  assert.equal(infraReport.accessGovernance.superAdminHrPayrollVisibility, false, 'SUPER_ADMIN must not gain HR/payroll visibility');
  assert.doesNotMatch(JSON.stringify(infraReport), /TENANT-A|TENANT-B|tenant-a|tenant-b|90000|70000|private:\/\/infra|infra secret|raw-dump/i, 'infrastructure audit view must not expose tenant or raw infrastructure payloads');

  const frozen = global.GlobalAuditVisibilityService.freezeAuditOutput({ nested: { ok: true }, salary: 90000 });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'freezeAuditOutput should deep-freeze outputs');
  assert.doesNotMatch(JSON.stringify(frozen), /90000|salary/i, 'freezeAuditOutput should filter confidential fields');

  const savedIncident = global.GlobalIncidentService;
  const savedHealth = global.PlatformHealthMonitoringService;
  const savedRollout = global.FeatureRolloutService;
  delete global.GlobalIncidentService;
  delete global.globalIncidentService;
  delete global.PlatformHealthMonitoringService;
  delete global.platformHealthMonitoringService;
  delete global.FeatureRolloutService;
  delete global.featureRolloutService;
  const dependencyAbsentReport = global.GlobalAuditVisibilityService.generateGlobalAuditReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsentReport.success, true, 'optional dependency absence should degrade safely');
  assert.equal(dependencyAbsentReport.integrationHealth.globalIncidentIntegrated, false, 'missing incident integration should be reflected');
  assert.equal(dependencyAbsentReport.integrationHealth.platformHealthIntegrated, false, 'missing health integration should be reflected');
  assert.equal(dependencyAbsentReport.integrationHealth.featureRolloutIntegrated, false, 'missing rollout integration should be reflected');
  global.GlobalIncidentService = savedIncident;
  global.globalIncidentService = savedIncident;
  global.PlatformHealthMonitoringService = savedHealth;
  global.platformHealthMonitoringService = savedHealth;
  global.FeatureRolloutService = savedRollout;
  global.featureRolloutService = savedRollout;

  const audited = global.GlobalAuditVisibilityService.generateGlobalAuditReport({}, {
    routeType: 'platform',
    actor: { role: 'platform_owner', id: 'PO1' }
  });
  assert.equal(audited.success, true, 'audited global audit report should still generate');
  const latest = global.DB.get();
  assert.ok((latest.auditLogs || []).some(row => /GLOBAL_AUDIT/i.test(row.action || row.actionType || row.eventType || row.description || '')), 'audit visibility access should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /GLOBAL_AUDIT/i.test(row.eventType || row.category || '')), 'audit governance should emit telemetry');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.GLOBAL_AUDIT_REPORTED, 'audit governance should emit metrics');

  console.log('globalAuditVisibilityService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
