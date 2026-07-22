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

function load(file) { require(path.resolve(__dirname, '..', file)); }
function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.location = { href: '', origin: 'https://platform.arthhrms.example', hostname: 'platform.arthhrms.example', pathname: '/go-live-certification-center.html' };
  global.document = { querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; }, createElement(){ return { style:{}, click(){}, setAttribute(){}, appendChild(){} }; }, addEventListener(){}, body:{}, documentElement:{} };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'ORG-tabsons', companyName: 'Tabsons Industries', environmentMode: 'PRE_PRODUCTION' };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', lifecycleState: 'PRE_PRODUCTION' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', lifecycleState: 'ACTIVE', privateNote: 'confidential tenant launch data' }
  ];
  data.employees = [
    { id: 'E1', tenantSlug: 'tabsons', employeeCode: 'TAB001', status: 'ACTIVE', salary: 100000 },
    { id: 'ABC-1', tenantSlug: 'abc', employeeCode: 'ABC001', status: 'ACTIVE', salary: 999999, privateNote: 'confidential employee data' }
  ];
  data.payroll = [{ id: 'PAY-1', tenantSlug: 'tabsons', status: 'LOCKED', netSalary: 80000 }];
  data.attendance = [{ id: 'ATT-1', tenantSlug: 'tabsons', status: 'PRESENT' }];
  data.leaveRequests = [{ id: 'LEV-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.documents = [{ id: 'DOC-1', tenantSlug: 'tabsons', status: 'ACTIVE', storagePath: 'private/tenant/document' }];
  data.notifications = [{ id: 'NOT-1', tenantSlug: 'tabsons', status: 'DELIVERED' }];
  data.workflows = [{ id: 'WF-1', tenantSlug: 'tabsons', status: 'PUBLISHED' }];
  data.approvals = [{ id: 'APR-1', tenantSlug: 'tabsons', status: 'APPROVED' }];
  data.featureFlags = [{ id: 'FLAG-1', tenantSlug: 'tabsons', key: 'ESS', enabled: true }];
  global.DB.save(data);
}

function context(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = role, extras = {}) {
  return { tenantSlug, actor: { id, role, tenantSlug }, now: '2026-07-19T10:00:00.000Z', ...extras };
}

function protectedSnapshot() {
  const data = global.DB.get();
  const keys = ['companySettings', 'platformTenants', 'employees', 'payroll', 'attendance', 'leaveRequests', 'documents', 'notifications', 'workflows', 'approvals', 'featureFlags'];
  return JSON.stringify(Object.fromEntries(keys.map(key => [key, data[key]])));
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  load('db.js');
  seedData();
  load('services/workflowTelemetryService.js');
  load('services/auditService.js');
  load('services/orchestrationMetricsService.js');
  load('services/goLiveCertificationService.js');

  const svc = global.GoLiveCertificationService;
  assert.ok(svc, 'GoLiveCertificationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be immutable');
  assert.ok(Object.isFrozen(svc.CONTROL_DEFINITIONS));
  assert.equal(svc.CONTROL_DEFINITIONS.length, 15, 'fifteen mandatory readiness controls should exist');
  assert.equal(svc.CONTROL_DEFINITIONS.every(row => row.mandatory), true);
  assert.deepEqual(svc.REQUIRED_APPROVAL_ROLES, ['HR_HEAD', 'FINANCE_HEAD', 'IT_ADMINISTRATOR', 'SECURITY_OFFICER', 'OPERATIONS_HEAD', 'PROJECT_OWNER', 'PLATFORM_OWNER']);
  assert.equal(svc.ACTIVATION_FEATURES.length, 8);
  assert.equal(svc.ROLLBACK_ACTIONS.length, 6);
  assert.equal(svc.REPORT_TYPES.length, 7);
  assert.ok(global.LaunchControlService && global.ProductionReadinessEngine && global.ExecutiveApprovalService);
  assert.ok(global.CertificationGenerator && global.ProductionHealthMonitor && global.IncidentManagementService && global.GoLiveAnalyticsService);
  assert.equal(global.__ARTHHRMS_GO_LIVE_CERTIFICATION_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = protectedSnapshot();
  let networkCalls = 0;
  global.fetch = () => { networkCalls += 1; throw new Error('network forbidden'); };
  global.XMLHttpRequest = class { open(){ networkCalls += 1; throw new Error('network forbidden'); } };

  const init = svc.initializeCertificationControls({ tenantSlug: 'tabsons' }, context());
  assert.equal(init.success, true);
  assert.equal(init.total, 15);
  assert.equal(svc.initializeCertificationControls({ tenantSlug: 'tabsons' }, context()).created, 0, 'control initialization should be idempotent');
  assert.equal(svc.initializeCertificationControls({ tenantSlug: 'tabsons' }, context('EMPLOYEE', 'tabsons', 'E1')).code, 'LAUNCH_CONTROL_RBAC_DENIED');

  const evidence = Object.fromEntries(svc.CONTROL_DEFINITIONS.map(control => [control.code, { passed: true, reference: `UAT-${control.code}`, sourceType: 'SIGNED_UAT_EVIDENCE' }]));
  const trusted = { trustedEvidence: true };
  const blockedEvidence = { ...evidence, SECURITY: { passed: false, reference: 'UAT-SECURITY-FAILED', sourceType: 'SIGNED_UAT_EVIDENCE' } };
  const blocked = svc.startCertification({ tenantSlug: 'tabsons', platformVersion: '2026.07.19', evidence: blockedEvidence, signals: { criticalBugs: 1, tenantHealthScore: 72 } }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', trusted));
  assert.equal(blocked.success, true);
  assert.equal(blocked.run.status, 'BLOCKED');
  assert.equal(blocked.run.liveEligible, false);
  assert.ok(blocked.risks.some(row => row.code === 'CRITICAL_BUGS_EXIST'));
  assert.ok(blocked.risks.some(row => row.code === 'TENANT_HEALTH_BELOW_THRESHOLD'));
  assert.ok(blocked.results.some(row => row.controlCode === 'SECURITY' && row.status === 'FAILED'));
  const blockedRisk = blocked.risks.find(row => row.blocking);
  const forbiddenOverride = svc.recordCertificationOverride({ tenantSlug: 'tabsons', runId: blocked.run.runId, riskId: blockedRisk.riskId, reason: 'Attempt to bypass a mandatory risk.' }, context());
  assert.equal(forbiddenOverride.code, 'GO_LIVE_MANDATORY_OVERRIDE_FORBIDDEN');
  assert.equal(svc.generateCertificate({ tenantSlug: 'tabsons', runId: blocked.run.runId }, context()).code, 'GO_LIVE_CERTIFICATION_BLOCKED');

  const crossTenant = svc.startCertification({ tenantSlug: 'abc', evidence }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', trusted));
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /confidential tenant launch data|999999/i);

  const ready = svc.startCertification({ tenantSlug: 'tabsons', platformVersion: '2026.07.19', evidence, signals: { tenantHealthScore: 100, warnings: ['Confirm final customer communication window.'] } }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', trusted));
  assert.equal(ready.run.status, 'APPROVAL_PENDING');
  assert.equal(ready.run.passedChecks, 15);
  assert.equal(ready.run.failedChecks, 0);
  assert.equal(ready.run.readinessScore, 100);
  const warningRisk = ready.risks.find(row => row.overridable);
  const warningOverride = svc.recordCertificationOverride({ tenantSlug: 'tabsons', runId: ready.run.runId, riskId: warningRisk.riskId, reason: 'Communication timing accepted by the project owner.' }, context());
  assert.equal(warningOverride.success, true);
  assert.equal(warningOverride.override.certificationGateChanged, false);

  const missingApprovals = svc.generateCertificate({ tenantSlug: 'tabsons', runId: ready.run.runId }, context());
  assert.equal(missingApprovals.code, 'GO_LIVE_CERTIFICATION_BLOCKED');
  const noSigner = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: ready.run.runId, approvalRole: 'HR_HEAD', remarks: 'Reviewed and approved.' }, context('HR_HEAD', 'tabsons', 'HRH-1'));
  assert.equal(noSigner.code, 'GO_LIVE_SIGNING_PROVIDER_REQUIRED');
  const signer = { keyId: 'KMS-GOLIVE-1', sign(value) { return { signature: `sig-${svc.fingerprint(value)}`, keyId: this.keyId, trusted: true }; } };
  const wrongRole = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: ready.run.runId, approvalRole: 'HR_HEAD', remarks: 'Attempted delegated approval.' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { signingService: signer }));
  assert.equal(wrongRole.code, 'GO_LIVE_APPROVAL_ROLE_MISMATCH');

  const approvals = {};
  for (const role of svc.REQUIRED_APPROVAL_ROLES) {
    const approved = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: ready.run.runId, approvalRole: role, remarks: `${role} final approval recorded.` }, context(role, 'tabsons', `${role}-1`, { signingService: signer }));
    assert.equal(approved.success, true, `${role} should approve`);
    assert.equal(approved.approval.signatureTrusted, true);
    approvals[role] = approved.approval;
  }
  const ceo = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: ready.run.runId, approvalRole: 'CEO', remarks: 'Optional executive acknowledgement.' }, context('CEO', 'tabsons', 'CEO-1', { signingService: signer }));
  assert.equal(ceo.success, true, 'optional CEO approval should be accepted');
  const duplicateApproval = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: ready.run.runId, approvalRole: 'HR_HEAD', remarks: 'Duplicate approval attempt.' }, context('HR_HEAD', 'tabsons', 'HRH-1', { signingService: signer }));
  assert.equal(duplicateApproval.code, 'GO_LIVE_APPROVAL_DUPLICATE');
  const approvalSummary = svc.approvalSummary('tabsons', ready.run.runId);
  assert.equal(approvalSummary.complete, true);
  assert.equal(approvalSummary.approvedRequired, 7);

  const nonOwnerCertificate = svc.generateCertificate({ tenantSlug: 'tabsons', runId: ready.run.runId }, context('SECURITY_OFFICER', 'tabsons', 'SEC-1', { signingService: signer }));
  assert.equal(nonOwnerCertificate.code, 'PLATFORM_OWNER_REQUIRED');
  const certified = svc.generateCertificate({ tenantSlug: 'tabsons', runId: ready.run.runId, lifetimeHours: 72 }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { signingService: signer }));
  assert.equal(certified.success, true);
  assert.equal(certified.certificate.status, 'ACTIVE');
  assert.equal(certified.certificate.signatureTrusted, true);
  assert.equal(certified.certificate.mandatoryChecksPassed, true);
  assert.equal(certified.certificate.requiredApprovalsComplete, true);
  assert.equal(certified.certificate.environment, 'PRODUCTION');
  assert.match(certified.certificate.digitalSignature, /^sig-/);
  assert.match(certified.certificate.qrCode.verificationUri, /^arthhrms:\/\/go-live-certification\//);
  assert.equal(svc.certificateStatus(certified.certificate, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { now: '2026-07-23T10:00:01.000Z' })), 'EXPIRED');

  const preparedFailure = svc.prepareGoLive({ tenantSlug: 'tabsons', certificationId: certified.certificate.certificationId }, context());
  assert.equal(preparedFailure.success, true);
  const noAdapter = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: preparedFailure.launch.launchId, challengeToken: preparedFailure.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE TABSONS LIVE', platformVersion: '2026.07.19' }, context());
  assert.equal(noAdapter.code, 'TRUSTED_LAUNCH_ADAPTER_REQUIRED');
  assert.equal(svc.generateDashboard({ tenantSlug: 'tabsons', runId: ready.run.runId }, context()).launches.find(row => row.launchId === preparedFailure.launch.launchId).status, 'PREPARED');
  const failingAdapter = { trusted: true, activateTenant() { return { success: false, activated: false, code: 'SIMULATED_PARTIAL_FAILURE' }; } };
  const failedActivation = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: preparedFailure.launch.launchId, challengeToken: preparedFailure.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE TABSONS LIVE', platformVersion: '2026.07.19' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter: failingAdapter }));
  assert.equal(failedActivation.code, 'GO_LIVE_ACTIVATION_FAILED');
  assert.equal(failedActivation.launch.productionModeEnabled, false);

  const activationRequests = [];
  const launchAdapter = {
    trusted: true,
    activateTenant(request) { activationRequests.push({ type: 'activate', request }); return { success: true, activated: true, tenantSlug: request.tenantSlug, receipt: { receiptId: 'ACT-1' } }; },
    rollbackTenant(request) { activationRequests.push({ type: 'rollback', request }); return { success: true, rolledBack: true, tenantSlug: request.tenantSlug, receipt: { receiptId: 'RB-1' } }; }
  };
  const prepared = svc.prepareGoLive({ tenantSlug: 'tabsons', certificationId: certified.certificate.certificationId }, context());
  assert.equal(prepared.success, true);
  const wrongConfirmation = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: prepared.launch.launchId, challengeToken: prepared.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE LIVE', platformVersion: '2026.07.19' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter }));
  assert.equal(wrongConfirmation.code, 'GO_LIVE_EXPLICIT_CONFIRMATION_REQUIRED');
  const versionMismatch = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: prepared.launch.launchId, challengeToken: prepared.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE TABSONS LIVE', platformVersion: '2026.07.20' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter }));
  assert.equal(versionMismatch.code, 'GO_LIVE_REVALIDATION_FAILED');
  assert.equal(activationRequests.length, 0, 'adapter should not run before all launch gates pass');
  const live = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: prepared.launch.launchId, challengeToken: prepared.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE TABSONS LIVE', platformVersion: '2026.07.19' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter }));
  assert.equal(live.success, true);
  assert.equal(live.launch.status, 'LIVE');
  assert.equal(live.launch.productionModeEnabled, true);
  assert.deepEqual(live.launch.activatedFeatures, svc.ACTIVATION_FEATURES);
  assert.equal(activationRequests.length, 1);
  assert.equal(svc.prepareGoLive({ tenantSlug: 'tabsons', certificationId: certified.certificate.certificationId }, context()).code, 'TENANT_ALREADY_LIVE');

  const healthy = svc.recordProductionHealth({ tenantSlug: 'tabsons', launchId: live.launch.launchId, metrics: { cpuPercent: 10, memoryPercent: 15, databaseStatus: 'HEALTHY', queueStatus: 'HEALTHY', apiHealthPercent: 100, loginSuccessPercent: 100, payrollJobSuccessPercent: 100, attendanceJobSuccessPercent: 100, notificationDeliveryPercent: 100 } }, context('OPERATIONS_HEAD', 'tabsons', 'OPS-1'));
  assert.equal(healthy.health.status, 'HEALTHY');
  const critical = svc.recordProductionHealth({ tenantSlug: 'tabsons', launchId: live.launch.launchId, metrics: { cpuPercent: 99, memoryPercent: 99, databaseStatus: 'DOWN', queueStatus: 'DOWN', apiHealthPercent: 10, loginSuccessPercent: 20, payrollJobSuccessPercent: 0, attendanceJobSuccessPercent: 0, notificationDeliveryPercent: 5 } }, context('OPERATIONS_HEAD', 'tabsons', 'OPS-1'));
  assert.equal(critical.health.status, 'CRITICAL');
  assert.ok(critical.incident, 'critical health should create an incident');
  const recoveryEvent = svc.updateIncident({ tenantSlug: 'tabsons', incidentId: critical.incident.incidentId, eventType: 'RECOVERY_STARTED', notes: 'Operations recovery started.' }, context('OPERATIONS_HEAD', 'tabsons', 'OPS-1'));
  assert.equal(recoveryEvent.success, true);

  for (const reportType of svc.REPORT_TYPES) {
    const report = svc.generateReport({ tenantSlug: 'tabsons', runId: ready.run.runId, reportType }, context());
    assert.equal(report.success, true, `${reportType} report should generate`);
    assert.equal(report.report.tenantSlug, 'tabsons');
  }
  const jsonExport = svc.exportReport({ tenantSlug: 'tabsons', runId: ready.run.runId, reportType: 'CERTIFICATION', format: 'JSON' }, context());
  const csvExport = svc.exportReport({ tenantSlug: 'tabsons', runId: ready.run.runId, reportType: 'TECHNICAL', format: 'CSV' }, context());
  assert.equal(jsonExport.success, true);
  assert.equal(csvExport.success, true);
  assert.match(csvExport.exportContent, /^control_code,domain,severity,status,evidence_reference/);
  assert.doesNotMatch(jsonExport.exportContent, /confidential tenant launch data|999999|private\/tenant\/document/i);

  const rollbackPrepared = svc.prepareRollback({ tenantSlug: 'tabsons', launchId: live.launch.launchId, reason: 'Critical health regression requires controlled rollback.' }, context());
  assert.equal(rollbackPrepared.success, true);
  const rollbackNoAdapter = svc.executeRollback({ tenantSlug: 'tabsons', rollbackId: rollbackPrepared.rollback.rollbackId, challengeToken: rollbackPrepared.challengeToken, administratorConfirmed: true, confirmationText: 'ROLLBACK TABSONS' }, context());
  assert.equal(rollbackNoAdapter.code, 'TRUSTED_ROLLBACK_ADAPTER_REQUIRED');
  const rolledBack = svc.executeRollback({ tenantSlug: 'tabsons', rollbackId: rollbackPrepared.rollback.rollbackId, challengeToken: rollbackPrepared.challengeToken, administratorConfirmed: true, confirmationText: 'ROLLBACK TABSONS' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter }));
  assert.equal(rolledBack.success, true);
  assert.equal(rolledBack.rollback.status, 'COMPLETED');
  assert.equal(activationRequests.filter(row => row.type === 'rollback').length, 1);

  const revocationRun = svc.startCertification({ tenantSlug: 'tabsons', platformVersion: '2026.07.19', evidence, signals: { tenantHealthScore: 100 } }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', trusted));
  const revocationApprovals = {};
  for (const role of svc.REQUIRED_APPROVAL_ROLES) {
    revocationApprovals[role] = svc.recordExecutiveApproval({ tenantSlug: 'tabsons', runId: revocationRun.run.runId, approvalRole: role, remarks: `${role} revocation test approval.` }, context(role, 'tabsons', `REV-${role}`, { signingService: signer })).approval;
  }
  const revocationCertificate = svc.generateCertificate({ tenantSlug: 'tabsons', runId: revocationRun.run.runId }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { signingService: signer }));
  const revocationLaunch = svc.prepareGoLive({ tenantSlug: 'tabsons', certificationId: revocationCertificate.certificate.certificationId }, context());
  const revoked = svc.revokeExecutiveApproval({ tenantSlug: 'tabsons', approvalId: revocationApprovals.HR_HEAD.approvalId, reason: 'HR approval revoked after final evidence review.' }, context('HR_HEAD', 'tabsons', 'REV-HR_HEAD'));
  assert.equal(revoked.success, true);
  const revokedActivation = svc.executeGoLive({ tenantSlug: 'tabsons', launchId: revocationLaunch.launch.launchId, challengeToken: revocationLaunch.challengeToken, administratorConfirmed: true, confirmationText: 'ENABLE TABSONS LIVE', platformVersion: '2026.07.19' }, context('PLATFORM_OWNER', 'tabsons', 'PO-1', { launchAdapter }));
  assert.equal(revokedActivation.code, 'GO_LIVE_REVALIDATION_FAILED', 'revoked approval must invalidate launch');

  const analytics = svc.generateAnalytics({ tenantSlug: 'tabsons', runId: ready.run.runId }, context());
  assert.equal(analytics.success, true);
  assert.ok(analytics.analytics.overallCertificationScore >= 0 && analytics.analytics.overallCertificationScore <= 100);
  const dashboard = svc.generateDashboard({ tenantSlug: 'tabsons', runId: ready.run.runId }, context());
  assert.equal(dashboard.success, true);
  assert.equal(dashboard.controls.length, 15);
  assert.equal(dashboard.results.length, 15);
  assert.equal(dashboard.approvals.complete, true);
  assert.ok(dashboard.certificates.length >= 1);
  assert.ok(dashboard.timeline.length >= 1);

  assert.equal(protectedSnapshot(), before, 'certification, activation adapters, health, and rollback must not mutate existing business records');
  assert.equal(networkCalls, 0, 'service must not issue network requests');
  const data = global.DB.get();
  for (const table of Object.values(svc.TABLES)) assert.ok(Array.isArray(data[table]), `${table} should exist`);
  assert.ok(data.launchCertificationAuditHistory.some(row => row.actionType === 'GO_LIVE_CERTIFICATE_GENERATED'));
  assert.ok(data.launchCertificationAuditHistory.some(row => row.actionType === 'TENANT_GO_LIVE_ACTIVATED'));
  assert.ok(data.launchCertificationAuditHistory.some(row => row.actionType === 'GO_LIVE_ROLLBACK_COMPLETED'));
  assert.ok(data.launchCertificationAuditHistory.some(row => row.actionType.endsWith('_DENIED')), 'denied attempts should be permanently audited');
  assert.ok(data.launchCertificationAuditHistory.every(row => row.immutable && row.fingerprint));
  assert.ok(data.launchCertificationEvents.every(row => row.immutable && row.fingerprint));
  assert.ok(data.launchCertificationCheckpoints.every(row => row.immutable && row.recoveryToken));
  assert.ok(data.launchDigitalCertificates.every(row => row.tenantSlug === 'tabsons'));
  assert.ok(data.launchControlRecords.every(row => row.tenantSlug === 'tabsons'));

  const htmlPath = path.resolve(__dirname, '..', 'go-live-certification-center.html');
  assert.ok(fs.existsSync(htmlPath));
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const text of ['Enterprise Launch Center', 'Final readiness checklist', 'Executive approvals', 'Certification and launch', 'Production health and incidents', 'Blocking issues', 'Readiness timeline', 'Go-Live reports', 'readinessChart', 'services/goLiveCertificationService.js']) {
    assert.ok(html.includes(text), `dashboard should include ${text}`);
  }

  console.log('goLiveCertificationService.test.js: all tests passed');
}

main();
