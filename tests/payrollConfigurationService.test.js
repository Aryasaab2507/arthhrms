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
  global.navigator = { userAgent: 'Node payroll configuration test', platform: 'Win32' };
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

function seedPayrollConfigurationData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha Rao', email: 'asha@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', salary: 1200000, bankDetails: { bankName: 'HDFC' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Dev Mehta', email: 'dev@example.com', role: 'EMPLOYEE', department: 'Engineering', businessUnit: 'Product', branch: 'Bengaluru', location: 'Bengaluru', employeeGrade: 'G5', employmentType: 'FULL_TIME', salary: 900000, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'Ravi HR', email: 'ravi@example.com', role: 'HR', department: 'HR', businessUnit: 'People', branch: 'Mumbai', location: 'Mumbai', employeeGrade: 'G6', employmentType: 'FULL_TIME', salary: 850000, bankDetails: { bankName: 'ICICI' }, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', role: 'EMPLOYEE', department: 'Finance', businessUnit: 'Finance', branch: 'ABC HQ', location: 'Delhi', employeeGrade: 'G5', employmentType: 'FULL_TIME', salary: 999999, privateNote: 'ABC confidential payroll configuration data', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.payroll = [
    { id: 'PAY-1', payrollId: 'PAY-1', empId: 'EMP-1', tenantSlug: 'tabsons', payrollMonth: 'June 2026', status: 'Completed', grossSalary: 100000, netSalary: 87000, deductions: 13000 },
    { id: 'PAY-X', payrollId: 'PAY-X', empId: 'ABC-1', tenantSlug: 'abc', payrollMonth: 'June 2026', status: 'Completed', grossSalary: 999999, netSalary: 900000, confidentialNotes: 'ABC confidential payroll' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'RUN-1', tenantSlug: 'tabsons', period: '2026-06', state: 'COMPLETED', net: 87000, processingMs: 2200 },
    { payrollRunId: 'RUN-X', tenantSlug: 'abc', period: '2026-06', state: 'FAILED', net: 900000, confidentialNotes: 'ABC confidential run' }
  ];
  data.salaryStructures = [
    { structureId: 'SAL-1', empId: 'EMP-1', tenantSlug: 'tabsons', basicSalary: 50000, hra: 20000, allowances: 25000, deductions: 12000, status: 'Active' },
    { structureId: 'SAL-X', empId: 'ABC-1', tenantSlug: 'abc', basicSalary: 999999, confidentialNotes: 'ABC confidential salary' }
  ];
  data.attendance = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', date: '2026-07-01', status: 'Present' },
    { attendanceId: 'ATT-X', tenantSlug: 'abc', empId: 'ABC-1', date: '2026-07-01', status: 'Present', confidentialNotes: 'ABC confidential attendance' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'AR-1', tenantSlug: 'tabsons', empId: 'EMP-2', date: '2026-07-02', status: 'MISSING_CHECKOUT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-2', tenantSlug: 'tabsons', leaveType: 'Annual Leave', totalDays: 2, status: 'Pending', fromDate: '2026-07-05', toDate: '2026-07-06' },
    { leaveId: 'LV-X', empId: 'ABC-1', tenantSlug: 'abc', leaveType: 'Annual Leave', totalDays: 10, status: 'Approved', reason: 'ABC confidential leave', fromDate: '2026-07-04', toDate: '2026-07-04' }
  ];
  data.financeLedger = [
    { ledgerId: 'FIN-1', tenantSlug: 'tabsons', type: 'PAYROLL_ACCRUAL', amount: 87000 },
    { ledgerId: 'FIN-X', tenantSlug: 'abc', type: 'PAYROLL_ACCRUAL', amount: 900000, confidentialNotes: 'ABC confidential finance' }
  ];
  data.shiftRosterAssignments = [
    { assignmentId: 'SHIFT-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', templateId: 'NIGHT', status: 'APPROVED' }
  ];
  data.payrollConfigurations = [];
  data.payrollConfigurationVersions = [];
  data.payrollConfigurationRollbacks = [];
  data.payrollConfigurationSimulations = [];
  data.payrollConfigurationAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    payroll: data.payroll,
    payrollRuns: data.payrollRuns,
    salaryStructures: data.salaryStructures,
    attendance: data.attendance,
    attendanceRecords: data.attendanceRecords,
    leaveRequests: data.leaveRequests,
    financeLedger: data.financeLedger,
    shiftRosterAssignments: data.shiftRosterAssignments
  });
}

function text(value) {
  return JSON.stringify(value);
}

