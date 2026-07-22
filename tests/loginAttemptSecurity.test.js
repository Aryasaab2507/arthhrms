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
  global.__ARTHHRMS_DEV__ = true;
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
    pathname: '/ArthHRMS.html',
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

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons'
  };
  data.users = [
    { id: 'USR-EMP-1', authUserId: 'AUTH-EMP-1', name: 'Esha Rao', email: 'esha@example.com', role: 'employee', empId: 'EMP-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true },
    { id: 'USR-HR-1', authUserId: 'AUTH-HR-1', name: 'HR User', email: 'hr@example.com', role: 'hr', empId: 'HR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true },
    { id: 'PO-1', authUserId: 'AUTH-PO-1', name: 'Platform Owner', email: 'platform.owner@example.com', role: 'platform_owner', active: true }
  ];
  data.employees = [
    { id: 'EMP-1', authUserId: 'AUTH-EMP-1', name: 'Esha Rao', email: 'esha@example.com', dept: 'Engineering', desig: 'Engineer', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true },
    { id: 'HR-1', authUserId: 'AUTH-HR-1', name: 'HR User', email: 'hr@example.com', dept: 'HR', desig: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', active: true }
  ];
  data.loginAttemptHistory = [];
  data.loginLockoutHistory = [];
  data.authenticationSecurityHistory = [];
  data.notifications = [];
  data.notificationHistory = [];
  data.notificationDeliveryLogs = [];
  data.auditLogs = [];
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
    'services/notificationCenterService.js',
    'services/sessionGovernanceService.js',
    'services/loginAttemptSecurityService.js'
  ].forEach(load);
  seedData();

  const svc = global.LoginAttemptSecurityService;
  assert.ok(svc, 'LoginAttemptSecurityService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_LOGIN_SECURITY_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'recordLoginAttempt',
    'calculateLoginRisk',
    'applyLockoutPolicy',
    'detectSuspiciousLogin',
    'generateSecurityAlert',
    'generateAuthenticationSecurityReport',
    'freezeLoginSecurityOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const employeeContext = { actor: { id: 'USR-EMP-1', userId: 'USR-EMP-1', empId: 'EMP-1', email: 'esha@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' };
  const hrContext = { actor: { id: 'USR-HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' };
  const platformContext = { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, governanceOnly: true };

  const baseAttempt = {
    email: 'esha@example.com',
    tenantSlug: 'tabsons',
    tenantId: 'TEN-tabsons',
    source: 'ArthHRMS.html',
    device: { userAgent: 'Chrome on Windows', ipAddress: '10.10.44.55', deviceFingerprint: 'DEV-LOGIN-A' }
  };

  const first = svc.recordLoginAttempt({ ...baseAttempt, outcome: 'FAILED', password: 'do-not-store' }, employeeContext);
  assert.equal(first.success, true, 'first failed login should be tracked');
  assert.equal(first.accountState, 'WARNING', 'first failed login should warn');
  assert.ok(Object.isFrozen(first), 'login attempt output should be immutable');
  assert.doesNotMatch(JSON.stringify(first), /do-not-store|10\.10\.44\.55/i, 'outputs must not expose credentials or raw IPs');

  let fifth;
  for (let index = 2; index <= 5; index += 1) {
    fifth = svc.recordLoginAttempt({ ...baseAttempt, outcome: 'FAILED', failureReason: 'INVALID_PASSWORD' }, employeeContext);
  }
  assert.equal(fifth.accountState, 'LOCKED', 'fifth failed login should lock the account');
  assert.equal(fifth.locked, true, 'lockout flag should be set');

  const lockout = svc.applyLockoutPolicy({ email: 'esha@example.com', tenantSlug: 'tabsons' }, employeeContext);
  assert.equal(lockout.locked, true, 'lockout policy should block locked accounts');
  assert.equal(lockout.accountState, 'LOCKED');

  assert.equal(global.authService.loginByRole, undefined, 'local role login must not be exposed');
  assert.equal(global.DB.loginByRole, undefined, 'database password login must not be exposed');

  const unlock = svc.unlockAccount({ email: 'esha@example.com', tenantSlug: 'tabsons', reason: 'security_review_complete' }, hrContext);
  assert.equal(unlock.success, true, 'HR should manually unlock same-tenant accounts');
  assert.equal(unlock.accountState, 'ACTIVE');

  assert.equal(global.authService.isLocalDemoLoginAllowed(), false, 'local authentication remains disabled after unlock');

  svc.recordLoginAttempt({ ...baseAttempt, outcome: 'SUCCESS' }, employeeContext);

  const suspicious = svc.detectSuspiciousLogin({
    ...baseAttempt,
    outcome: 'SUCCESS',
    device: { userAgent: 'Firefox on Linux', ipAddress: '172.16.8.9', deviceFingerprint: 'DEV-LOGIN-B' },
    loginAt: new Date().toISOString()
  }, employeeContext);
  assert.equal(suspicious.success, true);
  assert.equal(suspicious.suspicious, true, 'new device after prior login should be suspicious');
  assert.ok(suspicious.findings.some(item => item.findingCode === 'NEW_DEVICE_LOGIN'), 'new device finding should be explained');

  const risk = svc.calculateLoginRisk({ email: 'esha@example.com', tenantSlug: 'tabsons' }, hrContext);
  assert.equal(risk.success, true);
  assert.ok(risk.loginRiskScore <= 70, 'repeated failures should reduce login trust');

  const alert = svc.generateSecurityAlert({
    email: 'esha@example.com',
    tenantSlug: 'tabsons',
    alertType: 'SUSPICIOUS_LOGIN',
    severity: 'HIGH',
    message: 'Suspicious login reviewed by test'
  }, hrContext);
  assert.equal(alert.success, true, 'security alert generation should succeed');
  assert.equal(alert.metadata.tenantIsolationPreserved, true);

  svc.recordLoginAttempt({ email: 'other@example.com', tenantSlug: 'abc', outcome: 'FAILED', device: { ipAddress: '192.168.1.10' } }, { actor: { role: 'HR', tenantSlug: 'abc' }, tenantSlug: 'abc' });
  const report = svc.generateAuthenticationSecurityReport({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(report.success, true, 'auth security report should generate');
  assert.ok(report.attempts.every(row => row.tenantSlug === 'tabsons'), 'HR report should stay tenant scoped');
  assert.ok(report.analytics.loginFailureRate > 0, 'analytics should include failure rate');
  assert.ok(Object.isFrozen(report), 'report output should be immutable');

  const platformReport = svc.generateAuthenticationSecurityReport({}, platformContext);
  assert.equal(platformReport.success, true, 'platform owner should get governance visibility');
  assert.ok(platformReport.attempts.some(row => row.tenantSlug === 'abc'), 'platform owner can see aggregate cross-tenant metadata');

  const malformed = svc.recordLoginAttempt('bad-payload', employeeContext);
  assert.equal(malformed.success, false, 'malformed attempt payload should fail safely');
  assert.ok(Object.isFrozen(malformed), 'malformed output should be immutable');

  const data = global.DB.get();
  assert.ok(data.loginAttemptHistory.length >= 7, 'immutable login history should be recorded');
  assert.ok(data.loginLockoutHistory.length >= 1, 'immutable lockout history should be recorded');
  assert.ok(data.authenticationSecurityHistory.length >= 1, 'immutable security analytics should be recorded');
  assert.ok(data.auditLogs.length >= 1, 'audit records should be recorded');
  assert.doesNotMatch(JSON.stringify(data.loginAttemptHistory), /do-not-store|10\.10\.44\.55|172\.16\.8\.9/i, 'login history must not store passwords or raw IPs');

  console.log('loginAttemptSecurity.test.js passed');
}

main();
