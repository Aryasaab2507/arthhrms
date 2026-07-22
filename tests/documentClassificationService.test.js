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

function seedClassificationData() {
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
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', role: 'MANAGER', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.fileAttachments = [
    { attachmentId: 'ATT-PAY', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-PAY', type: 'PAYROLL_DOCUMENT', state: 'ACTIVE', fileName: 'salary-private.pdf', storagePath: 'tabsons/EMP-1/ATT-PAY/salary-private.pdf', mimeType: 'application/pdf', checksum: 'payroll-hash' },
    { attachmentId: 'ATT-ID', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-ONB', type: 'IDENTITY_DOCUMENT', state: 'ACTIVE', fileName: 'aadhaar-private.pdf', storagePath: 'tabsons/EMP-1/ATT-ID/aadhaar-private.pdf', mimeType: 'application/pdf', checksum: 'identity-hash' },
    { attachmentId: 'ATT-REC', tenantSlug: 'tabsons', empId: 'EMP-2', ownerEmpId: 'EMP-2', workflowId: 'WF-EXP', type: 'REIMBURSEMENT_RECEIPT', state: 'ACTIVE', fileName: 'receipt-private.jpg', storagePath: 'tabsons/EMP-2/ATT-REC/receipt-private.jpg', mimeType: 'image/jpeg', checksum: 'receipt-hash' },
    { attachmentId: 'ATT-LEGAL', tenantSlug: 'tabsons', empId: 'EMP-2', ownerEmpId: 'EMP-2', workflowId: 'WF-HR', type: 'HR_INVESTIGATION', state: 'ARCHIVED', fileName: 'investigation-confidential.pdf', storagePath: 'tabsons/EMP-2/ATT-LEGAL/investigation-confidential.pdf', legalHold: true, checksum: 'legal-hash' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', ownerEmpId: 'EMP-X', workflowId: 'WF-X', type: 'RECRUITMENT_ASSESSMENT', state: 'ACTIVE', fileName: 'abc-secret-assessment.pdf', storagePath: 'abc/EMP-X/ATT-X/abc-secret-assessment.pdf', publicUrl: 'https://public.example.com/abc-secret-assessment.pdf', privateNote: 'ABC confidential assessment' }
  ];
  data.documentClassifications = [
    { classificationId: 'CLS-PAY', tenantSlug: 'tabsons', attachmentId: 'ATT-PAY', empId: 'EMP-1', workflowId: 'WF-PAY', documentType: 'PAYROLL_DOCUMENT', classificationState: 'HIGHLY_SENSITIVE', sensitivityType: 'SALARY_RECORD', version: 1, restrictedAccessAttempts: 3, downgradeAttempts: 2, createdAt: '2026-05-20T00:00:00.000Z' },
    { classificationId: 'CLS-ID', tenantSlug: 'tabsons', attachmentId: 'ATT-ID', empId: 'EMP-1', workflowId: 'WF-ONB', documentType: 'IDENTITY_DOCUMENT', classificationState: 'RESTRICTED', sensitivityType: 'EMPLOYEE_IDENTITY_DOCUMENT', version: 1, suspiciousVisibilityAttempts: 1, createdAt: '2026-05-20T01:00:00.000Z' },
    { classificationId: 'CLS-REC', tenantSlug: 'tabsons', attachmentId: 'ATT-REC', empId: 'EMP-2', workflowId: 'WF-EXP', documentType: 'REIMBURSEMENT_RECORD', classificationState: 'CONFIDENTIAL', sensitivityType: 'REIMBURSEMENT_RECORD', version: 1, repeatedConfidentialSharing: 2, createdAt: '2026-05-20T02:00:00.000Z' },
    { classificationId: 'CLS-LEGAL', tenantSlug: 'tabsons', attachmentId: 'ATT-LEGAL', empId: 'EMP-2', workflowId: 'WF-HR', documentType: 'HR_INVESTIGATION', classificationState: 'LEGAL_HOLD', sensitivityType: 'HR_INVESTIGATION', version: 2, legalHold: true, restrictedWorkflowAttachment: true, createdAt: '2026-05-20T03:00:00.000Z' },
    { classificationId: 'CLS-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', documentType: 'RECRUITMENT_ASSESSMENT', classificationState: 'HIGHLY_SENSITIVE', sensitivityType: 'RECRUITMENT_ASSESSMENT', version: 1, fileName: 'abc-secret-assessment.pdf', privateNote: 'ABC confidential assessment' }
  ];
  data.documentAccessLogs = [
    { logId: 'DAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-PAY', empId: 'EMP-1', action: 'PREVIEW', actorRole: 'SUPER_ADMIN', actorId: 'SA-1', status: 'DENIED', reason: 'sensitive document access blocked', createdAt: '2026-05-25T00:00:00.000Z' },
    { logId: 'DAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-PAY', empId: 'EMP-1', action: 'CLASSIFICATION_DOWNGRADE', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'unsafe sensitivity downgrade', createdAt: '2026-05-25T01:00:00.000Z' },
    { logId: 'DAL-3', tenantSlug: 'tabsons', attachmentId: 'ATT-ID', empId: 'EMP-1', action: 'SIGNED_URL_GENERATED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T02:00:00.000Z' },
    { logId: 'DAL-4', tenantSlug: 'tabsons', attachmentId: 'ATT-REC', empId: 'EMP-2', action: 'SHARE', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'FLAGGED', reason: 'repeated confidential sharing', createdAt: '2026-05-25T03:00:00.000Z' },
    { logId: 'DAL-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', action: 'PREVIEW', actorRole: 'HR', actorId: 'HR-X', status: 'DENIED', reason: 'ABC confidential denied', createdAt: '2026-05-25T04:00:00.000Z' }
  ];
  data.fileRetentionRecords = [
    { retentionId: 'RET-PAY', tenantSlug: 'tabsons', attachmentId: 'ATT-PAY', empId: 'EMP-1', policyType: 'PAYROLL_RETENTION', lifecycleState: 'ACTIVE', legalHold: false },
    { retentionId: 'RET-LEGAL', tenantSlug: 'tabsons', attachmentId: 'ATT-LEGAL', empId: 'EMP-2', policyType: 'COMPLIANCE_RETENTION', lifecycleState: 'ARCHIVED', legalHold: true },
    { retentionId: 'RET-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', policyType: 'RECRUITMENT_RETENTION', lifecycleState: 'ACTIVE', fileName: 'abc-secret-assessment.pdf' }
  ];
  data.classificationAuditEvents = [
    { eventId: 'CAE-1', tenantSlug: 'tabsons', attachmentId: 'ATT-PAY', eventType: 'SENSITIVITY_ESCALATED', classificationState: 'HIGHLY_SENSITIVE', actorRole: 'HR', createdAt: '2026-05-25T05:00:00.000Z' },
    { eventId: 'CAE-2', tenantSlug: 'tabsons', attachmentId: 'ATT-ID', eventType: 'RESTRICTED_ACCESS_ATTEMPT', classificationState: 'RESTRICTED', actorRole: 'MANAGER', createdAt: '2026-05-25T06:00:00.000Z' },
    { eventId: 'CAE-3', tenantSlug: 'tabsons', attachmentId: 'ATT-LEGAL', eventType: 'LEGAL_HOLD_APPLIED', classificationState: 'LEGAL_HOLD', actorRole: 'HR', createdAt: '2026-05-25T07:00:00.000Z' },
    { eventId: 'CAE-X', tenantSlug: 'abc', attachmentId: 'ATT-X', eventType: 'SENSITIVITY_ESCALATED', classificationState: 'HIGHLY_SENSITIVE', fileName: 'abc-secret-assessment.pdf' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-CLS-1', tenantSlug: 'tabsons', jobType: 'DOCUMENT_CLASSIFICATION_REVIEW', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'CLS-PAY' },
    { jobId: 'JOB-CLS-X', tenantSlug: 'abc', jobType: 'DOCUMENT_CLASSIFICATION_REVIEW', state: 'FAILED', payload: { attachmentId: 'ATT-X', fileName: 'abc-secret-assessment.pdf' } }
  ];
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
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/asyncJobService.js',
    'services/tenantIsolationService.js',
    'services/workflowEngine.js',
    'services/storageService.js',
    'services/fileAttachmentGovernanceService.js',
    'services/uploadValidationService.js',
    'services/documentVisibilityService.js',
    'services/storageHardeningService.js',
    'services/attachmentAuditTrailService.js',
    'services/fileRetentionService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/documentClassificationService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedClassificationData();

  const svc = global.DocumentClassificationService;
  assert.ok(svc, 'DocumentClassificationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.CLASSIFICATION_STATES), 'classification states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_DOCUMENT_CLASSIFICATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifySensitivityRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant classification risk is critical');
  assert.equal(svc.classifySensitivityRisk({ publicExposure: true }), 'CRITICAL_BLOCKER', 'public sensitive exposure is critical');
  assert.equal(svc.classifySensitivityRisk({ unsafeDowngrade: true }), 'CRITICAL_BLOCKER', 'unsafe sensitivity downgrade is critical');
  assert.equal(svc.classifySensitivityRisk({ highlySensitiveUpload: true }), 'HIGH_RISK', 'highly sensitive uploads are high risk');
  assert.equal(svc.classifySensitivityRisk({ restrictedAccess: true }), 'WARNING', 'restricted access attempt is warning risk');

  const employeeOwn = svc.validateClassificationScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-ID' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own classified documents');
  assert.equal(employeeOwn.visibility, 'OWN_CLASSIFIED_DOCUMENTS_ONLY');

  const managerWorkflow = svc.validateClassificationScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-ID', workflowId: 'WF-ONB' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may access workflow-scoped classified visibility');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_CLASSIFIED_VISIBILITY');

  const superAdminBypass = svc.validateClassificationScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-PAY', classificationState: 'HIGHLY_SENSITIVE', bypassSensitivity: true, fileName: 'salary-private.pdf' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass sensitivity restrictions');
  assert.ok(superAdminBypass.failures.some(item => item.failureCode === 'SUPER_ADMIN_SENSITIVITY_BYPASS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminBypass), /ATT-PAY|EMP-1|salary-private|fileName/i, 'SUPER_ADMIN classification denial must redact document details');

  const platformScope = svc.validateClassificationScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-ID' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in document access chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_DOCUMENT_ACCESS_CHAIN_BLOCKED'));

  const crossTenant = svc.validateClassificationScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'abc-secret-assessment.pdf', privateNote: 'ABC confidential assessment' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant classification visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ATT-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant classification output must not leak document data');

  const downgrade = svc.validateClassificationScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-PAY', classificationState: 'HIGHLY_SENSITIVE', proposedClassificationState: 'INTERNAL' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(downgrade.allowed, false, 'unsafe sensitivity downgrades must be blocked');
  assert.ok(downgrade.failures.some(item => item.failureCode === 'UNSAFE_SENSITIVITY_DOWNGRADE_BLOCKED'));

  const malformed = svc.normalizeClassificationPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed classification payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_CLASSIFICATION_PAYLOAD'));

  const normalized = svc.normalizeClassificationPayload({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-PAY',
    empId: 'EMP-1',
    classificationState: 'highly sensitive',
    sensitivityType: 'salary record',
    fileName: 'salary-private.pdf',
    storagePath: 'tabsons/EMP-1/ATT-PAY/salary-private.pdf'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid classification payload should normalize');
  assert.equal(normalized.payload.classificationState, 'HIGHLY_SENSITIVE');
  assert.equal(normalized.payload.sensitivityType, 'SALARY_RECORD');
  assert.ok(Object.isFrozen(normalized), 'normalized classification output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /ATT-PAY|EMP-1|salary-private|storagePath|fileName/i, 'normalized classification output must redact document details');

  const escalation = svc.evaluateSensitivityGovernance({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-ID',
    empId: 'EMP-1',
    workflowId: 'WF-ONB',
    classificationState: 'RESTRICTED',
    proposedClassificationState: 'HIGHLY_SENSITIVE',
    sensitivityType: 'EMPLOYEE_IDENTITY_DOCUMENT'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(escalation.success, true, 'sensitivity escalation should be governed');
  assert.equal(escalation.state, 'HIGHLY_SENSITIVE');
  assert.ok(escalation.sensitivityGovernance.sensitivityEscalation, 'sensitivity escalation marker should be present');
  assert.ok(escalation.sensitivityGovernance.restrictedAccessEnforcement, 'restricted access enforcement should be present');
  assert.ok(Object.isFrozen(escalation), 'sensitivity governance output must be immutable');
  assert.doesNotMatch(JSON.stringify(escalation), /ATT-ID|EMP-1|aadhaar-private|identity-hash/i, 'sensitivity governance output must redact document details');

  const restricted = svc.generateRestrictedVisibility({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-PAY',
    empId: 'EMP-1',
    classificationState: 'HIGHLY_SENSITIVE',
    sensitivityType: 'SALARY_RECORD'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(restricted.success, true, 'restricted visibility should be generated safely');
  assert.ok(restricted.restrictedVisibility.sensitivityAwareSignedUrls, 'sensitivity-aware signed URLs should be governed');
  assert.ok(restricted.restrictedVisibility.restrictedPreviews, 'restricted previews should be governed');
  assert.equal(restricted.restrictedVisibility.publicExposurePrevented, true, 'public exposure remains prevented');

  const legalHold = svc.evaluateLegalHoldGovernance({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-LEGAL',
    empId: 'EMP-2',
    workflowId: 'WF-HR',
    classificationState: 'LEGAL_HOLD',
    legalHold: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(legalHold.success, true, 'legal hold governance should work');
  assert.equal(legalHold.state, 'LEGAL_HOLD');
  assert.ok(legalHold.legalHoldGovernance.legalHoldIntegration, 'legal hold integration should be present');
  assert.ok(legalHold.legalHoldGovernance.sensitivityDowngradeBlocked, 'legal hold should block downgrades');

  const exposure = svc.detectSensitiveExposurePatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(exposure.success, true, 'sensitive exposure detection should work');
  assert.ok(exposure.summary.highlySensitiveUploads >= 1, 'highly sensitive uploads should be counted');
  assert.ok(exposure.summary.payrollLinkedDocuments >= 1, 'payroll-linked documents should be counted');
  assert.ok(exposure.summary.repeatedConfidentialSharing >= 1, 'repeated confidential sharing should be counted');
  assert.ok(exposure.summary.restrictedWorkflowAttachments >= 1, 'restricted workflow attachments should be counted');
  assert.ok(exposure.summary.legalHoldConflicts >= 1, 'legal hold conflicts should be counted');
  assert.ok(exposure.summary.suspiciousVisibilityAttempts >= 1, 'suspicious visibility attempts should be counted');
  assert.ok(exposure.summary.sensitivityDowngradeAttempts >= 1, 'sensitivity downgrade attempts should be counted');
  assert.ok(Object.isFrozen(exposure.signals), 'sensitive exposure signals must be immutable');
  assert.doesNotMatch(JSON.stringify(exposure), /ATT-X|EMP-X|abc-secret|ABC confidential|salary-private|aadhaar-private|storagePath|fileName/i, 'exposure output must redact raw and cross-tenant details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    documentClassifications: before.documentClassifications,
    classificationAuditEvents: before.classificationAuditEvents,
    fileAttachments: before.fileAttachments,
    documentAccessLogs: before.documentAccessLogs,
    fileRetentionRecords: before.fileRetentionRecords
  });
  const report = svc.generateDocumentClassificationReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'document classification report should generate');
  assert.equal(report.readOnly, true, 'document classification report must be read-only');
  assert.ok(report.classificationHealth.totalDocuments >= 4, 'classification health should aggregate documents');
  assert.ok(report.sensitivityGovernance.highlySensitiveDocuments >= 1, 'sensitivity governance should aggregate high sensitivity');
  assert.ok(report.restrictedVisibility.restrictedAccessFrequency >= 1, 'restricted visibility should aggregate access attempts');
  assert.ok(report.legalHoldGovernance.legalHoldDocuments >= 1, 'legal hold governance should aggregate holds');
  assert.ok(report.classificationAnalytics.classificationBacklog >= 1, 'classification analytics should aggregate backlog');
  assert.equal(report.accessGovernance.superAdminSensitiveDocumentAccess, false, 'SUPER_ADMIN sensitive document access remains blocked');
  assert.equal(report.accessGovernance.platformOwnerDocumentAccessChain, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.fileRetentionIntegrated, 'FileRetentionService integration should be detected');
  assert.ok(report.integrationHealth.attachmentAuditTrailIntegrated, 'AttachmentAuditTrailService integration should be detected');
  assert.ok(report.integrationHealth.documentVisibilityIntegrated, 'DocumentVisibilityService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ATT-X|EMP-X|abc-secret|ABC confidential|salary-private|aadhaar-private|receipt-private|investigation-confidential|storagePath|fileName/i, 'report must not expose cross-tenant or raw sensitive data');
  assert.equal(JSON.stringify({
    documentClassifications: global.DB.get().documentClassifications,
    classificationAuditEvents: global.DB.get().classificationAuditEvents,
    fileAttachments: global.DB.get().fileAttachments,
    documentAccessLogs: global.DB.get().documentAccessLogs,
    fileRetentionRecords: global.DB.get().fileRetentionRecords
  }), historicalBefore, 'classification report must not mutate historical classification records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /DOCUMENT_CLASSIFICATION|DATA_SENSITIVITY/.test(row.eventType || row.category || '')), 'classification telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.DOCUMENT_CLASSIFICATION_REPORTED, 'classification metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /DOCUMENT_CLASSIFICATION|DATA_SENSITIVITY/.test(row.actionType || row.action || '')), 'classification actions should be audited safely');

  const originalRetention = global.FileRetentionService;
  const originalAuditTrail = global.AttachmentAuditTrailService;
  const originalStorage = global.StorageHardeningService;
  const originalVisibility = global.DocumentVisibilityService;
  const originalUpload = global.UploadValidationService;
  const originalAttachment = global.FileAttachmentGovernanceService;
  try {
    delete global.FileRetentionService;
    delete global.AttachmentAuditTrailService;
    delete global.StorageHardeningService;
    delete global.DocumentVisibilityService;
    delete global.UploadValidationService;
    delete global.FileAttachmentGovernanceService;
    const degraded = svc.generateDocumentClassificationReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing sensitivity dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.fileRetentionIntegrated, false, 'missing retention dependency should be visible');
    assert.equal(degraded.integrationHealth.attachmentAuditTrailIntegrated, false, 'missing forensic dependency should be visible');
    assert.equal(degraded.integrationHealth.documentVisibilityIntegrated, false, 'missing visibility dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalRetention) global.FileRetentionService = originalRetention;
    if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
    if (originalStorage) global.StorageHardeningService = originalStorage;
    if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
    if (originalUpload) global.UploadValidationService = originalUpload;
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
  }

  console.log('documentClassificationService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
