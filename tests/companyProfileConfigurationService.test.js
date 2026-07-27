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
    style: { setProperty() {}, removeProperty() {} },
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
  global.navigator = { userAgent: 'Node company profile configuration test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
    pathname: '/admin.html',
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

function seedCompanyConfigurationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    companyCode: 'TAB',
    timezone: 'Asia/Kolkata',
    currency: 'INR'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', companyCode: 'TAB' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC Global', companyCode: 'ABC' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', salary: 70000, leaveBalance: 12 },
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', salary: 900000, privateNote: 'ABC confidential' }
  ];
  data.attendance = [{ empId: 'EMP-1', tenantSlug: 'tabsons', status: 'Present' }];
  data.leaveRequests = [{ id: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', status: 'Pending' }];
  data.payroll = [{ id: 'PAY-1', empId: 'EMP-1', tenantSlug: 'tabsons', amount: 1000 }];
  data.companyProfileConfigurations = {};
  data.companyConfigurationVersions = [];
  data.companyConfigurationAuditHistory = [];
  data.companyConfigurationAnalytics = [];
  data.tenantFeatureFlags = {};
  data.auditLogs = [];
  global.DB.save(data);
}

function context(overrides = {}) {
  return {
    actor: { id: 'SA-1', role: 'SUPER_ADMIN', tenantSlug: 'tabsons', email: 'admin@tabsons.example' },
    tenantSlug: 'tabsons',
    routeType: 'tenant',
    ...overrides
  };
}

function profilePayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    companyProfile: {
      companyName: 'Tabsons Industries',
      legalEntityName: 'Tabsons Industries Private Limited',
      brandName: 'Tabsons HR',
      companyCode: 'TABSONS',
      registrationNumber: 'REG-2026-001',
      gstVatNumber: '27ABCDE1234F1Z5',
      panTin: 'ABCDE1234F',
      industry: 'Manufacturing',
      companySize: '10000+',
      companyType: 'PRIVATE_LIMITED',
      website: 'https://tabsons.example',
      officialEmail: 'people@tabsons.example',
      phoneNumbers: ['+91 90000 00000'],
      logo: 'https://assets.example.com/tabsons/logo.svg',
      brandAssets: [{ type: 'logo', url: 'https://assets.example.com/tabsons/logo.svg' }]
    },
    reason: 'Initial permanent profile setup',
    ...overrides
  };
}

function businessPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    businessSettings: {
      fiscalYear: 'APR-MAR',
      financialYear: '2026-2027',
      businessCalendar: 'INDIA_CORPORATE',
      currency: 'INR',
      numberFormat: 'en-IN',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24H',
      languages: ['en', 'hi'],
      defaultTimeZone: 'Asia/Kolkata',
      weekStartDay: 'MON'
    },
    reason: 'Business locale configuration',
    ...overrides
  };
}

function structurePayload(departmentCount = 3) {
  return {
    tenantSlug: 'tabsons',
    organizationStructure: {
      businessUnits: [{ name: 'Manufacturing', code: 'MFG' }],
      departments: Array.from({ length: departmentCount }, (_, index) => ({ name: `Department ${index + 1}`, code: `D${index + 1}` })),
      divisions: [{ name: 'India Operations', code: 'IN-OPS' }],
      costCenters: [{ name: 'Factory', code: 'FACT' }],
      profitCenters: [{ name: 'Domestic Sales', code: 'DOM' }],
      legalEntities: [{ name: 'Tabsons Industries Private Limited', code: 'TIPL' }],
      locations: [{ name: 'Mumbai', code: 'MUM' }],
      hierarchy: [{ parent: 'MFG', child: 'D1' }]
    },
    reason: 'Structure setup'
  };
}

