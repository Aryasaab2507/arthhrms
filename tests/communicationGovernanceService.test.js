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

function seedCommunicationData() {
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
      title: 'Holiday Policy',
      body: 'Private policy text for Tabsons only',
      department: 'ALL',
      requiresAck: true,
      recipientIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: ['EMP-1'],
      acknowledgedUserIds: ['EMP-1'],
      createdAt: '2026-05-20T10:00:00.000Z'
    },
    {
      id: 'COM-2',
      threadId: 'THREAD-1',
      communicationId: 'COM-2',
      tenantSlug: 'tabsons',
      type: 'WORKFLOW_DISCUSSION',
      state: 'ACTIVE',
      workflowType: 'LEAVE',
      workflowId: 'WF-1',
      eventId: 'EVT-1',
      participantIds: ['EMP-1', 'MGR-1'],
      privateThread: true,
      message: 'Confidential leave discussion',
      createdAt: '2026-05-21T09:00:00.000Z'
    },
    {
      id: 'COM-3',
      communicationId: 'COM-3',
      tenantSlug: 'tabsons',
      type: 'ESCALATION_CONVERSATION',
      state: 'ESCALATED',
      escalationId: 'ESC-1',
      participantIds: ['MGR-1', 'HR-1'],
      message: 'Escalation detail for delayed approval',
      createdAt: '2026-05-22T09:00:00.000Z'
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
  data.policyAcknowledgements = [
    { id: 'ACK-1', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-05-20T12:00:00.000Z' },
    { id: 'ACK-2', tenantSlug: 'tabsons', communicationId: 'COM-1', empId: 'EMP-2', status: 'PENDING', dueAt: '2026-05-19T12:00:00.000Z' },
    { id: 'ACK-X', tenantSlug: 'abc', communicationId: 'COM-X', empId: 'EMP-X', status: 'PENDING', privateNote: 'ABC secret acknowledgement' }
  ];
  data.communicationAttachments = [
    { id: 'ATT-1', attachmentId: 'ATT-1', tenantSlug: 'tabsons', communicationId: 'COM-1', mimeType: 'application/pdf', fileName: 'policy-private.pdf', storagePath: 'tabsons/communications/COM-1/policy.pdf', signedUrl: 'https://signed.example.com/policy-private.pdf', expiresAt: '2026-05-24T10:00:00.000Z' },
    { id: 'ATT-X', attachmentId: 'ATT-X', tenantSlug: 'abc', communicationId: 'COM-X', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/abc-secret-attachment.pdf', fileName: 'abc-secret-attachment.pdf' }
  ];
  data.notifications = [
    { id: 'N-COM-1', tenantSlug: 'tabsons', module: 'Communications', title: 'Holiday Policy', message: 'Please acknowledge holiday policy', toRole: 'ALL', read: false, type: 'info', createdAt: '2026-05-20T10:00:00.000Z' },
    { id: 'N-COM-X', tenantSlug: 'abc', module: 'Communications', title: 'ABC Notice', message: 'ABC confidential notification', toRole: 'ALL', read: false, type: 'warn' }
  ];
  data.workflowEvents = [
    { eventId: 'EVT-1', tenantSlug: 'tabsons', type: 'LEAVE_SUBMITTED', workflowId: 'WF-1', status: 'PENDING', communicationId: 'COM-2', message: 'Leave workflow linked discussion' },
    { eventId: 'EVT-X', tenantSlug: 'abc', type: 'PAYROLL_FAILED', workflowId: 'WF-X', status: 'FAILED', communicationId: 'COM-X', message: 'ABC private workflow message' }
  ];
  data.pendingActions = [
    { id: 'PA-1', tenantSlug: 'tabsons', workflowId: 'WF-1', communicationId: 'COM-2', actionType: 'LEAVE_REVIEW', status: 'Pending', targetRole: 'MANAGER' }
  ];
  data.escalations = [
    { escalationId: 'ESC-1', tenantSlug: 'tabsons', communicationId: 'COM-3', status: 'OPEN', severity: 'HIGH_RISK' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-COM-1', tenantSlug: 'tabsons', jobType: 'COMMUNICATION_BROADCAST', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'COM-1' },
    { jobId: 'JOB-COM-X', tenantSlug: 'abc', jobType: 'COMMUNICATION_BROADCAST', state: 'FAILED', payload: { message: 'ABC confidential payload' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.communicationGovernanceRuns = [];
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
  load('services/communicationGovernanceService.js');
  seedCommunicationData();

  const svc = global.CommunicationGovernanceService;
  assert.ok(svc, 'CommunicationGovernanceService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.COMMUNICATION_STATES), 'communication states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_COMMUNICATION_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyCommunicationRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant communication visibility is critical');
  assert.equal(svc.classifyCommunicationRisk({ publicAttachment: true }), 'CRITICAL_BLOCKER', 'public attachment exposure is critical');
  assert.equal(svc.classifyCommunicationRisk({ privateDiscussionAccess: true }), 'HIGH_RISK', 'private discussion exposure is high risk');
  assert.equal(svc.classifyCommunicationRisk({ acknowledgementDelay: true }), 'WARNING', 'acknowledgement delay is warning risk');

  const employeeOwn = svc.validateCommunicationScope({ tenantSlug: 'tabsons', communicationId: 'COM-2', participantIds: ['EMP-1', 'MGR-1'], privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeOwn.allowed, true, 'employee may see own workflow discussion');
  assert.equal(employeeOwn.visibility, 'OWN_DISCUSSIONS_ONLY');

  const managerTeam = svc.validateCommunicationScope({ tenantSlug: 'tabsons', communicationId: 'COM-2', participantIds: ['EMP-1', 'MGR-1'], privateThread: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team communication metadata');
  assert.equal(managerTeam.visibility, 'TEAM_COMMUNICATION_VISIBILITY');

  const superAdminPrivate = svc.validateCommunicationScope({ tenantSlug: 'tabsons', communicationId: 'COM-2', participantIds: ['EMP-1', 'MGR-1'], privateThread: true, message: 'Confidential leave discussion' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPrivate.allowed, false, 'SUPER_ADMIN must not access private employee discussions');
  assert.ok(superAdminPrivate.failures.some(item => item.failureCode === 'SUPER_ADMIN_PRIVATE_DISCUSSION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminPrivate), /Confidential leave|message|EMP-1/i, 'SUPER_ADMIN failure output must redact discussion data');

  const platformScope = svc.validateCommunicationScope({ tenantSlug: 'tabsons', communicationId: 'COM-1', recipientIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in communication hierarchy');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_COMMUNICATION_ACCESS_BLOCKED'));

  const crossTenant = svc.validateCommunicationScope({ tenantSlug: 'abc', communicationId: 'COM-X', participantIds: ['EMP-X', 'MGR-X'], message: 'ABC confidential communication' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant communication visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /COM-X|EMP-X|ABC confidential|message/i, 'cross-tenant failure must not leak communication data');

  const malformed = svc.validateCommunicationPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed communication payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_COMMUNICATION_PAYLOAD'));

  const platformParticipant = svc.validateCommunicationPayload({
    tenantSlug: 'tabsons',
    communicationId: 'COM-4',
    type: 'WORKFLOW_DISCUSSION',
    participantIds: ['EMP-1', 'PO-1'],
    participantRoles: ['EMPLOYEE', 'PLATFORM_OWNER']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(platformParticipant.success, false, 'PLATFORM_OWNER must be excluded from communication chains');
  assert.ok(platformParticipant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_COMMUNICATION_CHAIN_BLOCKED'));

  const attachmentAccess = svc.validateAttachmentGovernance({
    tenantSlug: 'tabsons',
    communicationId: 'COM-1',
    attachmentId: 'ATT-1',
    mimeType: 'application/pdf',
    fileName: 'policy-private.pdf',
    signedUrl: 'https://signed.example.com/policy-private.pdf',
    expiresAt: '2026-05-24T10:00:00.000Z'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(attachmentAccess.success, true, 'HR may access governed attachment metadata');
  assert.equal(attachmentAccess.attachmentGovernance.signedAccessRequired, true, 'attachment governance should require signed access');
  assert.doesNotMatch(JSON.stringify(attachmentAccess), /policy-private|signed\.example|fileName|signedUrl/i, 'attachment governance output must not expose file locations');

  const publicAttachment = svc.validateAttachmentGovernance({
    tenantSlug: 'tabsons',
    communicationId: 'COM-1',
    attachmentId: 'ATT-2',
    mimeType: 'application/pdf',
    publicUrl: 'https://public.example.com/policy-public.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(publicAttachment.success, false, 'public attachment exposure must be blocked');
  assert.ok(publicAttachment.failures.some(item => item.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'));

  const normalized = svc.normalizeCommunicationPayload({
    tenantSlug: 'tabsons',
    communicationId: 'COM-1',
    type: 'hr announcement',
    title: 'Holiday Policy',
    body: 'Private policy text for Tabsons only',
    recipientIds: ['EMP-1', 'EMP-2'],
    state: 'ack pending'
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized communication output must be immutable');
  assert.equal(normalized.payload.state, 'ACK_PENDING');
  assert.doesNotMatch(JSON.stringify(normalized), /Private policy|body|EMP-1|EMP-2/i, 'normalized payload should not expose confidential communication data');

  const congestion = svc.detectCommunicationCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(congestion.success, true, 'communication congestion should be detected safely');
  assert.ok(congestion.summary.pendingAcknowledgements >= 1, 'pending acknowledgements should be visible');
  assert.ok(congestion.summary.unreadAnnouncements >= 1, 'unread announcements should be counted');
  assert.ok(congestion.summary.escalationCommunicationDensity >= 1, 'escalation communication density should be counted');
  assert.ok(Object.isFrozen(congestion.channels), 'communication channel output must be immutable');
  assert.doesNotMatch(JSON.stringify(congestion), /ABC confidential|abc-secret|Private policy|Confidential leave/i, 'congestion output must not leak private communication fields');

  const dataBefore = global.DB.get();
  const communicationBefore = JSON.stringify({
    communications: dataBefore.communications,
    policyAcknowledgements: dataBefore.policyAcknowledgements,
    communicationAttachments: dataBefore.communicationAttachments
  });
  const schedule = svc.scheduleCommunicationWorkflow({
    tenantSlug: 'tabsons',
    communicationId: 'COM-1',
    type: 'POLICY_BROADCAST',
    priority: 'HIGH',
    requiresAck: true,
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(schedule.success, true, 'communication workflow scheduling should work');
  assert.ok(schedule.asyncJob, 'communication scheduling should integrate with async jobs');
  assert.equal(JSON.stringify({
    communications: global.DB.get().communications,
    policyAcknowledgements: global.DB.get().policyAcknowledgements,
    communicationAttachments: global.DB.get().communicationAttachments
  }), communicationBefore, 'communication scheduling must not mutate historical communication records');

  const report = svc.generateCommunicationGovernanceReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'communication governance report should generate safely');
  assert.equal(report.readOnly, true, 'communication governance report should be read-only');
  assert.ok(report.announcementHealth.totalAnnouncements >= 1, 'announcement health should be visible');
  assert.ok(report.policyAcknowledgements.pendingAcknowledgements >= 1, 'policy acknowledgement status should be visible');
  assert.ok(report.workflowDiscussions.linkedDiscussions >= 1, 'workflow-linked discussions should be visible');
  assert.ok(report.communicationAnalytics.unreadAnnouncements >= 1, 'communication analytics should include unread counts');
  assert.equal(report.accessGovernance.superAdminPrivateAccess, false, 'SUPER_ADMIN private discussion access remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /COM-X|EMP-X|ABC confidential|abc-secret|Private policy text|Confidential leave|message|body|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential communication data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /COMMUNICATION_GOVERNANCE|COMMUNICATION_WORKFLOW/.test(row.eventType || row.category || '')), 'communication telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.COMMUNICATION_GOVERNANCE_REPORTED, 'communication governance metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /COMMUNICATION_GOVERNANCE|COMMUNICATION_WORKFLOW/.test(row.actionType || row.action || '')), 'communication actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleCommunicationWorkflow({ tenantSlug: 'tabsons', communicationId: 'COM-SELF', type: 'HR_ANNOUNCEMENT' }, {
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

  console.log('communicationGovernanceService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
