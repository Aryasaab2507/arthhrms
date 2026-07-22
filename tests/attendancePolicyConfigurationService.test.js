const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

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
  global.navigator = { userAgent: 'Node attendance policy configuration test', platform: 'Win32' };
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

function seedAttendancePolicyData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    country: 'IN',
    timezone: 'Asia/Kolkata'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha Rao', email: 'asha@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', shiftId: 'SH-GEN', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Ravi HR', email: 'ravi@example.com', role: 'HR', department: 'HR', businessUnit: 'People', branch: 'Mumbai', location: 'Mumbai', employeeGrade: 'G6', employmentType: 'FULL_TIME', shiftId: 'SH-HYB', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G8', employmentType: 'FULL_TIME', shiftId: 'SH-GEN', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'EMPLOYEE', department: 'Finance', businessUnit: 'Finance', branch: 'ABC HQ', location: 'Delhi', employeeGrade: 'G5', employmentType: 'FULL_TIME', shiftId: 'SH-ABC', salary: 999999, leaveBalance: 99, privateNote: 'ABC confidential attendance policy data', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.shifts = [
    { id: 'SH-GEN', shiftId: 'SH-GEN', name: 'General Shift', startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata', tenantSlug: 'tabsons' },
    { id: 'SH-HYB', shiftId: 'SH-HYB', name: 'Hybrid Shift', startTime: '10:00', endTime: '19:00', timezone: 'Asia/Kolkata', tenantSlug: 'tabsons' },
    { id: 'SH-NIGHT', shiftId: 'SH-NIGHT', name: 'Night Shift', startTime: '22:00', endTime: '06:00', timezone: 'Asia/Kolkata', tenantSlug: 'tabsons' },
    { id: 'SH-ABC', shiftId: 'SH-ABC', name: 'ABC Private Shift', startTime: '08:00', endTime: '17:00', timezone: 'Asia/Kolkata', tenantSlug: 'abc', confidentialNotes: 'ABC confidential shift' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-07-01', checkIn: '09:25', checkOut: '18:05', status: 'Late', lateMinutes: 15 },
    { attendanceId: 'ATT-2', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-07-02', checkIn: '09:00', checkOut: '15:30', status: 'Early Exit', earlyExitMinutes: 120 },
    { attendanceId: 'ATT-3', tenantSlug: 'tabsons', empId: 'EMP-2', date: '2026-07-03', checkIn: '09:00', checkOut: '21:30', status: 'Overtime', overtimeMinutes: 180 },
    { attendanceId: 'ATT-X', tenantSlug: 'abc', empId: 'ABC-1', date: '2026-07-01', checkIn: '08:00', checkOut: '17:00', status: 'Late', confidentialNotes: 'ABC confidential attendance' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'AR-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-07-04', status: 'Absent' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', leaveType: 'Annual Leave', totalDays: 2, status: 'Approved', appliedOn: '2026-01-10' },
    { leaveId: 'LV-X', empId: 'ABC-1', tenantSlug: 'abc', leaveType: 'Annual Leave', totalDays: 10, status: 'Approved', reason: 'ABC confidential leave', appliedOn: '2026-01-10' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-1', tenantSlug: 'tabsons', period: '2026-07', gross: 100000, net: 85000 },
    { payrollRunId: 'PAY-X', tenantSlug: 'abc', period: '2026-07', gross: 999999, net: 900000, confidentialNotes: 'ABC confidential payroll' }
  ];
  data.attendancePolicyDefinitions = [];
  data.attendancePolicyVersions = [];
  data.attendancePolicyRollbacks = [];
  data.attendancePolicySimulations = [];
  data.attendancePolicyAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    attendance: data.attendance,
    attendanceRecords: data.attendanceRecords,
    leaveRequests: data.leaveRequests,
    payrollRuns: data.payrollRuns,
    shifts: data.shifts
  });
}

function text(value) {
  return JSON.stringify(value);
}

function validPolicy(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    policyName: 'India Engineering Attendance Policy',
    policyCode: 'ATT-IN-ENG-2026',
    description: 'Engineering attendance policy',
    effectiveDate: '2026-01-01',
    expiryDate: '2026-12-31',
    status: 'DRAFT',
    priority: 10,
    mode: 'Office Attendance',
    workingHours: {
      officeStartTime: '09:00',
      officeEndTime: '18:00',
      workingHours: 9,
      halfDayThreshold: 4,
      minimumHours: 8,
      maximumHours: 10,
      coreHours: { start: '11:00', end: '16:00' },
      flexibleWindow: { start: '08:00', end: '10:30' },
      timezone: 'Asia/Kolkata'
    },
    lateRules: {
      graceMinutes: 10,
      lateMark: true,
      repeatedLateLimit: 3,
      repeatedLatePolicy: 'WARNING',
      autoDeduction: false,
      managerApproval: true,
      warningLevels: [{ after: 3, action: 'WARNING' }],
      escalation: { enabled: true, afterOccurrences: 4, target: 'MANAGER' }
    },
    earlyExitRules: {
      thresholdMinutes: 30,
      graceMinutes: 10,
      approvalRequired: true,
      halfDayAfterMinutes: 240,
      autoDeduction: false
    },
    overtimeRules: {
      dailyOT: true,
      weeklyOT: true,
      holidayOT: true,
      weekendOT: true,
      approvalRequired: true,
      maximumOTMinutes: 180,
      autoCalculation: true,
      payrollIntegration: true
    },
    breakRules: {
      lunchMinutes: 60,
      teaMinutes: 15,
      flexibleBreak: true,
      maximumBreakDuration: 90,
      paidBreak: false,
      unpaidBreak: true
    },
    sources: ['Manual Entry', 'Biometric Device', 'Web Portal', 'Mobile App'],
    assignments: {
      companies: ['Tabsons'],
      businessUnits: ['Product'],
      departments: ['Engineering'],
      locations: ['Bengaluru'],
      branches: ['Bengaluru'],
      grades: ['G5', 'G6'],
      employmentTypes: ['FULL_TIME'],
      employees: [],
      roles: ['EMPLOYEE'],
      shifts: ['SH-GEN']
    },
    ...overrides
  };
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/leaveAttendanceGovernanceService.js',
    'services/workingCalendarConfigurationService.js',
    'services/leavePolicyConfigurationService.js'
  ].forEach(load);
  seedAttendancePolicyData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/attendancePolicyConfigurationService.js');

  const svc = global.AttendancePolicyConfigurationService;
  assert.ok(svc, 'AttendancePolicyConfigurationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ATTENDANCE_MODES), 'attendance modes must be immutable');
  assert.equal(global.__ARTHHRMS_ATTENDANCE_POLICY_CONFIGURATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'createAttendancePolicy',
    'updateAttendancePolicy',
    'publishAttendancePolicy',
    'rollbackAttendancePolicy',
    'evaluateAttendanceAssignment',
    'evaluateWorkingHours',
    'validateAttendancePolicy',
    'simulateAttendancePolicy',
    'generateAttendanceAnalytics',
    'generatePolicyDashboard',
    'freezeAttendancePolicyOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.AttendancePolicyService, svc, 'AttendancePolicyService alias should be available');
  assert.equal(global.AttendanceRuleEngine, svc, 'AttendanceRuleEngine alias should be available');
  assert.equal(global.WorkingHoursService, svc, 'WorkingHoursService alias should be available');
  assert.equal(global.OvertimeRuleService, svc, 'OvertimeRuleService alias should be available');
  assert.equal(global.AttendanceValidator, svc, 'AttendanceValidator alias should be available');
  assert.equal(global.AttendanceSimulationService, svc, 'AttendanceSimulationService alias should be available');
  assert.equal(global.AttendanceAnalyticsService, svc, 'AttendanceAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const before = protectedSnapshot();

  const created = svc.createAttendancePolicy(validPolicy(), hrContext);
  assert.equal(created.success, true, 'attendance policy creation should work');
  assert.equal(created.policy.status, 'DRAFT');
  assert.equal(created.policy.version, 1);
  assert.equal(created.policy.mode, 'OFFICE_ATTENDANCE');
  assert.equal(created.governance.historicalAttendanceUnaffected, true);
  assert.equal(created.governance.existingPayrollPreserved, true);
  assert.ok(created.policy.sources.includes('BIOMETRIC_DEVICE'));
  assert.ok(Object.isFrozen(created), 'created policy output must be immutable');
  assert.equal(protectedSnapshot(), before, 'policy creation must not mutate attendance, leave, payroll, shift, or employee records');

  const duplicate = svc.createAttendancePolicy(validPolicy({ policyName: 'Duplicate Attendance Policy' }), hrContext);
  assert.equal(duplicate.success, false, 'duplicate policy code should be blocked');
  assert.ok(duplicate.issues.some(issue => issue.code === 'DUPLICATE_ATTENDANCE_POLICY_CODE'));

  const invalid = svc.validateAttendancePolicy(validPolicy({
    policyCode: 'BAD-ATT-POLICY',
    effectiveDate: '2026-12-31',
    expiryDate: '2026-01-01',
    workingHours: { officeStartTime: '25:00', officeEndTime: '18:00', workingHours: -1, minimumHours: 12, maximumHours: 8, halfDayThreshold: -2, timezone: '' },
    lateRules: { graceMinutes: -5 },
    earlyExitRules: { thresholdMinutes: -30, graceMinutes: 300, halfDayAfterMinutes: -1 },
    overtimeRules: { maximumOTMinutes: -20 },
    breakRules: { lunchMinutes: -1 }
  }), hrContext);
  assert.equal(invalid.success, false, 'invalid policy should fail validation');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_DATE_RANGE'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_WORKING_HOURS'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_GRACE_PERIOD'));
  assert.ok(invalid.issues.some(issue => issue.code === 'NEGATIVE_ATTENDANCE_THRESHOLD'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_OVERTIME_RULE'));

  const policyId = created.policy.policyId;
  const assignment = svc.evaluateAttendanceAssignment({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-1' }, hrContext);
  assert.equal(assignment.success, true, 'assignment evaluation should run');
  assert.equal(assignment.eligible, true, 'employee should match policy assignment');
  assert.ok(assignment.matchedCriteria.includes('department'));
  assert.ok(assignment.matchedCriteria.includes('shift'));
  assert.equal(assignment.readOnly, true);

  const ineligible = svc.evaluateAttendanceAssignment({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-2' }, hrContext);
  assert.equal(ineligible.success, true);
  assert.equal(ineligible.eligible, false, 'HR employee should not match engineering policy');

  const lateEvaluation = svc.evaluateWorkingHours({ tenantSlug: 'tabsons', policyId, date: '2026-07-01', checkIn: '09:25', checkOut: '18:05' }, hrContext);
  assert.equal(lateEvaluation.success, true, 'working-hour evaluation should run');
  assert.equal(lateEvaluation.attendanceResult, 'LATE');
  assert.ok(lateEvaluation.lateMinutes > 0);
  assert.equal(lateEvaluation.payrollIntegrationPrepared, true);
  assert.equal(lateEvaluation.historicalAttendanceModified, false);
  assert.equal(lateEvaluation.readOnly, true);

  const lateSimulation = svc.simulateAttendancePolicy({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-1', scenario: 'LATE_ARRIVAL' }, hrContext);
  assert.equal(lateSimulation.success, true, 'late simulation should work');
  assert.equal(lateSimulation.expectedResult, 'LATE');
  assert.ok(lateSimulation.evaluation.lateMinutes > 0);
  assert.equal(lateSimulation.historicalAttendanceModified, false);
  assert.equal(protectedSnapshot(), before, 'simulation must not mutate historical attendance, leave, payroll, shift, or employee records');

  const overtimeSimulation = svc.simulateAttendancePolicy({ tenantSlug: 'tabsons', policyId, employeeId: 'EMP-1', scenario: 'OVERTIME' }, hrContext);
  assert.equal(overtimeSimulation.success, true, 'overtime simulation should work');
  assert.ok(overtimeSimulation.evaluation.overtimeMinutes > 0);
  assert.equal(overtimeSimulation.payrollIntegrationPrepared, true);

  const published = svc.publishAttendancePolicy({ tenantSlug: 'tabsons', policyId, approval: { approved: true, approvedBy: 'DIR-1', reason: 'Ready for go-live' } }, directorContext);
  assert.equal(published.success, true, 'policy publish should work with approval');
  assert.equal(published.policy.status, 'PUBLISHED');
  assert.equal(published.policy.version, 2);

  const updated = svc.updateAttendancePolicy({ tenantSlug: 'tabsons', policyId, changes: { lateRules: { graceMinutes: 15, repeatedLateLimit: 4 }, reason: 'Grace window update' } }, hrContext);
  assert.equal(updated.success, true, 'policy update should create a new version');
  assert.equal(updated.policy.version, 3);
  assert.equal(updated.policy.lateRules.graceMinutes, 15);

  const rollback = svc.rollbackAttendancePolicy({ tenantSlug: 'tabsons', policyId, targetVersion: 2, reason: 'Rollback drill', approval: { approved: true, approvedBy: 'DIR-1', reason: 'Rollback drill' } }, directorContext);
  assert.equal(rollback.success, true, 'policy rollback should work');
  assert.equal(rollback.policy.version, 4);
  assert.equal(rollback.policy.lateRules.graceMinutes, 10);
  assert.equal(protectedSnapshot(), before, 'rollback must not mutate historical attendance, leave, payroll, shift, or employee records');

  const analytics = svc.generateAttendanceAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'attendance policy analytics should generate');
  assert.ok(analytics.analytics.policyCount >= 1);
  assert.ok(analytics.analytics.lateArrivals >= 1);
  assert.ok(analytics.analytics.overtime >= 1);
  assert.ok(analytics.attendanceHealthScore >= 0);
  assert.ok(analytics.policyComplianceScore >= 0);
  assert.ok(analytics.workforceDisciplineScore >= 0);

  const dashboard = svc.generatePolicyDashboard({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.policyLibrary.length >= 1);
  assert.ok(dashboard.assignments.length >= 1);
  assert.ok(dashboard.workingHours.length >= 1);
  assert.ok(dashboard.lateRules.length >= 1);
  assert.ok(dashboard.earlyExitRules.length >= 1);
  assert.ok(dashboard.overtimeRules.length >= 1);
  assert.ok(dashboard.simulation.latestSupportedScenarios.includes('OVERTIME'));
  assert.equal(dashboard.compatibility.existingAttendancePreserved, true);
  assert.equal(dashboard.compatibility.existingLeavePreserved, true);
  assert.equal(dashboard.compatibility.existingPayrollPreserved, true);
  assert.equal(dashboard.compatibility.existingShiftPreserved, true);
  assert.equal(dashboard.compatibility.historicalAttendanceUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC confidential|ABC Employee|abc@example.com|999999|privateNote/i, 'dashboard must be tenant scoped and sanitized');

  const employeeBlocked = svc.createAttendancePolicy(validPolicy({ policyCode: 'EMP-BLOCKED' }), employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot configure attendance policies');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'ATTENDANCE_POLICY_ACCESS_DENIED'));

  const crossTenant = svc.generatePolicyDashboard({ tenantSlug: 'abc' }, hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant policy access must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_ATTENDANCE_POLICY_BLOCKED'));

  assert.ok(global.DB.get().attendancePolicyDefinitions.length >= 1, 'attendance policies should be persisted');
  assert.ok(global.DB.get().attendancePolicyVersions.length >= 1, 'attendance policy versions should be persisted');
  assert.ok(global.DB.get().attendancePolicyRollbacks.length >= 1, 'attendance policy rollback history should be persisted');
  assert.ok(global.DB.getAuditLogs().some(row => /ATTENDANCE_POLICY/.test(row.actionType || row.action || '')), 'attendance policy actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ATTENDANCE_POLICY/.test(row.eventType || row.category || '')), 'attendance policy telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ATTENDANCE_POLICY_CREATED, 'attendance policy metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'attendance-policy-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Attendance Policy Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Attendance Policy Center/i);
  assert.match(dashboardHtml, /Working Hours/i);
  assert.match(dashboardHtml, /Late Rules/i);
  assert.match(dashboardHtml, /Overtime Rules/i);
  assert.match(dashboardHtml, /AttendancePolicyConfigurationService/i);

  console.log('attendancePolicyConfigurationService.test.js passed');
}

main();
