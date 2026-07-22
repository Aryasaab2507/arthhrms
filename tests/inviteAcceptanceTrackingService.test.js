const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Node invite conversion test', platform: 'Win32' };
  global.location = { hostname: 'tabsons.arthhrms.example', pathname: '/platform-control.html' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', email: 'employee@example.com', tenantSlug: 'tabsons', role: 'EMPLOYEE' },
    { id: 'EMP-2', empId: 'EMP-2', email: 'second@example.com', tenantSlug: 'tabsons', role: 'EMPLOYEE' },
    { id: 'HR-1', empId: 'HR-1', email: 'hr@example.com', tenantSlug: 'tabsons', role: 'HR' },
    { id: 'EMP-ABC', empId: 'EMP-ABC', email: 'secret@abc.example', tenantSlug: 'abc', role: 'EMPLOYEE' }
  ];
  data.inviteAcceptanceHistory = [
    { trackingId: 'IAT-ABC', invitationId: 'INV-ABC', tenantSlug: 'abc', employeeId: 'EMP-ABC', state: 'INVITE_DELIVERED', internalNote: 'ABC confidential', occurredAt: '2026-06-20T00:00:00.000Z', immutable: true }
  ];
  data.onboardingConversionHistory = [];
  data.onboardingReminderHistory = [];
  data.onboardingConversionAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function track(svc, invitationId, state, occurredAt, extra = {}, context) {
  return svc.trackInviteAcceptance({
    invitationId, tenantSlug: 'tabsons', employeeId: extra.employeeId || 'EMP-1', state, occurredAt,
    providerEventId: extra.providerEventId || `${invitationId}-${state}`,
    ...extra
  }, context);
}

