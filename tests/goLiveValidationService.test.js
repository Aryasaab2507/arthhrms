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
  global.navigator = { userAgent: 'Node go-live validation test', platform: 'Win32' };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/go-live-readiness-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-01T12:00:00.000Z' };
}

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons Industries', companyCode: 'TAB' };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons Industries', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC Private', lifecycleState: 'ACTIVE', privateNote: 'private company data' }
  ];
  data.branches = [{ id: 'B1', tenantSlug: 'tabsons', code: 'HQ', name: 'Head Office', status: 'ACTIVE' }];
  data.locations = [{ id: 'B1', tenantSlug: 'tabsons', code: 'HQ', name: 'Head Office', status: 'ACTIVE' }];
  data.departments = [{ id: 'D1', tenantSlug: 'tabsons', code: 'HR', name: 'Human Resources', status: 'ACTIVE' }];
  data.designations = [{ id: 'DES1', tenantSlug: 'tabsons', code: 'MGR', name: 'Manager', status: 'ACTIVE' }];
  data.employees = [
    { id: 'E1', employeeId: 'E1', employeeCode: 'TAB001', tenantSlug: 'tabsons', email: 'admin@tabsons.example', phone: '+919876543210', departmentId: 'D1', branchId: 'B1', locationId: 'B1', designationId: 'DES1', employmentType: 'FULL_TIME', status: 'ACTIVE', role: 'ADMIN', mfaEnabled: true, bankDetails: { accountNumber: '1234567890' }, salary: 100000 },
    { id: 'E2', employeeId: 'E2', employeeCode: 'TAB002', tenantSlug: 'tabsons', email: 'employee@tabsons.example', phone: '+919876543211', departmentId: 'D1', branchId: 'B1', locationId: 'B1', designationId: 'DES1', managerId: 'E1', employmentType: 'FULL_TIME', status: 'ACTIVE', role: 'EMPLOYEE', mfaEnabled: false, bankDetails: { accountNumber: '1234567891' }, salary: 60000 },
    { id: 'ABC-1', employeeCode: 'ABC001', tenantSlug: 'abc', email: 'private@abc.example', phone: '+919999999999', role: 'ADMIN', status: 'ACTIVE', privateNote: 'private company data' }
  ];
  data.reportingHierarchyRelationships = [{ relationshipId: 'REL-1', tenantSlug: 'tabsons', employeeId: 'E2', managerId: 'E1', relationshipType: 'DIRECT_MANAGER', status: 'ACTIVE' }];
  data.documents = [
    { id: 'DOC-1', tenantSlug: 'tabsons', documentType: 'EMPLOYEE_IDENTITY', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'DOC-2', tenantSlug: 'tabsons', documentType: 'COMPANY_REGISTRATION', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'DOC-3', tenantSlug: 'tabsons', documentType: 'POLICY_HANDBOOK', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'DOC-4', tenantSlug: 'tabsons', documentType: 'OFFER_LETTER', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'DOC-5', tenantSlug: 'tabsons', documentType: 'EMPLOYMENT_CONTRACT', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'DOC-6', tenantSlug: 'tabsons', documentType: 'COMPLIANCE_CERTIFICATE', status: 'ACTIVE', expiryDate: '2027-06-01' },
    { id: 'ABC-DOC', tenantSlug: 'abc', documentType: 'PRIVATE_POLICY', status: 'ACTIVE', privateNote: 'private company data' }
  ];
  data.leavePolicyDefinitions = [{ policyId: 'LP-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.attendancePolicyDefinitions = [{ policyId: 'AP-1', tenantSlug: 'tabsons', status: 'PUBLISHED', workingHours: { startTime: '09:00', endTime: '18:00' }, lateArrivalRules: { graceMinutes: 10 }, overtimeRules: { enabled: true, maximumMinutes: 180 } }];
  data.shiftRosterTemplates = [{ templateId: 'ST-1', tenantSlug: 'tabsons', status: 'PUBLISHED', startTime: '09:00', endTime: '18:00' }];
  data.shiftRosterAssignments = [
    { assignmentId: 'SA-1', tenantSlug: 'tabsons', employeeId: 'E1', templateId: 'ST-1', status: 'ACTIVE' },
    { assignmentId: 'SA-2', tenantSlug: 'tabsons', employeeId: 'E2', templateId: 'ST-1', status: 'ACTIVE' }
  ];
  data.shiftRosterPlans = [{ rosterId: 'RP-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.workingCalendarConfigurations = [{ calendarId: 'CAL-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.payrollConfigurations = [{
    configId: 'PAYCFG-1', tenantSlug: 'tabsons', status: 'PUBLISHED', payrollFrequency: 'MONTHLY',
    salaryComponents: [{ code: 'BASIC', componentType: 'BASIC_SALARY', formulaValid: true, status: 'ACTIVE' }],
    payGroups: { companies: ['TAB'] }, statutorySettings: { providentFund: { enabled: true } },
    payrollCalendar: { frequency: 'MONTHLY', salaryReleaseDay: 28 }
  }];
  data.payrollConfigurationSimulations = [{ simulationId: 'SIM-1', tenantSlug: 'tabsons', configId: 'PAYCFG-1', success: true, status: 'COMPLETED' }];
  data.workflows = [
    { workflowId: 'WF-L', tenantSlug: 'tabsons', workflowType: 'LEAVE_APPROVAL', status: 'PUBLISHED' },
    { workflowId: 'WF-E', tenantSlug: 'tabsons', workflowType: 'EXPENSE_APPROVAL', status: 'PUBLISHED' },
    { workflowId: 'WF-R', tenantSlug: 'tabsons', workflowType: 'RECRUITMENT_APPROVAL', status: 'PUBLISHED' }
  ];
  data.approvalChains = [{ chainId: 'AC-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.escalationRules = [{ ruleId: 'ESC-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.delegationRules = [{ ruleId: 'DEL-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.slaConfigurations = [{ slaId: 'SLA-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.notificationDeliveryTrackingHistory = [{ notificationId: 'N-1', tenantSlug: 'tabsons', state: 'DELIVERED' }];
  data.environmentConfigurationHistory = [
    { tenantSlug: 'tabsons', key: 'DATABASE_URL', configured: true },
    { tenantSlug: 'tabsons', key: 'REDIS_URL', configured: true },
    { tenantSlug: 'tabsons', key: 'SMTP_PROVIDER', configured: true },
    { tenantSlug: 'abc', key: 'PRIVATE_SECRET', configured: true, value: 'private company data' }
  ];
  data.infrastructureConfigurationHistory = [
    { tenantSlug: 'tabsons', component: 'object_storage_bucket', configured: true, status: 'READY' },
    { tenantSlug: 'tabsons', component: 'email_provider', configured: true, status: 'READY' }
  ];
  data.tenantBackupHistory = [{ backupId: 'BKP-1', tenantSlug: 'tabsons', state: 'COMPLETED', integrityHash: 'hash' }];
  data.backupIntegrityVerificationHistory = [{ verificationId: 'BIV-1', tenantSlug: 'tabsons', status: 'PASSED', checksumMatched: true }];
  data.permissionMatrixHistory = [{ matrixId: 'PM-1', tenantSlug: 'tabsons', state: 'ACTIVE', rbacAuthoritative: true }];
  data.loginSecurityPolicyHistory = [{ policyId: 'LOGIN-1', tenantSlug: 'tabsons', state: 'ACTIVE', lockoutThreshold: 5 }];
  data.sessionPolicyHistory = [{ policyId: 'SESS-1', tenantSlug: 'tabsons', state: 'ACTIVE', distributedSessions: true }];
  data.developerApiKeys = [{ keyId: 'KEY-1', tenantSlug: 'tabsons', status: 'ACTIVE', revoked: false }];
  data.tenantIsolationValidationHistory = [{ validationId: 'TIV-1', tenantSlug: 'tabsons', status: 'PASSED' }];
  data.distributedQueueJobs = [{ jobId: 'Q-1', tenantSlug: 'tabsons', state: 'COMPLETED' }];
  data.distributedQueueWorkerHistory = [{ workerId: 'W-1', tenantSlug: 'tabsons', state: 'ACTIVE' }];
  data.schedulerWorkerHistory = [{ workerId: 'SCH-1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.knowledgeSearchIndex = [{ chunkId: 'IDX-1', tenantSlug: 'tabsons', status: 'INDEXED' }];
  data.observabilityHealthHistory = [
    { tenantSlug: 'tabsons', endpoint: '/health', status: 'HEALTHY' },
    { tenantSlug: 'tabsons', endpoint: '/ready', status: 'HEALTHY' },
    { tenantSlug: 'tabsons', endpoint: '/live', status: 'HEALTHY' }
  ];
  data.goLivePerformanceBenchmarks = [{
    tenantSlug: 'tabsons', employeeCapacity: 1000, maxConcurrentLogins: 100,
    bulkImportRecordsPerMinute: 5000, dashboardLoadMs: 900, approvalProcessingMs: 450,
    payrollSimulationMs: 1600, timestamp: '2026-07-01T11:00:00.000Z'
  }];
  [
    'goLiveValidationRuns', 'goLiveRiskAssessments', 'goLiveCertificates', 'goLiveApprovals',
    'goLiveOverrides', 'goLiveGovernanceRevocations', 'goLiveRollbackHistory',
    'goLiveValidationSchedules', 'goLiveDashboardSnapshots', 'goLiveValidationAuditHistory'
  ].forEach(key => { data[key] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js'].forEach(load);
  seed();
  global.GoLiveCertificateSigningService = Object.freeze({
    sign(payload, options) { return { signature: `signed-${payload.length}`, algorithm: options.algorithm, keyId: 'TEST-KMS-1', format: 'DETACHED' }; }
  });
  global.__ARTHHRMS_DEV__ = true;
  load('services/goLiveValidationService.js');

  const svc = global.GoLiveValidationService;
  assert.ok(svc, 'GoLiveValidationService should be exported');
  assert.equal(global.goLiveValidationService, svc, 'lowercase service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be immutable');
  ['ReadinessAnalyzer', 'InfrastructureValidator', 'RiskAssessmentService', 'CertificationService', 'GoLiveDashboardService'].forEach(name => {
    assert.ok(svc[name], `${name} helper should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be immutable`);
  });
  assert.equal(global.__ARTHHRMS_GO_LIVE_VALIDATION_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = global.DB.get();
  const protectedBefore = JSON.stringify({
    employees: before.employees,
    payrollConfigurations: before.payrollConfigurations,
    attendancePolicyDefinitions: before.attendancePolicyDefinitions,
    shiftRosterAssignments: before.shiftRosterAssignments,
    workflows: before.workflows,
    documents: before.documents
  });

  const report = svc.runValidation({ tenantSlug: 'tabsons', organizationId: 'ORG-tabsons' }, ctx());
  assert.equal(report.success, true, 'go-live validation should execute');
  assert.equal(report.status, 'READY_FOR_APPROVAL', 'fully configured tenant should be ready for approval');
  assert.equal(report.certificationEligible, true, 'fully passing validation should be certificate eligible');
  assert.equal(report.checklist.length, 16, 'central checklist should include every required onboarding domain');
  assert.ok(report.checklist.every(row => row.status === 'PASSED'), 'every checklist item should pass');
  assert.equal(report.riskAssessment.risks.length, 0, 'ready tenant should have no unresolved risks');
  assert.equal(report.scores.overallReadinessScore, 100, 'fully ready tenant should score 100');
  assert.ok(Object.isFrozen(report), 'validation report should be immutable');

  const approval = svc.approveGoLive({ tenantSlug: 'tabsons', runId: report.runId, administratorConfirmed: true, reason: 'UAT evidence reviewed.' }, ctx('PLATFORM_OWNER'));
  assert.equal(approval.success, true, 'administrator should approve a passing run');
  assert.equal(approval.approval.productionDeploymentTriggered, false, 'approval must not deploy production');

  const certificate = svc.generateCertificate({ tenantSlug: 'tabsons', runId: report.runId, approvalId: approval.approval.approvalId, environment: 'PRODUCTION' }, ctx('PLATFORM_OWNER'));
  assert.equal(certificate.success, true, 'signed certificate should be generated');
  assert.equal(certificate.certificate.companyName, 'Tabsons Industries');
  assert.equal(certificate.certificate.environment, 'PRODUCTION');
  assert.equal(certificate.certificate.readinessScore, 100);
  assert.equal(certificate.certificate.signingKeyId, 'TEST-KMS-1');
  assert.match(certificate.certificate.digitalSignature, /^signed-/);
  assert.equal(certificate.certificate.productionDataModified, false);

  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(dashboard.success, true, 'dashboard should populate');
  assert.equal(dashboard.readinessScore, 100);
  assert.equal(dashboard.checklist.length, 16);
  assert.equal(dashboard.certificates.length, 1);

  const blocked = svc.runValidation({ tenantSlug: 'tabsons', evidence: { DATABASE: false } }, ctx());
  assert.equal(blocked.status, 'BLOCKED', 'failed infrastructure must block go-live');
  assert.equal(blocked.certificationEligible, false);
  assert.ok(blocked.blockingIssues.some(row => row.code === 'DATABASE'));
  assert.ok(blocked.scores.overallReadinessScore < 60, 'blocking issue should cap overall score');
  const deniedApproval = svc.approveGoLive({ tenantSlug: 'tabsons', runId: blocked.runId, administratorConfirmed: true }, ctx());
  assert.equal(deniedApproval.code, 'GO_LIVE_APPROVAL_BLOCKED', 'blocked run cannot be approved');

  const override = svc.recordOverride({ tenantSlug: 'tabsons', runId: blocked.runId, checkId: blocked.blockingIssues[0].checkId, reason: 'Risk accepted for review only.', administratorConfirmed: true }, ctx());
  assert.equal(override.success, true, 'override should be recorded');
  assert.equal(override.override.certificationGateChanged, false, 'override must not bypass certification gate');

  const crossTenant = svc.runValidation({ tenantSlug: 'abc' }, ctx('PLATFORM_OWNER', 'tabsons'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED', 'cross-tenant validation should be denied');
  assert.doesNotMatch(JSON.stringify(crossTenant), /private company data/i, 'cross-tenant denial must not leak data');
  const roleDenied = svc.runValidation({ tenantSlug: 'tabsons' }, ctx('EMPLOYEE', 'tabsons', 'E2'));
  assert.equal(roleDenied.code, 'GO_LIVE_VALIDATION_RBAC_DENIED', 'employee role should not run certification');

  const schedule = svc.scheduleValidation({ tenantSlug: 'tabsons', cadence: 'DAILY', incremental: true }, ctx());
  assert.equal(schedule.success, true, 'background schedule should be supported');
  assert.equal(schedule.schedule.productionTrafficImpact, 'NONE');
  const rollback = svc.rollbackGovernanceOperation({ tenantSlug: 'tabsons', entityType: 'CERTIFICATE', entityId: certificate.certificate.certificationId, administratorConfirmed: true, reason: 'Certificate superseded.' }, ctx());
  assert.equal(rollback.success, true, 'certificate governance record should be revocable');
  assert.equal(rollback.rollback.businessDataRestored, false, 'governance rollback should not touch business data');

  const after = global.DB.get();
  const protectedAfter = JSON.stringify({
    employees: after.employees,
    payrollConfigurations: after.payrollConfigurations,
    attendancePolicyDefinitions: after.attendancePolicyDefinitions,
    shiftRosterAssignments: after.shiftRosterAssignments,
    workflows: after.workflows,
    documents: after.documents
  });
  assert.equal(protectedAfter, protectedBefore, 'validation and certification must not mutate business data');
  assert.ok(after.goLiveValidationRuns.every(row => row.immutable === true), 'validation history should be immutable');
  assert.ok(after.goLiveCertificates.every(row => row.immutable === true), 'certificates should be immutable');
  assert.ok(after.goLiveValidationAuditHistory.some(row => row.actionType === 'GO_LIVE_VALIDATION_RUN_COMPLETED'), 'validation run should be audited');
  assert.ok(after.goLiveValidationAuditHistory.some(row => row.actionType === 'GO_LIVE_CERTIFICATE_GENERATED'), 'certificate generation should be audited');
  assert.ok(after.goLiveValidationAuditHistory.some(row => row.actionType === 'GO_LIVE_GOVERNANCE_ROLLBACK'), 'rollback should be audited');
  assert.doesNotMatch(JSON.stringify(report), /100000|60000|private company data|123456789/i, 'aggregate output must not expose sensitive employee data');

  const htmlPath = path.resolve(__dirname, '..', 'go-live-readiness-center.html');
  assert.ok(fs.existsSync(htmlPath), 'Go-Live Readiness Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /Go-Live Readiness Center/i);
  assert.match(html, /goLiveValidationService\.js/i);

  console.log('goLiveValidationService.test.js passed');
}

main();
