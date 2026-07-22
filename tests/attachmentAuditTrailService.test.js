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

function seedAttachmentAuditData() {
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
    {
      attachmentId: 'ATT-1',
      tenantSlug: 'tabsons',
      empId: 'EMP-1',
      ownerEmpId: 'EMP-1',
      workflowId: 'WF-1',
      type: 'WORKFLOW_ATTACHMENT',
      state: 'ACTIVE',
      fileName: 'leave-private.pdf',
      storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf',
      checksum: 'hash-1'
    },
    {
      attachmentId: 'ATT-2',
      tenantSlug: 'tabsons',
      empId: 'EMP-2',
      ownerEmpId: 'EMP-2',
      workflowId: 'WF-1',
      type: 'REIMBURSEMENT_RECEIPT',
      state: 'ACTIVE',
      fileName: 'receipt-private.jpg',
      storagePath: 'tabsons/EMP-2/ATT-2/receipt-private.jpg',
      checksum: 'hash-2'
    },
    {
      attachmentId: 'ATT-X',
      tenantSlug: 'abc',
      empId: 'EMP-X',
      ownerEmpId: 'EMP-X',
      workflowId: 'WF-X',
      type: 'RESUME',
      state: 'ACTIVE',
      fileName: 'abc-secret-resume.pdf',
      storagePath: 'abc/EMP-X/ATT-X/abc-secret-resume.pdf',
      publicUrl: 'https://public.example.com/abc-secret-resume.pdf',
      privateNote: 'ABC confidential resume'
    }
  ];
  data.attachmentAuditEvents = [
    { eventId: 'AAE-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', eventType: 'UPLOAD', state: 'RECORDED', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T08:00:00.000Z', fileName: 'leave-private.pdf' },
    { eventId: 'AAE-2', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', eventType: 'SIGNED_URL_GENERATED', state: 'VERIFIED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T08:05:00.000Z', signedUrl: 'https://signed.example.com/leave-private' },
    { eventId: 'AAE-3', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', eventType: 'DOWNLOAD', state: 'VERIFIED', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T08:10:00.000Z' },
    { eventId: 'AAE-4', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', eventType: 'PREVIEW', state: 'FLAGGED', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'expired token', createdAt: '2026-05-25T08:12:00.000Z' },
    { eventId: 'AAE-5', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-2', eventType: 'DOWNLOAD', state: 'FLAGGED', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'cross workflow access', createdAt: '2026-05-25T09:00:00.000Z' },
    { eventId: 'AAE-6', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', eventType: 'SIGNED_URL_GENERATED', state: 'FLAGGED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T09:05:00.000Z' },
    { eventId: 'AAE-7', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', eventType: 'SIGNED_URL_GENERATED', state: 'FLAGGED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T09:06:00.000Z' },
    { eventId: 'AAE-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', eventType: 'DOWNLOAD', state: 'FLAGGED', actorRole: 'HR', actorId: 'HR-X', status: 'DENIED', reason: 'ABC confidential denied', createdAt: '2026-05-25T10:00:00.000Z', fileName: 'abc-secret-resume.pdf', privateNote: 'ABC confidential resume' }
  ];
  data.attachmentAccessLogs = [
    { logId: 'AAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T08:10:00.000Z' },
    { logId: 'AAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'SUPER_ADMIN', actorId: 'SA-1', status: 'DENIED', reason: 'raw attachment access blocked', createdAt: '2026-05-25T08:11:00.000Z' },
    { logId: 'AAL-3', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'PREVIEW', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'expired token', createdAt: '2026-05-25T08:12:00.000Z' },
    { logId: 'AAL-4', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T08:13:00.000Z' },
    { logId: 'AAL-5', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T08:14:00.000Z' },
    { logId: 'AAL-6', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-2', action: 'DOWNLOAD', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'cross workflow access', createdAt: '2026-05-25T09:00:00.000Z' },
    { logId: 'AAL-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', action: 'DOWNLOAD', actorRole: 'HR', actorId: 'HR-X', status: 'DENIED', reason: 'ABC confidential denied', createdAt: '2026-05-25T10:00:00.000Z' }
  ];
  data.documentAccessLogs = [
    { logId: 'DAL-1', tenantSlug: 'tabsons', documentId: 'DOC-1', attachmentId: 'ATT-1', empId: 'EMP-1', action: 'PREVIEW', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T08:07:00.000Z' }
  ];
  data.storageAccessLogs = [
    { logId: 'SAL-1', tenantSlug: 'tabsons', objectId: 'OBJ-1', attachmentId: 'ATT-1', empId: 'EMP-1', action: 'SIGNED_URL_GENERATED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-25T08:05:00.000Z' }
  ];
  data.workflowDiscussionAttachments = [
    { attachmentId: 'WFA-1', tenantSlug: 'tabsons', workflowId: 'WF-1', threadId: 'TH-1', empId: 'EMP-1', fileName: 'workflow-private.pdf', storagePath: 'tabsons/workflow/WFA-1/workflow-private.pdf' }
  ];
  data.recruitmentDocuments = [
    { documentId: 'REC-1', attachmentId: 'REC-1', tenantSlug: 'tabsons', candidateId: 'CAND-1', fileName: 'candidate-private-resume.pdf', storagePath: 'tabsons/recruitment/REC-1/candidate-private-resume.pdf' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-AUD-1', tenantSlug: 'tabsons', jobType: 'ATTACHMENT_FORENSIC_RECONSTRUCTION', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'ATT-1' },
    { jobId: 'JOB-AUD-X', tenantSlug: 'abc', jobType: 'ATTACHMENT_FORENSIC_RECONSTRUCTION', state: 'FAILED', payload: { attachmentId: 'ATT-X', fileName: 'abc-secret-resume.pdf' } }
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
    'services/workflowDiscussionService.js',
    'services/recruitmentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/attachmentAuditTrailService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedAttachmentAuditData();

  const svc = global.AttachmentAuditTrailService;
  assert.ok(svc, 'AttachmentAuditTrailService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.AUDIT_EVENT_STATES), 'audit states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_ATTACHMENT_AUDIT_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyForensicRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant audit risk is critical');
  assert.equal(svc.classifyForensicRisk({ auditTampering: true }), 'CRITICAL_BLOCKER', 'audit tampering is critical');
  assert.equal(svc.classifyForensicRisk({ suspiciousAccess: true }), 'HIGH_RISK', 'suspicious access is high risk');
  assert.equal(svc.classifyForensicRisk({ deniedAccess: true }), 'WARNING', 'denied access is warning risk');

  const employeeOwn = svc.validateAttachmentAuditScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own attachment history');
  assert.equal(employeeOwn.visibility, 'OWN_ATTACHMENT_HISTORY_ONLY');

  const managerWorkflow = svc.validateAttachmentAuditScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may access workflow-scoped team audit history');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_ATTACHMENT_AUDIT');

  const superAdminRaw = svc.validateAttachmentAuditScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', fileName: 'leave-private.pdf', storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not directly access confidential attachment contents');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_ATTACHMENT_CONTENT_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /ATT-1|EMP-1|leave-private|storagePath|fileName/i, 'SUPER_ADMIN failure must redact attachment details');

  const platformScope = svc.validateAttachmentAuditScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in attachment workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ATTACHMENT_WORKFLOW_BLOCKED'));

  const crossTenant = svc.validateAttachmentAuditScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'abc-secret-resume.pdf', privateNote: 'ABC confidential resume' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant attachment audit visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ATT-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant audit output must not leak attachment data');

  const malformed = svc.normalizeAuditPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed audit payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_ATTACHMENT_AUDIT_PAYLOAD'));

  const normalized = svc.normalizeAuditPayload({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    state: 'flagged',
    eventType: 'download',
    fileName: 'leave-private.pdf',
    storagePath: 'tabsons/EMP-1/ATT-1/leave-private.pdf',
    signedUrl: 'https://signed.example.com/leave-private'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid audit payload should normalize');
  assert.equal(normalized.payload.state, 'FLAGGED');
  assert.equal(normalized.payload.eventType, 'DOWNLOAD');
  assert.ok(Object.isFrozen(normalized), 'normalized audit output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /ATT-1|EMP-1|leave-private|storagePath|signedUrl|signed\.example/i, 'normalized audit output must redact raw attachment details');

  const suspicious = svc.detectSuspiciousAttachmentBehavior({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-26T00:00:00.000Z' });
  assert.equal(suspicious.success, true, 'suspicious attachment behavior detection should work');
  assert.ok(suspicious.summary.repeatedDeniedAccess >= 1, 'repeated denied access should be counted');
  assert.ok(suspicious.summary.expiredTokenReuse >= 1, 'expired token reuse should be counted');
  assert.ok(suspicious.summary.abnormalDownloadFrequency >= 1, 'abnormal downloads should be counted');
  assert.ok(suspicious.summary.crossWorkflowAnomalies >= 1, 'cross-workflow anomalies should be counted');
  assert.ok(suspicious.summary.suspiciousPreviewActivity >= 1, 'suspicious previews should be counted');
  assert.ok(suspicious.summary.excessiveSignedUrlGeneration >= 1, 'excessive signed URLs should be counted');
  assert.ok(Object.isFrozen(suspicious.signals), 'suspicious behavior signals must be immutable');
  assert.doesNotMatch(JSON.stringify(suspicious), /ATT-X|EMP-X|abc-secret|ABC confidential|leave-private|storagePath|fileName/i, 'suspicious output must redact raw and cross-tenant details');

  const timeline = svc.reconstructAttachmentAuditTrail({ tenantSlug: 'tabsons', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(timeline.success, true, 'forensic timeline should reconstruct');
  assert.ok(timeline.timeline.length >= 4, 'timeline should include audit and access sequence');
  assert.ok(timeline.forensicSummary.uploads >= 1, 'uploads should be reconstructed');
  assert.ok(timeline.forensicSummary.downloads >= 1, 'downloads should be reconstructed');
  assert.ok(timeline.forensicSummary.signedUrlGenerations >= 1, 'signed URL generation should be reconstructed');
  assert.ok(timeline.correlationMarkers.workflowLinkedAuditTrail, 'workflow-linked correlation marker should be present');
  assert.ok(Object.isFrozen(timeline.timeline), 'timeline output must be immutable');
  assert.doesNotMatch(JSON.stringify(timeline), /ATT-1|EMP-1|leave-private|signed\.example|storagePath|fileName/i, 'timeline must not expose raw attachment details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    attachmentAuditEvents: before.attachmentAuditEvents,
    attachmentAccessLogs: before.attachmentAccessLogs,
    fileAttachments: before.fileAttachments,
    documentAccessLogs: before.documentAccessLogs,
    storageAccessLogs: before.storageAccessLogs
  });
  const report = svc.generateAttachmentAuditReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'attachment audit report should generate');
  assert.equal(report.readOnly, true, 'attachment audit report must be read-only');
  assert.ok(report.auditHealth.totalEvents >= 7, 'audit health should aggregate forensic events');
  assert.ok(report.forensicInvestigation.reconstructedTimelines >= 1, 'forensic investigations should be visible');
  assert.ok(report.suspiciousAccess.repeatedDeniedAccess >= 1, 'suspicious access should aggregate repeated denials');
  assert.ok(report.signedUrlAuditability.signedUrlGenerations >= 1, 'signed URL auditability should aggregate');
  assert.equal(report.accessGovernance.superAdminAttachmentContentAccess, false, 'SUPER_ADMIN confidential attachment access remains blocked');
  assert.equal(report.accessGovernance.platformOwnerAttachmentWorkflow, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.storageHardeningIntegrated, 'StorageHardeningService integration should be detected');
  assert.ok(report.integrationHealth.documentVisibilityIntegrated, 'DocumentVisibilityService integration should be detected');
  assert.ok(report.integrationHealth.uploadValidationIntegrated, 'UploadValidationService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ATT-X|EMP-X|abc-secret|ABC confidential|leave-private|receipt-private|signed\.example|storagePath|fileName/i, 'report must not expose cross-tenant or raw attachment data');
  assert.equal(JSON.stringify({
    attachmentAuditEvents: global.DB.get().attachmentAuditEvents,
    attachmentAccessLogs: global.DB.get().attachmentAccessLogs,
    fileAttachments: global.DB.get().fileAttachments,
    documentAccessLogs: global.DB.get().documentAccessLogs,
    storageAccessLogs: global.DB.get().storageAccessLogs
  }), historicalBefore, 'attachment audit report must not mutate historical forensic records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ATTACHMENT_AUDIT|FILE_FORENSIC/.test(row.eventType || row.category || '')), 'attachment forensic telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ATTACHMENT_AUDIT_REPORTED, 'attachment audit metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ATTACHMENT_AUDIT|FILE_FORENSIC/.test(row.actionType || row.action || '')), 'attachment forensic actions should be audited safely');

  const originalStorage = global.StorageHardeningService;
  const originalVisibility = global.DocumentVisibilityService;
  const originalAttachment = global.FileAttachmentGovernanceService;
  const originalUpload = global.UploadValidationService;
  try {
    delete global.StorageHardeningService;
    delete global.DocumentVisibilityService;
    delete global.FileAttachmentGovernanceService;
    delete global.UploadValidationService;
    const degraded = svc.generateAttachmentAuditReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing forensic dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.storageHardeningIntegrated, false, 'missing storage dependency should be visible');
    assert.equal(degraded.integrationHealth.documentVisibilityIntegrated, false, 'missing visibility dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalStorage) global.StorageHardeningService = originalStorage;
    if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
    if (originalUpload) global.UploadValidationService = originalUpload;
  }

  console.log('attachmentAuditTrailService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
