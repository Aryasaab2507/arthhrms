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

function seedExistingCompanyData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    companyName: 'Existing Company',
    tenantId: 'existing-company',
    companyId: 'existing-company'
  };
  data.employees = [
    { id: 'EMP001', empId: 'EMP001', name: 'Existing Employee', tenantId: 'existing-company', companyId: 'existing-company', role: 'employee' }
  ];
  data.platformTenants = [
    {
      tenantId: 'TEN-existing-company',
      companyName: 'Existing Company',
      tenantSlug: 'existing-company',
      subdomain: 'existing-company.arthhrms.com',
      lifecycleState: 'PILOT_ACTIVE',
      onboardingStage: 'pilot_group'
    }
  ];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/tenantProvisioningService.js');

  seedExistingCompanyData();

  assert.ok(global.TenantProvisioningService, 'TenantProvisioningService should be exported');
  assert.ok(Object.isFrozen(global.TenantProvisioningService), 'service export must be frozen');
  assert.ok(Object.isFrozen(global.TenantProvisioningService.TENANT_LIFECYCLE), 'tenant lifecycle constants must be immutable');
  assert.equal(global.__ARTHHRMS_TENANT_PROVISIONING_SELF_TEST__.passed, true, 'development self-test should pass');

  const normalized = global.TenantProvisioningService.normalizeTenantSlug('  Tabsons Pvt. Ltd! ');
  assert.equal(normalized, 'tabsons-pvt-ltd', 'tenant slug should be routing-safe');

  const reserved = global.TenantProvisioningService.validateTenantSlug('platform');
  assert.equal(reserved.valid, false, 'reserved platform slug should be blocked');
  assert.ok(reserved.failures.some(item => item.failureCode === 'RESERVED_TENANT_SLUG'));

  const collision = global.TenantProvisioningService.validateTenantSlug('existing-company');
  assert.equal(collision.valid, false, 'duplicate tenant slug should be blocked');
  assert.ok(collision.failures.some(item => item.failureCode === 'TENANT_SLUG_COLLISION'));

  const route = global.TenantProvisioningService.extractTenantFromHostname('tabsons.arthhrms.com');
  assert.equal(route.tenantSlug, 'tabsons');
  assert.equal(route.subdomain, 'tabsons.arthhrms.com');
  assert.ok(Object.isFrozen(route), 'routing extraction output should be immutable');

  const ownerOnly = global.TenantProvisioningService.provisionTenant({
    company_name: 'Delta Systems',
    tenant_slug: 'delta',
    company_email: 'admin@delta.example',
    company_phone: '+91 90000 00000',
    company_size: '200',
    onboarding_stage: 'setup_only',
    plan_type: 'enterprise',
    timezone: 'Asia/Kolkata',
    country: 'India'
  }, { actor: { role: 'super_admin', id: 'SA1' } });
  assert.equal(ownerOnly.success, false, 'tenant super admin must not create tenants');
  assert.ok(ownerOnly.failures.some(item => item.failureCode === 'PLATFORM_OWNER_REQUIRED'));

  const beforeData = JSON.stringify({
    companySettings: global.DB.get().companySettings,
    employees: global.DB.get().employees
  });
  const created = global.TenantProvisioningService.provisionTenant({
    company_name: 'Delta Systems',
    tenant_slug: 'delta',
    company_email: 'admin@delta.example',
    company_phone: '+91 90000 00000',
    company_size: '200',
    onboarding_stage: 'setup_only',
    plan_type: 'enterprise',
    timezone: 'Asia/Kolkata',
    country: 'India'
  }, { actor: { role: 'platform_owner', id: 'PO1', name: 'Platform Owner' } });
  assert.equal(created.success, true, 'platform owner should create tenant');
  assert.equal(created.tenant.tenantSlug, 'delta');
  assert.equal(created.tenant.subdomain, 'delta.arthhrms.com');
  assert.deepEqual(created.tenant.departments, ['HR', 'Operations', 'Finance', 'Engineering', 'Management']);
  assert.equal(created.tenant.roleMatrix.includes('PLATFORM_OWNER'), false, 'platform owner must be excluded from tenant role matrix');
  assert.equal(created.tenant.lifecycleState, 'CREATED');
  assert.ok(Object.isFrozen(created), 'provisioning output must be immutable');
  assert.equal(JSON.stringify({
    companySettings: global.DB.get().companySettings,
    employees: global.DB.get().employees
  }), beforeData, 'existing company and employee data must not be mutated');

  const fullActivation = global.TenantProvisioningService.updateTenantActivation('delta', {
    onboarding_stage: 'full_activation',
    lifecycleState: 'PRODUCTION_ACTIVE'
  }, { actor: { role: 'platform_owner', id: 'PO1' }, readiness: { passed: false } });
  assert.equal(fullActivation.success, false, 'unsafe full activation should be blocked');
  assert.ok(fullActivation.failures.some(item => item.failureCode === 'UNSAFE_FULL_ACTIVATION_BLOCKED'));

  const visible = global.TenantProvisioningService.getTenantProvisioningView({ actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(visible.success, true);
  assert.ok(visible.tenants.some(item => item.tenantSlug === 'delta'));
  assert.ok(visible.tenants.every(item => !item.roleMatrix.includes('PLATFORM_OWNER')));
  assert.ok(Object.isFrozen(visible.tenants), 'tenant view must be immutable');

  const recentTelemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(recentTelemetry.some(row => /TENANT_PROVISIONING/.test(row.eventType)), 'tenant provisioning should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /TENANT_PROVISIONING/.test(row.actionType || row.action || '')), 'tenant provisioning should audit actions safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.TENANT_PROVISIONING_CREATED, 'tenant provisioning should aggregate metrics safely');

  console.log('tenantProvisioningService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
