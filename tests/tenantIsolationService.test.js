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
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
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

function seedIsolationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    companyId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'CREATED' }
  ];
  data.employees = [
    { id: 'EMP-T1', empId: 'EMP-T1', name: 'Tenant One', email: 'one@tabsons.test', role: 'employee', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', salary: 999999, leaveBalance: 42 },
    { id: 'EMP-T2', empId: 'EMP-T2', name: 'Tenant Manager', email: 'manager@tabsons.test', role: 'manager', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { id: 'EMP-A1', empId: 'EMP-A1', name: 'Other Tenant', email: 'one@abc.test', role: 'employee', tenantId: 'TEN-abc', tenantSlug: 'abc' },
    { id: 'PO-1', empId: 'PO-1', name: 'Platform Owner', email: 'owner@arthhrms.test', role: 'platform_owner', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' }
  ];
  data.authInvites = [
    { inviteId: 'INV-T1', email: 'new@tabsons.test', role: 'employee', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { inviteId: 'INV-A1', email: 'new@abc.test', role: 'employee', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-T1', type: 'LEAVE_APPROVED', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { eventId: 'WF-A1', type: 'PAYROLL_GENERATED', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.pendingActions = [
    { id: 'PA-T1', title: 'Review leave', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { id: 'PA-A1', title: 'Review payroll', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.strategicDeliverables = [
    { id: 'DEL-T1', deliverableId: 'DEL-T1', title: 'Tenant strategy', tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { id: 'DEL-A1', deliverableId: 'DEL-A1', title: 'Other strategy', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-A1', deliverableId: 'DEL-A1', reviewerId: 'EMP-A1', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.escalations = [
    { id: 'ESC-A1', escalationType: 'SLA_BREACH', tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantProvisioningService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/tenantIsolationService.js');

  seedIsolationData();

  const svc = global.TenantIsolationService;
  assert.ok(svc, 'TenantIsolationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.SEVERITIES), 'severity constants must be immutable');
  assert.equal(global.__ARTHHRMS_TENANT_ISOLATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  const routeOk = svc.validateTenantRouting('tabsons.arthhrms.com', { tenantSlug: 'tabsons' });
  assert.equal(routeOk.passed, true, 'matching tenant subdomain should validate');
  assert.ok(Object.isFrozen(routeOk), 'routing output should be immutable');

  const routeMismatch = svc.validateTenantRouting('tabsons.arthhrms.com', { tenantSlug: 'abc' });
  assert.equal(routeMismatch.passed, false, 'mismatched tenant subdomain should fail');
  assert.ok(routeMismatch.failures.some(item => item.failureCode === 'TENANT_ROUTING_MISMATCH' && item.severity === 'CRITICAL_BLOCKER'));

  const boundary = svc.validateTenantBoundary({ id: 'EMP-A1', tenantId: 'TEN-abc', tenantSlug: 'abc', sourceType: 'employee' }, { tenantSlug: 'tabsons' });
  assert.equal(boundary.passed, false, 'cross-tenant employee record should fail boundary validation');
  assert.ok(boundary.failures.some(item => item.failureCode === 'CROSS_TENANT_BOUNDARY_VIOLATION' && item.severity === 'CRITICAL_BLOCKER'));

  const platformOwner = svc.validateTenantBoundary({ id: 'PO-1', role: 'platform_owner', tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(platformOwner.passed, false, 'PLATFORM_OWNER must not appear in tenant hierarchy');
  assert.ok(platformOwner.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_HIERARCHY_VIOLATION'));

  const dataBefore = JSON.stringify({
    employees: global.DB.get().employees,
    authInvites: global.DB.get().authInvites,
    workflowEvents: global.DB.get().workflowEvents,
    pendingActions: global.DB.get().pendingActions,
    strategicDeliverables: global.DB.get().strategicDeliverables,
    deliverableReviews: global.DB.get().deliverableReviews,
    escalations: global.DB.get().escalations
  });
  const report = svc.generateTenantIsolationReport({
    tenantSlug: 'tabsons',
    hostname: 'tabsons.arthhrms.com',
    records: global.DB.get()
  }, { actor: { role: 'platform_owner', id: 'PO-1' } });
  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    authInvites: global.DB.get().authInvites,
    workflowEvents: global.DB.get().workflowEvents,
    pendingActions: global.DB.get().pendingActions,
    strategicDeliverables: global.DB.get().strategicDeliverables,
    deliverableReviews: global.DB.get().deliverableReviews,
    escalations: global.DB.get().escalations
  }), dataBefore, 'tenant isolation validation must not mutate tenant-owned records');
  assert.equal(report.success, true, 'report generation should complete safely');
  assert.equal(report.passed, false, 'seeded cross-tenant records should block isolation report');
  assert.ok(report.failures.some(item => item.failureCode === 'CROSS_TENANT_BOUNDARY_VIOLATION' && item.severity === 'CRITICAL_BLOCKER'));
  assert.ok(report.sections.some(section => section.validationType === 'WORKFLOW_ISOLATION' && section.passed === false), 'workflow isolation should be validated');
  assert.ok(report.sections.some(section => section.validationType === 'ONBOARDING_ISOLATION' && section.passed === false), 'onboarding isolation should be validated');
  assert.ok(report.sections.some(section => section.validationType === 'STRATEGIC_GOVERNANCE_ISOLATION' && section.passed === false), 'strategic isolation should be validated');
  assert.doesNotMatch(JSON.stringify(report), /999999|leaveBalance|salary|payrollAmount/i, 'reports must not expose sensitive HR data');
  assert.ok(Object.isFrozen(report), 'report output should be immutable');
  assert.ok(Object.isFrozen(report.failures), 'report failures should be immutable');

  const cleanReport = svc.generateTenantIsolationReport({
    tenantSlug: 'tabsons',
    hostname: 'tabsons.arthhrms.com',
    records: {
      employees: [{ id: 'EMP-T1', role: 'employee', tenantSlug: 'tabsons' }],
      workflowEvents: [{ eventId: 'WF-T1', tenantSlug: 'tabsons' }],
      authInvites: [{ inviteId: 'INV-T1', tenantSlug: 'tabsons' }],
      strategicDeliverables: [{ id: 'DEL-T1', tenantSlug: 'tabsons' }]
    }
  }, { skipAuditPersistence: true });
  assert.equal(cleanReport.passed, true, 'single-tenant sanitized records should pass isolation');

  const malformed = svc.generateTenantIsolationReport('bad-input');
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.passed, false, 'malformed payloads should not silently pass readiness');

  const telemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(telemetry.some(row => /TENANT_ISOLATION/.test(row.eventType)), 'isolation validation should emit telemetry safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.TENANT_ISOLATION_VALIDATED, 'isolation validation should aggregate metrics safely');
  assert.ok(global.DB.getAuditLogs().some(row => /TENANT_ISOLATION/.test(row.actionType || row.action || '')), 'isolation failures should be audited safely');

  console.log('tenantIsolationService.test.js passed');
}

main();
