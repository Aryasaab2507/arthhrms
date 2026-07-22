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

function seedPolicyData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'HR One', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', name: 'HR Head', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Director One', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Manager', role: 'MANAGER', department: 'Engineering', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Employee', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.policies = [
    {
      id: 'POL-1',
      policyId: 'POL-1',
      tenantSlug: 'tabsons',
      type: 'HR_POLICY',
      state: 'ACK_PENDING',
      version: '1.0',
      title: 'Holiday Policy',
      body: 'Private policy text for Tabsons only',
      department: 'ALL',
      mandatory: true,
      assignedEmployeeIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: ['EMP-1'],
      documentId: 'PDOC-1',
      expiresAt: '2026-06-30T00:00:00.000Z',
      createdAt: '2026-05-20T10:00:00.000Z'
    },
    {
      id: 'POL-2',
      policyId: 'POL-2',
      tenantSlug: 'tabsons',
      type: 'SECURITY_POLICY',
      state: 'PUBLISHED',
      version: '2.0',
      previousVersion: '1.0',
      title: 'Security Controls',
      body: 'Confidential security policy text',
      department: 'Engineering',
      mandatory: true,
      assignedEmployeeIds: ['EMP-1'],
      revisionType: 'MAJOR',
      documentId: 'PDOC-2',
      createdAt: '2026-05-22T10:00:00.000Z'
    },
    {
      id: 'POL-X',
      policyId: 'POL-X',
      tenantSlug: 'abc',
      type: 'HR_POLICY',
      state: 'ACK_PENDING',
      version: '1.0',
      title: 'ABC HR Policy',
      body: 'ABC confidential policy',
      mandatory: true,
      assignedEmployeeIds: ['EMP-X'],
      documentId: 'PDOC-X'
    }
  ];
  data.policyAcknowledgements = [
    { id: 'ACK-1', tenantSlug: 'tabsons', policyId: 'POL-1', empId: 'EMP-1', status: 'ACKNOWLEDGED', policyVersion: '1.0', acknowledgedAt: '2026-05-20T12:00:00.000Z' },
    { id: 'ACK-2', tenantSlug: 'tabsons', policyId: 'POL-1', empId: 'EMP-2', status: 'PENDING', policyVersion: '1.0', dueAt: '2026-05-19T12:00:00.000Z', privateNote: 'Employee has confidential note' },
    { id: 'ACK-3', tenantSlug: 'tabsons', policyId: 'POL-2', empId: 'EMP-1', status: 'PENDING', policyVersion: '1.0', dueAt: '2026-05-25T12:00:00.000Z' },
    { id: 'ACK-X', tenantSlug: 'abc', policyId: 'POL-X', empId: 'EMP-X', status: 'PENDING', privateNote: 'ABC secret acknowledgement' }
  ];
  data.policyRevisions = [
    { id: 'REV-1', tenantSlug: 'tabsons', policyId: 'POL-2', version: '2.0', previousVersion: '1.0', revisionType: 'MAJOR', resetAcknowledgements: true, summary: 'Confidential major revision summary' },
    { id: 'REV-X', tenantSlug: 'abc', policyId: 'POL-X', version: '1.1', previousVersion: '1.0', revisionType: 'MINOR', summary: 'ABC private revision' }
  ];
  data.policyDocuments = [
    { id: 'PDOC-1', documentId: 'PDOC-1', policyId: 'POL-1', tenantSlug: 'tabsons', category: 'policy', mimeType: 'application/pdf', fileName: 'holiday-policy-private.pdf', storagePath: 'tabsons/policies/POL-1.pdf', signedUrl: 'https://signed.example.com/holiday-policy-private.pdf', expiresAt: '2026-05-24T10:00:00.000Z', checksum: 'sha256-policy-1' },
    { id: 'PDOC-2', documentId: 'PDOC-2', policyId: 'POL-2', tenantSlug: 'tabsons', category: 'policy', mimeType: 'application/pdf', fileName: 'security-policy-private.pdf', storagePath: 'tabsons/policies/POL-2.pdf', signedUrl: 'https://signed.example.com/security-policy-private.pdf', checksum: 'sha256-policy-2' },
    { id: 'PDOC-X', documentId: 'PDOC-X', policyId: 'POL-X', tenantSlug: 'abc', category: 'policy', mimeType: 'application/pdf', fileName: 'abc-private-policy.pdf', publicUrl: 'https://public.example.com/abc-private-policy.pdf' }
  ];
  data.notifications = [
    { id: 'N-POL-1', tenantSlug: 'tabsons', module: 'Policy Governance', category: 'POLICY_REMINDER', title: 'Policy Reminder', message: 'Please acknowledge the policy', read: false, type: 'info', createdAt: '2026-05-20T10:00:00.000Z' },
    { id: 'N-POL-X', tenantSlug: 'abc', module: 'Policy Governance', category: 'POLICY_REMINDER', title: 'ABC Notice', message: 'ABC confidential notification', read: false, type: 'warn' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-POL-1', tenantSlug: 'tabsons', jobType: 'POLICY_REMINDER', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'POL-1' },
    { jobId: 'JOB-POL-X', tenantSlug: 'abc', jobType: 'POLICY_REMINDER', state: 'FAILED', payload: { message: 'ABC confidential payload' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.policyGovernanceRuns = [];
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
    'services/documentGovernanceService.js',
    'services/communicationGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/policyGovernanceService.js');
  seedPolicyData();

  const svc = global.PolicyGovernanceService;
  assert.ok(svc, 'PolicyGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.POLICY_STATES), 'policy states must be immutable');
  assert.ok(Object.isFrozen(svc.POLICY_TYPES), 'policy types must be immutable');
  assert.equal(global.__ARTHHRMS_POLICY_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyPolicyRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant policy visibility is critical');
  assert.equal(svc.classifyPolicyRisk({ publicDocument: true }), 'CRITICAL_BLOCKER', 'public policy document exposure is critical');
  assert.equal(svc.classifyPolicyRisk({ acknowledgementBypass: true }), 'HIGH_RISK', 'acknowledgement bypass is high risk');
  assert.equal(svc.classifyPolicyRisk({ overdueAcknowledgement: true }), 'WARNING', 'overdue acknowledgements are warning risk');

  const employeeAssigned = svc.validatePolicyScope({ tenantSlug: 'tabsons', policyId: 'POL-1', assignedEmployeeIds: ['EMP-1', 'EMP-2'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may see assigned policies only');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_POLICIES_ONLY');

  const managerTeam = svc.validatePolicyScope({ tenantSlug: 'tabsons', policyId: 'POL-1', assignedEmployeeIds: ['EMP-1', 'EMP-2'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team policy compliance');
  assert.equal(managerTeam.visibility, 'TEAM_POLICY_COMPLIANCE_VISIBILITY');

  const directorRaw = svc.validatePolicyScope({ tenantSlug: 'tabsons', policyId: 'POL-1', body: 'Private policy text for Tabsons only', assignedEmployeeIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' }
  });
  assert.equal(directorRaw.allowed, false, 'director must receive aggregate compliance summaries only');
  assert.ok(directorRaw.failures.some(item => item.failureCode === 'DIRECTOR_RAW_POLICY_ACCESS_BLOCKED'));

  const superAdminOverride = svc.validatePolicyPayload({
    tenantSlug: 'tabsons',
    policyId: 'POL-1',
    type: 'HR_POLICY',
    state: 'ACK_PENDING',
    acknowledgeOnBehalf: 'EMP-1'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.success, false, 'SUPER_ADMIN must not acknowledge policies on behalf of users');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'ACKNOWLEDGEMENT_BYPASS_BLOCKED'));

  const platformScope = svc.validatePolicyScope({ tenantSlug: 'tabsons', policyId: 'POL-1', assignedEmployeeIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in acknowledgement workflows');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_POLICY_ACCESS_BLOCKED'));

  const crossTenant = svc.validatePolicyScope({ tenantSlug: 'abc', policyId: 'POL-X', assignedEmployeeIds: ['EMP-X'], body: 'ABC confidential policy' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant policy visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /POL-X|EMP-X|ABC confidential|body/i, 'cross-tenant failure must not leak policy data');

  const malformed = svc.validatePolicyPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed policy payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_POLICY_PAYLOAD'));

  const platformParticipant = svc.validatePolicyPayload({
    tenantSlug: 'tabsons',
    policyId: 'POL-3',
    type: 'COMPLIANCE_POLICY',
    acknowledgementRoles: ['EMPLOYEE', 'PLATFORM_OWNER'],
    assignedEmployeeIds: ['EMP-1']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(platformParticipant.success, false, 'PLATFORM_OWNER must be excluded from acknowledgement workflow chains');
  assert.ok(platformParticipant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_ACKNOWLEDGEMENT_WORKFLOW_BLOCKED'));

  const normalized = svc.normalizePolicyPayload({
    tenantSlug: 'tabsons',
    policyId: 'POL-1',
    type: 'leave policy',
    state: 'ack pending',
    title: 'Holiday Policy',
    body: 'Private policy text for Tabsons only',
    assignedEmployeeIds: ['EMP-1', 'EMP-2']
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized policy output must be immutable');
  assert.equal(normalized.payload.state, 'ACK_PENDING');
  assert.equal(normalized.payload.type, 'LEAVE_POLICY');
  assert.doesNotMatch(JSON.stringify(normalized), /Private policy|body|EMP-1|EMP-2/i, 'normalized payload should not expose confidential policy data');

  const documentAccess = svc.validatePolicyDocument({
    tenantSlug: 'tabsons',
    policyId: 'POL-1',
    documentId: 'PDOC-1',
    mimeType: 'application/pdf',
    fileName: 'holiday-policy-private.pdf',
    signedUrl: 'https://signed.example.com/holiday-policy-private.pdf',
    expiresAt: '2026-05-24T10:00:00.000Z'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(documentAccess.success, true, 'HR may access governed policy document metadata');
  assert.equal(documentAccess.documentGovernance.signedAccessRequired, true, 'policy documents should require signed access');
  assert.doesNotMatch(JSON.stringify(documentAccess), /holiday-policy|signed\.example|fileName|signedUrl/i, 'policy document governance output must not expose file locations');

  const publicDocument = svc.validatePolicyDocument({
    tenantSlug: 'tabsons',
    policyId: 'POL-1',
    documentId: 'PDOC-PUBLIC',
    mimeType: 'application/pdf',
    publicUrl: 'https://public.example.com/policy-public.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(publicDocument.success, false, 'public policy document exposure must be blocked');
  assert.ok(publicDocument.failures.some(item => item.failureCode === 'PUBLIC_POLICY_DOCUMENT_EXPOSURE_BLOCKED'));

  const degradation = svc.detectComplianceDegradation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(degradation.success, true, 'compliance degradation should be detected safely');
  assert.ok(degradation.summary.pendingAcknowledgements >= 1, 'pending acknowledgements should be visible');
  assert.ok(degradation.summary.overdueAcknowledgements >= 1, 'overdue acknowledgements should be visible');
  assert.ok(Object.isFrozen(degradation.departmentTrends), 'department trend output must be immutable');
  assert.doesNotMatch(JSON.stringify(degradation), /ABC confidential|ABC secret|Private policy|Employee has confidential/i, 'degradation output must not leak private acknowledgement data');

  const dataBefore = global.DB.get();
  const historicalBefore = JSON.stringify({
    policies: dataBefore.policies,
    policyAcknowledgements: dataBefore.policyAcknowledgements,
    policyRevisions: dataBefore.policyRevisions,
    policyDocuments: dataBefore.policyDocuments
  });
  const schedule = svc.schedulePolicyReminder({
    tenantSlug: 'tabsons',
    policyId: 'POL-1',
    type: 'HR_POLICY',
    priority: 'HIGH',
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'policy reminder scheduling should work');
  assert.ok(schedule.asyncJob, 'policy reminders should integrate with async jobs');
  assert.equal(JSON.stringify({
    policies: global.DB.get().policies,
    policyAcknowledgements: global.DB.get().policyAcknowledgements,
    policyRevisions: global.DB.get().policyRevisions,
    policyDocuments: global.DB.get().policyDocuments
  }), historicalBefore, 'policy reminder scheduling must not mutate historical policy records');

  const report = svc.generatePolicyGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'policy governance report should generate safely');
  assert.equal(report.readOnly, true, 'policy governance report should be read-only');
  assert.ok(report.policyBroadcastHealth.totalPolicies >= 2, 'policy broadcast health should be visible');
  assert.ok(report.acknowledgementGovernance.pendingAcknowledgements >= 1, 'acknowledgement status should be visible');
  assert.ok(report.revisionGovernance.majorRevisions >= 1, 'policy revision governance should be visible');
  assert.ok(report.policyAnalytics.overdueAcknowledgements >= 1, 'policy analytics should include overdue acknowledgements');
  assert.equal(report.accessGovernance.superAdminAcknowledgementOverride, false, 'SUPER_ADMIN acknowledgement override remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /POL-X|EMP-X|ABC confidential|ABC secret|Private policy text|Employee has confidential|body|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential policy data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /POLICY_GOVERNANCE|POLICY_REMINDER/.test(row.eventType || row.category || '')), 'policy telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.POLICY_GOVERNANCE_REPORTED, 'policy governance metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /POLICY_GOVERNANCE|POLICY_REMINDER/.test(row.actionType || row.action || '')), 'policy actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.schedulePolicyReminder({ tenantSlug: 'tabsons', policyId: 'POL-SELF', type: 'HR_POLICY' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true,
      preview: true
    });
    assert.equal(degraded.success, true, 'missing async/notification dependencies should degrade safely');
    assert.equal(degraded.asyncJob.success, false, 'degraded schedule should be governance-visible without async dependency');
  } finally {
    if (originalAsync) global.AsyncJobService = originalAsync;
    if (originalNotify) global.NotificationOrchestrationService = originalNotify;
  }

  console.log('policyGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
