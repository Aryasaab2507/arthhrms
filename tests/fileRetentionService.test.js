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

function seedRetentionData() {
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
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-1', type: 'ONBOARDING_DOCUMENT', state: 'ACTIVE', fileName: 'onboarding-private.pdf', storagePath: 'tabsons/EMP-1/ATT-1/onboarding-private.pdf', createdAt: '2024-01-01T00:00:00.000Z', checksum: 'hash-1' },
    { attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', ownerEmpId: 'EMP-2', workflowId: 'WF-1', type: 'REIMBURSEMENT_RECEIPT', state: 'ARCHIVED', fileName: 'receipt-private.jpg', storagePath: 'tabsons/EMP-2/ATT-2/receipt-private.jpg', createdAt: '2024-02-01T00:00:00.000Z', checksum: 'hash-2' },
    { attachmentId: 'ATT-3', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-3', type: 'POLICY_ATTACHMENT', state: 'EXPIRING', fileName: 'policy-private.pdf', storagePath: 'tabsons/EMP-1/ATT-3/policy-private.pdf', createdAt: '2023-01-01T00:00:00.000Z', checksum: 'hash-3' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', ownerEmpId: 'EMP-X', workflowId: 'WF-X', type: 'RECRUITMENT_FILE', state: 'ARCHIVED', fileName: 'abc-secret-retained.pdf', storagePath: 'abc/EMP-X/ATT-X/abc-secret-retained.pdf', privateNote: 'ABC confidential retained file' }
  ];
  data.storageObjects = [
    { objectId: 'OBJ-1', attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', objectPath: 'tabsons/EMP-1/ATT-1/onboarding-private.pdf', state: 'ACTIVE', size: 2048, checksum: 'hash-1' },
    { objectId: 'OBJ-2', attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', objectPath: 'tabsons/EMP-2/ATT-2/receipt-private.jpg', state: 'ARCHIVED', size: 1024, checksum: 'hash-2', legalHold: true },
    { objectId: 'OBJ-ORPHAN', tenantSlug: 'tabsons', empId: 'EMP-1', objectPath: 'tabsons/orphan/old-private.pdf', state: 'ARCHIVED', size: 4096 },
    { objectId: 'OBJ-X', attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', objectPath: 'abc/EMP-X/ATT-X/abc-secret-retained.pdf', state: 'ARCHIVED', size: 512, publicUrl: 'https://public.example.com/abc-secret-retained.pdf' }
  ];
  data.fileRetentionPolicies = [
    { policyId: 'RET-POL-ONB', tenantSlug: 'tabsons', policyType: 'ONBOARDING_RETENTION', retentionDays: 365, archiveAfterDays: 180, deletionRequiresApproval: true },
    { policyId: 'RET-POL-REC', tenantSlug: 'tabsons', policyType: 'REIMBURSEMENT_RETENTION', retentionDays: 2555, archiveAfterDays: 365, deletionRequiresApproval: true },
    { policyId: 'RET-POL-AUD', tenantSlug: 'tabsons', policyType: 'FORENSIC_AUDIT_RETENTION', retentionDays: 3650, archiveAfterDays: 365, deletionRequiresApproval: true }
  ];
  data.fileRetentionRecords = [
    { retentionId: 'RET-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', policyType: 'ONBOARDING_RETENTION', lifecycleState: 'RETENTION_PENDING', expiresAt: '2026-06-15T00:00:00.000Z', archiveDueAt: '2026-05-30T00:00:00.000Z', deletionScheduledAt: '2026-07-01T00:00:00.000Z' },
    { retentionId: 'RET-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', policyType: 'REIMBURSEMENT_RETENTION', lifecycleState: 'ARCHIVED', archivedAt: '2026-05-01T00:00:00.000Z', archiveChecksum: 'archive-hash-2', immutableArchive: true, legalHold: true, restoreRequested: true },
    { retentionId: 'RET-3', tenantSlug: 'tabsons', attachmentId: 'ATT-3', empId: 'EMP-1', workflowId: 'WF-3', policyType: 'POLICY_DOCUMENT_RETENTION', lifecycleState: 'EXPIRING', expiresAt: '2026-05-29T00:00:00.000Z', deletionScheduledAt: '2026-06-05T00:00:00.000Z', retentionViolation: true },
    { retentionId: 'RET-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', policyType: 'RECRUITMENT_RETENTION', lifecycleState: 'ARCHIVED', archivedAt: '2026-04-01T00:00:00.000Z', fileName: 'abc-secret-retained.pdf', privateNote: 'ABC confidential retained file' }
  ];
  data.archiveRestoreRequests = [
    { requestId: 'REST-1', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', state: 'RESTORE_PENDING', approvalRequired: true, createdAt: '2026-05-25T00:00:00.000Z' },
    { requestId: 'REST-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', state: 'RESTORE_PENDING', privateNote: 'ABC confidential retained file' }
  ];
  data.retentionAuditEvents = [
    { eventId: 'RAE-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', eventType: 'ARCHIVAL_SCHEDULED', state: 'RETENTION_PENDING', actorRole: 'HR', createdAt: '2026-05-25T00:00:00.000Z' },
    { eventId: 'RAE-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', eventType: 'ARCHIVE_VERIFIED', state: 'ARCHIVED', actorRole: 'HR', createdAt: '2026-05-25T01:00:00.000Z' },
    { eventId: 'RAE-3', tenantSlug: 'tabsons', attachmentId: 'ATT-3', eventType: 'RETENTION_VIOLATION', state: 'EXPIRING', actorRole: 'HR', createdAt: '2026-05-25T02:00:00.000Z' },
    { eventId: 'RAE-X', tenantSlug: 'abc', attachmentId: 'ATT-X', eventType: 'ARCHIVE_VERIFIED', state: 'ARCHIVED', actorRole: 'HR', fileName: 'abc-secret-retained.pdf' }
  ];
  data.attachmentAuditEvents = [
    { eventId: 'AAE-RET-1', tenantSlug: 'tabsons', attachmentId: 'ATT-2', eventType: 'ARCHIVE_ACCESS', state: 'VERIFIED', actorRole: 'HR', createdAt: '2026-05-25T03:00:00.000Z' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-RET-1', tenantSlug: 'tabsons', jobType: 'RETENTION_ARCHIVAL', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3, correlationId: 'RET-1' },
    { jobId: 'JOB-RET-X', tenantSlug: 'abc', jobType: 'RETENTION_ARCHIVAL', state: 'FAILED', payload: { attachmentId: 'ATT-X', fileName: 'abc-secret-retained.pdf' } }
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
    'services/attachmentAuditTrailService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/fileRetentionService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedRetentionData();

  const svc = global.FileRetentionService;
  assert.ok(svc, 'FileRetentionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.LIFECYCLE_STATES), 'lifecycle states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_FILE_RETENTION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyRetentionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant retention risk is critical');
  assert.equal(svc.classifyRetentionRisk({ archivalMutation: true }), 'CRITICAL_BLOCKER', 'archive mutation is critical');
  assert.equal(svc.classifyRetentionRisk({ unsafeBulkDeletion: true }), 'CRITICAL_BLOCKER', 'unsafe bulk deletion is critical');
  assert.equal(svc.classifyRetentionRisk({ legalHoldConflict: true }), 'HIGH_RISK', 'legal hold conflict is high risk');
  assert.equal(svc.classifyRetentionRisk({ expiringObject: true }), 'WARNING', 'expiring file is warning risk');

  const employeeOwn = svc.validateRetentionScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own retained files');
  assert.equal(employeeOwn.visibility, 'OWN_RETAINED_FILES_ONLY');

  const managerWorkflow = svc.validateRetentionScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may access workflow-scoped retention records');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_RETENTION_VISIBILITY');

  const superAdminBypass = svc.validateRetentionScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', archiveManipulation: true, fileName: 'onboarding-private.pdf' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass retention governance');
  assert.ok(superAdminBypass.failures.some(item => item.failureCode === 'SUPER_ADMIN_RETENTION_BYPASS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminBypass), /ATT-1|EMP-1|onboarding-private|fileName/i, 'SUPER_ADMIN retention denial must redact file details');

  const platformScope = svc.validateRetentionScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in retention workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_RETENTION_WORKFLOW_BLOCKED'));

  const crossTenant = svc.validateRetentionScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'abc-secret-retained.pdf', privateNote: 'ABC confidential retained file' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant retention visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ATT-X|EMP-X|abc-secret|ABC confidential|fileName|privateNote/i, 'cross-tenant retention output must not leak file data');

  const archivedMutation = svc.validateRetentionScope({ tenantSlug: 'tabsons', empId: 'EMP-2', attachmentId: 'ATT-2', lifecycleState: 'ARCHIVED', mutateArchive: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'historical archive mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVE_MUTATION_BLOCKED'));

  const malformed = svc.normalizeRetentionPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed retention payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_FILE_RETENTION_PAYLOAD'));

  const normalized = svc.normalizeRetentionPayload({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    lifecycleState: 'archiving',
    policyType: 'forensic audit retention',
    fileName: 'onboarding-private.pdf',
    storagePath: 'tabsons/EMP-1/ATT-1/onboarding-private.pdf'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid retention payload should normalize');
  assert.equal(normalized.payload.lifecycleState, 'ARCHIVING');
  assert.equal(normalized.payload.policyType, 'FORENSIC_AUDIT_RETENTION');
  assert.ok(Object.isFrozen(normalized), 'normalized retention output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /ATT-1|EMP-1|onboarding-private|storagePath|fileName/i, 'normalized retention output must redact file details');

  const archive = svc.evaluateArchiveGovernance({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    workflowId: 'WF-1',
    policyType: 'onboarding_retention',
    archiveChecksum: 'archive-hash-1'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(archive.success, true, 'archive governance should succeed for scoped records');
  assert.equal(archive.state, 'ARCHIVING');
  assert.ok(archive.archiveGovernance.coldStorageReady, 'cold storage readiness should be present');
  assert.ok(archive.archiveGovernance.archiveIntegrityValidation, 'archive integrity validation should be present');
  assert.ok(Object.isFrozen(archive), 'archive governance output must be immutable');
  assert.doesNotMatch(JSON.stringify(archive), /ATT-1|EMP-1|onboarding-private|archive-hash/i, 'archive output must redact file details');

  const restore = svc.requestArchiveRestore({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-2',
    empId: 'EMP-2',
    workflowId: 'WF-1'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(restore.success, true, 'restore workflow should be governed');
  assert.equal(restore.state, 'RESTORE_PENDING');
  assert.ok(restore.restoreWorkflow.stagedRestoreApprovalRequired, 'restore should require staged approval');

  const unsafeDelete = svc.scheduleRetentionDeletion({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    bulkDelete: true,
    deleteImmediately: true,
    count: 100
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(unsafeDelete.success, false, 'unsafe bulk deletion must be blocked');
  assert.equal(unsafeDelete.classification, 'CRITICAL_BLOCKER');
  assert.ok(unsafeDelete.failures.some(item => item.failureCode === 'UNSAFE_RETENTION_BULK_DELETION_BLOCKED'));

  const anomalies = svc.detectRetentionAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:00:00.000Z' });
  assert.equal(anomalies.success, true, 'retention anomaly detection should work');
  assert.ok(anomalies.summary.expiringDocuments >= 1, 'expiring documents should be counted');
  assert.ok(anomalies.summary.pendingArchivalQueues >= 1, 'pending archival queues should be counted');
  assert.ok(anomalies.summary.scheduledDeletions >= 1, 'scheduled deletions should be counted');
  assert.ok(anomalies.summary.restoreRequests >= 1, 'restore requests should be counted');
  assert.ok(anomalies.summary.legalHoldConflicts >= 1, 'legal hold conflicts should be counted');
  assert.ok(anomalies.summary.orphanArchivalReferences >= 1, 'orphan archive references should be counted');
  assert.ok(anomalies.summary.retentionPolicyViolations >= 1, 'retention policy violations should be counted');
  assert.ok(Object.isFrozen(anomalies.signals), 'retention anomaly signals must be immutable');
  assert.doesNotMatch(JSON.stringify(anomalies), /ATT-X|EMP-X|abc-secret|ABC confidential|onboarding-private|storagePath|fileName/i, 'anomaly output must redact raw and cross-tenant details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    fileRetentionRecords: before.fileRetentionRecords,
    archiveRestoreRequests: before.archiveRestoreRequests,
    retentionAuditEvents: before.retentionAuditEvents,
    fileAttachments: before.fileAttachments,
    storageObjects: before.storageObjects
  });
  const report = svc.generateFileRetentionReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'file retention report should generate');
  assert.equal(report.readOnly, true, 'file retention report must be read-only');
  assert.ok(report.retentionHealth.totalFiles >= 3, 'retention health should aggregate retained files');
  assert.ok(report.lifecycleCompliance.expiringDocuments >= 1, 'lifecycle compliance should show expiring files');
  assert.ok(report.archiveGovernance.archivedFiles >= 1, 'archive governance should aggregate archived files');
  assert.ok(report.restoreWorkflows.restoreRequests >= 1, 'restore workflows should aggregate requests');
  assert.ok(report.retentionAnalytics.retentionBacklogCongestion >= 1, 'retention congestion should aggregate');
  assert.equal(report.accessGovernance.superAdminRetentionBypass, false, 'SUPER_ADMIN retention bypass remains blocked');
  assert.equal(report.accessGovernance.platformOwnerRetentionWorkflow, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.storageHardeningIntegrated, 'StorageHardeningService integration should be detected');
  assert.ok(report.integrationHealth.attachmentAuditTrailIntegrated, 'AttachmentAuditTrailService integration should be detected');
  assert.ok(report.integrationHealth.documentVisibilityIntegrated, 'DocumentVisibilityService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ATT-X|EMP-X|abc-secret|ABC confidential|onboarding-private|receipt-private|policy-private|storagePath|fileName/i, 'report must not expose cross-tenant or raw file data');
  assert.equal(JSON.stringify({
    fileRetentionRecords: global.DB.get().fileRetentionRecords,
    archiveRestoreRequests: global.DB.get().archiveRestoreRequests,
    retentionAuditEvents: global.DB.get().retentionAuditEvents,
    fileAttachments: global.DB.get().fileAttachments,
    storageObjects: global.DB.get().storageObjects
  }), historicalBefore, 'retention report must not mutate historical lifecycle records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /FILE_RETENTION|LIFECYCLE_COMPLIANCE/.test(row.eventType || row.category || '')), 'file retention telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.FILE_RETENTION_REPORTED, 'file retention metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /FILE_RETENTION|LIFECYCLE_COMPLIANCE/.test(row.actionType || row.action || '')), 'file retention actions should be audited safely');

  const originalStorage = global.StorageHardeningService;
  const originalAuditTrail = global.AttachmentAuditTrailService;
  const originalVisibility = global.DocumentVisibilityService;
  const originalAttachment = global.FileAttachmentGovernanceService;
  const originalUpload = global.UploadValidationService;
  try {
    delete global.StorageHardeningService;
    delete global.AttachmentAuditTrailService;
    delete global.DocumentVisibilityService;
    delete global.FileAttachmentGovernanceService;
    delete global.UploadValidationService;
    const degraded = svc.generateFileRetentionReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing lifecycle dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.storageHardeningIntegrated, false, 'missing storage dependency should be visible');
    assert.equal(degraded.integrationHealth.attachmentAuditTrailIntegrated, false, 'missing forensic dependency should be visible');
    assert.equal(degraded.integrationHealth.documentVisibilityIntegrated, false, 'missing visibility dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalStorage) global.StorageHardeningService = originalStorage;
    if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
    if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
    if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
    if (originalUpload) global.UploadValidationService = originalUpload;
  }

  console.log('fileRetentionService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
