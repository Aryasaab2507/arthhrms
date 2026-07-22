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

function seedAnnouncementData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Employee One', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', onboardingStage: 'ACTIVE' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Employee Two', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', onboardingStage: 'ONBOARDING' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', name: 'Manager One', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', name: 'HR One', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', employeeId: 'HRH-1', name: 'HR Head', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', name: 'Director One', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', employeeId: 'MGR-X', name: 'Other Manager', role: 'MANAGER', department: 'Engineering', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'Other Employee', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.announcements = [
    {
      id: 'ANN-1',
      announcementId: 'ANN-1',
      tenantSlug: 'tabsons',
      type: 'LEADERSHIP_ANNOUNCEMENT',
      state: 'PUBLISHED',
      title: 'CEO Update',
      body: 'Confidential leadership update for Tabsons only',
      targetType: 'ORGANIZATION_WIDE',
      targetRoles: ['EMPLOYEE', 'MANAGER', 'HR'],
      assignedEmployeeIds: ['EMP-1', 'EMP-2'],
      viewedUserIds: ['EMP-1'],
      acknowledgedUserIds: ['EMP-1'],
      requiresAck: true,
      createdAt: '2026-05-20T10:00:00.000Z'
    },
    {
      id: 'ANN-2',
      announcementId: 'ANN-2',
      tenantSlug: 'tabsons',
      type: 'EMERGENCY_BROADCAST',
      state: 'SCHEDULED',
      title: 'Facility Alert',
      body: 'Emergency leadership message with confidential operational details',
      targetType: 'DEPARTMENT',
      department: 'Engineering',
      targetRoles: ['MANAGER', 'EMPLOYEE'],
      assignedEmployeeIds: ['EMP-1', 'EMP-2'],
      requiresAck: true,
      emergency: true,
      scheduledAt: '2026-05-24T09:00:00.000Z',
      expiresAt: '2026-05-25T09:00:00.000Z'
    },
    {
      id: 'ANN-3',
      announcementId: 'ANN-3',
      tenantSlug: 'tabsons',
      type: 'MILESTONE_ANNOUNCEMENT',
      state: 'ACK_PENDING',
      title: 'Launch Milestone',
      body: 'Private milestone detail',
      targetType: 'ROLE',
      targetRoles: ['MANAGER', 'HR_HEAD'],
      requiresAck: false
    },
    {
      id: 'ANN-X',
      announcementId: 'ANN-X',
      tenantSlug: 'abc',
      type: 'LEADERSHIP_ANNOUNCEMENT',
      state: 'PUBLISHED',
      title: 'ABC Leadership Update',
      body: 'ABC confidential leadership communication',
      assignedEmployeeIds: ['EMP-X'],
      targetRoles: ['EMPLOYEE']
    }
  ];
  data.announcementAcknowledgements = [
    { id: 'AACK-1', tenantSlug: 'tabsons', announcementId: 'ANN-1', empId: 'EMP-1', status: 'ACKNOWLEDGED', acknowledgedAt: '2026-05-20T12:00:00.000Z' },
    { id: 'AACK-2', tenantSlug: 'tabsons', announcementId: 'ANN-1', empId: 'EMP-2', status: 'PENDING', dueAt: '2026-05-19T12:00:00.000Z', privateNote: 'Employee-specific acknowledgement note' },
    { id: 'AACK-3', tenantSlug: 'tabsons', announcementId: 'ANN-2', empId: 'EMP-1', status: 'PENDING', dueAt: '2026-05-24T12:00:00.000Z' },
    { id: 'AACK-X', tenantSlug: 'abc', announcementId: 'ANN-X', empId: 'EMP-X', status: 'PENDING', privateNote: 'ABC secret acknowledgement' }
  ];
  data.announcementMedia = [
    { id: 'AMEDIA-1', mediaId: 'AMEDIA-1', tenantSlug: 'tabsons', announcementId: 'ANN-1', mimeType: 'application/pdf', fileName: 'ceo-update-private.pdf', storagePath: 'tabsons/announcements/ANN-1.pdf', signedUrl: 'https://signed.example.com/ceo-update-private.pdf', expiresAt: '2026-05-24T10:00:00.000Z', checksum: 'sha256-ann-1' },
    { id: 'AMEDIA-X', mediaId: 'AMEDIA-X', tenantSlug: 'abc', announcementId: 'ANN-X', mimeType: 'application/pdf', fileName: 'abc-leadership-private.pdf', publicUrl: 'https://public.example.com/abc-leadership-private.pdf' }
  ];
  data.notifications = [
    { id: 'N-ANN-1', tenantSlug: 'tabsons', module: 'Announcement Hub', category: 'LEADERSHIP_ANNOUNCEMENT', title: 'CEO Update', message: 'Please read the leadership update', read: false, type: 'info', createdAt: '2026-05-20T10:00:00.000Z' },
    { id: 'N-ANN-2', tenantSlug: 'tabsons', module: 'Announcement Hub', category: 'EMERGENCY_BROADCAST', title: 'Facility Alert', message: 'Emergency acknowledgement required', read: false, type: 'critical', createdAt: '2026-05-23T10:00:00.000Z' },
    { id: 'N-ANN-X', tenantSlug: 'abc', module: 'Announcement Hub', category: 'LEADERSHIP_ANNOUNCEMENT', title: 'ABC Notice', message: 'ABC confidential notification', read: false, type: 'warn' }
  ];
  data.asyncJobs = [
    { jobId: 'JOB-ANN-1', tenantSlug: 'tabsons', jobType: 'ANNOUNCEMENT_BROADCAST', state: 'RETRY_PENDING', priority: 'HIGH', retryAttempts: 1, maxRetries: 3, correlationId: 'ANN-1' },
    { jobId: 'JOB-ANN-2', tenantSlug: 'tabsons', jobType: 'EMERGENCY_BROADCAST', state: 'SCHEDULED', priority: 'CRITICAL', retryAttempts: 0, maxRetries: 2, correlationId: 'ANN-2' },
    { jobId: 'JOB-ANN-X', tenantSlug: 'abc', jobType: 'ANNOUNCEMENT_BROADCAST', state: 'FAILED', payload: { message: 'ABC confidential payload' }, retryAttempts: 3, maxRetries: 3 }
  ];
  data.announcementHubRuns = [];
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
    'services/policyGovernanceService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/announcementHubService.js');
  seedAnnouncementData();

  const svc = global.AnnouncementHubService;
  assert.ok(svc, 'AnnouncementHubService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ANNOUNCEMENT_STATES), 'announcement states must be immutable');
  assert.ok(Object.isFrozen(svc.ANNOUNCEMENT_TYPES), 'announcement types must be immutable');
  assert.equal(global.__ARTHHRMS_ANNOUNCEMENT_HUB_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyAnnouncementRisk({ crossTenant: true }), 'CRITICAL_BLOCKER', 'cross-tenant announcement visibility is critical');
  assert.equal(svc.classifyAnnouncementRisk({ publicMedia: true }), 'CRITICAL_BLOCKER', 'public media exposure is critical');
  assert.equal(svc.classifyAnnouncementRisk({ superAdminPublish: true }), 'HIGH_RISK', 'SUPER_ADMIN publish attempt is high risk');
  assert.equal(svc.classifyAnnouncementRisk({ unreadSpike: true }), 'WARNING', 'unread spikes are warning risk');

  const employeeAssigned = svc.validateAnnouncementScope({ tenantSlug: 'tabsons', announcementId: 'ANN-1', assignedEmployeeIds: ['EMP-1', 'EMP-2'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may see assigned announcements only');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_ANNOUNCEMENTS_ONLY');

  const managerTeam = svc.validateAnnouncementScope({ tenantSlug: 'tabsons', announcementId: 'ANN-1', assignedEmployeeIds: ['EMP-1', 'EMP-2'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' }
  });
  assert.equal(managerTeam.allowed, true, 'manager may see team announcement visibility');
  assert.equal(managerTeam.visibility, 'TEAM_ANNOUNCEMENT_VISIBILITY');

  const superAdminPublish = svc.validateAnnouncementPayload({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-NEW',
    type: 'LEADERSHIP_ANNOUNCEMENT',
    state: 'PUBLISHED',
    publishNow: true
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPublish.success, false, 'SUPER_ADMIN must not publish leadership announcements');
  assert.ok(superAdminPublish.failures.some(item => item.failureCode === 'SUPER_ADMIN_ANNOUNCEMENT_PUBLISH_BLOCKED'));

  const platformScope = svc.validateAnnouncementScope({ tenantSlug: 'tabsons', announcementId: 'ANN-1', assignedEmployeeIds: ['EMP-1'] }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must not appear in employee communication chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_ANNOUNCEMENT_ACCESS_BLOCKED'));

  const crossTenant = svc.validateAnnouncementScope({ tenantSlug: 'abc', announcementId: 'ANN-X', assignedEmployeeIds: ['EMP-X'], body: 'ABC confidential leadership communication' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant announcement visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /ANN-X|EMP-X|ABC confidential|body/i, 'cross-tenant failure must not leak announcement data');

  const malformed = svc.validateAnnouncementPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed announcement payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_ANNOUNCEMENT_PAYLOAD'));

  const platformParticipant = svc.validateAnnouncementPayload({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-4',
    type: 'STRATEGIC_UPDATE',
    targetRoles: ['EMPLOYEE', 'PLATFORM_OWNER'],
    assignedEmployeeIds: ['EMP-1']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(platformParticipant.success, false, 'PLATFORM_OWNER must be excluded from announcement chains');
  assert.ok(platformParticipant.failures.some(item => item.failureCode === 'PLATFORM_OWNER_IN_ANNOUNCEMENT_CHAIN_BLOCKED'));

  const normalized = svc.normalizeAnnouncementPayload({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-1',
    type: 'leadership announcement',
    state: 'review pending',
    title: 'CEO Update',
    body: 'Confidential leadership update for Tabsons only',
    assignedEmployeeIds: ['EMP-1', 'EMP-2']
  }, { tenantSlug: 'tabsons' });
  assert.ok(Object.isFrozen(normalized), 'normalized announcement output must be immutable');
  assert.equal(normalized.payload.state, 'REVIEW_PENDING');
  assert.equal(normalized.payload.type, 'LEADERSHIP_ANNOUNCEMENT');
  assert.doesNotMatch(JSON.stringify(normalized), /Confidential leadership|body|EMP-1|EMP-2/i, 'normalized payload should not expose confidential communication data');

  const targetMismatch = svc.validateAnnouncementTargeting({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-5',
    targetTenantSlug: 'abc',
    targetRoles: ['EMPLOYEE']
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(targetMismatch.success, false, 'cross-tenant audience targeting must be blocked');
  assert.ok(targetMismatch.failures.some(item => item.failureCode === 'CROSS_TENANT_ANNOUNCEMENT_TARGETING_BLOCKED'));

  const mediaAccess = svc.validateAnnouncementMedia({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-1',
    mediaId: 'AMEDIA-1',
    mimeType: 'application/pdf',
    fileName: 'ceo-update-private.pdf',
    signedUrl: 'https://signed.example.com/ceo-update-private.pdf',
    expiresAt: '2026-05-24T10:00:00.000Z'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(mediaAccess.success, true, 'HR may access governed announcement media metadata');
  assert.equal(mediaAccess.mediaGovernance.signedAccessRequired, true, 'announcement media should require signed access');
  assert.doesNotMatch(JSON.stringify(mediaAccess), /ceo-update|signed\.example|fileName|signedUrl/i, 'announcement media governance output must not expose file locations');

  const publicMedia = svc.validateAnnouncementMedia({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-1',
    mediaId: 'AMEDIA-PUBLIC',
    mimeType: 'application/pdf',
    publicUrl: 'https://public.example.com/announcement-public.pdf'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1' }
  });
  assert.equal(publicMedia.success, false, 'public announcement media exposure must be blocked');
  assert.ok(publicMedia.failures.some(item => item.failureCode === 'PUBLIC_ANNOUNCEMENT_MEDIA_EXPOSURE_BLOCKED'));

  const congestion = svc.detectBroadcastCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-24T00:00:00.000Z' });
  assert.equal(congestion.success, true, 'broadcast congestion should be detected safely');
  assert.ok(congestion.summary.unreadAnnouncements >= 1, 'unread announcements should be visible');
  assert.ok(congestion.summary.pendingAcknowledgements >= 1, 'pending acknowledgements should be visible');
  assert.ok(congestion.summary.emergencyBroadcasts >= 1, 'emergency broadcast indicators should be visible');
  assert.ok(Object.isFrozen(congestion.audienceTrends), 'audience trend output must be immutable');
  assert.doesNotMatch(JSON.stringify(congestion), /ABC confidential|ABC secret|Confidential leadership|Employee-specific/i, 'congestion output must not leak private announcement data');

  const dataBefore = global.DB.get();
  const historicalBefore = JSON.stringify({
    announcements: dataBefore.announcements,
    announcementAcknowledgements: dataBefore.announcementAcknowledgements,
    announcementMedia: dataBefore.announcementMedia
  });
  const schedule = svc.scheduleAnnouncementBroadcast({
    tenantSlug: 'tabsons',
    announcementId: 'ANN-2',
    type: 'EMERGENCY_BROADCAST',
    priority: 'CRITICAL',
    emergency: true,
    schedule: { runAt: '2026-05-24T09:00:00.000Z' }
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(schedule.success, true, 'scheduled announcement broadcast should work');
  assert.ok(schedule.asyncJob, 'scheduled announcements should integrate with async jobs');
  assert.equal(JSON.stringify({
    announcements: global.DB.get().announcements,
    announcementAcknowledgements: global.DB.get().announcementAcknowledgements,
    announcementMedia: global.DB.get().announcementMedia
  }), historicalBefore, 'scheduling must not mutate historical announcement records');

  const report = svc.generateAnnouncementHubReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-24T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'announcement hub report should generate safely');
  assert.equal(report.readOnly, true, 'announcement hub report should be read-only');
  assert.ok(report.announcementHealth.totalAnnouncements >= 3, 'announcement health should be visible');
  assert.ok(report.leadershipCommunication.leadershipBroadcasts >= 1, 'leadership broadcasts should be visible');
  assert.ok(report.leadershipCommunication.emergencyBroadcasts >= 1, 'emergency broadcast indicators should be visible');
  assert.ok(report.targetingGovernance.organizationWideTargets >= 1, 'targeting governance should be visible');
  assert.ok(report.acknowledgementGovernance.pendingAcknowledgements >= 1, 'acknowledgement status should be visible');
  assert.ok(report.communicationAnalytics.unreadAnnouncementRate >= 1, 'communication analytics should include unread rates');
  assert.equal(report.accessGovernance.superAdminPublishAuthority, false, 'SUPER_ADMIN publishing remains blocked');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /ANN-X|EMP-X|ABC confidential|ABC secret|Confidential leadership update|Employee-specific|body|signedUrl|fileName/i, 'report must not expose cross-tenant or confidential announcement data');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /ANNOUNCEMENT_HUB|ANNOUNCEMENT_BROADCAST/.test(row.eventType || row.category || '')), 'announcement telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.ANNOUNCEMENT_HUB_REPORTED, 'announcement hub metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /ANNOUNCEMENT_HUB|ANNOUNCEMENT_BROADCAST/.test(row.actionType || row.action || '')), 'announcement actions should be audited safely');

  const originalAsync = global.AsyncJobService;
  const originalNotify = global.NotificationOrchestrationService;
  try {
    delete global.AsyncJobService;
    delete global.NotificationOrchestrationService;
    const degraded = svc.scheduleAnnouncementBroadcast({ tenantSlug: 'tabsons', announcementId: 'ANN-SELF', type: 'HR_ANNOUNCEMENT' }, {
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

  console.log('announcementHubService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
