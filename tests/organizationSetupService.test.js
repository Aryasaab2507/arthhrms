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
    pathname: '/setup.html',
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

function seedTenantData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    companyName: 'Existing Company',
    tenantId: 'existing-company',
    companyId: 'existing-company'
  };
  data.employees = [
    { id: 'EMP001', empId: 'EMP001', name: 'Existing Employee', tenantSlug: 'existing-company', tenantId: 'existing-company', companyId: 'existing-company', role: 'employee' }
  ];
  data.platformTenants = [
    {
      tenantId: 'TEN-existing-company',
      companyName: 'Existing Company',
      tenantSlug: 'existing-company',
      subdomain: 'existing-company.arthhrms.com',
      lifecycleState: 'CREATED',
      onboardingStage: 'setup_only'
    }
  ];
  global.DB.save(data);
}

function validSetup(overrides = {}) {
  return {
    tenant_slug: 'existing-company',
    company_profile: {
      company_name: 'Existing Company',
      company_email: 'admin@existing.example',
      company_phone: '+91 90000 00000',
      timezone: 'Asia/Kolkata',
      country: 'India',
      working_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      fiscal_year: 'APR-MAR',
      default_currency: 'INR'
    },
    departments: ['HR', 'Operations', 'Finance', 'Engineering', 'Management'],
    role_matrix: ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN'],
    manager_structure: [
      { employee_id: 'EMP001', manager_id: 'MGR001', tenant_slug: 'existing-company' }
    ],
    policies: {
      leave_policy: 'standard',
      attendance_policy: 'standard',
      holiday_policy: 'india',
      working_hours: '09:30-18:30',
      onboarding_defaults: 'invite_required'
    },
    features: {
      attendance: true,
      payroll: false,
      strategic_deliverables: true,
      expense_management: true,
      onboarding_workflows: true
    },
    pilot: {
      pilot_employee_count: 25,
      pilot_departments: ['HR', 'Operations'],
      staged_onboarding: true,
      activation_stage: 'pilot_group'
    },
    ...overrides
  };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantProvisioningService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/organizationSetupService.js');

  seedTenantData();

  assert.ok(global.OrganizationSetupService, 'OrganizationSetupService should be exported');
  assert.ok(Object.isFrozen(global.OrganizationSetupService), 'service export must be frozen');
  assert.ok(Object.isFrozen(global.OrganizationSetupService.SETUP_STAGES), 'setup stages must be immutable');
  assert.equal(global.__ARTHHRMS_ORGANIZATION_SETUP_SELF_TEST__.passed, true, 'development self-test should pass');

  const beforeData = JSON.stringify({
    companySettings: global.DB.get().companySettings,
    employees: global.DB.get().employees,
    platformTenants: global.DB.get().platformTenants
  });

  const duplicateDepartments = global.OrganizationSetupService.normalizeDepartmentStructure(['HR', 'hr']);
  assert.equal(duplicateDepartments.valid, false, 'duplicate departments should be blocked');
  assert.ok(duplicateDepartments.failures.some(item => item.failureCode === 'DUPLICATE_DEPARTMENT'));

  const platformOwnerRole = global.OrganizationSetupService.validateOrganizationSetup(validSetup({
    role_matrix: ['EMPLOYEE', 'PLATFORM_OWNER']
  }), { actor: { role: 'super_admin', tenantSlug: 'existing-company' } });
  assert.equal(platformOwnerRole.passed, false, 'platform owner role must be blocked from setup');
  assert.ok(platformOwnerRole.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ROLE_BLOCKED'));

  const platformOwnerActor = global.OrganizationSetupService.saveOrganizationSetup(validSetup(), {
    actor: { role: 'platform_owner', id: 'PO1', tenantSlug: 'platform' }
  });
  assert.equal(platformOwnerActor.success, false, 'platform owner must not perform tenant setup');
  assert.ok(platformOwnerActor.failures.some(item => item.failureCode === 'PLATFORM_OWNER_SETUP_BLOCKED'));

  const crossTenant = global.OrganizationSetupService.saveOrganizationSetup(validSetup(), {
    actor: { role: 'super_admin', id: 'SA1', tenantSlug: 'other-company' }
  });
  assert.equal(crossTenant.success, false, 'cross-tenant setup must be blocked');
  assert.ok(crossTenant.failures.some(item => item.failureCode === 'CROSS_TENANT_SETUP_BLOCKED'));

  const circular = global.OrganizationSetupService.validateManagerHierarchy([
    { employee_id: 'A', manager_id: 'B', tenant_slug: 'existing-company' },
    { employee_id: 'B', manager_id: 'A', tenant_slug: 'existing-company' }
  ], { tenantSlug: 'existing-company' });
  assert.equal(circular.valid, false, 'circular manager chains must be blocked');
  assert.ok(circular.failures.some(item => item.failureCode === 'CIRCULAR_MANAGER_CHAIN'));

  const readinessBlocked = global.OrganizationSetupService.classifyActivationReadiness(validSetup({
    departments: ['HR'],
    role_matrix: ['EMPLOYEE', 'MANAGER'],
    pilot: { activation_stage: 'full_activation', staged_onboarding: false }
  }));
  assert.equal(readinessBlocked.ready, false, 'unsafe activation should be blocked');
  assert.ok(readinessBlocked.failures.some(item => item.failureCode === 'UNSAFE_FULL_ACTIVATION_BLOCKED'));

  const saved = global.OrganizationSetupService.saveOrganizationSetup(validSetup(), {
    actor: { role: 'super_admin', id: 'SA1', tenantSlug: 'existing-company' }
  });
  assert.equal(saved.success, true, 'tenant setup should save for same-tenant super admin');
  assert.equal(saved.setup.tenantSlug, 'existing-company');
  assert.equal(saved.setup.currentStage, 'ACTIVATION_READY');
  assert.equal(saved.setup.roleMatrix.includes('PLATFORM_OWNER'), false);
  assert.ok(Object.isFrozen(saved), 'saved output should be immutable');

  assert.equal(JSON.stringify({
    companySettings: global.DB.get().companySettings,
    employees: global.DB.get().employees,
    platformTenants: global.DB.get().platformTenants
  }), beforeData, 'existing company, employee, and tenant provisioning records must not be mutated');

  const view = global.OrganizationSetupService.getSetupGovernanceView({
    actor: { role: 'platform_owner', id: 'PO1' },
    readOnly: true
  });
  assert.equal(view.success, true);
  assert.ok(view.setups.some(item => item.tenantSlug === 'existing-company'));
  assert.ok(Object.isFrozen(view.setups), 'governance view arrays must be immutable');

  const recentTelemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(recentTelemetry.some(row => /ORGANIZATION_SETUP/.test(row.eventType)), 'organization setup should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ORGANIZATION_SETUP/.test(row.actionType || row.action || '')), 'organization setup should audit actions safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ORGANIZATION_SETUP_SAVED, 'organization setup should aggregate metrics safely');

  console.log('organizationSetupService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
