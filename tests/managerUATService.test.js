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
  global.navigator = { userAgent: 'Node Manager UAT test', platform: 'Win32' };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/manager-uat-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'ADMIN', tenantSlug = 'tabsons', id = 'ADMIN-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-18T10:00:00.000Z' };
}

const TABLES = [
  'managerUATSuites', 'managerUATTestCases', 'managerUATExecutions', 'managerUATExecutionEvents',
  'managerUATResultHistory', 'managerUATApprovalValidations', 'managerUATWorkflowValidations',
  'managerUATEvidence', 'managerUATIssues', 'managerUATIssueHistory', 'managerUATSignoffs',
  'managerUATAnalytics', 'managerUATRecoveryCheckpoints', 'managerUATRevocations',
  'managerUATBackgroundReports', 'managerUATAuditHistory'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [{ tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' }, { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'private company data' }];
  data.employees = [
    { id: 'M1', tenantSlug: 'tabsons', name: 'Manager One', role: 'MANAGER', salary: 100000 },
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', managerId: 'M1', salary: 60000 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', privateNote: 'private company data' }
  ];
  data.reportingHierarchyRelationships = [{ relationshipId: 'REL-1', tenantSlug: 'tabsons', employeeId: 'E1', managerId: 'M1', relationshipType: 'DIRECT_MANAGER', status: 'ACTIVE' }];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.attendanceRegularizations = [{ id: 'REG-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.shiftSwapRequests = [{ id: 'SWAP-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.expenseClaims = [{ id: 'EXP-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING', amount: 1000 }];
  data.recruitment = [{ id: 'REC-1', tenantSlug: 'tabsons', status: 'PENDING' }];
  data.performanceReviews = [{ id: 'PERF-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.trainingRequests = [{ id: 'TRN-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.promotionRequests = [{ id: 'PRO-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.transferRequests = [{ id: 'TRA-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.exitClearances = [{ id: 'EXIT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'PENDING' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'QUEUED' }];
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    reportingHierarchyRelationships: data.reportingHierarchyRelationships,
    leaveRequests: data.leaveRequests,
    attendance: data.attendance,
    attendanceRegularizations: data.attendanceRegularizations,
    shiftSwapRequests: data.shiftSwapRequests,
    expenseClaims: data.expenseClaims,
    recruitment: data.recruitment,
    performanceReviews: data.performanceReviews,
    trainingRequests: data.trainingRequests,
    promotionRequests: data.promotionRequests,
    transferRequests: data.transferRequests,
    exitClearances: data.exitClearances,
    payroll: data.payroll,
    workflows: data.workflows,
    approvals: data.approvals,
    notifications: data.notifications
  });
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js', 'services/asyncJobService.js'].forEach(load);
  seed();
  global.ManagerUATDigitalSignatureService = Object.freeze({
    sign(value, options) { return { signature: `manager-uat-${options.stage}-${value.length}`, algorithm: options.algorithm, keyId: 'MANAGER-UAT-KMS-1' }; }
  });
  global.__ARTHHRMS_DEV__ = true;
  load('services/managerUATService.js');

  const svc = global.ManagerUATService;
  assert.ok(svc, 'ManagerUATService should be exported');
  assert.equal(global.managerUATService, svc, 'lowercase service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service should be immutable');
  ['ManagerUATService', 'ManagerWorkflowValidator', 'ApprovalValidationEngine', 'EvidenceService', 'ManagerSignoffService', 'ManagerAnalyticsService'].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  assert.equal(global.__ARTHHRMS_MANAGER_UAT_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = protectedSnapshot();
  const library = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(library.success, true);
  assert.ok(library.suiteCount >= 15, 'all predefined manager suites should load');
  assert.ok(library.caseCount >= 17, 'manager workflow and governance cases should load');
  const again = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(again.suitesAdded, 0, 'suite initialization should be idempotent');
  assert.equal(again.casesAdded, 0, 'test case initialization should be idempotent');

  const custom = svc.createCustomSuite({ tenantSlug: 'tabsons', name: 'Manager Pilot', code: 'MANAGER_PILOT' }, ctx());
  assert.equal(custom.success, true);
  const customCase = svc.addTestCase({
    tenantSlug: 'tabsons', suiteId: custom.suite.suiteId, module: 'CUSTOM_MANAGER_WORKFLOWS',
    description: 'Validate a manager pilot workflow', preconditions: 'Sandbox workflow is configured.',
    executionSteps: ['Open the manager task.', 'Record the observed sandbox outcome.', 'Review audit history.'],
    expectedResult: 'The observed outcome matches the approved workflow without executing a production action.',
    priority: 'CRITICAL', mandatory: true, code: 'PILOT_WORKFLOW'
  }, ctx());
  assert.equal(customCase.success, true);

  const started = svc.startExecution({
    tenantSlug: 'tabsons', name: 'Manager Pilot UAT', managerId: 'M1', suiteIds: [custom.suite.suiteId], seed: 'MGR-UAT-2026-01',
    hierarchySnapshot: { managerId: 'M1', reportingEmployeeIds: ['E1'], approvalPaths: [['E1', 'M1']], effectiveAt: '2026-07-18T10:00:00.000Z' }
  }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(started.success, true);
  assert.equal(started.execution.reproducible, true);
  assert.equal(started.execution.productionDataModified, false);
  assert.ok(started.execution.manifestFingerprint);
  const executionId = started.execution.executionId;

  const paused = svc.pauseExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: started.execution.version, reason: 'Manager handover.' }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(paused.execution.status, 'PAUSED');
  const resumed = svc.resumeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: paused.execution.version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(resumed.execution.status, 'RUNNING');
  const stale = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, status: 'FAILED', actualResult: 'Stale result.', expectedVersion: 1 }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(stale.code, 'MANAGER_UAT_EXECUTION_VERSION_CONFLICT');

  const failed = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, status: 'FAILED', actualResult: 'Expected audit marker was absent.', expectedVersion: resumed.execution.version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(failed.success, true);
  const evidence = svc.addEvidence({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, evidenceType: 'SCREENSHOT', title: 'Observed failure', storageReference: 'EVIDENCE-1', mimeType: 'image/png', sizeBytes: 2048, checksum: 'sha256-manager-uat' }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(evidence.success, true);
  assert.equal(evidence.evidence.rawContentStored, false, 'only governed evidence metadata should be stored');
  const issue = svc.createIssue({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, title: 'Manager audit marker missing', severity: 'HIGH', priority: 'HIGH', stepsToReproduce: 'Run the sandbox manager pilot case.', assignedDeveloper: 'DEV-1' }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(issue.success, true);
  const resolved = svc.updateIssue({ tenantSlug: 'tabsons', issueId: issue.issue.issueId, resolutionStatus: 'RESOLVED', resolutionNotes: 'Audit marker restored.' }, ctx('DEPARTMENT_HEAD', 'tabsons', 'HEAD-1'));
  assert.equal(resolved.issue.resolutionStatus, 'RESOLVED');
  const retry = svc.retryFailedCases({ tenantSlug: 'tabsons', executionId, expectedVersion: issue.executionVersion, results: [{ testId: customCase.testCase.testId, status: 'PASSED', actualResult: 'Expected result and audit marker observed.' }] }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(retry.success, true);
  let version = retry.finalVersion;

  const approvalInputs = [
    { approvalType: 'SINGLE_LEVEL', requesterId: 'E1', approvers: ['M1'] },
    { approvalType: 'MULTI_LEVEL', requesterId: 'E1', approvers: ['M1', 'HEAD-1'] },
    { approvalType: 'PARALLEL', requesterId: 'E1', approvers: ['M1', 'HR-1'] },
    { approvalType: 'CONDITIONAL', requesterId: 'E1', approvers: ['M1'] },
    { approvalType: 'ESCALATION', requesterId: 'E1', approvers: ['M1', 'HEAD-1'] },
    { approvalType: 'DELEGATION', requesterId: 'E1', approvers: ['M1'], delegationExpiresAt: '2026-07-19T10:00:00.000Z' },
    { approvalType: 'HISTORY', requesterId: 'E1', approvers: ['M1'] }
  ];
  approvalInputs.forEach((row) => {
    const response = svc.validateApprovalScenario({ tenantSlug: 'tabsons', executionId, scenario: `${row.approvalType} manager approval`, actualStatus: 'PASSED', currentManagerId: 'M1', expectedVersion: version, ...row }, ctx('MANAGER', 'tabsons', 'M1'));
    assert.equal(response.success, true, `${row.approvalType} should validate`);
    assert.equal(response.validation.productionActionExecuted, false);
    version = response.executionVersion;
  });

  const circular = svc.validateApprovalScenario({ tenantSlug: 'tabsons', executionId, approvalType: 'MULTI_LEVEL', requesterId: 'E1', approvers: ['M1', 'HEAD-1'], approvalPath: ['E1', 'M1', 'E1'], actualStatus: 'PASSED', currentManagerId: 'M1', expectedVersion: version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(circular.validation.status, 'BLOCKED');
  assert.ok(circular.validation.findings.some(row => row.code === 'CIRCULAR_APPROVAL'));
  version = circular.executionVersion;
  const expired = svc.validateApprovalScenario({ tenantSlug: 'tabsons', executionId, approvalType: 'DELEGATION', requesterId: 'E1', approvers: ['M1'], delegationExpiresAt: '2026-07-17T10:00:00.000Z', actualStatus: 'PASSED', currentManagerId: 'M1', expectedVersion: version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.ok(expired.validation.findings.some(row => row.code === 'DELEGATION_EXPIRED'));
  version = expired.executionVersion;
  const changed = svc.validateApprovalScenario({ tenantSlug: 'tabsons', executionId, approvalType: 'SINGLE_LEVEL', requesterId: 'E1', approvers: ['M2'], actualStatus: 'PASSED', currentManagerId: 'M2', expectedVersion: version }, ctx('DEPARTMENT_HEAD', 'tabsons', 'HEAD-1'));
  assert.ok(changed.validation.findings.some(row => row.code === 'MANAGER_CHANGED_DURING_UAT'));
  version = changed.executionVersion;
  const crossTenantApproval = svc.validateApprovalScenario({ tenantSlug: 'tabsons', executionId, approvalType: 'SINGLE_LEVEL', requesterId: 'E1', approvers: [{ id: 'ABC-1', tenantSlug: 'abc' }], actualStatus: 'PASSED', expectedVersion: version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(crossTenantApproval.code, 'TENANT_ACCESS_DENIED');

  [circular, expired, changed].forEach((response) => {
    const revoked = svc.revokeGovernanceRecord({ tenantSlug: 'tabsons', entityType: 'APPROVAL_VALIDATION', entityId: response.validation.validationId, reason: 'Negative governance scenario completed.' }, ctx());
    assert.equal(revoked.success, true);
    assert.equal(revoked.revocation.sourceRecordPreserved, true);
  });

  ['LEAVE_REQUEST', 'ATTENDANCE_REGULARIZATION', 'SHIFT_SWAP', 'EXPENSE_CLAIM', 'RECRUITMENT_REQUEST', 'PROMOTION_REQUEST', 'TRANSFER_REQUEST', 'TRAINING_REQUEST'].forEach((workflowType) => {
    const response = svc.validateWorkflowScenario({ tenantSlug: 'tabsons', executionId, workflowType, scenario: `${workflowType} observed manager flow`, expectedStatus: 'COMPLETED', actualStatus: 'COMPLETED', workflowReference: `SANDBOX-${workflowType}`, expectedVersion: version }, ctx('MANAGER', 'tabsons', 'M1'));
    assert.equal(response.success, true, `${workflowType} should validate`);
    assert.equal(response.validation.liveWorkflowInvoked, false);
    assert.equal(response.validation.productionActionExecuted, false);
    version = response.executionVersion;
  });

  const completed = svc.completeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: version }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(completed.execution.outcome, 'PASSED');
  const manager = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'MANAGER', currentManagerId: 'M1', confirmed: true, remarks: 'Manager validation complete.' }, ctx('MANAGER', 'tabsons', 'M1'));
  const head = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'DEPARTMENT_HEAD', confirmed: true, remarks: 'Department validation complete.' }, ctx('DEPARTMENT_HEAD', 'tabsons', 'HEAD-1'));
  const hr = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true, remarks: 'HR validation complete.' }, ctx('HR', 'tabsons', 'HR-1'));
  assert.equal(manager.success, true); assert.equal(head.success, true); assert.equal(hr.success, true);
  assert.equal(hr.signoff.readyForGoLiveReview, true);
  assert.match(hr.signoff.digitalSignature, /^manager-uat-HR_VALIDATION-/);
  const signoffConflict = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true }, ctx('HR', 'tabsons', 'HR-2'));
  assert.equal(signoffConflict.code, 'MANAGER_UAT_SIGNOFF_CONFLICT');

  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(analytics.success, true);
  assert.equal(analytics.analytics.passRate, 100);
  assert.equal(analytics.analytics.approvalSuccessRate, 100);
  assert.equal(analytics.analytics.workflowSuccessRate, 100);
  assert.ok(analytics.analytics.managerReadinessScore >= 90);
  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.approvalValidations.length, 10);
  assert.equal(dashboard.workflowValidations.length, 8);
  assert.equal(dashboard.signoffs.length, 3);
  assert.equal(dashboard.revocations.length, 3);
  assert.equal(dashboard.activeExecution.manifestFingerprint, started.execution.manifestFingerprint);
  const background = svc.scheduleBackgroundAnalytics({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(background.success, true);
  assert.equal(background.reportJob.productionTrafficImpact, 'NONE');

  const revokedSignoff = svc.revokeGovernanceRecord({ tenantSlug: 'tabsons', entityType: 'SIGNOFF', entityId: hr.signoff.signoffId, reason: 'Sign-off evidence requires renewal.' }, ctx());
  assert.equal(revokedSignoff.success, true);
  assert.equal(global.DB.get().managerUATSignoffs.some(row => row.signoffId === hr.signoff.signoffId), true, 'revocation must retain original sign-off');

  const changedManagerSignoff = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true }, ctx('HR', 'tabsons', 'HR-2'));
  assert.equal(changedManagerSignoff.success, true, 'revoked final sign-off may be re-recorded through the governed sequence');

  const second = svc.startExecution({ tenantSlug: 'tabsons', managerId: 'M1', suiteIds: [custom.suite.suiteId], hierarchySnapshot: { managerId: 'M1', reportingEmployeeIds: ['E1'] } }, ctx('MANAGER', 'tabsons', 'M1'));
  const cancelled = svc.cancelExecution({ tenantSlug: 'tabsons', executionId: second.execution.executionId, expectedVersion: second.execution.version, reason: 'Superseded run.' }, ctx('MANAGER', 'tabsons', 'M1'));
  assert.equal(cancelled.execution.status, 'CANCELLED');
  const changedManagerBlocked = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'MANAGER', currentManagerId: 'M2', confirmed: true }, ctx('MANAGER', 'tabsons', 'M2'));
  assert.equal(changedManagerBlocked.code, 'MANAGER_UAT_MANAGER_CHANGED');
  const crossTenant = svc.listLibrary({ tenantSlug: 'abc' }, ctx('ADMIN', 'tabsons'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /private company data/i);
  const denied = svc.startExecution({ tenantSlug: 'tabsons', managerId: 'E1' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(denied.code, 'MANAGER_UAT_RBAC_DENIED');

  assert.equal(protectedSnapshot(), before, 'Manager UAT must not modify production business records');
  const data = global.DB.get();
  assert.ok(data.managerUATExecutionEvents.every(row => row.immutable === true));
  assert.ok(data.managerUATResultHistory.every(row => row.immutable === true));
  assert.ok(data.managerUATApprovalValidations.every(row => row.immutable === true));
  assert.ok(data.managerUATWorkflowValidations.every(row => row.immutable === true));
  assert.ok(data.managerUATSignoffs.every(row => row.immutable === true));
  assert.ok(data.managerUATRevocations.every(row => row.immutable === true));
  ['MANAGER_UAT_EXECUTION_STARTED', 'MANAGER_UAT_TEST_RESULT_RECORDED', 'MANAGER_UAT_APPROVAL_VALIDATED', 'MANAGER_UAT_WORKFLOW_VALIDATED', 'MANAGER_UAT_EVIDENCE_ADDED', 'MANAGER_UAT_ISSUE_CREATED', 'MANAGER_UAT_SIGNOFF_RECORDED', 'MANAGER_UAT_GOVERNANCE_RECORD_REVOKED'].forEach(action => {
    assert.ok(data.managerUATAuditHistory.some(row => row.actionType === action), `${action} should be audited`);
  });
  assert.doesNotMatch(JSON.stringify(dashboard), /100000|60000|50000|private company data/i, 'dashboard must not expose sensitive business data');

  const htmlPath = path.resolve(__dirname, '..', 'manager-uat-center.html');
  assert.ok(fs.existsSync(htmlPath), 'Manager UAT Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Manager UAT Center/i);
  assert.match(html, /managerUATService\.js/i);
  assert.match(html, /Approval Validation/i);
  assert.match(html, /Workflow Results/i);

  console.log('managerUATService.test.js passed');
}

main();
