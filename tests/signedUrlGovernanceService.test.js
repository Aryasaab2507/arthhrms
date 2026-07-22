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

function seedSignedAccessData() {
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
    { attachmentId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', ownerEmpId: 'EMP-1', workflowId: 'WF-1', type: 'PAYROLL_DOCUMENT', state: 'ACTIVE', fileName: 'salary-private.pdf', storagePath: 'tabsons/EMP-1/ATT-1/salary-private.pdf', checksum: 'hash-1' },
    { attachmentId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-2', ownerEmpId: 'EMP-2', workflowId: 'WF-1', type: 'IDENTITY_DOCUMENT', state: 'ACTIVE', fileName: 'identity-private.pdf', storagePath: 'tabsons/EMP-2/ATT-2/identity-private.pdf', checksum: 'hash-2' },
    { attachmentId: 'ATT-X', tenantSlug: 'abc', empId: 'EMP-X', ownerEmpId: 'EMP-X', workflowId: 'WF-X', type: 'RECRUITMENT_FILE', state: 'ACTIVE', fileName: 'abc-secret-file.pdf', storagePath: 'abc/EMP-X/ATT-X/abc-secret-file.pdf', publicUrl: 'https://public.example.com/abc-secret-file.pdf', privateNote: 'ABC confidential signed file' }
  ];
  data.documentClassifications = [
    { classificationId: 'CLS-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', classificationState: 'HIGHLY_SENSITIVE', sensitivityType: 'SALARY_RECORD' },
    { classificationId: 'CLS-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', classificationState: 'RESTRICTED', sensitivityType: 'EMPLOYEE_IDENTITY_DOCUMENT' }
  ];
  data.fileRetentionRecords = [
    { retentionId: 'RET-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', lifecycleState: 'ACTIVE' },
    { retentionId: 'RET-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', lifecycleState: 'ARCHIVED', legalHold: true }
  ];
  data.signedAccessRecords = [
    { accessId: 'SA-1', tokenId: 'TOK-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', state: 'ACTIVE', accessType: 'DOWNLOAD', expiresAt: '2026-05-28T00:15:00.000Z', expiresInSeconds: 900, tokenHash: 'token-hash-1', signedUrl: 'https://signed.example.com/tok-1?signature=secret', createdAt: '2026-05-28T00:00:00.000Z' },
    { accessId: 'SA-2', tokenId: 'TOK-2', tenantSlug: 'tabsons', attachmentId: 'ATT-1', empId: 'EMP-1', workflowId: 'WF-1', state: 'EXPIRED', accessType: 'DOWNLOAD', expiresAt: '2026-05-27T23:00:00.000Z', expiresInSeconds: 900, tokenReuseAttempts: 3, createdAt: '2026-05-27T22:00:00.000Z' },
    { accessId: 'SA-3', tokenId: 'TOK-3', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-1', state: 'REVOKED', accessType: 'PREVIEW', expiresAt: '2026-05-28T00:30:00.000Z', revokedAt: '2026-05-28T00:05:00.000Z', createdAt: '2026-05-28T00:01:00.000Z' },
    { accessId: 'SA-4', tokenId: 'TOK-4', tenantSlug: 'tabsons', attachmentId: 'ATT-2', empId: 'EMP-2', workflowId: 'WF-2', state: 'BLOCKED', accessType: 'PREVIEW', expiresAt: '2026-05-28T12:00:00.000Z', malformedSignature: true, createdAt: '2026-05-28T00:02:00.000Z' },
    { accessId: 'SA-X', tokenId: 'TOK-X', tenantSlug: 'abc', attachmentId: 'ATT-X', empId: 'EMP-X', workflowId: 'WF-X', state: 'ACTIVE', accessType: 'DOWNLOAD', expiresAt: '2026-05-28T00:10:00.000Z', signedUrl: 'https://signed.example.com/abc-secret-file?signature=secret', privateNote: 'ABC confidential signed file' }
  ];
  data.documentAccessLogs = [
    { logId: 'DAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-28T00:03:00.000Z' },
    { logId: 'DAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-2', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'DENIED', reason: 'expired token reuse', createdAt: '2026-05-28T00:04:00.000Z' },
    { logId: 'DAL-3', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-2', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'DENIED', reason: 'expired token reuse', createdAt: '2026-05-28T00:05:00.000Z' },
    { logId: 'DAL-4', tenantSlug: 'tabsons', attachmentId: 'ATT-2', tokenId: 'TOK-3', empId: 'EMP-2', workflowId: 'WF-1', action: 'PREVIEW', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'revoked token', createdAt: '2026-05-28T00:06:00.000Z' },
    { logId: 'DAL-5', tenantSlug: 'tabsons', attachmentId: 'ATT-2', tokenId: 'TOK-4', empId: 'EMP-2', workflowId: 'WF-2', action: 'PREVIEW', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'cross workflow access', createdAt: '2026-05-28T00:07:00.000Z' },
    { logId: 'DAL-6', tenantSlug: 'tabsons', attachmentId: 'ATT-2', tokenId: 'TOK-4', empId: 'EMP-2', workflowId: 'WF-2', action: 'PREVIEW', actorRole: 'MANAGER', actorId: 'MGR-1', status: 'DENIED', reason: 'malformed signature', createdAt: '2026-05-28T00:08:00.000Z' },
    { logId: 'DAL-7', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-28T00:09:00.000Z' },
    { logId: 'DAL-8', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'DOWNLOAD', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'ALLOWED', createdAt: '2026-05-28T00:10:00.000Z' },
    { logId: 'DAL-9', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', empId: 'EMP-1', workflowId: 'WF-1', action: 'SHARE', actorRole: 'EMPLOYEE', actorId: 'EMP-1', status: 'DENIED', reason: 'unauthorized sharing attempt', createdAt: '2026-05-28T00:11:00.000Z' },
    { logId: 'DAL-X', tenantSlug: 'abc', attachmentId: 'ATT-X', tokenId: 'TOK-X', empId: 'EMP-X', workflowId: 'WF-X', action: 'DOWNLOAD', actorRole: 'HR', actorId: 'HR-X', status: 'DENIED', reason: 'ABC confidential denied', createdAt: '2026-05-28T00:12:00.000Z' }
  ];
  data.storageAccessLogs = [
    { logId: 'SAL-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', action: 'SIGNED_URL_GENERATED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-28T00:00:00.000Z' },
    { logId: 'SAL-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', tokenId: 'TOK-3', action: 'SIGNED_URL_REVOKED', actorRole: 'HR', actorId: 'HR-1', status: 'ALLOWED', createdAt: '2026-05-28T00:05:00.000Z' }
  ];
  data.signedAccessAuditEvents = [
    { eventId: 'SAA-1', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-1', eventType: 'SIGNED_URL_GENERATED', state: 'GENERATED', actorRole: 'HR', createdAt: '2026-05-28T00:00:00.000Z' },
    { eventId: 'SAA-2', tenantSlug: 'tabsons', attachmentId: 'ATT-2', tokenId: 'TOK-3', eventType: 'SIGNED_URL_REVOKED', state: 'REVOKED', actorRole: 'HR', createdAt: '2026-05-28T00:05:00.000Z' },
    { eventId: 'SAA-3', tenantSlug: 'tabsons', attachmentId: 'ATT-1', tokenId: 'TOK-2', eventType: 'EXPIRED_TOKEN_REUSE', state: 'BLOCKED', actorRole: 'EMPLOYEE', createdAt: '2026-05-28T00:06:00.000Z' },
    { eventId: 'SAA-X', tenantSlug: 'abc', attachmentId: 'ATT-X', tokenId: 'TOK-X', eventType: 'SIGNED_URL_GENERATED', state: 'GENERATED', fileName: 'abc-secret-file.pdf' }
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
    'services/documentClassificationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/signedUrlGovernanceService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedSignedAccessData();

  const svc = global.SignedUrlGovernanceService;
  assert.ok(svc, 'SignedUrlGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.SIGNED_ACCESS_STATES), 'signed access states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_SIGNED_URL_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifySignedAccessRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant signed URL risk is critical');
  assert.equal(svc.classifySignedAccessRisk({ permanentToken: true }), 'CRITICAL_BLOCKER', 'permanent signed access is critical');
  assert.equal(svc.classifySignedAccessRisk({ tokenTampering: true }), 'CRITICAL_BLOCKER', 'token tampering is critical');
  assert.equal(svc.classifySignedAccessRisk({ suspiciousReuse: true }), 'HIGH_RISK', 'suspicious token reuse is high risk');
  assert.equal(svc.classifySignedAccessRisk({ expiredToken: true }), 'WARNING', 'expired token access is warning risk');

  const employeeOwn = svc.validateSignedAccessScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may view own temporary access');
  assert.equal(employeeOwn.visibility, 'OWN_TEMPORARY_ACCESS_ONLY');

  const managerWorkflow = svc.validateSignedAccessScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerWorkflow.allowed, true, 'manager may view workflow-scoped temporary access');
  assert.equal(managerWorkflow.visibility, 'WORKFLOW_SCOPED_ACCESS_VISIBILITY');

  const superAdminBypass = svc.validateSignedAccessScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', tokenId: 'TOK-1', bypassExpiry: true, signedUrl: 'https://signed.example.com/tok-1?signature=secret' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminBypass.allowed, false, 'SUPER_ADMIN must not bypass expiry rules');
  assert.ok(superAdminBypass.failures.some(item => item.failureCode === 'SUPER_ADMIN_SIGNED_ACCESS_BYPASS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminBypass), /ATT-1|EMP-1|TOK-1|signed\.example|signature|"signedUrl"\s*:/i, 'SUPER_ADMIN signed access denial must redact token details');

  const platformScope = svc.validateSignedAccessScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', tokenId: 'TOK-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in access chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ACCESS_CHAIN_BLOCKED'));

  const crossTenant = svc.validateSignedAccessScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', tokenId: 'TOK-X', signedUrl: 'https://signed.example.com/abc-secret-file?signature=secret', privateNote: 'ABC confidential signed file' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant signed URL visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ATT-X|EMP-X|TOK-X|abc-secret|ABC confidential|signed\.example|signature|"signedUrl"\s*:|privateNote/i, 'cross-tenant signed access output must not leak token data');

  const permanent = svc.validateSignedAccessScope({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', tokenId: 'TOK-PERM', expiresInSeconds: 86400, neverExpires: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(permanent.allowed, false, 'unsafe permanent access must be blocked');
  assert.ok(permanent.failures.some(item => item.failureCode === 'PERMANENT_SIGNED_ACCESS_BLOCKED'));

  const malformed = svc.normalizeSignedAccessPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed signed access payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_SIGNED_ACCESS_PAYLOAD'));

  const normalized = svc.normalizeSignedAccessPayload({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    state: 'active',
    tokenId: 'TOK-1',
    expiresInSeconds: 900,
    signedUrl: 'https://signed.example.com/tok-1?signature=secret'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid signed access payload should normalize');
  assert.equal(normalized.payload.state, 'ACTIVE');
  assert.equal(normalized.payload.expiresInSeconds, 900);
  assert.ok(Object.isFrozen(normalized), 'normalized signed access output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /ATT-1|EMP-1|TOK-1|signed\.example|signature|"signedUrl"\s*:/i, 'normalized signed access output must redact token details');

  const generated = svc.generateTemporaryAccess({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-1',
    empId: 'EMP-1',
    workflowId: 'WF-1',
    expiresInSeconds: 900,
    accessType: 'DOWNLOAD'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(generated.success, true, 'temporary access generation should be governed');
  assert.equal(generated.state, 'GENERATED');
  assert.ok(generated.temporaryAccess.expiresSafely, 'temporary access must expire safely');
  assert.ok(generated.temporaryAccess.revocableAccessToken, 'temporary access must be revocable');
  assert.equal(generated.temporaryAccess.signedUrlRedacted, true, 'signed URLs must remain redacted');
  assert.doesNotMatch(JSON.stringify(generated), /ATT-1|EMP-1|TOK-|signed\.example|signature|"signedUrl"\s*:/i, 'generated access output must redact token details');

  const revoked = svc.revokeTemporaryAccess({
    tenantSlug: 'tabsons',
    attachmentId: 'ATT-2',
    empId: 'EMP-2',
    workflowId: 'WF-1',
    tokenId: 'TOK-3'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(revoked.success, true, 'revocation should be governed');
  assert.equal(revoked.state, 'REVOKED');
  assert.ok(revoked.revocation.instantRevocation, 'instant revocation marker should be present');
  assert.ok(revoked.revocation.forcedExpiry, 'forced expiry marker should be present');

  const suspicious = svc.detectSuspiciousTokenBehavior({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-28T00:20:00.000Z' });
  assert.equal(suspicious.success, true, 'suspicious token behavior detection should work');
  assert.ok(suspicious.summary.repeatedTokenReuse >= 1, 'repeated token reuse should be counted');
  assert.ok(suspicious.summary.expiredTokenAccessAttempts >= 1, 'expired token attempts should be counted');
  assert.ok(suspicious.summary.abnormalPreviewFrequency >= 1, 'abnormal preview frequency should be counted');
  assert.ok(suspicious.summary.suspiciousDownloadBursts >= 1, 'suspicious download bursts should be counted');
  assert.ok(suspicious.summary.unauthorizedSharingAttempts >= 1, 'unauthorized sharing should be counted');
  assert.ok(suspicious.summary.crossTenantAccessAnomalies >= 1, 'cross-workflow/tenant anomalies should be counted');
  assert.ok(suspicious.summary.malformedSignatureAttempts >= 1, 'malformed signatures should be counted');
  assert.ok(Object.isFrozen(suspicious.signals), 'suspicious token signals must be immutable');
  assert.doesNotMatch(JSON.stringify(suspicious), /ATT-X|EMP-X|TOK-X|abc-secret|ABC confidential|signed\.example|"signature"\s*:|salary-private|fileName/i, 'suspicious output must redact raw and cross-tenant details');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    signedAccessRecords: before.signedAccessRecords,
    signedAccessAuditEvents: before.signedAccessAuditEvents,
    documentAccessLogs: before.documentAccessLogs,
    storageAccessLogs: before.storageAccessLogs,
    fileAttachments: before.fileAttachments
  });
  const report = svc.generateSignedAccessReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-28T00:20:00.000Z'
  });
  assert.equal(report.success, true, 'signed access report should generate');
  assert.equal(report.readOnly, true, 'signed access report must be read-only');
  assert.ok(report.signedUrlHealth.totalSignedAccess >= 4, 'signed URL health should aggregate access records');
  assert.ok(report.expiryGovernance.expiredAccess >= 1, 'expiry governance should aggregate expired access');
  assert.ok(report.revocationGovernance.revokedAccess >= 1, 'revocation governance should aggregate revocations');
  assert.ok(report.suspiciousTokenDetection.repeatedTokenReuse >= 1, 'suspicious token detection should aggregate reuse');
  assert.ok(report.accessAnalytics.signedUrlGenerationVolume >= 1, 'access analytics should aggregate generation volume');
  assert.equal(report.accessGovernance.superAdminSignedUrlOverride, false, 'SUPER_ADMIN signed URL override remains blocked');
  assert.equal(report.accessGovernance.platformOwnerAccessChain, false, 'PLATFORM_OWNER remains isolated');
  assert.ok(report.integrationHealth.storageHardeningIntegrated, 'StorageHardeningService integration should be detected');
  assert.ok(report.integrationHealth.documentVisibilityIntegrated, 'DocumentVisibilityService integration should be detected');
  assert.ok(report.integrationHealth.documentClassificationIntegrated, 'DocumentClassificationService integration should be detected');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ATT-X|EMP-X|TOK-X|abc-secret|ABC confidential|salary-private|identity-private|signed\.example|"signature"\s*:|"signedUrl"\s*:|tokenHash/i, 'report must not expose cross-tenant or raw signed access data');
  assert.equal(JSON.stringify({
    signedAccessRecords: global.DB.get().signedAccessRecords,
    signedAccessAuditEvents: global.DB.get().signedAccessAuditEvents,
    documentAccessLogs: global.DB.get().documentAccessLogs,
    storageAccessLogs: global.DB.get().storageAccessLogs,
    fileAttachments: global.DB.get().fileAttachments
  }), historicalBefore, 'signed access report must not mutate historical access records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /SIGNED_URL|SIGNED_ACCESS|TEMPORARY_ACCESS/.test(row.eventType || row.category || '')), 'signed access telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.SIGNED_ACCESS_REPORTED, 'signed access metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /SIGNED_URL|SIGNED_ACCESS|TEMPORARY_ACCESS/.test(row.actionType || row.action || '')), 'signed access actions should be audited safely');

  const originalStorage = global.StorageHardeningService;
  const originalVisibility = global.DocumentVisibilityService;
  const originalClassification = global.DocumentClassificationService;
  const originalAuditTrail = global.AttachmentAuditTrailService;
  const originalRetention = global.FileRetentionService;
  const originalUpload = global.UploadValidationService;
  try {
    delete global.StorageHardeningService;
    delete global.DocumentVisibilityService;
    delete global.DocumentClassificationService;
    delete global.AttachmentAuditTrailService;
    delete global.FileRetentionService;
    delete global.UploadValidationService;
    const degraded = svc.generateSignedAccessReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing signed access dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.storageHardeningIntegrated, false, 'missing storage dependency should be visible');
    assert.equal(degraded.integrationHealth.documentVisibilityIntegrated, false, 'missing visibility dependency should be visible');
    assert.equal(degraded.integrationHealth.documentClassificationIntegrated, false, 'missing classification dependency should be visible');
    assert.equal(degraded.integrationHealth.uploadValidationIntegrated, false, 'missing upload dependency should be visible');
  } finally {
    if (originalStorage) global.StorageHardeningService = originalStorage;
    if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
    if (originalClassification) global.DocumentClassificationService = originalClassification;
    if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
    if (originalRetention) global.FileRetentionService = originalRetention;
    if (originalUpload) global.UploadValidationService = originalUpload;
  }

  console.log('signedUrlGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
