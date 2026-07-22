const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  global.globalThis = global;
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

function seedPasswordResetData() {
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
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', email: 'divya@example.com', role: 'director', department: 'Leadership', designation: 'Director', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', email: 'harini@example.com', role: 'HR', department: 'People', designation: 'HR Head', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', email: 'esha@example.com', role: 'employee', department: 'Engineering', designation: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active', authUserId: 'USR-EMP-1', privateNote: 'employee private' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Ravi Ops', email: 'ravi@example.com', role: 'employee', department: 'Operations', designation: 'Analyst', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active', authUserId: 'USR-EMP-2' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'employee', department: 'Finance', designation: 'Analyst', tenantSlug: 'abc', tenantId: 'TEN-abc', activationStatus: 'Active', authUserId: 'USR-ABC-1', salary: 900000, leaveBalance: 44, privateNote: 'ABC confidential credential' }
  ];
  data.users = [
    { id: 'USR-EMP-1', name: 'Esha Engineer', email: 'esha@example.com', password: 'oldLocal123', passwordHash: 'legacy-hash', passwordFingerprint: 'fp-oldlocal123', passwordHistoryFingerprints: ['fp-oldlocal123', 'fp-previouspass123'], role: 'employee', empId: 'EMP-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active', sessionIds: ['S1', 'S2'] },
    { id: 'USR-EMP-2', name: 'Ravi Ops', email: 'ravi@example.com', password: 'raviLocal123', role: 'employee', empId: 'EMP-2', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active' },
    { id: 'USR-HR-1', name: 'Harini HR', email: 'harini@example.com', password: 'hrLocal123', role: 'hr', empId: 'HR-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'USR-DIR-1', name: 'Divya Director', email: 'divya@example.com', password: 'dirLocal123', role: 'director', empId: 'DIR-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'USR-ABC-1', name: 'ABC Employee', email: 'abc@example.com', password: 'abcLocal123', role: 'employee', empId: 'ABC-1', active: true, tenantSlug: 'abc', tenantId: 'TEN-abc', activationStatus: 'Active', salary: 900000 }
  ];
  data.authSessions = [
    { sessionId: 'S1', userId: 'USR-EMP-1', tenantSlug: 'tabsons', active: true },
    { sessionId: 'S2', userId: 'USR-EMP-1', tenantSlug: 'tabsons', active: true },
    { sessionId: 'S-ABC', userId: 'USR-ABC-1', tenantSlug: 'abc', active: true }
  ];
  data.passwordResetRequests = [];
  data.passwordResetTokenHistory = [];
  data.passwordResetHistory = [];
  data.passwordResetAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/tenantIsolationService.js',
    'services/inviteMailDeliveryService.js',
    'services/employeeActivationWizardService.js'
  ].forEach(load);
  seedPasswordResetData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/passwordResetGovernanceService.js');

  const svc = global.PasswordResetGovernanceService;
  assert.ok(svc, 'PasswordResetGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_PASSWORD_RESET_SELF_TEST__.passed, true, 'development self-test should pass');

  ['requestPasswordReset', 'generateResetToken', 'validateResetToken', 'resetUserPassword', 'revokeUserSessions', 'freezePasswordResetOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', email: 'esha@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', email: 'harini@example.com', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', reviewOnly: true };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', email: 'divya@example.com', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', reviewOnly: true };
  const platformContext = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', governanceOnly: true };

  const request = svc.requestPasswordReset({ tenantSlug: 'tabsons', email: 'esha@example.com' }, employeeContext);
  assert.equal(request.success, true, 'employee can request own password reset');
  assert.equal(request.state, 'SENT');
  assert.equal(request.tenantSlug, 'tabsons');
  assert.ok(request.resetRequest.requestId, 'reset request should be tracked');
  assert.ok(request.resetRequest.tokenPreview, 'request output should expose only token preview');
  assert.ok(request.delivery.emailPrepared, 'email delivery should be prepared');
  assert.ok(Object.isFrozen(request), 'request output must be immutable');
  assert.doesNotMatch(text(request), /oldLocal123|legacy-hash|salary|leaveBalance|ABC confidential/i, 'request output must not expose passwords or confidential data');
  assert.ok(!request.resetRequest.token, 'standard reset request must not expose raw token');

  const firstToken = svc.generateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com' }, { ...employeeContext, exposeToken: true });
  assert.equal(firstToken.success, true, 'direct token helper should generate a secure reset token');
  assert.ok(firstToken.token && firstToken.token.length >= 40, 'reset token should be long and non-guessable');
  assert.equal(firstToken.state, 'CREATED');

  const secondToken = svc.generateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com' }, { ...employeeContext, exposeToken: true });
  assert.equal(secondToken.success, true, 'multiple reset requests should create a new governed token');
  const revokedPrior = svc.validateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com', token: firstToken.token }, employeeContext);
  assert.equal(revokedPrior.success, false, 'older concurrent reset tokens should be revoked');
  assert.ok(revokedPrior.failures.some(item => item.code === 'RESET_TOKEN_REVOKED'));

  const validation = svc.validateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com', token: secondToken.token }, employeeContext);
  assert.equal(validation.success, true, 'latest token should validate');
  assert.equal(validation.state, 'CREATED');
  assert.equal(validation.validation.ownerValidated, true);

  const weak = svc.resetUserPassword({ tenantSlug: 'tabsons', email: 'esha@example.com', token: secondToken.token, password: 'weak', confirmPassword: 'weak' }, employeeContext);
  assert.equal(weak.success, false, 'weak passwords must be blocked');
  assert.ok(weak.failures.some(item => item.code === 'PASSWORD_POLICY_FAILED'));

  const historyReuse = svc.resetUserPassword({ tenantSlug: 'tabsons', email: 'esha@example.com', token: secondToken.token, password: 'oldLocal123', confirmPassword: 'oldLocal123' }, employeeContext);
  assert.equal(historyReuse.success, false, 'password history reuse must be blocked');
  assert.ok(historyReuse.failures.some(item => item.code === 'PASSWORD_HISTORY_REUSE'));

  const reset = svc.resetUserPassword({ tenantSlug: 'tabsons', email: 'esha@example.com', token: secondToken.token, password: 'FreshPass!456', confirmPassword: 'FreshPass!456', logoutAllDevices: true }, employeeContext);
  assert.equal(reset.success, true, 'password reset should succeed with valid token and policy-compliant password');
  assert.equal(reset.state, 'USED');
  assert.equal(reset.sessionRevocation.revokedCount, 2, 'successful reset should revoke existing sessions');
  assert.doesNotMatch(text(reset), /FreshPass|oldLocal123|legacy-hash|S-ABC|ABC confidential/i, 'reset output must not expose passwords, token secrets, or cross-tenant sessions');

  const updatedUser = global.DB.get().users.find(user => user.id === 'USR-EMP-1');
  assert.notEqual(updatedUser.passwordHash, 'legacy-hash', 'password hash should change');
  assert.notEqual(updatedUser.passwordHash, 'FreshPass!456', 'password must not be stored as plaintext hash');
  assert.equal(updatedUser.password, '', 'legacy plaintext password must be cleared after governed reset');
  assert.ok(updatedUser.passwordHistoryFingerprints.length >= 2, 'password history should be retained');
  assert.ok(global.DB.get().authSessions.filter(row => row.userId === 'USR-EMP-1').every(row => row.active === false && row.revoked === true), 'active sessions should be revoked');
  assert.ok(global.DB.get().authSessions.find(row => row.userId === 'USR-ABC-1').active, 'other tenant sessions must not be affected');

  const replay = svc.validateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com', token: secondToken.token }, employeeContext);
  assert.equal(replay.success, false, 'used reset tokens must be blocked');
  assert.ok(replay.failures.some(item => item.code === 'RESET_TOKEN_REUSED'));

  const expiredToken = svc.generateResetToken({ tenantSlug: 'tabsons', email: 'ravi@example.com', expiresAt: '2020-01-01T00:00:00.000Z' }, { actor: { id: 'EMP-2', empId: 'EMP-2', email: 'ravi@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', exposeToken: true });
  const expiredValidation = svc.validateResetToken({ tenantSlug: 'tabsons', email: 'ravi@example.com', token: expiredToken.token }, { actor: { id: 'EMP-2', empId: 'EMP-2', email: 'ravi@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' });
  assert.equal(expiredValidation.success, false, 'expired tokens must be blocked');
  assert.ok(expiredValidation.failures.some(item => item.code === 'RESET_TOKEN_EXPIRED'));

  const tampered = svc.validateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com', token: `${secondToken.token}tampered` }, employeeContext);
  assert.equal(tampered.success, false, 'tampered tokens must be blocked');
  assert.ok(tampered.failures.some(item => item.code === 'RESET_TOKEN_INVALID'));

  const wrongOwner = svc.requestPasswordReset({ tenantSlug: 'tabsons', email: 'ravi@example.com' }, employeeContext);
  assert.equal(wrongOwner.success, false, 'employees cannot request reset for another employee account');
  assert.ok(wrongOwner.failures.some(item => item.code === 'RESET_OWNERSHIP_BLOCKED'));

  const crossTenant = svc.requestPasswordReset({ tenantSlug: 'tabsons', email: 'esha@example.com' }, { actor: { id: 'ABC-1', empId: 'ABC-1', email: 'abc@example.com', role: 'EMPLOYEE', tenantSlug: 'abc' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant reset attempts must be blocked');
  assert.ok(crossTenant.failures.some(item => item.code === 'CROSS_TENANT_RESET_BLOCKED'));
  assert.doesNotMatch(text(crossTenant), /Esha Engineer|legacy-hash|salary|leaveBalance|ABC confidential/i, 'cross-tenant failure must not leak scoped data');

  const malformed = svc.requestPasswordReset('bad-payload', employeeContext);
  assert.equal(malformed.success, false, 'malformed payloads should fail safely');
  assert.ok(malformed.failures.some(item => item.code === 'MALFORMED_RESET_PAYLOAD'));

  const hrAnalytics = svc.generatePasswordResetAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(hrAnalytics.success, true, 'HR can review recovery status without password visibility');
  assert.ok(hrAnalytics.analytics.recoveryHealthScore >= 0);
  assert.ok(hrAnalytics.analytics.authenticationReadinessScore >= 0);
  assert.ok(hrAnalytics.analytics.securityScore >= 0);
  assert.doesNotMatch(text(hrAnalytics), /password|FreshPass|oldLocal|legacy-hash|tokenHash|ABC confidential|900000/i, 'analytics must not expose passwords, token hashes, or other tenant data');

  const directorAnalytics = svc.generatePasswordResetAnalytics({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(directorAnalytics.success, true, 'director can review credential recovery governance');

  const platformAnalytics = svc.generatePasswordResetAnalytics({ tenantSlug: 'tabsons' }, platformContext);
  assert.equal(platformAnalytics.success, true, 'platform owner can review security governance');
  assert.equal(platformAnalytics.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformAnalytics.resetRequests.every(row => /^Governance Request/.test(row.displayName)), 'platform owner rows should be anonymized');

  const abcAnalytics = svc.generatePasswordResetAnalytics({ tenantSlug: 'abc' }, { actor: { id: 'ABC-1', role: 'HR', tenantSlug: 'abc' }, tenantSlug: 'abc', reviewOnly: true });
  assert.equal(abcAnalytics.success, true, 'tenant B can review its own credential recovery state');
  assert.doesNotMatch(text(abcAnalytics), /Esha Engineer|FreshPass|Tabsons|legacy-hash/i, 'tenant A data must not influence tenant B analytics');

  const data = global.DB.get();
  assert.ok(data.passwordResetRequests.length >= 3, 'reset requests should be stored immutably');
  assert.ok(data.passwordResetTokenHistory.length >= 3, 'token history should be stored immutably');
  assert.ok(data.passwordResetHistory.length >= 1, 'reset history should be stored immutably');
  assert.ok(data.passwordResetAnalytics.length >= 1, 'reset analytics should be stored immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /PASSWORD_RESET_/.test(row.actionType || row.action || '')), 'password reset actions should be audited');

  const standalone = {};
  standalone.window = standalone;
  standalone.__ARTHHRMS_DEV__ = true;
  standalone.globalThis = standalone;
  standalone.navigator = { userAgent: 'Standalone' };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'services/passwordResetGovernanceService.js'), 'utf8'), standalone);
  assert.equal(standalone.__ARTHHRMS_PASSWORD_RESET_SELF_TEST__.passed, true, 'development self-test should pass without DB dependencies');
}

main();
