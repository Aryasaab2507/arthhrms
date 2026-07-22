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

function seedUploadValidationData() {
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
  data.uploadValidationRecords = [
    {
      validationId: 'UV-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      uploadId: 'UP-1',
      workflowId: 'WF-1',
      state: 'APPROVED',
      fileName: 'policy-private.pdf',
      mimeType: 'application/pdf',
      declaredMimeType: 'application/pdf',
      extension: 'pdf',
      size: 250000,
      checksum: 'safe-hash-1',
      signature: '%PDF',
      storagePath: 'tabsons/uploads/UP-1/policy-private.pdf',
      createdAt: '2026-05-24T10:00:00.000Z'
    },
    {
      validationId: 'UV-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      uploadId: 'UP-2',
      state: 'QUARANTINED',
      fileName: 'invoice-private.xlsm',
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsm',
      size: 600000,
      checksum: 'dup-threat-hash',
      signature: 'PK',
      hasMacros: true,
      embeddedScript: true,
      quarantineReason: 'suspicious macros',
      storagePath: 'tabsons/quarantine/UP-2/invoice-private.xlsm',
      createdAt: '2026-05-24T12:00:00.000Z'
    },
    {
      validationId: 'UV-3',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      uploadId: 'UP-3',
      state: 'REJECTED',
      fileName: 'salary-private.pdf.exe',
      mimeType: 'application/x-msdownload',
      declaredMimeType: 'application/pdf',
      extension: 'exe',
      size: 30 * 1024 * 1024,
      checksum: '',
      signature: 'MZ',
      publicUrl: 'https://public.example.com/salary-private.pdf.exe',
      malwareIndicators: ['executable_payload', 'disguised_extension'],
      uploadStatus: 'FAILED',
      createdAt: '2026-05-25T10:00:00.000Z'
    },
    {
      validationId: 'UV-4',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      uploadId: 'UP-4',
      state: 'RESTRICTED',
      fileName: 'receipt-private.jpg',
      mimeType: 'image/jpeg',
      declaredMimeType: 'image/jpeg',
      extension: 'jpg',
      size: 120000,
      checksum: 'dup-threat-hash',
      corrupted: true,
      createdAt: '2026-05-25T11:00:00.000Z'
    },
    {
      validationId: 'UV-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      uploadId: 'UP-X',
      state: 'QUARANTINED',
      fileName: 'abc-secret-malware.exe',
      mimeType: 'application/x-msdownload',
      declaredMimeType: 'application/pdf',
      extension: 'exe',
      size: 999999,
      checksum: 'abc-threat',
      signature: 'MZ',
      publicUrl: 'https://public.example.com/abc-secret-malware.exe',
      privateNote: 'ABC confidential upload threat'
    }
  ];
  data.fileAttachments = [
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', workflowId: 'WF-1', fileName: 'leave-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 245000, checksum: 'safe-hash-1', storagePath: 'tabsons/attachments/ATT-1/leave-private.pdf' },
    { attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', fileName: 'dup-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 125000, checksum: 'dup-threat-hash', storagePath: 'tabsons/attachments/ATT-2/dup-private.pdf' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', fileName: 'abc-secret-resume.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 125000, checksum: 'abc-threat', publicUrl: 'https://public.example.com/abc-secret-resume.pdf' }
  ];
  data.documents = [
    { documentId: 'DOC-1', tenantSlug: 'tabsons', empId: 'EMP-1', fileName: 'aadhaar-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 300000, checksum: 'doc-safe-1', storagePath: 'tabsons/docs/DOC-1/aadhaar-private.pdf' }
  ];
  data.workflowDiscussionAttachments = [
    { attachmentId: 'WFA-1', tenantSlug: 'tabsons', workflowId: 'WF-1', threadId: 'TH-1', empId: 'EMP-1', fileName: 'workflow-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 120000, checksum: 'wf-safe-1', storagePath: 'tabsons/workflows/WFA-1/workflow-private.pdf' }
  ];
  data.communicationAttachments = [
    { attachmentId: 'COMA-1', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-1', fileName: 'policy-private.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 100000, checksum: 'comm-safe-1', storagePath: 'tabsons/comms/COMA-1/policy-private.pdf' }
  ];
  data.recruitmentDocuments = [
    { documentId: 'REC-1', attachmentId: 'REC-1', tenantSlug: 'tabsons', candidateId: 'CAND-1', fileName: 'candidate-private-resume.pdf', mimeType: 'application/pdf', extension: 'pdf', size: 500000, checksum: 'resume-safe-1', storagePath: 'tabsons/recruitment/REC-1/candidate-private-resume.pdf' }
  ];
  data.quarantineRecords = [
    { quarantineId: 'Q-1', tenantSlug: 'tabsons', uploadId: 'UP-2', state: 'QUARANTINED', reason: 'macro indicators', createdAt: '2026-05-24T12:05:00.000Z' },
    { quarantineId: 'Q-X', tenantSlug: 'abc', uploadId: 'UP-X', state: 'QUARANTINED', reason: 'ABC confidential malware' }
  ];
  data.uploadAccessLogs = [
    { logId: 'UAL-1', tenantSlug: 'tabsons', uploadId: 'UP-1', action: 'VALIDATE', status: 'APPROVED', actorRole: 'HR' },
    { logId: 'UAL-2', tenantSlug: 'tabsons', uploadId: 'UP-3', action: 'DOWNLOAD', status: 'BLOCKED', actorRole: 'SUPER_ADMIN', reason: 'quarantined file blocked' },
    { logId: 'UAL-X', tenantSlug: 'abc', uploadId: 'UP-X', action: 'DOWNLOAD', status: 'BLOCKED', actorRole: 'HR', reason: 'ABC confidential blocked' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-UP-1', tenantSlug: 'tabsons', jobType: 'UPLOAD_VALIDATION_SCAN', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'UP-3' },
    { jobId: 'JOB-UP-X', tenantSlug: 'abc', jobType: 'UPLOAD_VALIDATION_SCAN', state: 'FAILED', payload: { fileName: 'abc-secret-malware.exe', publicUrl: 'https://public.example.com/abc-secret-malware.exe' } }
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
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/recruitmentGovernanceService.js',
    'services/fileAttachmentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/uploadValidationService.js');
  seedUploadValidationData();

  const svc = global.UploadValidationService;
  assert.ok(svc, 'UploadValidationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.VALIDATION_STATES), 'validation states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_UPLOAD_VALIDATION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyUploadRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant upload visibility is critical');
  assert.equal(svc.classifyUploadRisk({ executablePayload: true }), 'CRITICAL_BLOCKER', 'unsafe executable upload is critical');
  assert.equal(svc.classifyUploadRisk({ suspiciousMacros: true }), 'HIGH_RISK', 'suspicious macros are high risk');
  assert.equal(svc.classifyUploadRisk({ mimeMismatch: true }), 'WARNING', 'MIME mismatches are warning risk');

  const employeeOwn = svc.validateUploadScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may view own upload validation metadata');
  assert.equal(employeeOwn.visibility, 'OWN_UPLOADS_ONLY');

  const managerWorkflow = svc.validateUploadScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may see workflow-scoped upload metadata for team uploads');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_UPLOAD_VISIBILITY');

  const superAdminBypass = svc.validateUploadScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-3', fileName: 'salary-private.pdf.exe', bypassValidation: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass upload validation rules');
  assert.ok(superAdminBypass.failures.some(item => item.failureCode === 'SUPER_ADMIN_UPLOAD_BYPASS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminBypass), /salary-private|UP-3|fileName|bypassValidation/i, 'SUPER_ADMIN failure output must redact upload details');

  const platformScope = svc.validateUploadScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in upload workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_UPLOAD_WORKFLOW_BLOCKED'));

  const crossTenant = svc.validateUploadScope({ tenantSlug: 'abc', empId: 'EMP-X', uploadId: 'UP-X', fileName: 'abc-secret-malware.exe', privateNote: 'ABC confidential upload threat' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant upload visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /UP-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant failure must not leak upload data');

  const malformed = svc.normalizeUploadPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed upload payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_UPLOAD_PAYLOAD'));

  const normalized = svc.normalizeUploadPayload({
    tenantSlug: 'tabsons',
    uploadId: 'UP-1',
    state: 'scanning',
    empId: 'EMP-1',
    fileName: 'policy-private.pdf',
    storagePath: 'tabsons/uploads/UP-1/policy-private.pdf',
    publicUrl: 'https://public.example.com/policy-private.pdf',
    mimeType: 'application/pdf',
    size: 250000
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid upload payload should normalize');
  assert.equal(normalized.payload.state, 'SCANNING');
  assert.ok(Object.isFrozen(normalized), 'normalized upload output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /policy-private|storagePath|publicUrl|public\.example|EMP-1|fileName|UP-1/i, 'normalized upload output must redact raw upload details');

  const validation = svc.validateUploadSecurity({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    uploadId: 'UP-NEW',
    workflowId: 'WF-1',
    fileName: 'salary-private.pdf.exe',
    mimeType: 'application/x-msdownload',
    declaredMimeType: 'application/pdf',
    extension: 'exe',
    size: 30 * 1024 * 1024,
    checksum: '',
    publicUrl: 'https://public.example.com/salary-private.pdf.exe',
    signature: 'MZ',
    hasMacros: true,
    embeddedScript: true,
    archiveCompressionRatio: 250,
    malformedPdf: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(validation.success, false, 'malicious upload should be blocked');
  assert.equal(validation.state, 'QUARANTINED');
  assert.ok(validation.failures.some(item => item.failureCode === 'UNSAFE_EXECUTABLE_UPLOAD_BLOCKED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'RESTRICTED_UPLOAD_EXTENSION_BLOCKED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'UPLOAD_TOO_LARGE'));
  assert.ok(validation.failures.some(item => item.failureCode === 'PUBLIC_MALICIOUS_FILE_EXPOSURE_BLOCKED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'UPLOAD_INTEGRITY_VALIDATION_REQUIRED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'FILE_SIGNATURE_MISMATCH'));
  assert.ok(validation.failures.some(item => item.failureCode === 'MALWARE_PATTERN_DETECTED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'ARCHIVE_BOMB_INDICATOR_DETECTED'));
  assert.ok(validation.failures.some(item => item.failureCode === 'MALFORMED_PDF_DETECTED'));
  assert.doesNotMatch(JSON.stringify(validation), /salary-private|public\.example|fileName|publicUrl|storagePath/i, 'validation output must redact malicious file details');

  const duplicate = svc.validateUploadSecurity({
    tenantSlug: 'tabsons',
    empId: 'EMP-2',
    uploadId: 'UP-DUP',
    fileName: 'duplicate-private.pdf',
    mimeType: 'application/pdf',
    declaredMimeType: 'application/pdf',
    extension: 'pdf',
    size: 120000,
    checksum: 'dup-threat-hash'
  }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
  assert.equal(duplicate.success, false, 'duplicate upload should be restricted');
  assert.ok(duplicate.failures.some(item => item.failureCode === 'DUPLICATE_UPLOAD_HASH_DETECTED'));

  const tenantMismatch = svc.validateUploadSecurity({ tenantSlug: 'abc', empId: 'EMP-X', uploadId: 'UP-X', fileName: 'abc-secret.pdf', mimeType: 'application/pdf', size: 1000, checksum: 'abc' }, { tenantSlug: 'tabsons' });
  assert.equal(tenantMismatch.classification, 'CRITICAL_BLOCKER');
  assert.ok(tenantMismatch.failures.some(item => item.failureCode === 'TENANT_MISMATCH'));

  const quarantine = svc.quarantineUpload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    uploadId: 'UP-3',
    reason: 'executable payload',
    fileName: 'salary-private.pdf.exe',
    publicUrl: 'https://public.example.com/salary-private.pdf.exe'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(quarantine.success, true, 'quarantine marker should be created safely');
  assert.equal(quarantine.state, 'QUARANTINED');
  assert.equal(quarantine.quarantineGovernance.blockedDownloadAccess, true);
  assert.equal(quarantine.quarantineGovernance.restrictedVisibility, true);
  assert.doesNotMatch(JSON.stringify(quarantine), /salary-private|public\.example|fileName|publicUrl/i, 'quarantine output must not expose quarantined file content');

  const suspicious = svc.detectSuspiciousFilePatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-26T00:00:00.000Z' });
  assert.equal(suspicious.success, true, 'suspicious file pattern detection should work');
  assert.ok(suspicious.summary.executablePayloads >= 1, 'executable payloads should be counted');
  assert.ok(suspicious.summary.mimeMismatches >= 1, 'MIME mismatches should be counted');
  assert.ok(suspicious.summary.duplicateHashes >= 1, 'duplicate hashes should be counted');
  assert.ok(suspicious.summary.malwareIndicators >= 1, 'malware indicators should be counted');
  assert.ok(suspicious.summary.quarantineBuildup >= 1, 'quarantine buildup should be counted');
  assert.ok(Object.isFrozen(suspicious.threatSignals), 'threat signals must be immutable');
  assert.doesNotMatch(JSON.stringify(suspicious), /UP-X|abc-secret|salary-private|invoice-private|receipt-private|storagePath|publicUrl|fileName|ABC confidential/i, 'threat detection output must redact file details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    uploadValidationRecords: before.uploadValidationRecords,
    fileAttachments: before.fileAttachments,
    documents: before.documents,
    workflowDiscussionAttachments: before.workflowDiscussionAttachments,
    communicationAttachments: before.communicationAttachments,
    recruitmentDocuments: before.recruitmentDocuments,
    quarantineRecords: before.quarantineRecords
  });
  const report = svc.generateUploadValidationReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'upload validation report should generate');
  assert.equal(report.readOnly, true, 'upload validation report must be read-only');
  assert.ok(report.validationHealth.totalUploads >= 4, 'validation health should aggregate uploads');
  assert.ok(report.threatDetection.executablePayloads >= 1, 'malware detection should surface executable payloads');
  assert.ok(report.quarantineGovernance.quarantinedUploads >= 1, 'quarantine summaries should be visible');
  assert.ok(report.mimeValidation.mimeMismatches >= 1, 'MIME validation should aggregate mismatches');
  assert.ok(report.uploadAnalytics.uploadCongestion >= 1, 'upload analytics should show congestion');
  assert.equal(report.accessGovernance.superAdminValidationBypass, false, 'SUPER_ADMIN bypass remains blocked');
  assert.equal(report.accessGovernance.platformOwnerUploadWorkflow, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /UP-X|EMP-X|abc-secret|salary-private|invoice-private|receipt-private|candidate-private|public\.example|storagePath|publicUrl|fileName|ABC confidential/i, 'report must not expose cross-tenant or raw upload data');
  assert.equal(JSON.stringify({
    uploadValidationRecords: global.DB.get().uploadValidationRecords,
    fileAttachments: global.DB.get().fileAttachments,
    documents: global.DB.get().documents,
    workflowDiscussionAttachments: global.DB.get().workflowDiscussionAttachments,
    communicationAttachments: global.DB.get().communicationAttachments,
    recruitmentDocuments: global.DB.get().recruitmentDocuments,
    quarantineRecords: global.DB.get().quarantineRecords
  }), historicalBefore, 'upload validation report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /UPLOAD_VALIDATION|THREAT_DETECTION/.test(row.eventType || row.category || '')), 'upload validation telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.UPLOAD_VALIDATION_REPORTED, 'upload validation metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /UPLOAD_VALIDATION|THREAT_DETECTION/.test(row.actionType || row.action || '')), 'upload validation actions should be audited safely');

  const originalAttachment = global.FileAttachmentGovernanceService;
  const originalDocument = global.DocumentGovernanceService;
  const originalDiscussion = global.WorkflowDiscussionService;
  const originalRecruitment = global.RecruitmentGovernanceService;
  try {
    delete global.FileAttachmentGovernanceService;
    delete global.DocumentGovernanceService;
    delete global.WorkflowDiscussionService;
    delete global.RecruitmentGovernanceService;
    const degraded = svc.generateUploadValidationReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing upload dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.fileAttachmentGovernanceIntegrated, false, 'missing attachment dependency should be visible');
    assert.equal(degraded.integrationHealth.documentGovernanceIntegrated, false, 'missing document dependency should be visible');
  } finally {
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
    if (originalDocument) global.DocumentGovernanceService = originalDocument;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
    if (originalRecruitment) global.RecruitmentGovernanceService = originalRecruitment;
  }

  console.log('uploadValidationService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
