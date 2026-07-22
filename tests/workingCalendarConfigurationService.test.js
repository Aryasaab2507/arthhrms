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
  global.navigator = { userAgent: 'Node working calendar test', platform: 'Win32' };
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

function seedCalendarData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-29';
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    country: 'IN'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'People', locationId: 'LOC-BLR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 950000 },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', locationId: 'LOC-BLR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', department: 'Engineering', locationId: 'LOC-BLR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', leaveBalance: 12 },
    { id: 'ABC-HR', empId: 'ABC-HR', role: 'HR', department: 'People', tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'ABC confidential' }
  ];
  data.companyLocations = [
    { locationId: 'LOC-BLR', tenantSlug: 'tabsons', locationName: 'Bengaluru', timezone: 'Asia/Kolkata', country: 'IN', state: 'KA' },
    { locationId: 'LOC-ABC', tenantSlug: 'abc', locationName: 'ABC HQ', timezone: 'America/New_York', country: 'US', state: 'NY' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'DEPT-ENG', tenantSlug: 'tabsons', departmentName: 'Engineering', locationId: 'LOC-BLR', active: true },
    { departmentId: 'DEPT-ABC', tenantSlug: 'abc', departmentName: 'Finance', locationId: 'LOC-ABC', active: true }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-01-26', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-1', fromDate: '2026-01-26', toDate: '2026-01-27', requestedDays: 2, status: 'PENDING', reason: 'private leave note' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-1', tenantSlug: 'tabsons', period: '2026-01', gross: 100000, net: 85000 }
  ];
  data.workingCalendarConfigurations = [
    {
      calendarId: 'ABC-CAL',
      tenantSlug: 'abc',
      name: 'ABC Private Calendar',
      year: 2026,
      status: 'PUBLISHED',
      holidays: [{ holidayId: 'ABC-HOL-1', name: 'ABC Founders Day', date: '2026-03-01', type: 'COMPANY', region: 'US-NY' }],
      confidentialNotes: 'ABC confidential calendar'
    }
  ];
  data.workingSchedulePolicies = [];
  data.shiftPolicies = [];
  data.calendarAssignments = [];
  data.workingCalendarVersionHistory = [];
  data.workingCalendarImportHistory = [];
  data.workingCalendarAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function calendarPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    name: 'Tabsons India Working Calendar 2026',
    year: 2026,
    country: 'IN',
    state: 'KA',
    region: 'IN-KA',
    description: 'Primary working calendar for India employees',
    holidays: [
      { name: 'Republic Day', date: '2026-01-26', type: 'NATIONAL', region: 'IN', optional: false },
      { name: 'Karnataka Formation Day', date: '2026-11-01', type: 'STATE', region: 'IN-KA', optional: false },
      { name: 'Founders Day', date: '2026-07-15', type: 'COMPANY', region: 'GLOBAL', optional: false },
      { name: 'Floating Wellness Day', date: '2026-12-24', type: 'FLOATING', region: 'GLOBAL', optional: true }
    ],
    workWeek: {
      pattern: 'MONDAY_FRIDAY',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      halfDayRules: [{ day: 'SATURDAY', endTime: '13:00' }],
      weekendRotation: false
    },
    workingHours: {
      officeStart: '09:30',
      officeEnd: '18:30',
      graceMinutes: 10,
      breakMinutes: 60,
      flexibleHours: true,
      coreStart: '11:00',
      coreEnd: '16:00',
      timezone: 'Asia/Kolkata'
    },
    shiftPolicy: {
      name: 'General Shift',
      type: 'GENERAL',
      startTime: '09:30',
      endTime: '18:30',
      timezone: 'Asia/Kolkata',
      overtimeEligible: true,
      nightShift: false
    },
    ...overrides
  };
}

