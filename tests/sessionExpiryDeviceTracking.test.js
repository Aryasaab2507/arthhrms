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
  global.globalThis = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32',
    language: 'en-IN'
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

function seedSessionData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', email: 'esha@example.com', role: 'employee', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', authUserId: 'USR-EMP-1', salary: 1000000 },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Ravi Ops', email: 'ravi@example.com', role: 'employee', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', authUserId: 'USR-EMP-2' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', email: 'harini@example.com', role: 'hr', department: 'People', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', email: 'divya@example.com', role: 'director', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'employee', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', authUserId: 'USR-ABC-1', salary: 900000, leaveBalance: 44, privateNote: 'ABC confidential session' }
  ];
  data.users = [
    { id: 'USR-EMP-1', name: 'Esha Engineer', email: 'esha@example.com', role: 'employee', empId: 'EMP-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', password: 'oldLocal123' },
    { id: 'USR-EMP-2', name: 'Ravi Ops', email: 'ravi@example.com', role: 'employee', empId: 'EMP-2', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', password: 'raviLocal123' },
    { id: 'USR-HR-1', name: 'Harini HR', email: 'harini@example.com', role: 'hr', empId: 'HR-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'USR-DIR-1', name: 'Divya Director', email: 'divya@example.com', role: 'director', empId: 'DIR-1', active: true, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'USR-ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'employee', empId: 'ABC-1', active: true, tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900000 }
  ];
  data.sessionGovernance = {
    sessions: [
      {
        sessionId: 'SES-STALE',
        userId: 'USR-EMP-1',
        employeeId: 'EMP-1',
        role: 'employee',
        tenantSlug: 'tabsons',
        tenantId: 'TEN-tabsons',
        state: 'ACTIVE',
        loginAt: '2026-06-16T00:00:00.000Z',
        lastActivityAt: '2026-06-16T00:20:00.000Z',
        expiresAt: '2026-06-16T12:00:00.000Z',
        device: { deviceFingerprint: 'DEV-STALE', browser: 'Chrome', os: 'Windows', ipRange: '10.2.x.x' }
      },
      {
        sessionId: 'SES-ABC',
        userId: 'USR-ABC-1',
        employeeId: 'ABC-1',
        role: 'employee',
        tenantSlug: 'abc',
        tenantId: 'TEN-abc',
        state: 'ACTIVE',
        loginAt: '2026-06-17T01:00:00.000Z',
        lastActivityAt: '2026-06-17T01:10:00.000Z',
        expiresAt: '2026-06-17T13:00:00.000Z',
        device: { deviceFingerprint: 'DEV-ABC', browser: 'Chrome', os: 'Windows', ipRange: '172.16.x.x' }
      }
    ],
    policies: {
      tabsons: { inactivityTimeoutMinutes: 30, idleTimeoutMinutes: 30, absoluteSessionHours: 12, absoluteLifetimeHours: 12, rememberMeDays: 14, maxConcurrentSessions: 2 }
    }
  };
  data.sessionHistory = [];
  data.deviceHistory = [];
  data.sessionAnalytics = [];
  data.authSessions = [];
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
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js',
    'services/sessionGovernanceService.js',
    'services/passwordResetGovernanceService.js'
  ].forEach(load);
  seedSessionData();

  const svc = global.SessionGovernanceService;
  assert.ok(svc, 'SessionGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_SESSION_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should pass');

  ['createSession', 'expireSession', 'revokeSession', 'revokeAllSessions', 'calculateSessionRisk', 'calculateDeviceTrust', 'freezeSessionOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const employeeContext = { actor: { id: 'USR-EMP-1', userId: 'USR-EMP-1', empId: 'EMP-1', email: 'esha@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', policy: { inactivityTimeoutMinutes: 30, absoluteSessionHours: 12, rememberMeDays: 14, maxConcurrentSessions: 2 } };
  const hrContext = { actor: { id: 'USR-HR-1', userId: 'USR-HR-1', empId: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', reviewOnly: true };
  const directorContext = { actor: { id: 'USR-DIR-1', userId: 'USR-DIR-1', empId: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', reviewOnly: true };
  const platformContext = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, governanceOnly: true };

  const created = svc.createSession({
    userId: 'USR-EMP-1',
    employeeId: 'EMP-1',
    role: 'employee',
    tenantSlug: 'tabsons',
    tenantId: 'TEN-tabsons',
    rememberMe: true,
    device: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
      platform: 'Win32',
      ipAddress: '10.10.44.55',
      geo: { country: 'IN', region: 'MH', preciseAddress: 'Do not expose' },
      accessToken: 'raw-secret'
    }
  }, employeeContext);
  assert.equal(created.success, true, 'session creation should work');
  assert.equal(created.state, 'ACTIVE');
  assert.ok(created.session.sessionId, 'session id should be generated');
  assert.equal(created.session.device.browser, 'Chrome');
  assert.ok(created.session.expiresAt, 'absolute expiry should be generated');
  assert.ok(created.device.trustedDeviceId, 'trusted device record should be created');
  assert.ok(Object.isFrozen(created), 'created session output should be immutable');
  assert.doesNotMatch(text(created), /10\.10\.44\.55|raw-secret|preciseAddress|salary|leaveBalance|ABC confidential/i, 'session output must not expose raw device secrets or confidential data');

  const trust = svc.calculateDeviceTrust({ tenantSlug: 'tabsons', userId: 'USR-EMP-1', device: created.session.device }, employeeContext);
  assert.equal(trust.success, true, 'device trust calculation should work');
  assert.ok(trust.deviceTrustScore >= 60, 'known device should receive a useful trust score');
  assert.ok(Object.isFrozen(trust), 'device trust output should be immutable');

  const risk = svc.calculateSessionRisk({ tenantSlug: 'tabsons', userId: 'USR-EMP-1', sessionId: created.session.sessionId }, employeeContext);
  assert.equal(risk.success, true, 'session risk calculation should work');
  assert.ok(risk.sessionRiskScore >= 0 && risk.sessionRiskScore <= 100);

  const expired = svc.expireSession({ sessionId: 'SES-STALE', tenantSlug: 'tabsons', now: '2026-06-17T02:00:00.000Z' }, employeeContext);
  assert.equal(expired.success, true, 'expiry helper should complete safely');
  assert.equal(expired.state, 'EXPIRED');
  const stale = global.DB.get().sessionGovernance.sessions.find(row => row.sessionId === 'SES-STALE');
  assert.equal(stale.state, 'EXPIRED', 'stale session should be persisted as expired');

  const revoked = svc.revokeSession(created.session.sessionId, employeeContext);
  assert.equal(revoked.success, true, 'own session revocation should work');
  assert.equal(revoked.revoked, true);
  const revokedCheck = svc.validateSessionScope({ sessionId: created.session.sessionId }, employeeContext);
  assert.equal(revokedCheck.allowed, false, 'revoked session must be invalid');
  assert.ok(revokedCheck.failures.some(item => item.failureCode === 'SESSION_REVOKED'));

  const s1 = svc.createSession({ sessionId: 'SES-BULK-1', userId: 'USR-EMP-1', employeeId: 'EMP-1', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { deviceFingerprint: 'DEV-BULK-1', browser: 'Chrome' } }, employeeContext);
  const s2 = svc.createSession({ sessionId: 'SES-BULK-2', userId: 'USR-EMP-1', employeeId: 'EMP-1', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { deviceFingerprint: 'DEV-BULK-2', browser: 'Firefox' } }, employeeContext);
  assert.equal(s1.success, true);
  assert.equal(s2.success, true);
  const allRevoked = svc.revokeAllSessions({ tenantSlug: 'tabsons', userId: 'USR-EMP-1', preserveSessionId: 'CURRENT-DOES-NOT-EXIST' }, employeeContext);
  assert.equal(allRevoked.success, true, 'all-device revocation should work');
  assert.ok(allRevoked.revokedCount >= 2, 'all user sessions should be revoked');
  assert.equal(global.DB.get().sessionGovernance.sessions.find(row => row.sessionId === 'SES-ABC').state, 'ACTIVE', 'cross-tenant sessions must not be revoked');

  ['A', 'B', 'C'].forEach(suffix => {
    svc.createSession({
      sessionId: `SES-RISK-${suffix}`,
      userId: 'USR-EMP-2',
      employeeId: 'EMP-2',
      role: 'employee',
      tenantSlug: 'tabsons',
      tenantId: 'TEN-tabsons',
      device: { deviceFingerprint: `DEV-RISK-${suffix}`, userAgent: `Chrome-${suffix}`, country: suffix === 'C' ? 'US' : 'IN' }
    }, { actor: { id: 'USR-EMP-2', userId: 'USR-EMP-2', empId: 'EMP-2', email: 'ravi@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 2 } });
  });
  const risky = svc.calculateSessionRisk({ tenantSlug: 'tabsons', userId: 'USR-EMP-2', device: { deviceFingerprint: 'DEV-RISK-Z', country: 'US' } }, { actor: { id: 'USR-EMP-2', role: 'EMPLOYEE', email: 'ravi@example.com', empId: 'EMP-2', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 2 } });
  assert.ok(risky.suspicious === true || risky.riskLevel === 'HIGH' || risky.riskLevel === 'CRITICAL', 'suspicious concurrent or unusual device activity should be detected');
  assert.ok(risky.securityAlerts.length >= 1, 'security alerts should be generated for risky sessions');

  const employeeView = svc.getSessionGovernanceView(employeeContext);
  assert.ok(employeeView.sessions.every(row => row.userId === 'USR-EMP-1'), 'employee can view own sessions only');
  assert.doesNotMatch(text(employeeView), /ABC Employee|USR-ABC-1|900000|leaveBalance|ABC confidential/i, 'employee session view must not leak other tenant data');

  const hrView = svc.getSessionGovernanceView(hrContext);
  assert.ok(hrView.sessions.some(row => row.tenantSlug === 'tabsons'), 'HR can view workforce session metadata');
  assert.ok(hrView.sessions.every(row => row.tenantSlug === 'tabsons'), 'HR session view remains tenant scoped');
  assert.doesNotMatch(text(hrView), /password|raw-secret|10\.10\.44\.55|900000|ABC confidential/i, 'HR view must remain metadata-only');

  const directorView = svc.getSessionGovernanceView(directorContext);
  assert.equal(directorView.success, true, 'director can view governance metadata');

  const platformView = svc.getSessionGovernanceView(platformContext);
  assert.equal(platformView.success, true, 'platform owner can view security governance metadata');
  assert.equal(platformView.metadata.platformOwnerIsolated, true);

  const analytics = svc.generateSessionAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'session analytics should work');
  assert.ok(analytics.analytics.sessionHealthScore >= 0);
  assert.ok(analytics.analytics.deviceTrustScore >= 0);
  assert.ok(analytics.analytics.authenticationSecurityScore >= 0);
  assert.ok(analytics.analytics.activeSessions >= 0);
  assert.ok(Object.isFrozen(analytics), 'analytics output should be immutable');
  assert.doesNotMatch(text(analytics), /ABC confidential|900000|leaveBalance|raw-secret|10\.10\.44\.55/i, 'analytics must be sanitized and tenant scoped');

  const malformed = svc.createSession('bad-payload', employeeContext);
  assert.equal(malformed.success, false, 'malformed session payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_SESSION_PAYLOAD'));

  const resetToken = global.PasswordResetGovernanceService.generateResetToken({ tenantSlug: 'tabsons', email: 'esha@example.com' }, { ...employeeContext, exposeToken: true });
  const p1 = svc.createSession({ sessionId: 'SES-PWR-1', userId: 'USR-EMP-1', employeeId: 'EMP-1', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { browser: 'Chrome' } }, employeeContext);
  const p2 = svc.createSession({ sessionId: 'SES-PWR-2', userId: 'USR-EMP-1', employeeId: 'EMP-1', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', device: { browser: 'Edge' } }, employeeContext);
  assert.equal(p1.success, true);
  assert.equal(p2.success, true);
  const reset = global.PasswordResetGovernanceService.resetUserPassword({ tenantSlug: 'tabsons', email: 'esha@example.com', token: resetToken.token, password: 'FreshReset!789', confirmPassword: 'FreshReset!789', logoutAllDevices: true }, employeeContext);
  assert.equal(reset.success, true, 'password reset integration should complete');
  assert.ok(reset.sessionRevocation.revokedCount >= 2, 'password reset should revoke governed sessions through session governance');
  const afterReset = global.DB.get().sessionGovernance.sessions.filter(row => row.userId === 'USR-EMP-1' && /^SES-PWR/.test(row.sessionId));
  assert.ok(afterReset.every(row => row.state === 'REVOKED'), 'password reset should mark governed sessions revoked');

  const data = global.DB.get();
  assert.ok(data.sessionHistory.length >= 1, 'immutable session history should be recorded');
  assert.ok(data.deviceHistory.length >= 1, 'immutable device history should be recorded');
  assert.ok(data.sessionAnalytics.length >= 1, 'immutable session analytics should be recorded');
  assert.ok(global.DB.getAuditLogs().some(row => /SESSION_/.test(row.actionType || row.action || '')), 'session actions should be audited');

  const standalone = {};
  standalone.window = standalone;
  standalone.globalThis = standalone;
  standalone.__ARTHHRMS_DEV__ = true;
  standalone.navigator = { userAgent: 'Standalone Chrome', platform: 'Win32' };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'services/sessionGovernanceService.js'), 'utf8'), standalone);
  assert.equal(standalone.__ARTHHRMS_SESSION_GOVERNANCE_SELF_TEST__.passed, true, 'standalone self-test should pass without DB dependencies');
}

main();
