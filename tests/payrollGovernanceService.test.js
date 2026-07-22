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

function seedPayrollData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', email: 'one@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 900000 },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', email: 'two@example.com', role: 'EMPLOYEE', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 850000 },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Tenant Employee', email: 'x@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 999999 }
  ];
  data.payroll = [
    {
      id: 'PAY-1',
      payrollId: 'PAY-1',
      empId: 'EMP-1',
      tenantSlug: 'tabsons',
      payrollMonth: 'May 2026',
      month: 'May 2026',
      status: 'Pending',
      payrollStatus: 'Pending',
      basicSalary: 450000,
      grossSalary: 900000,
      netSalary: 810000,
      deductions: 90000,
      processedAt: '2026-05-20T00:00:00.000Z'
    },
    {
      id: 'PAY-X',
      payrollId: 'PAY-X',
      empId: 'EMP-X',
      tenantSlug: 'abc',
      payrollMonth: 'May 2026',
      month: 'May 2026',
      status: 'Completed',
      payrollStatus: 'Completed',
      netSalary: 999999,
      grossSalary: 999999,
      processedAt: '2026-05-21T00:00:00.000Z'
    }
  ];
  data.salaryStructures = [
    { id: 'SAL-1', structureId: 'SAL-1', empId: 'EMP-1', tenantSlug: 'tabsons', basicSalary: 450000, hra: 225000, allowances: 225000, deductions: 90000, status: 'Active' },
    { id: 'SAL-X', structureId: 'SAL-X', empId: 'EMP-X', tenantSlug: 'abc', basicSalary: 999999, hra: 0, allowances: 0, deductions: 0, status: 'Active' }
  ];
  data.payslips = [
    { id: 'PS-1', payslipId: 'PS-1', payrollId: 'PAY-1', empId: 'EMP-1', tenantSlug: 'tabsons', payrollMonth: 'May 2026', netSalary: 810000, status: 'Generated' },
    { id: 'PS-X', payslipId: 'PS-X', payrollId: 'PAY-X', empId: 'EMP-X', tenantSlug: 'abc', payrollMonth: 'May 2026', netSalary: 999999, status: 'Generated' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-PAY-1', tenantSlug: 'tabsons', jobType: 'PAYROLL_GENERATION', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'PAYROLL-May-2026' },
    { jobId: 'JOB-PAY-X', tenantSlug: 'abc', jobType: 'PAYROLL_GENERATION', state: 'FAILED', priority: 'HIGH', retryAttempts: 3, maxRetries: 3, salary: 999999, payrollAmount: 999999, correlationId: 'PAYROLL-ABC' }
  ];
  data.payrollGovernanceRuns = [];
  data.payrollAuditMarkers = [];
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
    'services/payrollService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/payrollGovernanceService.js');
  seedPayrollData();

  const svc = global.PayrollGovernanceService;
  assert.ok(svc, 'PayrollGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.PAYROLL_STATES), 'payroll states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_PAYROLL_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyPayrollRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant payroll risk is critical');
  assert.equal(svc.classifyPayrollRisk({ duplicatePayroll: true }), 'HIGH_RISK', 'duplicate payroll risk is high');
  assert.equal(svc.classifyPayrollRisk({ malformedDeduction: true }), 'WARNING', 'malformed deductions are warning risk');

  const superAdminScope = svc.validatePayrollScope({ tenantSlug: 'tabsons', empId: 'EMP-1', netSalary: 810000 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminScope.allowed, false, 'SUPER_ADMIN must not see salary data by default');
  assert.ok(superAdminScope.failures.some(item => item.failureCode === 'SUPER_ADMIN_SALARY_VISIBILITY_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminScope), /810000|netSalary|grossSalary|basicSalary|salaryAmount/i, 'salary-block output must not expose raw salary fields');

  const employeeOwn = svc.validatePayrollScope({ tenantSlug: 'tabsons', empId: 'EMP-1', payrollId: 'PAY-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', empId: 'EMP-1', id: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own payslip/payroll scope');
  assert.equal(employeeOwn.visibility, 'OWN_SALARY_ONLY');

  const managerScope = svc.validatePayrollScope({ tenantSlug: 'tabsons', empId: 'EMP-1', payrollId: 'PAY-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', empId: 'MGR-1', id: 'MGR-1' }
  });
  assert.equal(managerScope.allowed, false, 'manager must not get direct salary access by default');

  const crossTenantScope = svc.validatePayrollScope({ tenantSlug: 'abc', empId: 'EMP-X', netSalary: 999999 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenantScope.allowed, false, 'cross-tenant payroll visibility must be blocked');
  assert.equal(crossTenantScope.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenantScope), /999999|netSalary|grossSalary|basicSalary|salaryAmount|EMP-X/i, 'cross-tenant failure must be redacted');

  const validation = svc.validatePayrollRun({
    tenantSlug: 'tabsons',
    payrollMonth: 'May 2026',
    records: [
      { empId: 'EMP-1', tenantSlug: 'tabsons', grossSalary: 900000, netSalary: 810000, deductions: 90000, tds: 1000 },
      { empId: 'EMP-2', tenantSlug: 'tabsons', grossSalary: 850000, netSalary: -1, deductions: -20, tds: 'bad-tax' },
      { empId: 'EMP-X', tenantSlug: 'abc', grossSalary: 999999, netSalary: 999999, deductions: 0 }
    ]
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(validation.success, false, 'invalid payroll run should require review');
  assert.ok(validation.failures.some(item => item.failureCode === 'DUPLICATE_PAYROLL_RUN'), 'duplicate payroll run must be detected');
  assert.ok(validation.failures.some(item => item.failureCode === 'MALFORMED_COMPENSATION_VALUE'), 'malformed compensation must be detected');
  assert.ok(validation.failures.some(item => item.failureCode === 'TENANT_MISMATCH'), 'tenant mismatch must be detected');
  assert.ok(Object.isFrozen(validation), 'validation output must be immutable');
  assert.doesNotMatch(JSON.stringify(validation), /999999|900000|850000|810000|grossSalary|netSalary|basicSalary|salaryAmount/i, 'validation output must redact salary values');

  const duplicate = svc.detectDuplicatePayrollRuns({
    tenantSlug: 'tabsons',
    payrollMonth: 'May 2026',
    records: [{ empId: 'EMP-1', tenantSlug: 'tabsons' }]
  }, {
    tenantSlug: 'tabsons'
  });
  assert.equal(duplicate.duplicates.length, 1, 'existing payroll duplicate should be returned');
  assert.ok(Object.isFrozen(duplicate), 'duplicate output must be immutable');

  const scheduled = svc.schedulePayrollRun({
    tenantSlug: 'tabsons',
    payrollMonth: 'June 2026',
    records: [
      { empId: 'EMP-1', tenantSlug: 'tabsons', grossSalary: 900000, netSalary: 810000, deductions: 90000 },
      { empId: 'EMP-2', tenantSlug: 'tabsons', grossSalary: 850000, netSalary: 790000, deductions: 60000 }
    ],
    schedule: { runAt: '2026-06-25T02:00:00.000Z' },
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(scheduled.success, true, 'safe payroll run should schedule');
  assert.equal(scheduled.state, 'REVIEW_PENDING');
  assert.equal(scheduled.asyncJob?.success, true, 'payroll scheduling should integrate with AsyncJobService');
  assert.ok(global.DB.get().asyncJobs.some(row => row.jobType === 'PAYROLL_GENERATION' && row.tenantSlug === 'tabsons'), 'PAYROLL_GENERATION job should be queued');
  assert.equal(global.DB.get().payroll.length, 2, 'validation-only scheduling must not create payroll records');
  assert.doesNotMatch(JSON.stringify(scheduled), /900000|810000|850000|790000|grossSalary|netSalary|basicSalary|salaryAmount/i, 'scheduled output must not expose payroll values');

  const payslipOwn = svc.generatePayslipGovernance({ payrollId: 'PAY-1', empId: 'EMP-1', tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', empId: 'EMP-1', id: 'EMP-1' }
  });
  assert.equal(payslipOwn.success, true, 'employee should get own payslip governance marker');
  assert.equal(payslipOwn.visibility, 'OWN_SALARY_ONLY');
  assert.ok(payslipOwn.download?.secure, 'payslip download marker should be secure');
  assert.doesNotMatch(JSON.stringify(payslipOwn), /810000|netSalary|grossSalary|basicSalary|salaryAmount/i, 'payslip governance output must be redacted');

  const payslipCross = svc.generatePayslipGovernance({ payrollId: 'PAY-X', empId: 'EMP-X', tenantSlug: 'abc' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(payslipCross.success, false, 'cross-tenant payslip access must be blocked');
  assert.equal(payslipCross.classification, 'CRITICAL_BLOCKER');

  const report = svc.generatePayrollGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(report.success, true, 'governance report should generate');
  assert.ok(report.processingHealth.totalPayrollRuns >= 1, 'payroll processing health should be visible');
  assert.ok(report.payrollQueue.asyncPayrollJobs >= 1, 'payroll queue visibility should be available');
  assert.equal(report.salaryIsolation.superAdminSalaryVisible, false, 'SUPER_ADMIN salary visibility must remain false');
  assert.ok(report.metadata.salaryConfidentialityPreserved, 'salary confidentiality metadata must be present');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /999999|900000|810000|grossSalary|netSalary|salaryAmount|EMP-X/i, 'governance report must filter salary and cross-tenant data');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  delete global.AsyncJobService;
  delete global.NotificationOrchestrationService;
  const degraded = svc.schedulePayrollRun({
    tenantSlug: 'tabsons',
    payrollMonth: 'July 2026',
    records: [{ empId: 'EMP-1', tenantSlug: 'tabsons', grossSalary: 900000, netSalary: 810000, deductions: 90000 }],
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degraded.success, true, 'missing async dependencies should degrade safely');
  assert.equal(degraded.asyncJob.success, false, 'async warning should be represented without throwing');
  global.AsyncJobService = originalAsync;
  global.NotificationOrchestrationService = originalNotify;

  const malformed = svc.validatePayrollRun(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_PAYROLL_PAYLOAD'));

  console.log('payrollGovernanceService.test.js passed');
}

main();
