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
function fakeEl() { return { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {}, querySelector() { return null; }, querySelectorAll() { return []; }, value: '', textContent: '', innerHTML: '' }; }
function load(file) { require(path.resolve(__dirname, '..', file)); }
function setupRuntime() {
  global.window = global; global.localStorage = new Store(); global.sessionStorage = new Store(); global.confirm = () => true; global.alert = () => {};
  global.navigator = { userAgent: 'Node HR UAT test', platform: 'Win32' };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/hr-uat-center.html', replace(url) { this.href = url; } };
  global.document = { querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl() };
}
function ctx(role = 'HR_HEAD', tenantSlug = 'tabsons', id = 'HRH-1') { return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-02T10:00:00.000Z' }; }
function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [{ tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' }, { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'private company data' }];
  data.employees = [{ id: 'E1', tenantSlug: 'tabsons', name: 'HR User', salary: 100000 }, { id: 'ABC-1', tenantSlug: 'abc', name: 'Private User', privateNote: 'private company data' }];
  data.leaveRequests = [{ id: 'L1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.attendance = [{ id: 'A1', tenantSlug: 'tabsons', status: 'PRESENT' }];
  data.payroll = [{ id: 'P1', tenantSlug: 'tabsons', netSalary: 90000 }];
  data.shifts = [{ id: 'S1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.workflows = [{ id: 'W1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.documents = [{ id: 'D1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.notifications = [{ id: 'N1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.recruitment = [{ id: 'R1', tenantSlug: 'tabsons', status: 'OPEN' }];
  Object.values({ suites: 'hrUATSuites', cases: 'hrUATTestCases', executions: 'hrUATExecutions', events: 'hrUATExecutionEvents', results: 'hrUATCaseResultHistory', evidence: 'hrUATEvidence', issues: 'hrUATIssues', issueHistory: 'hrUATIssueHistory', signoffs: 'hrUATSignoffs', analytics: 'hrUATAnalytics', checkpoints: 'hrUATRecoveryCheckpoints', reports: 'hrUATBackgroundReports', audit: 'hrUATAuditHistory' }).forEach(key => { data[key] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function main() {
  setupRuntime(); global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js', 'services/asyncJobService.js'].forEach(load);
  seed();
  global.HRUATDigitalSignatureService = Object.freeze({ sign(value, options) { return { signature: `uat-sign-${options.stage}-${value.length}`, algorithm: options.algorithm, keyId: 'UAT-KMS-1' }; } });
  global.__ARTHHRMS_DEV__ = true; load('services/hrUATService.js');
  const svc = global.HRUATService;
  assert.ok(svc, 'HRUATService should be exported');
  assert.equal(global.hrUATService, svc, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service should be immutable');
  ['TestExecutionEngine', 'TestCaseLibrary', 'EvidenceManager', 'HRSignoffService', 'UATAnalyticsService'].forEach(name => { assert.ok(svc[name], `${name} should be exported`); assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`); });
  assert.equal(global.__ARTHHRMS_HR_UAT_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = global.DB.get();
  const protectedBefore = JSON.stringify({ employees: before.employees, leaveRequests: before.leaveRequests, attendance: before.attendance, payroll: before.payroll, shifts: before.shifts, workflows: before.workflows, documents: before.documents, notifications: before.notifications, recruitment: before.recruitment });

  const library = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(library.success, true);
  assert.ok(library.suiteCount >= 13, 'predefined suites should load');
  assert.ok(library.testCaseCount >= 20, 'business and governance cases should load');
  const again = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(again.createdCases, 0, 'library initialization should be idempotent');

  const custom = svc.createCustomSuite({ tenantSlug: 'tabsons', name: 'HR Pilot Acceptance', code: 'HR_PILOT', mandatory: true }, ctx());
  assert.equal(custom.success, true, 'custom suite should be created');
  const testCase = svc.addTestCase({ tenantSlug: 'tabsons', suiteId: custom.suite.suiteId, module: 'EMPLOYEE_LIFECYCLE', description: 'Validate pilot employee creation', preconditions: 'Pilot organization configured.', steps: ['Open employee form.', 'Submit sandbox employee.', 'Verify audit result.'], expectedResult: 'Sandbox employee passes validation and live records remain unchanged.', priority: 'CRITICAL', mandatory: true }, ctx());
  assert.equal(testCase.success, true, 'custom test case should be created');
  const duplicate = svc.addTestCase({ tenantSlug: 'tabsons', suiteId: custom.suite.suiteId, description: 'Validate pilot employee creation', steps: ['Repeat.'], expectedResult: 'Duplicate is blocked.' }, ctx());
  assert.equal(duplicate.code, 'DUPLICATE_UAT_TEST_CASE');

  const started = svc.startExecution({ tenantSlug: 'tabsons', name: 'HR Pilot UAT', suiteIds: [custom.suite.suiteId], seed: 'TABSONS-UAT-2026-01' }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(started.success, true, 'execution should start');
  assert.equal(started.execution.reproducible, true);
  assert.ok(started.execution.manifestFingerprint);
  assert.equal(started.execution.manifest.seed, 'TABSONS-UAT-2026-01');
  const executionId = started.execution.executionId;

  const paused = svc.pauseExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: 1, reason: 'Shift handover.' }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(paused.execution.status, 'PAUSED');
  const resumed = svc.resumeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: paused.execution.version }, ctx('HR_MANAGER', 'tabsons', 'HRM-1'));
  assert.equal(resumed.execution.status, 'RUNNING');
  const stale = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: testCase.testCase.testId, status: 'FAILED', actualResult: 'Failure.', expectedVersion: 1 }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(stale.code, 'HR_UAT_EXECUTION_VERSION_CONFLICT', 'stale concurrent edit should be rejected');

  const failed = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: testCase.testCase.testId, status: 'FAILED', actualResult: 'Audit marker was not visible.', expectedVersion: resumed.execution.version }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(failed.success, true);
  const evidence = svc.addEvidence({ tenantSlug: 'tabsons', executionId, testId: testCase.testCase.testId, evidenceType: 'SCREENSHOT', title: 'Missing audit marker', storageReference: 'ATT-UAT-1', mimeType: 'image/png', sizeBytes: 2048, checksum: 'sha256-test' }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(evidence.success, true, 'evidence should be recorded');
  assert.equal(evidence.evidence.rawContentStored, false, 'raw evidence content must not be stored');
  const tooLarge = svc.addEvidence({ tenantSlug: 'tabsons', executionId, evidenceType: 'ATTACHMENT', storageReference: 'ATT-HUGE', sizeBytes: 60 * 1024 * 1024 }, ctx());
  assert.equal(tooLarge.code, 'HR_UAT_EVIDENCE_TOO_LARGE');

  const issue = svc.createIssue({ tenantSlug: 'tabsons', executionId, testId: testCase.testCase.testId, title: 'Audit marker missing', severity: 'HIGH', priority: 'HIGH', module: 'EMPLOYEE_LIFECYCLE', stepsToReproduce: 'Run the sandbox employee creation case.', assignedDeveloper: 'DEV-1' }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(issue.success, true, 'issue should be created');
  const resolved = svc.updateIssue({ tenantSlug: 'tabsons', issueId: issue.issue.issueId, resolutionStatus: 'RESOLVED', resolutionNotes: 'Audit marker restored.' }, ctx('HR_MANAGER', 'tabsons', 'HRM-1'));
  assert.equal(resolved.issue.resolutionStatus, 'RESOLVED');

  const retest = svc.retestFailedCases({ tenantSlug: 'tabsons', executionId, expectedVersion: issue.executionVersion, results: [{ testId: testCase.testCase.testId, status: 'PASSED', actualResult: 'Audit marker is visible and correct.' }] }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  assert.equal(retest.success, true, 'failed case should pass on retest');
  const completed = svc.completeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: retest.finalVersion }, ctx('HR_MANAGER', 'tabsons', 'HRM-1'));
  assert.equal(completed.execution.outcome, 'PASSED');

  const executive = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_EXECUTIVE', confirmed: true, remarks: 'Execution evidence reviewed.' }, ctx('HR_EXECUTIVE', 'tabsons', 'HRE-1'));
  const manager = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_MANAGER', confirmed: true, remarks: 'Defect resolution reviewed.' }, ctx('HR_MANAGER', 'tabsons', 'HRM-1'));
  const head = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_HEAD', confirmed: true, remarks: 'HR UAT accepted.' }, ctx('HR_HEAD', 'tabsons', 'HRH-1'));
  assert.equal(executive.success, true); assert.equal(manager.success, true); assert.equal(head.success, true);
  assert.equal(head.signoff.readyForGoLiveReview, true);
  assert.equal(head.signoff.deploymentTriggered, false);
  assert.match(head.signoff.digitalSignature, /^uat-sign-HR_HEAD-/);
  const conflict = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_HEAD', confirmed: true }, ctx());
  assert.equal(conflict.code, 'HR_UAT_SIGNOFF_CONFLICT');

  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(analytics.success, true);
  assert.equal(analytics.analytics.matrix.passed, 1);
  assert.equal(analytics.analytics.matrix.retested, 1);
  assert.equal(analytics.analytics.passRate, 100);
  assert.equal(analytics.analytics.hrReadinessScore, 100);
  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.activeExecution.manifestFingerprint, started.execution.manifestFingerprint);
  assert.equal(dashboard.signoffs.length, 3);
  assert.equal(dashboard.evidence.length, 1);
  assert.equal(dashboard.issues.length, 1);
  const background = svc.scheduleBackgroundReport({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(background.success, true);
  assert.equal(background.reportJob.productionTrafficImpact, 'NONE');

  const second = svc.startExecution({ tenantSlug: 'tabsons', suiteIds: [custom.suite.suiteId] }, ctx());
  const cancelled = svc.cancelExecution({ tenantSlug: 'tabsons', executionId: second.execution.executionId, expectedVersion: second.execution.version, reason: 'Duplicate UAT cycle.' }, ctx());
  assert.equal(cancelled.execution.status, 'CANCELLED');
  const crossTenant = svc.listLibrary({ tenantSlug: 'abc' }, ctx('HR_HEAD', 'tabsons'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /private company data/i);
  const denied = svc.startExecution({ tenantSlug: 'tabsons' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(denied.code, 'HR_UAT_RBAC_DENIED');

  const after = global.DB.get();
  const protectedAfter = JSON.stringify({ employees: after.employees, leaveRequests: after.leaveRequests, attendance: after.attendance, payroll: after.payroll, shifts: after.shifts, workflows: after.workflows, documents: after.documents, notifications: after.notifications, recruitment: after.recruitment });
  assert.equal(protectedAfter, protectedBefore, 'UAT must not mutate existing HR business data');
  assert.ok(after.hrUATExecutionEvents.every(row => row.immutable === true));
  assert.ok(after.hrUATCaseResultHistory.every(row => row.immutable === true));
  assert.ok(after.hrUATSignoffs.every(row => row.immutable === true));
  ['HR_UAT_EXECUTION_STARTED', 'HR_UAT_TEST_RESULT_RECORDED', 'HR_UAT_ISSUE_CREATED', 'HR_UAT_EVIDENCE_ADDED', 'HR_UAT_SIGNOFF_RECORDED'].forEach(action => assert.ok(after.hrUATAuditHistory.some(row => row.actionType === action), `${action} should be audited`));
  assert.doesNotMatch(JSON.stringify(dashboard), /100000|90000|private company data/i, 'dashboard must not expose sensitive business data');

  const htmlPath = path.resolve(__dirname, '..', 'hr-uat-center.html');
  assert.ok(fs.existsSync(htmlPath), 'HR UAT Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /HR UAT Center/i);
  assert.match(html, /hrUATService\.js/i);
  console.log('hrUATService.test.js passed');
}
main();
