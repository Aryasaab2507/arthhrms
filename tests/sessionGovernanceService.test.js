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

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons'
  };
  data.sessionGovernance = {
    sessions: [
      {
        sessionId: 'SES-EXPIRED',
        userId: 'USR-OLD',
        role: 'employee',
        tenantSlug: 'tabsons',
        tenantId: 'TEN-tabsons',
        state: 'ACTIVE',
        loginAt: '2026-05-20T00:00:00.000Z',
        lastActivityAt: '2026-05-20T01:00:00.000Z',
        expiresAt: '2026-05-20T12:00:00.000Z',
        device: { deviceFingerprint: 'DEV-OLD', browser: 'Chrome', os: 'Windows' }
      },
      {
        sessionId: 'SES-OTHER-TENANT',
        userId: 'USR-ABC',
        role: 'employee',
        tenantSlug: 'abc',
        tenantId: 'TEN-abc',
        state: 'ACTIVE',
        loginAt: '2026-05-22T01:00:00.000Z',
        lastActivityAt: '2026-05-22T02:00:00.000Z',
        expiresAt: '2026-05-22T12:00:00.000Z',
        device: { deviceFingerprint: 'DEV-ABC', browser: 'Chrome', os: 'Windows' }
      },
      {
        sessionId: 'SES-PLATFORM',
        userId: 'PO-1',
        role: 'platform_owner',
        tenantSlug: '',
        tenantId: '',
        state: 'ACTIVE',
        loginAt: '2026-05-22T01:00:00.000Z',
        lastActivityAt: '2026-05-22T02:00:00.000Z',
        expiresAt: '2026-05-22T12:00:00.000Z',
        device: { deviceFingerprint: 'DEV-PO', browser: 'Chrome', os: 'Windows' }
      }
    ],
    policies: {
      default: { idleTimeoutMinutes: 30, absoluteLifetimeHours: 12, maxConcurrentSessions: 3 }
    }
  };
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
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/sessionGovernanceService.js');
  seedData();

  const svc = global.SessionGovernanceService;
  assert.ok(svc, 'SessionGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.SESSION_STATES), 'session state constants must be immutable');
  assert.equal(global.__ARTHHRMS_SESSION_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  const deviceInput = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    ipAddress: '10.99.44.55',
    accessToken: 'secret-token',
    geo: { country: 'IN', region: 'MH', latitude: 1, longitude: 2, preciseAddress: 'Nope' }
  };
  const deviceBefore = JSON.stringify(deviceInput);
  const device = svc.normalizeDeviceMetadata(deviceInput);
  assert.equal(JSON.stringify(deviceInput), deviceBefore, 'device metadata normalization must not mutate inputs');
  assert.ok(Object.isFrozen(device), 'device metadata output should be immutable');
  assert.equal(device.browser, 'Chrome');
  assert.equal(device.os, 'Windows');
  assert.doesNotMatch(JSON.stringify(device), /10\.99\.44\.55|secret-token|latitude|longitude|preciseAddress/i, 'device metadata must not expose unsafe fingerprinting data');

  const sessionInput = {
    userId: 'USR-T1',
    role: 'employee',
    tenantSlug: 'tabsons',
    tenantId: 'TEN-tabsons',
    password: 'secret',
    device: deviceInput
  };
  const sessionBefore = JSON.stringify(sessionInput);
  const created = svc.recordSessionStart(sessionInput, { tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 3 } });
  assert.equal(JSON.stringify(sessionInput), sessionBefore, 'recording a session must not mutate caller input');
  assert.equal(created.recorded, true, 'session start should be recorded');
  assert.equal(created.session.state, 'ACTIVE');
  assert.doesNotMatch(JSON.stringify(created), /secret|10\.99\.44\.55/i, 'session output must redact auth secrets and raw IP');

  const expired = svc.validateSessionScope({ sessionId: 'SES-EXPIRED' }, { tenantSlug: 'tabsons', now: '2026-05-22T03:00:00.000Z' });
  assert.equal(expired.allowed, false, 'expired sessions must not remain active');
  assert.ok(expired.failures.some(item => item.failureCode === 'SESSION_EXPIRED'));

  const mismatch = svc.validateSessionScope({ sessionId: 'SES-OTHER-TENANT' }, { tenantSlug: 'tabsons', now: '2026-05-22T03:00:00.000Z' });
  assert.equal(mismatch.allowed, false, 'cross-tenant sessions must be blocked');
  assert.ok(mismatch.failures.some(item => item.failureCode === 'CROSS_TENANT_SESSION_SCOPE' && item.severity === 'CRITICAL'));

  const platformTenant = svc.validateSessionScope({ sessionId: 'SES-PLATFORM' }, { tenantSlug: 'tabsons', routeType: 'tenant', now: '2026-05-22T03:00:00.000Z' });
  assert.equal(platformTenant.allowed, false, 'PLATFORM_OWNER session must be isolated from tenant routes');
  assert.ok(platformTenant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_SESSION_BLOCKED'));

  ['A', 'B', 'C', 'D'].forEach(suffix => {
    svc.recordSessionStart({
      sessionId: `SES-CON-${suffix}`,
      userId: 'USR-CON',
      role: 'manager',
      tenantSlug: 'tabsons',
      device: { deviceFingerprint: `DEV-${suffix}`, userAgent: `Chrome-${suffix}` }
    }, { tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 3 } });
  });
  const concurrent = svc.detectSuspiciousAccess({
    userId: 'USR-CON',
    tenantSlug: 'tabsons',
    device: { deviceFingerprint: 'DEV-Z' }
  }, { tenantSlug: 'tabsons', policy: { maxConcurrentSessions: 3 }, now: '2026-05-22T03:00:00.000Z' });
  assert.ok(concurrent.riskLevel === 'HIGH' || concurrent.riskLevel === 'CRITICAL', 'unsafe concurrent sessions should be detectable');
  assert.ok(concurrent.findings.some(item => item.findingCode === 'CONCURRENT_SESSION_LIMIT_EXCEEDED'));

  const revoked = svc.revokeSession('SES-CON-A', { actor: { role: 'super_admin', id: 'SA-1' }, tenantSlug: 'tabsons' });
  assert.equal(revoked.revoked, true, 'session revocation should be recorded');
  const revokedCheck = svc.validateSessionScope({ sessionId: 'SES-CON-A' }, { tenantSlug: 'tabsons' });
  assert.equal(revokedCheck.allowed, false, 'revoked sessions must be invalidated');
  assert.ok(revokedCheck.failures.some(item => item.failureCode === 'SESSION_REVOKED'));

  const superAdminView = svc.getSessionGovernanceView({ actor: { role: 'super_admin', id: 'SA-1' }, tenantSlug: 'tabsons' });
  assert.ok(superAdminView.sessions.every(row => row.role !== 'platform_owner'), 'SUPER_ADMIN must not see platform owner sessions');
  assert.ok(superAdminView.sessions.every(row => !row.tenantSlug || row.tenantSlug === 'tabsons'), 'SUPER_ADMIN view must remain tenant-scoped');
  assert.ok(Object.isFrozen(superAdminView.sessions), 'session view list must be immutable');

  const platformView = svc.getSessionGovernanceView({ actor: { role: 'platform_owner', id: 'PO-1' } });
  assert.ok(platformView.summary.totalSessions >= superAdminView.summary.totalSessions, 'PLATFORM_OWNER governance view can see platform metadata');

  const malformed = svc.validateSessionScope('bad-input', { tenantSlug: 'tabsons' });
  assert.equal(malformed.allowed, false, 'malformed sessions should fail safely');

  const telemetry = global.WorkflowTelemetryService.getRecentTelemetry();
  assert.ok(telemetry.some(row => /SESSION_GOVERNANCE|SUSPICIOUS_ACCESS|SESSION_REVOKED/.test(row.eventType)), 'session governance should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /SESSION/.test(row.actionType || row.action || '')), 'session events should be audited safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.SESSION_GOVERNANCE_RECORDED, 'session governance should aggregate metrics safely');

  console.log('sessionGovernanceService.test.js passed');
}

main();
