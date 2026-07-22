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

function seedVisibilityData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'HR One', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', name: 'HR Head', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Director One', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Manager', role: 'MANAGER', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Employee', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.documents = [
    {
      documentId: 'DOC-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      ownerEmpId: 'EMP-1',
      category: 'identity',
      state: 'VERIFIED',
      fileName: 'aadhaar-private.pdf',
      mimeType: 'application/pdf',
      size: 240000,
      storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
      signedUrl: 'https://signed.example.com/aadhaar-private',
      accessState: 'RESTRICTED'
    },
    {
      documentId: 'DOC-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      ownerEmpId: 'EMP-2',
      category: 'onboarding',
      workflowId: 'WF-1',
      state: 'REVIEW_PENDING',
      fileName: 'onboarding-private.pdf',
      mimeType: 'application/pdf',
      size: 140000,
      storagePath: 'tabsons/EMP-2/DOC-2/onboarding-private.pdf',
      accessState: 'ACCESS_PENDING'
    },
    {
      documentId: 'DOC-3',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      ownerEmpId: 'EMP-2',
      category: 'policy',
      communicationId: 'COM-1',
      state: 'VERIFIED',
      fileName: 'policy-private.pdf',
      mimeType: 'application/pdf',
      size: 120000,
      storagePath: 'tabsons/policy/DOC-3/policy-private.pdf',
      accessState: 'TEMPORARY_ACCESS',
      expiresAt: '2026-05-25T23:00:00.000Z'
    },
    {
      documentId: 'DOC-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      ownerEmpId: 'EMP-X',
      category: 'identity',
      state: 'VERIFIED',
      fileName: 'abc-secret-passport.pdf',
      mimeType: 'application/pdf',
      size: 940000,
      storagePath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf',
      publicUrl: 'https://public.example.com/abc-secret-passport.pdf',
      signedUrl: 'https://signed.example.com/abc-secret-passport.pdf',
      privateNote: 'ABC confidential passport'
    }
  ];
  data.fileAttachments = [
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-1', type: 'WORKFLOW_ATTACHMENT', state: 'ACTIVE', fileName: 'leave-private.pdf', mimeType: 'application/pdf', size: 245000, storagePath: 'tabsons/attachments/ATT-1/leave-private.pdf' },
    { attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', ownerEmpId: 'EMP-2', type: 'REIMBURSEMENT_RECEIPT', state: 'ACTIVE', fileName: 'receipt-private.jpg', mimeType: 'image/jpeg', size: 512000, storagePath: 'tabsons/attachments/ATT-2/receipt-private.jpg' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', ownerEmpId: 'EMP-X', type: 'RESUME', state: 'ACTIVE', fileName: 'abc-secret-resume.pdf', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/abc-secret-resume.pdf' }
  ];
  data.workflowDiscussionAttachments = [
    { attachmentId: 'WFA-1', tenantSlug: 'tabsons', workflowId: 'WF-1', threadId: 'TH-1', empId: 'EMP-1', fileName: 'workflow-private.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/workflow/WFA-1/workflow-private.pdf' },
    { attachmentId: 'WFA-X', tenantSlug: 'abc', workflowId: 'WF-X', threadId: 'TH-X', empId: 'EMP-X', fileName: 'abc-workflow-secret.pdf', mimeType: 'application/pdf', storagePath: 'abc/workflow/WFA-X/abc-workflow-secret.pdf' }
  ];
  data.recruitmentDocuments = [
    { documentId: 'REC-1', attachmentId: 'REC-1', tenantSlug: 'tabsons', candidateId: 'CAND-1', category: 'resume', fileName: 'candidate-private-resume.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/recruitment/REC-1/candidate-private-resume.pdf' }
  ];
  data.communicationAttachments = [
    { attachmentId: 'COMA-1', tenantSlug: 'tabsons', communicationId: 'COM-1', category: 'policy', fileName: 'policy-attachment-private.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/comms/COMA-1/policy-attachment-private.pdf' }
  ];
  data.documentAccessRequests = [
    { requestId: 'DAR-1', tenantSlug: 'tabsons', documentId: 'DOC-2', empId: 'EMP-2', requesterId: 'MGR-1', approverRole: 'HR', state: 'ACCESS_PENDING', workflowId: 'WF-1', createdAt: '2026-05-24T10:00:00.000Z' }
  ];
  data.documentAccessGrants = [
    { grantId: 'DAG-1', tenantSlug: 'tabsons', documentId: 'DOC-3', empId: 'EMP-2', actorId: 'HR-1', state: 'TEMPORARY_ACCESS', expiresAt: '2026-05-25T23:00:00.000Z', createdAt: '2026-05-25T10:00:00.000Z' },
    { grantId: 'DAG-X', tenantSlug: 'abc', documentId: 'DOC-X', empId: 'EMP-X', actorId: 'HR-X', state: 'ACCESS_GRANTED', expiresAt: '2026-05-27T10:00:00.000Z', privateNote: 'ABC confidential grant' }
  ];
  data.documentAccessLogs = [
    { logId: 'DAL-1', tenantSlug: 'tabsons', documentId: 'DOC-1', action: 'VIEW', status: 'ALLOWED', actorRole: 'EMPLOYEE', actorId: 'EMP-1', createdAt: '2026-05-25T10:00:00.000Z' },
    { logId: 'DAL-2', tenantSlug: 'tabsons', documentId: 'DOC-1', action: 'DOWNLOAD', status: 'DENIED', actorRole: 'SUPER_ADMIN', actorId: 'SA-1', reason: 'raw access blocked', createdAt: '2026-05-25T11:00:00.000Z' },
    { logId: 'DAL-3', tenantSlug: 'tabsons', documentId: 'DOC-3', action: 'VIEW', status: 'DENIED', actorRole: 'HR', actorId: 'HR-1', reason: 'expired token', tokenState: 'EXPIRED', createdAt: '2026-05-26T01:00:00.000Z' },
    { logId: 'DAL-4', tenantSlug: 'tabsons', documentId: 'DOC-2', action: 'DOWNLOAD', status: 'DENIED', actorRole: 'MANAGER', actorId: 'MGR-1', reason: 'throttle exceeded', createdAt: '2026-05-26T02:00:00.000Z' },
    { logId: 'DAL-X', tenantSlug: 'abc', documentId: 'DOC-X', action: 'DOWNLOAD', status: 'DENIED', actorRole: 'HR', actorId: 'HR-X', reason: 'ABC confidential denied' }
  ];
  data.uploadValidationRecords = [
    { validationId: 'UV-1', tenantSlug: 'tabsons', documentId: 'DOC-1', uploadId: 'UP-1', state: 'APPROVED', mimeType: 'application/pdf' },
    { validationId: 'UV-X', tenantSlug: 'abc', documentId: 'DOC-X', uploadId: 'UP-X', state: 'QUARANTINED', mimeType: 'application/x-msdownload', privateNote: 'ABC confidential malware' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-VIS-1', tenantSlug: 'tabsons', jobType: 'DOCUMENT_ACCESS_EXPIRY_SCAN', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'DOC-3' },
    { jobId: 'JOB-VIS-X', tenantSlug: 'abc', jobType: 'DOCUMENT_ACCESS_EXPIRY_SCAN', state: 'FAILED', payload: { documentId: 'DOC-X', fileName: 'abc-secret-passport.pdf' } }
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
    'services/documentGovernanceService.js',
    'services/fileAttachmentGovernanceService.js',
    'services/uploadValidationService.js',
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/recruitmentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/documentVisibilityService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedVisibilityData();

  const svc = global.DocumentVisibilityService;
  assert.ok(svc, 'DocumentVisibilityService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.VISIBILITY_STATES), 'visibility states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_DOCUMENT_VISIBILITY_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyVisibilityRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant visibility is critical');
  assert.equal(svc.classifyVisibilityRisk({ publicExposure: true }), 'CRITICAL_BLOCKER', 'public exposure is critical');
  assert.equal(svc.classifyVisibilityRisk({ unauthorizedAccess: true }), 'HIGH_RISK', 'unauthorized access is high risk');
  assert.equal(svc.classifyVisibilityRisk({ expiredToken: true }), 'WARNING', 'expired token usage is warning risk');

  const employeeOwn = svc.validateDocumentVisibilityScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own document visibility metadata');
  assert.equal(employeeOwn.visibility, 'OWN_DOCUMENTS_ONLY');

  const managerWorkflow = svc.validateDocumentVisibilityScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-2', workflowId: 'WF-1', category: 'onboarding' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may access workflow-scoped team document visibility metadata');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_DOCUMENT_VISIBILITY');

  const superAdminRaw = svc.validateDocumentVisibilityScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1', fileName: 'aadhaar-private.pdf', signedUrl: 'https://signed.example.com/aadhaar-private' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not access confidential employee documents directly');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_DOCUMENT_ACCESS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /aadhaar-private|signed\.example|DOC-1|fileName|signedUrl/i, 'SUPER_ADMIN failure must redact raw document details');

  const platformScope = svc.validateDocumentVisibilityScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in document access chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_DOCUMENT_CHAIN_BLOCKED'));

  const crossTenant = svc.validateDocumentVisibilityScope({ tenantSlug: 'abc', empId: 'EMP-X', documentId: 'DOC-X', fileName: 'abc-secret-passport.pdf', privateNote: 'ABC confidential passport' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant document visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /DOC-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant output must not leak document data');

  const malformed = svc.normalizeVisibilityPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed visibility payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_VISIBILITY_PAYLOAD'));

  const normalized = svc.normalizeVisibilityPayload({
    tenantSlug: 'tabsons',
    documentId: 'DOC-1',
    empId: 'EMP-1',
    state: 'temporary_access',
    fileName: 'aadhaar-private.pdf',
    storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
    signedUrl: 'https://signed.example.com/aadhaar-private',
    expiresAt: '2026-05-26T01:00:00.000Z'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid visibility payload should normalize');
  assert.equal(normalized.payload.state, 'TEMPORARY_ACCESS');
  assert.ok(Object.isFrozen(normalized), 'normalized visibility output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /aadhaar-private|storagePath|signedUrl|signed\.example|EMP-1|DOC-1|fileName/i, 'normalized visibility output must redact raw document details');

  const signedAccess = svc.generateSecureDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    documentId: 'DOC-1',
    storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
    expiresInSeconds: 900,
    securePreview: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(signedAccess.success, true, 'safe signed access should be generated');
  assert.equal(signedAccess.state, 'ACCESS_GRANTED');
  assert.equal(signedAccess.signedAccess.expiresAt, '2026-05-26T00:15:00.000Z');
  assert.equal(signedAccess.signedAccess.signedUrlRedacted, true);
  assert.equal(signedAccess.signedAccess.watermarkReady, true, 'signed access must be watermark-ready');
  assert.doesNotMatch(JSON.stringify(signedAccess), /aadhaar-private|storagePath|https?:\/\//i, 'signed access must not expose raw document paths or URLs');

  const unsafeSignedAccess = svc.generateSecureDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    documentId: 'DOC-1',
    expiresInSeconds: 86400,
    publicUrl: 'https://public.example.com/aadhaar-private.pdf'
  }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
  assert.equal(unsafeSignedAccess.success, false, 'unsafe public or long-lived signed access must be blocked');
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'SIGNED_DOCUMENT_VISIBILITY_EXPIRY_UNSAFE'));
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'PUBLIC_DOCUMENT_VISIBILITY_BLOCKED'));

  const temporary = svc.grantTemporaryDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-2',
    documentId: 'DOC-2',
    workflowId: 'WF-1',
    expiresInSeconds: 1200,
    acknowledgementRequired: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(temporary.success, true, 'temporary access should be granted safely');
  assert.equal(temporary.state, 'TEMPORARY_ACCESS');
  assert.equal(temporary.accessGrant.revocable, true);
  assert.equal(temporary.permissionGovernance.acknowledgementRequired, true);
  assert.doesNotMatch(JSON.stringify(temporary), /DOC-2|EMP-2|onboarding-private|storagePath|fileName/i, 'temporary access output must be redacted');

  const revocation = svc.revokeDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-2',
    documentId: 'DOC-2',
    grantId: 'DAG-1',
    reason: 'access window closed'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(revocation.success, true, 'document access should be revocable');
  assert.equal(revocation.state, 'REVOKED');
  assert.equal(revocation.revocation.revokedAccessBlocked, true);

  const suspicious = svc.detectSuspiciousAccessPatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-26T00:00:00.000Z' });
  assert.equal(suspicious.success, true, 'suspicious access detection should work');
  assert.ok(suspicious.summary.deniedAccess >= 3, 'denied access should be counted');
  assert.ok(suspicious.summary.expiredTokenUsage >= 1, 'expired token usage should be counted');
  assert.ok(suspicious.summary.superAdminRawAttempts >= 1, 'SUPER_ADMIN raw access attempts should be counted');
  assert.ok(suspicious.summary.downloadThrottleEvents >= 1, 'download throttling should be visible');
  assert.ok(Object.isFrozen(suspicious.signals), 'suspicious access signals must be immutable');
  assert.doesNotMatch(JSON.stringify(suspicious), /DOC-X|EMP-X|abc-secret|ABC confidential|aadhaar-private|storagePath|fileName/i, 'suspicious access output must redact raw and cross-tenant details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    documents: before.documents,
    fileAttachments: before.fileAttachments,
    documentAccessRequests: before.documentAccessRequests,
    documentAccessGrants: before.documentAccessGrants,
    documentAccessLogs: before.documentAccessLogs,
    workflowDiscussionAttachments: before.workflowDiscussionAttachments,
    recruitmentDocuments: before.recruitmentDocuments
  });
  const report = svc.generateDocumentVisibilityReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'document visibility report should generate');
  assert.equal(report.readOnly, true, 'document visibility report must be read-only');
  assert.ok(report.accessHealth.totalDocuments >= 3, 'access health should aggregate tenant documents');
  assert.ok(report.secureAccessGovernance.temporaryAccessGrants >= 1, 'temporary access should be visible');
  assert.ok(report.accessAudit.deniedAccess >= 3, 'access audit should aggregate denied attempts');
  assert.ok(report.visibilityAnalytics.expiredAccessBuildup >= 1, 'visibility analytics should show expired access buildup');
  assert.equal(report.roleScopedVisibility.superAdminRawDocumentAccess, false, 'SUPER_ADMIN raw document access remains blocked');
  assert.equal(report.roleScopedVisibility.platformOwnerDocumentChain, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.documentGovernanceIntegrated, 'DocumentGovernanceService integration should be detected');
  assert.ok(report.integrationHealth.fileAttachmentGovernanceIntegrated, 'FileAttachmentGovernanceService integration should be detected');
  assert.ok(report.integrationHealth.uploadValidationIntegrated, 'UploadValidationService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /DOC-X|EMP-X|abc-secret|ABC confidential|aadhaar-private|onboarding-private|candidate-private|signed\.example|public\.example|storagePath|fileName/i, 'report must not expose cross-tenant or raw document data');
  assert.equal(JSON.stringify({
    documents: global.DB.get().documents,
    fileAttachments: global.DB.get().fileAttachments,
    documentAccessRequests: global.DB.get().documentAccessRequests,
    documentAccessGrants: global.DB.get().documentAccessGrants,
    documentAccessLogs: global.DB.get().documentAccessLogs,
    workflowDiscussionAttachments: global.DB.get().workflowDiscussionAttachments,
    recruitmentDocuments: global.DB.get().recruitmentDocuments
  }), historicalBefore, 'visibility report must not mutate historical access records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /DOCUMENT_VISIBILITY|DOCUMENT_ACCESS/.test(row.eventType || row.category || '')), 'document visibility telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.DOCUMENT_VISIBILITY_REPORTED, 'document visibility metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /DOCUMENT_VISIBILITY|DOCUMENT_ACCESS/.test(row.actionType || row.action || '')), 'document visibility actions should be audited safely');

  const originalDocument = global.DocumentGovernanceService;
  const originalAttachment = global.FileAttachmentGovernanceService;
  const originalUpload = global.UploadValidationService;
  const originalDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.DocumentGovernanceService;
    delete global.FileAttachmentGovernanceService;
    delete global.UploadValidationService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateDocumentVisibilityReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing visibility dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.documentGovernanceIntegrated, false, 'missing document dependency should be visible');
    assert.equal(degraded.integrationHealth.fileAttachmentGovernanceIntegrated, false, 'missing attachment dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalDocument) global.DocumentGovernanceService = originalDocument;
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
    if (originalUpload) global.UploadValidationService = originalUpload;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
  }

  console.log('documentVisibilityService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
