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

function seedWorkflowDiscussionData() {
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
  data.workflowDiscussions = [
    {
      id: 'WTD-1',
      threadId: 'WTD-1',
      tenantSlug: 'tabsons',
      workflowId: 'WF-LEAVE-1',
      workflowType: 'LEAVE',
      state: 'ACTIVE',
      participantIds: ['EMP-1', 'MGR-1'],
      acknowledgementRequired: true,
      acknowledgedBy: ['MGR-1'],
      mentionIds: ['MGR-1'],
      escalationId: 'ESC-1',
      privateThread: true,
      subject: 'Leave clarification',
      body: 'Confidential leave clarification text',
      lastActivityAt: '2026-05-20T09:00:00.000Z',
      createdAt: '2026-05-18T09:00:00.000Z'
    },
    {
      id: 'WTD-2',
      threadId: 'WTD-2',
      tenantSlug: 'tabsons',
      workflowId: 'WF-PAYROLL-1',
      workflowType: 'PAYROLL',
      state: 'REVIEW_PENDING',
      participantIds: ['HR-1', 'HRH-1'],
      acknowledgementRequired: false,
      privateThread: true,
      subject: 'Payroll approval coordination',
      body: 'Confidential payroll discussion text',
      lastActivityAt: '2026-05-19T09:00:00.000Z',
      createdAt: '2026-05-19T09:00:00.000Z'
    },
    {
      id: 'WTD-3',
      threadId: 'WTD-3',
      tenantSlug: 'tabsons',
      workflowId: 'WF-REC-1',
      workflowType: 'RECRUITMENT',
      state: 'ESCALATED',
      participantIds: ['MGR-1', 'HR-1'],
      escalationId: 'ESC-2',
      privateThread: true,
      body: 'Confidential recruitment discussion',
      lastActivityAt: '2026-05-21T09:00:00.000Z',
      createdAt: '2026-05-21T09:00:00.000Z'
    },
    {
      id: 'WTD-X',
      threadId: 'WTD-X',
      tenantSlug: 'abc',
      workflowId: 'WF-X',
      workflowType: 'LEAVE',
      state: 'ACTIVE',
      participantIds: ['EMP-X', 'MGR-X'],
      privateThread: true,
      subject: 'ABC secret workflow thread',
      body: 'ABC confidential workflow discussion'
    }
  ];
  data.workflowThreadReplies = [
    { id: 'R-1', replyId: 'R-1', tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', authorId: 'EMP-1', replyBody: 'Confidential employee reply', createdAt: '2026-05-20T09:30:00.000Z' },
    { id: 'R-2', replyId: 'R-2', tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', authorId: 'MGR-1', replyBody: 'Confidential manager reply', createdAt: '2026-05-20T09:40:00.000Z' },
    { id: 'R-X', replyId: 'R-X', tenantSlug: 'abc', threadId: 'WTD-X', workflowId: 'WF-X', authorId: 'EMP-X', replyBody: 'ABC private reply' }
  ];
  data.workflowDiscussionAttachments = [
    { id: 'WDA-1', attachmentId: 'WDA-1', tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', mimeType: 'application/pdf', signedUrl: 'https://signed.example.com/thread-private.pdf', expiresAt: '2026-05-24T10:00:00.000Z', fileName: 'thread-private.pdf' },
    { id: 'WDA-X', attachmentId: 'WDA-X', tenantSlug: 'abc', threadId: 'WTD-X', workflowId: 'WF-X', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/abc-secret-thread.pdf', fileName: 'abc-secret-thread.pdf' }
  ];
  data.workflowEvents = [
    { eventId: 'EVT-LEAVE-1', tenantSlug: 'tabsons', type: 'LEAVE_APPLIED', workflowId: 'WF-LEAVE-1', status: 'PENDING', discussionThreadId: 'WTD-1', message: 'Leave workflow private event' },
    { eventId: 'EVT-PAYROLL-1', tenantSlug: 'tabsons', type: 'PAYROLL_APPROVED', workflowId: 'WF-PAYROLL-1', status: 'REVIEW_PENDING', discussionThreadId: 'WTD-2', message: 'Payroll private event' },
    { eventId: 'EVT-X', tenantSlug: 'abc', type: 'LEAVE_APPLIED', workflowId: 'WF-X', status: 'PENDING', discussionThreadId: 'WTD-X', message: 'ABC private workflow event' }
  ];
  data.pendingActions = [
    { id: 'PA-1', tenantSlug: 'tabsons', workflowId: 'WF-LEAVE-1', discussionThreadId: 'WTD-1', actionType: 'LEAVE_REVIEW', status: 'Pending', targetRole: 'MANAGER', dueAt: '2026-05-19T00:00:00.000Z' },
    { id: 'PA-2', tenantSlug: 'tabsons', workflowId: 'WF-PAYROLL-1', discussionThreadId: 'WTD-2', actionType: 'PAYROLL_REVIEW', status: 'Pending', targetRole: 'HR_HEAD', dueAt: '2026-05-19T00:00:00.000Z' }
  ];
  data.escalations = [
    { escalationId: 'ESC-1', tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', status: 'OPEN', severity: 'HIGH_RISK' },
    { escalationId: 'ESC-2', tenantSlug: 'tabsons', threadId: 'WTD-3', workflowId: 'WF-REC-1', status: 'OPEN', severity: 'HIGH_RISK' }
  ];
  data.notifications = [
    { id: 'N-WTD-1', tenantSlug: 'tabsons', module: 'Workflow Discussions', category: 'MENTION', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', title: 'Mention in workflow thread', message: 'Confidential mention body', read: false },
    { id: 'N-WTD-X', tenantSlug: 'abc', module: 'Workflow Discussions', category: 'MENTION', threadId: 'WTD-X', workflowId: 'WF-X', title: 'ABC thread mention', message: 'ABC secret notification', read: false }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-WTD-1', tenantSlug: 'tabsons', jobType: 'WORKFLOW_DISCUSSION_NOTIFICATION', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'WTD-1' },
    { jobId: 'JOB-WTD-X', tenantSlug: 'abc', jobType: 'WORKFLOW_DISCUSSION_NOTIFICATION', state: 'FAILED', payload: { body: 'ABC confidential job payload' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.workflowDiscussionGovernanceRuns = [];
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
    'services/communicationGovernanceService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/workflowDiscussionService.js');
  seedWorkflowDiscussionData();

  const svc = global.WorkflowDiscussionService;
  assert.ok(svc, 'WorkflowDiscussionService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.DISCUSSION_STATES), 'discussion states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_WORKFLOW_DISCUSSION_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyDiscussionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant workflow discussion visibility is critical');
  assert.equal(svc.classifyDiscussionRisk({ publicAttachment: true }), 'CRITICAL_BLOCKER', 'public workflow discussion attachment exposure is critical');
  assert.equal(svc.classifyDiscussionRisk({ unauthorizedDiscussion: true }), 'HIGH_RISK', 'unauthorized discussion access is high risk');
  assert.equal(svc.classifyDiscussionRisk({ delayedResponse: true }), 'WARNING', 'delayed response is warning risk');

  const employeeOwn = svc.validateDiscussionScope({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', workflowType: 'LEAVE', participantIds: ['EMP-1', 'MGR-1'], privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may see own workflow discussion');
  assert.equal(employeeOwn.visibility, 'OWN_WORKFLOW_DISCUSSIONS_ONLY');

  const managerTeam = svc.validateDiscussionScope({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', participantIds: ['EMP-1', 'MGR-1'], privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team workflow discussions');
  assert.equal(managerTeam.visibility, 'TEAM_WORKFLOW_VISIBILITY');

  const directorPrivate = svc.validateDiscussionScope({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', participantIds: ['EMP-1'], body: 'Confidential leave clarification text', privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' }
  });
  assert.equal(directorPrivate.allowed, false, 'DIRECTOR must receive high-level analytics only');
  assert.ok(directorPrivate.failures.some(item => item.failureCode === 'DIRECTOR_RAW_DISCUSSION_ACCESS_BLOCKED'));

  const superAdminPrivate = svc.validateDiscussionScope({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', participantIds: ['EMP-1', 'MGR-1'], body: 'Confidential leave clarification text', privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPrivate.allowed, false, 'SUPER_ADMIN must not access operational discussions');
  assert.ok(superAdminPrivate.failures.some(item => item.failureCode === 'SUPER_ADMIN_OPERATIONAL_DISCUSSION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminPrivate), /Confidential leave|body|EMP-1/i, 'SUPER_ADMIN failure output must redact discussion data');

  const platformScope = svc.validateDiscussionScope({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-LEAVE-1', participantIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in workflow discussions');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_DISCUSSION_ACCESS_BLOCKED'));

  const crossTenant = svc.validateDiscussionScope({ tenantSlug: 'abc', threadId: 'WTD-X', workflowId: 'WF-X', participantIds: ['EMP-X', 'MGR-X'], body: 'ABC confidential workflow discussion' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant workflow discussion visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /WTD-X|EMP-X|ABC confidential|body/i, 'cross-tenant failure must not leak discussion data');

  const malformed = svc.validateThreadPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed discussion payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_THREAD_PAYLOAD'));

  const platformParticipant = svc.validateThreadPayload({
    tenantSlug: 'tabsons',
    threadId: 'WTD-4',
    workflowId: 'WF-APPRAISAL-1',
    workflowType: 'APPRAISAL',
    participantIds: ['EMP-1', 'PO-1'],
    participantRoles: ['EMPLOYEE', 'PLATFORM_OWNER']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(platformParticipant.success, false, 'PLATFORM_OWNER must be excluded from workflow discussion participants');
  assert.ok(platformParticipant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_DISCUSSION_CHAIN_BLOCKED'));

  const normalized = svc.normalizeThreadPayload({
    tenantSlug: 'tabsons',
    threadId: 'WTD-1',
    workflowId: 'WF-LEAVE-1',
    workflowType: 'leave request',
    state: 'review pending',
    participantIds: ['EMP-1', 'MGR-1'],
    body: 'Confidential leave clarification text',
    mentionIds: ['MGR-1']
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized thread output must be immutable');
  assert.equal(normalized.payload.state, 'REVIEW_PENDING');
  assert.equal(normalized.payload.workflowType, 'LEAVE');
  assert.doesNotMatch(JSON.stringify(normalized), /Confidential leave|body|EMP-1|MGR-1|mentionIds/i, 'normalized payload should not expose confidential discussion data');

  const attachmentAccess = svc.validateDiscussionAttachment({
    tenantSlug: 'tabsons',
    threadId: 'WTD-1',
    workflowId: 'WF-LEAVE-1',
    attachmentId: 'WDA-1',
    mimeType: 'application/pdf',
    signedUrl: 'https://signed.example.com/thread-private.pdf',
    expiresAt: '2026-05-24T10:00:00.000Z',
    fileName: 'thread-private.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(attachmentAccess.success, true, 'HR may access governed thread attachment metadata');
  assert.equal(attachmentAccess.attachmentGovernance.signedAccessRequired, true, 'discussion attachment governance should require signed access');
  assert.doesNotMatch(JSON.stringify(attachmentAccess), /thread-private|signed\.example|fileName|signedUrl/i, 'attachment governance output must not expose file locations');

  const publicAttachment = svc.validateDiscussionAttachment({
    tenantSlug: 'tabsons',
    threadId: 'WTD-1',
    workflowId: 'WF-LEAVE-1',
    attachmentId: 'WDA-2',
    mimeType: 'application/pdf',
    publicUrl: 'https://public.example.com/thread-public.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(publicAttachment.success, false, 'public workflow discussion attachment exposure must be blocked');
  assert.ok(publicAttachment.failures.some(item => item.failureCode === 'PUBLIC_DISCUSSION_ATTACHMENT_EXPOSURE_BLOCKED'));

  const congestion = svc.detectWorkflowCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(congestion.success, true, 'workflow discussion congestion should be detected safely');
  assert.ok(congestion.summary.unresolvedDiscussions >= 2, 'unresolved discussions should be visible');
  assert.ok(congestion.summary.escalationDensity >= 2, 'escalation collaboration density should be visible');
  assert.ok(congestion.summary.delayedResponses >= 1, 'delayed response indicators should be counted');
  assert.ok(Object.isFrozen(congestion.workflowBreakdown), 'workflow breakdown output must be immutable');
  assert.doesNotMatch(JSON.stringify(congestion), /ABC confidential|abc-secret|Confidential leave|Confidential payroll|Confidential recruitment/i, 'congestion output must not leak discussion fields');

  const dataBefore = global.DB.get();
  const discussionsBefore = JSON.stringify({
    workflowDiscussions: dataBefore.workflowDiscussions,
    workflowThreadReplies: dataBefore.workflowThreadReplies,
    workflowDiscussionAttachments: dataBefore.workflowDiscussionAttachments
  });
  const schedule = svc.scheduleDiscussionNotification({
    tenantSlug: 'tabsons',
    threadId: 'WTD-1',
    workflowId: 'WF-LEAVE-1',
    workflowType: 'LEAVE',
    priority: 'HIGH',
    mentionIds: ['MGR-1'],
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'discussion notification scheduling should work');
  assert.ok(schedule.asyncJob, 'discussion scheduling should integrate with async jobs');
  assert.equal(JSON.stringify({
    workflowDiscussions: global.DB.get().workflowDiscussions,
    workflowThreadReplies: global.DB.get().workflowThreadReplies,
    workflowDiscussionAttachments: global.DB.get().workflowDiscussionAttachments
  }), discussionsBefore, 'discussion scheduling must not mutate historical discussion records');

  const report = svc.generateWorkflowDiscussionReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'workflow discussion report should generate safely');
  assert.equal(report.readOnly, true, 'workflow discussion report should be read-only');
  assert.ok(report.discussionHealth.totalThreads >= 3, 'discussion health should be visible');
  assert.ok(report.workflowLinkage.linkedWorkflows >= 3, 'workflow linkage should be visible');
  assert.ok(report.escalationCollaboration.escalationLinkedThreads >= 2, 'escalation collaboration should be visible');
  assert.ok(report.collaborationAnalytics.unresolvedDiscussions >= 2, 'collaboration analytics should include unresolved discussions');
  assert.equal(report.accessGovernance.superAdminOperationalDiscussionAccess, false, 'SUPER_ADMIN operational discussion access remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /WTD-X|EMP-X|ABC confidential|abc-secret|Confidential leave|Confidential payroll|Confidential recruitment|replyBody|body|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential discussion data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /WORKFLOW_DISCUSSION|DISCUSSION_NOTIFICATION/.test(row.eventType || row.category || '')), 'workflow discussion telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.WORKFLOW_DISCUSSION_REPORTED, 'workflow discussion metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /WORKFLOW_DISCUSSION|DISCUSSION_NOTIFICATION/.test(row.actionType || row.action || '')), 'discussion actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleDiscussionNotification({ tenantSlug: 'tabsons', threadId: 'WTD-SELF', workflowId: 'WF-SELF', workflowType: 'LEAVE' }, {
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

  console.log('workflowDiscussionService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
