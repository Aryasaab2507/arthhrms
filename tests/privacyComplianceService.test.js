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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node privacy compliance test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, department: 'Privacy' },
    now: '2026-07-01T12:00:00.000Z'
  };
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function text(value) {
  return JSON.stringify(value);
}

function seedPrivacyData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private privacy data' }
  ];
  data.auditLogs = [];
  data.privacyRegistryHistory = [];
  data.privacyInventoryHistory = [];
  data.privacyConsentHistory = [];
  data.privacyRequestHistory = [];
  data.privacyExportHistory = [];
  data.privacyRetentionHistory = [];
  data.privacyIncidentHistory = [];
  data.privacyReadinessHistory = [];

  data.compliancePolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'POL-DP', policyKey: 'DATA_PROTECTION', version: 2, owner: 'Compliance', approvalStatus: 'APPROVED', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-RETENTION', policyKey: 'RETENTION_POLICY', version: 2, owner: 'Compliance', approvalStatus: 'APPROVED', nextReview: '2026-12-15', immutable: true }
  ];
  data.dataRetentionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'RET-EMP', scope: 'employees', retentionDays: 2555, state: 'ACTIVE', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'RET-AUD', scope: 'audit_logs', retentionDays: 2555, state: 'ACTIVE', immutable: true }
  ];
  data.softDeleteRecoveryHistory = [
    { tenantSlug: 'tabsons', recoveryId: 'REC-1', state: 'RESTORABLE', restoreDeadline: '2026-08-01', immutable: true }
  ];
  data.legalHoldHistory = [
    { tenantSlug: 'tabsons', holdId: 'HOLD-1', scope: 'documents', state: 'ACTIVE', immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true }
  ];
  data.employees = [
    {
      id: 'EMP-1',
      employeeId: 'E-001',
      tenantSlug: 'tabsons',
      name: 'Private Employee',
      email: 'private.employee@example.com',
      phone: '+91-9999999999',
      salary: 999999,
      aadhaar: '1111-2222-3333',
      emergencyContact: { name: 'Emergency Person', phone: '+91-8888888888' },
      biometricRef: 'BIO-PRIVATE-1',
      department: 'HR'
    },
    { id: 'EMP-X', employeeId: 'E-X', tenantSlug: 'abc', name: 'ABC Private', privateNote: 'ABC private privacy data', salary: 123456 }
  ];
  data.payroll = [
    { payrollId: 'PAY-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', grossPay: 999999, bankAccount: 'PRIVATE-BANK' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', date: '2026-06-30', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', status: 'APPROVED', category: 'CASUAL' }
  ];
  data.performanceReviews = [
    { reviewId: 'PERF-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', rating: 4, privateNote: 'Manager private note' }
  ];
  data.documents = [
    { documentId: 'DOC-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', category: 'GOVERNMENT_ID', fileName: 'aadhaar.pdf', privateUrl: 'private://doc/aadhaar.pdf' }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/complianceGovernanceService.js',
    'services/dataRetentionGovernanceService.js',
    'services/softDeleteRestoreGovernanceService.js',
    'services/tenantBackupExportService.js'
  ].forEach(load);
  seedPrivacyData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/privacyComplianceService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('PrivacyComplianceService should be exported');
    }
    throw error;
  }

  const svc = global.PrivacyComplianceService;
  assert.ok(svc, 'PrivacyComplianceService should be exported');
  assert.equal(global.privacyComplianceService, svc, 'lowercase privacy alias should be exported');
  assert.ok(Object.isFrozen(svc), 'privacy export should be frozen');
  ['PrivacyService', 'ConsentManager', 'RetentionManager', 'DataExportService', 'PrivacyRequestManager', 'PrivacyScoreCalculator'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_PRIVACY_COMPLIANCE_SELF_TEST__.passed, true, 'development self-test should pass');

  const registry = svc.PrivacyService.loadPrivacyRegistry({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(registry.success, true, 'privacy registry should load');
  assert.ok(registry.processingActivities.length >= 8, 'processing activities should be generated');
  registry.processingActivities.forEach(activity => {
    ['processingActivity', 'dataCategories', 'legalBasis', 'purpose', 'retention', 'recipients', 'crossBorderTransfers', 'owner', 'reviewDate'].forEach(key => {
      assert.ok(Object.prototype.hasOwnProperty.call(activity, key), `activity should include ${key}`);
    });
    assert.equal(activity.tenantSlug, 'tabsons', 'registry must be tenant scoped');
  });

  const inventory = svc.PrivacyService.generatePersonalDataInventory({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(inventory.success, true, 'personal data inventory should generate');
  ['Employee Data', 'Payroll Data', 'Attendance', 'Leave', 'Performance', 'Documents', 'Biometric References', 'Contact Details', 'Emergency Contacts', 'Government IDs', 'Sensitive Personal Data'].forEach(category => {
    const item = inventory.inventory.find(row => row.category === category);
    assert.ok(item, `${category} should be classified`);
    assert.ok(item.sensitivity && item.retention && item.legalBasis, `${category} should include sensitivity, retention, and legal basis`);
  });
  assert.doesNotMatch(text(inventory), /999999|Private Employee|ABC private privacy data|BIO-PRIVATE|PRIVATE-BANK|aadhaar\.pdf/i, 'inventory must not leak raw personal data');

  const captured = svc.ConsentManager.captureConsent({
    tenantSlug: 'tabsons',
    subjectId: 'EMP-1',
    consentType: 'DATA_PROCESSING',
    purpose: 'HR administration',
    version: 'v1',
    expiresAt: '2027-07-01T00:00:00.000Z'
  }, ctx('HR'));
  assert.equal(captured.success, true, 'consent capture should work');
  assert.equal(captured.consent.status, 'ACTIVE');
  assert.equal(captured.consent.immutable, true, 'consent record should be immutable');

  const withdrawn = svc.ConsentManager.withdrawConsent({
    tenantSlug: 'tabsons',
    subjectId: 'EMP-1',
    consentType: 'DATA_PROCESSING',
    reason: 'Employee request'
  }, ctx('HR'));
  assert.equal(withdrawn.success, true, 'consent withdrawal should work');
  assert.equal(withdrawn.consent.status, 'WITHDRAWN');

  const consentHistory = svc.ConsentManager.getConsentHistory({ tenantSlug: 'tabsons', subjectId: 'EMP-1' }, ctx('HR'));
  assert.equal(consentHistory.success, true, 'consent history should load');
  assert.ok(consentHistory.history.length >= 2, 'consent history should include capture and withdrawal');
  assert.ok(consentHistory.history.every(row => row.immutable === true), 'consent history should be immutable');

  const request = svc.PrivacyRequestManager.createPrivacyRequest({
    tenantSlug: 'tabsons',
    subjectId: 'EMP-1',
    requestType: 'ACCESS_REQUEST',
    description: 'Employee asks for data access'
  }, ctx('HR'));
  assert.equal(request.success, true, 'privacy request should be created');
  assert.equal(request.request.status, 'TRACKED');
  assert.equal(request.request.approvalRequired, true);

  const approved = svc.PrivacyRequestManager.approvePrivacyRequest({
    tenantSlug: 'tabsons',
    requestId: request.request.requestId,
    approvalNote: 'Approved by HR privacy reviewer'
  }, ctx('DIRECTOR', 'tabsons', 'DIR-1'));
  assert.equal(approved.success, true, 'privacy request approval should work');
  assert.equal(approved.request.status, 'APPROVED');

  const duplicate = svc.PrivacyRequestManager.createPrivacyRequest({
    tenantSlug: 'tabsons',
    subjectId: 'EMP-1',
    requestType: 'ACCESS_REQUEST'
  }, ctx('HR'));
  assert.equal(duplicate.success, true, 'duplicate requests should be handled gracefully');
  assert.equal(duplicate.duplicateDetected, true, 'duplicate request should be flagged');

  for (const format of ['JSON', 'CSV', 'PDF', 'ZIP']) {
    const exported = svc.DataExportService.generateDataExport({
      tenantSlug: 'tabsons',
      subjectId: 'EMP-1',
      format,
      requestId: request.request.requestId
    }, ctx('HR'));
    assert.equal(exported.success, true, `${format} export should be generated`);
    assert.equal(exported.export.format, format);
    assert.equal(exported.export.authorized, true);
    assert.equal(exported.export.tenantSlug, 'tabsons');
    assert.equal(exported.export.immutable, true);
    assert.doesNotMatch(text(exported), /999999|Private Employee|ABC private privacy data|BIO-PRIVATE|PRIVATE-BANK|aadhaar\.pdf/i, `${format} export must be sanitized and tenant scoped`);
  }

  const retention = svc.RetentionManager.generateRetentionReport({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(retention.success, true, 'retention report should work');
  assert.ok(retention.retentionPolicies.length >= 2, 'retention policies should be included');
  assert.ok(retention.deletionSchedule, 'deletion schedule should be generated');
  assert.ok(retention.restoreWindow, 'restore window should be generated');
  assertScore(retention.retentionCompliance, 'retention compliance');

  const incident = svc.PrivacyService.trackPrivacyIncident({
    tenantSlug: 'tabsons',
    incident: 'Unauthorized export attempt',
    severity: 'HIGH',
    affectedRecords: 3,
    affectedUsers: 1,
    rootCause: 'Manual process gap',
    containment: 'Export revoked',
    notificationStatus: 'UNDER_REVIEW',
    resolution: 'Pending DPO review'
  }, ctx());
  assert.equal(incident.success, true, 'privacy incident should be tracked');
  assertScore(incident.privacyIncidentScore, 'privacy incident score');

  const transfer = svc.PrivacyService.evaluateCrossBorderTransfer({
    tenantSlug: 'tabsons',
    destinationRegion: 'EU-WEST',
    dataCategories: ['Employee Data']
  }, ctx());
  assert.equal(transfer.success, true, 'cross-border transfer should be evaluated');
  assert.equal(transfer.transfer.automaticTransferExecuted, false, 'cross-border governance must not auto-transfer data');
  assert.equal(transfer.transfer.requiresGovernanceApproval, true);

  const report = svc.PrivacyScoreCalculator.generatePrivacyReport({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(report.success, true, 'privacy report should generate');
  assertScore(report.analytics.privacyScore, 'privacy score');
  assertScore(report.analytics.consentCoverage, 'consent coverage');
  assertScore(report.analytics.retentionCompliance, 'retention compliance');
  assertScore(report.analytics.breachScore, 'breach score');
  assertScore(report.analytics.riskScore, 'risk score');
  assert.equal(report.readiness.gdpr.claimsLegalCertification, false, 'GDPR legal certification must not be claimed');
  assert.equal(report.readiness.dpdp.claimsLegalCertification, false, 'DPDP legal certification must not be claimed');
  assert.equal(report.governance.productionWorkflowBehaviorChanged, false, 'production workflow behavior must not change');
  assert.equal(report.execution.backgroundValidationReady, true);
  assert.equal(report.execution.incrementalScansReady, true);
  assert.equal(report.execution.nonBlockingComplianceChecks, true);
  assert.doesNotMatch(text(report), /999999|Private Employee|ABC private privacy data|BIO-PRIVATE|PRIVATE-BANK|aadhaar\.pdf/i, 'privacy report must not leak raw personal data');

  const crossTenant = svc.PrivacyScoreCalculator.generatePrivacyReport({ tenantSlug: 'abc' }, ctx('PLATFORM_OWNER', 'tabsons', 'PO-1'));
  assert.equal(crossTenant.success, false, 'cross-tenant privacy report should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC private privacy data/i, 'cross-tenant denial must not leak data');

  const employeeExportDenied = svc.DataExportService.generateDataExport({ tenantSlug: 'tabsons', subjectId: 'EMP-1', format: 'JSON' }, ctx('EMPLOYEE', 'tabsons', 'EMP-X'));
  assert.equal(employeeExportDenied.success, false, 'employee should not export another subject');
  assert.equal(employeeExportDenied.code, 'PRIVACY_SUBJECT_ACCESS_DENIED');

  const db = global.DB.get();
  assert.ok(db.privacyConsentHistory.every(row => row.immutable === true), 'consent history should be immutable');
  assert.ok(db.privacyRequestHistory.every(row => row.immutable === true), 'privacy request history should be immutable');
  assert.ok(db.privacyExportHistory.every(row => row.immutable === true), 'export history should be immutable');
  assert.ok(db.privacyRetentionHistory.every(row => row.immutable === true), 'retention history should be immutable');
  assert.ok(db.privacyIncidentHistory.every(row => row.immutable === true), 'incident history should be immutable');
  assert.ok(db.auditLogs.some(row => /PRIVACY_GOVERNANCE/.test(String(row.actionType || row.action || row.module || ''))), 'privacy actions should be audited');
  assert.equal(db.employees.find(row => row.id === 'EMP-1').salary, 999999, 'business data must remain unchanged');

  console.log('privacyComplianceService.test.js passed');
}

main();
