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
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {}, remove() {}, click() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {},
    value: '', textContent: '', innerHTML: '', getContext() { return null; }, getBoundingClientRect() { return { width: 800, height: 240 }; }
  };
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

let networkCalls = 0;
function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.fetch = async () => { networkCalls += 1; throw new Error('Network access is forbidden in security validation tests.'); };
  global.XMLHttpRequest = class ForbiddenXMLHttpRequest { open() { networkCalls += 1; throw new Error('XHR is forbidden.'); } };
  global.navigator = { userAgent: 'Node Security UAT test', platform: 'Win32', onLine: true };
  global.location = { href: '', origin: 'https://arthhrms.example', hostname: 'arthhrms.example', pathname: '/security-validation-center.html', replace(url) { this.href = url; } };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function ctx(role = 'SECURITY_ADMIN', tenantSlug = 'tabsons', id = 'SECURITY-1') {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-19T10:00:00.000Z' };
}

const TABLES = [
  'securityValidationControls', 'securityValidationRuns', 'securityValidationResults',
  'securityValidationFindings', 'securityValidationEvidence', 'securityValidationEvents',
  'securityValidationCheckpoints', 'securityValidationAnalytics', 'securityValidationReports',
  'securityValidationExports', 'securityValidationBackgroundJobs', 'securityValidationAuditHistory'
];

const PROTECTED_KEYS = [
  'employees', 'users', 'attendance', 'leaveRequests', 'leaveBalances', 'payroll', 'payrollRuns',
  'documents', 'notifications', 'workflows', 'approvals', 'roles', 'permissions', 'rolePermissions',
  'sessions', 'sessionGovernance', 'loginAttemptHistory', 'loginLockoutHistory', 'apiKeys', 'oauthClients',
  'privacyRegistry', 'consentRecords', 'retentionPolicies', 'complianceControls', 'securityConfiguration'
];

