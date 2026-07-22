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
  global.navigator = { userAgent: 'Node shift roster configuration test', platform: 'Win32' };
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

function seedShiftRosterData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha Rao', email: 'asha@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', team: 'Platform', shiftId: 'SH-GEN', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Dev Mehta', email: 'dev@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', team: 'Platform', shiftId: 'SH-EVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G8', employmentType: 'FULL_TIME', team: 'Platform', shiftId: 'SH-GEN', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Ravi HR', email: 'ravi@example.com', role: 'HR', department: 'HR', businessUnit: 'People', branch: 'Mumbai', location: 'Mumbai', employeeGrade: 'G6', employmentType: 'FULL_TIME', team: 'People Ops', shiftId: 'SH-HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'EMPLOYEE', department: 'Finance', businessUnit: 'Finance', branch: 'ABC HQ', location: 'Delhi', employeeGrade: 'G5', employmentType: 'FULL_TIME', shiftId: 'SH-ABC', salary: 999999, leaveBalance: 99, privateNote: 'ABC confidential roster data', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.shifts = [
    { id: 'SH-GEN', shiftId: 'SH-GEN', name: 'Existing General Shift', startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata', tenantSlug: 'tabsons' },
    { id: 'SH-EVE', shiftId: 'SH-EVE', name: 'Existing Evening Shift', startTime: '14:00', endTime: '22:00', timezone: 'Asia/Kolkata', tenantSlug: 'tabsons' },
    { id: 'SH-ABC', shiftId: 'SH-ABC', name: 'ABC Private Shift', startTime: '08:00', endTime: '17:00', timezone: 'Asia/Kolkata', tenantSlug: 'abc', confidentialNotes: 'ABC confidential shift' }
  ];
  data.employeeSchedules = [
    { scheduleId: 'SCH-1', tenantSlug: 'tabsons', empId: 'EMP-1', shiftId: 'SH-GEN', effectiveDate: '2026-07-01' },
    { scheduleId: 'SCH-X', tenantSlug: 'abc', empId: 'ABC-1', shiftId: 'SH-ABC', effectiveDate: '2026-07-01', confidentialNotes: 'ABC confidential schedule' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-07-01', checkIn: '09:25', checkOut: '18:05', status: 'Late', lateMinutes: 15 },
    { attendanceId: 'ATT-X', tenantSlug: 'abc', empId: 'ABC-1', date: '2026-07-01', status: 'Late', confidentialNotes: 'ABC confidential attendance' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'AR-1', tenantSlug: 'tabsons', empId: 'EMP-2', date: '2026-07-03', status: 'Present' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', leaveType: 'Annual Leave', fromDate: '2026-07-04', toDate: '2026-07-04', totalDays: 1, status: 'Approved' },
    { leaveId: 'LV-X', empId: 'ABC-1', tenantSlug: 'abc', leaveType: 'Annual Leave', totalDays: 10, status: 'Approved', reason: 'ABC confidential leave', fromDate: '2026-07-04', toDate: '2026-07-04' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-1', tenantSlug: 'tabsons', period: '2026-07', gross: 100000, net: 85000 },
    { payrollRunId: 'PAY-X', tenantSlug: 'abc', period: '2026-07', gross: 999999, net: 900000, confidentialNotes: 'ABC confidential payroll' }
  ];
  data.workingCalendarConfigurations = [
    { calendarId: 'CAL-1', tenantSlug: 'tabsons', name: 'India Calendar', status: 'PUBLISHED', holidays: [{ name: 'Founders Day', date: '2026-07-05', type: 'COMPANY' }] },
    { calendarId: 'CAL-X', tenantSlug: 'abc', name: 'ABC Calendar', status: 'PUBLISHED', holidays: [{ name: 'ABC Private Day', date: '2026-07-05', type: 'COMPANY' }], confidentialNotes: 'ABC confidential calendar' }
  ];
  data.attendancePolicyDefinitions = [
    { policyId: 'ATT-POL-1', tenantSlug: 'tabsons', policyName: 'Engineering Attendance', status: 'PUBLISHED', assignments: { departments: ['Engineering'] } }
  ];
  data.shiftRosterTemplates = [];
  data.shiftRosterPlans = [];
  data.shiftRosterAssignments = [];
  data.shiftSwapRequests = [];
  data.shiftRosterVersions = [];
  data.shiftRosterRollbacks = [];
  data.shiftRosterAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    employeeSchedules: data.employeeSchedules,
    shifts: data.shifts,
    attendance: data.attendance,
    attendanceRecords: data.attendanceRecords,
    leaveRequests: data.leaveRequests,
    payrollRuns: data.payrollRuns,
    attendancePolicyDefinitions: data.attendancePolicyDefinitions
  });
}

function text(value) {
  return JSON.stringify(value);
}

function shiftTemplate(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    shiftName: 'General Production Shift',
    shiftCode: 'GEN-0900',
    description: 'Primary office shift',
    shiftType: 'General Shift',
    startTime: '09:00',
    endTime: '18:00',
    breakDurationMinutes: 60,
    graceMinutes: 10,
    coreHours: { start: '11:00', end: '16:00' },
    workingHours: 8,
    timezone: 'Asia/Kolkata',
    status: 'DRAFT',
    ...overrides
  };
}

