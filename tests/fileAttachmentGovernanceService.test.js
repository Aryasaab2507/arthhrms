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

function seedAttachmentData() {
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
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Director', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Manager', role: 'MANAGER', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Employee', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.fileAttachments = [
    {
      id: 'ATT-1',
      attachmentId: 'ATT-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      uploadedBy: 'EMP-1',
      ownerEmpId: 'EMP-1',
      type: 'WORKFLOW_ATTACHMENT',
      state: 'ACTIVE',
      workflowId: 'WF-1',
      threadId: 'TH-1',
      fileName: 'leave-private.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 245000,
      checksum: 'hash-private-1',
      storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf',
      signedUrl: 'https://signed.example.com/private-leave',
      uploadedAt: '2026-05-20T10:00:00.000Z'
    },
    {
      id: 'ATT-2',
      attachmentId: 'ATT-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      uploadedBy: 'EMP-2',
      ownerEmpId: 'EMP-2',
      type: 'REIMBURSEMENT_RECEIPT',
      state: 'UPLOADED',
      fileName: 'receipt-private.jpg',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      size: 512000,
      checksum: 'dup-hash-1',
      storagePath: 'tabsons/EMP-2/ATT-2/receipt-private.jpg',
      uploadedAt: '2026-05-21T10:00:00.000Z'
    },
    {
      id: 'ATT-3',
      attachmentId: 'ATT-3',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      uploadedBy: 'HR-1',
      ownerEmpId: 'EMP-2',
      type: 'POLICY_ATTACHMENT',
      state: 'EXPIRED',
      fileName: 'policy-private.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 200000,
      checksum: 'dup-hash-1',
      storagePath: 'tabsons/policy/ATT-3/policy-private.pdf',
      expiresAt: '2026-05-20T00:00:00.000Z'
    },
    {
      id: 'ATT-4',
      attachmentId: 'ATT-4',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      uploadedBy: 'EMP-1',
      ownerEmpId: 'EMP-1',
      type: 'DISCUSSION_ATTACHMENT',
      state: 'VALIDATING',
      fileName: 'unsafe-private.exe',
      mimeType: 'application/x-msdownload',
      extension: 'exe',
      size: 25 * 1024 * 1024,
      signature: 'MZ',
      checksum: '',
      publicUrl: 'https://public.example.com/unsafe-private.exe',
      storagePath: 'tabsons/EMP-1/ATT-4/unsafe-private.exe',
      uploadStatus: 'FAILED'
    },
    {
      id: 'ATT-X',
      attachmentId: 'ATT-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      uploadedBy: 'EMP-X',
      ownerEmpId: 'EMP-X',
      type: 'RECRUITMENT_FILE',
      state: 'ACTIVE',
      fileName: 'abc-secret-resume.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: 800000,
      checksum: 'abc-hash',
      publicUrl: 'https://public.example.com/abc-secret-resume.pdf',
      signedUrl: 'https://signed.example.com/abc-secret-resume.pdf',
      storagePath: 'abc/EMP-X/ATT-X/abc-secret-resume.pdf',
      privateNote: 'ABC confidential attachment'
    }
  ];
  data.workflowDiscussionAttachments = [
    { attachmentId: 'WFA-1', tenantSlug: 'tabsons', workflowId: 'WF-1', threadId: 'TH-1', empId: 'EMP-1', fileName: 'workflow-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 120000, checksum: 'wf-hash-1', storagePath: 'tabsons/workflows/WFA-1/workflow-private.pdf' },
    { attachmentId: 'WFA-X', tenantSlug: 'abc', workflowId: 'WF-X', threadId: 'TH-X', empId: 'EMP-X', fileName: 'abc-workflow-secret.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 120000, checksum: 'abc-wf-hash', storagePath: 'abc/workflows/WFA-X/abc-workflow-secret.pdf' }
  ];
  data.communicationAttachments = [
    { attachmentId: 'COMA-1', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-1', fileName: 'policy-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 100000, checksum: 'policy-hash-1', storagePath: 'tabsons/comms/COMA-1/policy-private.pdf' },
    { attachmentId: 'COMA-X', tenantSlug: 'abc', communicationId: 'COM-X', empId: 'EMP-X', fileName: 'abc-policy-secret.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 100000, checksum: 'abc-policy-hash', storagePath: 'abc/comms/COMA-X/abc-policy-secret.pdf' }
  ];
  data.documents = [
    { documentId: 'DOC-1', tenantSlug: 'tabsons', empId: 'EMP-1', category: 'onboarding', fileName: 'aadhaar-private.pdf', mimeType: 'application/pdf', size: 240000, checksum: 'doc-hash-1', storagePath: 'tabsons/docs/DOC-1/aadhaar-private.pdf', signedUrl: 'https://signed.example.com/aadhaar-private' },
    { documentId: 'DOC-X', tenantSlug: 'abc', empId: 'EMP-X', category: 'identity', fileName: 'abc-secret-passport.pdf', mimeType: 'application/pdf', size: 240000, checksum: 'doc-abc', storagePath: 'abc/docs/DOC-X/abc-secret-passport.pdf', publicUrl: 'https://public.example.com/abc-secret-passport.pdf' }
  ];
  data.recruitmentDocuments = [
    { documentId: 'REC-1', attachmentId: 'REC-1', tenantSlug: 'tabsons', candidateId: 'CAND-1', type: 'RESUME', fileName: 'candidate-private-resume.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 500000, checksum: 'resume-hash-1', storagePath: 'tabsons/recruitment/REC-1/candidate-private-resume.pdf' }
  ];
  data.attachmentAccessLogs = [
    { logId: 'AAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', status: 'ALLOWED', createdAt: '2026-05-21T10:00:00.000Z' },
    { logId: 'AAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-4', action: 'DOWNLOAD', actorRole: 'SUPER_ADMIN', status: 'BLOCKED', reason: 'raw attachment access blocked' },
    { logId: 'AAL-X', tenantSlug: 'abc', attachmentId: 'ATT-X', action: 'DOWNLOAD', actorRole: 'HR', status: 'BLOCKED', reason: 'ABC confidential access' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-ATT-1', tenantSlug: 'tabsons', jobType: 'ATTACHMENT_VALIDATION', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'ATT-4' },
    { jobId: 'JOB-ATT-X', tenantSlug: 'abc', jobType: 'ATTACHMENT_VALIDATION', state: 'FAILED', retryAttempts: 3, maxRetries: 3, payload: { fileName: 'abc-secret-resume.pdf', signedUrl: 'https://signed.example.com/abc-secret-resume.pdf' } }
  ];
  data.fileAttachmentGovernanceRuns = [];
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
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/recruitmentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/fileAttachmentGovernanceService.js');
  seedAttachmentData();

  const svc = global.FileAttachmentGovernanceService;
  assert.ok(svc, 'FileAttachmentGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ATTACHMENT_STATES), 'attachment states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_FILE_ATTACHMENT_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyAttachmentRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant attachment visibility is critical');
  assert.equal(svc.classifyAttachmentRisk({ publicExposure: true }), 'CRITICAL_BLOCKER', 'public file exposure is critical');
  assert.equal(svc.classifyAttachmentRisk({ suspiciousSignature: true }), 'HIGH_RISK', 'suspicious file signatures are high risk');
  assert.equal(svc.classifyAttachmentRisk({ mimeMismatch: true }), 'WARNING', 'mime mismatch should be warning risk');

  const employeeOwn = svc.validateAttachmentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own attachment metadata');
  assert.equal(employeeOwn.visibility, 'OWN_ATTACHMENTS_ONLY');

  const managerTeam = svc.validateAttachmentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1', type: 'WORKFLOW_ATTACHMENT' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team workflow attachment metadata');
  assert.equal(managerTeam.visibility, 'TEAM_WORKFLOW_ATTACHMENTS_ONLY');

  const superAdminRaw = svc.validateAttachmentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', fileName: 'leave-private.pdf', signedUrl: 'https://signed.example.com/private-leave' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not access confidential attachments directly');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_ATTACHMENT_ACCESS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /leave-private|private-leave|signed\.example|fileName|signedUrl|ATT-1/i, 'SUPER_ADMIN failure output must redact attachment details');

  const platformScope = svc.validateAttachmentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in attachment workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ATTACHMENT_ACCESS_BLOCKED'));

  const crossTenant = svc.validateAttachmentScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'abc-secret-resume.pdf', privateNote: 'ABC confidential attachment' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant attachment visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ATT-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant failure must not leak attachment data');

  const malformed = svc.normalizeAttachmentPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_ATTACHMENT_PAYLOAD'));

  const normalized = svc.normalizeAttachmentPayload({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    state: 'active',
    empId: 'EMP-1',
    fileName: 'leave-private.pdf',
    storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf',
    signedUrl: 'https://signed.example.com/private-leave',
    mimeType: 'application/pdf',
    size: 245000
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid payload should normalize');
  assert.equal(normalized.payload.state, 'ACTIVE');
  assert.ok(Object.isFrozen(normalized), 'normalized attachment output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /leave-private|storagePath|signedUrl|signed\.example|EMP-1|fileName|ATT-1/i, 'normalized output must redact raw attachment details');

  const upload = svc.validateSecureUpload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    attachmentType: 'workflow_attachment',
    fileName: 'unsafe-private.exe',
    mimeType: 'application/x-msdownload',
    declaredMimeType: 'application/pdf',
    size: 25 * 1024 * 1024,
    checksum: '',
    publicUrl: 'https://public.example.com/unsafe-private.exe',
    signature: 'MZ'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(upload.success, false, 'unsafe upload should be blocked');
  assert.ok(upload.failures.some(item => item.failureCode === 'UNSUPPORTED_ATTACHMENT_MIME_TYPE'));
  assert.ok(upload.failures.some(item => item.failureCode === 'RESTRICTED_ATTACHMENT_EXTENSION_BLOCKED'));
  assert.ok(upload.failures.some(item => item.failureCode === 'ATTACHMENT_UPLOAD_TOO_LARGE'));
  assert.ok(upload.failures.some(item => item.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'));
  assert.ok(upload.failures.some(item => item.failureCode === 'ATTACHMENT_INTEGRITY_VALIDATION_REQUIRED'));
  assert.ok(upload.failures.some(item => item.failureCode === 'SUSPICIOUS_FILE_SIGNATURE_DETECTED'));
  assert.doesNotMatch(JSON.stringify(upload), /unsafe-private|public\.example|fileName|publicUrl/i, 'upload validation must redact unsafe file details');

  const duplicate = svc.validateSecureUpload({
    tenantSlug: 'tabsons',
    empId: 'EMP-2',
    attachmentType: 'policy_attachment',
    fileName: 'duplicate-private.pdf',
    mimeType: 'application/pdf',
    size: 120000,
    checksum: 'dup-hash-1'
  }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
  assert.equal(duplicate.success, false, 'duplicate upload should be detected');
  assert.ok(duplicate.failures.some(item => item.failureCode === 'DUPLICATE_ATTACHMENT_DETECTED'));

  const tenantMismatch = svc.validateSecureUpload({ tenantSlug: 'abc', empId: 'EMP-X', fileName: 'abc-secret.pdf', mimeType: 'application/pdf', size: 1000, checksum: 'abc' }, { tenantSlug: 'tabsons' });
  assert.equal(tenantMismatch.classification, 'CRITICAL_BLOCKER');
  assert.ok(tenantMismatch.failures.some(item => item.failureCode === 'TENANT_MISMATCH'));

  const signedAccess = svc.generateSignedAttachmentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    attachmentId: 'ATT-1',
    storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf',
    expiresInSeconds: 900
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(signedAccess.success, true, 'safe signed attachment marker should be generated');
  assert.equal(signedAccess.signedAccess.expiresInSeconds, 900);
  assert.equal(signedAccess.signedAccess.expiresAt, '2026-05-26T00:15:00.000Z');
  assert.equal(signedAccess.signedAccess.expiresSafely, true);
  assert.doesNotMatch(JSON.stringify(signedAccess), /leave-private|storagePath|https?:\/\//i, 'signed access output must not expose raw URLs or paths');

  const unsafeSignedAccess = svc.generateSignedAttachmentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    attachmentId: 'ATT-1',
    expiresInSeconds: 86400
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(unsafeSignedAccess.success, false, 'long-lived signed access must be blocked');
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'SIGNED_ATTACHMENT_EXPIRY_UNSAFE'));

  const suspicious = svc.detectSuspiciousUploads({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-26T00:00:00.000Z' });
  assert.equal(suspicious.success, true, 'suspicious upload detection should work');
  assert.ok(suspicious.summary.duplicateFiles >= 1, 'duplicate files should be counted');
  assert.ok(suspicious.summary.publicExposure >= 1, 'public exposure should be counted');
  assert.ok(suspicious.summary.suspiciousFileSignatures >= 1, 'suspicious file signatures should be counted');
  assert.ok(suspicious.summary.oversizedPayloads >= 1, 'oversized payloads should be counted');
  assert.ok(Object.isFrozen(suspicious.integritySignals), 'integrity signals must be immutable');
  assert.doesNotMatch(JSON.stringify(suspicious), /ATT-X|abc-secret|leave-private|receipt-private|storagePath|signedUrl|publicUrl|fileName|ABC confidential/i, 'suspicious upload output must redact file details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    fileAttachments: before.fileAttachments,
    workflowDiscussionAttachments: before.workflowDiscussionAttachments,
    communicationAttachments: before.communicationAttachments,
    documents: before.documents,
    recruitmentDocuments: before.recruitmentDocuments
  });
  const report = svc.generateAttachmentGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'attachment governance report should generate');
  assert.equal(report.readOnly, true, 'attachment report must be read-only');
  assert.ok(report.uploadHealth.totalAttachments >= 6, 'upload health should aggregate attachment records');
  assert.ok(report.secureUploadGovernance.failedUploads >= 1, 'failed upload visibility should be present');
  assert.ok(report.integrityValidation.duplicateFiles >= 1, 'duplicate upload rates should be visible');
  assert.ok(report.attachmentAnalytics.storageGrowthBytes > 0, 'storage growth should aggregate safely');
  assert.equal(report.signedAccessGovernance.signedAccessRequired, true, 'signed access governance should be required');
  assert.equal(report.accessGovernance.superAdminRawAttachmentAccess, false, 'SUPER_ADMIN raw attachment access must remain blocked');
  assert.equal(report.accessGovernance.platformOwnerAttachmentWorkflow, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ATT-X|EMP-X|abc-secret|leave-private|receipt-private|workflow-private|candidate-private|signed\.example|public\.example|storagePath|signedUrl|publicUrl|fileName|ABC confidential/i, 'report must not expose cross-tenant or raw attachment data');
  assert.equal(JSON.stringify({
    fileAttachments: global.DB.get().fileAttachments,
    workflowDiscussionAttachments: global.DB.get().workflowDiscussionAttachments,
    communicationAttachments: global.DB.get().communicationAttachments,
    documents: global.DB.get().documents,
    recruitmentDocuments: global.DB.get().recruitmentDocuments
  }), historicalBefore, 'attachment report must not mutate historical attachment records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ATTACHMENT_GOVERNANCE|FILE_ATTACHMENT/.test(row.eventType || row.category || '')), 'attachment telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.FILE_ATTACHMENT_GOVERNANCE_REPORTED, 'attachment metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ATTACHMENT_GOVERNANCE|FILE_ATTACHMENT/.test(row.actionType || row.action || '')), 'attachment actions should be audited safely');

  const originalDocument = global.DocumentGovernanceService;
  const originalDiscussion = global.WorkflowDiscussionService;
  const originalCommunication = global.CommunicationGovernanceService;
  const originalRecruitment = global.RecruitmentGovernanceService;
  try {
    delete global.DocumentGovernanceService;
    delete global.WorkflowDiscussionService;
    delete global.CommunicationGovernanceService;
    delete global.RecruitmentGovernanceService;
    const degraded = svc.generateAttachmentGovernanceReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.documentGovernanceIntegrated, false, 'missing document dependency should be visible');
    assert.equal(degraded.integrationHealth.workflowDiscussionIntegrated, false, 'missing workflow discussion dependency should be visible');
  } finally {
    if (originalDocument) global.DocumentGovernanceService = originalDocument;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
    if (originalCommunication) global.CommunicationGovernanceService = originalCommunication;
    if (originalRecruitment) global.RecruitmentGovernanceService = originalRecruitment;
  }

  console.log('fileAttachmentGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
