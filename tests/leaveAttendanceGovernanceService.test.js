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

function seedLeaveAttendanceData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    defaultAnnualLeaveDays: 20
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', email: 'one@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1', leaveBalance: 5, shiftId: 'SH-A' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', email: 'two@example.com', role: 'EMPLOYEE', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1', leaveBalance: 12, shiftId: 'SH-A' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', leaveBalance: 9, shiftId: 'SH-A' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Tenant Employee', email: 'x@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', leaveBalance: 99, shiftId: 'SH-X' }
  ];
  data.shifts = [
    { id: 'SH-A', name: 'General Shift', tenantSlug: 'tabsons', department: 'Operations', startTime: '09:00', endTime: '18:00', graceMinutes: 10, workingHours: 8 },
    { id: 'SH-X', name: 'Other Tenant Shift', tenantSlug: 'abc', startTime: '10:00', endTime: '19:00', graceMinutes: 5 }
  ];
  data.holidays = [
    { id: 'HOL-1', tenantSlug: 'tabsons', date: '2026-05-01', name: 'Labour Day', region: 'IN' },
    { id: 'HOL-X', tenantSlug: 'abc', date: '2026-05-01', name: 'Other Tenant Holiday', region: 'IN', privateNote: 'abc only' }
  ];
  data.leaveRequests = [
    { id: 'LV-1', leaveId: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', leaveType: 'Casual Leave', type: 'Casual Leave', from: '2026-05-20', to: '2026-05-22', fromDate: '2026-05-20', toDate: '2026-05-22', totalDays: 3, status: 'Pending', managerStatus: 'Pending', hrStatus: 'Pending', finalStatus: 'Pending', reason: 'medical private note', appliedOn: '2026-05-18' },
    { id: 'LV-2', leaveId: 'LV-2', empId: 'EMP-2', tenantSlug: 'tabsons', leaveType: 'Sick Leave', type: 'Sick Leave', from: '2026-05-10', to: '2026-05-11', fromDate: '2026-05-10', toDate: '2026-05-11', totalDays: 2, status: 'Approved', managerStatus: 'Approved', hrStatus: 'Approved', finalStatus: 'Approved', reason: 'private illness', appliedOn: '2026-05-08' },
    { id: 'LV-X', leaveId: 'LV-X', empId: 'EMP-X', tenantSlug: 'abc', leaveType: 'Casual Leave', type: 'Casual Leave', from: '2026-05-25', to: '2026-05-26', fromDate: '2026-05-25', toDate: '2026-05-26', totalDays: 2, status: 'Pending', managerStatus: 'Pending', finalStatus: 'Pending', reason: 'Other Tenant private note', appliedOn: '2026-05-19' }
  ];
  data.attendance = [
    { id: 'AT-1', attendanceId: 'AT-1', empId: 'EMP-1', tenantSlug: 'tabsons', date: '2026-05-20', attendanceDate: '2026-05-20', shiftId: 'SH-A', checkIn: '09:25:00', checkOut: '18:00:00', lateMinutes: 15, status: 'Late', remarks: 'private family issue' },
    { id: 'AT-2', attendanceId: 'AT-2', empId: 'EMP-1', tenantSlug: 'tabsons', date: '2026-05-21', attendanceDate: '2026-05-21', shiftId: 'SH-A', checkIn: '09:30:00', checkOut: '', lateMinutes: 20, status: 'Late', remarks: 'private appointment' },
    { id: 'AT-3', attendanceId: 'AT-3', empId: 'EMP-1', tenantSlug: 'tabsons', date: '2026-05-22', attendanceDate: '2026-05-22', shiftId: 'SH-A', checkIn: '', checkOut: '', lateMinutes: 0, status: 'Absent', remarks: 'private note' },
    { id: 'AT-4', attendanceId: 'AT-4', empId: 'EMP-2', tenantSlug: 'tabsons', date: '2026-05-22', attendanceDate: '2026-05-22', shiftId: 'SH-A', checkIn: '08:55:00', checkOut: '21:15:00', lateMinutes: 0, status: 'Present', workingHours: '12:20' },
    { id: 'AT-X', attendanceId: 'AT-X', empId: 'EMP-X', tenantSlug: 'abc', date: '2026-05-22', attendanceDate: '2026-05-22', shiftId: 'SH-X', checkIn: '11:00:00', checkOut: '19:00:00', lateMinutes: 55, status: 'Late', remarks: 'Other Tenant private attendance' }
  ];
  data.attendanceRegularizations = [
    { id: 'REG-1', empId: 'EMP-1', tenantSlug: 'tabsons', date: '2026-05-21', status: 'Pending', reason: 'forgot checkout private note', createdOn: '2026-05-21' },
    { id: 'REG-X', empId: 'EMP-X', tenantSlug: 'abc', date: '2026-05-22', status: 'Pending', reason: 'Other Tenant correction', createdOn: '2026-05-22' }
  ];
  data.pendingActions = [];
  data.asyncJobs = [];
  data.leaveAttendanceAuditMarkers = [];
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
    'services/leaveService.js',
    'services/attendanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/leaveAttendanceGovernanceService.js');
  seedLeaveAttendanceData();

  const svc = global.LeaveAttendanceGovernanceService;
  assert.ok(svc, 'LeaveAttendanceGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.LEAVE_STATES), 'leave states must be immutable');
  assert.ok(Object.isFrozen(svc.ATTENDANCE_STATES), 'attendance states must be immutable');
  assert.equal(global.__ARTHHRMS_LEAVE_ATTENDANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyAttendanceRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant leave visibility is critical');
  assert.equal(svc.classifyAttendanceRisk({ unsafeOverlap: true }), 'HIGH_RISK', 'unsafe leave overlap is high risk');
  assert.equal(svc.classifyAttendanceRisk({ malformedAttendance: true }), 'WARNING', 'malformed attendance correction is warning risk');

  const employeeOwn = svc.validateLeaveScope({ tenantSlug: 'tabsons', empId: 'EMP-1', leaveId: 'LV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may see own leave scope');
  assert.equal(employeeOwn.visibility, 'OWN_LEAVE_ONLY');

  const managerTeam = svc.validateLeaveScope({ tenantSlug: 'tabsons', empId: 'EMP-1', leaveId: 'LV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team leave scope');
  assert.equal(managerTeam.visibility, 'TEAM_LEAVE_VISIBILITY');

  const superAdminEdit = svc.validateLeaveScope({ tenantSlug: 'tabsons', empId: 'EMP-1', leaveBalance: 99, editBalance: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminEdit.allowed, false, 'SUPER_ADMIN must not edit leave balances directly');
  assert.ok(superAdminEdit.failures.some(item => item.failureCode === 'SUPER_ADMIN_LEAVE_BALANCE_EDIT_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminEdit), /"leaveBalance"|99|private note/i, 'leave balance edit failure must be redacted');

  const platformScope = svc.validateLeaveScope({ tenantSlug: 'tabsons', empId: 'EMP-1', leaveId: 'LV-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in leave hierarchy');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_LEAVE_HIERARCHY_BLOCKED'));

  const crossTenant = svc.validateLeaveScope({ tenantSlug: 'abc', empId: 'EMP-X', leaveId: 'LV-X', reason: 'Other Tenant private note' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant leave visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /EMP-X|Other Tenant|private note|"leaveBalance"/i, 'cross-tenant failure must not leak private leave details');

  const validation = svc.validateLeaveRequest({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    leaveType: 'Casual Leave',
    from: '2026-05-21',
    to: '2026-05-30',
    totalDays: 10,
    approvalChain: [{ role: 'PLATFORM_OWNER' }],
    reason: 'medical private note'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(validation.success, false, 'unsafe leave request should require review');
  assert.ok(validation.failures.some(item => item.failureCode === 'OVERLAPPING_LEAVE_REQUEST'));
  assert.ok(validation.failures.some(item => item.failureCode === 'INSUFFICIENT_LEAVE_BALANCE'));
  assert.ok(validation.failures.some(item => item.failureCode === 'INVALID_APPROVAL_CHAIN'));
  assert.ok(Object.isFrozen(validation), 'leave validation output must be immutable');
  assert.doesNotMatch(JSON.stringify(validation), /medical private note|"leaveBalance"|"reason"/i, 'leave validation output must redact private notes and balances');

  const invalidDate = svc.validateLeaveRequest({ tenantSlug: 'tabsons', empId: 'EMP-1', leaveType: 'Bad Leave', from: '2026-06-10', to: '2026-06-01' }, { tenantSlug: 'tabsons' });
  assert.ok(invalidDate.failures.some(item => item.failureCode === 'INVALID_DATE_RANGE'), 'invalid date range must be detected');
  assert.ok(invalidDate.failures.some(item => item.failureCode === 'INVALID_LEAVE_TYPE'), 'invalid leave type must be detected');

  const attendancePayload = svc.normalizeAttendancePayload({
    tenantSlug: 'tabsons',
    records: [{ empId: 'EMP-1', date: '2026-05-22', status: 'Late', checkIn: '09:30:00', remarks: 'private appointment' }]
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(attendancePayload), 'attendance normalization output must be immutable');
  assert.doesNotMatch(JSON.stringify(attendancePayload), /private appointment|remarks/i, 'attendance normalization must redact private notes');

  const policy = svc.enforceAttendancePolicy({
    tenantSlug: 'tabsons',
    records: [
      { empId: 'EMP-1', tenantSlug: 'tabsons', date: '2026-05-23', shiftId: 'SH-A', checkIn: '09:45:00', checkOut: '18:00:00', status: 'Present' },
      { empId: 'EMP-2', tenantSlug: 'tabsons', date: '2026-05-23', shiftId: 'SH-X', checkIn: '09:00:00', checkOut: '22:30:00', status: 'Present', correctionReason: 'private correction' },
      { empId: 'EMP-X', tenantSlug: 'abc', date: '2026-05-23', shiftId: 'SH-X', checkIn: '11:00:00', status: 'Late' }
    ]
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(policy.success, false, 'policy enforcement should block unsafe attendance payloads');
  assert.ok(policy.failures.some(item => item.failureCode === 'ATTENDANCE_LATE_POLICY_VIOLATION'));
  assert.ok(policy.failures.some(item => item.failureCode === 'SHIFT_TENANT_MISMATCH'));
  assert.ok(policy.failures.some(item => item.failureCode === 'TENANT_MISMATCH'));
  assert.doesNotMatch(JSON.stringify(policy), /private correction|EMP-X|Other Tenant private/i, 'policy output must be redacted');

  const anomalies = svc.detectAttendanceAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(anomalies.success, true, 'attendance anomaly detection should run');
  assert.ok(anomalies.anomalies.some(item => item.anomalyType === 'REPEATED_LATENESS'));
  assert.ok(anomalies.anomalies.some(item => item.anomalyType === 'MISSING_CHECKOUT'));
  assert.ok(anomalies.anomalies.some(item => item.anomalyType === 'ABNORMAL_OVERTIME'));
  assert.doesNotMatch(JSON.stringify(anomalies), /private family|private appointment|Other Tenant|EMP-X/i, 'anomaly output must not leak private or cross-tenant details');

  const reminder = svc.scheduleApprovalGovernance({
    tenantSlug: 'tabsons',
    leaveId: 'LV-1',
    reminderType: 'MANAGER_REVIEW',
    schedule: { runAt: '2026-05-23T04:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(reminder.success, true, 'approval reminder governance should schedule');
  assert.equal(reminder.asyncJob?.success, true, 'approval governance should integrate with AsyncJobService');
  assert.ok(global.DB.get().asyncJobs.some(row => row.jobType === 'LEAVE_APPROVAL_REMINDER' && row.tenantSlug === 'tabsons'), 'approval reminder async job should be queued');

  const report = svc.generateLeaveAttendanceGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(report.success, true, 'governance report should generate');
  assert.ok(report.leaveProcessingHealth.totalLeaveRequests >= 2, 'leave processing health should be visible');
  assert.ok(report.attendanceAnomalies.totalAnomalies >= anomalies.anomalies.length, 'anomaly summaries should be visible');
  assert.ok(report.approvalGovernance.delayedApprovals >= 1, 'delayed approval visibility should be available');
  assert.ok(report.shiftGovernance.tenantScopedShifts >= 1, 'shift governance should be visible');
  assert.equal(report.visibility.superAdminBalanceEditingAllowed, false, 'SUPER_ADMIN direct balance editing must remain blocked');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /Other Tenant|EMP-X|private note|private appointment|"leaveBalance"|medical/i, 'report must filter private and cross-tenant leave/attendance data');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  delete global.AsyncJobService;
  delete global.NotificationOrchestrationService;
  const degraded = svc.scheduleApprovalGovernance({
    tenantSlug: 'tabsons',
    leaveId: 'LV-1',
    reminderType: 'MANAGER_REVIEW'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degraded.success, true, 'missing dependencies should degrade safely');
  assert.equal(degraded.asyncJob.success, false, 'missing async dependency should be represented without throwing');
  global.AsyncJobService = originalAsync;
  global.NotificationOrchestrationService = originalNotify;

  const malformed = svc.validateLeaveRequest(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed leave payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_LEAVE_PAYLOAD'));

  console.log('leaveAttendanceGovernanceService.test.js passed');
}

main();
