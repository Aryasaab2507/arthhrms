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
  global.navigator = { userAgent: 'Node enterprise organization setup wizard test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://setup.arthhrms.com',
    hostname: 'setup.arthhrms.com',
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

function seedCleanInstall() {
  global.DB.migrate();
  const data = global.DB.getCleanInstallData ? global.DB.getCleanInstallData() : global.DB.get();
  data.users = [];
  data.employees = [
    { id: 'EMP001', empId: 'EMP001', name: 'Existing Employee', tenantSlug: 'existing-company', role: 'employee' }
  ];
  data.attendance = [{ empId: 'EMP001', tenantSlug: 'existing-company', status: 'Present' }];
  data.leaveRequests = [{ id: 'LV001', empId: 'EMP001', tenantSlug: 'existing-company', status: 'Pending' }];
  data.payroll = [{ id: 'PAY001', empId: 'EMP001', tenantSlug: 'existing-company', status: 'Draft' }];
  data.platformTenants = [
    { tenantId: 'TEN-existing-company', tenantSlug: 'existing-company', companyName: 'Existing Company' }
  ];
  data.organizationSetups = {};
  data.enterpriseOrganizationSetupDrafts = [];
  data.enterpriseOrganizationProvisioningHistory = [];
  data.enterpriseOrganizationSetupAuditHistory = [];
  data.auditLogs = [];
  data.installState = { ...(data.installState || {}), setupCompleted: false };
  global.DB.save(data);
}

function validOrganizationInfo(overrides = {}) {
  return {
    companyName: 'Tabsons Manufacturing',
    legalName: 'Tabsons Manufacturing Private Limited',
    organizationCode: 'TABSONS',
    industry: 'Manufacturing',
    companySize: '10000+',
    registrationNumber: 'REG-2026-001',
    taxId: 'TAX-2026-001',
    website: 'https://tabsons.example',
    timeZone: 'Asia/Kolkata',
    currency: 'INR',
    language: 'en',
    fiscalYearStart: '04-01',
    logoUpload: { name: 'logo.png', size: 12000, type: 'image/png' },
    ...overrides
  };
}

function completeDraft() {
  return {
    draftId: 'DRAFT-tabsons',
    organizationInformation: validOrganizationInfo(),
    organizationStructure: {
      headOffice: { name: 'Mumbai HQ', locationCode: 'MUM-HQ' },
      branches: [{ name: 'Pune Branch', code: 'PUN' }],
      businessUnits: [{ name: 'Manufacturing', code: 'MFG' }],
      departments: [{ name: 'HR', code: 'HR' }, { name: 'Operations', code: 'OPS' }],
      costCenters: [{ name: 'Plant 1', code: 'CC-PLANT-1' }],
      locations: [{ name: 'Mumbai', code: 'MUM' }]
    },
    workingConfiguration: {
      workWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      officeHours: { start: '09:30', end: '18:30' },
      timeZone: 'Asia/Kolkata',
      shiftStrategy: 'STANDARD',
      attendanceMode: 'WEB_MOBILE',
      weekendRules: { saturday: 'OFF', sunday: 'OFF' },
      publicHolidays: [{ name: 'Republic Day', date: '2026-01-26' }]
    },
    leaveConfiguration: {
      leaveTypes: [{ name: 'Casual Leave', code: 'CL', annualAllowance: 12 }],
      accrualRules: { frequency: 'MONTHLY' },
      carryForward: { enabled: true, maxDays: 12 },
      encashment: { enabled: false },
      approvalRules: { approvers: ['MANAGER', 'HR'] }
    },
    payrollConfiguration: {
      payrollFrequency: 'MONTHLY',
      salaryStructure: 'STANDARD',
      components: [{ name: 'Basic', type: 'EARNING' }],
      taxConfiguration: { regime: 'INDIA_OLD_NEW' },
      paymentCycle: { day: 30 }
    },
    identitySecurity: {
      authenticationMethod: 'LOCAL_AND_SSO',
      passwordPolicy: { minLength: 12, requireMfaForAdmins: true },
      mfa: true,
      sessionTimeoutMinutes: 30,
      sso: { enabled: false }
    },
    notifications: {
      email: { enabled: true },
      sms: { enabled: false },
      pushNotifications: { enabled: true },
      reminderRules: [{ event: 'LEAVE_APPROVAL', hoursBefore: 24 }]
    },
    administrator: {
      name: 'Arya Admin',
      email: 'arya.admin@tabsons.example',
      phone: '+91 90000 00000',
      role: 'super_admin',
      mfa: true
    }
  };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantProvisioningService.js',
    'services/organizationSetupService.js',
    'services/organizationInitializationWizardService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/enterpriseOrganizationSetupWizardService.js');

  seedCleanInstall();

  const service = global.EnterpriseOrganizationSetupWizardService;
  assert.ok(service, 'EnterpriseOrganizationSetupWizardService should be exported');
  assert.equal(global.enterpriseOrganizationSetupWizardService, service, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(service), 'service export must be frozen');
  assert.ok(Object.isFrozen(service.OrganizationSetupWizard), 'wizard helper must be frozen');
  assert.ok(Object.isFrozen(service.OrganizationSetupValidator), 'validator helper must be frozen');
  assert.ok(Object.isFrozen(service.TenantProvisioningOrchestrator), 'provisioning helper must be frozen');
  assert.equal(global.__ARTHHRMS_ENTERPRISE_ORG_SETUP_WIZARD_SELF_TEST__.passed, true, 'development self-test should pass');

  assert.deepEqual(service.WIZARD_STEPS.map(step => step.key), [
    'organizationInformation',
    'organizationStructure',
    'workingConfiguration',
    'leaveConfiguration',
    'payrollConfiguration',
    'identitySecurity',
    'notifications',
    'administrator',
    'review',
    'provisionTenant'
  ], 'wizard must expose the required ten-step enterprise setup flow');

  const invalidInfo = service.validateStep({
    stepKey: 'organizationInformation',
    values: validOrganizationInfo({ companyName: '', legalName: '', organizationCode: '' })
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(invalidInfo.valid, false, 'required organization fields should be validated');
  assert.ok(invalidInfo.inlineErrors.companyName, 'company name should have inline error');
  assert.ok(invalidInfo.inlineErrors.legalName, 'legal name should have inline error');
  assert.ok(invalidInfo.inlineErrors.organizationCode, 'organization code should have inline error');

  const duplicate = service.validateStep({
    stepKey: 'organizationInformation',
    values: validOrganizationInfo({ organizationCode: 'existing-company' })
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(duplicate.valid, false, 'duplicate organization code should be blocked');
  assert.ok(duplicate.failures.some(item => item.code === 'DUPLICATE_ORGANIZATION_CODE'));

  const imported = service.OrganizationStructureImporter.importFromRows([
    { Type: 'Branch', Name: 'Mumbai HQ', Code: 'MUM' },
    { Type: 'Department', Name: 'HR', Code: 'HR' },
    { Type: 'Department', Name: 'HR', Code: 'HR' },
    { Type: 'Cost Center', Name: 'Factory', Code: 'FACT' },
    { Type: 'Location', Name: 'Pune', Code: 'PUN' },
    { Type: 'Business Unit', Name: 'Manufacturing', Code: 'MFG' }
  ], { tenantSlug: 'tabsons' });
  assert.equal(imported.success, true, 'Excel-like organization import should recover safely');
  assert.equal(imported.structure.departments.length, 1, 'duplicate imported departments should be de-duplicated');
  assert.ok(imported.warnings.some(item => item.code === 'DUPLICATE_STRUCTURE_ROW'));
  assert.ok(Object.isFrozen(imported.structure.departments), 'import output should be immutable');

  const draft = completeDraft();
  for (const stepKey of [
    'organizationInformation',
    'organizationStructure',
    'workingConfiguration',
    'leaveConfiguration',
    'payrollConfiguration',
    'identitySecurity',
    'notifications',
    'administrator'
  ]) {
    const validation = service.validateStep({
      stepKey,
      values: draft[stepKey]
    }, { actor: { role: 'platform_owner', id: 'PO1' } });
    assert.equal(validation.valid, true, `${stepKey} should accept a production-valid payload`);
  }
  for (const stepKey of ['review', 'provisionTenant']) {
    const validation = service.validateStep({
      stepKey,
      values: draft
    }, { actor: { role: 'platform_owner', id: 'PO1' } });
    assert.equal(validation.valid, true, `${stepKey} should accept the complete ten-step draft`);
  }

  const invalidSteps = [
    ['organizationStructure', { headOffice: {}, departments: [] }],
    ['workingConfiguration', { ...draft.workingConfiguration, officeHours: { start: '09:00', end: '09:00' } }],
    ['leaveConfiguration', { ...draft.leaveConfiguration, approvalRules: { approvers: [] } }],
    ['payrollConfiguration', { ...draft.payrollConfiguration, paymentCycle: { day: 32 } }],
    ['identitySecurity', { ...draft.identitySecurity, passwordPolicy: { minLength: 8 } }],
    ['notifications', { ...draft.notifications, reminderRules: [{ event: '', hoursBefore: -1 }] }],
    ['administrator', { ...draft.administrator, email: 'invalid-email' }]
  ];
  for (const [stepKey, values] of invalidSteps) {
    const validation = service.validateStep({
      stepKey,
      values
    }, { actor: { role: 'platform_owner', id: 'PO1' } });
    assert.equal(validation.valid, false, `${stepKey} should reject an invalid payload`);
  }

  const saved = service.saveStepDraft({
    draftId: draft.draftId,
    stepKey: 'organizationInformation',
    values: draft.organizationInformation,
    draft
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(saved.success, true, 'step progress should save');
  assert.equal(saved.draft.status, 'DRAFT');
  assert.ok(saved.draft.resumeToken, 'saved draft should include resume token');
  assert.ok(Object.isFrozen(saved), 'draft save output must be immutable');

  const resumed = service.resumeDraft({ draftId: draft.draftId }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(resumed.success, true, 'saved setup should resume later');
  assert.equal(resumed.draft.organizationInformation.companyName, 'Tabsons Manufacturing');

  const review = service.generateReviewSummary(draft, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(review.success, true, 'review summary should generate');
  assert.equal(review.readyToProvision, true, 'complete draft should be provision-ready');
  assert.equal(review.missingRequiredFields.length, 0);
  assert.ok(review.configurationSummary.some(item => item.stepKey === 'payrollConfiguration'));

  const incompleteReview = service.generateReviewSummary({
    ...draft,
    leaveConfiguration: { leaveTypes: [] },
    administrator: { ...draft.administrator, email: '' }
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(incompleteReview.readyToProvision, false, 'review should highlight missing and invalid setup');
  assert.ok(incompleteReview.missingRequiredFields.length > 0 || incompleteReview.validationErrors.length > 0);

  const beforeHrData = JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  });
  const previousSetupService = global.OrganizationSetupService;
  const previousInitializationService = global.OrganizationInitializationWizardService;
  const previousProvisioningService = global.TenantProvisioningService;

  const provisioned = service.provisionTenant(draft, {
    actor: { role: 'platform_owner', id: 'PO1', email: 'owner@tabsons.example' }
  });
  assert.equal(provisioned.success, true, 'complete wizard draft should provision tenant');
  assert.equal(provisioned.tenant.tenantSlug, 'tabsons');
  assert.equal(provisioned.administrator.email, 'arya.admin@tabsons.example');
  assert.equal(provisioned.governance.tenantIsolationPreserved, true);
  assert.equal(provisioned.governance.businessWorkflowsModified, false);
  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  }), beforeHrData, 'existing HR workflow datasets must not be mutated');
  assert.equal(global.OrganizationSetupService, previousSetupService, 'existing organization setup service should remain untouched');
  assert.equal(global.OrganizationInitializationWizardService, previousInitializationService, 'existing initialization wizard service should remain untouched');
  assert.equal(global.TenantProvisioningService, previousProvisioningService, 'existing tenant provisioning service should remain untouched');
  assert.ok(global.DB.getAuditLogs().some(row => /ENTERPRISE_ORGANIZATION_SETUP/.test(row.actionType || row.action || '')), 'wizard actions should be audited');
  assert.ok(Object.isFrozen(provisioned), 'provisioning output must be immutable');

  const crossTenant = service.resumeDraft({ draftId: draft.draftId }, {
    actor: { role: 'super_admin', tenantSlug: 'other-tenant', id: 'SA1' }
  });
  assert.equal(crossTenant.success, false, 'cross-tenant draft access should be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_SETUP_BLOCKED'));
  assert.equal(JSON.stringify(crossTenant).includes('Tabsons Manufacturing Private Limited'), false, 'blocked access must not leak tenant draft details');

  const scale = service.calculateSetupReadiness({
    ...draft,
    organizationStructure: {
      ...draft.organizationStructure,
      departments: Array.from({ length: 150 }, (_, index) => ({ name: `Department ${index + 1}`, code: `D${index + 1}` }))
    }
  }, { actor: { role: 'platform_owner', id: 'PO1' } });
  assert.equal(scale.success, true, 'readiness should support large organization onboarding metadata');
  assert.ok(scale.scaleReadinessScore >= 90, 'large organization setup should remain scale-ready');

  console.log('enterpriseOrganizationSetupWizardService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