function rosterPayload(sequence, overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    rosterName: 'Engineering Weekly Roster',
    rosterCode: 'ENG-WEEK-2026-28',
    description: 'Engineering weekly coverage',
    rosterType: 'Rotational Roster',
    startDate: '2026-07-01',
    endDate: '2026-07-07',
    effectiveDate: '2026-07-01',
    status: 'DRAFT',
    assignmentScope: {
      departments: ['Engineering'],
      locations: ['Bengaluru'],
      branches: ['Bengaluru'],
      teams: ['Platform'],
      employees: ['EMP-1', 'EMP-2']
    },
    rotationRules: {
      rotationType: 'Weekly Rotation',
      automaticRotation: true,
      manualRotation: false,
      intervalDays: 1,
      sequence
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
    'services/attendancePolicyConfigurationService.js'
  ].forEach(load);
  seedShiftRosterData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/shiftRosterConfigurationService.js');

  const svc = global.ShiftRosterConfigurationService;
  assert.ok(svc, 'ShiftRosterConfigurationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.SHIFT_TYPES), 'shift types must be immutable');
  assert.equal(global.__ARTHHRMS_SHIFT_ROSTER_CONFIGURATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'createShiftTemplate',
    'updateShiftTemplate',
    'publishShiftTemplate',
    'generateRoster',
    'publishRoster',
    'applyRotation',
    'assignShift',
    'requestShiftSwap',
    'approveShiftSwap',
    'validateRoster',
    'rollbackRosterVersion',
    'generateForecast',
    'generateSchedulingAnalytics',
    'generateRosterDashboard',
    'freezeRosterOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.ShiftTemplateService, svc, 'ShiftTemplateService alias should be available');
  assert.equal(global.RosterEngine, svc, 'RosterEngine alias should be available');
  assert.equal(global.RotationEngine, svc, 'RotationEngine alias should be available');
  assert.equal(global.ShiftAssignmentService, svc, 'ShiftAssignmentService alias should be available');
  assert.equal(global.ShiftSwapService, svc, 'ShiftSwapService alias should be available');
  assert.equal(global.RosterValidator, svc, 'RosterValidator alias should be available');
  assert.equal(global.SchedulingAnalyticsService, svc, 'SchedulingAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const managerContext = { actor: { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const before = protectedSnapshot();

  const general = svc.createShiftTemplate(shiftTemplate(), hrContext);
  assert.equal(general.success, true, 'shift template creation should work');
  assert.equal(general.template.shiftType, 'GENERAL_SHIFT');
  assert.equal(general.template.status, 'DRAFT');
  assert.equal(general.template.version, 1);
  assert.equal(general.governance.employeeSchedulesUnaffected, true);
  assert.ok(Object.isFrozen(general), 'created template output must be immutable');
  assert.equal(protectedSnapshot(), before, 'shift template creation must not mutate existing schedules or HR modules');

  const evening = svc.createShiftTemplate(shiftTemplate({ shiftName: 'Evening Production Shift', shiftCode: 'EVE-1400', shiftType: 'Evening Shift', startTime: '14:00', endTime: '22:00', workingHours: 7 }), hrContext);
  const night = svc.createShiftTemplate(shiftTemplate({ shiftName: 'Night Production Shift', shiftCode: 'NIT-2200', shiftType: 'Night Shift', startTime: '22:00', endTime: '06:00', workingHours: 7 }), hrContext);
  assert.equal(evening.success, true);
  assert.equal(night.success, true, 'cross-midnight shift template should be supported');
  assert.equal(night.template.shiftType, 'NIGHT_SHIFT');

  const duplicate = svc.createShiftTemplate(shiftTemplate({ shiftName: 'Duplicate Shift' }), hrContext);
  assert.equal(duplicate.success, false, 'duplicate shift code should be blocked');
  assert.ok(duplicate.issues.some(issue => issue.code === 'DUPLICATE_SHIFT_CODE'));

  const invalidTemplate = svc.createShiftTemplate(shiftTemplate({ shiftCode: 'BAD-SHIFT', startTime: '25:00', endTime: '18:00', workingHours: -1, breakDurationMinutes: 900, graceMinutes: 500 }), hrContext);
  assert.equal(invalidTemplate.success, false, 'invalid shift template should fail');
  assert.ok(invalidTemplate.issues.some(issue => issue.code === 'INVALID_SHIFT_TIME_RANGE'));
  assert.ok(invalidTemplate.issues.some(issue => issue.code === 'INVALID_WORKING_HOURS'));
  assert.ok(invalidTemplate.issues.some(issue => issue.code === 'INVALID_GRACE_TIME'));

  const publishedTemplate = svc.publishShiftTemplate({ tenantSlug: 'tabsons', templateId: general.template.templateId, approval: { approved: true, approvedBy: 'DIR-1', reason: 'Template go-live' } }, directorContext);
  assert.equal(publishedTemplate.success, true, 'template publish should require approval and work');
  assert.equal(publishedTemplate.template.status, 'PUBLISHED');
  assert.equal(publishedTemplate.template.version, 2);

  const updatedTemplate = svc.updateShiftTemplate({ tenantSlug: 'tabsons', templateId: evening.template.templateId, changes: { graceMinutes: 15, reason: 'Evening shift grace update' } }, hrContext);
  assert.equal(updatedTemplate.success, true, 'template update should version');
  assert.equal(updatedTemplate.template.version, 2);
  assert.equal(updatedTemplate.template.graceMinutes, 15);

  const roster = svc.generateRoster(rosterPayload([general.template.templateId, evening.template.templateId]), hrContext);
  assert.equal(roster.success, true, 'roster generation should work');
  assert.equal(roster.roster.status, 'DRAFT');
  assert.equal(roster.roster.entries.length, 14);
  assert.ok(roster.warnings.some(issue => issue.code === 'LEAVE_CONFLICT'), 'leave overlap should be detected as a warning');
  assert.ok(roster.warnings.some(issue => issue.code === 'HOLIDAY_CONFLICT'), 'holiday overlap should be detected as a warning');
  assert.equal(protectedSnapshot(), before, 'roster generation must not mutate employee schedules, attendance, leave, payroll, approval, or legacy shifts');

  const validation = svc.validateRoster({ tenantSlug: 'tabsons', rosterId: roster.roster.rosterId }, managerContext);
  assert.equal(validation.success, true, 'generated roster should validate without blocking errors');
  assert.ok(validation.issues.some(issue => issue.code === 'LEAVE_CONFLICT'));

  const duplicateRosterValidation = svc.validateRoster({
    tenantSlug: 'tabsons',
    roster: rosterPayload([general.template.templateId], {
      rosterCode: 'INLINE-DUP',
      entries: [
        { employeeId: 'EMP-1', templateId: general.template.templateId, date: '2026-07-02' },
        { employeeId: 'EMP-1', templateId: evening.template.templateId, date: '2026-07-02' }
      ]
    })
  }, managerContext);
  assert.equal(duplicateRosterValidation.success, false, 'duplicate daily assignment should be blocked');
  assert.ok(duplicateRosterValidation.issues.some(issue => issue.code === 'DUPLICATE_ASSIGNMENT'));

  const rotated = svc.applyRotation({ tenantSlug: 'tabsons', rosterId: roster.roster.rosterId, rotationType: 'Weekly Rotation', sequence: [evening.template.templateId, night.template.templateId], reason: 'Night coverage drill' }, hrContext);
  assert.equal(rotated.success, true, 'rotation should apply');
  assert.equal(rotated.roster.version, 2);
  assert.ok(rotated.rotation.sequence.includes(night.template.templateId));

  const assignment = svc.assignShift({
    tenantSlug: 'tabsons',
    employeeId: 'EMP-1',
    templateId: night.template.templateId,
    effectiveDate: '2026-08-01',
    approval: { approved: true, approvedBy: 'DIR-1', reason: 'Approved night shift coverage' }
  }, hrContext);
  assert.equal(assignment.success, true, 'approved shift assignment should work');
  assert.equal(assignment.employeeScheduleMutated, false);
  assert.equal(protectedSnapshot(), before, 'approved assignment records must not rewrite existing employee schedules');

  const unapprovedAssignment = svc.assignShift({ tenantSlug: 'tabsons', employeeId: 'EMP-2', templateId: night.template.templateId, effectiveDate: '2026-08-01' }, hrContext);
  assert.equal(unapprovedAssignment.success, false, 'shift assignment must require approval');
  assert.ok(unapprovedAssignment.issues.some(issue => issue.code === 'SHIFT_ASSIGNMENT_APPROVAL_REQUIRED'));

  const swap = svc.requestShiftSwap({
    tenantSlug: 'tabsons',
    requesterEmployeeId: 'EMP-1',
    targetEmployeeId: 'EMP-2',
    fromTemplateId: general.template.templateId,
    toTemplateId: evening.template.templateId,
    date: '2026-07-06',
    reason: 'Coverage swap'
  }, employeeContext);
  assert.equal(swap.success, true, 'employee shift swap request should work');
  assert.equal(swap.swap.scheduleMutated, false);
  assert.equal(swap.swap.eligibility.eligible, true);

  const approvedSwap = svc.approveShiftSwap({ tenantSlug: 'tabsons', swapId: swap.swap.swapId, approval: { approved: true, approvedBy: 'MGR-1', reason: 'Manager approved coverage' } }, managerContext);
  assert.equal(approvedSwap.success, true, 'manager shift swap approval should work');
  assert.equal(approvedSwap.swap.status, 'APPROVED');
  assert.equal(approvedSwap.scheduleMutated, false);

  const publishedRoster = svc.publishRoster({ tenantSlug: 'tabsons', rosterId: roster.roster.rosterId, approval: { approved: true, approvedBy: 'DIR-1', reason: 'Roster ready' } }, directorContext);
  assert.equal(publishedRoster.success, true, 'roster publish should work with approval');
  assert.equal(publishedRoster.roster.status, 'PUBLISHED');
  assert.equal(publishedRoster.roster.version, 3);

  const rollback = svc.rollbackRosterVersion({ tenantSlug: 'tabsons', rosterId: roster.roster.rosterId, targetVersion: 2, reason: 'Rollback drill', approval: { approved: true, approvedBy: 'DIR-1', reason: 'Rollback drill' } }, directorContext);
  assert.equal(rollback.success, true, 'roster rollback should work with approval');
  assert.equal(rollback.roster.version, 4);
  assert.equal(protectedSnapshot(), before, 'roster rollback must not mutate existing schedules or HR modules');

  const forecast = svc.generateForecast({ tenantSlug: 'tabsons', expectedCoverage: 2 }, managerContext);
  assert.equal(forecast.success, true, 'forecast should generate');
  assert.ok(forecast.forecast.staffingCoverage >= 1);
  assert.ok(Array.isArray(forecast.forecast.unassignedEmployees));
  assert.ok(forecast.coverageScore >= 0);

  const analytics = svc.generateSchedulingAnalytics({ tenantSlug: 'tabsons' }, managerContext);
  assert.equal(analytics.success, true, 'scheduling analytics should generate');
  assert.ok(analytics.analytics.shiftTemplates >= 3);
  assert.ok(analytics.analytics.swapRequests >= 1);
  assert.ok(analytics.rosterHealthScore >= 0);
  assert.ok(analytics.schedulingEfficiencyScore >= 0);
  assert.ok(analytics.coverageScore >= 0);

  const dashboard = svc.generateRosterDashboard({ tenantSlug: 'tabsons' }, managerContext);
  assert.equal(dashboard.success, true, 'dashboard should generate');
  assert.ok(dashboard.shiftTemplates.length >= 3);
  assert.ok(dashboard.rosterCalendar.length >= 1);
  assert.ok(dashboard.assignments.length >= 1);
  assert.ok(dashboard.shiftSwaps.length >= 1);
  assert.ok(dashboard.upcomingRotations.length >= 1);
  assert.equal(dashboard.compatibility.existingAttendancePreserved, true);
  assert.equal(dashboard.compatibility.existingLeavePreserved, true);
  assert.equal(dashboard.compatibility.existingPayrollPreserved, true);
  assert.equal(dashboard.compatibility.existingApprovalPreserved, true);
  assert.equal(dashboard.compatibility.employeeSchedulesUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC confidential|ABC Employee|abc@example.com|999999|privateNote/i, 'dashboard must be tenant scoped and sanitized');

  const employeeBlocked = svc.createShiftTemplate(shiftTemplate({ shiftCode: 'EMP-BLOCKED' }), employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot configure shift templates');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'SHIFT_ROSTER_ACCESS_DENIED'));

  const crossTenant = svc.generateRosterDashboard({ tenantSlug: 'abc' }, managerContext);
  assert.equal(crossTenant.success, false, 'cross-tenant roster dashboard must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_SHIFT_ROSTER_BLOCKED'));

  assert.ok(global.DB.get().shiftRosterTemplates.length >= 3, 'shift templates should be persisted');
  assert.ok(global.DB.get().shiftRosterPlans.length >= 1, 'rosters should be persisted');
  assert.ok(global.DB.get().shiftRosterAssignments.length >= 1, 'shift assignments should be persisted as governance records');
  assert.ok(global.DB.get().shiftSwapRequests.length >= 1, 'shift swap requests should be persisted');
  assert.ok(global.DB.get().shiftRosterVersions.length >= 1, 'shift roster versions should be persisted');
  assert.ok(global.DB.get().shiftRosterRollbacks.length >= 1, 'shift roster rollback history should be persisted');
  assert.ok(global.DB.getAuditLogs().some(row => /SHIFT_TEMPLATE|ROSTER|SHIFT_SWAP|SHIFT_ASSIGNMENT/.test(row.actionType || row.action || '')), 'shift roster actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /SHIFT_TEMPLATE|ROSTER|SHIFT_SWAP|SHIFT_ASSIGNMENT/.test(row.eventType || row.category || '')), 'shift roster telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.SHIFT_TEMPLATE_CREATED, 'shift roster metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'shift-roster-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Shift & Roster Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Shift & Roster Center/i);
  assert.match(dashboardHtml, /Roster Calendar/i);
  assert.match(dashboardHtml, /Coverage Map/i);
  assert.match(dashboardHtml, /Shift Swaps/i);
  assert.match(dashboardHtml, /ShiftRosterConfigurationService/i);

  console.log('shiftRosterConfigurationService.test.js passed');
}

main();
