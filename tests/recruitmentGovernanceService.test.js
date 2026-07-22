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

function seedRecruitmentData() {
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
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', email: 'manager@example.com', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'HR One', email: 'hr@example.com', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', name: 'HR Head', email: 'hrh@example.com', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Manager', email: 'mx@example.com', role: 'MANAGER', department: 'Engineering', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.jobOpenings = [
    {
      id: 'JO-1',
      requisitionId: 'REQ-1',
      tenantSlug: 'tabsons',
      title: 'Senior Engineer',
      department: 'Engineering',
      openings: 2,
      status: 'Published',
      state: 'JOB_PUBLISHED',
      approvalStatus: 'APPROVED',
      hiringManagerId: 'MGR-1',
      recruiterId: 'HR-1',
      budgetIndicator: 'APPROVED',
      hiringLimit: 2,
      expiresOn: '2026-05-20',
      postedOn: '2026-05-01'
    },
    {
      id: 'JO-2',
      requisitionId: 'REQ-2',
      tenantSlug: 'tabsons',
      title: 'Operations Analyst',
      department: 'Operations',
      openings: 1,
      status: 'Draft',
      state: 'JOB_DRAFT',
      approvalStatus: 'PENDING',
      hiringManagerId: 'MGR-1',
      recruiterId: 'HR-1',
      budgetIndicator: 'REVIEW',
      expiresOn: '2026-06-30',
      postedOn: '2026-05-10'
    },
    {
      id: 'JO-X',
      requisitionId: 'REQ-X',
      tenantSlug: 'abc',
      title: 'ABC Secret Role',
      department: 'Engineering',
      status: 'Published',
      state: 'JOB_PUBLISHED',
      hiringManagerId: 'MGR-X',
      recruiterId: 'HR-X',
      budgetIndicator: 'SECRET'
    }
  ];
  data.jobApplications = [
    {
      id: 'JA-1',
      applicationId: 'JA-1',
      candidateId: 'CAN-1',
      tenantSlug: 'tabsons',
      jobId: 'JO-1',
      candidateName: 'Candidate One',
      email: 'candidate.one@example.com',
      mobile: '+919999999991',
      resumeFileName: 'candidate-one-private.pdf',
      resumeUrl: 'https://signed.example.com/candidate-one-private.pdf',
      expectedSalary: 2200000,
      pipelineStage: 'Interview',
      status: 'INTERVIEW_PENDING',
      state: 'INTERVIEW_PENDING',
      recruiterId: 'HR-1',
      hiringManagerId: 'MGR-1',
      interviewers: ['MGR-1'],
      appliedOn: '2026-05-05',
      interviewDate: '2026-05-18',
      feedback: 'confidential technical feedback',
      evaluationScore: 4
    },
    {
      id: 'JA-2',
      applicationId: 'JA-2',
      candidateId: 'CAN-2',
      tenantSlug: 'tabsons',
      jobId: 'JO-1',
      candidateName: 'Candidate Two',
      email: 'candidate.two@example.com',
      resumeFileName: 'candidate-two.pdf',
      expectedSalary: 1800000,
      pipelineStage: 'Offered',
      status: 'OFFER_PENDING',
      state: 'OFFER_PENDING',
      recruiterId: 'HR-1',
      hiringManagerId: 'MGR-1',
      appliedOn: '2026-05-03',
      offerCompensation: 1800000,
      offerApprovalStatus: 'PENDING'
    },
    {
      id: 'JA-X',
      applicationId: 'JA-X',
      candidateId: 'CAN-X',
      tenantSlug: 'abc',
      jobId: 'JO-X',
      candidateName: 'Other Tenant Candidate',
      email: 'candidate.x@example.com',
      resumeFileName: 'abc-secret-resume.pdf',
      resumeUrl: 'https://signed.example.com/abc-secret-resume.pdf',
      expectedSalary: 9999999,
      pipelineStage: 'Interview',
      status: 'INTERVIEW_PENDING',
      feedback: 'abc confidential interview feedback'
    }
  ];
  data.recruitmentInterviews = [
    { id: 'INT-1', interviewId: 'INT-1', tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', jobId: 'JO-1', interviewerId: 'MGR-1', scheduledAt: '2026-05-18T10:00:00.000Z', status: 'PENDING_FEEDBACK', feedback: 'private panel note' },
    { id: 'INT-2', interviewId: 'INT-2', tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', jobId: 'JO-1', interviewerId: 'HR-1', scheduledAt: '2026-05-19T10:00:00.000Z', status: 'SCHEDULED' },
    { id: 'INT-X', interviewId: 'INT-X', tenantSlug: 'abc', applicationId: 'JA-X', candidateId: 'CAN-X', jobId: 'JO-X', interviewerId: 'MGR-X', scheduledAt: '2026-05-18T10:00:00.000Z', status: 'PENDING_FEEDBACK', feedback: 'abc private interview note' }
  ];
  data.recruitmentOffers = [
    { id: 'OFF-1', offerId: 'OFF-1', tenantSlug: 'tabsons', applicationId: 'JA-2', candidateId: 'CAN-2', jobId: 'JO-1', status: 'OFFER_PENDING', approvalStatus: 'PENDING', compensation: 1800000 },
    { id: 'OFF-X', offerId: 'OFF-X', tenantSlug: 'abc', applicationId: 'JA-X', candidateId: 'CAN-X', status: 'OFFER_PENDING', compensation: 9999999 }
  ];
  data.candidateDocuments = [
    { id: 'CDOC-1', documentId: 'CDOC-1', tenantSlug: 'tabsons', candidateId: 'CAN-1', applicationId: 'JA-1', category: 'resume', fileName: 'candidate-one-private.pdf', mimeType: 'application/pdf', storagePath: 'tabsons/candidates/CAN-1/resume.pdf', signedUrl: 'https://signed.example.com/candidate-one-private.pdf' },
    { id: 'CDOC-X', documentId: 'CDOC-X', tenantSlug: 'abc', candidateId: 'CAN-X', applicationId: 'JA-X', category: 'resume', fileName: 'abc-secret-resume.pdf', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/abc-secret-resume.pdf' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-REC-1', tenantSlug: 'tabsons', jobType: 'INTERVIEW_WORKFLOW', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'JA-1' },
    { jobId: 'JOB-REC-X', tenantSlug: 'abc', jobType: 'RECRUITMENT_NOTIFICATION', state: 'FAILED', priority: 'HIGH', retryAttempts: 3, maxRetries: 3, correlationId: 'JA-X', payload: { resumeFileName: 'abc-secret-resume.pdf', expectedSalary: 9999999 } }
  ];
  data.recruitmentGovernanceRuns = [];
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
    'services/documentGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/recruitmentGovernanceService.js');
  seedRecruitmentData();

  const svc = global.RecruitmentGovernanceService;
  assert.ok(svc, 'RecruitmentGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.RECRUITMENT_STATES), 'recruitment states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_RECRUITMENT_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyHiringRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant candidate visibility is critical');
  assert.equal(svc.classifyHiringRisk({ hiringBypass: true }), 'HIGH_RISK', 'unsafe hiring bypass is high risk');
  assert.equal(svc.classifyHiringRisk({ malformedInterview: true }), 'WARNING', 'malformed interview payload is warning risk');

  const candidateOwn = svc.validateRecruitmentScope({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'CANDIDATE', id: 'CAN-1', candidateId: 'CAN-1' }
  });
  assert.equal(candidateOwn.allowed, true, 'candidate may see own application');
  assert.equal(candidateOwn.visibility, 'OWN_APPLICATION_ONLY');

  const managerAssigned = svc.validateRecruitmentScope({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', hiringManagerId: 'MGR-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerAssigned.allowed, true, 'assigned manager may see hiring pipeline metadata');
  assert.equal(managerAssigned.visibility, 'ASSIGNED_HIRING_VISIBILITY');

  const superAdminResume = svc.validateRecruitmentScope({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1', resumeFileName: 'candidate-one-private.pdf', expectedSalary: 2200000 }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminResume.allowed, false, 'SUPER_ADMIN must not access resumes by default');
  assert.ok(superAdminResume.failures.some(item => item.failureCode === 'SUPER_ADMIN_RESUME_ACCESS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminResume), /candidate-one|expectedSalary|resumeFileName|2200000/i, 'SUPER_ADMIN failure output must redact candidate details');

  const platformScope = svc.validateRecruitmentScope({ tenantSlug: 'tabsons', applicationId: 'JA-1', candidateId: 'CAN-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in recruitment hierarchy');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_RECRUITMENT_ACCESS_BLOCKED'));

  const crossTenant = svc.validateRecruitmentScope({ tenantSlug: 'abc', applicationId: 'JA-X', candidateId: 'CAN-X', resumeFileName: 'abc-secret-resume.pdf', feedback: 'abc confidential interview feedback' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant candidate visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /CAN-X|JA-X|abc-secret|confidential interview|resumeFileName/i, 'cross-tenant failure must not leak candidate data');

  const malformed = svc.validateInterviewWorkflow(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed interview payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_INTERVIEW_PAYLOAD'));

  const bypass = svc.validateInterviewWorkflow({
    tenantSlug: 'tabsons',
    applicationId: 'JA-1',
    candidateId: 'CAN-1',
    jobId: 'JO-1',
    state: 'OFFER_ACCEPTED',
    directHire: true,
    skipOfferApproval: true,
    offerCompensation: 2200000,
    feedback: 'private direct hire note'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(bypass.success, false, 'manager direct hiring approval must be blocked');
  assert.ok(bypass.failures.some(item => item.failureCode === 'UNSAFE_HIRING_WORKFLOW_BYPASS'));
  assert.doesNotMatch(JSON.stringify(bypass), /private direct hire|offerCompensation|2200000|feedback/i, 'hiring bypass output must be redacted');

  const platformInterviewer = svc.validateInterviewWorkflow({
    tenantSlug: 'tabsons',
    applicationId: 'JA-1',
    candidateId: 'CAN-1',
    interviewPanel: [{ role: 'MANAGER', id: 'MGR-1' }, { role: 'PLATFORM_OWNER', id: 'PO-1' }]
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.ok(platformInterviewer.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_RECRUITMENT_CHAIN_BLOCKED'), 'PLATFORM_OWNER must be excluded from recruitment chains');

  const documentAccess = svc.validateCandidateDocumentGovernance({
    tenantSlug: 'tabsons',
    candidateId: 'CAN-1',
    applicationId: 'JA-1',
    category: 'resume',
    fileName: 'candidate-one-private.pdf',
    mimeType: 'application/pdf',
    signedUrl: 'https://signed.example.com/candidate-one-private.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(documentAccess.success, true, 'HR may access governed resume metadata');
  assert.equal(documentAccess.documentGovernance.secureResumeAccess, true, 'candidate document governance should require secure resume access');
  assert.doesNotMatch(JSON.stringify(documentAccess), /candidate-one-private|signed\.example|fileName|signedUrl/i, 'document governance output must not expose resume location');

  const normalized = svc.normalizeCandidatePayload({
    tenantSlug: 'tabsons',
    applicationId: 'JA-1',
    candidateId: 'CAN-1',
    candidateName: 'Candidate One',
    email: 'candidate.one@example.com',
    resumeFileName: 'candidate-one-private.pdf',
    expectedSalary: 2200000,
    state: 'interview pending'
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized candidate output must be immutable');
  assert.equal(normalized.payload.state, 'INTERVIEW_PENDING');
  assert.doesNotMatch(JSON.stringify(normalized), /Candidate One|candidate\.one|candidate-one-private|expectedSalary|2200000/i, 'normalized payload should not expose candidate confidential data');

  const bottlenecks = svc.detectHiringBottlenecks({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-23T00:00:00.000Z' });
  assert.equal(bottlenecks.success, true, 'hiring bottlenecks should be detected safely');
  assert.ok(bottlenecks.summary.interviewCongestion >= 1, 'interview congestion should be visible');
  assert.ok(bottlenecks.summary.delayedHiringStages >= 1, 'delayed hiring stages should be counted');
  assert.ok(Object.isFrozen(bottlenecks.recruiters), 'recruiter workload output must be immutable');
  assert.doesNotMatch(JSON.stringify(bottlenecks), /abc private|abc-secret|expectedSalary|candidate\.one|feedback/i, 'bottleneck output must not leak candidate fields');

  const dataBefore = global.DB.get();
  const recruitmentBefore = JSON.stringify({
    jobOpenings: dataBefore.jobOpenings,
    jobApplications: dataBefore.jobApplications,
    recruitmentInterviews: dataBefore.recruitmentInterviews,
    recruitmentOffers: dataBefore.recruitmentOffers
  });
  const schedule = svc.scheduleInterviewWorkflow({
    tenantSlug: 'tabsons',
    applicationId: 'JA-1',
    candidateId: 'CAN-1',
    jobId: 'JO-1',
    interviewId: 'INT-1',
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'interview workflow scheduling should work');
  assert.ok(schedule.asyncJob, 'interview workflow scheduling should integrate with async jobs');
  assert.equal(JSON.stringify({
    jobOpenings: global.DB.get().jobOpenings,
    jobApplications: global.DB.get().jobApplications,
    recruitmentInterviews: global.DB.get().recruitmentInterviews,
    recruitmentOffers: global.DB.get().recruitmentOffers
  }), recruitmentBefore, 'interview scheduling must not mutate historical recruitment records');

  const report = svc.generateRecruitmentGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-23T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'recruitment governance report should generate safely');
  assert.equal(report.readOnly, true, 'recruitment governance report should be read-only');
  assert.ok(report.pipelineHealth.totalApplications >= 2, 'candidate pipeline health should be visible');
  assert.ok(report.interviewGovernance.pendingInterviews >= 1, 'interview workflow health should be visible');
  assert.ok(report.requisitionGovernance.totalRequisitions >= 2, 'requisition governance should be visible');
  assert.ok(report.hiringAnalytics.funnelConversion.applicationReceived >= 2, 'hiring funnel analytics should be visible');
  assert.equal(report.accessGovernance.superAdminResumeAccess, false, 'SUPER_ADMIN resume access remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /CAN-X|JA-X|abc-secret|Candidate One|candidate\.one|expectedSalary|offerCompensation|feedback|resumeFileName|candidate-one-private/i, 'report must not expose cross-tenant or confidential candidate data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /RECRUITMENT_GOVERNANCE|INTERVIEW_WORKFLOW/.test(row.eventType || row.category || '')), 'recruitment telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.RECRUITMENT_GOVERNANCE_REPORTED, 'recruitment governance metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /RECRUITMENT_GOVERNANCE|INTERVIEW_WORKFLOW/.test(row.actionType || row.action || '')), 'recruitment actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleInterviewWorkflow({ tenantSlug: 'tabsons', applicationId: 'JA-SELF', candidateId: 'CAN-SELF', jobId: 'JO-1' }, {
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

  console.log('recruitmentGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
