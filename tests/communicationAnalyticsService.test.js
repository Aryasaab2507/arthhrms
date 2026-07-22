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

function seedCommunicationAnalyticsData() {
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
  data.communications = [
    {
      id: 'COM-1',
      communicationId: 'COM-1',
      tenantSlug: 'tabsons',
      type: 'HR_ANNOUNCEMENT',
      state: 'PUBLISHED',
      department: 'ALL',
      requiresAck: true,
      recipientIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: ['EMP-1'],
      acknowledgedUserIds: ['EMP-1'],
      title: 'Private HR communication',
      body: 'Confidential HR body',
      createdAt: '2026-05-20T10:00:00.000Z'
    },
    {
      id: 'COM-2',
      communicationId: 'COM-2',
      threadId: 'THREAD-1',
      tenantSlug: 'tabsons',
      type: 'WORKFLOW_DISCUSSION',
      state: 'ACTIVE',
      workflowId: 'WF-1',
      participantIds: ['EMP-1', 'MGR-1'],
      privateThread: true,
      message: 'Confidential workflow discussion',
      lastActivityAt: '2026-05-20T09:00:00.000Z'
    },
    {
      id: 'COM-3',
      communicationId: 'COM-3',
      tenantSlug: 'tabsons',
      type: 'ESCALATION_CONVERSATION',
      state: 'ESCALATED',
      escalationId: 'ESC-1',
      participantIds: ['MGR-1', 'HR-1'],
      message: 'Private escalation discussion',
      lastActivityAt: '2026-05-19T09:00:00.000Z'
    },
    {
      id: 'COM-X',
      communicationId: 'COM-X',
      tenantSlug: 'abc',
      type: 'WORKFLOW_DISCUSSION',
      state: 'ACTIVE',
      participantIds: ['EMP-X', 'MGR-X'],
      privateThread: true,
      message: 'ABC confidential communication'
    }
  ];
  data.announcements = [
    {
      id: 'ANN-1',
      announcementId: 'ANN-1',
      tenantSlug: 'tabsons',
      type: 'LEADERSHIP_ANNOUNCEMENT',
      state: 'PUBLISHED',
      assignedEmployeeIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: ['EMP-1'],
      acknowledgedUserIds: ['EMP-1'],
      requiresAck: true,
      title: 'CEO Update',
      body: 'Confidential leadership update'
    },
    {
      id: 'ANN-2',
      announcementId: 'ANN-2',
      tenantSlug: 'tabsons',
      type: 'EMERGENCY_BROADCAST',
      state: 'ACK_PENDING',
      assignedEmployeeIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: [],
      acknowledgedUserIds: [],
      requiresAck: true,
      emergency: true,
      title: 'Emergency Notice',
      body: 'Private emergency details'
    },
    {
      id: 'ANN-X',
      announcementId: 'ANN-X',
      tenantSlug: 'abc',
      type: 'LEADERSHIP_ANNOUNCEMENT',
      state: 'PUBLISHED',
      assignedEmployeeIds: ['EMP-X'],
      body: 'ABC confidential leadership update'
    }
  ];
  data.policyAcknowledgements = [
    { id: 'ACK-1', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-05-20T12:00:00.000Z' },
    { id: 'ACK-2', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-2', status: 'PENDING', dueAt: '2026-05-19T12:00:00.000Z', privateNote: 'Employee-specific acknowledgement note' },
    { id: 'ACK-X', tenantSlug: 'abc', communicationId: 'COM-X', empId: 'EMP-X', status: 'PENDING', privateNote: 'ABC secret acknowledgement' }
  ];
  data.announcementAcknowledgements = [
    { id: 'AACK-1', tenantSlug: 'tabsons', announcementId: 'ANN-1', empId: 'EMP-1', status: 'ACKNOWLEDGED' },
    { id: 'AACK-2', tenantSlug: 'tabsons', announcementId: 'ANN-2', empId: 'EMP-2', status: 'PENDING', dueAt: '2026-05-19T12:00:00.000Z' },
    { id: 'AACK-X', tenantSlug: 'abc', announcementId: 'ANN-X', empId: 'EMP-X', status: 'PENDING', privateNote: 'ABC announcement secret' }
  ];
  data.collaborationThreads = [
    { id: 'TH-1', threadId: 'TH-1', tenantSlug: 'tabsons', workspaceId: 'WS-1', state: 'ACTIVE', participantIds: ['EMP-1', 'MGR-1'], pinned: true, acknowledgementRequired: true, acknowledgedBy: ['MGR-1'], privateThread: true, message: 'Confidential team thread', lastActivityAt: '2026-05-20T11:00:00.000Z' },
    { id: 'TH-2', threadId: 'TH-2', tenantSlug: 'tabsons', workspaceId: 'WS-2', workflowId: 'WF-1', escalationId: 'ESC-1', state: 'ESCALATED', delayedResponse: true, participantIds: ['MGR-1', 'HR-1'], message: 'Confidential escalation thread' },
    { id: 'TH-X', threadId: 'TH-X', tenantSlug: 'abc', workspaceId: 'WS-X', state: 'ACTIVE', participantIds: ['EMP-X', 'MGR-X'], privateThread: true, message: 'ABC private thread' }
  ];
  data.threadReplies = [
    { id: 'TR-1', replyId: 'TR-1', tenantSlug: 'tabsons', workspaceId: 'WS-1', threadId: 'TH-1', authorId: 'EMP-1', replyBody: 'Confidential employee reply', createdAt: '2026-05-20T12:00:00.000Z' },
    { id: 'TR-2', replyId: 'TR-2', tenantSlug: 'tabsons', workspaceId: 'WS-2', threadId: 'TH-2', authorId: 'HR-1', replyBody: 'Confidential HR reply', createdAt: '2026-05-22T12:00:00.000Z' },
    { id: 'TR-X', replyId: 'TR-X', tenantSlug: 'abc', workspaceId: 'WS-X', threadId: 'TH-X', authorId: 'EMP-X', replyBody: 'ABC private reply' }
  ];
  data.teamWorkspaces = [
    { id: 'WS-1', workspaceId: 'WS-1', tenantSlug: 'tabsons', type: 'DEPARTMENT_WORKSPACE', state: 'ACTIVE', memberIds: ['EMP-1', 'EMP-2', 'MGR-1'], privateWorkspace: true, pinnedNoteCount: 1, body: 'Confidential workspace' },
    { id: 'WS-2', workspaceId: 'WS-2', tenantSlug: 'tabsons', type: 'ESCALATION_COORDINATION_ROOM', state: 'ESCALATED', escalationId: 'ESC-1', memberIds: ['MGR-1', 'HR-1'], privateWorkspace: true, lastActivityAt: '2026-05-19T09:00:00.000Z' },
    { id: 'WS-X', workspaceId: 'WS-X', tenantSlug: 'abc', type: 'DEPARTMENT_WORKSPACE', state: 'ACTIVE', memberIds: ['EMP-X', 'MGR-X'], privateWorkspace: true, body: 'ABC confidential workspace' }
  ];
  data.workflowDiscussions = [
    { id: 'WTD-1', threadId: 'WTD-1', tenantSlug: 'tabsons', workflowId: 'WF-1', workflowType: 'LEAVE', state: 'ACTIVE', participantIds: ['EMP-1', 'MGR-1'], escalationId: 'ESC-1', privateThread: true, body: 'Private workflow discussion' },
    { id: 'WTD-X', threadId: 'WTD-X', tenantSlug: 'abc', workflowId: 'WF-X', workflowType: 'PAYROLL', state: 'ACTIVE', participantIds: ['EMP-X'], privateThread: true, body: 'ABC private workflow discussion' }
  ];
  data.escalations = [
    { escalationId: 'ESC-1', tenantSlug: 'tabsons', communicationId: 'COM-3', workspaceId: 'WS-2', threadId: 'TH-2', workflowId: 'WF-1', status: 'OPEN', severity: 'HIGH_RISK' },
    { escalationId: 'ESC-X', tenantSlug: 'abc', communicationId: 'COM-X', workspaceId: 'WS-X', threadId: 'TH-X', workflowId: 'WF-X', status: 'OPEN', severity: 'HIGH_RISK' }
  ];
  data.notifications = [
    { id: 'N-COM-1', tenantSlug: 'tabsons', module: 'Communications', category: 'ANNOUNCEMENT', title: 'Holiday Policy', message: 'Please acknowledge', read: false, createdAt: '2026-05-20T10:00:00.000Z' },
    { id: 'N-ANN-1', tenantSlug: 'tabsons', module: 'Announcement Hub', category: 'LEADERSHIP_ANNOUNCEMENT', title: 'CEO Update', message: 'Leadership update', read: true, createdAt: '2026-05-20T10:00:00.000Z' },
    { id: 'N-WS-1', tenantSlug: 'tabsons', module: 'Team Workspace', category: 'MENTION', workspaceId: 'WS-1', threadId: 'TH-1', title: 'Workspace mention', message: 'Confidential mention', read: false },
    { id: 'N-ESC-1', tenantSlug: 'tabsons', module: 'Escalations', category: 'ESCALATION_ALERT', title: 'Escalation alert', message: 'Escalation detail', read: false },
    { id: 'N-X', tenantSlug: 'abc', module: 'Communications', category: 'ANNOUNCEMENT', title: 'ABC Notice', message: 'ABC confidential notification', read: false }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-COM-1', tenantSlug: 'tabsons', jobType: 'COMMUNICATION_ANALYTICS', state: 'RETRY_PENDING', retryAttempts: 1, maxRetries: 3 },
    { jobId: 'JOB-X', tenantSlug: 'abc', jobType: 'COMMUNICATION_ANALYTICS', state: 'FAILED', payload: { body: 'ABC secret analytics job' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.communicationAnalyticsSnapshots = [
    { snapshotId: 'CAS-OLD-1', tenantSlug: 'tabsons', state: 'AGGREGATED', score: 72, createdAt: '2026-05-20T00:00:00.000Z' }
  ];
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
    'services/teamWorkspaceService.js',
    'services/escalationCommandService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/communicationAnalyticsService.js');
  seedCommunicationAnalyticsData();

  const svc = global.CommunicationAnalyticsService;
  assert.ok(svc, 'CommunicationAnalyticsService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ANALYTICS_STATES), 'analytics states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_COMMUNICATION_ANALYTICS_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyCommunicationHealthRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant analytics visibility is critical');
  assert.equal(svc.classifyCommunicationHealthRisk({ privateExposure: true }), 'HIGH_RISK', 'private communication analytics exposure is high risk');
  assert.equal(svc.classifyCommunicationHealthRisk({ unreadSpike: true }), 'WARNING', 'unread spike is warning risk');

  const employeeOwn = svc.validateAnalyticsScope({ tenantSlug: 'tabsons', subjectEmpId: 'EMP-1', privateAnalytics: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may see own engagement visibility');
  assert.equal(employeeOwn.visibility, 'OWN_ENGAGEMENT_ONLY');

  const managerTeam = svc.validateAnalyticsScope({ tenantSlug: 'tabsons', subjectEmpIds: ['EMP-1', 'EMP-2'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team engagement summaries');
  assert.equal(managerTeam.visibility, 'TEAM_ENGAGEMENT_SUMMARIES');

  const superAdminPrivate = svc.validateAnalyticsScope({ tenantSlug: 'tabsons', subjectEmpIds: ['EMP-1'], privateAnalytics: true, message: 'Confidential workflow discussion' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPrivate.allowed, false, 'SUPER_ADMIN must not view employee-level communication content');
  assert.ok(superAdminPrivate.failures.some(item => item.failureCode === 'SUPER_ADMIN_EMPLOYEE_ANALYTICS_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminPrivate), /Confidential workflow|message|EMP-1/i, 'SUPER_ADMIN analytics failure must redact private data');

  const platformScope = svc.validateAnalyticsScope({ tenantSlug: 'tabsons', subjectEmpIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in engagement metrics');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ANALYTICS_ACCESS_BLOCKED'));

  const crossTenant = svc.validateAnalyticsScope({ tenantSlug: 'abc', communicationId: 'COM-X', subjectEmpIds: ['EMP-X'], message: 'ABC confidential communication' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant communication analytics visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /COM-X|EMP-X|ABC confidential|message/i, 'cross-tenant analytics failure must not leak private data');

  const malformed = svc.normalizeAnalyticsPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed analytics payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_ANALYTICS_PAYLOAD'));

  const normalized = svc.normalizeAnalyticsPayload({
    tenantSlug: 'tabsons',
    analyticsId: 'CA-1',
    state: 'aggregated',
    subjectEmpIds: ['EMP-1', 'EMP-2'],
    message: 'Confidential analytics message'
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized analytics output must be immutable');
  assert.equal(normalized.payload.state, 'AGGREGATED');
  assert.doesNotMatch(JSON.stringify(normalized), /Confidential analytics|message|EMP-1|EMP-2|subjectEmpIds/i, 'normalized analytics payload should not expose employee-level data');

  const degradation = svc.detectCommunicationDegradation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(degradation.success, true, 'communication degradation detection should work');
  assert.ok(degradation.summary.unreadCommunications >= 2, 'unread communication should be counted');
  assert.ok(degradation.summary.acknowledgementLag >= 1, 'acknowledgement lag should be counted');
  assert.ok(degradation.summary.escalationCommunicationDensity >= 1, 'escalation communication density should be counted');
  assert.ok(Object.isFrozen(degradation.healthSignals), 'health signals must be immutable');
  assert.doesNotMatch(JSON.stringify(degradation), /ABC confidential|ABC secret|Confidential workflow|Private escalation|Employee-specific|message|body|replyBody/i, 'degradation output must not expose private communication data');

  const score = svc.calculateEngagementScore({
    views: 3,
    acknowledgements: 2,
    unread: 3,
    delayedResponses: 2,
    totalAudience: 4
  });
  assert.equal(score.success, true, 'engagement scoring should work');
  assert.ok(score.score >= 0 && score.score <= 100, 'engagement score must stay bounded');
  assert.ok(Object.isFrozen(score), 'engagement score output must be immutable');

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    communications: before.communications,
    announcements: before.announcements,
    collaborationThreads: before.collaborationThreads,
    communicationAnalyticsSnapshots: before.communicationAnalyticsSnapshots
  });
  const report = svc.generateCommunicationAnalyticsReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'communication analytics report should generate safely');
  assert.equal(report.readOnly, true, 'communication analytics report should be read-only');
  assert.ok(report.communicationHealth.unreadCommunications >= 2, 'communication health should include unread buildup');
  assert.ok(report.engagementIntelligence.engagementScore >= 0, 'engagement intelligence should include a score');
  assert.ok(report.workspaceAnalytics.unresolvedOperationalThreads >= 1, 'workspace analytics should be integrated');
  assert.ok(report.escalationCommunication.escalationCommunicationDensity >= 1, 'escalation communication intelligence should be visible');
  assert.ok(report.leadershipAnalytics.leadershipReach >= 0, 'leadership analytics should be visible');
  assert.equal(report.accessGovernance.superAdminEmployeeContentAccess, false, 'SUPER_ADMIN employee content access remains blocked');
  assert.equal(report.accessGovernance.platformOwnerEngagementMetrics, false, 'PLATFORM_OWNER engagement metrics remain isolated');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /COM-X|ANN-X|TH-X|EMP-X|ABC confidential|ABC secret|Confidential workflow|Private escalation|Employee-specific|message|body|replyBody|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential analytics data');
  assert.equal(JSON.stringify({
    communications: global.DB.get().communications,
    announcements: global.DB.get().announcements,
    collaborationThreads: global.DB.get().collaborationThreads,
    communicationAnalyticsSnapshots: global.DB.get().communicationAnalyticsSnapshots
  }), historicalBefore, 'analytics report must not mutate historical communication or analytics records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /COMMUNICATION_ANALYTICS|ENGAGEMENT/.test(row.eventType || row.category || '')), 'communication analytics telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.COMMUNICATION_ANALYTICS_REPORTED, 'communication analytics metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /COMMUNICATION_ANALYTICS|ENGAGEMENT/.test(row.actionType || row.action || '')), 'analytics access should be audited safely');

  const originalWorkspace = global.TeamWorkspaceService;
  const originalDiscussion = global.WorkflowDiscussionService;
  try {
    delete global.TeamWorkspaceService;
    delete global.WorkflowDiscussionService;
    const degraded = svc.generateCommunicationAnalyticsReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR', id: 'HR-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing analytics dependencies should degrade safely');
    assert.equal(degraded.integrationHealth.teamWorkspaceIntegrated, false, 'missing team workspace dependency should be visible');
  } finally {
    if (originalWorkspace) global.TeamWorkspaceService = originalWorkspace;
    if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
  }

  console.log('communicationAnalyticsService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
