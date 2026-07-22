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

function seedInvitationData() {
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
    { id: 'EMP-001', empId: 'EMP-001', employeeId: 'EMP-001', name: 'Asha Rao', email: 'asha.rao@example.com', role: 'employee', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-002', empId: 'EMP-002', employeeId: 'EMP-002', name: 'Ravi Shah', email: 'ravi.shah@example.com', role: 'employee', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-003', empId: 'EMP-003', employeeId: 'EMP-003', name: 'Nisha Patel', email: 'nisha.patel@example.com', role: 'employee', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-004', empId: 'EMP-004', employeeId: 'EMP-004', name: 'Omar Khan', email: 'omar.khan@example.com', role: 'employee', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Not Activated', inviteStatus: 'Not Invited' },
    { id: 'EMP-ACTIVE', empId: 'EMP-ACTIVE', employeeId: 'EMP-ACTIVE', name: 'Active User', email: 'active@example.com', role: 'employee', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', activationStatus: 'Active', authUserId: 'AUTH-1', inviteStatus: 'Activated' },
    { id: 'ABC-001', empId: 'ABC-001', employeeId: 'ABC-001', name: 'Other Tenant', email: 'other@example.com', role: 'employee', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 900000, leaveBalance: 30 }
  ];
  data.users = [];
  data.authInvites = [];
  data.employeeInvitationRecords = [];
  data.invitationDeliveryLogs = [];
  data.invitationActivationHistory = [];
  data.invitationAnalyticsReports = [];
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
    'services/tenantIsolationService.js',
    'services/employeeBulkImportService.js',
    'services/excelValidationService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/inviteMailDeliveryService.js');
  seedInvitationData();

  const svc = global.InviteMailDeliveryService;
  assert.ok(svc, 'InviteMailDeliveryService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_INVITE_MAIL_SELF_TEST__.passed, true, 'development self-test should cover invitation failure cases');

  ['generateInvitationToken', 'createEmployeeInvite', 'sendEmployeeInvite', 'validateInvitationToken', 'calculateInvitationReadiness', 'freezeInvitationOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const context = { actor: { id: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const beforeUsers = JSON.stringify(global.DB.get().users);
  const beforeEmployees = JSON.stringify(global.DB.get().employees);

  const token = svc.generateInvitationToken({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com' }, context);
  assert.equal(token.success, true, 'token generation should work');
  assert.ok(/^ivt_[A-Za-z0-9_-]{32,}$/.test(token.token), 'token should be non-guessable and URL safe');
  assert.equal(token.tenantSlug, 'tabsons');
  assert.ok(Object.isFrozen(token), 'token output must be immutable');

  const created = svc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com', name: 'Asha Rao', role: 'employee' }, context);
  assert.equal(created.success, true, 'HR should create an invite');
  assert.equal(created.invitation.state, 'CREATED');
  assert.ok(created.invitation.activationUrl.includes('token='), 'activation URL should include token');
  assert.equal(created.invitation.singleUse, true, 'tokens must be single use');
  assert.equal(created.noActiveUserCreation, true, 'invite creation must not activate users');
  assert.equal(JSON.stringify(global.DB.get().users), beforeUsers, 'invite creation must not create active users');
  assert.equal(JSON.stringify(global.DB.get().employees), beforeEmployees, 'invite creation must not mutate employee records');
  assert.ok(Object.isFrozen(created), 'created invite output must be immutable');

  const sent = svc.sendEmployeeInvite({
    tenantSlug: 'tabsons',
    employeeId: 'EMP-002',
    email: 'ravi.shah@example.com',
    name: 'Ravi Shah',
    role: 'employee'
  }, {
    ...context,
    providerAdapter: {
      provider: 'SMTP',
      send(message) {
        return { ok: true, providerMessageId: `MSG-${message.to}` };
      }
    }
  });
  assert.equal(sent.success, true, 'email delivery should work through provider abstraction');
  assert.equal(sent.invitation.state, 'SENT');
  assert.equal(sent.delivery.provider, 'SMTP');
  assert.equal(sent.delivery.status, 'SENT');
  assert.equal(sent.noActiveUserCreation, true);

  const bulk = svc.createBulkInvites({
    tenantSlug: 'tabsons',
    mode: 'selected',
    employees: [
      { employeeId: 'EMP-003', email: 'nisha.patel@example.com', name: 'Nisha Patel' },
      { employeeId: 'EMP-004', email: 'omar.khan@example.com', name: 'Omar Khan' },
      { employeeId: 'BAD-EMAIL', email: 'bad-email', name: 'Bad Email' },
      { employeeId: 'ABC-001', email: 'other@example.com', name: 'Other Tenant' }
    ]
  }, context);
  assert.equal(bulk.success, true, 'bulk invitation workflow should complete with row-level failures');
  assert.equal(bulk.summary.totalRows, 4);
  assert.equal(bulk.summary.created, 2);
  assert.equal(bulk.summary.failed, 2);
  assert.ok(bulk.failures.some(item => item.code === 'INVALID_INVITATION_EMAIL'));
  assert.ok(bulk.failures.some(item => item.code === 'CROSS_TENANT_INVITATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(bulk), /900000|leaveBalance|salary|other@example\.com/i, 'cross-tenant invitation data must not leak');

  const readiness = svc.calculateInvitationReadiness({ tenantSlug: 'tabsons', employees: [{ employeeId: 'EMP-001', email: 'asha.rao@example.com' }, { employeeId: 'BAD', email: 'bad-email' }] }, context);
  assert.equal(readiness.success, true, 'readiness scoring should complete');
  assert.ok(readiness.invitationReadinessScore < 100, 'bad rows should reduce readiness');
  assert.ok(readiness.deliveryScore <= 100);
  assert.ok(Object.isFrozen(readiness), 'readiness output must be immutable');

  const validToken = svc.validateInvitationToken({ token: created.invitation.token, tenantSlug: 'tabsons', email: 'asha.rao@example.com' }, context);
  assert.equal(validToken.success, true, 'token validation should accept matching tenant and owner');
  assert.equal(validToken.activationAllowed, true);

  const crossTenantToken = svc.validateInvitationToken({ token: created.invitation.token, tenantSlug: 'abc', email: 'asha.rao@example.com' }, { actor: { id: 'HR-ABC', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenantToken.success, false, 'cross-tenant token validation must be blocked');
  assert.ok(crossTenantToken.failures.some(item => item.code === 'CROSS_TENANT_ACTIVATION_BLOCKED'));

  const opened = svc.trackInvitationEvent({ token: created.invitation.token, tenantSlug: 'tabsons', eventType: 'OPENED', email: 'asha.rao@example.com' }, context);
  assert.equal(opened.success, true, 'activation tracking should record opened events');
  assert.equal(opened.invitation.state, 'OPENED');

  const activated = svc.trackInvitationEvent({ token: created.invitation.token, tenantSlug: 'tabsons', eventType: 'ACTIVATED', email: 'asha.rao@example.com', activationOwnerId: 'EMP-001' }, context);
  assert.equal(activated.success, true, 'activation tracking should mark token as used');
  assert.equal(activated.invitation.state, 'ACTIVATED');
  assert.equal(activated.invitation.used, true);

  const replay = svc.validateInvitationToken({ token: created.invitation.token, tenantSlug: 'tabsons', email: 'asha.rao@example.com' }, context);
  assert.equal(replay.success, false, 'reused tokens must be blocked');
  assert.ok(replay.failures.some(item => item.code === 'INVITATION_TOKEN_REUSED'));

  const expired = svc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com', expiresAt: '2020-01-01T00:00:00.000Z' }, context);
  const expiredValidation = svc.validateInvitationToken({ token: expired.invitation.token, tenantSlug: 'tabsons', email: 'asha.rao@example.com' }, context);
  assert.equal(expiredValidation.success, false, 'expired invitations must be blocked');
  assert.ok(expiredValidation.failures.some(item => item.code === 'INVITATION_EXPIRED'));

  const duplicate = svc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com' }, context);
  assert.equal(duplicate.success, false, 'duplicate active invitations should be blocked');
  assert.ok(duplicate.failures.some(item => item.code === 'DUPLICATE_ACTIVE_INVITATION'));

  const employeeBlocked = svc.createEmployeeInvite({ tenantSlug: 'tabsons', employeeId: 'EMP-001', email: 'asha.rao@example.com' }, { actor: { id: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' });
  assert.equal(employeeBlocked.success, false, 'employees cannot access invitation governance');
  assert.ok(employeeBlocked.failures.some(item => item.code === 'ROLE_INVITATION_ACCESS_BLOCKED'));

  const directorVisibility = svc.generateInvitationAnalytics({ tenantSlug: 'tabsons' }, { actor: { id: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons', reviewOnly: true });
  assert.equal(directorVisibility.success, true, 'director can review invitation analytics');
  assert.equal(directorVisibility.governance.reviewOnly, true);

  const platformVisibility = svc.generateInvitationAnalytics({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformVisibility.success, true, 'platform owner can review governance visibility only');
  assert.equal(platformVisibility.governance.platformOwnerVisibilityOnly, true);

  const cancelled = svc.cancelEmployeeInvite({ invitationId: sent.invitation.invitationId, tenantSlug: 'tabsons' }, context);
  assert.equal(cancelled.success, true, 'HR can cancel invites');
  assert.equal(cancelled.invitation.state, 'CANCELLED');

  const data = global.DB.get();
  assert.ok(data.employeeInvitationRecords.length >= 1, 'immutable invitation history should be stored');
  assert.ok(data.invitationDeliveryLogs.length >= 1, 'immutable delivery history should be stored');
  assert.ok(data.invitationActivationHistory.length >= 1, 'immutable activation history should be stored');
  assert.ok(data.invitationAnalyticsReports.length >= 1, 'immutable analytics history should be stored');
  assert.ok(global.DB.getAuditLogs().some(row => /INVITATION_/.test(row.actionType || row.action || '')), 'invitation actions should be audited');
}

main();
