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
  global.navigator = { userAgent: 'Node employee lifecycle test', platform: 'Win32' };
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
    { id: 'EMP-INV', empId: 'EMP-INV', name: 'Invited Employee', email: 'invited@example.com', tenantSlug: 'tabsons', department: 'Operations', managerId: 'MGR-1', role: 'EMPLOYEE', status: 'INVITED' },
    { id: 'EMP-A', empId: 'EMP-A', name: 'Active Employee', email: 'active@example.com', tenantSlug: 'tabsons', department: 'Operations', managerId: 'MGR-1', role: 'EMPLOYEE', status: 'ACTIVE' },
    { id: 'EMP-P', empId: 'EMP-P', name: 'Probation Employee', email: 'probation@example.com', tenantSlug: 'tabsons', department: 'HR', managerId: 'MGR-2', role: 'EMPLOYEE', status: 'PROBATION' },
    { id: 'EMP-T', empId: 'EMP-T', name: 'Terminal Employee', email: 'terminal@example.com', tenantSlug: 'tabsons', department: 'Operations', managerId: 'MGR-1', role: 'EMPLOYEE', status: 'ACTIVE' },
    { id: 'EMP-ACT', empId: 'EMP-ACT', name: 'Activation Employee', email: 'activation@example.com', tenantSlug: 'tabsons', department: 'Operations', designation: 'Analyst', managerId: 'MGR-1', role: 'EMPLOYEE', status: 'INVITED' },
    { id: 'MGR-1', empId: 'MGR-1', name: 'Operations Manager', tenantSlug: 'tabsons', department: 'Operations', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'MGR-2', empId: 'MGR-2', name: 'HR Manager', tenantSlug: 'tabsons', department: 'HR', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'HR-1', empId: 'HR-1', name: 'HR Owner', tenantSlug: 'tabsons', department: 'HR', role: 'HR', status: 'ACTIVE' },
    { id: 'ABC-1', empId: 'ABC-1', name: 'ABC Confidential Employee', email: 'secret@abc.example', tenantSlug: 'abc', department: 'Finance', role: 'EMPLOYEE', status: 'ACTIVE', salary: 999999, leaveBalance: 44 }
  ];
  data.employeeLifecycleCurrent = [
    { lifecycleId: 'LIFE-ABC', tenantSlug: 'abc', employeeId: 'ABC-1', currentStatus: 'ACTIVE', version: 3, internalNote: 'ABC confidential' }
  ];
  data.employeeLifecycleHistory = [
    { lifecycleHistoryId: 'LH-ABC', tenantSlug: 'abc', employeeId: 'ABC-1', oldStatus: 'PROBATION', newStatus: 'ACTIVE', transitionReason: 'ABC confidential', timestamp: '2026-01-01T00:00:00.000Z', immutable: true }
  ];
  data.employeeStatusHistory = [];
  data.employeeEmploymentEventHistory = [];
  data.employeeLifecycleEvents = [
    { eventId: 'EVT-ABC', tenantSlug: 'abc', employeeId: 'ABC-1', eventType: 'PROMOTION', notes: 'ABC confidential', immutable: true }
  ];
  data.employeeLifecycleAnalyticsHistory = [];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-A', status: 'APPROVED', from: '2026-06-20', to: '2026-06-22', leaveType: 'CASUAL LEAVE' }
  ];
  data.auditLogs = [];
  global.DB.save(data);
}

function approval(overrides = {}) {
  return { approved: true, approverId: 'DIR-1', approverRole: 'DIRECTOR', approvedAt: '2026-06-21T08:00:00.000Z', ...overrides };
}

function transition(svc, employeeId, newStatus, context, extra = {}) {
  return svc.changeEmployeeStatus({
    tenantSlug: 'tabsons', employeeId, newStatus,
    transitionReason: extra.transitionReason || `Governed transition to ${newStatus}`,
    supportingNotes: extra.supportingNotes || 'Reviewed by workforce operations.',
    ...extra
  }, context);
}