function brandingPayload() {
  return {
    tenantSlug: 'tabsons',
    branding: {
      primaryLogo: 'https://assets.example.com/tabsons/primary.svg',
      darkLogo: 'https://assets.example.com/tabsons/dark.svg',
      favicon: 'https://assets.example.com/tabsons/favicon.ico',
      primaryColor: '#1a56db',
      secondaryColor: '#0ea5e9',
      accentColor: '#059669',
      emailBranding: true,
      pdfBranding: true,
      portalBranding: true
    },
    reason: 'Branding setup'
  };
}

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/companyProfileConfigurationService.js');

  seedCompanyConfigurationData();

  const svc = global.CompanyProfileConfigurationService;
  assert.ok(svc, 'CompanyProfileConfigurationService should be exported');
  assert.equal(global.companyProfileConfigurationService, svc, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.CompanyProfileService), 'CompanyProfileService helper must be frozen');
  assert.ok(Object.isFrozen(svc.AddressManagementService), 'AddressManagementService helper must be frozen');
  assert.ok(Object.isFrozen(svc.BusinessConfigurationService), 'BusinessConfigurationService helper must be frozen');
  assert.ok(Object.isFrozen(svc.OrganizationStructureService), 'OrganizationStructureService helper must be frozen');
  assert.ok(Object.isFrozen(svc.BrandingService), 'BrandingService helper must be frozen');
  assert.ok(Object.isFrozen(svc.ConfigurationVersionService), 'ConfigurationVersionService helper must be frozen');
  assert.ok(Object.isFrozen(svc.ConfigurationHealthService), 'ConfigurationHealthService helper must be frozen');
  assert.equal(global.__ARTHHRMS_COMPANY_PROFILE_CONFIGURATION_SELF_TEST__.passed, true, 'development self-test should pass');

  const beforeHrData = JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  });

  const loaded = svc.CompanyProfileService.getCompanyProfile({ tenantSlug: 'tabsons' }, context());
  assert.equal(loaded.success, true, 'company profile should load');
  assert.equal(loaded.profile.companyName, 'Tabsons');
  assert.equal(loaded.tenantSlug, 'tabsons');
  assert.ok(Object.isFrozen(loaded.profile), 'profile output must be immutable');

  const duplicate = svc.CompanyProfileService.updateCompanyProfile(profilePayload({
    companyProfile: { ...profilePayload().companyProfile, companyCode: 'ABC' }
  }), context());
  assert.equal(duplicate.success, false, 'duplicate company codes should be blocked');
  assert.ok(duplicate.failures.some(item => item.code === 'DUPLICATE_COMPANY_CODE'));

  const invalidTax = svc.CompanyProfileService.updateCompanyProfile(profilePayload({
    companyProfile: { ...profilePayload().companyProfile, gstVatNumber: 'BAD GST!' }
  }), context());
  assert.equal(invalidTax.success, false, 'invalid tax IDs should be blocked');
  assert.ok(invalidTax.failures.some(item => item.code === 'INVALID_GST_VAT_NUMBER'));

  const profileUpdate = svc.CompanyProfileService.updateCompanyProfile(profilePayload(), context());
  assert.equal(profileUpdate.success, true, 'company profile update should work');
  assert.equal(profileUpdate.version.domain, 'companyProfile');
  assert.equal(profileUpdate.version.version, 1);
  assert.equal(profileUpdate.version.reason, 'Initial permanent profile setup');
  assert.equal(profileUpdate.version.previousValue.companyName, 'Tabsons');
  assert.equal(profileUpdate.version.newValue.companyName, 'Tabsons Industries');
  assert.equal(global.DB.get().companySettings.companyName, 'Tabsons Industries', 'active tenant company settings should be updated compatibly');

  const addresses = svc.AddressManagementService.updateAddressManagement({
    tenantSlug: 'tabsons',
    addresses: [
      { type: 'HEAD_OFFICE', name: 'Mumbai HQ', country: 'India', state: 'Maharashtra', city: 'Mumbai', postalCode: '400001', timezone: 'Asia/Kolkata', gps: '18.9388,72.8354' },
      { type: 'BRANCH', name: 'Pune Branch', country: 'India', state: 'Maharashtra', city: 'Pune', postalCode: '411001', timezone: 'Asia/Kolkata' }
    ],
    reason: 'Address management setup'
  }, context());
  assert.equal(addresses.success, true, 'address management update should work');
  assert.equal(addresses.version.domain, 'addresses');
  assert.equal(addresses.configuration.addresses.length, 2);
  assert.equal(addresses.configuration.addresses[0].type, 'HEAD_OFFICE');
  assert.equal(global.DB.get().companySettings.addresses.length, 2, 'active tenant addresses should sync compatibly');

  const business = svc.BusinessConfigurationService.updateBusinessConfiguration(businessPayload(), context());
  assert.equal(business.success, true, 'business settings update should work');
  assert.equal(business.configuration.businessSettings.currency, 'INR');

  const structure = svc.OrganizationStructureService.updateOrganizationStructure(structurePayload(250), context());
  assert.equal(structure.success, true, 'large organization structures should be supported');
  assert.equal(structure.configuration.organizationStructure.departments.length, 250);

  const branding = svc.BrandingService.updateBranding(brandingPayload(), context());
  assert.equal(branding.success, true, 'branding update should work');
  assert.equal(branding.configuration.branding.primaryColor, '#1a56db');

  const modules = svc.updateModuleConfiguration({
    tenantSlug: 'tabsons',
    moduleConfiguration: {
      attendance: true,
      payroll: true,
      recruitment: false,
      performance: true,
      assets: true,
      travel: false,
      expenses: true,
      documents: true,
      training: true,
      aiAssistant: false,
      marketplace: true,
      workflows: true
    },
    reason: 'Module readiness review'
  }, context());
  assert.equal(modules.success, true, 'module configuration should update');
  assert.equal(global.DB.get().tenantFeatureFlags.tabsons.payroll.enabled, true, 'module configuration should be backed by tenant feature flags');

  const preferences = svc.updateOrganizationPreferences({
    tenantSlug: 'tabsons',
    organizationPreferences: {
      workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      defaultLeaveYear: 'FISCAL',
      attendanceRules: { graceMinutes: 15 },
      payrollFrequency: 'MONTHLY',
      defaultShift: 'GENERAL',
      approvalDefaults: { leave: ['MANAGER', 'HR'] },
      notificationDefaults: { email: true, push: true },
      documentNumberFormats: { employee: 'EMP-{YYYY}-{SEQ}' },
      employeeIdFormat: 'TAB-{SEQ}'
    },
    reason: 'Preference setup'
  }, context());
  assert.equal(preferences.success, true, 'organization preferences should update');

  const health = svc.ConfigurationHealthService.calculateConfigurationHealth({ tenantSlug: 'tabsons' }, context());
  assert.equal(health.success, true, 'configuration health should calculate');
  assert.ok(health.configurationHealthScore >= 80, 'configuration health should be high after setup');
  assert.ok(health.organizationMaturityScore >= 80, 'organization maturity should be high after setup');
  assert.equal(health.analytics.departmentCount, 250);

  const history = svc.ConfigurationVersionService.getVersionHistory({ tenantSlug: 'tabsons' }, context());
  assert.equal(history.success, true, 'version history should load');
  assert.ok(history.versions.length >= 6, 'version history should include each configuration update');
  assert.ok(history.versions.every(row => row.tenantSlug === 'tabsons'), 'history must stay tenant-scoped');

  const rollback = svc.ConfigurationVersionService.rollbackConfiguration({
    tenantSlug: 'tabsons',
    versionId: profileUpdate.version.versionId,
    reason: 'Rollback company profile test'
  }, context());
  assert.equal(rollback.success, true, 'rollback should work');
  const rolledBack = svc.CompanyProfileService.getCompanyProfile({ tenantSlug: 'tabsons' }, context());
  assert.equal(rolledBack.profile.companyName, 'Tabsons', 'rollback should restore previous company profile value');
  assert.ok(rollback.version.rollbackOf === profileUpdate.version.versionId, 'rollback should create an auditable rollback version');

  const crossTenant = svc.CompanyProfileService.getCompanyProfile({ tenantSlug: 'tabsons' }, {
    actor: { id: 'ABC-HR', role: 'HR', tenantSlug: 'abc' },
    tenantSlug: 'abc',
    routeType: 'tenant'
  });
  assert.equal(crossTenant.success, false, 'cross-tenant profile access should be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_CONFIGURATION_BLOCKED'));
  assert.equal(JSON.stringify(crossTenant).includes('Tabsons Industries Private Limited'), false, 'blocked cross-tenant output must not leak configuration data');

  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  }), beforeHrData, 'existing HR workflow datasets must not be mutated');

  assert.ok(global.DB.getAuditLogs().some(row => /COMPANY_CONFIGURATION/.test(row.actionType || row.action || '')), 'configuration changes should be audited');
  assert.ok(global.DB.get().companyConfigurationAuditHistory.length >= 1, 'immutable configuration audit history should be stored');
  assert.ok(Object.isFrozen(profileUpdate), 'update outputs must be immutable');
  assert.ok(Object.isFrozen(rollback), 'rollback outputs must be immutable');

  console.log('companyProfileConfigurationService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
