const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node End-to-End UAT test', platform: 'Win32', onLine: true };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/end-to-end-validation-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'ADMIN', tenantSlug = 'tabsons', id = 'ADMIN-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-18T10:00:00.000Z' };
}

const TABLES = [
  'endToEndBusinessScenarios', 'endToEndValidationExecutions', 'endToEndValidationEvents',
  'endToEndValidationStepResults', 'endToEndDomainValidations', 'endToEndIntegrationValidations',
  'endToEndRecoverySimulations', 'endToEndProcessAnalytics', 'endToEndRecoveryCheckpoints',
  'endToEndValidationExports', 'endToEndBackgroundReports', 'endToEndValidationAuditHistory'
];

const PROTECTED_TABLES = [
  'employees', 'recruitment', 'onboarding', 'documents', 'leaveRequests', 'leaveBalances',
  'attendance', 'attendanceRegularizations', 'shiftAssignments', 'rosters', 'payroll',
  'payrollRuns', 'payrollRecords', 'performanceReviews', 'expenseClaims', 'approvals',
  'workflows', 'notifications', 'reports', 'reportingHierarchyRelationships', 'accessControl'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [
    { tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'private company data' }
  ];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', managerId: 'M1', salary: 60000, employeeEmail: 'employee@example.test' },
    { id: 'M1', tenantSlug: 'tabsons', name: 'Manager One', role: 'MANAGER', salary: 100000 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', privateNote: 'private company data', salary: 999999 }
  ];
  data.recruitment = [{ id: 'REC-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.onboarding = [{ id: 'ONB-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'COMPLETE' }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'APPROVED' }];
  data.leaveBalances = [{ id: 'LB-1', tenantSlug: 'tabsons', employeeId: 'E1', balance: 12 }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.attendanceRegularizations = [{ id: 'REG-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'APPROVED' }];
  data.shiftAssignments = [{ id: 'SHIFT-1', tenantSlug: 'tabsons', employeeId: 'E1', shiftCode: 'NIGHT' }];
  data.rosters = [{ id: 'ROSTER-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.payrollRuns = [{ id: 'RUN-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.payrollRecords = [{ id: 'PAYREC-1', tenantSlug: 'tabsons', employeeId: 'E1', net: 50000 }];
  data.performanceReviews = [{ id: 'PERF-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'COMPLETE' }];
  data.expenseClaims = [{ id: 'EXP-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PAID', amount: 1000 }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.reports = [{ id: 'REPORT-1', tenantSlug: 'tabsons', status: 'GENERATED' }];
  data.reportingHierarchyRelationships = [{ relationshipId: 'REL-1', tenantSlug: 'tabsons', employeeId: 'E1', managerId: 'M1', relationshipType: 'DIRECT_MANAGER', status: 'ACTIVE' }];
  data.accessControl = [{ id: 'ACL-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  const snapshot = {};
  PROTECTED_TABLES.forEach(table => { snapshot[table] = data[table]; });
  return JSON.stringify(snapshot);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js', 'services/asyncJobService.js'].forEach(load);
  seed();
  global.__ARTHHRMS_DEV__ = true;
  load('services/endToEndValidationService.js');

  const svc = global.EndToEndValidationService;
  assert.ok(svc, 'EndToEndValidationService should be exported');
  assert.equal(global.endToEndValidationService, svc, 'lowercase service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service API should be immutable');
  [
    'EndToEndValidationService', 'BusinessScenarioEngine', 'IntegrationValidator',
    'PayrollValidationService', 'AttendanceValidationService', 'LeaveValidationService',
    'WorkflowValidationService', 'ProcessAnalyticsService'
  ].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  assert.equal(global.__ARTHHRMS_END_TO_END_VALIDATION_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = protectedSnapshot();
  const initialized = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(initialized.success, true);
  assert.ok(initialized.scenarioCount >= 14, 'the complete predefined process library should load');
  const again = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(again.scenariosAdded, 0, 'library initialization should be idempotent');
  const library = svc.listLibrary({ tenantSlug: 'tabsons' }, ctx('HR'));
  [
    'NEW_EMPLOYEE_JOINING', 'PROBATION_COMPLETION', 'ATTENDANCE_CYCLE', 'LEAVE_CYCLE',
    'PAYROLL_CYCLE', 'PROMOTION', 'TRANSFER', 'EXPENSE_REIMBURSEMENT', 'PERFORMANCE_REVIEW',
    'TRAINING_COMPLETION', 'RESIGNATION', 'EXIT_CLEARANCE', 'FULL_EMPLOYEE_LIFECYCLE',
    'CUSTOM_BUSINESS_PROCESS'
  ].forEach(code => assert.ok(library.scenarios.some(row => row.code === code), `${code} should be predefined`));

  const custom = svc.createCustomScenario({
    tenantSlug: 'tabsons', code: 'GO_LIVE_PILOT', name: 'Go-Live Pilot',
    businessObjective: 'Validate a governed cross-module process without production writes.',
    modulesInvolved: ['PAYROLL', 'ATTENDANCE', 'LEAVE'],
    preconditions: ['The UAT evidence snapshot is available.'],
    steps: [
      { code: 'OBSERVE_ATTENDANCE', module: 'ATTENDANCE', description: 'Observe attendance evidence.', expectedResult: 'Attendance evidence is complete.' },
      { code: 'OBSERVE_LEAVE', module: 'LEAVE', description: 'Observe leave evidence.', expectedResult: 'Leave evidence is complete.' },
      { code: 'OBSERVE_PAYROLL', module: 'PAYROLL', description: 'Observe payroll evidence.', expectedResult: 'Payroll evidence is complete.' }
    ]
  }, ctx());
  assert.equal(custom.success, true);

  const started = svc.startExecution({
    tenantSlug: 'tabsons', name: 'UAT-05 Pilot', environment: 'UAT',
    scenarioIds: [custom.scenario.scenarioId], seed: 'UAT-05-2026-07-18',
    edgeCaseProfile: {
      payrollDuringHolidays: true, negativeLeaveBalance: true, multipleShifts: true,
      crossMonthAttendance: true, retroactiveSalaryRevision: true,
      resignationMidCycle: true, promotionDuringPayroll: true, interruptedExecution: true
    }
  }, ctx('HR_HEAD', 'tabsons', 'HR-HEAD-1'));
  assert.equal(started.success, true);
  assert.equal(started.execution.reproducible, true);
  assert.equal(started.execution.exportable, true);
  assert.equal(started.execution.productionDataModified, false);
  assert.ok(started.execution.manifestFingerprint);
  const executionId = started.execution.executionId;

  const paused = svc.pauseExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: started.execution.version, reason: 'Controlled interruption test.' }, ctx('HR_HEAD'));
  assert.equal(paused.execution.status, 'PAUSED');
  const saved = svc.saveProgress({ tenantSlug: 'tabsons', executionId, expectedVersion: paused.execution.version, reason: 'Checkpoint before resume.' }, ctx('HR_HEAD'));
  assert.ok(saved.recoveryToken);
  const resumed = svc.resumeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: saved.execution.version }, ctx('HR_HEAD'));
  assert.equal(resumed.execution.status, 'RUNNING');

  const firstStep = custom.scenario.steps[0];
  const stale = svc.recordStepResult({ tenantSlug: 'tabsons', executionId, scenarioId: custom.scenario.scenarioId, stepId: firstStep.stepId, status: 'FAILED', actualResult: 'Stale observation.', expectedVersion: 1 }, ctx('HR_HEAD'));
  assert.equal(stale.code, 'E2E_EXECUTION_VERSION_CONFLICT');
  const failed = svc.recordStepResult({
    tenantSlug: 'tabsons', executionId, scenarioId: custom.scenario.scenarioId,
    stepId: firstStep.stepId, status: 'FAILED', actualResult: 'confidential payroll data was not visible.',
    durationMs: 25, submissionId: 'STEP-SUBMISSION-1', expectedVersion: resumed.execution.version
  }, ctx('HR_HEAD'));
  assert.equal(failed.success, true);
  assert.equal(failed.stepResult.productionDataModified, false);
  assert.equal(failed.stepResult.actualResult.includes('confidential payroll data'), false, 'sensitive evidence text should be redacted');
  const duplicate = svc.recordStepResult({
    tenantSlug: 'tabsons', executionId, scenarioId: custom.scenario.scenarioId,
    stepId: firstStep.stepId, status: 'PASSED', actualResult: 'Duplicate network replay.',
    submissionId: 'STEP-SUBMISSION-1', expectedVersion: 0
  }, ctx('HR_HEAD'));
  assert.equal(duplicate.code, 'E2E_DUPLICATE_STEP_REPLAYED');
  assert.equal(duplicate.executionVersion, failed.executionVersion);

  let version = failed.executionVersion;
  const results = [
    { step: custom.scenario.steps[0], status: 'PASSED', actualResult: 'Attendance evidence matched the expected sandbox result.', submissionId: 'STEP-RETRY-1' },
    { step: custom.scenario.steps[1], status: 'PASSED', actualResult: 'Leave evidence matched the expected sandbox result.', submissionId: 'STEP-SUBMISSION-2' },
    { step: custom.scenario.steps[2], status: 'PASSED', actualResult: 'Payroll evidence matched the expected sandbox result.', submissionId: 'STEP-SUBMISSION-3' }
  ];
  results.forEach((entry, index) => {
    const response = svc.recordStepResult({
      tenantSlug: 'tabsons', executionId, scenarioId: custom.scenario.scenarioId,
      stepId: entry.step.stepId, status: entry.status, actualResult: entry.actualResult,
      durationMs: 30 + index, submissionId: entry.submissionId, expectedVersion: version
    }, ctx('HR_HEAD'));
    assert.equal(response.success, true);
    version = response.executionVersion;
  });

  const domainMethods = {
    PAYROLL: 'validatePayrollCycle', ATTENDANCE: 'validateAttendanceCycle', LEAVE: 'validateLeaveCycle',
    WORKFLOW: 'validateWorkflow', DOCUMENT: 'validateDocumentFlow',
    NOTIFICATION: 'validateNotifications', REPORTING: 'validateReporting'
  };
  Object.keys(domainMethods).forEach(domain => {
    const response = svc[domainMethods[domain]]({
      tenantSlug: 'tabsons', executionId, checkpoints: svc.DOMAIN_CHECKPOINTS[domain],
      actualStatus: 'PASSED', durationMs: 50, edgeCases: ['INTERRUPTED_EXECUTION'], expectedVersion: version
    }, ctx('HR_HEAD'));
    assert.equal(response.success, true, `${domain} validation should pass`);
    assert.equal(response.validation.productionDataModified, false);
    assert.equal(response.validation.liveProcessorInvoked, false);
    version = response.executionVersion;
  });

  svc.INTEGRATION_TYPES.forEach(integrationType => {
    const response = svc.validateIntegration({
      tenantSlug: 'tabsons', executionId, integrationType, actualStatus: 'PROPAGATED',
      expectedPropagation: `${integrationType} evidence matched.`, expectedVersion: version
    }, ctx('HR_HEAD'));
    assert.equal(response.success, true, `${integrationType} should validate`);
    assert.equal(response.validation.liveIntegrationInvoked, false);
    assert.equal(response.validation.productionDataModified, false);
    version = response.executionVersion;
  });
  const crossTenantIntegration = svc.validateIntegration({
    tenantSlug: 'tabsons', executionId, integrationType: 'LEAVE_TO_ATTENDANCE', actualStatus: 'PROPAGATED',
    targetTenantSlug: 'abc', expectedVersion: version
  }, ctx('HR_HEAD'));
  assert.equal(crossTenantIntegration.code, 'TENANT_ACCESS_DENIED');

  svc.RECOVERY_TYPES.forEach(failureType => {
    const response = svc.simulateRecovery({
      tenantSlug: 'tabsons', executionId, failureType,
      actualStatus: failureType === 'DATABASE_ROLLBACK' ? 'ROLLED_BACK' : 'RECOVERED',
      rollbackObserved: failureType === 'DATABASE_ROLLBACK',
      automaticRecoveryObserved: failureType === 'AUTOMATIC_RECOVERY',
      partialCommitObserved: false, failurePoint: `${failureType} sandbox checkpoint`,
      recoveryDurationMs: 75, expectedVersion: version
    }, ctx('HR_HEAD'));
    assert.equal(response.success, true, `${failureType} recovery should validate`);
    assert.equal(response.recovery.simulationOnly, true);
    assert.equal(response.recovery.productionDataModified, false);
    version = response.executionVersion;
  });

  const submitted = svc.submitExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: version }, ctx('HR_HEAD'));
  assert.equal(submitted.success, true);
  assert.equal(submitted.execution.status, 'SUBMITTED');
  assert.equal(submitted.execution.outcome, 'PASSED');

  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', executionId }, ctx('DIRECTOR'));
  assert.equal(analytics.analytics.scenarioPassRate, 100);
  assert.equal(analytics.analytics.businessProcessHealth, 100);
  assert.equal(analytics.analytics.integrationScore, 100);
  assert.equal(analytics.analytics.recoveryScore, 100);
  assert.equal(analytics.analytics.productionReadinessScore, 100);
  assert.equal(analytics.analytics.criticalFailures, 0);

  const jsonExport = svc.exportExecution({ tenantSlug: 'tabsons', executionId, format: 'JSON' }, ctx('HR_HEAD'));
  assert.equal(jsonExport.success, true);
  assert.equal(jsonExport.export.productionDataIncluded, false);
  assert.ok(jsonExport.export.fingerprint);
  assert.equal(JSON.parse(jsonExport.exportContent).productionDataIncluded, false);
  assert.equal(jsonExport.exportContent.includes('private company data'), false);
  assert.equal(jsonExport.exportContent.includes('50000'), false, 'payroll values should not be exported');
  const csvExport = svc.exportExecution({ tenantSlug: 'tabsons', executionId, format: 'CSV' }, ctx('HR_HEAD'));
  assert.match(csvExport.exportContent, /^scenario_code,step_code,module,status,duration_ms,attempt_count/);
  assert.equal(csvExport.exportContent.includes('employee@example.test'), false);

  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', executionId }, ctx('DIRECTOR'));
  assert.equal(dashboard.activeExecution.status, 'SUBMITTED');
  assert.equal(dashboard.businessScenarios.length, 1);
  assert.equal(dashboard.stepStates.length, 3);
  assert.equal(dashboard.domainValidations.length, 7);
  assert.equal(dashboard.integrationMap.length, 6);
  assert.equal(dashboard.recoveries.length, 7);
  assert.ok(dashboard.processTimeline.length > 0);
  assert.equal(dashboard.analytics.productionReadinessScore, 100);
  const background = svc.scheduleBackgroundExecution({ tenantSlug: 'tabsons', executionId }, ctx('HR_HEAD'));
  assert.equal(background.success, true);
  assert.equal(background.reportJob.background, true);
  assert.equal(background.reportJob.productionTrafficImpact, 'NONE');

  const second = svc.startExecution({ tenantSlug: 'tabsons', scenarioIds: [custom.scenario.scenarioId], seed: 'RECOVERY-NEGATIVE' }, ctx('HR_HEAD'));
  const partial = svc.simulateRecovery({
    tenantSlug: 'tabsons', executionId: second.execution.executionId,
    failureType: 'PARTIAL_TRANSACTION', actualStatus: 'RECOVERED', partialCommitObserved: true,
    expectedVersion: second.execution.version
  }, ctx('HR_HEAD'));
  assert.equal(partial.success, false, 'partial commits should fail recovery validation');
  const missingAutomatic = svc.simulateRecovery({
    tenantSlug: 'tabsons', executionId: second.execution.executionId,
    failureType: 'AUTOMATIC_RECOVERY', actualStatus: 'RECOVERED', automaticRecoveryObserved: false,
    expectedVersion: partial.executionVersion
  }, ctx('HR_HEAD'));
  assert.equal(missingAutomatic.success, false, 'automatic recovery requires explicit observed evidence');
  const cancelled = svc.cancelExecution({ tenantSlug: 'tabsons', executionId: second.execution.executionId, expectedVersion: missingAutomatic.executionVersion, reason: 'Negative recovery test complete.' }, ctx('HR_HEAD'));
  assert.equal(cancelled.execution.status, 'CANCELLED');

  const crossTenant = svc.listLibrary({ tenantSlug: 'abc' }, ctx('HR_HEAD', 'tabsons'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  const employeeDenied = svc.startExecution({ tenantSlug: 'tabsons', scenarioIds: [custom.scenario.scenarioId] }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(employeeDenied.code, 'E2E_RBAC_DENIED');
  const foreignRows = global.DB.get().endToEndValidationExecutions.filter(row => row.tenantSlug === 'abc');
  assert.equal(foreignRows.length, 0);

  assert.equal(protectedSnapshot(), before, 'UAT execution must not modify protected HR, payroll, attendance, or leave records');
  const data = global.DB.get();
  assert.ok(data.endToEndValidationStepResults.length >= 4, 'step history should remain append-only');
  assert.ok(data.endToEndRecoveryCheckpoints.length > 0, 'recovery checkpoints should be persisted');
  assert.ok(data.endToEndValidationAuditHistory.some(row => row.actionType === 'E2E_EXECUTION_STARTED'));
  assert.ok(data.endToEndValidationAuditHistory.some(row => row.actionType === 'E2E_EXECUTION_EXPORTED'));
  assert.ok(data.endToEndValidationAuditHistory.every(row => row.immutable === true));
  assert.ok(data.endToEndValidationEvents.every(row => row.immutable === true));
  assert.equal(JSON.stringify(data.endToEndValidationExecutions).includes('private company data'), false);

  const htmlPath = path.resolve(__dirname, '..', 'end-to-end-validation-center.html');
  assert.equal(fs.existsSync(htmlPath), true, 'the End-to-End Validation Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /End-to-End Validation Center/);
  assert.match(html, /endToEndValidationService\.js/);
  assert.match(html, /Integration Map/);
  assert.match(html, /Recovery Lab/);

  console.log('End-to-end validation service tests passed.');
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
