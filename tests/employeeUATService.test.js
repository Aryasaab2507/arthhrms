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
  global.navigator = { userAgent: 'Node Employee UAT test', platform: 'Win32', onLine: true };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/employee-uat-center.html', replace(url) { this.href = url; } };
  global.document = { querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl() };
}
function ctx(role = 'ADMIN', tenantSlug = 'tabsons', id = 'ADMIN-1') { return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-18T10:00:00.000Z' }; }

const TABLES = [
  'employeeUATSuites', 'employeeUATTestCases', 'employeeUATExecutions', 'employeeUATExecutionEvents',
  'employeeUATResultHistory', 'employeeUATESSValidations', 'employeeUATMobileValidations',
  'employeeUATCommunicationValidations', 'employeeUATEvidence', 'employeeUATIssues',
  'employeeUATIssueHistory', 'employeeUATFeedback', 'employeeUATSignoffs', 'employeeUATAnalytics',
  'employeeUATRecoveryCheckpoints', 'employeeUATRevocations', 'employeeUATBackgroundReports', 'employeeUATAuditHistory'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [{ tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' }, { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'private company data' }];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', managerId: 'M1', role: 'EMPLOYEE', salary: 60000, email: 'employee@example.test' },
    { id: 'M1', tenantSlug: 'tabsons', name: 'Manager One', role: 'MANAGER', salary: 100000 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', privateNote: 'private company data' }
  ];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.attendanceRegularizations = [{ id: 'REG-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.shiftRosterAssignments = [{ id: 'SHIFT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  data.workingCalendarConfigurations = [{ id: 'CAL-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  data.expenseClaims = [{ id: 'EXP-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING', amount: 1000 }];
  data.performanceReviews = [{ id: 'PERF-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.trainingRequests = [{ id: 'TRN-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PENDING' }];
  data.helpDeskTickets = [{ id: 'HELP-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'OPEN' }];
  data.announcements = [{ id: 'ANN-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'DELIVERED' }];
  data.sessions = [{ id: 'SESSION-1', tenantSlug: 'tabsons', employeeId: 'E1', state: 'ACTIVE', token: 'must-not-leak' }];
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees, leaveRequests: data.leaveRequests, attendance: data.attendance,
    attendanceRegularizations: data.attendanceRegularizations, shiftRosterAssignments: data.shiftRosterAssignments,
    workingCalendarConfigurations: data.workingCalendarConfigurations, payroll: data.payroll, documents: data.documents,
    expenseClaims: data.expenseClaims, performanceReviews: data.performanceReviews, trainingRequests: data.trainingRequests,
    helpDeskTickets: data.helpDeskTickets, announcements: data.announcements, notifications: data.notifications, sessions: data.sessions
  });
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js', 'services/asyncJobService.js'].forEach(load);
  seed();
  global.EmployeeUATDigitalSignatureService = Object.freeze({ sign(value, options) { return { signature: `ess-uat-${options.stage}-${value.length}`, algorithm: options.algorithm, keyId: 'ESS-UAT-KMS-1' }; } });
  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeUATService.js');

  const svc = global.EmployeeUATService;
  assert.ok(svc, 'EmployeeUATService should be exported');
  assert.equal(global.employeeUATService, svc, 'lowercase service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service should be immutable');
  ['EmployeeUATService', 'ESSValidationEngine', 'PortalHealthService', 'EmployeeFeedbackService', 'EvidenceManager', 'ESSAnalyticsService'].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  assert.equal(global.__ARTHHRMS_EMPLOYEE_UAT_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = protectedSnapshot();
  const library = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(library.success, true);
  assert.ok(library.suiteCount >= 18, 'all predefined employee suites should load');
  assert.ok(library.caseCount >= 20, 'portal, ESS, communication, and mobile cases should load');
  const again = svc.initializeLibrary({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(again.suitesAdded, 0);
  assert.equal(again.casesAdded, 0);

  const custom = svc.createCustomSuite({ tenantSlug: 'tabsons', name: 'ESS Pilot', code: 'ESS_PILOT' }, ctx());
  const customCase = svc.addTestCase({ tenantSlug: 'tabsons', suiteId: custom.suite.suiteId, code: 'PILOT_PORTAL', feature: 'CUSTOM', description: 'Validate the ESS pilot experience', preconditions: 'Sandbox employee and portal are configured.', executionSteps: ['Open the pilot portal.', 'Record observed behavior.', 'Review evidence.'], expectedResult: 'The pilot passes without modifying employee data.', priority: 'CRITICAL', mandatory: true }, ctx());
  assert.equal(customCase.success, true);

  const started = svc.startExecution({ tenantSlug: 'tabsons', employeeId: 'E1', name: 'ESS Pilot UAT', suiteIds: [custom.suite.suiteId], seed: 'ESS-UAT-2026-01', deviceSnapshot: { platform: 'WEB', browser: 'Chrome', viewport: '1366x768', networkProfile: 'NORMAL' } }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(started.success, true);
  assert.equal(started.execution.productionDataModified, false);
  assert.equal(started.execution.reproducible, true);
  const executionId = started.execution.executionId;

  const paused = svc.pauseExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: started.execution.version, reason: 'Network interruption.' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  const saved = svc.saveProgress({ tenantSlug: 'tabsons', executionId, expectedVersion: paused.execution.version, reason: 'Offline recovery checkpoint.' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.ok(saved.recoveryToken, 'save progress should create a recovery token');
  const resumed = svc.resumeExecution({ tenantSlug: 'tabsons', executionId, expectedVersion: saved.execution.version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(resumed.execution.status, 'RUNNING');
  const stale = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, status: 'FAILED', actualResult: 'Stale result.', expectedVersion: 1 }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(stale.code, 'EMPLOYEE_UAT_EXECUTION_VERSION_CONFLICT');

  const failed = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, status: 'FAILED', actualResult: 'Responsive navigation did not recover.', submissionId: 'RESULT-1', expectedVersion: resumed.execution.version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(failed.success, true);
  const replay = svc.recordTestResult({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, status: 'FAILED', actualResult: 'Duplicate network retry.', submissionId: 'RESULT-1', expectedVersion: resumed.execution.version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(replay.code, 'EMPLOYEE_UAT_DUPLICATE_SUBMISSION_REPLAYED');
  assert.equal(replay.duplicate, true);
  const evidence = svc.addEvidence({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, evidenceType: 'SCREENSHOT', title: 'Responsive failure', storageReference: 'ESS-ATT-1', mimeType: 'image/png', sizeBytes: 4096, checksum: 'sha256-ess-uat' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(evidence.success, true);
  assert.equal(evidence.evidence.rawContentStored, false);
  const tooLarge = svc.addEvidence({ tenantSlug: 'tabsons', executionId, evidenceType: 'ATTACHMENT', storageReference: 'ESS-HUGE', sizeBytes: 60 * 1024 * 1024 }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(tooLarge.code, 'EMPLOYEE_UAT_EVIDENCE_TOO_LARGE');
  const issue = svc.createIssue({ tenantSlug: 'tabsons', executionId, testId: customCase.testCase.testId, title: 'Responsive recovery failure', severity: 'HIGH', priority: 'HIGH', stepsToReproduce: 'Throttle the sandbox browser and resume the test.', device: 'Tablet', browser: 'Chrome', osVersion: 'Windows 11', logReference: 'LOG-ESS-1', assignedDeveloper: 'DEV-1' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(issue.success, true);
  const resolved = svc.updateIssue({ tenantSlug: 'tabsons', issueId: issue.issue.issueId, resolutionStatus: 'RESOLVED', resolutionNotes: 'Responsive recovery verified.' }, ctx('HR', 'tabsons', 'HR-1'));
  assert.equal(resolved.issue.resolutionStatus, 'RESOLVED');
  const retry = svc.retryFailedCases({ tenantSlug: 'tabsons', executionId, expectedVersion: issue.executionVersion, results: [{ testId: customCase.testCase.testId, status: 'PASSED', actualResult: 'Responsive navigation recovered and retained progress.', submissionId: 'RESULT-2' }] }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(retry.success, true);
  let version = retry.finalVersion;

  svc.ESS_FEATURES.forEach(feature => {
    const response = svc.validateESSFeature({ tenantSlug: 'tabsons', executionId, feature, scenario: `${feature} observed sandbox validation`, expectedStatus: 'COMPLETED', actualStatus: 'PASSED', expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
    assert.equal(response.success, true, `${feature} should validate`);
    assert.equal(response.validation.liveESSActionInvoked, false);
    assert.equal(response.validation.productionActionExecuted, false);
    version = response.executionVersion;
  });

  svc.MOBILE_TARGETS.forEach(target => {
    const response = svc.validateMobileExperience({ tenantSlug: 'tabsons', executionId, target, scenario: `${target} experience`, actualStatus: target === 'OFFLINE_HANDLING' ? 'RECOVERED' : 'PASSED', device: target.includes('IOS') ? 'iPhone' : target.includes('ANDROID') ? 'Android' : 'Test device', browser: target.includes('IOS') ? 'Safari' : 'Chrome', osVersion: 'Current', viewport: target === 'LOW_RESOLUTION' ? '320x568' : '1024x768', networkProfile: target === 'OFFLINE_HANDLING' ? 'SLOW' : 'NORMAL', offlineRecoveryObserved: target === 'OFFLINE_HANDLING', accessibilityStandard: target === 'ACCESSIBILITY' ? 'WCAG 2.1 AA' : '', expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
    assert.equal(response.success, true, `${target} should validate`);
    version = response.executionVersion;
  });
  const incompatible = svc.validateMobileExperience({ tenantSlug: 'tabsons', executionId, target: 'ANDROID_BROWSER', scenario: 'Unsupported browser behavior', actualStatus: 'FAILED', device: 'Legacy device', browser: 'Unsupported browser', findings: [{ code: 'BROWSER_INCOMPATIBLE', severity: 'CRITICAL', message: 'Feature unavailable.' }], expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(incompatible.validation.status, 'BLOCKED');
  version = incompatible.executionVersion;
  const revokedMobile = svc.revokeGovernanceRecord({ tenantSlug: 'tabsons', entityType: 'MOBILE_VALIDATION', entityId: incompatible.validation.validationId, reason: 'Negative compatibility scenario completed.' }, ctx());
  assert.equal(revokedMobile.success, true);

  svc.COMMUNICATION_CHANNELS.forEach(channel => {
    const response = svc.validateCommunication({ tenantSlug: 'tabsons', executionId, channel, scenario: `${channel} employee communication`, actualStatus: 'DELIVERED', deliveryReference: `SANDBOX-${channel}`, expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
    assert.equal(response.success, true, `${channel} should validate`);
    assert.equal(response.validation.payloadContentStored, false);
    version = response.executionVersion;
  });
  const crossTenantEvidence = svc.validateESSFeature({ tenantSlug: 'tabsons', executionId, feature: 'DASHBOARD', sourceTenantSlug: 'abc', actualStatus: 'PASSED', expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(crossTenantEvidence.code, 'TENANT_ACCESS_DENIED');

  const feedback = svc.recordFeedback({ tenantSlug: 'tabsons', executionId, rating: 5, comments: 'The employee portal is ready for use.', feature: 'OVERALL', submissionId: 'FEEDBACK-1' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(feedback.success, true);
  const duplicateFeedback = svc.recordFeedback({ tenantSlug: 'tabsons', executionId, rating: 1, comments: 'Duplicate network replay.', submissionId: 'FEEDBACK-1' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(duplicateFeedback.code, 'EMPLOYEE_UAT_DUPLICATE_FEEDBACK_REPLAYED');

  const submitted = svc.submitResults({ tenantSlug: 'tabsons', executionId, expectedVersion: version }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(submitted.execution.status, 'SUBMITTED');
  assert.equal(submitted.execution.outcome, 'PASSED');
  const employeeSignoff = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'EMPLOYEE_FEEDBACK', confirmed: true, remarks: 'Employee experience accepted.' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  const managerSignoff = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'MANAGER_CONFIRMATION', confirmed: true, remarks: 'Manager confirms employee scenarios.' }, ctx('MANAGER', 'tabsons', 'M1'));
  const hrSignoff = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true, remarks: 'HR validates ESS readiness.' }, ctx('HR', 'tabsons', 'HR-1'));
  assert.equal(employeeSignoff.success, true); assert.equal(managerSignoff.success, true); assert.equal(hrSignoff.success, true);
  assert.equal(hrSignoff.signoff.readyForGoLiveReview, true);
  assert.match(hrSignoff.signoff.digitalSignature, /^ess-uat-HR_VALIDATION-/);
  const conflict = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true }, ctx('HR', 'tabsons', 'HR-2'));
  assert.equal(conflict.code, 'EMPLOYEE_UAT_SIGNOFF_CONFLICT');

  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(analytics.analytics.passRate, 100);
  assert.equal(analytics.analytics.portalStabilityScore, 100);
  assert.equal(analytics.analytics.mobileExperienceScore, 100);
  assert.equal(analytics.analytics.communicationScore, 100);
  assert.equal(analytics.analytics.featureAdoption, 100);
  assert.equal(analytics.analytics.employeeSatisfaction, 100);
  assert.ok(analytics.analytics.essReadinessScore >= 95);
  const health = svc.generatePortalHealth({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(health.portalHealth.status, 'HEALTHY');
  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(dashboard.essValidations.length, svc.ESS_FEATURES.length);
  assert.equal(dashboard.mobileValidations.length, svc.MOBILE_TARGETS.length + 1);
  assert.equal(dashboard.communicationValidations.length, svc.COMMUNICATION_CHANNELS.length);
  assert.equal(dashboard.feedback.length, 1);
  assert.equal(dashboard.signoffs.length, 3);
  const background = svc.scheduleBackgroundAnalytics({ tenantSlug: 'tabsons', executionId }, ctx());
  assert.equal(background.success, true);
  assert.equal(background.reportJob.productionTrafficImpact, 'NONE');

  const revokedSignoff = svc.revokeGovernanceRecord({ tenantSlug: 'tabsons', entityType: 'SIGNOFF', entityId: hrSignoff.signoff.signoffId, reason: 'Renew final ESS sign-off.' }, ctx());
  assert.equal(revokedSignoff.success, true);
  assert.equal(global.DB.get().employeeUATSignoffs.some(row => row.signoffId === hrSignoff.signoff.signoffId), true);
  const renewed = svc.signoff({ tenantSlug: 'tabsons', executionId, stage: 'HR_VALIDATION', confirmed: true, remarks: 'Renewed after governance review.' }, ctx('HR', 'tabsons', 'HR-2'));
  assert.equal(renewed.success, true);

  const wrongEmployee = svc.startExecution({ tenantSlug: 'tabsons', employeeId: 'M1', suiteIds: [custom.suite.suiteId] }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(wrongEmployee.code, 'EMPLOYEE_UAT_EMPLOYEE_SCOPE_DENIED');
  const crossTenant = svc.listLibrary({ tenantSlug: 'abc' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /private company data/i);
  const second = svc.startExecution({ tenantSlug: 'tabsons', employeeId: 'E1', suiteIds: [custom.suite.suiteId] }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  const cancelled = svc.cancelExecution({ tenantSlug: 'tabsons', executionId: second.execution.executionId, expectedVersion: second.execution.version, reason: 'Superseded test.' }, ctx('EMPLOYEE', 'tabsons', 'E1'));
  assert.equal(cancelled.execution.status, 'CANCELLED');

  assert.equal(protectedSnapshot(), before, 'Employee UAT must not modify production employee or ESS records');
  const data = global.DB.get();
  assert.ok(data.employeeUATExecutionEvents.every(row => row.immutable === true));
  assert.ok(data.employeeUATResultHistory.every(row => row.immutable === true));
  assert.ok(data.employeeUATESSValidations.every(row => row.immutable === true));
  assert.ok(data.employeeUATMobileValidations.every(row => row.immutable === true));
  assert.ok(data.employeeUATCommunicationValidations.every(row => row.immutable === true));
  assert.ok(data.employeeUATFeedback.every(row => row.immutable === true));
  assert.ok(data.employeeUATSignoffs.every(row => row.immutable === true));
  ['EMPLOYEE_UAT_EXECUTION_STARTED', 'EMPLOYEE_UAT_TEST_EXECUTED', 'EMPLOYEE_UAT_ESS_FEATURE_VALIDATED', 'EMPLOYEE_UAT_MOBILE_EXPERIENCE_VALIDATED', 'EMPLOYEE_UAT_COMMUNICATION_VALIDATED', 'EMPLOYEE_UAT_EVIDENCE_UPLOADED', 'EMPLOYEE_UAT_BUG_REPORTED', 'EMPLOYEE_UAT_FEEDBACK_RECORDED', 'EMPLOYEE_UAT_SIGNOFF_RECORDED'].forEach(action => {
    assert.ok(data.employeeUATAuditHistory.some(row => row.actionType === action), `${action} should be audited`);
  });
  assert.doesNotMatch(JSON.stringify(dashboard), /60000|100000|50000|must-not-leak|private company data|employee@example\.test/i, 'dashboard must not expose sensitive employee data');

  const htmlPath = path.resolve(__dirname, '..', 'employee-uat-center.html');
  assert.ok(fs.existsSync(htmlPath), 'Employee UAT Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Employee UAT Center/i);
  assert.match(html, /employeeUATService\.js/i);
  assert.match(html, /Mobile & Accessibility Validation/i);
  assert.match(html, /Employee Feedback/i);

  console.log('employeeUATService.test.js passed');
}

main();
