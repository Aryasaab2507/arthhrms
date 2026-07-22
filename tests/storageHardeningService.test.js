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

function seedStorageData() {
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
  data.storageBuckets = [
    { bucket: 'employee-docs', tenantSlug: 'tabsons', private: true, public: false, quotaBytes: 2 * 1024 * 1024 },
    { bucket: 'expense-attachments', tenantSlug: 'tabsons', private: true, public: false, quotaBytes: 3 * 1024 * 1024 },
    { bucket: 'legacy-public', tenantSlug: 'tabsons', private: false, public: true, quotaBytes: 1024 * 1024 },
    { bucket: 'employee-docs', tenantSlug: 'abc', private: false, public: true, quotaBytes: 1024 * 1024 }
  ];
  data.storageObjects = [
    {
      objectId: 'OBJ-1',
      tenantSlug: 'tabsons',
      bucket: 'employee-docs',
      objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
      objectKey: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
      empId: 'EMP-1',
      state: 'ACTIVE',
      size: 500000,
      checksum: 'hash-doc-1',
      mimeType: 'application/pdf',
      createdAt: '2026-05-20T10:00:00.000Z'
    },
    {
      objectId: 'OBJ-2',
      tenantSlug: 'tabsons',
      bucket: 'expense-attachments',
      objectPath: 'tabsons/EMP-2/EXP-1/receipt-private.jpg',
      empId: 'EMP-2',
      workflowId: 'WF-1',
      state: 'EXPIRED',
      size: 700000,
      checksum: 'dup-hash-1',
      mimeType: 'image/jpeg',
      expiresAt: '2026-05-25T00:00:00.000Z',
      createdAt: '2026-05-18T10:00:00.000Z'
    },
    {
      objectId: 'OBJ-3',
      tenantSlug: 'tabsons',
      bucket: 'employee-docs',
      objectPath: 'tabsons/orphan/tmp-upload-private.pdf',
      state: 'CREATED',
      size: 400000,
      checksum: 'orphan-hash-1',
      mimeType: 'application/pdf',
      uploadStatus: 'ABANDONED',
      createdAt: '2026-05-15T10:00:00.000Z'
    },
    {
      objectId: 'OBJ-4',
      tenantSlug: 'tabsons',
      bucket: 'employee-docs',
      objectPath: 'tabsons/EMP-2/DOC-4/duplicate-private.pdf',
      empId: 'EMP-2',
      state: 'ACTIVE',
      size: 300000,
      checksum: 'dup-hash-1',
      mimeType: 'application/pdf',
      signedUrl: 'https://signed.example.com/duplicate-private',
      signedUrlExpiresAt: '2026-05-25T00:00:00.000Z',
      createdAt: '2026-05-21T10:00:00.000Z'
    },
    {
      objectId: 'OBJ-5',
      tenantSlug: 'tabsons',
      bucket: 'legacy-public',
      objectPath: 'tabsons/public/unsafe-private.pdf',
      empId: 'EMP-1',
      state: 'ACTIVE',
      size: 150000,
      checksum: '',
      publicUrl: 'https://public.example.com/unsafe-private.pdf',
      createdAt: '2026-05-22T10:00:00.000Z'
    },
    {
      objectId: 'OBJ-X',
      tenantSlug: 'abc',
      bucket: 'employee-docs',
      objectPath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf',
      empId: 'EMP-X',
      state: 'ACTIVE',
      size: 900000,
      checksum: 'abc-hash',
      publicUrl: 'https://public.example.com/abc-secret-passport.pdf',
      privateNote: 'ABC confidential object'
    }
  ];
  data.documents = [
    { documentId: 'DOC-1', tenantSlug: 'tabsons', empId: 'EMP-1', storagePath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf', checksum: 'hash-doc-1', fileName: 'aadhaar-private.pdf' },
    { documentId: 'DOC-X', tenantSlug: 'abc', empId: 'EMP-X', storagePath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf', checksum: 'abc-hash', fileName: 'abc-secret-passport.pdf' }
  ];
  data.fileAttachments = [
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-2', workflowId: 'WF-1', storagePath: 'tabsons/EMP-2/EXP-1/receipt-private.jpg', checksum: 'dup-hash-1', fileName: 'receipt-private.jpg' }
  ];
  data.uploadValidationRecords = [
    { validationId: 'UV-1', tenantSlug: 'tabsons', uploadId: 'UP-1', state: 'APPROVED', objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf' },
    { validationId: 'UV-2', tenantSlug: 'tabsons', uploadId: 'UP-2', state: 'REJECTED', objectPath: 'tabsons/tmp/failed-private.exe', uploadStatus: 'FAILED' }
  ];
  data.storageAccessLogs = [
    { logId: 'SAL-1', tenantSlug: 'tabsons', objectId: 'OBJ-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-25T10:00:00.000Z' },
    { logId: 'SAL-2', tenantSlug: 'tabsons', objectId: 'OBJ-5', action: 'BROWSE', actorRole: 'SUPER_ADMIN', actorId: 'SA-1', status: 'DENIED', reason: 'raw tenant storage browse blocked', createdAt: '2026-05-25T11:00:00.000Z' },
    { logId: 'SAL-3', tenantSlug: 'tabsons', objectId: 'OBJ-4', action: 'DOWNLOAD', actorRole: 'HR', actorId: 'HR-1', status: 'DENIED', reason: 'expired signed url', createdAt: '2026-05-26T01:00:00.000Z' },
    { logId: 'SAL-4', tenantSlug: 'tabsons', objectId: 'OBJ-2', action: 'DOWNLOAD', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'download throttle exceeded', createdAt: '2026-05-26T02:00:00.000Z' },
    { logId: 'SAL-X', tenantSlug: 'abc', objectId: 'OBJ-X', action: 'DOWNLOAD', actorRole: 'HR', actorId: 'HR-X', status: 'DENIED', reason: 'ABC confidential denied' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-STO-1', tenantSlug: 'tabsons', jobType: 'STORAGE_CLEANUP_SCAN', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'OBJ-3' },
    { jobId: 'JOB-STO-X', tenantSlug: 'abc', jobType: 'STORAGE_CLEANUP_SCAN', state: 'FAILED', payload: { objectPath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf', publicUrl: 'https://public.example.com/abc-secret-passport.pdf' } }
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
    'services/documentVisibilityService.js',
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/recruitmentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/storageHardeningService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedStorageData();

  const svc = global.StorageHardeningService;
  assert.ok(svc, 'StorageHardeningService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.STORAGE_STATES), 'storage states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_STORAGE_HARDENING_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyStorageRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant storage risk is critical');
  assert.equal(svc.classifyStorageRisk({ publicBucket: true }), 'CRITICAL_BLOCKER', 'public bucket exposure is critical');
  assert.equal(svc.classifyStorageRisk({ orphanObject: true }), 'HIGH_RISK', 'orphan objects are high risk');
  assert.equal(svc.classifyStorageRisk({ quotaWarning: true }), 'WARNING', 'quota warnings are warning risk');

  const employeeOwn = svc.validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-1', objectId: 'OBJ-1', objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own storage metadata');
  assert.equal(employeeOwn.visibility, 'OWN_STORAGE_OBJECTS_ONLY');

  const managerWorkflow = svc.validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-2', objectId: 'OBJ-2', workflowId: 'WF-1', objectPath: 'tabsons/EMP-2/EXP-1/receipt-private.jpg' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may access workflow-scoped team storage metadata');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_STORAGE_VISIBILITY');

  const superAdminRaw = svc.validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-1', objectId: 'OBJ-1', objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf', browseRawStorage: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminRaw.allowed, false, 'SUPER_ADMIN must not browse raw tenant storage');
  assert.ok(superAdminRaw.failures.some(item => item.failureCode === 'SUPER_ADMIN_RAW_STORAGE_BROWSE_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminRaw), /OBJ-1|EMP-1|aadhaar-private|objectPath|tabsons\/EMP-1/i, 'SUPER_ADMIN failure must redact raw storage details');

  const platformScope = svc.validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-1', objectId: 'OBJ-1', objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in storage access chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_STORAGE_CHAIN_BLOCKED'));

  const crossTenant = svc.validateStorageScope({ tenantSlug: 'abc', empId: 'EMP-X', objectId: 'OBJ-X', objectPath: 'abc/EMP-X/DOC-X/abc-secret-passport.pdf', privateNote: 'ABC confidential object' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant object visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /OBJ-X|EMP-X|abc-secret|ABC confidential|objectPath|privateNote/i, 'cross-tenant storage output must not leak object data');

  const malformed = svc.normalizeStoragePayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed storage payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_STORAGE_PAYLOAD'));

  const normalized = svc.normalizeStoragePayload({
    tenantSlug: 'tabsons',
    objectId: 'OBJ-1',
    empId: 'EMP-1',
    state: 'scheduled for cleanup',
    bucket: 'employee-docs',
    objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
    signedUrl: 'https://signed.example.com/aadhaar-private',
    size: 500000
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid storage payload should normalize');
  assert.equal(normalized.payload.state, 'SCHEDULED_FOR_CLEANUP');
  assert.ok(Object.isFrozen(normalized), 'normalized storage output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /OBJ-1|EMP-1|aadhaar-private|objectPath|signedUrl|employee-docs/i, 'normalized storage output must redact raw storage details');

  const signedAccess = svc.generateSignedStorageAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    objectId: 'OBJ-1',
    bucket: 'employee-docs',
    objectPath: 'tabsons/EMP-1/DOC-1/aadhaar-private.pdf',
    accessType: 'download',
    expiresInSeconds: 900,
    securePreview: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(signedAccess.success, true, 'safe signed storage access should be generated');
  assert.equal(signedAccess.state, 'ACTIVE');
  assert.equal(signedAccess.signedAccess.expiresAt, '2026-05-26T00:15:00.000Z');
  assert.equal(signedAccess.signedAccess.signedUrlRedacted, true);
  assert.equal(signedAccess.signedAccess.tenantAwareSignedUrl, true);
  assert.doesNotMatch(JSON.stringify(signedAccess), /aadhaar-private|objectPath|employee-docs|https?:\/\//i, 'signed storage access must not expose raw object paths or URLs');

  const unsafeSignedAccess = svc.generateSignedStorageAccess({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    objectId: 'OBJ-5',
    bucket: 'legacy-public',
    objectPath: 'tabsons/public/unsafe-private.pdf',
    expiresInSeconds: 86400,
    publicUrl: 'https://public.example.com/unsafe-private.pdf'
  }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
  assert.equal(unsafeSignedAccess.success, false, 'public or long-lived signed storage access must be blocked');
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'SIGNED_STORAGE_EXPIRY_UNSAFE'));
  assert.ok(unsafeSignedAccess.failures.some(item => item.failureCode === 'PUBLIC_STORAGE_EXPOSURE_BLOCKED'));

  const cleanup = svc.scheduleStorageCleanup({
    tenantSlug: 'tabsons',
    objectId: 'OBJ-3',
    objectPath: 'tabsons/orphan/tmp-upload-private.pdf',
    cleanupReason: 'orphaned upload',
    dryRun: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(cleanup.success, true, 'cleanup should be schedulable safely');
  assert.equal(cleanup.state, 'SCHEDULED_FOR_CLEANUP');
  assert.equal(cleanup.cleanupGovernance.unsafeMassDeletionBlocked, true);
  assert.doesNotMatch(JSON.stringify(cleanup), /OBJ-3|tmp-upload-private|objectPath/i, 'cleanup output must redact raw object details');

  const quota = svc.validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-1', bucket: 'employee-docs', objectPath: 'tabsons/EMP-1/DOC-NEW/new-private.pdf', size: 2 * 1024 * 1024 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(quota.allowed, false, 'tenant storage quota overflow should be blocked');
  assert.ok(quota.failures.some(item => item.failureCode === 'TENANT_STORAGE_QUOTA_EXCEEDED'));

  const anomalies = svc.detectStorageAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-26T00:00:00.000Z' });
  assert.equal(anomalies.success, true, 'storage anomaly detection should work');
  assert.ok(anomalies.summary.publicBucketExposure >= 1, 'public bucket exposure should be counted');
  assert.ok(anomalies.summary.orphanedObjects >= 1, 'orphaned objects should be counted');
  assert.ok(anomalies.summary.duplicateObjects >= 1, 'duplicate objects should be counted');
  assert.ok(anomalies.summary.staleSignedUrls >= 1, 'stale signed URLs should be counted');
  assert.ok(anomalies.summary.failedUploadRemnants >= 1, 'failed upload remnants should be counted');
  assert.ok(anomalies.summary.suspiciousStorageAccess >= 1, 'suspicious storage access should be counted');
  assert.ok(Object.isFrozen(anomalies.signals), 'storage anomaly signals must be immutable');
  assert.doesNotMatch(JSON.stringify(anomalies), /OBJ-X|EMP-X|abc-secret|ABC confidential|aadhaar-private|tmp-upload-private|objectPath|public\.example/i, 'anomaly output must redact object details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    storageBuckets: before.storageBuckets,
    storageObjects: before.storageObjects,
    storageAccessLogs: before.storageAccessLogs,
    documents: before.documents,
    fileAttachments: before.fileAttachments,
    uploadValidationRecords: before.uploadValidationRecords
  });
  const report = svc.generateStorageHardeningReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-26T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'storage hardening report should generate');
  assert.equal(report.readOnly, true, 'storage hardening report must be read-only');
  assert.ok(report.storageHealth.totalObjects >= 5, 'storage health should aggregate tenant objects');
  assert.ok(report.tenantIsolation.tenantScopedBucketPaths, 'tenant-scoped bucket paths should be visible');
  assert.ok(report.secureStorageGovernance.signedUploadUrls, 'signed upload governance should be visible');
  assert.ok(report.cleanupGovernance.orphanedUploads >= 1, 'cleanup governance should surface orphaned uploads');
  assert.ok(report.storageAnalytics.storageGrowthBytes >= 1, 'storage analytics should include growth bytes');
  assert.equal(report.accessGovernance.superAdminRawStorageBrowse, false, 'SUPER_ADMIN raw tenant storage browse remains blocked');
  assert.equal(report.accessGovernance.platformOwnerStorageChain, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.storageServiceIntegrated, 'StorageService integration should be detected');
  assert.ok(report.integrationHealth.documentVisibilityIntegrated, 'DocumentVisibilityService integration should be detected');
  assert.ok(report.integrationHealth.uploadValidationIntegrated, 'UploadValidationService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /OBJ-X|EMP-X|abc-secret|ABC confidential|aadhaar-private|receipt-private|tmp-upload-private|public\.example|objectPath|fileName|employee-docs/i, 'report must not expose cross-tenant or raw storage data');
  assert.equal(JSON.stringify({
    storageBuckets: global.DB.get().storageBuckets,
    storageObjects: global.DB.get().storageObjects,
    storageAccessLogs: global.DB.get().storageAccessLogs,
    documents: global.DB.get().documents,
    fileAttachments: global.DB.get().fileAttachments,
    uploadValidationRecords: global.DB.get().uploadValidationRecords
  }), historicalBefore, 'storage report must not mutate historical storage records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /STORAGE_HARDENING|STORAGE_ACCESS/.test(row.eventType || row.category || '')), 'storage hardening telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STORAGE_HARDENING_REPORTED, 'storage hardening metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /STORAGE_HARDENING|STORAGE_ACCESS/.test(row.actionType || row.action || '')), 'storage hardening actions should be audited safely');

  const originalStorage = global.storageService;
  const originalVisibility = global.DocumentVisibilityService;
  const originalAttachment = global.FileAttachmentGovernanceService;
  const originalUpload = global.UploadValidationService;
  try {
    delete global.storageService;
    delete global.DocumentVisibilityService;
    delete global.FileAttachmentGovernanceService;
    delete global.UploadValidationService;
    const degraded = svc.generateStorageHardeningReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing storage dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.storageServiceIntegrated, false, 'missing storage dependency should be visible');
    assert.equal(degraded.integrationHealth.documentVisibilityIntegrated, false, 'missing visibility dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalStorage) global.storageService = originalStorage;
    if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
    if (originalUpload) global.UploadValidationService = originalUpload;
  }

  console.log('storageHardeningService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