function validConfig(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    payrollName: 'India Engineering Payroll',
    payrollCode: 'PAY-IN-ENG-2026',
    payrollFrequency: 'Monthly',
    effectiveDate: '2026-07-01',
    expiryDate: '2027-03-31',
    status: 'DRAFT',
    currency: 'INR',
    country: 'IN',
    financialYear: '2026-2027',
    payrollCalendar: {
      frequency: 'Monthly',
      salaryReleaseDay: 30,
      processingWindowDays: 5,
      approvalDeadlineDay: 25
    },
    salaryComponents: [
      { name: 'Basic Salary', code: 'BASIC', componentType: 'Basic Salary', formula: 'FIXED_AMOUNT', amount: 50000, taxable: true },
      { name: 'HRA', code: 'HRA', componentType: 'HRA', formula: 'PERCENTAGE_OF_BASIC', percentage: 40, taxable: true },
      { name: 'Special Allowance', code: 'SPECIAL', componentType: 'Special Allowance', formula: 'FIXED_AMOUNT', amount: 20000, taxable: true },
      { name: 'Overtime', code: 'OT', componentType: 'Overtime', formula: 'FIXED_AMOUNT', amount: 5000, taxable: true },
      { name: 'Shift Allowance', code: 'SHIFT', componentType: 'Shift Allowance', formula: 'FIXED_AMOUNT', amount: 3000, taxable: true }
    ],
    deductionRules: [
      { name: 'Provident Fund', code: 'PF', deductionType: 'Provident Fund', formula: 'PERCENTAGE_OF_BASIC', percentage: 12, statutory: true, country: 'IN' },
      { name: 'Professional Tax', code: 'PT', deductionType: 'Professional Tax', formula: 'FIXED_AMOUNT', amount: 200, statutory: true, country: 'IN' },
      { name: 'Income Tax', code: 'TDS', deductionType: 'Income Tax', formula: 'FIXED_AMOUNT', amount: 5000, statutory: true, country: 'IN' }
    ],
    payGroups: {
      companies: ['Tabsons'],
      businessUnits: ['Product'],
      departments: ['Engineering'],
      locations: ['Bengaluru'],
      branches: ['Bengaluru'],
      grades: ['G5'],
      employmentTypes: ['FULL_TIME'],
      employees: []
    },
    payrollRules: {
      proration: true,
      lopCalculation: true,
      overtimeIntegration: true,
      leaveDeduction: true,
      attendanceIntegration: true,
      holidayRules: true,
      nightShiftAllowance: true,
      customFormulaSupport: true
    },
    statutorySettings: {
      country: 'IN',
      pf: true,
      esi: false,
      professionalTax: true,
      tds: true,
      countrySpecificDeductions: ['PF', 'PROFESSIONAL_TAX', 'TDS']
    },
    banking: {
      salaryBank: 'HDFC Bank',
      paymentMode: 'NEFT',
      neft: true,
      rtgs: true,
      imps: true,
      cheque: false,
      cash: false,
      futurePayrollApis: true
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
    'services/payrollGovernanceService.js',
    'services/attendancePolicyConfigurationService.js',
    'services/shiftRosterConfigurationService.js',
    'services/leavePolicyConfigurationService.js'
  ].forEach(load);
  seedPayrollConfigurationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/payrollConfigurationService.js');

  const svc = global.PayrollConfigurationService;
  assert.ok(svc, 'PayrollConfigurationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.COMPONENT_TYPES), 'component types must be immutable');
  assert.equal(global.__ARTHHRMS_PAYROLL_CONFIGURATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'createPayrollStructure',
    'updatePayrollStructure',
    'publishPayrollStructure',
    'rollbackPayrollVersion',
    'addSalaryComponent',
    'configureDeductionRule',
    'validatePayrollConfiguration',
    'simulatePayroll',
    'generatePayrollAnalytics',
    'generatePayrollDashboard',
    'freezePayrollConfigurationOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.SalaryComponentService, svc, 'SalaryComponentService alias should be available');
  assert.equal(global.PayrollRuleEngine, svc, 'PayrollRuleEngine alias should be available');
  assert.equal(global.PayrollSimulationService, svc, 'PayrollSimulationService alias should be available');
  assert.equal(global.PayrollValidator, svc, 'PayrollValidator alias should be available');
  assert.equal(global.PayrollAnalyticsService, svc, 'PayrollAnalyticsService alias should be available');
  assert.equal(global.PayrollVersionService, svc, 'PayrollVersionService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const before = protectedSnapshot();

  const created = svc.createPayrollStructure(validConfig(), hrContext);
  assert.equal(created.success, true, 'payroll structure creation should work');
  assert.equal(created.configuration.status, 'DRAFT');
  assert.equal(created.configuration.version, 1);
  assert.equal(created.configuration.payrollFrequency, 'MONTHLY');
  assert.equal(created.configuration.currency, 'INR');
  assert.equal(created.governance.historicalPayrollUnaffected, true);
  assert.ok(created.configuration.salaryComponents.some(row => row.componentType === 'BASIC_SALARY'));
  assert.ok(created.configuration.deductionRules.some(row => row.deductionType === 'PROVIDENT_FUND'));
  assert.ok(Object.isFrozen(created), 'created payroll configuration output must be immutable');
  assert.equal(protectedSnapshot(), before, 'configuration creation must not mutate historical payroll, attendance, leave, employee, finance, or shift roster records');

  const duplicate = svc.createPayrollStructure(validConfig({ payrollName: 'Duplicate Payroll' }), hrContext);
  assert.equal(duplicate.success, false, 'duplicate payroll group should be blocked');
  assert.ok(duplicate.issues.some(issue => issue.code === 'DUPLICATE_PAYROLL_GROUP'));

  const invalid = svc.validatePayrollConfiguration(validConfig({
    payrollCode: 'BAD-PAY',
    effectiveDate: '2027-04-01',
    expiryDate: '2026-04-01',
    salaryComponents: [
      { name: 'Unsafe Component', code: 'UNSAFE', componentType: 'Special Allowance', formula: 'eval(employee.salary)', amount: -100 }
    ],
    deductionRules: [
      { name: 'Unsafe Deduction', code: 'BADDED', deductionType: 'Income Tax', formula: 'DROP TABLE payroll', amount: -50 }
    ],
    banking: { salaryBank: '', paymentMode: 'NEFT' }
  }), hrContext);
  assert.equal(invalid.success, false, 'invalid payroll configuration should fail validation');
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_DATE_RANGE'));
  assert.ok(invalid.issues.some(issue => issue.code === 'MISSING_BASIC_SALARY'));
  assert.ok(invalid.issues.some(issue => issue.code === 'NEGATIVE_SALARY_COMPONENT'));
  assert.ok(invalid.issues.some(issue => issue.code === 'NEGATIVE_DEDUCTION'));
  assert.ok(invalid.issues.some(issue => issue.code === 'INVALID_FORMULA'));

  const configId = created.configuration.configId;
  const addedComponent = svc.addSalaryComponent({
    tenantSlug: 'tabsons',
    configId,
    component: { name: 'Performance Bonus', code: 'BONUS', componentType: 'Performance Bonus', formula: 'FIXED_AMOUNT', amount: 10000 },
    reason: 'Add bonus component'
  }, hrContext);
  assert.equal(addedComponent.success, true, 'salary component helper should append and version');
  assert.equal(addedComponent.configuration.version, 2);
  assert.ok(addedComponent.configuration.salaryComponents.some(row => row.componentType === 'PERFORMANCE_BONUS'));

  const addedDeduction = svc.configureDeductionRule({
    tenantSlug: 'tabsons',
    configId,
    deduction: { name: 'Insurance', code: 'INS', deductionType: 'Insurance', formula: 'FIXED_AMOUNT', amount: 1000 },
    reason: 'Add insurance deduction'
  }, hrContext);
  assert.equal(addedDeduction.success, true, 'deduction helper should append and version');
  assert.equal(addedDeduction.configuration.version, 3);
  assert.ok(addedDeduction.configuration.deductionRules.some(row => row.deductionType === 'INSURANCE'));

  const published = svc.publishPayrollStructure({ tenantSlug: 'tabsons', configId, approval: { approved: true, approvedBy: 'DIR-1', reason: 'Ready for first payroll cycle' } }, directorContext);
  assert.equal(published.success, true, 'payroll publish should work with approval');
  assert.equal(published.configuration.status, 'PUBLISHED');
  assert.equal(published.configuration.version, 4);

  const simulation = svc.simulatePayroll({ tenantSlug: 'tabsons', configId, scope: 'Department' }, hrContext);
  assert.equal(simulation.success, true, 'payroll simulation should work');
  assert.equal(simulation.scope, 'DEPARTMENT');
  assert.ok(simulation.totalEmployees >= 1);
  assert.ok(simulation.totals.grossSalary > 0);
  assert.ok(simulation.totals.deductions > 0);
  assert.ok(simulation.totals.netSalary > 0);
  assert.equal(simulation.historicalPayrollModified, false);
  assert.equal(simulation.readOnly, true);
  assert.equal(protectedSnapshot(), before, 'payroll simulation must not mutate historical payroll, attendance, leave, employee, finance, or shift roster records');

  const updated = svc.updatePayrollStructure({
    tenantSlug: 'tabsons',
    configId,
    changes: { payrollCalendar: { salaryReleaseDay: 28, processingWindowDays: 4 }, reason: 'Release day change' }
  }, hrContext);
  assert.equal(updated.success, true, 'configuration update should version');
  assert.equal(updated.configuration.version, 5);
  assert.equal(updated.configuration.payrollCalendar.salaryReleaseDay, 28);

  const rollback = svc.rollbackPayrollVersion({
    tenantSlug: 'tabsons',
    configId,
    targetVersion: 4,
    reason: 'Rollback drill',
    approval: { approved: true, approvedBy: 'DIR-1', reason: 'Rollback drill' }
  }, directorContext);
  assert.equal(rollback.success, true, 'configuration rollback should work');
  assert.equal(rollback.configuration.version, 6);
  assert.equal(rollback.configuration.payrollCalendar.salaryReleaseDay, 30);
  assert.equal(protectedSnapshot(), before, 'payroll rollback must not mutate historical payroll or finance records');

  const validation = svc.validatePayrollConfiguration({ tenantSlug: 'tabsons', configId }, hrContext);
  assert.equal(validation.success, true, 'published configuration should validate without blocking errors');
  assert.ok(validation.issues.some(issue => issue.code === 'MISSING_BANK_DETAILS'), 'missing bank details should be visible as a warning');

  const analytics = svc.generatePayrollAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'payroll analytics should generate');
  assert.ok(analytics.analytics.payrollRuns >= 1);
  assert.ok(analytics.analytics.payrollCost >= 1);
  assert.ok(analytics.analytics.componentDistribution.BASIC_SALARY >= 1);
  assert.ok(analytics.payrollHealthScore >= 0);
  assert.ok(analytics.complianceScore >= 0);
  assert.ok(analytics.payrollReadinessScore >= 0);

  const dashboard = svc.generatePayrollDashboard({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(dashboard.success, true, 'dashboard should generate');
  assert.ok(dashboard.payrollStructures.length >= 1);
  assert.ok(dashboard.salaryComponents.length >= 1);
  assert.ok(dashboard.deductionRules.length >= 1);
  assert.ok(dashboard.payrollCalendar.length >= 1);
  assert.ok(dashboard.simulation.supportedScopes.includes('ENTIRE_COMPANY'));
  assert.ok(dashboard.configurationTimeline.length >= 1);
  assert.equal(dashboard.compatibility.existingPayrollPreserved, true);
  assert.equal(dashboard.compatibility.existingAttendancePreserved, true);
  assert.equal(dashboard.compatibility.existingLeavePreserved, true);
  assert.equal(dashboard.compatibility.existingEmployeePreserved, true);
  assert.equal(dashboard.compatibility.existingFinancePreserved, true);
  assert.equal(dashboard.compatibility.historicalPayrollUnaffected, true);
  assert.doesNotMatch(text(dashboard), /ABC confidential|ABC Employee|abc@example.com|999999|privateNote/i, 'dashboard must be tenant scoped and sanitized');

  const employeeBlocked = svc.createPayrollStructure(validConfig({ payrollCode: 'EMP-BLOCKED' }), employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot configure payroll');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'PAYROLL_CONFIGURATION_ACCESS_DENIED'));

  const crossTenant = svc.generatePayrollDashboard({ tenantSlug: 'abc' }, hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant payroll dashboard must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_PAYROLL_CONFIGURATION_BLOCKED'));

  assert.ok(global.DB.get().payrollConfigurations.length >= 1, 'payroll configurations should be persisted');
  assert.ok(global.DB.get().payrollConfigurationVersions.length >= 1, 'payroll configuration versions should be persisted');
  assert.ok(global.DB.get().payrollConfigurationRollbacks.length >= 1, 'payroll rollback history should be persisted');
  assert.ok(global.DB.get().payrollConfigurationSimulations.length >= 1, 'payroll simulations should be persisted as read-only records');
  assert.ok(global.DB.getAuditLogs().some(row => /PAYROLL_CONFIGURATION|PAYROLL_SIMULATION/.test(row.actionType || row.action || '')), 'payroll configuration actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /PAYROLL_CONFIGURATION|PAYROLL_SIMULATION/.test(row.eventType || row.category || '')), 'payroll configuration telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.PAYROLL_CONFIGURATION_CREATED, 'payroll configuration metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'payroll-configuration-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Payroll Configuration Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Payroll Configuration Center/i);
  assert.match(dashboardHtml, /Salary Components/i);
  assert.match(dashboardHtml, /Deduction Rules/i);
  assert.match(dashboardHtml, /PayrollConfigurationService/i);

  console.log('payrollConfigurationService.test.js passed');
}

main();
