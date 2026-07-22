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
  global.navigator = { userAgent: 'Node organization import test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
    pathname: '/organization-import-center.html',
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

function seedData() {
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
  data.companyProfileConfigurations = {
    tabsons: {
      tenantSlug: 'tabsons',
      addresses: [{ type: 'HEAD_OFFICE', name: 'Mumbai HQ', country: 'India', state: 'Maharashtra', city: 'Mumbai', postalCode: '400001', timezone: 'Asia/Kolkata' }],
      organizationStructure: {
        businessUnits: [{ name: 'Corporate', code: 'CORP' }],
        departments: [{ name: 'Human Resources', code: 'HR' }],
        divisions: [{ name: 'Shared Services', code: 'SS' }],
        costCenters: [{ name: 'Corporate Cost', code: 'CCORP' }],
        profitCenters: [{ name: 'Domestic', code: 'DOM' }],
        legalEntities: [{ name: 'Tabsons Industries Private Limited', code: 'TIPL' }],
        locations: [{ name: 'Mumbai', code: 'MUM' }],
        hierarchy: [{ parent: 'CORP', child: 'SS' }, { parent: 'SS', child: 'HR' }]
      }
    },
    abc: {
      tenantSlug: 'abc',
      addresses: [{ type: 'HEAD_OFFICE', name: 'ABC HQ', country: 'India', state: 'Delhi', city: 'Delhi', postalCode: '110001', timezone: 'Asia/Kolkata' }],
      organizationStructure: {
        businessUnits: [{ name: 'ABC Unit', code: 'ABCUNIT' }],
        departments: [{ name: 'ABC Confidential', code: 'ABC-HR' }],
        divisions: [],
        costCenters: [],
        profitCenters: [],
        legalEntities: [],
        locations: [],
        hierarchy: []
      }
    }
  };
  data.companyConfigurationVersions = [];
  data.companyConfigurationAuditHistory = [];
  data.organizationImportJobs = [];
  data.organizationImportTransactions = [];
  data.organizationImportTemplates = [];
  data.organizationImportAnalytics = [];
  data.auditLogs = [];
  data.employees = [{ id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', department: 'HR', salary: 70000 }];
  data.attendance = [{ empId: 'EMP-1', tenantSlug: 'tabsons', status: 'Present' }];
  data.leaveRequests = [{ id: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', status: 'Pending' }];
  data.payroll = [{ id: 'PAY-1', empId: 'EMP-1', tenantSlug: 'tabsons', amount: 1000 }];
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

const csv = [
  'Record Type,Name,Code,Parent Code,Country,State,City,Postal Code,Timezone',
  'Business Unit,Manufacturing,MFG,,,,,,',
  'Division,India Operations,IN-OPS,MFG,,,,,',
  'Department,Engineering,ENG,IN-OPS,,,,,',
  'Department,Operations,OPS,IN-OPS,,,,,',
  'Cost Center,Factory Cost,FACT,ENG,,,,,',
  'Profit Center,Domestic Sales,DOMSALES,OPS,,,,,',
  'Location,Pune Plant,PUNE,,India,Maharashtra,Pune,411001,Asia/Kolkata',
  'Branch,Pune Branch,PUN-BR,,India,Maharashtra,Pune,411001,Asia/Kolkata'
].join('\n');

async function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/companyProfileConfigurationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/organizationImportService.js');

  seedData();

  const svc = global.OrganizationImportService;
  assert.ok(svc, 'OrganizationImportService should be exported');
  assert.equal(global.organizationImportService, svc, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.HierarchyBuilder), 'HierarchyBuilder helper must be frozen');
  assert.ok(Object.isFrozen(svc.ImportValidator), 'ImportValidator helper must be frozen');
  assert.ok(Object.isFrozen(svc.ColumnMapper), 'ColumnMapper helper must be frozen');
  assert.ok(Object.isFrozen(svc.ConflictResolver), 'ConflictResolver helper must be frozen');
  assert.ok(Object.isFrozen(svc.RollbackService), 'RollbackService helper must be frozen');
  assert.ok(Object.isFrozen(svc.ImportAnalyticsService), 'ImportAnalyticsService helper must be frozen');
  assert.equal(global.__ARTHHRMS_ORGANIZATION_IMPORT_SELF_TEST__.passed, true, 'development self-test should pass');

  const beforeHrData = JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  });
  const beforeConfig = JSON.stringify(global.DB.get().companyProfileConfigurations.tabsons);
  const abcBefore = JSON.stringify(global.DB.get().companyProfileConfigurations.abc);

  const template = svc.generateImportTemplate({ tenantSlug: 'tabsons', module: 'departments' }, context());
  assert.equal(template.success, true, 'template generation should work');
  assert.equal(template.template.version, 1, 'templates should be versioned');
  assert.ok(template.template.requiredFields.includes('Name'), 'template should include required fields');

  const parsed = svc.parseImportSource({ tenantSlug: 'tabsons', fileName: 'organization.csv', content: csv }, context());
  assert.equal(parsed.success, true, 'CSV parsing should work');
  assert.equal(parsed.rows.length, 8);
  assert.equal(parsed.detectedFormat, 'CSV');

  const tsv = svc.parseImportSource({
    tenantSlug: 'tabsons',
    fileName: 'departments.tsv',
    content: 'Record Type\tDept Name\tDept Code\nDepartment\tFinance\tFIN'
  }, context());
  assert.equal(tsv.success, true, 'TSV parsing should work');
  assert.equal(tsv.rows[0]['Dept Name'], 'Finance');

  const workbook = svc.parseImportSource({
    tenantSlug: 'tabsons',
    fileName: 'branches.xlsx',
    workbook: { Branches: [{ 'Record Type': 'Branch', Name: 'Delhi Branch', Code: 'DEL-BR', Country: 'India', State: 'Delhi', City: 'Delhi', 'Postal Code': '110001', Timezone: 'Asia/Kolkata' }] }
  }, context());
  assert.equal(workbook.success, true, 'XLSX workbook object parsing should work');
  assert.equal(workbook.detectedFormat, 'XLSX');
  assert.equal(workbook.rows[0].Name, 'Delhi Branch');

  const mapped = svc.ColumnMapper.autoMapColumns({ rows: parsed.rows }, context());
  assert.equal(mapped.success, true, 'automatic column mapping should work');
  assert.equal(mapped.mapping['Record Type'], 'recordType');
  assert.equal(mapped.mapping['Parent Code'], 'parentCode');

  const validation = svc.ImportValidator.validateImportRows({
    tenantSlug: 'tabsons',
    rows: parsed.rows,
    mapping: mapped.mapping
  }, context());
  assert.equal(validation.success, true, 'valid import rows should pass validation');
  assert.equal(validation.normalizedRecords.departments.length, 2);
  assert.equal(validation.normalizedRecords.branches.length, 1);

  const hierarchy = svc.HierarchyBuilder.buildHierarchyPreview({
    tenantSlug: 'tabsons',
    records: validation.normalizedRecords
  }, context());
  assert.equal(hierarchy.success, true, 'hierarchy preview should build');
  assert.ok(hierarchy.hierarchyDepth >= 3, 'hierarchy depth should be calculated');

  const dryRun = svc.dryRunImport({
    tenantSlug: 'tabsons',
    fileName: 'organization.csv',
    content: csv,
    conflictStrategy: 'MERGE'
  }, context());
  assert.equal(dryRun.success, true, 'dry run should work');
  assert.equal(JSON.stringify(global.DB.get().companyProfileConfigurations.tabsons), beforeConfig, 'dry run must not mutate configuration');
  assert.equal(dryRun.transactional, true, 'dry run must be transactional');

  const committed = svc.commitImport({
    tenantSlug: 'tabsons',
    fileName: 'organization.csv',
    content: csv,
    conflictStrategy: 'MERGE',
    reason: 'Initial organization structure import'
  }, context());
  assert.equal(committed.success, true, 'import commit should work');
  assert.equal(committed.transactional, true, 'commit should be transactional');
  assert.equal(committed.reversible, true, 'commit should be reversible');
  assert.equal(committed.summary.importedRecords, 8);
  assert.equal(committed.summary.rollbackAvailable, true);
  assert.ok(committed.transaction.beforeSnapshot.organizationStructure.departments.some(row => row.code === 'HR'), 'before snapshot should preserve previous departments');
  assert.ok(committed.configuration.organizationStructure.departments.some(row => row.code === 'ENG'), 'new departments should be imported');
  assert.ok(committed.configuration.addresses.some(row => row.name === 'Pune Branch'), 'branches should import as addresses');

  const duplicate = svc.commitImport({
    tenantSlug: 'tabsons',
    fileName: 'dupes.csv',
    content: 'Record Type,Name,Code\nDepartment,Engineering,ENG\nDepartment,Engineering Duplicate,ENG',
    conflictStrategy: 'MERGE'
  }, context());
  assert.equal(duplicate.success, false, 'duplicate codes should block commit');
  assert.ok(duplicate.failures.some(item => item.code === 'DUPLICATE_IMPORT_CODE'));

  const circular = svc.dryRunImport({
    tenantSlug: 'tabsons',
    fileName: 'circular.csv',
    content: 'Record Type,Name,Code,Parent Code\nDepartment,A,A,B\nDepartment,B,B,A',
    conflictStrategy: 'MERGE'
  }, context());
  assert.equal(circular.success, false, 'circular hierarchy should be blocked');
  assert.ok(circular.failures.some(item => item.code === 'CIRCULAR_HIERARCHY'));

  const rollback = svc.RollbackService.rollbackImport({
    tenantSlug: 'tabsons',
    importId: committed.importId,
    reason: 'Rollback import test'
  }, context());
  assert.equal(rollback.success, true, 'rollback should work');
  assert.equal(JSON.stringify(global.DB.get().companyProfileConfigurations.tabsons), beforeConfig, 'rollback should restore previous organization configuration');

  const crossTenant = svc.commitImport({
    tenantSlug: 'tabsons',
    fileName: 'bad.csv',
    content: csv
  }, {
    actor: { id: 'ABC-HR', role: 'HR', tenantSlug: 'abc' },
    tenantSlug: 'abc',
    routeType: 'tenant'
  });
  assert.equal(crossTenant.success, false, 'cross-tenant imports should be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_IMPORT_BLOCKED'));
  assert.equal(JSON.stringify(crossTenant).includes('ABC Confidential'), false, 'blocked cross-tenant output must not leak tenant data');
  assert.equal(JSON.stringify(global.DB.get().companyProfileConfigurations.abc), abcBefore, 'other tenant configuration must remain untouched');

  const analytics = svc.ImportAnalyticsService.calculateImportAnalytics({ tenantSlug: 'tabsons' }, context());
  assert.equal(analytics.success, true, 'analytics should calculate');
  assert.ok(analytics.importQualityScore >= 70, 'import quality score should be generated');
  assert.ok(analytics.organizationIntegrityScore >= 70, 'organization integrity score should be generated');

  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    attendance: global.DB.get().attendance,
    leaveRequests: global.DB.get().leaveRequests,
    payroll: global.DB.get().payroll
  }), beforeHrData, 'existing HR workflow datasets must not be mutated');

  assert.ok(global.DB.getAuditLogs().some(row => /ORGANIZATION_IMPORT/.test(row.actionType || row.action || '')), 'imports should be audited');
  assert.ok(Object.isFrozen(committed), 'commit output must be immutable');
  assert.ok(Object.isFrozen(rollback), 'rollback output must be immutable');

  console.log('organizationImportService.test.js passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
