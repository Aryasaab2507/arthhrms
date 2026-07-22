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

function seedExpenseData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons',
    currency: 'INR'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'PILOT_ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'PILOT_ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', email: 'one@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', email: 'two@example.com', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', managerId: 'MGR-1' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Tenant Employee', email: 'x@example.com', role: 'EMPLOYEE', department: 'Operations', tenantSlug: 'abc', tenantId: 'TEN-abc', managerId: 'MGR-X' }
  ];
  data.expenseClaims = [
    {
      id: 'EXP-1',
      expenseId: 'EXP-1',
      claimId: 'EXP-1',
      empId: 'EMP-1',
      tenantSlug: 'tabsons',
      category: 'Travel',
      date: '2026-05-20',
      expenseDate: '2026-05-20',
      amount: 4500,
      currency: 'INR',
      description: 'Client visit private receipt details',
      billFileName: 'receipt-exp-1.pdf',
      attachmentUrl: 'https://storage.example.com/private/receipt-exp-1.pdf',
      receiptUrl: 'https://storage.example.com/private/receipt-exp-1.pdf',
      receiptPrivateNote: 'cab route private',
      status: 'Pending Manager Approval',
      managerStatus: 'Pending',
      financeStatus: 'Pending',
      finalStatus: 'Pending',
      submittedOn: '2026-05-20',
      submittedAt: '2026-05-20T09:30:00.000Z'
    },
    {
      id: 'EXP-2',
      expenseId: 'EXP-2',
      claimId: 'EXP-2',
      empId: 'EMP-2',
      tenantSlug: 'tabsons',
      category: 'Meals',
      date: '2026-05-21',
      expenseDate: '2026-05-21',
      amount: 1200,
      currency: 'INR',
      description: 'Team meal',
      billFileName: 'receipt-exp-2.png',
      attachmentUrl: 'private://receipt-exp-2',
      status: 'Pending HR Payment',
      managerStatus: 'Approved',
      financeStatus: 'Pending',
      finalStatus: 'Manager Approved',
      submittedOn: '2026-05-21',
      submittedAt: '2026-05-21T10:30:00.000Z'
    },
    {
      id: 'EXP-X',
      expenseId: 'EXP-X',
      claimId: 'EXP-X',
      empId: 'EMP-X',
      tenantSlug: 'abc',
      category: 'Travel',
      date: '2026-05-21',
      expenseDate: '2026-05-21',
      amount: 999999,
      currency: 'INR',
      description: 'Other Tenant private reimbursement',
      billFileName: 'abc-secret.pdf',
      attachmentUrl: 'https://storage.example.com/private/abc-secret.pdf',
      receiptPrivateNote: 'abc confidential receipt',
      status: 'Pending Manager Approval',
      submittedOn: '2026-05-21'
    }
  ];
  data.expenseReceipts = [
    { id: 'RCPT-1', expenseId: 'EXP-1', tenantSlug: 'tabsons', empId: 'EMP-1', fileName: 'receipt-exp-1.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/EMP-1/EXP-1/receipt-exp-1.pdf', signedUrl: 'https://signed.example.com/private-exp-1', privateNote: 'receipt private metadata' },
    { id: 'RCPT-X', expenseId: 'EXP-X', tenantSlug: 'abc', empId: 'EMP-X', fileName: 'abc-secret.pdf', mimeType: 'application/pdf', storagePath: 'abc/EMP-X/EXP-X/abc-secret.pdf', signedUrl: 'https://signed.example.com/abc-secret', privateNote: 'abc private metadata' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-EXP-1', tenantSlug: 'tabsons', jobType: 'REIMBURSEMENT_PROCESSING', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'EXP-2' },
    { jobId: 'JOB-EXP-X', tenantSlug: 'abc', jobType: 'REIMBURSEMENT_PROCESSING', state: 'FAILED', priority: 'HIGH', retryAttempts: 3, maxRetries: 3, correlationId: 'EXP-X', amount: 999999, payload: { amount: 999999, receiptUrl: 'https://signed.example.com/abc-secret' } }
  ];
  data.expenseGovernanceRuns = [];
  data.expenseAuditMarkers = [];
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
    'services/storageService.js',
    'services/expenseService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/expenseGovernanceService.js');
  seedExpenseData();

  const svc = global.ExpenseGovernanceService;
  assert.ok(svc, 'ExpenseGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.EXPENSE_STATES), 'expense states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_EXPENSE_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyExpenseRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant expense risk is critical');
  assert.equal(svc.classifyExpenseRisk({ duplicateClaim: true }), 'HIGH_RISK', 'duplicate reimbursements are high risk');
  assert.equal(svc.classifyExpenseRisk({ malformedReceipt: true }), 'WARNING', 'malformed receipts are warning risk');

  const employeeOwn = svc.validateExpenseScope({ tenantSlug: 'tabsons', empId: 'EMP-1', expenseId: 'EXP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may access own expense scope');
  assert.equal(employeeOwn.visibility, 'OWN_EXPENSE_ONLY');

  const managerTeam = svc.validateExpenseScope({ tenantSlug: 'tabsons', empId: 'EMP-1', expenseId: 'EXP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may access team expense scope');
  assert.equal(managerTeam.visibility, 'TEAM_EXPENSE_VISIBILITY');

  const superAdminApproval = svc.validateExpenseScope({ tenantSlug: 'tabsons', empId: 'EMP-1', expenseId: 'EXP-1', approveReimbursement: true, amount: 4500 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminApproval.allowed, false, 'SUPER_ADMIN must not approve reimbursements directly');
  assert.ok(superAdminApproval.failures.some(item => item.failureCode === 'SUPER_ADMIN_REIMBURSEMENT_APPROVAL_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminApproval), /4500|amount|receipt|private/i, 'SUPER_ADMIN failure output must redact reimbursement details');

  const platformScope = svc.validateExpenseScope({ tenantSlug: 'tabsons', empId: 'EMP-1', expenseId: 'EXP-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in reimbursement hierarchy');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_REIMBURSEMENT_HIERARCHY_BLOCKED'));

  const crossTenant = svc.validateExpenseScope({ tenantSlug: 'abc', empId: 'EMP-X', expenseId: 'EXP-X', amount: 999999, description: 'Other Tenant private reimbursement' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant expense visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /EMP-X|999999|Other Tenant|private reimbursement|receipt/i, 'cross-tenant failure must not leak reimbursement data');

  const validation = svc.validateExpenseClaim({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    category: 'Alcohol',
    date: '2026-05-20',
    amount: 4500,
    description: 'duplicate private receipt',
    receipt: { fileName: 'malware.exe', mimeType: 'application/x-msdownload', size: 4000, publicUrl: 'https://public.example.com/malware.exe' },
    approvalChain: [{ role: 'MANAGER' }, { role: 'PLATFORM_OWNER' }]
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(validation.success, false, 'unsafe expense claim should require review');
  assert.ok(validation.failures.some(item => item.failureCode === 'DUPLICATE_EXPENSE_CLAIM'), 'duplicate claim must be detected');
  assert.ok(validation.failures.some(item => item.failureCode === 'UNSUPPORTED_RECEIPT_UPLOAD'), 'unsupported receipt upload must be blocked');
  assert.ok(validation.failures.some(item => item.failureCode === 'INVALID_REIMBURSEMENT_CATEGORY'), 'invalid category must be blocked');
  assert.ok(validation.failures.some(item => item.failureCode === 'EXPENSE_POLICY_VIOLATION'), 'policy violation must be detected');
  assert.ok(validation.failures.some(item => item.failureCode === 'INVALID_REIMBURSEMENT_APPROVAL_CHAIN'), 'PLATFORM_OWNER approval chain must be blocked');
  assert.ok(Object.isFrozen(validation), 'validation output must be immutable');
  assert.doesNotMatch(JSON.stringify(validation), /4500|amount|duplicate private|malware\.exe|receiptUrl|public\.example/i, 'validation output must redact reimbursement details');

  const tenantMismatch = svc.validateExpenseClaim({ tenantSlug: 'abc', empId: 'EMP-X', category: 'Travel', date: '2026-05-23', amount: 1000 }, { tenantSlug: 'tabsons' });
  assert.ok(tenantMismatch.failures.some(item => item.failureCode === 'TENANT_MISMATCH'), 'tenant mismatch must be detected');
  assert.equal(tenantMismatch.classification, 'CRITICAL_BLOCKER');

  const normalized = svc.normalizeExpensePayload({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    category: 'Travel',
    amount: 4500,
    receiptUrl: 'https://storage.example.com/private/receipt-exp-1.pdf',
    privateNote: 'private receipt memo'
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized expense payload must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /4500|amount|receipt-exp-1|private receipt memo|receiptUrl/i, 'normalization must redact reimbursement details');

  const receipt = svc.validateReceiptGovernance({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    expenseId: 'EXP-1',
    fileName: 'receipt-exp-1.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    publicUrl: 'https://public.example.com/receipt-exp-1.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(receipt.success, false, 'public receipt exposure must be blocked');
  assert.ok(receipt.failures.some(item => item.failureCode === 'PUBLIC_RECEIPT_EXPOSURE_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(receipt), /receipt-exp-1|public\.example|private/i, 'receipt governance output must hide receipt references');

  const duplicate = svc.detectDuplicateClaims({
    tenantSlug: 'tabsons',
    empId: 'EMP-1',
    category: 'Travel',
    date: '2026-05-20',
    amount: 4500
  }, { tenantSlug: 'tabsons' });
  assert.equal(duplicate.duplicates.length, 1, 'existing duplicate expense should be returned');
  assert.ok(Object.isFrozen(duplicate), 'duplicate output must be immutable');
  assert.doesNotMatch(JSON.stringify(duplicate), /4500|receipt|private/i, 'duplicate output must be redacted');

  const originalClaimsLength = global.DB.get().expenseClaims.length;
  const scheduled = svc.scheduleReimbursementProcessing({
    tenantSlug: 'tabsons',
    expenseId: 'EXP-2',
    schedule: { runAt: '2026-05-23T05:30:00.000Z' },
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(scheduled.success, true, 'safe reimbursement should schedule');
  assert.equal(scheduled.state, 'REVIEW_PENDING');
  assert.equal(scheduled.asyncJob?.success, true, 'reimbursement scheduling should integrate with AsyncJobService');
  assert.ok(global.DB.get().asyncJobs.some(row => row.jobType === 'REIMBURSEMENT_PROCESSING' && row.tenantSlug === 'tabsons'), 'REIMBURSEMENT_PROCESSING job should be queued');
  assert.equal(global.DB.get().expenseClaims.length, originalClaimsLength, 'validation-only scheduling must not create or mutate expense claims');
  assert.doesNotMatch(JSON.stringify(scheduled), /1200|amount|receipt|private/i, 'scheduled output must not expose reimbursement values');

  const report = svc.generateExpenseGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(report.success, true, 'expense governance report should generate');
  assert.ok(report.reimbursementHealth.totalExpenseClaims >= 2, 'reimbursement health should be visible');
  assert.ok(report.receiptGovernance.tenantScopedReceipts >= 1, 'receipt governance should be visible');
  assert.ok(report.policyEnforcement.policyViolations >= 0, 'policy enforcement summary should be available');
  assert.ok(report.asyncReimbursement.asyncReimbursementJobs >= 1, 'async reimbursement queue should be visible');
  assert.equal(report.visibility.superAdminApprovalAuthority, false, 'SUPER_ADMIN reimbursement approval must remain blocked');
  assert.ok(Object.isFrozen(report), 'governance report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /EMP-X|999999|abc-secret|private reimbursement|receipt-exp|4500|1200/i, 'report must filter cross-tenant and receipt data');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  delete global.AsyncJobService;
  delete global.NotificationOrchestrationService;
  const degraded = svc.scheduleReimbursementProcessing({
    tenantSlug: 'tabsons',
    expenseId: 'EXP-2',
    validationOnly: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(degraded.success, true, 'missing async dependencies should degrade safely');
  assert.equal(degraded.asyncJob.success, false, 'missing async dependency should be represented without throwing');
  global.AsyncJobService = originalAsync;
  global.NotificationOrchestrationService = originalNotify;

  const malformed = svc.validateExpenseClaim(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_EXPENSE_PAYLOAD'));

  console.log('expenseGovernanceService.test.js passed');
}

main();
