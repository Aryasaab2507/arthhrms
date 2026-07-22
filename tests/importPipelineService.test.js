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
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32'
  };
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

function seedImportData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.departments = [
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons' },
    { id: 'DEP-OPS', name: 'Operations', tenantSlug: 'tabsons' },
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons' }
  ];
  data.employees = [
    { id: 'EMP-EXISTING', empId: 'EMP-EXISTING', employeeId: 'EMP-EXISTING', name: 'Existing Employee', email: 'existing@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Tenant Manager', email: 'manager.x@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 999999 }
  ];
  data.importBatches = [
    { importBatchId: 'IMP-OLD', tenantSlug: 'tabsons', importType: 'EMPLOYEE_CSV', status: 'COMPLETED', totalRows: 1, passedRows: 1, failedRows: 0, rollbackEligible: true, uploadedAt: '2026-05-20T00:00:00.000Z' }
  ];
  data.importStagingRows = [];
  data.importRollbackLogs = [];
  data.asyncJobs = [];
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
    'services/tenantProvisioningService.js',
    'services/organizationSetupService.js',
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/asyncJobService.js',
    'services/employeeOnboardingService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/importPipelineService.js');
  seedImportData();

  const svc = global.ImportPipelineService;
  assert.ok(svc, 'ImportPipelineService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.IMPORT_STATES), 'import states must be immutable');
  assert.ok(Object.isFrozen(svc.ONBOARDING_STAGES), 'onboarding stages must be immutable');
  assert.equal(global.__ARTHHRMS_IMPORT_PIPELINE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyImportFailure({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant import classifies as critical blocker');
  assert.equal(svc.classifyImportFailure({ circularManager: true }), 'HIGH_RISK', 'circular manager hierarchy classifies as high risk');
  assert.equal(svc.classifyImportFailure({ malformedPayload: true }), 'WARNING', 'malformed onboarding payload classifies as warning');

  const rows = [
    { employee_id: 'EMP-100', name: 'Employee One', email: 'one@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'tabsons', salary: 999999 },
    { employee_id: 'EMP-101', name: 'Duplicate Email', email: 'one@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-100', name: 'Duplicate ID', email: 'dup.id@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-102', name: 'Platform Owner Attempt', email: 'owner@example.com', department: 'Operations', designation: 'Associate', role: 'PLATFORM_OWNER', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-103', name: 'Cross Tenant', email: 'cross@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'abc' },
    { employee_id: 'EMP-104', name: 'Cross Tenant Manager', email: 'manager.cross@example.com', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-X', joining_date: '2026-05-20', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-105', name: 'Bad Phone', email: 'bad.phone@example.com', phone: '12', department: 'Operations', designation: 'Associate', role: 'EMPLOYEE', reporting_manager_id: 'MGR-1', joining_date: '2026-05-20', tenant_slug: 'tabsons' }
  ];
  const beforeRows = JSON.stringify(rows);
  const beforeEmployees = JSON.stringify(global.DB.get().employees);
  const validation = svc.validateEmployeeImport({ rows, importType: 'CSV', fileName: 'employees.csv', tenantSlug: 'tabsons' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    dryRun: true
  });
  assert.equal(JSON.stringify(rows), beforeRows, 'validation must not mutate caller rows');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'dry-run validation must not mutate employees');
  assert.equal(validation.success, false, 'mixed import should require review');
  assert.equal(validation.state, 'REVIEW_REQUIRED');
  assert.equal(validation.summary.totalRows, rows.length);
  assert.equal(validation.summary.validRows, 1, 'only safe row should pass');
  assert.ok(validation.duplicates.duplicateEmails.length >= 1, 'duplicate emails should be detected');
  assert.ok(validation.duplicates.duplicateEmployeeIds.length >= 1, 'duplicate employee ids should be detected');
  assert.ok(validation.failedRows.some(row => row.failures.some(item => item.failureCode === 'UNSAFE_ROLE_ASSIGNMENT')), 'PLATFORM_OWNER role must be blocked');
  assert.ok(validation.failedRows.some(row => row.failures.some(item => item.failureCode === 'CROSS_TENANT_IMPORT_BLOCKED')), 'cross-tenant rows must be blocked');
  assert.ok(validation.failedRows.some(row => row.failures.some(item => item.failureCode === 'CROSS_TENANT_MANAGER_BLOCKED')), 'cross-tenant managers must be blocked');
  assert.ok(validation.warningRows.some(row => row.warnings.some(item => item.warningCode === 'PHONE_NUMBER_MALFORMED')), 'malformed phones should be isolated as warnings');
  assert.ok(Object.isFrozen(validation), 'validation output must be immutable');
  assert.doesNotMatch(JSON.stringify(validation), /999999|salary/i, 'validation output must redact sensitive data');

  const hierarchy = svc.validateManagerHierarchy([
    { employee_id: 'EMP-A', reporting_manager_id: 'EMP-B', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-B', reporting_manager_id: 'EMP-A', tenant_slug: 'tabsons' },
    { employee_id: 'EMP-C', reporting_manager_id: 'EMP-C', tenant_slug: 'tabsons' }
  ], { tenantSlug: 'tabsons' });
  assert.equal(hierarchy.success, false, 'manager hierarchy should detect loops');
  assert.ok(hierarchy.failures.some(item => item.failureCode === 'CIRCULAR_MANAGER_CHAIN'));
  assert.ok(hierarchy.failures.some(item => item.failureCode === 'SELF_MANAGER_NOT_ALLOWED'));

  const staged = svc.stageEmployeeImport({
    rows: [rows[0]],
    importType: 'CSV',
    fileName: 'safe-employees.csv',
    onboardingStage: 'IMPORT_ONLY',
    tenantSlug: 'tabsons'
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(staged.success, true, 'safe import should stage');
  assert.equal(staged.batch.state, 'UPLOADED');
  assert.equal(staged.batch.onboardingStage, 'IMPORT_ONLY');
  assert.equal(staged.asyncJob.job.jobType, 'ONBOARDING_IMPORT', 'staged import should enqueue async onboarding job');
  assert.ok(staged.rollbackCheckpoint.rollbackCheckpointId, 'rollback checkpoint should be created');
  assert.ok(global.DB.get().importBatches.some(row => row.importBatchId === staged.batch.importBatchId), 'import batch should persist compatibly');
  assert.ok(global.DB.get().importStagingRows.some(row => row.importBatchId === staged.batch.importBatchId), 'staging rows should persist compatibly');

  const checkpoint = svc.createRollbackCheckpoint(staged.batch.importBatchId, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(checkpoint.success, true, 'rollback checkpoint should work');
  assert.ok(checkpoint.rollbackCheckpoint.rollbackCheckpointId);

  const rollback = svc.rollbackImportBatch(staged.batch.importBatchId, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(rollback.success, true, 'rollback governance should work');
  assert.equal(rollback.state, 'ROLLED_BACK');
  assert.ok(global.DB.get().importRollbackLogs.some(row => row.importBatchId === staged.batch.importBatchId), 'rollback should be logged compatibly');

  const blockedActivation = svc.stageEmployeeImport({
    rows: [rows[0]],
    importType: 'CSV',
    fileName: 'unsafe-full.csv',
    onboardingStage: 'FULL_ACTIVATION',
    activationMode: 'FULL_ACTIVATION',
    tenantSlug: 'tabsons'
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    activationReadiness: { ready: false }
  });
  assert.equal(blockedActivation.success, false, 'unsafe bulk activation must be blocked');
  assert.ok(blockedActivation.failures.some(item => item.failureCode === 'UNSAFE_BULK_ACTIVATION_BLOCKED'));

  const report = svc.generateImportGovernanceReport({ tenantSlug: 'tabsons' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(report.success, true, 'import governance report should complete');
  assert.equal(report.readOnly, true, 'report should be read-only');
  assert.ok(report.importHealth.activeImports >= 1, 'active imports should be visible');
  assert.ok(report.rollbackVisibility.rollbackLogs >= 1, 'rollback visibility should be available');
  assert.ok(report.importQueueHealth.asyncImportJobs >= 1, 'async onboarding queue health should be visible');
  assert.ok(Object.isFrozen(report), 'report output must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|MGR-X/i, 'report must not leak sensitive or cross-tenant data');

  assert.ok(global.DB.getAuditLogs().some(row => /IMPORT_PIPELINE_/.test(row.actionType || row.action || '')), 'import actions should be audited safely');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /IMPORT_PIPELINE_/.test(row.eventType)), 'import telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.IMPORT_PIPELINE_STAGED, 'import metrics should aggregate safely');

  const previousAsync = global.AsyncJobService;
  global.AsyncJobService = null;
  const degraded = svc.generateImportGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing async dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.warningCode === 'ASYNC_JOB_SERVICE_UNAVAILABLE'));
  global.AsyncJobService = previousAsync;

  const malformed = svc.validateEmployeeImport('bad-payload', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, false, 'malformed payloads should be handled safely');
  assert.equal(malformed.classification, 'WARNING', 'malformed import payload should be warning classified');
}

main();
