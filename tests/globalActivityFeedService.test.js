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

function seedActivityFeedData() {
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
    { id: 'EMP-1', empId: 'EMP-1', name: 'Alice Apollo', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons', managerId: 'MGR-1', salary: 999999, leaveBalance: 21 },
    { id: 'MGR-1', empId: 'MGR-1', name: 'Mira Manager', role: 'MANAGER', department: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'HR-1', empId: 'HR-1', name: 'Harini HR', role: 'HR', department: 'People', tenantSlug: 'tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', name: 'Dev Director', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', name: 'Other Tenant Secret', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', salary: 888888, leaveBalance: 42 }
  ];
  data.attendance = [
    { attendanceId: 'AT-1', empId: 'EMP-1', actorId: 'EMP-1', action: 'CLOCK_IN', date: '2026-06-01', status: 'PRESENT', department: 'Engineering', tenantSlug: 'tabsons', note: 'Apollo daily standup', createdAt: '2026-06-01T03:30:00.000Z' },
    { attendanceId: 'AT-X', empId: 'EMP-X', actorId: 'EMP-X', action: 'CLOCK_IN', date: '2026-06-01', status: 'PRESENT', tenantSlug: 'abc', note: 'Other payroll standup salary 888888', createdAt: '2026-06-01T03:30:00.000Z' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', actorId: 'EMP-1', title: 'Apollo release leave request', type: 'Casual Leave', status: 'PENDING', department: 'Engineering', from: '2026-06-08', to: '2026-06-09', tenantSlug: 'tabsons', reason: 'Apollo launch support handoff', correlationId: 'CORR-APPROVAL-1', createdAt: '2026-06-02T04:00:00.000Z' },
    { leaveId: 'LV-X', empId: 'EMP-X', actorId: 'EMP-X', title: 'Payroll exposure leave', status: 'APPROVED', tenantSlug: 'abc', reason: 'salary 888888 leave balance 42', createdAt: '2026-06-02T04:00:00.000Z' }
  ];
  data.payroll = [
    { payrollId: 'PAY-1', empId: 'EMP-1', actorId: 'HR-1', title: 'Payroll cycle prepared', status: 'DRAFT', department: 'People', tenantSlug: 'tabsons', amount: 999999, salary: 999999, createdAt: '2026-06-02T05:00:00.000Z' },
    { payrollId: 'PAY-X', empId: 'EMP-X', actorId: 'HR-X', title: 'Other tenant payroll', status: 'POSTED', tenantSlug: 'abc', amount: 888888, salary: 888888, createdAt: '2026-06-02T05:30:00.000Z' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', title: 'Apollo approval workflow', type: 'APPROVAL', status: 'BLOCKED', workflowId: 'WF-APOLLO', empId: 'EMP-1', actorId: 'MGR-1', department: 'Engineering', tenantSlug: 'tabsons', correlationId: 'CORR-APPROVAL-1', createdAt: '2026-06-03T12:00:00.000Z' },
    { eventId: 'WF-2', title: 'Apollo approval acknowledged', type: 'APPROVAL_ACK', status: 'APPROVED', workflowId: 'WF-APOLLO', empId: 'EMP-1', actorId: 'MGR-1', department: 'Engineering', tenantSlug: 'tabsons', correlationId: 'CORR-APPROVAL-1', createdAt: '2026-06-03T13:00:00.000Z' }
  ];
  data.strategicDeliverables = [
    { deliverableId: 'DEL-1', title: 'Apollo Hiring Sprint', description: 'Hiring deliverable for Apollo expansion', status: 'ACTIVE', department: 'Engineering', ownerId: 'MGR-1', actorId: 'DIR-1', tenantSlug: 'tabsons', projectId: 'PROJ-1', correlationId: 'CORR-MILESTONE-1', updatedAt: '2026-06-04T10:00:00.000Z' }
  ];
  data.announcements = [
    { announcementId: 'ANN-1', title: 'Apollo launch town hall', body: 'Engineering and HR launch readiness.', category: 'HR', status: 'PUBLISHED', tenantSlug: 'tabsons', createdBy: 'HR-1', createdAt: '2026-06-04T10:30:00.000Z' }
  ];
  data.discussions = [
    { discussionId: 'DISC-1', title: 'Apollo workflow discussion', message: 'Resolve approval handoff.', category: 'WORKFLOW', status: 'OPEN', department: 'Engineering', tenantSlug: 'tabsons', createdBy: 'MGR-1', participants: ['EMP-1', 'MGR-1'], correlationId: 'CORR-APPROVAL-1', createdAt: '2026-06-04T11:00:00.000Z' }
  ];
  data.documents = [
    { documentId: 'DOC-1', title: 'Apollo HR Policy uploaded', category: 'POLICY', status: 'ACTIVE', ownerEmpId: 'HR-1', actorId: 'HR-1', department: 'People', visibility: 'HR', tenantSlug: 'tabsons', createdAt: '2026-06-04T11:30:00.000Z', body: 'Apollo HR rollout policy' },
    { documentId: 'DOC-X', title: 'Other Tenant Salary Document', category: 'PAYROLL', status: 'ACTIVE', ownerEmpId: 'EMP-X', visibility: 'HR', tenantSlug: 'abc', body: 'salary 888888 payrollAmount 888888', createdAt: '2026-06-04T11:30:00.000Z' }
  ];
  data.notifications = [
    { notificationId: 'N-1', id: 'N-1', title: 'Apollo approval waiting', message: 'Manager approval is waiting.', category: 'APPROVAL', state: 'CREATED', priority: 'HIGH', toRole: 'MANAGER', tenantSlug: 'tabsons', correlationId: 'CORR-APPROVAL-1', createdAt: '2026-06-04T12:00:00.000Z' },
    { notificationId: 'N-X', id: 'N-X', title: 'Payroll Exposure', message: 'Salary 888888 payrollAmount 888888', category: 'PAYROLL', state: 'CREATED', priority: 'CRITICAL', toRole: 'HR', tenantSlug: 'abc', salary: 888888, createdAt: '2026-06-04T12:00:00.000Z' }
  ];
  data.onboardingTasks = [
    { taskId: 'ONB-1', onboardingId: 'ONB-APOLLO-1', empId: 'EMP-1', actorId: 'HR-1', title: 'Apollo onboarding checklist', status: 'IN_PROGRESS', department: 'People', tenantSlug: 'tabsons', createdAt: '2026-06-04T12:30:00.000Z' }
  ];
  data.auditLogs = [
    { id: 'AUD-1', logId: 'AUD-1', actionType: 'ACTIVITY_FEED_REVIEW', module: 'Audit Governance', description: 'Apollo activity governance reviewed', tenantSlug: 'tabsons', actorRole: 'HR', actorId: 'HR-1', createdAt: '2026-06-04T13:00:00.000Z' },
    { id: 'AUD-X', logId: 'AUD-X', actionType: 'PAYROLL_EXPORT', module: 'Payroll', description: 'Salary 888888 exported', tenantSlug: 'abc', actorRole: 'HR', actorId: 'HR-X', createdAt: '2026-06-04T13:30:00.000Z' }
  ];
  data.fileAttachmentAuditTrail = [
    { trailId: 'FILE-1', documentId: 'DOC-1', actorId: 'HR-1', title: 'Apollo policy file governance scan', actionType: 'FILE_SCANNED', status: 'VERIFIED_SAFE', tenantSlug: 'tabsons', createdAt: '2026-06-04T14:00:00.000Z' }
  ];
  for (let i = 0; i < 1200; i += 1) {
    data.workflowEvents.push({
      eventId: `WF-BULK-${i}`,
      title: `Bulk workflow event ${i}`,
      type: i % 3 ? 'WORKFLOW' : 'APPROVAL',
      status: i % 5 ? 'PROCESSED' : 'BLOCKED',
      workflowId: `WF-BULK-${Math.floor(i / 5)}`,
      empId: 'EMP-1',
      actorId: i % 2 ? 'EMP-1' : 'MGR-1',
      department: 'Engineering',
      tenantSlug: 'tabsons',
      correlationId: `CORR-BULK-${Math.floor(i / 10)}`,
      createdAt: `2026-05-${String((i % 20) + 1).padStart(2, '0')}T08:00:00.000Z`
    });
  }
  global.DB.save(data);
}

function loadRuntime() {
  setupRuntime();
  [
    'db.js',
    'services/authService.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantIsolationService.js',
    'services/notificationService.js',
    'services/notificationRoutingService.js',
    'services/notificationOrchestrationService.js',
    'services/notificationCenterService.js',
    'services/smartSearchService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/globalActivityFeedService.js');
  seedActivityFeedData();
}

function assertNoConfidentialLeak(value, label) {
  assert.doesNotMatch(JSON.stringify(value), /888888|999999|salary|payrollAmount|leave balance|Other Tenant Secret|Other Tenant Salary|Payroll Exposure/i, label);
}

function main() {
  loadRuntime();
  const svc = global.GlobalActivityFeedService;
  assert.ok(svc, 'GlobalActivityFeedService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.FEED_STATES), 'feed states must be immutable');
  assert.deepEqual(Object.values(svc.FEED_STATES), ['CREATED', 'PROCESSED', 'VISIBLE', 'ACKNOWLEDGED', 'ARCHIVED']);
  assert.equal(global.__ARTHHRMS_GLOBAL_ACTIVITY_FEED_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  const malformed = svc.normalizeActivityPayload('bad-payload', { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payloads should be rejected safely');
  assert.ok(Object.isFrozen(malformed), 'malformed output must be immutable');

  const normalized = svc.normalizeActivityPayload({
    activityId: 'ACT-NORM-1',
    tenantSlug: 'tabsons',
    actorId: 'HR-1',
    activityType: 'PAYROLL_ACTION',
    title: 'Payroll prepared',
    message: 'salary=999999 leave balance 21',
    metadata: { salary: 999999, leaveBalance: 21 }
  }, { tenantSlug: 'tabsons', actor: { role: 'hr', id: 'HR-1' } });
  assert.equal(normalized.success, true, 'valid activity should normalize');
  assert.equal(normalized.activity.state, 'CREATED');
  assert.ok(Object.isFrozen(normalized.activity), 'normalized activity must be immutable');
  assertNoConfidentialLeak(normalized, 'normalized activity must redact confidential values');

  const importance = svc.calculateActivityImportance({
    activityType: 'NOTIFICATION_EVENT',
    category: 'INCIDENT',
    priority: 'CRITICAL',
    status: 'BLOCKED',
    title: 'Critical approval blocked'
  });
  assert.equal(importance.priorityClass, 'CRITICAL', 'critical activities should classify as critical');
  assert.ok(importance.activityImportanceScore >= 80, 'importance score should be high');
  assert.ok(Object.isFrozen(importance), 'importance output must be immutable');

  const employeeFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 40,
    filters: { userId: 'EMP-1' }
  }, {
    actor: { role: 'employee', id: 'EMP-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(employeeFeed.success, true, 'employee feed should build');
  assert.ok(employeeFeed.activities.some(row => row.actorId === 'EMP-1' || row.subjectId === 'EMP-1'), 'employee should see personal activity');
  assert.ok(!employeeFeed.activities.some(row => row.activityType === 'AUDIT_EVENT'), 'employee should not see audit activity');
  assert.ok(!employeeFeed.activities.some(row => row.entityId === 'DOC-1'), 'employee should not see HR-only file activity');
  assertNoConfidentialLeak(employeeFeed, 'employee feed must be tenant-scoped and redacted');

  const managerFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 50,
    filters: { department: 'Engineering', activityType: 'APPROVAL' }
  }, {
    actor: { role: 'manager', id: 'MGR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(managerFeed.success, true, 'manager feed should build');
  assert.ok(managerFeed.activities.some(row => row.workflowId === 'WF-APOLLO'), 'manager should see team workflow activity');
  assert.ok(managerFeed.groups.some(group => group.groupType === 'APPROVAL_CHAIN'), 'approval chain grouping should be present');
  assert.ok(!managerFeed.activities.some(row => row.activityType === 'PAYROLL_ACTION'), 'manager should not see payroll activity');
  assertNoConfidentialLeak(managerFeed, 'manager feed must remain redacted');

  const hrFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 50,
    filters: { category: 'HR', dateFrom: '2026-06-01', dateTo: '2026-06-05' }
  }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(hrFeed.success, true, 'HR feed should build');
  assert.ok(hrFeed.activities.some(row => row.activityType === 'ONBOARDING_ACTION'), 'HR should see onboarding activity');
  assert.ok(hrFeed.activities.some(row => row.activityType === 'FILE_GOVERNANCE'), 'HR should see file governance activity');
  assert.ok(hrFeed.filtersApplied.length >= 3, 'combined filters should be applied');
  assertNoConfidentialLeak(hrFeed, 'HR feed must redact payroll and leave-balance values');

  const directorFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 40,
    filters: { activityType: 'STRATEGIC_EXECUTION' }
  }, {
    actor: { role: 'director', id: 'DIR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(directorFeed.success, true, 'director feed should build');
  assert.ok(directorFeed.activities.some(row => row.activityType === 'STRATEGIC_EXECUTION'), 'director should see strategic execution activity');
  assert.ok(directorFeed.groups.some(group => group.groupType === 'PROJECT_MILESTONE'), 'project milestone grouping should be present');
  assert.ok(!directorFeed.activities.some(row => row.activityType === 'PAYROLL_ACTION'), 'director should not see payroll personal activity');

  const platformFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 30,
    filters: { activityType: 'AUDIT_EVENT' }
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    routeType: 'platform'
  });
  assert.equal(platformFeed.success, true, 'platform owner governance feed should build');
  assert.ok(platformFeed.activities.every(row => ['AUDIT_EVENT', 'NOTIFICATION_EVENT', 'FILE_GOVERNANCE', 'SYSTEM_EVENT'].includes(row.activityType)), 'platform feed should stay governance scoped');
  assertNoConfidentialLeak(platformFeed, 'platform feed must remain metadata-only and redacted');

  const pagedFeed = svc.buildActivityFeed({
    tenantSlug: 'tabsons',
    limit: 25,
    offset: 10,
    filters: { department: 'Engineering' }
  }, {
    actor: { role: 'manager', id: 'MGR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(pagedFeed.success, true, 'paged feed should build');
  assert.equal(pagedFeed.pagination.limit, 25, 'pagination limit should be honored');
  assert.equal(pagedFeed.pagination.offset, 10, 'pagination offset should be honored');
  assert.ok(typeof pagedFeed.pagination.hasMore === 'boolean', 'pagination should expose hasMore');
  assert.ok(pagedFeed.analytics.activityVolume >= pagedFeed.activities.length, 'analytics should track activity volume');
  assert.ok(pagedFeed.analytics.feedPerformance.latencyMs >= 0, 'feed latency should be tracked');
  assert.ok(Object.isFrozen(pagedFeed.activities), 'activity outputs must be immutable');

  const groups = svc.groupRelatedActivities([
    { activityId: 'A1', correlationId: 'CORR-APPROVAL-1', activityType: 'APPROVAL', timestamp: '2026-06-03T12:00:00.000Z' },
    { activityId: 'A2', correlationId: 'CORR-APPROVAL-1', activityType: 'APPROVAL', timestamp: '2026-06-03T13:00:00.000Z' }
  ]);
  assert.equal(groups.length, 1, 'related activities should group by correlation');
  assert.equal(groups[0].groupType, 'APPROVAL_CHAIN');
  assert.ok(Object.isFrozen(groups), 'group output must be immutable');

  assert.ok(global.DB.get().globalActivityFeedHistory.some(row => row.feedAccessed === true), 'feed access history should be persisted immutably');
  assert.ok(global.DB.get().globalActivityFeedAnalytics.some(row => row.eventType === 'GLOBAL_ACTIVITY_FEED_BUILT'), 'feed analytics should be persisted immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /GLOBAL_ACTIVITY_FEED/.test(row.actionType || row.action || '')), 'feed access should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /GLOBAL_ACTIVITY_FEED/.test(row.eventType)), 'feed telemetry should emit safely');

  const crossTenant = svc.buildActivityFeed({ tenantSlug: 'abc' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(crossTenant.success, false, 'cross-tenant feed requests must be blocked');
  assert.ok(Object.isFrozen(crossTenant), 'blocked feed output must be immutable');
}

main();
