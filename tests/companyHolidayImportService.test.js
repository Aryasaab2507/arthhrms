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
  global.navigator = { userAgent: 'Node holiday import test', platform: 'Win32' };
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

function seedHolidayData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    country: 'India'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Divya Director', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 1_000_000 },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Harini HR', role: 'HR', department: 'People', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Employee', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', leaveBalance: 12 },
    { id: 'ABC-HR', empId: 'ABC-HR', employeeId: 'ABC-HR', name: 'ABC HR', role: 'HR', department: 'People', tenantSlug: 'abc', tenantId: 'TEN-abc', privateNote: 'ABC confidential' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'COMPANY', tenantSlug: 'tabsons', departmentName: 'Tabsons Company', departmentCode: 'COMPANY', ownerId: 'DIR-1', state: 'ACTIVE', active: true },
    { departmentId: 'ABC-COMPANY', tenantSlug: 'abc', departmentName: 'ABC Company', departmentCode: 'ABC-COMPANY', ownerId: 'ABC-HR', state: 'ACTIVE', active: true }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-01-26', status: 'PRESENT' },
    { attendanceId: 'ATT-ABC', tenantSlug: 'abc', empId: 'ABC-HR', date: '2026-01-26', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-1', fromDate: '2026-01-26', toDate: '2026-01-28', requestedDays: 3, status: 'PENDING', reason: 'private family note' },
    { leaveId: 'LV-ABC', tenantSlug: 'abc', empId: 'ABC-HR', fromDate: '2026-01-26', toDate: '2026-01-26', requestedDays: 1, status: 'PENDING' }
  ];
  data.companyHolidayCalendars = [
    { calendarId: 'ABC-CAL', tenantSlug: 'abc', state: 'ACTIVE', active: true, holidays: [{ holidayId: 'ABC-HOL-1', holidayName: 'ABC Founders Day', holidayDate: '2026-03-01', holidayType: 'COMPANY', region: 'US', active: true }] }
  ];
  data.companyHolidayImportHistory = [];
  data.companyHolidayValidationReports = [];
  data.companyHolidayCalendarHistory = [];
  data.companyHolidayActivationHistory = [];
  data.companyHolidayAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function validHolidays() {
  return [
    { holidayName: 'Republic Day', holidayDate: '2026-01-26', holidayType: 'NATIONAL', region: 'IN', description: 'National holiday', active: true },
    { holidayName: 'Founders Day', holidayDate: '2026-07-15', holidayType: 'COMPANY', region: 'GLOBAL', description: 'Company anniversary', active: true },
    { holidayName: 'Karnataka Formation Day', holidayDate: '2026-11-01', holidayType: 'REGIONAL', region: 'IN-KA', active: true },
    { holidayName: 'Floating Wellness Day', holidayDate: '2026-12-24', holidayType: 'OPTIONAL', region: 'GLOBAL', active: true }
  ];
}