async function main() {
  setupRuntime();
  load('db.js');
  load('services/auditService.js');
  seedData();
  global.__ARTHHRMS_DEV__ = false;
  load('services/validationRegistryService.js');

  const notificationHandoffs = [];
  load('services/notificationDeliveryTrackingService.js');
  const notificationService = global.NotificationDeliveryTrackingService;
  global.NotificationDeliveryTrackingService = {
    ...notificationService,
    trackNotificationDelivery(payload, context) {
      notificationHandoffs.push(payload);
      return notificationService.trackNotificationDelivery(payload, context);
    }
  };

  global.__ARTHHRMS_DEV__ = true;
  load('services/inviteAcceptanceTrackingService.js');
  const svc = global.InviteAcceptanceTrackingService;
  assert.ok(svc, 'InviteAcceptanceTrackingService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.INVITATION_STATES, [
    'INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED', 'INVITE_ACCEPTED',
    'ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'EMPLOYEE_ACTIVE', 'EXPIRED', 'FAILED', 'CANCELLED', 'REVOKED'
  ]);
  assert.equal(global.__ARTHHRMS_INVITE_ACCEPTANCE_SELF_TEST__.passed, true);
  [
    'trackInviteAcceptance', 'calculateConversionRate', 'detectOnboardingDropoff',
    'generateOnboardingInsights', 'calculateOnboardingHealth', 'getInviteOnboardingTimeline',
    'scheduleOnboardingReminder', 'freezeInviteTrackingOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const hrContext = {
    tenantSlug: 'tabsons', now: '2026-06-21T12:00:00.000Z',
    actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }
  };
  const employeeContext = {
    tenantSlug: 'tabsons', now: '2026-06-21T12:00:00.000Z',
    actor: { id: 'EMP-1', employeeId: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }
  };

  const lifecycle = [
    ['INVITE_CREATED', '2026-06-20T00:00:00.000Z'],
    ['INVITE_SENT', '2026-06-20T00:01:00.000Z'],
    ['INVITE_DELIVERED', '2026-06-20T00:02:00.000Z'],
    ['INVITE_OPENED', '2026-06-20T00:03:00.000Z'],
    ['INVITE_ACCEPTED', '2026-06-20T00:04:00.000Z'],
    ['ACTIVATION_STARTED', '2026-06-20T00:05:00.000Z'],
    ['PROFILE_COMPLETED', '2026-06-20T00:10:00.000Z'],
    ['EMPLOYEE_ACTIVE', '2026-06-20T00:15:00.000Z']
  ];
  for (const [state, occurredAt] of lifecycle) {
    const tracked = track(svc, 'INV-1', state, occurredAt, {}, hrContext);
    assert.equal(tracked.success, true, `${state} should be tracked`);
    assert.equal(tracked.timeline.currentState, state);
    assert.ok(Object.isFrozen(tracked) && Object.isFrozen(tracked.timeline));
    assert.doesNotMatch(JSON.stringify(tracked), /employee@example\.com|secret@abc|token/i, 'tracking output must not expose invitation secrets');
  }

  const beforeDuplicate = global.DB.get().inviteAcceptanceHistory.length + global.DB.get().onboardingConversionHistory.length;
  const duplicate = track(svc, 'INV-1', 'INVITE_ACCEPTED', '2026-06-20T00:04:00.000Z', {}, hrContext);
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.duplicatePrevented, true);
  assert.equal(global.DB.get().inviteAcceptanceHistory.length + global.DB.get().onboardingConversionHistory.length, beforeDuplicate);

  track(svc, 'INV-EXPIRED', 'INVITE_CREATED', '2026-06-01T00:00:00.000Z', { employeeId: 'EMP-2' }, hrContext);
  track(svc, 'INV-EXPIRED', 'EXPIRED', '2026-06-02T00:00:00.000Z', { employeeId: 'EMP-2' }, hrContext);
  const expiredAccept = track(svc, 'INV-EXPIRED', 'INVITE_ACCEPTED', '2026-06-03T00:00:00.000Z', { employeeId: 'EMP-2' }, hrContext);
  assert.equal(expiredAccept.success, false);
  assert.equal(expiredAccept.code, 'INVITE_EXPIRED');

  const invalidTransition = track(svc, 'INV-BAD-TRANSITION', 'PROFILE_COMPLETED', '2026-06-20T00:00:00.000Z', {}, hrContext);
  assert.equal(invalidTransition.success, false);
  assert.equal(invalidTransition.code, 'INVALID_INVITE_TRANSITION');
  const malformed = svc.trackInviteAcceptance('bad-payload', hrContext);
  assert.equal(malformed.success, false);
  assert.ok(Object.isFrozen(malformed));

  const crossTenant = svc.trackInviteAcceptance({ invitationId: 'INV-CROSS', tenantSlug: 'abc', employeeId: 'EMP-ABC', state: 'INVITE_CREATED' }, hrContext);
  assert.equal(crossTenant.success, false);
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  const employeeMutation = track(svc, 'INV-EMP-DENIED', 'INVITE_CREATED', '2026-06-20T00:00:00.000Z', {}, employeeContext);
  assert.equal(employeeMutation.success, false);
  assert.equal(employeeMutation.code, 'ONBOARDING_GOVERNANCE_DENIED');

  track(svc, 'INV-LATE', 'INVITE_CREATED', '2026-06-20T00:00:00.000Z', {}, hrContext);
  track(svc, 'INV-LATE', 'INVITE_SENT', '2026-06-20T00:01:00.000Z', {}, hrContext);
  track(svc, 'INV-LATE', 'FAILED', '2026-06-20T00:02:00.000Z', {}, hrContext);
  const late = track(svc, 'INV-LATE', 'INVITE_DELIVERED', '2026-06-20T00:05:00.000Z', { lateConfirmation: true }, hrContext);
  assert.equal(late.success, true);
  assert.equal(late.timeline.currentState, 'INVITE_DELIVERED');

  const staleRecords = [
    ['INV-NOT-OPENED', ['INVITE_CREATED', 'INVITE_SENT'], 'EMP-2'],
    ['INV-NOT-ACCEPTED', ['INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED'], 'EMP-2'],
    ['INV-ACTIVATION-ABANDONED', ['INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED', 'INVITE_ACCEPTED'], 'EMP-2'],
    ['INV-PROFILE-ABANDONED', ['INVITE_CREATED', 'INVITE_SENT', 'INVITE_DELIVERED', 'INVITE_OPENED', 'INVITE_ACCEPTED', 'ACTIVATION_STARTED'], 'EMP-2']
  ];
  staleRecords.forEach(([id, states, employeeId]) => states.forEach((state, index) => track(
    svc, id, state, `2026-06-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`, { employeeId }, hrContext
  )));

  const dropoffs = svc.detectOnboardingDropoff({ tenantSlug: 'tabsons', asOf: '2026-06-21T12:00:00.000Z' }, hrContext);
  assert.equal(dropoffs.success, true);
  ['INVITE_NOT_OPENED', 'INVITE_NOT_ACCEPTED', 'ACTIVATION_ABANDONED', 'PROFILE_COMPLETION_ABANDONED'].forEach(code => {
    assert.ok(dropoffs.bottlenecks.some(item => item.code === code), `${code} should be detected`);
  });
  assert.ok(dropoffs.bottlenecks.every(item => item.recommendation && item.recoveryRecommendation));

  const report = svc.calculateConversionRate({ tenantSlug: 'tabsons', asOf: '2026-06-21T12:00:00.000Z' }, hrContext);
  assert.equal(report.success, true);
  assert.equal(report.funnel.some(stage => stage.stage === 'SENT'), true);
  assert.ok(report.analytics.inviteAcceptanceRate >= 0 && report.analytics.inviteAcceptanceRate <= 100);
  assert.ok(report.analytics.activationRate >= 0 && report.analytics.activationRate <= 100);
  assert.ok(report.analytics.completionRate >= 0 && report.analytics.completionRate <= 100);
  assert.ok(report.analytics.abandonmentRate >= 0 && report.analytics.abandonmentRate <= 100);
  assert.ok(report.onboardingHealthScore >= 0 && report.onboardingHealthScore <= 100);
  assert.doesNotMatch(JSON.stringify(report), /INV-ABC|ABC confidential|secret@abc/i, 'analytics must remain tenant scoped');
  assert.ok(Object.isFrozen(report));
  assert.equal(svc.generateOnboardingInsights({ tenantSlug: 'tabsons' }, hrContext).success, true);
  assert.equal(svc.calculateOnboardingHealth({ tenantSlug: 'tabsons' }, hrContext).success, true);

  const employeeTimeline = svc.getInviteOnboardingTimeline({ invitationId: 'INV-1' }, employeeContext);
  assert.equal(employeeTimeline.success, true);
  const otherEmployeeTimeline = svc.getInviteOnboardingTimeline({ invitationId: 'INV-NOT-OPENED' }, employeeContext);
  assert.equal(otherEmployeeTimeline.success, false);
  assert.equal(svc.calculateConversionRate({ tenantSlug: 'tabsons' }, employeeContext).success, true);
  const platformReport = svc.calculateConversionRate({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons', governanceOnly: true,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' }
  });
  assert.equal(platformReport.success, false);
  assert.equal(platformReport.code, 'ONBOARDING_GOVERNANCE_DENIED');

  const scheduled = await svc.scheduleOnboardingReminder({ invitationId: 'INV-NOT-OPENED', action: 'REMINDER' }, hrContext);
  assert.equal(scheduled.success, true);
  assert.equal(scheduled.state, 'SCHEDULED');
  const duplicateReminder = await svc.scheduleOnboardingReminder({ invitationId: 'INV-NOT-OPENED', action: 'REMINDER' }, hrContext);
  assert.equal(duplicateReminder.duplicatePrevented, true);
  const missingAdapter = await svc.scheduleOnboardingReminder({ invitationId: 'INV-NOT-ACCEPTED', action: 'RESEND', sendNow: true }, hrContext);
  assert.equal(missingAdapter.success, false);
  assert.equal(missingAdapter.code, 'REMINDER_DELIVERY_ADAPTER_REQUIRED');
  const sentReminder = await svc.scheduleOnboardingReminder({
    invitationId: 'INV-NOT-ACCEPTED', action: 'EXPIRY_WARNING', sendNow: true,
    deliveryAdapter: () => ({ success: true, providerMessageId: 'REM-1' })
  }, hrContext);
  assert.equal(sentReminder.success, true);
  assert.equal(sentReminder.state, 'SENT');
  assert.ok(notificationHandoffs.some(item => item.source === 'INVITE_ACCEPTANCE_REMINDER'));
  const reminderDeliveryStates = global.DB.get().notificationDeliveryTrackingHistory
    .filter(item => item.notificationId === sentReminder.reminder.reminderId)
    .map(item => item.state);
  assert.deepEqual(reminderDeliveryStates, ['CREATED', 'QUEUED', 'PROCESSING', 'SENT']);
  const employeeReminder = await svc.scheduleOnboardingReminder({ invitationId: 'INV-NOT-OPENED', action: 'REMINDER' }, employeeContext);
  assert.equal(employeeReminder.code, 'ONBOARDING_GOVERNANCE_DENIED');
  const platformReminder = await svc.scheduleOnboardingReminder({ invitationId: 'INV-NOT-OPENED', action: 'REMINDER' }, {
    tenantSlug: 'tabsons', actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' }
  });
  assert.equal(platformReminder.code, 'ONBOARDING_GOVERNANCE_DENIED');

  global.__ARTHHRMS_DEV__ = false;
  load('services/inviteMailDeliveryService.js');
  const inviteResult = global.InviteMailDeliveryService.sendEmployeeInvite({
    tenantSlug: 'tabsons', employeeId: 'EMP-1', email: 'employee@example.com', name: 'Employee One'
  }, {
    tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' },
    providerAdapter: { provider: 'SMTP', send: () => ({ ok: true, providerMessageId: 'INV-MSG-1' }) }
  });
  assert.equal(inviteResult.success, true);
  const inviteHandoffStates = global.DB.get().inviteAcceptanceHistory
    .filter(row => row.invitationId === inviteResult.invitation.invitationId)
    .map(row => row.state);
  assert.ok(inviteHandoffStates.includes('INVITE_CREATED') && inviteHandoffStates.includes('INVITE_SENT'), 'invite delivery should hand off lifecycle states');

  load('services/authService.js');
  load('services/workflowTelemetryService.js');
  load('services/tenantIsolationService.js');
  load('services/employeeBulkImportService.js');
  load('services/excelValidationService.js');
  load('services/employeeActivationWizardService.js');
  const activationContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', email: 'employee@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }
  };
  const activationInput = { tenantSlug: 'tabsons', token: inviteResult.invitation.token, email: 'employee@example.com' };
  const started = global.EmployeeActivationWizardService.startActivationWizard(activationInput, activationContext);
  assert.equal(started.success, true, 'real activation wizard should start from a tracked invitation');
  const completed = global.EmployeeActivationWizardService.completeProfileSetup({
    ...activationInput,
    activationId: started.activation.activationId,
    password: 'StrongPass!123',
    confirmPassword: 'StrongPass!123',
    profile: {
      phoneNumber: '+919876543210',
      emergencyContact: { name: 'Emergency Contact', phone: '+919812341234' },
      departmentConfirmation: true,
      contactVerified: true,
      policyAcknowledged: true
    }
  }, activationContext);
  assert.equal(completed.success, true, 'profile completion should hand off after persistence');
  const finalized = global.EmployeeActivationWizardService.finalizeEmployeeActivation({
    ...activationInput,
    activationId: started.activation.activationId,
    password: 'StrongPass!123',
    confirmPassword: 'StrongPass!123'
  }, activationContext);
  assert.equal(finalized.success, true, 'final activation should hand off after authoritative completion');
  const producerStates = global.DB.get().inviteAcceptanceHistory
    .concat(global.DB.get().onboardingConversionHistory)
    .filter(row => row.invitationId === inviteResult.invitation.invitationId)
    .map(row => row.state);
  ['INVITE_OPENED', 'INVITE_ACCEPTED', 'ACTIVATION_STARTED', 'PROFILE_COMPLETED', 'EMPLOYEE_ACTIVE'].forEach(state => {
    assert.equal(producerStates.filter(item => item === state).length, 1, `${state} should be observed exactly once`);
  });

  const data = global.DB.get();
  assert.ok(data.inviteAcceptanceHistory.some(row => row.tenantSlug === 'tabsons'));
  assert.ok(data.onboardingConversionHistory.some(row => row.state === 'EMPLOYEE_ACTIVE'));
  assert.ok(data.onboardingReminderHistory.length >= 2);
  assert.ok(data.onboardingConversionAnalyticsHistory.length >= 1);
  assert.ok(data.auditLogs.some(row => /INVITE_(ACCEPTANCE|ONBOARDING|REMINDER|CONVERSION)/.test(String(row.actionType || row.action || row.type || ''))));
  const frozen = svc.freezeInviteTrackingOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));

  console.log('inviteAcceptanceTrackingService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
