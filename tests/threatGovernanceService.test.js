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

function seedThreatGovernanceData() {
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
  data.threatValidationRecords = [
    { threatId: 'TH-1', tenantSlug: 'tabsons', uploadId: 'UP-1', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', state: 'VERIFIED_SAFE', fileName: 'policy-private.pdf', mimeType: 'application/pdf', declaredMimeType: 'application/pdf', extension: 'pdf', checksum: 'safe-hash-1', signature: '%PDF', size: 245000, createdAt: '2026-05-28T00:00:00.000Z' },
    { threatId: 'TH-2', tenantSlug: 'tabsons', uploadId: 'UP-2', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', state: 'QUARANTINED', fileName: 'macro-private.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsm', checksum: 'dup-threat-hash', signature: 'PK', hasMacros: true, embeddedScript: true, quarantineReason: 'macro enabled attack', createdAt: '2026-05-28T00:01:00.000Z' },
    { threatId: 'TH-3', tenantSlug: 'tabsons', uploadId: 'UP-3', attachmentId: 'ATT-3', empId: 'EMP-1', workflowId: 'WF-1', state: 'REJECTED', fileName: 'salary-private.pdf.exe', mimeType: 'application/x-msdownload', declaredMimeType: 'application/pdf', extension: 'exe', checksum: '', signature: 'MZ', size: 30 * 1024 * 1024, publicUrl: 'https://public.example.com/salary-private.pdf.exe', malwareIndicators: ['executable_payload', 'disguised_extension'], createdAt: '2026-05-28T00:02:00.000Z' },
    { threatId: 'TH-4', tenantSlug: 'tabsons', uploadId: 'UP-4', attachmentId: 'ATT-4', empId: 'EMP-2', workflowId: 'WF-2', state: 'FLAGGED', fileName: 'receipt-private.pdf', mimeType: 'application/pdf', declaredMimeType: 'application/pdf', extension: 'pdf', checksum: 'dup-threat-hash', signature: 'corrupt-pdf', corrupted: true, malformedPdf: true, archiveCompressionRatio: 250, obfuscatedPayload: true, createdAt: '2026-05-28T00:03:00.000Z' },
    { threatId: 'TH-X', tenantSlug: 'abc', uploadId: 'UP-X', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', state: 'QUARANTINED', fileName: 'abc-secret-malware.exe', mimeType: 'application/x-msdownload', declaredMimeType: 'application/pdf', extension: 'exe', checksum: 'abc-threat', signature: 'MZ', publicUrl: 'https://public.example.com/abc-secret-malware.exe', privateNote: 'ABC confidential threat' }
  ];
  data.uploadValidationRecords = [
    { validationId: 'UV-1', tenantSlug: 'tabsons', uploadId: 'UP-1', empId: 'EMP-1', state: 'APPROVED', checksum: 'safe-hash-1', mimeType: 'application/pdf', declaredMimeType: 'application/pdf', extension: 'pdf' },
    { validationId: 'UV-2', tenantSlug: 'tabsons', uploadId: 'UP-2', empId: 'EMP-2', state: 'QUARANTINED', checksum: 'dup-threat-hash', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsm', hasMacros: true },
    { validationId: 'UV-3', tenantSlug: 'tabsons', uploadId: 'UP-3', empId: 'EMP-1', state: 'REJECTED', checksum: '', mimeType: 'application/x-msdownload', declaredMimeType: 'application/pdf', extension: 'exe', signature: 'MZ' },
    { validationId: 'UV-X', tenantSlug: 'abc', uploadId: 'UP-X', empId: 'EMP-X', state: 'QUARANTINED', fileName: 'abc-secret-malware.exe', privateNote: 'ABC confidential upload threat' }
  ];
  data.fileAttachments = [
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', workflowId: 'WF-1', fileName: 'policy-private.pdf', mimeType: 'application/pdf', extension: 'pdf', checksum: 'safe-hash-1', storagePath: 'tabsons/attachments/ATT-1/policy-private.pdf' },
    { attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', workflowId: 'WF-1', fileName: 'macro-private.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', extension: 'xlsm', checksum: 'dup-threat-hash', storagePath: 'tabsons/quarantine/ATT-2/macro-private.xlsm' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', workflowId: 'WF-X', fileName: 'abc-secret-malware.exe', mimeType: 'application/x-msdownload', extension: 'exe', checksum: 'abc-threat', publicUrl: 'https://public.example.com/abc-secret-malware.exe' }
  ];
  data.signedAccessRecords = [
    { accessId: 'SA-1', tokenId: 'TOK-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', state: 'ACTIVE', accessType: 'DOWNLOAD', expiresAt: '2026-05-28T00:30:00.000Z', signedUrl: 'https://signed.example.com/tok-1?signature=secret' },
    { accessId: 'SA-2', tokenId: 'TOK-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', state: 'ACTIVE', accessType: 'PREVIEW', expiresAt: '2026-05-28T00:30:00.000Z', signedUrl: 'https://signed.example.com/tok-2?signature=secret' }
  ];
  data.quarantineRecords = [
    { quarantineId: 'Q-1', tenantSlug: 'tabsons', uploadId: 'UP-2', attachmentId: 'ATT-2', state: 'QUARANTINED', reason: 'macro enabled attack', createdAt: '2026-05-28T00:02:00.000Z' },
    { quarantineId: 'Q-2', tenantSlug: 'tabsons', uploadId: 'UP-3', attachmentId: 'ATT-3', state: 'QUARANTINED', reason: 'executable payload', createdAt: '2026-05-28T00:03:00.000Z' },
    { quarantineId: 'Q-X', tenantSlug: 'abc', uploadId: 'UP-X', attachmentId: 'ATT-X', state: 'QUARANTINED', reason: 'ABC confidential malware' }
  ];
  data.documentAccessLogs = [
    { logId: 'DAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-2', uploadId: 'UP-2', action: 'PREVIEW', status: 'BLOCKED', reason: 'quarantined malware blocked', actorRole: 'HR' },
    { logId: 'DAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-3', uploadId: 'UP-3', action: 'DOWNLOAD', status: 'BLOCKED', reason: 'malicious file download blocked', actorRole: 'SUPER_ADMIN' },
    { logId: 'DAL-X', tenantSlug: 'abc', attachmentId: 'ATT-X', uploadId: 'UP-X', action: 'DOWNLOAD', status: 'BLOCKED', reason: 'ABC confidential blocked' }
  ];
  data.storageAccessLogs = [
    { logId: 'SAL-1', tenantSlug: 'tabsons', uploadId: 'UP-2', action: 'QUARANTINE_WRITE', status: 'ALLOWED' },
    { logId: 'SAL-2', tenantSlug: 'tabsons', uploadId: 'UP-3', action: 'SIGNED_URL_INVALIDATED', status: 'ALLOWED' }
  ];
  data.attachmentAuditEvents = [
    { eventId: 'AAE-1', tenantSlug: 'tabsons', uploadId: 'UP-2', attachmentId: 'ATT-2', eventType: 'THREAT_QUARANTINED', state: 'FLAGGED' },
    { eventId: 'AAE-2', tenantSlug: 'tabsons', uploadId: 'UP-3', attachmentId: 'ATT-3', eventType: 'MALWARE_DETECTED', state: 'ESCALATED' }
  ];
  data.threatAuditEvents = [
    { eventId: 'TAE-1', tenantSlug: 'tabsons', uploadId: 'UP-2', eventType: 'THREAT_QUARANTINED', state: 'QUARANTINED' },
    { eventId: 'TAE-2', tenantSlug: 'tabsons', uploadId: 'UP-3', eventType: 'SIGNED_URL_INVALIDATED', state: 'RESTRICTED' },
    { eventId: 'TAE-X', tenantSlug: 'abc', uploadId: 'UP-X', eventType: 'MALWARE_DETECTED', fileName: 'abc-secret-malware.exe' }
  ];
  data.fileRetentionRecords = [
    { retentionId: 'RET-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', uploadId: 'UP-1', lifecycleState: 'ACTIVE' },
    { retentionId: 'RET-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', uploadId: 'UP-2', lifecycleState: 'ARCHIVED', archiveChecksum: 'dup-threat-hash' }
  ];
  data.documentClassifications = [
    { classificationId: 'CLS-1', tenantSlug: 'tabsons', attachmentId: 'ATT-3', uploadId: 'UP-3', classificationState: 'HIGHLY_SENSITIVE', sensitivityType: 'PAYROLL_DOCUMENT' }
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
    'services/fileRetentionService.js',
    'services/documentClassificationService.js',
    'services/signedUrlGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/threatGovernanceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedThreatGovernanceData();

  const svc = global.ThreatGovernanceService;
  assert.ok(svc, 'ThreatGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.THREAT_STATES), 'threat states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_THREAT_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover threat failure cases');

  assert.equal(svc.classifyThreatRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant threat visibility is critical');
  assert.equal(svc.classifyThreatRisk({ malwareExposure: true }), 'CRITICAL_BLOCKER', 'malware exposure is critical');
  assert.equal(svc.classifyThreatRisk({ executablePayload: true }), 'CRITICAL_BLOCKER', 'executable payload is critical');
  assert.equal(svc.classifyThreatRisk({ quarantineBypass: true }), 'HIGH_RISK', 'quarantine bypass is high risk');
  assert.equal(svc.classifyThreatRisk({ integrityMismatch: true }), 'WARNING', 'integrity mismatch is warning risk');

  const employeeOwn = svc.validateThreatScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-3', state: 'REJECTED' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may view own rejected upload threat metadata');
  assert.equal(employeeOwn.visibility, 'OWN_REJECTED_UPLOAD_VISIBILITY');

  const managerWorkflow = svc.validateThreatScope({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may view workflow-scoped threat metadata');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_THREAT_VISIBILITY');

  const superAdminOverride = svc.validateThreatScope({ tenantSlug: 'tabsons', uploadId: 'UP-2', empId: 'EMP-2', state: 'QUARANTINED', quarantineOverride: true, fileName: 'macro-private.xlsm' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not bypass quarantine restrictions');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_QUARANTINE_OVERRIDE_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /UP-2|EMP-2|macro-private|"fileName"\s*:/i, 'quarantine override output must redact file details');

  const platformScope = svc.validateThreatScope({ tenantSlug: 'tabsons', uploadId: 'UP-1', empId: 'EMP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in threat workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_THREAT_WORKFLOW_BLOCKED'));

  const crossTenant = svc.validateThreatScope({ tenantSlug: 'abc', uploadId: 'UP-X', empId: 'EMP-X', fileName: 'abc-secret-malware.exe', privateNote: 'ABC confidential threat' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant threat visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /UP-X|EMP-X|abc-secret|ABC confidential|"fileName"\s*:|privateNote/i, 'cross-tenant threat output must not leak raw data');

  const downloadBlocked = svc.validateThreatScope({ tenantSlug: 'tabsons', uploadId: 'UP-2', empId: 'EMP-2', state: 'QUARANTINED', action: 'DOWNLOAD' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(downloadBlocked.allowed, false, 'malicious files must never become downloadable');
  assert.ok(downloadBlocked.failures.some(item => item.failureCode === 'MALICIOUS_FILE_DOWNLOAD_BLOCKED'));

  const malformed = svc.normalizeThreatPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed threat payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_THREAT_PAYLOAD'));

  const normalized = svc.normalizeThreatPayload({
    tenantSlug: 'tabsons',
    uploadId: 'UP-1',
    empId: 'EMP-1',
    state: 'scanning',
    fileName: 'policy-private.pdf',
    storagePath: 'tabsons/uploads/UP-1/policy-private.pdf',
    publicUrl: 'https://public.example.com/policy-private.pdf',
    mimeType: 'application/pdf',
    checksum: 'safe-hash-1'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid threat payload should normalize');
  assert.equal(normalized.payload.state, 'SCANNING');
  assert.ok(Object.isFrozen(normalized), 'normalized threat output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /policy-private|storagePath|publicUrl|public\.example|EMP-1|UP-1|"fileName"\s*:/i, 'normalized threat output must redact raw file details');

  const integrity = svc.validateFileIntegrity({
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
    malformedPdf: true,
    obfuscatedPayload: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(integrity.success, false, 'malicious integrity validation should fail safely');
  assert.equal(integrity.state, 'QUARANTINED');
  assert.ok(integrity.failures.some(item => item.failureCode === 'CHECKSUM_VALIDATION_REQUIRED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'MIME_CONSISTENCY_FAILED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'FILE_SIGNATURE_VERIFICATION_FAILED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'EXECUTABLE_PAYLOAD_BLOCKED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'MALWARE_PATTERN_DETECTED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'ARCHIVE_INTEGRITY_FAILED'));
  assert.ok(integrity.failures.some(item => item.failureCode === 'PUBLIC_MALWARE_EXPOSURE_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(integrity), /salary-private|public\.example|"fileName"\s*:|"publicUrl"\s*:|storagePath/i, 'integrity output must redact malicious file details');

  const quarantine = svc.quarantineThreat({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    uploadId: 'UP-3',
    attachmentId: 'ATT-3',
    reason: 'executable payload',
    fileName: 'salary-private.pdf.exe',
    publicUrl: 'https://public.example.com/salary-private.pdf.exe'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:10:00.000Z'
  });
  assert.equal(quarantine.success, true, 'quarantine should be governed');
  assert.equal(quarantine.state, 'QUARANTINED');
  assert.equal(quarantine.quarantineGovernance.isolatedQuarantineStorage, true);
  assert.equal(quarantine.quarantineGovernance.blockedPreviewDownloadAccess, true);
  assert.equal(quarantine.quarantineGovernance.maliciousFileDownloadable, false);
  assert.doesNotMatch(JSON.stringify(quarantine), /salary-private|public\.example|"fileName"\s*:|"publicUrl"\s*:/i, 'quarantine output must not expose malicious content');

  const response = svc.executeAutomatedThreatResponse({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    uploadId: 'UP-3',
    attachmentId: 'ATT-3',
    state: 'QUARANTINED',
    malwareIndicators: ['executable_payload']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:12:00.000Z'
  });
  assert.equal(response.success, true, 'automated threat response should run safely');
  assert.equal(response.automatedThreatResponse.automaticQuarantine, true);
  assert.equal(response.automatedThreatResponse.signedUrlInvalidation, true);
  assert.equal(response.automatedThreatResponse.temporaryAccessRevocation, true);
  assert.equal(response.automatedThreatResponse.unsafeAutomaticDeletion, false);

  const malicious = svc.detectMaliciousPatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:20:00.000Z' });
  assert.equal(malicious.success, true, 'malicious pattern detection should work');
  assert.ok(malicious.summary.executablePayloads >= 1, 'executable payloads should be counted');
  assert.ok(malicious.summary.embeddedScripts >= 1, 'embedded scripts should be counted');
  assert.ok(malicious.summary.macroEnabledAttacks >= 1, 'macro attacks should be counted');
  assert.ok(malicious.summary.archiveBombs >= 1, 'archive bombs should be counted');
  assert.ok(malicious.summary.suspiciousPdfs >= 1, 'suspicious PDFs should be counted');
  assert.ok(malicious.summary.obfuscatedPayloads >= 1, 'obfuscated payloads should be counted');
  assert.ok(malicious.summary.disguisedExtensions >= 1, 'disguised extensions should be counted');
  assert.ok(malicious.summary.maliciousBinarySignatures >= 1, 'malicious binary signatures should be counted');
  assert.ok(malicious.summary.integrityMismatchFrequency >= 1, 'integrity mismatches should be counted');
  assert.ok(malicious.summary.quarantineBuildup >= 1, 'quarantine buildup should be counted');
  assert.ok(Object.isFrozen(malicious.threatSignals), 'malicious pattern signals must be immutable');
  assert.doesNotMatch(JSON.stringify(malicious), /UP-X|EMP-X|abc-secret|ABC confidential|salary-private|macro-private|receipt-private|"fileName"\s*:|"publicUrl"\s*:/i, 'malicious pattern output must redact raw and cross-tenant data');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    threatValidationRecords: before.threatValidationRecords,
    threatAuditEvents: before.threatAuditEvents,
    quarantineRecords: before.quarantineRecords,
    signedAccessRecords: before.signedAccessRecords,
    fileAttachments: before.fileAttachments
  });
  const report = svc.generateThreatGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:20:00.000Z'
  });
  assert.equal(report.success, true, 'threat governance report should generate');
  assert.equal(report.readOnly, true, 'threat governance report must be read-only');
  assert.ok(report.threatValidationHealth.totalThreatValidations >= 4, 'threat health should aggregate validations');
  assert.ok(report.threatValidationHealth.quarantinedThreats >= 1, 'quarantined threats should aggregate');
  assert.ok(report.threatValidationHealth.rejectedThreats >= 1, 'rejected threats should aggregate');
  assert.ok(report.fileIntegrityValidation.mimeConsistencyFailures >= 1, 'integrity report should include MIME mismatches');
  assert.ok(report.fileIntegrityValidation.duplicateHashCollisions >= 1, 'integrity report should include duplicate hashes');
  assert.ok(report.malwareDetection.executablePayloads >= 1, 'malware detection should aggregate executable payloads');
  assert.equal(report.quarantineGovernance.blockedPreviewDownloadAccess, true, 'quarantine blocks preview/download access');
  assert.equal(report.quarantineGovernance.maliciousFileDownloadable, false, 'malicious files are not downloadable');
  assert.equal(report.automatedThreatResponse.signedUrlInvalidation, true, 'signed URLs are invalidated during threat response');
  assert.equal(report.automatedThreatResponse.temporaryAccessRevocation, true, 'temporary access is revoked during threat response');
  assert.ok(report.threatAnalytics.malwareDetectionSpikes >= 1, 'threat analytics should include malware spikes');
  assert.equal(report.accessGovernance.superAdminQuarantineOverride, false, 'SUPER_ADMIN quarantine override remains blocked');
  assert.equal(report.accessGovernance.platformOwnerThreatWorkflow, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.uploadValidationIntegrated, 'UploadValidationService integration should be detected');
  assert.ok(report.integrationHealth.signedUrlGovernanceIntegrated, 'SignedUrlGovernanceService integration should be detected');
  assert.ok(report.integrationHealth.storageHardeningIntegrated, 'StorageHardeningService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /UP-X|EMP-X|abc-secret|ABC confidential|salary-private|macro-private|receipt-private|public\.example|"fileName"\s*:|"publicUrl"\s*:/i, 'report must not expose cross-tenant or raw threat data');
  assert.equal(JSON.stringify({
    threatValidationRecords: global.DB.get().threatValidationRecords,
    threatAuditEvents: global.DB.get().threatAuditEvents,
    quarantineRecords: global.DB.get().quarantineRecords,
    signedAccessRecords: global.DB.get().signedAccessRecords,
    fileAttachments: global.DB.get().fileAttachments
  }), historicalBefore, 'threat report must not mutate historical threat records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /THREAT|MALWARE|QUARANTINE|INTEGRITY/.test(row.eventType || row.category || '')), 'threat telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.THREAT_GOVERNANCE_REPORTED, 'threat metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /THREAT|MALWARE|QUARANTINE|INTEGRITY/.test(row.actionType || row.action || '')), 'threat actions should be audited safely');

  const originalUpload = global.UploadValidationService;
  const originalSigned = global.SignedUrlGovernanceService;
  const originalStorage = global.StorageHardeningService;
  const originalClassification = global.DocumentClassificationService;
  const originalAuditTrail = global.AttachmentAuditTrailService;
  const originalRetention = global.FileRetentionService;
  try {
    delete global.UploadValidationService;
    delete global.SignedUrlGovernanceService;
    delete global.StorageHardeningService;
    delete global.DocumentClassificationService;
    delete global.AttachmentAuditTrailService;
    delete global.FileRetentionService;
    const degraded = svc.generateThreatGovernanceReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing threat dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
    assert.equal(degraded.integrationHealth.signedUrlGovernanceIntegrated, false, 'missing signed URL dependency should be visible');
    assert.equal(degraded.integrationHealth.storageHardeningIntegrated, false, 'missing storage dependency should be visible');
    assert.equal(degraded.integrationHealth.fileRetentionIntegrated, false, 'missing retention dependency should be visible');
  } finally {
    if (originalUpload) global.UploadValidationService = originalUpload;
    if (originalSigned) global.SignedUrlGovernanceService = originalSigned;
    if (originalStorage) global.StorageHardeningService = originalStorage;
    if (originalClassification) global.DocumentClassificationService = originalClassification;
    if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
    if (originalRetention) global.FileRetentionService = originalRetention;
  }

  console.log('threatGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