function main() {
  setupRuntime();
  load('db.js');
  load('services/auditService.js');
  seedData();
  global.__ARTHHRMS_DEV__ = false;
  load('services/validationRegistryService.js');
  load('services/leaveAttendanceGovernanceService.js');
  load('services/payrollGovernanceService.js');
  load('services/predictiveWorkforceAnalyticsService.js');

  global.__ARTHHRMS_DEV__ = true;
  load('services/employeeStatusLifecycleService.js');
  const svc = global.EmployeeStatusLifecycleService;
  assert.ok(svc, 'EmployeeStatusLifecycleService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.EMPLOYEE_STATES, [
    'INVITED', 'ACTIVATING', 'ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE',
    'SUSPENDED', 'TERMINATED', 'RESIGNED', 'RETIRED', 'ARCHIVED'
  ]);
  assert.deepEqual(svc.EMPLOYMENT_EVENTS, [
    'JOINING', 'CONFIRMATION', 'PROMOTION', 'TRANSFER', 'LEAVE_STARTED', 'LEAVE_RETURNED',
    'SUSPENSION', 'RESIGNATION', 'TERMINATION', 'RETIREMENT'
  ]);
  assert.equal(global.__ARTHHRMS_EMPLOYEE_LIFECYCLE_SELF_TEST__.passed, true);
  [
    'validateLifecycleTransition', 'changeEmployeeStatus', 'recordEmploymentEvent',
    'generateLifecycleTimeline', 'calculateWorkforceStability', 'freezeLifecycleOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const leaveIntegrationReport = global.LeaveAttendanceGovernanceService.generateLeaveAttendanceGovernanceReport(
    { tenantSlug: 'tabsons' },
    { tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }
  );
  assert.equal(leaveIntegrationReport.lifecycleIntegration.employeeStatusLifecycleAvailable, true);
  assert.equal(leaveIntegrationReport.lifecycleIntegration.mode, 'ADVISORY_ONLY');
  assert.equal(leaveIntegrationReport.lifecycleIntegration.automaticStatusChanges, false);

  const hrContext = { tenantSlug: 'tabsons', now: '2026-06-21T10:00:00.000Z', actor: { id: 'HR-1', empId: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } };
  const directorContext = { tenantSlug: 'tabsons', actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' } };
  const managerContext = { tenantSlug: 'tabsons', actor: { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons' } };
  const employeeContext = { tenantSlug: 'tabsons', actor: { id: 'EMP-A', empId: 'EMP-A', employeeId: 'EMP-A', role: 'EMPLOYEE', tenantSlug: 'tabsons' } };
  const platformContext = { tenantSlug: 'tabsons', governanceOnly: true, actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' } };

  const validation = svc.validateLifecycleTransition({ tenantSlug: 'tabsons', employeeId: 'EMP-INV', oldStatus: 'INVITED', newStatus: 'ACTIVATING', transitionReason: 'Activation started' }, hrContext);
  assert.equal(validation.success, true);
  assert.equal(validation.allowed, true);
  assert.ok(Object.isFrozen(validation));
  assert.equal(svc.validateLifecycleTransition('bad-payload', hrContext).success, false);

  const activating = transition(svc, 'EMP-INV', 'ACTIVATING', hrContext, { expectedVersion: 0, transitionReason: 'Invitation accepted and activation started' });
  assert.equal(activating.success, true);
  assert.equal(activating.transition.oldStatus, 'INVITED');
  assert.equal(activating.transition.newStatus, 'ACTIVATING');
  assert.equal(activating.current.version, 1);
  assert.equal(global.DB.get().employees.find(row => row.id === 'EMP-INV').status, 'ACTIVATING');
  assert.ok(Object.isFrozen(activating) && Object.isFrozen(activating.transition));
  assert.doesNotMatch(JSON.stringify(activating), /salary|leaveBalance|secret@abc|ABC confidential/i);

  const historyBeforeDuplicate = global.DB.get().employeeLifecycleHistory.length;
  const duplicate = transition(svc, 'EMP-INV', 'ACTIVATING', hrContext, { expectedVersion: 1 });
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.code, 'DUPLICATE_LIFECYCLE_TRANSITION');
  assert.equal(global.DB.get().employeeLifecycleHistory.length, historyBeforeDuplicate);

  const stale = transition(svc, 'EMP-INV', 'ACTIVE', hrContext, { expectedVersion: 0 });
  assert.equal(stale.success, false);
  assert.equal(stale.code, 'CONCURRENT_LIFECYCLE_UPDATE');
  const active = transition(svc, 'EMP-INV', 'ACTIVE', hrContext, { expectedVersion: 1, transitionReason: 'Activation completed' });
  assert.equal(active.success, true);
  assert.equal(active.current.version, 2);
  const invalid = transition(svc, 'EMP-INV', 'INVITED', hrContext, { expectedVersion: 2 });
  assert.equal(invalid.success, false);
  assert.equal(invalid.code, 'INVALID_LIFECYCLE_TRANSITION');
  assert.equal(global.DB.get().employees.find(row => row.id === 'EMP-INV').status, 'ACTIVE');

  const missingApproval = transition(svc, 'EMP-A', 'SUSPENDED', hrContext);
  assert.equal(missingApproval.success, false);
  assert.equal(missingApproval.code, 'DIRECTOR_APPROVAL_REQUIRED');
  const suspended = transition(svc, 'EMP-A', 'SUSPENDED', hrContext, { approval: approval(), expectedVersion: 0, transitionReason: 'Policy investigation' });
  assert.equal(suspended.success, true);
  assert.equal(suspended.transition.approval.approverRole, 'DIRECTOR');
  const restored = transition(svc, 'EMP-A', 'ACTIVE', hrContext, { approval: approval({ approvedAt: '2026-06-21T09:00:00.000Z' }), expectedVersion: 1, transitionReason: 'Investigation resolved' });
  assert.equal(restored.success, true);

  const onLeave = transition(svc, 'EMP-A', 'ON_LEAVE', hrContext, { expectedVersion: 2, leaveRequestId: 'LV-1', transitionReason: 'Approved leave commenced' });
  assert.equal(onLeave.success, true);
  assert.equal(onLeave.integrations.leaveGovernance.mode, 'ADVISORY_VALIDATION');
  assert.equal(onLeave.integrations.noWorkflowExecution, true);
  const leaveReturn = transition(svc, 'EMP-A', 'ACTIVE', hrContext, { expectedVersion: 3, transitionReason: 'Returned from approved leave' });
  assert.equal(leaveReturn.success, true);

  const confirmed = transition(svc, 'EMP-P', 'CONFIRMED', hrContext, { expectedVersion: 0, transitionReason: 'Probation successfully completed' });
  assert.equal(confirmed.success, true);
  const resigned = transition(svc, 'EMP-T', 'RESIGNED', hrContext, { approval: approval(), expectedVersion: 0, transitionReason: 'Employee resignation accepted' });
  assert.equal(resigned.success, true);
  const archived = transition(svc, 'EMP-T', 'ARCHIVED', hrContext, { approval: approval(), expectedVersion: 1, transitionReason: 'Offboarding record archived' });
  assert.equal(archived.success, true);

  const managerDenied = transition(svc, 'EMP-INV', 'ON_LEAVE', managerContext, { expectedVersion: 2 });
  assert.equal(managerDenied.code, 'LIFECYCLE_GOVERNANCE_DENIED');
  const directorDenied = transition(svc, 'EMP-INV', 'ON_LEAVE', directorContext, { expectedVersion: 2 });
  assert.equal(directorDenied.code, 'LIFECYCLE_GOVERNANCE_DENIED');
  const employeeDenied = transition(svc, 'EMP-A', 'SUSPENDED', employeeContext, { approval: approval() });
  assert.equal(employeeDenied.code, 'LIFECYCLE_GOVERNANCE_DENIED');
  const employeeValidationProbe = svc.validateLifecycleTransition({ tenantSlug: 'tabsons', employeeId: 'EMP-INV', newStatus: 'ON_LEAVE', transitionReason: 'probe' }, employeeContext);
  assert.equal(employeeValidationProbe.code, 'LIFECYCLE_GOVERNANCE_DENIED');
  const managerValidationProbe = svc.validateLifecycleTransition({ tenantSlug: 'tabsons', employeeId: 'EMP-INV', newStatus: 'ON_LEAVE', transitionReason: 'probe' }, managerContext);
  assert.equal(managerValidationProbe.code, 'LIFECYCLE_GOVERNANCE_DENIED');

  const untrustedIntegration = svc.changeEmployeeStatus({
    tenantSlug: 'tabsons', employeeId: 'EMP-A', newStatus: 'SUSPENDED',
    transitionReason: 'Untrusted integration attempt.', approval: approval(), source: 'UNTRUSTED_MODULE'
  }, { ...employeeContext, systemIntegration: true, source: 'UNTRUSTED_MODULE' });
  assert.equal(untrustedIntegration.success, false);
  assert.equal(untrustedIntegration.code, 'LIFECYCLE_GOVERNANCE_DENIED');

  const integrationEvent = svc.recordEmploymentEvent({
    tenantSlug: 'tabsons', employeeId: 'EMP-A', eventType: 'PROMOTION',
    transitionReason: 'Integration event attempt.', source: 'EMPLOYEE_ACTIVATION'
  }, { ...employeeContext, systemIntegration: true, source: 'EMPLOYEE_ACTIVATION' });
  assert.equal(integrationEvent.success, false);
  assert.equal(integrationEvent.code, 'LIFECYCLE_GOVERNANCE_DENIED');

  const crossTenant = svc.changeEmployeeStatus({ tenantSlug: 'abc', employeeId: 'ABC-1', newStatus: 'SUSPENDED', transitionReason: 'unsafe', approval: approval() }, hrContext);
  assert.equal(crossTenant.success, false);
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ABC Confidential|999999|leaveBalance|secret@abc/i);

  const promotion = svc.recordEmploymentEvent({ tenantSlug: 'tabsons', employeeId: 'EMP-INV', eventType: 'PROMOTION', transitionReason: 'Promoted to Senior Analyst', supportingNotes: 'Effective next cycle.' }, hrContext);
  assert.equal(promotion.success, true);
  assert.equal(promotion.event.eventType, 'PROMOTION');
  const transfer = svc.recordEmploymentEvent({ tenantSlug: 'tabsons', employeeId: 'EMP-INV', eventType: 'TRANSFER', transitionReason: 'Transferred to Strategy', supportingNotes: 'Approved workforce movement.' }, hrContext);
  assert.equal(transfer.success, true);
  const malformedEvent = svc.recordEmploymentEvent(null, hrContext);
  assert.equal(malformedEvent.success, false);
  assert.ok(Object.isFrozen(malformedEvent));

  const timeline = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-INV' }, hrContext);
  assert.equal(timeline.success, true);
  assert.ok(timeline.timeline.some(row => row.type === 'STATUS_TRANSITION'));
  assert.ok(timeline.timeline.some(row => row.type === 'EMPLOYMENT_EVENT'));
  assert.ok(timeline.timeline.every((row, index, list) => index === 0 || Date.parse(list[index - 1].timestamp) <= Date.parse(row.timestamp)));
  assert.ok(Object.isFrozen(timeline));

  const managerTimeline = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-INV' }, managerContext);
  assert.equal(managerTimeline.success, true);
  const managerOtherTeam = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-P' }, managerContext);
  assert.equal(managerOtherTeam.success, false);
  const ownTimeline = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-A' }, employeeContext);
  assert.equal(ownTimeline.success, true);
  const employeeOther = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-INV' }, employeeContext);
  assert.equal(employeeOther.success, false);

  const analytics = svc.calculateWorkforceStability({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true);
  assert.ok(analytics.analytics.activeEmployees >= 1);
  assert.ok(analytics.analytics.probationEmployees >= 0);
  assert.ok(analytics.analytics.resignations >= 1);
  assert.ok(analytics.analytics.leaveMovements >= 1);
  assert.ok(analytics.workforceStabilityScore >= 0 && analytics.workforceStabilityScore <= 100);
  assert.ok(analytics.retentionScore >= 0 && analytics.retentionScore <= 100);
  assert.ok(analytics.lifecycleHealthScore >= 0 && analytics.lifecycleHealthScore <= 100);
  assert.equal(analytics.integrations.workforceAnalytics.mode, 'TENANT_SCOPED_INPUT');
  assert.equal(analytics.integrations.payrollGovernance.mode, 'PREPARED_ONLY');
  assert.doesNotMatch(JSON.stringify(analytics), /ABC-1|ABC confidential|999999|secret@abc/i);

  const platformAnalytics = svc.calculateWorkforceStability({ tenantSlug: 'tabsons' }, platformContext);
  assert.equal(platformAnalytics.success, false);
  assert.equal(platformAnalytics.code, 'LIFECYCLE_VISIBILITY_DENIED');
  const platformTimeline = svc.generateLifecycleTimeline({ tenantSlug: 'tabsons', employeeId: 'EMP-INV' }, platformContext);
  assert.equal(platformTimeline.success, false);
  assert.equal(platformTimeline.code, 'LIFECYCLE_VISIBILITY_DENIED');

  const data = global.DB.get();
  assert.ok(data.employeeLifecycleHistory.length > historyBeforeDuplicate);
  assert.ok(data.employeeStatusHistory.length >= 1);
  assert.ok(data.employeeEmploymentEventHistory.length >= 2);
  assert.ok(data.employeeLifecycleEvents.some(row => row.eventType === 'PROMOTION' && row.tenantSlug === 'tabsons'));
  assert.ok(data.employeeLifecycleAnalyticsHistory.length >= 1);
  assert.ok(data.auditLogs.some(row => /EMPLOYEE_(STATUS|LIFECYCLE|EMPLOYMENT_EVENT)/.test(String(row.actionType || row.action || row.type || ''))));
  const frozen = svc.freezeLifecycleOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));

  global.__ARTHHRMS_DEV__ = false;
  load('services/authService.js');
  load('services/workflowTelemetryService.js');
  load('services/tenantIsolationService.js');
  load('services/employeeBulkImportService.js');
  load('services/excelValidationService.js');
  load('services/inviteMailDeliveryService.js');
  load('services/employeeActivationWizardService.js');
  const invite = global.InviteMailDeliveryService.createEmployeeInvite({
    tenantSlug: 'tabsons', employeeId: 'EMP-ACT', email: 'activation@example.com', name: 'Activation Employee'
  }, hrContext);
  assert.equal(invite.success, true);
  const activationContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'EMP-ACT', empId: 'EMP-ACT', employeeId: 'EMP-ACT', email: 'activation@example.com', role: 'EMPLOYEE', tenantSlug: 'tabsons' }
  };
  const employeeBeforeStart = JSON.stringify(global.DB.get().employees.find(row => row.id === 'EMP-ACT'));
  const started = global.EmployeeActivationWizardService.startActivationWizard({
    tenantSlug: 'tabsons', token: invite.invitation.token, email: 'activation@example.com'
  }, activationContext);
  assert.equal(started.success, true);
  assert.equal(JSON.stringify(global.DB.get().employees.find(row => row.id === 'EMP-ACT')), employeeBeforeStart, 'activation observation must not mutate employee master before finalization');
  assert.equal(global.DB.get().employeeLifecycleCurrent.find(row => row.employeeId === 'EMP-ACT').currentStatus, 'ACTIVATING');
  const completedProfile = global.EmployeeActivationWizardService.completeProfileSetup({
    tenantSlug: 'tabsons', activationId: started.activation.activationId,
    token: invite.invitation.token, email: 'activation@example.com',
    password: 'StrongPass!123', confirmPassword: 'StrongPass!123',
    profile: {
      phoneNumber: '+919876543210', emergencyContact: { name: 'Emergency Contact', phone: '+919812341234' },
      departmentConfirmation: true, contactVerified: true, policyAcknowledged: true
    }
  }, activationContext);
  assert.equal(completedProfile.success, true);
  assert.equal(global.DB.get().employeeLifecycleCurrent.find(row => row.employeeId === 'EMP-ACT').currentStatus, 'ACTIVATING', 'profile completion must not mark the employee active');
  const finalized = global.EmployeeActivationWizardService.finalizeEmployeeActivation({
    tenantSlug: 'tabsons', activationId: started.activation.activationId,
    token: invite.invitation.token, email: 'activation@example.com',
    password: 'StrongPass!123', confirmPassword: 'StrongPass!123'
  }, activationContext);
  assert.equal(finalized.success, true);
  const activationLifecycle = global.DB.get().employeeLifecycleHistory.filter(row => row.employeeId === 'EMP-ACT');
  assert.deepEqual(activationLifecycle.map(row => row.newStatus), ['ACTIVATING', 'ACTIVE']);
  assert.equal(global.DB.get().employees.find(row => row.id === 'EMP-ACT').status, 'ACTIVE');

  console.log('employeeStatusLifecycleService.test.js passed');
}

main();