function seed() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons' };
  data.platformTenants = [
    { tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'confidential tenant data' }
  ];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', name: 'Employee One', employeeEmail: 'employee@example.test', salary: 60000 },
    { id: 'ABC-1', tenantSlug: 'abc', name: 'Private Employee', employeeEmail: 'private@abc.test', salary: 999999, privateNote: 'confidential employee data' }
  ];
  data.users = [{ id: 'U1', tenantSlug: 'tabsons', email: 'admin@example.test', role: 'security_admin', passwordHash: 'do-not-touch' }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'PRESENT' }];
  data.leaveRequests = [{ id: 'LEAVE-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'APPROVED' }];
  data.leaveBalances = [{ id: 'LB-1', tenantSlug: 'tabsons', employeeId: 'E1', balance: 12 }];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'LOCKED', netSalary: 50000 }];
  data.payrollRuns = [{ id: 'PAYRUN-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'E1', status: 'ACTIVE' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.roles = [{ id: 'R1', tenantSlug: 'tabsons', code: 'HR', active: true }];
  data.permissions = [{ id: 'P1', tenantSlug: 'tabsons', code: 'employees.read' }];
  data.rolePermissions = [{ id: 'RP1', tenantSlug: 'tabsons', roleId: 'R1', permissionId: 'P1' }];
  data.sessions = [{ sessionId: 'S1', tenantSlug: 'tabsons', userId: 'U1', state: 'ACTIVE' }];
  data.sessionGovernance = { policies: { idleMinutes: 30 }, sessions: [{ sessionId: 'S1', tenantSlug: 'tabsons', state: 'ACTIVE' }] };
  data.loginAttemptHistory = [{ attemptId: 'LA1', tenantSlug: 'tabsons', outcome: 'SUCCESS' }];
  data.loginLockoutHistory = [];
  data.apiKeys = [{ keyId: 'KEY1', tenantSlug: 'tabsons', secret: 'do-not-touch', status: 'ACTIVE' }];
  data.oauthClients = [{ clientId: 'CLIENT1', tenantSlug: 'tabsons', clientSecret: 'do-not-touch', status: 'ACTIVE' }];
  data.privacyRegistry = [{ id: 'PR1', tenantSlug: 'tabsons', status: 'ACTIVE' }];
  data.consentRecords = [{ id: 'C1', tenantSlug: 'tabsons', status: 'GRANTED' }];
  data.retentionPolicies = [{ id: 'RET1', tenantSlug: 'tabsons', days: 365 }];
  data.complianceControls = [{ id: 'COMP1', tenantSlug: 'tabsons', framework: 'SOC2', status: 'IMPLEMENTED' }];
  data.securityConfiguration = { mfaRequired: true, passwordPolicy: { minLength: 12 }, securityHeadersEnabled: true };
  TABLES.forEach(table => { data[table] = []; });
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  const snapshot = {};
  PROTECTED_KEYS.forEach(key => { snapshot[key] = data[key]; });
  return JSON.stringify(snapshot);
}

function observations(svc, domain, status = 'PASSED', prefix = 'UAT07') {
  return svc.CONTROL_LIBRARY.filter(row => row.domain === domain).map(row => ({
    controlCode: row.code,
    status,
    actualResult: status === 'PASSED' ? 'Approved evidence confirms the expected control.' : 'Approved evidence identified a control failure.',
    submissionId: `${prefix}-${row.code}`,
    evidence: { sourceType: domain === 'INCIDENT' ? 'TABLETOP' : 'SECURITY_REVIEW', reference: `${prefix}-EVIDENCE-${row.code}`, summary: 'Approved redacted validation evidence.' }
  }));
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/workflowTelemetryService.js', 'services/auditService.js', 'services/orchestrationMetricsService.js'].forEach(load);
  seed();
  global.__ARTHHRMS_DEV__ = true;
  load('services/securityValidationService.js');

  const svc = global.SecurityValidationService;
  assert.ok(svc, 'SecurityValidationService should be exported');
  assert.equal(global.securityValidationService, svc, 'lowercase alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service API should be immutable');
  [
    'SecurityValidationService', 'RBACValidationEngine', 'ComplianceValidator',
    'PrivacyValidationService', 'TenantIsolationTester', 'SecurityAnalyticsService'
  ].forEach(name => {
    assert.ok(svc[name], `${name} should be exported`);
    assert.ok(Object.isFrozen(svc[name]), `${name} should be immutable`);
  });
  const selfTest = global.__ARTHHRMS_SECURITY_VALIDATION_SELF_TEST__;
  assert.equal(selfTest.passed, true, 'development self-test should pass');
  assert.equal(typeof selfTest.timestamp, 'string');
  assert.equal(selfTest.version, '1.0.0');
  assert.equal(typeof selfTest.summary, 'string');
  assert.ok(Array.isArray(selfTest.checks) && selfTest.checks.length >= 8);
  assert.equal(svc.CONTROL_LIBRARY.length, 83);
  assert.deepEqual(svc.FRAMEWORKS, ['ISO_27001', 'SOC_2', 'GDPR', 'DPDP', 'OWASP_TOP_10', 'PASSWORD_STANDARDS', 'AUDIT_COMPLIANCE']);
  assert.equal(svc.RBAC_ROLES.length, 9);
  assert.equal(svc.VULNERABILITY_TYPES.length, 10);
  assert.equal(svc.INCIDENT_TYPES.length, 6);
  assert.deepEqual(svc.CAPACITY_TARGETS, { users: 100000, concurrentSessions: 10000, roleDefinitions: 1000, tenants: 100, backgroundScans: true });

  const before = protectedSnapshot();
  const initialized = svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx('PLATFORM_OWNER'));
  assert.equal(initialized.success, true);
  assert.equal(initialized.controlCount, 83);
  const again = svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx('PLATFORM_OWNER'));
  assert.equal(again.controlsAdded, 0, 'control library initialization should be idempotent');
  const listed = svc.listValidationLibrary({ tenantSlug: 'tabsons' }, ctx('AUDITOR'));
  assert.equal(listed.controls.length, 83);
  Object.keys(svc.DOMAINS).forEach(domain => assert.ok(listed.controls.some(row => row.domain === domain), `${domain} should have controls`));
  assert.equal(svc.listValidationLibrary({ tenantSlug: 'tabsons' }, ctx('EMPLOYEE')).code, 'SECURITY_VALIDATION_VIEW_RBAC_DENIED');
  assert.equal(svc.initializeValidationLibrary({ tenantSlug: 'tabsons' }, ctx('AUDITOR')).code, 'SECURITY_VALIDATION_CONTROL_RBAC_DENIED');

  assert.equal(svc.startValidationRun({ tenantSlug: 'tabsons', environment: 'PRODUCTION' }, ctx('PLATFORM_OWNER')).code, 'SECURITY_PRODUCTION_TARGET_BLOCKED');
  assert.equal(svc.startValidationRun({ tenantSlug: 'tabsons', environment: 'STAGING', targetAlias: 'live-primary' }, ctx('PLATFORM_OWNER')).code, 'SECURITY_PRODUCTION_TARGET_BLOCKED');
  assert.equal(svc.startValidationRun({ tenantSlug: 'tabsons', environment: 'STAGING', targetUrl: 'https://staging.example.test' }, ctx('PLATFORM_OWNER')).code, 'SECURITY_NETWORK_TARGET_FORBIDDEN');

  const started = svc.startValidationRun({
    tenantSlug: 'tabsons', environment: 'UAT', name: 'Enterprise Security UAT', seed: 'UAT-07-DETERMINISTIC',
    capacityProfile: { users: 100000, concurrentSessions: 10000, roleDefinitions: 1000, tenants: 100 }
  }, ctx('PLATFORM_OWNER'));
  assert.equal(started.success, true);
  assert.equal(started.run.reproducible, true);
  assert.equal(started.run.exportable, true);
  assert.equal(started.run.productionSecurityConfigurationModified, false);
  assert.equal(started.run.productionDataModified, false);
  assert.equal(started.run.networkRequestsIssued, false);
  assert.equal(started.run.attackPayloadsExecuted, false);
  assert.ok(started.run.manifestFingerprint);
  const runId = started.run.runId;

  const paused = svc.pauseValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: started.run.version, reason: 'Checkpoint.' }, ctx('PLATFORM_OWNER'));
  assert.equal(paused.run.status, 'PAUSED');
  const resumed = svc.resumeValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: paused.run.version }, ctx('PLATFORM_OWNER'));
  assert.equal(resumed.run.status, 'RUNNING');
  const stale = svc.recordControlResult({ tenantSlug: 'tabsons', runId, controlCode: 'AUTH_LOGIN', status: 'PASSED', expectedVersion: 1 }, ctx('PLATFORM_OWNER'));
  assert.equal(stale.code, 'SECURITY_RUN_VERSION_CONFLICT');
  const invalid = svc.recordControlResult({ tenantSlug: 'tabsons', runId, controlCode: 'AUTH_LOGIN', status: 'UNKNOWN' }, ctx('PLATFORM_OWNER'));
  assert.equal(invalid.code, 'SECURITY_RESULT_INVALID');
  const crossTenant = svc.recordControlResult({ tenantSlug: 'tabsons', sourceTenantSlug: 'abc', runId, controlCode: 'AUTH_LOGIN', status: 'PASSED' }, ctx('PLATFORM_OWNER'));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.equal(svc.validateAuthentication({ tenantSlug: 'tabsons', runId, observations: [] }, ctx('PLATFORM_OWNER')).code, 'SECURITY_OBSERVATIONS_REQUIRED');

  const first = svc.recordControlResult({
    tenantSlug: 'tabsons', sourceTenantSlug: 'tabsons', runId, expectedVersion: resumed.run.version,
    controlCode: 'AUTH_LOGIN', status: 'PASSED', actualResult: 'Login validation evidence passed.', submissionId: 'AUTH-LOGIN-1',
    evidence: { sourceType: 'SECURITY_REVIEW', reference: 'SEC-LOGIN-1', summary: 'Redacted evidence.' }
  }, ctx('PLATFORM_OWNER'));
  assert.equal(first.success, true);
  const replay = svc.recordControlResult({ tenantSlug: 'tabsons', runId, controlCode: 'AUTH_LOGIN', status: 'FAILED', submissionId: 'AUTH-LOGIN-1' }, ctx('PLATFORM_OWNER'));
  assert.equal(replay.code, 'SECURITY_RESULT_REPLAYED');
  assert.equal(replay.result.status, 'PASSED', 'replay cannot alter the original result');

  let version = first.runVersion;
  const authRemaining = observations(svc, 'AUTHENTICATION').filter(row => row.controlCode !== 'AUTH_LOGIN');
  const auth = svc.validateAuthentication({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: authRemaining }, ctx('PLATFORM_OWNER'));
  assert.equal(auth.success, true); version = auth.runVersion;
  const authorization = svc.validateAuthorization({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'AUTHORIZATION') }, ctx('PLATFORM_OWNER'));
  assert.equal(authorization.success, true); version = authorization.runVersion;
  const rbac = svc.validateRBAC({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'RBAC') }, ctx('PLATFORM_OWNER'));
  assert.equal(rbac.success, true); version = rbac.runVersion;
  const isolation = svc.validateTenantIsolation({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'TENANT_ISOLATION') }, ctx('PLATFORM_OWNER'));
  assert.equal(isolation.success, true); version = isolation.runVersion;
  const api = svc.validateApiSecurity({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'API_SECURITY') }, ctx('PLATFORM_OWNER'));
  assert.equal(api.success, true); version = api.runVersion;
  const privacy = svc.validatePrivacy({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'PRIVACY') }, ctx('PLATFORM_OWNER'));
  assert.equal(privacy.success, true); version = privacy.runVersion;
  const compliance = svc.validateCompliance({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'COMPLIANCE') }, ctx('PLATFORM_OWNER'));
  assert.equal(compliance.success, true); version = compliance.runVersion;
  const vulnerability = svc.recordVulnerabilityAssessment({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'VULNERABILITY') }, ctx('PLATFORM_OWNER'));
  assert.equal(vulnerability.success, true); version = vulnerability.runVersion;
  const auditCoverage = svc.validateAuditCoverage({ tenantSlug: 'tabsons', runId, expectedVersion: version, observations: observations(svc, 'AUDIT') }, ctx('PLATFORM_OWNER'));
  assert.equal(auditCoverage.success, true); version = auditCoverage.runVersion;
  assert.equal(svc.simulateSecurityIncident({ tenantSlug: 'tabsons', runId, simulationMode: 'LIVE_ATTACK', observations: observations(svc, 'INCIDENT') }, ctx('PLATFORM_OWNER')).code, 'SECURITY_INCIDENT_MODE_FORBIDDEN');
  const incidents = svc.simulateSecurityIncident({ tenantSlug: 'tabsons', runId, expectedVersion: version, simulationMode: 'TABLETOP', observations: observations(svc, 'INCIDENT') }, ctx('PLATFORM_OWNER'));
  assert.equal(incidents.success, true); version = incidents.runVersion;

  const analytics = svc.generateSecurityAnalytics({ tenantSlug: 'tabsons', runId }, ctx('AUDITOR'));
  assert.equal(analytics.success, true);
  assert.equal(analytics.analytics.securityScore, 100);
  assert.equal(analytics.analytics.complianceScore, 100);
  assert.equal(analytics.analytics.privacyScore, 100);
  assert.equal(analytics.analytics.riskScore, 0);
  assert.equal(analytics.analytics.controlCoverage, 100);
  assert.equal(analytics.analytics.criticalFindings, 0);
  assert.equal(analytics.analytics.statusCounts.PASSED, 83);

  const completed = svc.completeValidationRun({ tenantSlug: 'tabsons', runId, expectedVersion: version }, ctx('PLATFORM_OWNER'));
  assert.equal(completed.success, true);
  assert.equal(completed.goLiveBlocked, false);
  assert.equal(completed.run.status, 'COMPLETED');
  assert.equal(completed.run.outcome, 'PASSED');

  svc.REPORT_TYPES.forEach(reportType => {
    const report = svc.generateReport({ tenantSlug: 'tabsons', runId, reportType }, ctx('AUDITOR'));
    assert.equal(report.success, true, `${reportType} report should generate`);
    assert.equal(report.report.certificationClaims.externallyCertified, false);
    assert.equal(report.report.certificationClaims.independentAuditRequired, true);
    assert.ok(report.report.fingerprint);
  });
  ['JSON', 'CSV'].forEach(format => {
    const exported = svc.exportReport({ tenantSlug: 'tabsons', runId, reportType: 'EXECUTIVE_SECURITY', format }, ctx('AUDITOR'));
    assert.equal(exported.success, true, `${format} export should generate`);
    assert.equal(exported.export.productionDataIncluded, false);
    assert.ok(exported.exportContent.length > 20);
    assert.doesNotMatch(exported.exportContent, /do-not-touch|private@abc|999999|confidential tenant data/i);
  });
  const job = svc.scheduleBackgroundValidation({ tenantSlug: 'tabsons', runId, environment: 'UAT', schedule: 'DAILY' }, ctx('PLATFORM_OWNER'));
  assert.equal(job.success, true);
  assert.equal(job.job.dispatchSuppressed, true);
  assert.equal(job.job.networkRequestsIssued, false);
  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', runId }, ctx('AUDITOR'));
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.analytics.securityScore, 100);
  assert.equal(dashboard.vulnerabilities.length, 10);
  assert.equal(dashboard.tenantIsolation.length, 10);
  assert.equal(dashboard.incidentSimulations.length, 6);
  assert.equal(JSON.stringify(dashboard).includes('private@abc.test'), false);

  const criticalRun = svc.startValidationRun({ tenantSlug: 'tabsons', environment: 'SECURITY_TEST', name: 'Critical blocker proof', domains: ['VULNERABILITY'], seed: 'CRITICAL-PROOF' }, ctx('PLATFORM_OWNER'));
  let criticalVersion = criticalRun.run.version;
  const criticalRows = observations(svc, 'VULNERABILITY', 'PASSED', 'CRITICAL-PROOF');
  criticalRows[0] = Object.assign({}, criticalRows[0], { status: 'FAILED', actualResult: 'Approved review found a critical SQL injection control gap.', findingTitle: 'Critical injection control gap', recommendation: 'Remediate and retest before go-live.' });
  const criticalAssessment = svc.recordVulnerabilityAssessment({ tenantSlug: 'tabsons', runId: criticalRun.run.runId, expectedVersion: criticalVersion, observations: criticalRows }, ctx('PLATFORM_OWNER'));
  assert.equal(criticalAssessment.success, true); criticalVersion = criticalAssessment.runVersion;
  const criticalAnalytics = svc.generateSecurityAnalytics({ tenantSlug: 'tabsons', runId: criticalRun.run.runId }, ctx('AUDITOR'));
  assert.equal(criticalAnalytics.analytics.criticalFindings, 1);
  assert.ok(criticalAnalytics.analytics.productionReadinessScore <= 59);
  const criticalCompleted = svc.completeValidationRun({ tenantSlug: 'tabsons', runId: criticalRun.run.runId, expectedVersion: criticalVersion }, ctx('PLATFORM_OWNER'));
  assert.equal(criticalCompleted.goLiveBlocked, true);
  assert.equal(criticalCompleted.run.outcome, 'GO_LIVE_BLOCKED');
  const finding = criticalAnalytics.findings.find(row => row.severity === 'CRITICAL');
  assert.ok(finding);
  assert.equal(svc.reviewFinding({ tenantSlug: 'tabsons', findingId: finding.findingId, status: 'ACCEPTED', reason: 'Temporary risk.', administratorApproved: false }, ctx('PLATFORM_OWNER')).code, 'SECURITY_RISK_ACCEPTANCE_APPROVAL_REQUIRED');
  const mitigated = svc.reviewFinding({ tenantSlug: 'tabsons', findingId: finding.findingId, status: 'MITIGATED', reason: 'Approved remediation evidence received.' }, ctx('PLATFORM_OWNER'));
  assert.equal(mitigated.success, true);

  const custom = svc.createCustomControl({ tenantSlug: 'tabsons', code: 'CUSTOM_VENDOR_REVIEW', name: 'Vendor Security Review', domain: 'COMPLIANCE', severity: 'HIGH', description: 'Tenant-defined vendor assurance.' }, ctx('PLATFORM_OWNER'));
  assert.equal(custom.success, true);
  assert.equal(custom.control.executionMode, 'OBSERVATION_ONLY');
  assert.equal(svc.createCustomControl({ tenantSlug: 'tabsons', code: 'CUSTOM_VENDOR_REVIEW', name: 'Duplicate', domain: 'COMPLIANCE', severity: 'HIGH' }, ctx('PLATFORM_OWNER')).code, 'SECURITY_CONTROL_DUPLICATE');

  assert.equal(protectedSnapshot(), before, 'business and production security configuration must remain unchanged');
  assert.equal(networkCalls, 0, 'security validation must never issue network requests');
  const stored = global.DB.get();
  assert.ok(stored.securityValidationAuditHistory.length > 0, 'security validation activity should be audited');
  assert.ok(stored.securityValidationEvents.length > 0, 'reproducible run events should be stored');
  assert.ok(stored.securityValidationCheckpoints.every(row => row.reproducible === true && row.recoveryToken), 'checkpoints should support reproducibility');
  assert.ok(stored.securityValidationEvidence.every(row => row.tenantSlug === 'tabsons' && row.fingerprint), 'evidence should be tenant scoped and fingerprinted');

  const htmlPath = path.resolve(__dirname, '..', 'security-validation-center.html');
  assert.ok(fs.existsSync(htmlPath), 'Security Validation Center should exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  [
    'Security Validation Center', 'Authentication', 'Tenant Isolation', 'Compliance', 'Privacy',
    'Risk heatmap', 'Record approved observation', 'Governed reports', 'domainChart',
    'services/securityValidationService.js'
  ].forEach(text => assert.ok(html.includes(text), `dashboard should include ${text}`));

  console.log('securityValidationService.test.js: all tests passed');
}

main();