function text(value) {
  return JSON.stringify(value);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/companyHolidayImportService.js'
  ].forEach(load);
  seedCalendarData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/workingCalendarConfigurationService.js');

  const svc = global.WorkingCalendarConfigurationService;
  assert.ok(svc, 'WorkingCalendarConfigurationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.HOLIDAY_TYPES), 'holiday types must be immutable');
  assert.ok(Object.isFrozen(svc.CALENDAR_STATES), 'calendar states must be immutable');
  assert.equal(global.__ARTHHRMS_WORKING_CALENDAR_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'createHolidayCalendar',
    'configureWorkingSchedule',
    'createShiftPolicy',
    'assignCalendar',
    'importHolidayCalendar',
    'validateCalendarConfiguration',
    'publishCalendarVersion',
    'rollbackCalendarVersion',
    'generateCalendarAnalytics',
    'generateWorkingCalendarDashboard',
    'freezeCalendarOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.HolidayCalendarService, svc, 'HolidayCalendarService alias should be available');
  assert.equal(global.WorkingScheduleService, svc, 'WorkingScheduleService alias should be available');
  assert.equal(global.ShiftPolicyService, svc, 'ShiftPolicyService alias should be available');
  assert.equal(global.CalendarAssignmentService, svc, 'CalendarAssignmentService alias should be available');
  assert.equal(global.HolidayImportService, svc, 'HolidayImportService alias should be available');
  assert.equal(global.CalendarValidator, svc, 'CalendarValidator alias should be available');
  assert.equal(global.CalendarAnalyticsService, svc, 'CalendarAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    payrollRuns: global.DB.get().payrollRuns
  });

  const created = svc.createHolidayCalendar(calendarPayload(), hrContext);
  assert.equal(created.success, true, 'HR can create draft working calendar');
  assert.equal(created.calendar.status, 'DRAFT');
  assert.equal(created.calendar.holidays.length, 4);
  assert.equal(created.governance.attendancePreserved, true);
  assert.equal(created.governance.leavePreserved, true);
  assert.equal(created.governance.payrollUnaffectedByDefault, true);
  assert.ok(Object.isFrozen(created), 'created calendar output must be immutable');
  assert.doesNotMatch(text(created), /salary|leaveBalance|private leave note|ABC Founders Day|ABC confidential/i, 'calendar output must be tenant scoped and sanitized');

  const validation = svc.validateCalendarConfiguration(calendarPayload(), hrContext);
  assert.equal(validation.success, true, 'valid calendar should validate');
  assert.equal(validation.summary.duplicateHolidays, 0);
  assert.equal(validation.summary.invalidTimeRanges, 0);
  assert.equal(validation.summary.weekendConflicts, 0);
  assert.ok(validation.calendarHealthScore >= 85);
  assert.ok(validation.attendanceReadinessScore >= 85);

  const invalid = svc.validateCalendarConfiguration(calendarPayload({
    holidays: [
      { name: 'Bad Holiday', date: '2026-02-30', type: 'NATIONAL', region: 'IN' },
      { name: 'Duplicate Republic Day', date: '2026-01-26', type: 'COMPANY', region: 'IN' },
      { name: 'Republic Day Again', date: '2026-01-26', type: 'NATIONAL', region: 'IN' }
    ],
    workWeek: { pattern: 'CUSTOM', workingDays: ['MONDAY', 'SUNDAY'] },
    workingHours: { officeStart: '18:00', officeEnd: '09:00', timezone: 'Asia/Kolkata' },
    shiftPolicy: { name: 'Broken Shift', type: 'GENERAL', startTime: '22:00', endTime: '21:00', timezone: 'Asia/Kolkata' }
  }), hrContext);
  assert.equal(invalid.success, false, 'invalid calendars must be blocked');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_HOLIDAY_DATE'), 'invalid dates should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'DUPLICATE_HOLIDAY_DATE'), 'duplicate holiday dates should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_WORKING_HOURS_RANGE'), 'invalid office hour ranges should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'WEEKEND_WORKDAY_CONFLICT'), 'weekend conflicts should be detected');

  const leapYear = svc.validateCalendarConfiguration(calendarPayload({
    holidays: [{ name: 'Leap Day', date: '2028-02-29', type: 'REGIONAL', region: 'IN-KA' }],
    year: 2028
  }), hrContext);
  assert.equal(leapYear.success, true, 'valid leap-year holidays should be accepted');

  const schedule = svc.configureWorkingSchedule({
    tenantSlug: 'tabsons',
    calendarId: created.calendar.calendarId,
    workWeek: calendarPayload().workWeek,
    workingHours: calendarPayload().workingHours
  }, hrContext);
  assert.equal(schedule.success, true, 'working schedule should be configurable');
  assert.equal(schedule.schedule.workWeek.pattern, 'MONDAY_FRIDAY');
  assert.equal(schedule.schedule.workingHours.timezone, 'Asia/Kolkata');

  const shift = svc.createShiftPolicy({
    tenantSlug: 'tabsons',
    calendarId: created.calendar.calendarId,
    name: 'Night Support Shift',
    type: 'NIGHT',
    startTime: '21:00',
    endTime: '06:00',
    timezone: 'Asia/Kolkata',
    nightShift: true,
    overtimeEligible: true
  }, hrContext);
  assert.equal(shift.success, true, 'night shift policy should be supported');
  assert.equal(shift.shiftPolicy.nightShift, true);
  assert.equal(shift.payrollIntegration.payrollCalculationsUnaffectedByDefault, true);
  assert.equal(shift.payrollIntegration.requiresExplicitPayrollConfiguration, true);

  const assigned = svc.assignCalendar({
    tenantSlug: 'tabsons',
    calendarId: created.calendar.calendarId,
    assignmentScope: 'DEPARTMENT',
    departmentId: 'DEPT-ENG',
    locationId: 'LOC-BLR',
    effectiveFrom: '2026-01-01'
  }, hrContext);
  assert.equal(assigned.success, true, 'calendar assignment should work');
  assert.equal(assigned.assignment.assignmentScope, 'DEPARTMENT');
  assert.equal(assigned.assignment.departmentId, 'DEPT-ENG');

  const imported = svc.importHolidayCalendar({
    tenantSlug: 'tabsons',
    fileName: 'calendar.ics',
    fileType: 'ICS',
    calendarName: 'Imported ICS Calendar',
    calendarYear: 2026,
    rows: [
      { summary: 'Imported National Day', dtstart: '2026-08-15', type: 'NATIONAL', region: 'IN' },
      { summary: 'Imported Branch Holiday', dtstart: '2026-09-10', type: 'BRANCH', region: 'IN-KA' }
    ]
  }, hrContext);
  assert.equal(imported.success, true, 'ICS calendar import should work');
  assert.equal(imported.calendar.holidays.length, 2);
  assert.equal(imported.importResult.fileType, 'ICS');

  const published = svc.publishCalendarVersion({ tenantSlug: 'tabsons', calendarId: created.calendar.calendarId, reason: 'Director approved go-live' }, directorContext);
  assert.equal(published.success, true, 'director can publish a validated calendar version');
  assert.equal(published.calendar.status, 'PUBLISHED');
  assert.equal(published.version.status, 'PUBLISHED');

  const rollback = svc.rollbackCalendarVersion({ tenantSlug: 'tabsons', calendarId: created.calendar.calendarId, targetVersion: 1, reason: 'Rollback drill' }, directorContext);
  assert.equal(rollback.success, true, 'calendar version rollback should work');
  assert.equal(rollback.rollback.status, 'ROLLED_BACK');

  const analytics = svc.generateCalendarAnalytics({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(analytics.success, true, 'calendar analytics should generate');
  assert.ok(analytics.analytics.workingDays > 200, 'working day count should be calculated');
  assert.ok(analytics.analytics.holidayCount >= 4, 'holiday count should be calculated');
  assert.ok(analytics.analytics.calendarAssignments >= 1, 'assignment count should be calculated');
  assert.ok(analytics.calendarHealthScore >= 80, 'calendar health score should be visible');
  assert.ok(analytics.attendanceReadinessScore >= 80, 'attendance readiness score should be visible');

  const dashboard = svc.generateWorkingCalendarDashboard({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.holidayCalendars.length >= 1);
  assert.ok(dashboard.shiftPolicies.length >= 1);
  assert.ok(dashboard.calendarAssignments.length >= 1);
  assert.equal(dashboard.compatibility.attendanceModulePreserved, true);
  assert.equal(dashboard.compatibility.leaveModulePreserved, true);
  assert.equal(dashboard.compatibility.payrollCalculationsUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC Founders Day|ABC Private|ABC confidential|salary|leaveBalance|private leave note/i, 'dashboard must not leak tenant or sensitive data');

  const employeeCreate = svc.createHolidayCalendar(calendarPayload(), employeeContext);
  assert.equal(employeeCreate.success, false, 'employees cannot create calendars');
  assert.ok(employeeCreate.issues.some(issue => issue.code === 'CALENDAR_CONFIGURATION_ACCESS_DENIED'));

  const crossTenant = svc.createHolidayCalendar(calendarPayload({ tenantSlug: 'tabsons' }), { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant calendar writes must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_CALENDAR_BLOCKED'));
  assert.doesNotMatch(text(crossTenant), /Republic Day|Tabsons India|salary|leaveBalance/i, 'blocked cross-tenant responses must be sanitized');

  const abcDashboard = svc.generateWorkingCalendarDashboard({ tenantSlug: 'abc' }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcDashboard.success, true, 'tenant B may view its own calendars');
  assert.doesNotMatch(text(abcDashboard), /Republic Day|Tabsons India|DEPT-ENG|LOC-BLR|EMP-1/i, 'tenant A calendars must not leak to tenant B');

  assert.equal(JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    payrollRuns: global.DB.get().payrollRuns
  }), beforeProtected, 'calendar configuration must not mutate attendance, leave, or payroll records');

  assert.ok(global.DB.getAuditLogs().some(row => /WORKING_CALENDAR|SHIFT_POLICY|CALENDAR_ASSIGNMENT/.test(row.actionType || row.action || '')), 'calendar actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /WORKING_CALENDAR|SHIFT_POLICY|CALENDAR_ASSIGNMENT/.test(row.eventType || row.category || '')), 'calendar telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.WORKING_CALENDAR_CONFIGURED, 'calendar metrics should aggregate safely');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'working-calendar-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Working Calendar Center dashboard page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Working Calendar Center/i, 'dashboard should identify the working calendar center');
  assert.match(dashboardHtml, /Holiday Calendars/i, 'dashboard should expose holiday calendar operations');
  assert.match(dashboardHtml, /Shift Policies/i, 'dashboard should expose shift policy operations');
  assert.match(dashboardHtml, /Calendar Assignments/i, 'dashboard should expose calendar assignment operations');
  assert.match(dashboardHtml, /WorkingCalendarConfigurationService/i, 'dashboard should integrate with the working calendar service');

  console.log('workingCalendarConfigurationService.test.js passed');
}

main();
