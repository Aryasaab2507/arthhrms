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

function seedTeamWorkspaceData() {
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
  data.teamWorkspaces = [
    {
      id: 'WS-1',
      workspaceId: 'WS-1',
      tenantSlug: 'tabsons',
      type: 'DEPARTMENT_WORKSPACE',
      state: 'ACTIVE',
      department: 'Engineering',
      memberIds: ['EMP-1', 'EMP-2', 'MGR-1'],
      managerId: 'MGR-1',
      privateWorkspace: true,
      pinnedNoteCount: 1,
      title: 'Engineering private workspace',
      body: 'Confidential engineering collaboration',
      lastActivityAt: '2026-05-20T09:00:00.000Z'
    },
    {
      id: 'WS-2',
      workspaceId: 'WS-2',
      tenantSlug: 'tabsons',
      type: 'ESCALATION_COORDINATION_ROOM',
      state: 'ESCALATED',
      workflowId: 'WF-1',
      escalationId: 'ESC-1',
      memberIds: ['MGR-1', 'HR-1'],
      privateWorkspace: true,
      title: 'Approval escalation room',
      body: 'Confidential escalation collaboration',
      lastActivityAt: '2026-05-19T09:00:00.000Z'
    },
    {
      id: 'WS-3',
      workspaceId: 'WS-3',
      tenantSlug: 'tabsons',
      type: 'STRATEGIC_PLANNING_ROOM',
      state: 'RESTRICTED',
      memberIds: ['HRH-1', 'DIR-1'],
      restricted: true,
      moderationFlags: ['ATTACHMENT_REVIEW'],
      attachmentRestricted: true,
      pinnedNoteCount: 2,
      title: 'Strategic confidential room',
      body: 'Private leadership note'
    },
    {
      id: 'WS-X',
      workspaceId: 'WS-X',
      tenantSlug: 'abc',
      type: 'DEPARTMENT_WORKSPACE',
      state: 'ACTIVE',
      memberIds: ['EMP-X', 'MGR-X'],
      privateWorkspace: true,
      title: 'ABC confidential workspace',
      body: 'ABC private collaboration'
    }
  ];
  data.collaborationThreads = [
    {
      id: 'TH-1',
      threadId: 'TH-1',
      tenantSlug: 'tabsons',
      workspaceId: 'WS-1',
      state: 'ACTIVE',
      participantIds: ['EMP-1', 'MGR-1'],
      pinned: true,
      acknowledgementRequired: true,
      acknowledgedBy: ['MGR-1'],
      privateThread: true,
      message: 'Confidential department discussion',
      lastActivityAt: '2026-05-20T11:00:00.000Z'
    },
    {
      id: 'TH-2',
      threadId: 'TH-2',
      tenantSlug: 'tabsons',
      workspaceId: 'WS-2',
      workflowId: 'WF-1',
      escalationId: 'ESC-1',
      state: 'ESCALATED',
      status: 'PENDING',
      delayedResponse: true,
      participantIds: ['MGR-1', 'HR-1'],
      message: 'Confidential escalation thread'
    },
    {
      id: 'TH-3',
      threadId: 'TH-3',
      tenantSlug: 'tabsons',
      workspaceId: 'WS-3',
      state: 'REVIEW_PENDING',
      locked: true,
      moderationFlag: true,
      participantIds: ['HRH-1', 'DIR-1'],
      message: 'Confidential strategic thread'
    },
    {
      id: 'TH-X',
      threadId: 'TH-X',
      tenantSlug: 'abc',
      workspaceId: 'WS-X',
      state: 'ACTIVE',
      participantIds: ['EMP-X', 'MGR-X'],
      privateThread: true,
      message: 'ABC private thread'
    }
  ];
  data.threadReplies = [
    { id: 'TR-1', replyId: 'TR-1', tenantSlug: 'tabsons', workspaceId: 'WS-1', threadId: 'TH-1', authorId: 'EMP-1', replyBody: 'Confidential employee reply' },
    { id: 'TR-2', replyId: 'TR-2', tenantSlug: 'tabsons', workspaceId: 'WS-2', threadId: 'TH-2', authorId: 'HR-1', replyBody: 'Confidential HR reply' },
    { id: 'TR-X', replyId: 'TR-X', tenantSlug: 'abc', workspaceId: 'WS-X', threadId: 'TH-X', authorId: 'EMP-X', replyBody: 'ABC private reply' }
  ];
  data.workspaceAttachments = [
    { id: 'WSA-1', attachmentId: 'WSA-1', tenantSlug: 'tabsons', workspaceId: 'WS-1', threadId: 'TH-1', mimeType: 'application/pdf', fileName: 'workspace-private.pdf', storagePath: 'tabsons/workspaces/WS-1/private.pdf', signedUrl: 'https://signed.example.com/workspace-private.pdf', expiresAt: '2026-05-24T10:00:00.000Z', checksum: 'sha256-ws-1' },
    { id: 'WSA-X', attachmentId: 'WSA-X', tenantSlug: 'abc', workspaceId: 'WS-X', threadId: 'TH-X', mimeType: 'application/pdf', fileName: 'abc-workspace-private.pdf', publicUrl: 'https://public.example.com/abc-workspace-private.pdf' }
  ];
  data.workflowDiscussions = [
    { id: 'WTD-1', threadId: 'WTD-1', tenantSlug: 'tabsons', workspaceId: 'WS-2', workflowId: 'WF-1', escalationId: 'ESC-1', workflowType: 'ESCALATION', state: 'ESCALATED', participantIds: ['MGR-1', 'HR-1'], body: 'Private workflow discussion' }
  ];
  data.escalations = [
    { escalationId: 'ESC-1', tenantSlug: 'tabsons', workspaceId: 'WS-2', threadId: 'TH-2', workflowId: 'WF-1', status: 'OPEN', severity: 'HIGH_RISK' },
    { escalationId: 'ESC-X', tenantSlug: 'abc', workspaceId: 'WS-X', threadId: 'TH-X', workflowId: 'WF-X', status: 'OPEN', severity: 'HIGH_RISK' }
  ];
  data.workflowEvents = [
    { eventId: 'EVT-1', tenantSlug: 'tabsons', workspaceId: 'WS-2', discussionThreadId: 'TH-2', workflowId: 'WF-1', type: 'APPROVAL_DELAYED', status: 'PENDING', message: 'Private approval delay' },
    { eventId: 'EVT-X', tenantSlug: 'abc', workspaceId: 'WS-X', discussionThreadId: 'TH-X', workflowId: 'WF-X', type: 'APPROVAL_DELAYED', message: 'ABC private event' }
  ];
  data.notifications = [
    { id: 'N-WS-1', tenantSlug: 'tabsons', module: 'Team Workspace', category: 'MENTION', workspaceId: 'WS-1', threadId: 'TH-1', title: 'Workspace mention', message: 'Confidential mention', read: false },
    { id: 'N-WS-X', tenantSlug: 'abc', module: 'Team Workspace', category: 'MENTION', workspaceId: 'WS-X', threadId: 'TH-X', title: 'ABC mention', message: 'ABC secret notification', read: false }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-WS-1', tenantSlug: 'tabsons', jobType: 'WORKSPACE_NOTIFICATION', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'WS-1' },
    { jobId: 'JOB-WS-X', tenantSlug: 'abc', jobType: 'WORKSPACE_NOTIFICATION', state: 'FAILED', payload: { body: 'ABC confidential job payload' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.teamWorkspaceGovernanceRuns = [];
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
    'services/workflowDiscussionService.js',
    'services/announcementHubService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/teamWorkspaceService.js');
  seedTeamWorkspaceData();

  const svc = global.TeamWorkspaceService;
  assert.ok(svc, 'TeamWorkspaceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.WORKSPACE_STATES), 'workspace states must be immutable');
  assert.ok(Object.isFrozen(svc.WORKSPACE_TYPES), 'workspace types must be immutable');
  assert.equal(global.__ARTHHRMS_TEAM_WORKSPACE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyWorkspaceRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant workspace visibility is critical');
  assert.equal(svc.classifyWorkspaceRisk({ publicAttachment: true }), 'CRITICAL_BLOCKER', 'public workspace attachment exposure is critical');
  assert.equal(svc.classifyWorkspaceRisk({ superAdminPrivateAccess: true }), 'HIGH_RISK', 'SUPER_ADMIN private workspace access is high risk');
  assert.equal(svc.classifyWorkspaceRisk({ moderationOverride: true }), 'HIGH_RISK', 'unsafe moderation override is high risk');
  assert.equal(svc.classifyWorkspaceRisk({ delayedResponse: true }), 'WARNING', 'delayed response is warning risk');

  const employeeAssigned = svc.validateWorkspaceScope({ tenantSlug: 'tabsons', workspaceId: 'WS-1', memberIds: ['EMP-1', 'MGR-1'], privateWorkspace: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may see assigned workspace only');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_WORKSPACES_ONLY');

  const managerTeam = svc.validateWorkspaceScope({ tenantSlug: 'tabsons', workspaceId: 'WS-1', memberIds: ['EMP-1', 'EMP-2', 'MGR-1'], privateWorkspace: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team workspace visibility');
  assert.equal(managerTeam.visibility, 'TEAM_WORKSPACE_VISIBILITY');

  const hrEscalation = svc.validateWorkspaceScope({ tenantSlug: 'tabsons', workspaceId: 'WS-2', type: 'ESCALATION_COORDINATION_ROOM', memberIds: ['MGR-1', 'HR-1'], privateWorkspace: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1', empId: 'HR-1' }
  });
  assert.equal(hrEscalation.allowed, true, 'HR may see governed escalation collaboration');
  assert.equal(hrEscalation.visibility, 'HR_COLLABORATION_VISIBILITY');

  const superAdminPrivate = svc.validateWorkspaceScope({ tenantSlug: 'tabsons', workspaceId: 'WS-1', memberIds: ['EMP-1', 'MGR-1'], body: 'Confidential engineering collaboration', privateWorkspace: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPrivate.allowed, false, 'SUPER_ADMIN must not access private collaboration threads');
  assert.ok(superAdminPrivate.failures.some(item => item.failureCode === 'SUPER_ADMIN_PRIVATE_WORKSPACE_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminPrivate), /Confidential engineering|body|EMP-1|MGR-1/i, 'SUPER_ADMIN failure output must redact workspace data');

  const platformScope = svc.validateWorkspaceScope({ tenantSlug: 'tabsons', workspaceId: 'WS-1', memberIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in operational workspaces');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_WORKSPACE_ACCESS_BLOCKED'));

  const crossTenant = svc.validateWorkspaceScope({ tenantSlug: 'abc', workspaceId: 'WS-X', memberIds: ['EMP-X', 'MGR-X'], body: 'ABC private collaboration' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant collaboration visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /WS-X|EMP-X|ABC private|body/i, 'cross-tenant failure must not leak workspace data');

  const malformed = svc.validateThreadGovernance(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed thread payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_WORKSPACE_THREAD_PAYLOAD'));

  const platformParticipant = svc.validateThreadGovernance({
    tenantSlug: 'tabsons',
    workspaceId: 'WS-1',
    threadId: 'TH-4',
    participantIds: ['EMP-1', 'PO-1'],
    participantRoles: ['EMPLOYEE', 'PLATFORM_OWNER']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(platformParticipant.success, false, 'PLATFORM_OWNER must be excluded from workspace threads');
  assert.ok(platformParticipant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_WORKSPACE_THREAD_BLOCKED'));

  const normalized = svc.normalizeWorkspacePayload({
    tenantSlug: 'tabsons',
    workspaceId: 'WS-1',
    type: 'department workspace',
    state: 'review pending',
    memberIds: ['EMP-1', 'MGR-1'],
    title: 'Engineering private workspace',
    body: 'Confidential engineering collaboration'
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized workspace output must be immutable');
  assert.equal(normalized.payload.state, 'REVIEW_PENDING');
  assert.equal(normalized.payload.type, 'DEPARTMENT_WORKSPACE');
  assert.doesNotMatch(JSON.stringify(normalized), /Engineering private|Confidential engineering|body|EMP-1|MGR-1|memberIds/i, 'normalized payload should not expose confidential collaboration data');

  const attachmentAccess = svc.validateWorkspaceAttachment({
    tenantSlug: 'tabsons',
    workspaceId: 'WS-1',
    threadId: 'TH-1',
    attachmentId: 'WSA-1',
    mimeType: 'application/pdf',
    signedUrl: 'https://signed.example.com/workspace-private.pdf',
    expiresAt: '2026-05-24T10:00:00.000Z',
    fileName: 'workspace-private.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(attachmentAccess.success, true, 'HR may access governed workspace attachment metadata');
  assert.equal(attachmentAccess.attachmentGovernance.signedAccessRequired, true, 'workspace attachment governance should require signed access');
  assert.doesNotMatch(JSON.stringify(attachmentAccess), /workspace-private|signed\.example|fileName|signedUrl/i, 'workspace attachment governance output must not expose file locations');

  const publicAttachment = svc.validateWorkspaceAttachment({
    tenantSlug: 'tabsons',
    workspaceId: 'WS-1',
    threadId: 'TH-1',
    attachmentId: 'WSA-2',
    mimeType: 'application/pdf',
    publicUrl: 'https://public.example.com/workspace-public.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(publicAttachment.success, false, 'public workspace attachment exposure must be blocked');
  assert.ok(publicAttachment.failures.some(item => item.failureCode === 'PUBLIC_WORKSPACE_ATTACHMENT_EXPOSURE_BLOCKED'));

  const congestion = svc.detectCollaborationCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(congestion.success, true, 'collaboration congestion should be detected safely');
  assert.ok(congestion.summary.unresolvedOperationalThreads >= 2, 'unresolved threads should be visible');
  assert.ok(congestion.summary.escalationDensity >= 1, 'escalation density should be visible');
  assert.ok(congestion.summary.delayedResponses >= 1, 'delayed response indicators should be counted');
  assert.ok(Object.isFrozen(congestion.workspaceBreakdown), 'workspace breakdown output must be immutable');
  assert.doesNotMatch(JSON.stringify(congestion), /ABC private|ABC secret|Confidential engineering|Confidential escalation|Confidential strategic/i, 'congestion output must not leak collaboration fields');

  const dataBefore = global.DB.get();
  const historicalBefore = JSON.stringify({
    teamWorkspaces: dataBefore.teamWorkspaces,
    collaborationThreads: dataBefore.collaborationThreads,
    workspaceAttachments: dataBefore.workspaceAttachments
  });
  const schedule = svc.scheduleWorkspaceNotification({
    tenantSlug: 'tabsons',
    workspaceId: 'WS-1',
    threadId: 'TH-1',
    type: 'DEPARTMENT_WORKSPACE',
    priority: 'HIGH',
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'workspace notification scheduling should work');
  assert.ok(schedule.asyncJob, 'workspace scheduling should integrate with async jobs');
  assert.equal(JSON.stringify({
    teamWorkspaces: global.DB.get().teamWorkspaces,
    collaborationThreads: global.DB.get().collaborationThreads,
    workspaceAttachments: global.DB.get().workspaceAttachments
  }), historicalBefore, 'workspace scheduling must not mutate historical collaboration records');

  const report = svc.generateTeamWorkspaceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'team workspace report should generate safely');
  assert.equal(report.readOnly, true, 'team workspace report should be read-only');
  assert.ok(report.workspaceHealth.totalWorkspaces >= 3, 'workspace health should be visible');
  assert.ok(report.threadGovernance.totalThreads >= 3, 'thread governance should be visible');
  assert.ok(report.escalationIntegration.escalationLinkedWorkspaces >= 1, 'escalation integration should be visible');
  assert.ok(report.moderationGovernance.restrictedWorkspaces >= 1, 'moderation governance should be visible');
  assert.ok(report.workspaceAnalytics.unresolvedOperationalThreads >= 2, 'workspace analytics should include unresolved threads');
  assert.equal(report.accessGovernance.superAdminPrivateThreadAccess, false, 'SUPER_ADMIN private thread access remains blocked');
  assert.equal(report.accessGovernance.platformOwnerOperationalWorkspace, false, 'PLATFORM_OWNER operational workspace access remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /WS-X|TH-X|EMP-X|ABC private|ABC secret|Confidential engineering|Confidential escalation|Confidential strategic|replyBody|message|body|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential collaboration data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /TEAM_WORKSPACE|WORKSPACE_NOTIFICATION/.test(row.eventType || row.category || '')), 'workspace telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.TEAM_WORKSPACE_REPORTED, 'team workspace metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /TEAM_WORKSPACE|WORKSPACE_NOTIFICATION/.test(row.actionType || row.action || '')), 'workspace actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleWorkspaceNotification({ tenantSlug: 'tabsons', workspaceId: 'WS-SELF', threadId: 'TH-SELF', type: 'DEPARTMENT_WORKSPACE' }, {
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

  console.log('teamWorkspaceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