function holidayPayload(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    fileName: 'tabsons-holidays-2026.csv',
    fileType: 'CSV',
    calendarName: 'Tabsons Workforce Calendar 2026',
    calendarYear: 2026,
    holidays: validHolidays(),
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
    'services/tenantIsolationService.js',
    'services/leaveAttendanceGovernanceService.js'
  ].forEach(load);
  seedHolidayData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/companyHolidayImportService.js');

  const svc = global.CompanyHolidayImportService;
  assert.ok(svc, 'CompanyHolidayImportService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(global.__ARTHHRMS_COMPANY_HOLIDAY_IMPORT_SELF_TEST__.passed, true, 'development self-test should pass');

  ['importHolidayCalendar', 'validateHolidayCalendar', 'calculateCalendarCoverage', 'activateHolidayCalendar', 'generateHolidayPreview', 'freezeHolidayOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const hrContext = { actor: { id: 'HR-1', empId: 'HR-1', role: 'HR' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    employees: global.DB.get().employees
  });

  const imported = svc.importHolidayCalendar(holidayPayload(), hrContext);
  assert.equal(imported.success, true, 'HR can import a valid holiday calendar for validation');
  assert.equal(imported.calendar.state, 'APPROVAL_PENDING');
  assert.equal(imported.calendar.holidays.length, 4);
  assert.ok(imported.validation.validationScore >= 90, 'valid import should receive high validation score');
  assert.ok(Object.isFrozen(imported), 'import output must be immutable');
  assert.doesNotMatch(text(imported), /salary|leaveBalance|private family note|ABC Founders Day|ABC confidential/i, 'holiday import output must not expose sensitive or cross-tenant data');

  const preview = svc.generateHolidayPreview({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(preview.success, true, 'holiday preview should be generated');
  assert.equal(preview.preview.totalHolidays, 4);
  assert.ok(preview.preview.regionalCalendars.some(row => row.region === 'IN-KA'), 'regional holiday coverage should be visible');
  assert.ok(preview.attendanceIntegration.holidaysAffectAttendance, 'attendance integration preparation should be reported');
  assert.ok(preview.leaveIntegration.holidaysExcludedFromLeave, 'leave integration preparation should be reported');

  const validation = svc.validateHolidayCalendar(holidayPayload({ fileType: 'XLSX' }), directorContext);
  assert.equal(validation.success, true, 'XLSX holiday payloads should validate');
  assert.equal(validation.summary.validRows, 4);
  assert.equal(validation.summary.invalidRows, 0);
  assert.equal(validation.summary.duplicateCount, 0);
  assert.ok(validation.calendarReadinessScore >= 80);
  assert.ok(validation.coverageScore >= 80);
  assert.ok(validation.governanceScore >= 80);

  const coverage = svc.calculateCalendarCoverage({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(coverage.success, true, 'calendar coverage scoring should work');
  assert.ok(coverage.calendarReadinessScore >= 80);
  assert.ok(coverage.coverageScore >= 80);
  assert.ok(coverage.governanceScore >= 80);
  assert.ok(coverage.analytics.regionalCoverage >= 2, 'coverage analytics should include regional calendars');

  const invalid = svc.validateHolidayCalendar({
    tenantSlug: 'tabsons',
    fileName: 'broken.csv',
    fileType: 'CSV',
    holidays: [
      { holidayName: '', holidayDate: 'not-a-date', holidayType: 'NATIONAL', region: '!!' },
      { holidayName: 'Republic Day', holidayDate: '2026-01-26', holidayType: 'NATIONAL', region: 'IN' },
      { holidayName: 'Republic Day Duplicate', holidayDate: '2026-01-26', holidayType: 'COMPANY', region: 'IN' }
    ]
  }, hrContext);
  assert.equal(invalid.success, false, 'invalid holiday records must block validation');
  assert.ok(invalid.issues.some(issue => issue.code === 'MISSING_HOLIDAY_NAME'), 'missing names should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_HOLIDAY_DATE'), 'invalid dates should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'DUPLICATE_HOLIDAY_DATE'), 'duplicate dates should be detected');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_HOLIDAY_REGION'), 'invalid regions should be detected');

  const unsupported = svc.importHolidayCalendar(holidayPayload({ fileType: 'PDF', fileName: 'holidays.pdf' }), hrContext);
  assert.equal(unsupported.success, false, 'unsupported file types must be blocked');
  assert.ok(unsupported.issues.some(issue => issue.code === 'UNSUPPORTED_HOLIDAY_FILE_TYPE'));

  const employeeImport = svc.importHolidayCalendar(holidayPayload(), employeeContext);
  assert.equal(employeeImport.success, false, 'employees cannot import holidays');
  assert.ok(employeeImport.issues.some(issue => issue.code === 'HOLIDAY_IMPORT_ACCESS_DENIED'));

  const hrActivation = svc.activateHolidayCalendar({ tenantSlug: 'tabsons', approvalGranted: true }, hrContext);
  assert.equal(hrActivation.success, false, 'HR cannot activate holiday calendars');
  assert.ok(hrActivation.issues.some(issue => issue.code === 'HOLIDAY_ACTIVATION_DENIED'));

  const approvalMissing = svc.activateHolidayCalendar({ tenantSlug: 'tabsons' }, directorContext);
  assert.equal(approvalMissing.success, false, 'director activation still requires explicit approval');
  assert.ok(approvalMissing.issues.some(issue => issue.code === 'HOLIDAY_APPROVAL_REQUIRED'));

  const activated = svc.activateHolidayCalendar({ tenantSlug: 'tabsons', approvalGranted: true }, directorContext);
  assert.equal(activated.success, true, 'director can activate a validated holiday calendar');
  assert.equal(activated.calendar.state, 'ACTIVE');
  assert.equal(activated.attendanceIntegration.holidaysAffectAttendance, true);
  assert.equal(activated.leaveIntegration.holidaysExcludedFromLeave, true);

  const employeeView = svc.generateHolidayPreview({ tenantSlug: 'tabsons' }, employeeContext);
  assert.equal(employeeView.success, true, 'employees can view their tenant holiday calendar');
  assert.equal(employeeView.governance.employeeViewOnly, true);
  assert.doesNotMatch(text(employeeView), /salary|leaveBalance|private family note|ABC Founders Day/i, 'employee view must stay scoped and sanitized');

  const platformView = svc.generateHolidayPreview({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons', governanceOnly: true });
  assert.equal(platformView.success, true, 'platform owner can see governance-only holiday visibility');
  assert.equal(platformView.governance.platformOwnerVisibilityOnly, true);
  assert.ok(platformView.preview.holidays.every(row => /^Governance Holiday/.test(row.holidayName)), 'platform owner holiday names should be anonymized');

  const crossTenant = svc.importHolidayCalendar(holidayPayload({ tenantSlug: 'tabsons' }), { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(crossTenant.success, false, 'cross-tenant holiday import must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_HOLIDAY_BLOCKED'));

  const abcPreview = svc.generateHolidayPreview({ tenantSlug: 'abc' }, { actor: { id: 'ABC-HR', role: 'HR' }, tenantSlug: 'abc' });
  assert.equal(abcPreview.success, true, 'tenant B can preview its own holidays');
  assert.doesNotMatch(text(abcPreview), /Republic Day|Tabsons Workforce Calendar|Tabsons|EMP-1|Harini/i, 'tenant A holidays must not leak into tenant B');

  const empty = svc.validateHolidayCalendar({ tenantSlug: 'tabsons', fileType: 'CSV', holidays: [] }, hrContext);
  assert.equal(empty.success, false, 'empty imports must be blocked safely');
  assert.ok(empty.issues.some(issue => issue.code === 'EMPTY_HOLIDAY_IMPORT'));

  assert.equal(JSON.stringify({
    attendanceRecords: global.DB.get().attendanceRecords,
    leaveRequests: global.DB.get().leaveRequests,
    employees: global.DB.get().employees
  }), beforeProtected, 'holiday governance must not mutate attendance, leave, or employee records');

  const data = global.DB.get();
  assert.ok(data.companyHolidayCalendars.some(row => row.tenantSlug === 'tabsons' && row.state === 'ACTIVE'), 'activated holiday calendar should be persisted');
  assert.ok(data.companyHolidayImportHistory.length >= 1, 'holiday import history should be immutable');
  assert.ok(data.companyHolidayValidationReports.length >= 1, 'holiday validation history should be immutable');
  assert.ok(data.companyHolidayCalendarHistory.length >= 1, 'holiday calendar history should be immutable');
  assert.ok(data.companyHolidayActivationHistory.length >= 1, 'holiday activation history should be immutable');
  assert.ok(data.companyHolidayAnalytics.length >= 1, 'holiday analytics should be immutable');
  assert.ok(global.DB.getAuditLogs().some(row => /HOLIDAY_IMPORT|HOLIDAY_VALIDATION|HOLIDAY_CALENDAR_ACTIVATED/.test(row.actionType || row.action || '')), 'holiday actions should be audited');
}

main();
