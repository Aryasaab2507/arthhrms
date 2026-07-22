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

function seedDocumentData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', email: 'one@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', email: 'two@example.com', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Tenant Employee', email: 'x@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', managerId: 'MGR-X' }
  ];
  data.documents = [
    {
      id: 'DOC-1',
      documentId: 'DOC-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      uploadedBy: 'EMP-1',
      assignedTo: 'EMP-1',
      category: 'identity',
      documentType: 'Aadhaar',
      name: 'aadhaar-private.pdf',
      fileName: 'aadhaar-private.pdf',
      mimeType: 'application/pdf',
      size: 240000,
      storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
      signedUrl: 'https://signed.example.com/private-doc-1',
      privateNote: 'identity document private number',
      status: 'Review Pending',
      verificationStatus: 'Pending',
      expiryDate: '2026-06-01',
      uploadedOn: '2026-05-20'
    },
    {
      id: 'DOC-2',
      documentId: 'DOC-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      uploadedBy: 'HR-1',
      assignedTo: 'EMP-2',
      category: 'onboarding',
      documentType: 'Policy Acknowledgement',
      name: 'policy.pdf',
      fileName: 'policy.pdf',
      mimeType: 'application/pdf',
      size: 120000,
      storagePath: 'tabsons/EMP-2/DOC-2/policy.pdf',
      status: 'Verified',
      verificationStatus: 'Verified',
      expiryDate: '2027-01-01',
      uploadedOn: '2026-05-21'
    },
    {
      id: 'DOC-X',
      documentId: 'DOC-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      uploadedBy: 'EMP-X',
      assignedTo: 'EMP-X',
      category: 'identity',
      documentType: 'Passport',
      name: 'abc-secret-passport.pdf',
      fileName: 'abc-secret-passport.pdf',
      mimeType: 'application/pdf',
      size: 999999,
      storagePath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf',
      publicUrl: 'https://public.example.com/abc-secret-passport.pdf',
      signedUrl: 'https://signed.example.com/abc-secret-passport.pdf',
      privateNote: 'abc confidential passport',
      status: 'Review Pending',
      expiryDate: '2026-06-01',
      uploadedOn: '2026-05-21'
    }
  ];
  data.documentVerifications = [
    { id: 'DV-1', verificationId: 'DV-1', tenantSlug: 'tabsons', empId: 'EMP-1', aadhaarStatus: 'Reupload Required', panStatus: 'Pending', bankStatus: 'Verified', educationStatus: 'Missing', joiningStatus: 'Pending', overallStatus: 'Pending', remark: 'private identity mismatch', savedOn: '2026-05-21' },
    { id: 'DV-X', verificationId: 'DV-X', tenantSlug: 'abc', empId: 'EMP-X', aadhaarStatus: 'Missing', panStatus: 'Missing', bankStatus: 'Missing', educationStatus: 'Missing', joiningStatus: 'Missing', overallStatus: 'Pending', remark: 'abc private verification', savedOn: '2026-05-21' }
  ];
  data.onboardingCollections = [
    { id: 'OC-1', tenantSlug: 'tabsons', empId: 'EMP-1', photoSubmitted: true, bankFormSubmitted: false, idProofSubmitted: true, educationProofSubmitted: false, policySigned: false, welcomeKitIssued: false, savedOn: '2026-05-21' },
    { id: 'OC-X', tenantSlug: 'abc', empId: 'EMP-X', photoSubmitted: false, bankFormSubmitted: false, idProofSubmitted: false, educationProofSubmitted: false, policySigned: false, welcomeKitIssued: false, savedOn: '2026-05-21' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-DOC-1', tenantSlug: 'tabsons', jobType: 'DOCUMENT_VERIFICATION', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'DOC-1' },
    { jobId: 'JOB-DOC-X', tenantSlug: 'abc', jobType: 'DOCUMENT_VERIFICATION', state: 'FAILED', priority: 'HIGH', retryAttempts: 3, maxRetries: 3, correlationId: 'DOC-X', payload: { storagePath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf', signedUrl: 'https://signed.example.com/abc-secret-passport.pdf' } }
  ];
  data.documentGovernanceRuns = [];
  data.documentAccessLogs = [];
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
    'services/storageService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/documentGovernanceService.js');
  seedDocumentData();

  const svc = global.DocumentGovernanceService;
  assert.ok(svc, 'DocumentGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.DOCUMENT_STATES), 'document states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_DOCUMENT_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyDocumentRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant document risk is critical');
  assert.equal(svc.classifyDocumentRisk({ publicUrl: true }), 'CRITICAL_BLOCKER', 'public URL exposure is critical');
  assert.equal(svc.classifyDocumentRisk({ malformedUpload: true }), 'WARNING', 'malformed upload is warning risk');

  const employeeOwn = svc.validateDocumentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own documents');
  assert.equal(employeeOwn.visibility, 'OWN_DOCUMENTS_ONLY');

  const managerOnboarding = svc.validateDocumentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-2', category: 'onboarding' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerOnboarding.allowed, true, 'manager may see limited onboarding document metadata for team members');
  assert.equal(managerOnboarding.visibility, 'LIMITED_ONBOARDING_VISIBILITY');

  const superAdminRaw = svc.validateDocumentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1', fileName: 'aadhaar-private.pdf', signedUrl: 'https://signed.example.com/private-doc-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not view raw documents by default');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_DOCUMENT_VIEW_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /aadhaar|private-doc-1|signed\.example|fileName|signedUrl/i, 'SUPER_ADMIN failure output must redact document details');

  const platformScope = svc.validateDocumentScope({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not access employee documents directly');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_DOCUMENT_ACCESS_BLOCKED'));

  const crossTenant = svc.validateDocumentScope({ tenantSlug: 'abc', empId: 'EMP-X', documentId: 'DOC-X', fileName: 'abc-secret-passport.pdf', privateNote: 'abc confidential passport' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant document visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /EMP-X|DOC-X|abc-secret|confidential passport|fileName/i, 'cross-tenant failure must not leak document data');

  const validation = svc.validateDocumentUpload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    category: 'identity',
    documentType: 'Aadhaar',
    fileName: 'aadhaar-private.exe',
    mimeType: 'application/x-msdownload',
    size: 20 * 1024 * 1024,
    publicUrl: 'https://public.example.com/aadhaar-private.exe',
    privateNote: 'identity number private',
    metadata: { checksum: '' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(validation.success, false, 'unsafe document upload should require review');
  assert.ok(validation.failures.some(item => item.failureCode === 'UNSUPPORTED_DOCUMENT_MIME_TYPE'), 'unsupported MIME must be blocked');
  assert.ok(validation.failures.some(item => item.failureCode === 'DOCUMENT_UPLOAD_TOO_LARGE'), 'oversized upload must be blocked');
  assert.ok(validation.failures.some(item => item.failureCode === 'PUBLIC_DOCUMENT_EXPOSURE_BLOCKED'), 'public document exposure must be blocked');
  assert.ok(validation.failures.some(item => item.failureCode === 'DOCUMENT_INTEGRITY_VALIDATION_REQUIRED'), 'missing integrity metadata must be detected');
  assert.ok(Object.isFrozen(validation), 'upload validation output must be immutable');
  assert.doesNotMatch(JSON.stringify(validation), /aadhaar-private|public\.example|identity number private|fileName|publicUrl/i, 'upload validation must redact document details');

  const tenantMismatch = svc.validateDocumentUpload({ tenantSlug: 'abc', empId: 'EMP-X', category: 'identity', fileName: 'abc-secret.pdf', mimeType: 'application/pdf', size: 1000 }, { tenantSlug: 'tabsons' });
  assert.ok(tenantMismatch.failures.some(item => item.failureCode === 'TENANT_MISMATCH'), 'tenant mismatch must be detected');
  assert.equal(tenantMismatch.classification, 'CRITICAL_BLOCKER');

  const signedAccess = svc.generateSignedDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    documentId: 'DOC-1',
    storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
    expiresInSeconds: 900
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' },
    now: '2026-05-23T00:00:00.000Z'
  });
  assert.equal(signedAccess.success, true, 'safe signed document access marker should be generated');
  assert.equal(signedAccess.signedAccess.expiresInSeconds, 900);
  assert.equal(signedAccess.signedAccess.expiresAt, '2026-05-23T00:15:00.000Z');
  assert.ok(signedAccess.signedAccess.expiresSafely, 'signed access must expire safely');
  assert.doesNotMatch(JSON.stringify(signedAccess), /aadhaar-private|storagePath|https?:\/\//i, 'signed access output must not expose raw document URL or path');

  const unsafeSignedAccess = svc.generateSignedDocumentAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    documentId: 'DOC-1',
    expiresInSeconds: 86400
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-23T00:00:00.000Z'
  });
  assert.equal(unsafeSignedAccess.success, false, 'long-lived signed access must be blocked');
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'SIGNED_URL_EXPIRY_UNSAFE'));

  const originalDocumentsLength = global.DB.get().documents.length;
  const scheduled = svc.scheduleDocumentVerification({
    tenantSlug: 'tabsons',
    documentId: 'DOC-1',
    empId: 'EMP-1',
    schedule: { runAt: '2026-05-23T06:00:00.000Z' },
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(scheduled.success, true, 'document verification should schedule');
  assert.equal(scheduled.state, 'REVIEW_PENDING');
  assert.equal(scheduled.asyncJob?.success, true, 'document verification should integrate with AsyncJobService');
  assert.ok(global.DB.get().asyncJobs.some(row => row.jobType === 'DOCUMENT_VERIFICATION' && row.tenantSlug === 'tabsons'), 'DOCUMENT_VERIFICATION job should be queued');
  assert.equal(global.DB.get().documents.length, originalDocumentsLength, 'validation-only scheduling must not mutate document records');

  const report = svc.generateDocumentGovernanceReport({ tenantSlug: 'tabsons', currentDate: '2026-05-23' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(report.success, true, 'document governance report should generate');
  assert.ok(report.documentHealth.totalDocuments >= 2, 'document health should be visible');
  assert.ok(report.verificationHealth.pendingVerifications >= 1, 'verification health should be visible');
  assert.ok(report.expiryGovernance.expiringDocuments >= 1, 'expiry governance should be visible');
  assert.ok(report.asyncProcessing.asyncDocumentJobs >= 1, 'async document queue should be visible');
  assert.equal(report.accessGovernance.superAdminRawDocumentAccess, false, 'SUPER_ADMIN raw document access must remain blocked');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /DOC-X|EMP-X|abc-secret|aadhaar-private|signed\.example|identity document private/i, 'report must filter cross-tenant and raw document data');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  delete global.AsyncJobService;
  delete global.NotificationOrchestrationService;
  const degraded = svc.scheduleDocumentVerification({
    tenantSlug: 'tabsons',
    documentId: 'DOC-1',
    empId: 'EMP-1',
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degraded.success, true, 'missing async dependencies should degrade safely');
  assert.equal(degraded.asyncJob.success, false, 'missing async dependency should be represented without throwing');
  global.AsyncJobService = originalAsync;
  global.NotificationOrchestrationService = originalNotify;

  const malformed = svc.validateDocumentUpload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed upload payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_DOCUMENT_PAYLOAD'));

  console.log('documentGovernanceService.test.js passed');
}

main();
