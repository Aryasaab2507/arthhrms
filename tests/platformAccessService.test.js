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
  global.__telemetry = [];
  global.__audits = [];
  global.WorkflowTelemetryService = {
    emitTelemetry(category, eventType, options) {
      global.__telemetry.push({ category, eventType, options });
      return { success: true, emitted: true };
    }
  };
  global.AuditService = {
    recordAudit(event, context) {
      global.__audits.push({ event, context });
      return { success: true, recorded: true };
    }
  };
}

function seedTenantData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TENANT-A',
    companyId: 'TENANT-A',
    companyName: 'Pilot Tenant'
  };
  data.employees = [
    {
      id: 'EMP-A1',
      name: 'Tenant A Employee',
      email: 'a1@example.com',
      role: 'employee',
      tenantId: 'TENANT-A',
      companyId: 'TENANT-A',
      employmentStatus: 'Active',
      activationStatus: 'Active',
      salary: 85000,
      leaveBalance: 14,
      payrollAmount: 85000,
      compensationStructure: { ctc: 1000000 }
    },
    {
      id: 'EMP-B1',
      name: 'Tenant B Employee',
      email: 'b1@example.com',
      role: 'manager',
      tenantId: 'TENANT-B',
      companyId: 'TENANT-B',
      employmentStatus: 'Active',
      activationStatus: 'Pending Activation',
      salary: 92000,
      leaveBalance: 18
    }
  ];
  data.users = [
    { id: 'PO1', name: 'Platform Owner', email: 'owner@example.com', role: 'platform_owner', activationStatus: 'Active' },
    { id: 'SA1', name: 'Tenant Admin', email: 'sa@example.com', role: 'super_admin', tenantId: 'TENANT-A', companyId: 'TENANT-A', activationStatus: 'Active', salary: 1 },
    { id: 'E1', name: 'Tenant User', email: 'user@example.com', role: 'employee', tenantId: 'TENANT-A', companyId: 'TENANT-A', activationStatus: 'Active', leaveBalance: 5 }
  ];
  data.authInvites = [
    { inviteId: 'INV-1', empId: 'EMP-B1', email: 'b1@example.com', tenantId: 'TENANT-B', inviteStatus: 'Invite Sent', activationStatus: 'Invite Sent' }
  ];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/featureFlagValidator.js',
    'services/launchReadinessService.js',
    'services/rlsValidationService.js',
    'services/environmentGovernanceService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/platformAccessService.js'
  ].forEach(load);

  seedTenantData();

  assert.ok(global.PlatformAccessService, 'PlatformAccessService should be exported');

  const route = global.PlatformAccessService.validateGovernanceRoute('platform-control.html');
  assert.equal(route.valid, true, 'platform-control.html must be a valid hidden governance route');
  assert.equal(global.PlatformAccessService.validateGovernanceRoute('ArthHRMS.html').valid, false, 'tenant login must not be treated as governance route');

  const allowed = global.PlatformAccessService.validatePlatformAccess({ role: 'platform_owner', id: 'PO1' }, { pathname: 'platform-control.html' });
  assert.equal(allowed.allowed, true, 'platform owner should access platform-control');
  assert.ok(Object.isFrozen(allowed), 'access validation output should be immutable');

  const previousHref = global.location.href;
  const denied = global.PlatformAccessService.validatePlatformAccess({ role: 'super_admin', id: 'SA1' }, { pathname: 'platform-control.html' });
  assert.equal(denied.allowed, false, 'tenant super admin must not access platform governance console');
  assert.equal(global.location.href, previousHref, 'access validation must never redirect to tenant login');

  const sensitive = global.PlatformAccessService.filterSensitiveTenantData({
    tenantId: 'TENANT-A',
    tenantName: 'Pilot Tenant',
    salary: 100000,
    leaveBalance: 11,
    payrollAmount: 100000,
    compensationStructure: { ctc: 1200000 },
    employees: [{ id: 'EMP-A1', salary: 85000 }]
  });
  assert.equal(sensitive.salary, undefined);
  assert.equal(sensitive.leaveBalance, undefined);
  assert.equal(sensitive.payrollAmount, undefined);
  assert.equal(sensitive.compensationStructure, undefined);
  assert.equal(sensitive.employeeCount, 1, 'employee arrays should become aggregate counts');
  assert.ok(Object.isFrozen(sensitive), 'filtered tenant metadata should be immutable');

  global.OrchestrationMetricsService.recordWorkflowMetric('WORKFLOW_DEGRADED', { reason: 'test' });
  const view = global.PlatformAccessService.normalizeGovernanceView(global.DB.get(), {
    actor: { role: 'platform_owner', id: 'PO1' },
    pathname: 'platform-control.html'
  });
  assert.equal(view.success, true);
  assert.equal(view.access.allowed, true);
  assert.ok(view.tenants.length >= 2, 'view should aggregate tenant metadata');
  assert.ok(view.tenants.every(tenant => tenant.salary === undefined && tenant.leaveBalance === undefined && tenant.payrollAmount === undefined), 'tenant summaries must not expose HR-sensitive data');
  assert.ok(view.tenantRoles.includes('super_admin'), 'tenant roles should remain visible as tenant roles');
  assert.equal(view.tenantRoles.includes('platform_owner'), false, 'platform owner must not appear in tenant role hierarchy');
  assert.ok(view.linkedGovernancePages.some(page => page.href === 'operations-monitoring.html'), 'operations link should be preserved');
  assert.ok(view.linkedGovernancePages.some(page => page.href === 'enterprise-test-lab.html'), 'test lab link should be preserved');
  assert.ok(view.linkedGovernancePages.some(page => page.href === 'qa-validation.html'), 'QA link should be preserved');
  assert.equal(view.monitoring.metricsAvailable, true, 'metrics integration should be visible when service exists');
  assert.ok(Object.isFrozen(view), 'governance view should be immutable');
  assert.ok(Object.isFrozen(view.tenants), 'tenant summary array should be immutable');

  const originalMetrics = global.OrchestrationMetricsService;
  delete global.OrchestrationMetricsService;
  const degraded = global.PlatformAccessService.normalizeGovernanceView(global.DB.get(), {
    actor: { role: 'platform_owner', id: 'PO1' },
    pathname: 'platform-control.html'
  });
  assert.equal(degraded.monitoring.metricsAvailable, false, 'missing metrics dependency should degrade safely');
  global.OrchestrationMetricsService = originalMetrics;

  const recentTelemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(recentTelemetry.some(row => /PLATFORM_ACCESS|PLATFORM_GOVERNANCE_VIEW/.test(row.eventType)), 'platform access should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /PLATFORM_ACCESS/.test(row.actionType || row.action || '')), 'platform access should audit governance access safely');

  console.log('platformAccessService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
