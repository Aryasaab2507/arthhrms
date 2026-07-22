const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

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

function loadIfExists(file) {
  if (fs.existsSync(path.resolve(__dirname, '..', file))) load(file);
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0', platform: 'Win32' };
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

function seedBottleneckData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-29';
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-2', empId: 'EMP-2', role: 'EMPLOYEE', department: 'Operations', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-3', empId: 'EMP-3', role: 'EMPLOYEE', department: 'HR', managerId: 'MGR-2', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-1', empId: 'MGR-1', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-2', empId: 'MGR-2', role: 'MANAGER', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'HRH-1', empId: 'HRH-1', role: 'HR_HEAD', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'MGR-X', empId: 'MGR-X', role: 'MANAGER', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', managerId: 'MGR-X', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.strategicBottleneckRecords = [
    { bottleneckId: 'BN-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', workflowId: 'WF-1', dependencyId: 'DEP-1', kpiId: 'KPI-1', state: 'MONITORING', severity: 'LOW', queueAgeHours: 12, dueDate: '2026-06-15', throughputScore: 78, mitigationStatus: 'MONITORING', strategicNotes: 'confidential engineering congestion note' },
    { bottleneckId: 'BN-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', workflowId: 'WF-2', dependencyId: 'DEP-2', kpiId: 'KPI-2', state: 'DETECTED', severity: 'HIGH', queueAgeHours: 72, dueDate: '2026-05-15', throughputScore: 32, escalationId: 'ESC-1', delayedApproval: true, strategicNotes: 'private operations bottleneck' },
    { bottleneckId: 'BN-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', workflowId: 'WF-3', dependencyId: 'DEP-3', kpiId: 'KPI-4', state: 'ESCALATED', severity: 'CRITICAL', queueAgeHours: 96, dueDate: '2026-05-10', throughputScore: 20, escalationId: 'ESC-2', delayedApproval: true },
    { bottleneckId: 'BN-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', workflowId: 'WF-4', dependencyId: 'DEP-4', kpiId: 'KPI-3', state: 'CRITICAL', severity: 'CRITICAL', queueAgeHours: 120, dueDate: '2026-05-20', throughputScore: 18, unresolvedApprovalChain: true },
    { bottleneckId: 'BN-5', tenantSlug: 'tabsons', department: 'Finance', empId: 'EMP-1', ownerId: 'MGR-1', workflowId: 'WF-5', dependencyId: 'DEP-5', kpiId: 'KPI-5', state: 'RESOLVED', severity: 'INFO', queueAgeHours: 8, dueDate: '2026-05-25', throughputScore: 90, mitigatedAt: '2026-05-25T00:00:00.000Z' },
    { bottleneckId: 'BN-ARCH', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', state: 'ARCHIVED', severity: 'INFO', archivedAt: '2026-04-01T00:00:00.000Z', strategicNotes: 'immutable archived bottleneck note' },
    { bottleneckId: 'BN-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', workflowId: 'WF-X', dependencyId: 'DEP-X', kpiId: 'KPI-X', state: 'CRITICAL', severity: 'CRITICAL', queueAgeHours: 144, dueDate: '2026-05-01', strategicNotes: 'ABC confidential bottleneck' }
  ];
  data.workflowQueues = [
    { queueId: 'WQ-1', tenantSlug: 'tabsons', department: 'Operations', workflowId: 'WF-2', empId: 'EMP-2', ownerId: 'MGR-1', status: 'BLOCKED', queueAgeHours: 72, approvalPending: true, createdAt: '2026-05-20T00:00:00.000Z' },
    { queueId: 'WQ-2', tenantSlug: 'tabsons', department: 'Operations', workflowId: 'WF-3', empId: 'EMP-2', ownerId: 'MGR-1', status: 'DEGRADED', queueAgeHours: 96, approvalPending: true, createdAt: '2026-05-18T00:00:00.000Z' },
    { queueId: 'WQ-3', tenantSlug: 'tabsons', department: 'HR', workflowId: 'WF-4', empId: 'EMP-3', ownerId: 'MGR-2', status: 'FAILED', queueAgeHours: 120, approvalPending: true, createdAt: '2026-05-17T00:00:00.000Z' },
    { queueId: 'WQ-X', tenantSlug: 'abc', department: 'Finance', workflowId: 'WF-X', empId: 'EMP-X', ownerId: 'MGR-X', status: 'BLOCKED', queueAgeHours: 200, strategicNotes: 'ABC confidential queue' }
  ];
  data.pendingActions = [
    { actionId: 'PA-1', tenantSlug: 'tabsons', workflowId: 'WF-2', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', status: 'PENDING', approvalPending: true, createdAt: '2026-05-20T00:00:00.000Z' },
    { actionId: 'PA-2', tenantSlug: 'tabsons', workflowId: 'WF-3', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', status: 'PENDING', approvalPending: true, createdAt: '2026-05-18T00:00:00.000Z' },
    { actionId: 'PA-X', tenantSlug: 'abc', workflowId: 'WF-X', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', status: 'PENDING', strategicNotes: 'ABC confidential approval' }
  ];
  data.deliverableDependencies = [
    { dependencyId: 'DEP-1', tenantSlug: 'tabsons', deliverableId: 'DEL-1', milestoneId: 'MS-1', sourceDepartment: 'Engineering', targetDepartment: 'Operations', ownerId: 'MGR-1', empId: 'EMP-1', state: 'ACTIVE', status: 'ACTIVE', dueDate: '2026-06-15', kpiId: 'KPI-1' },
    { dependencyId: 'DEP-2', tenantSlug: 'tabsons', deliverableId: 'DEL-2', milestoneId: 'MS-2', dependsOnDeliverableId: 'DEL-1', sourceDepartment: 'Operations', targetDepartment: 'Engineering', ownerId: 'MGR-1', empId: 'EMP-2', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-15', kpiId: 'KPI-2' },
    { dependencyId: 'DEP-3', tenantSlug: 'tabsons', deliverableId: 'DEL-4', milestoneId: 'MS-4', dependsOnDeliverableId: 'DEL-2', sourceDepartment: 'Operations', targetDepartment: 'HR', ownerId: 'MGR-1', empId: 'EMP-2', state: 'AT_RISK', status: 'WAITING', dueDate: '2026-05-10', kpiId: 'KPI-4' },
    { dependencyId: 'DEP-4', tenantSlug: 'tabsons', deliverableId: 'DEL-3', milestoneId: 'MS-3', dependsOnDeliverableId: 'DEL-4', sourceDepartment: 'HR', targetDepartment: 'Operations', ownerId: 'MGR-2', empId: 'EMP-3', state: 'BLOCKED', status: 'BLOCKED', dueDate: '2026-05-20', kpiId: 'KPI-3' },
    { dependencyId: 'DEP-X', tenantSlug: 'abc', deliverableId: 'DEL-X', milestoneId: 'MS-X', sourceDepartment: 'Finance', targetDepartment: 'Finance', ownerId: 'MGR-X', empId: 'EMP-X', state: 'BLOCKED', status: 'BLOCKED', strategicNotes: 'ABC confidential dependency' }
  ];
  data.departmentExecutionRecords = [
    { executionId: 'EX-1', tenantSlug: 'tabsons', department: 'Engineering', empId: 'EMP-1', ownerId: 'MGR-1', deliverableId: 'DEL-1', state: 'IN_PROGRESS', dueDate: '2026-06-10', progressPercent: 55, workloadUnits: 5, kpiId: 'KPI-1' },
    { executionId: 'EX-2', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-2', state: 'BLOCKED', dueDate: '2026-05-15', progressPercent: 20, workloadUnits: 9, kpiId: 'KPI-2' },
    { executionId: 'EX-3', tenantSlug: 'tabsons', department: 'Operations', empId: 'EMP-2', ownerId: 'MGR-1', deliverableId: 'DEL-4', state: 'ESCALATED', dueDate: '2026-05-10', progressPercent: 10, workloadUnits: 8, kpiId: 'KPI-4' },
    { executionId: 'EX-4', tenantSlug: 'tabsons', department: 'HR', empId: 'EMP-3', ownerId: 'MGR-2', deliverableId: 'DEL-3', state: 'BLOCKED', dueDate: '2026-05-20', progressPercent: 15, workloadUnits: 7, kpiId: 'KPI-3' },
    { executionId: 'EX-X', tenantSlug: 'abc', department: 'Finance', empId: 'EMP-X', ownerId: 'MGR-X', deliverableId: 'DEL-X', state: 'BLOCKED', progressPercent: 5, strategicNotes: 'ABC confidential execution' }
  ];
  data.kpiScorecards = [
    { scorecardId: 'KSC-1', tenantSlug: 'tabsons', department: 'Engineering', ownerId: 'MGR-1', kpiId: 'KPI-1', state: 'HEALTHY', currentValue: 82, targetValue: 80, score: 82 },
    { scorecardId: 'KSC-2', tenantSlug: 'tabsons', department: 'Operations', ownerId: 'MGR-1', kpiId: 'KPI-2', state: 'DEGRADED', currentValue: 38, targetValue: 75, score: 38, trend: -18 },
    { scorecardId: 'KSC-X', tenantSlug: 'abc', department: 'Finance', ownerId: 'MGR-X', kpiId: 'KPI-X', state: 'DEGRADED', strategicNotes: 'ABC confidential KPI' }
  ];
  data.performanceGoals = [
    { id: 'PG-1', tenantSlug: 'tabsons', executionId: 'EX-1', empId: 'EMP-1', kpiId: 'KPI-1', progressPercent: 55, score: 72 },
    { id: 'PG-2', tenantSlug: 'tabsons', executionId: 'EX-2', empId: 'EMP-2', kpiId: 'KPI-2', progressPercent: 20, score: 38, degraded: true },
    { id: 'PG-X', tenantSlug: 'abc', executionId: 'EX-X', empId: 'EMP-X', kpiId: 'KPI-X', confidentialRating: 5 }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationId: 'ESC-1', tenantSlug: 'tabsons', dependencyId: 'DEP-2', executionId: 'EX-2', escalationType: 'BOTTLENECK_CONGESTION', severity: 'HIGH', status: 'ESCALATED', createdAt: '2026-05-26T00:00:00.000Z' },
    { id: 'ESC-2', escalationId: 'ESC-2', tenantSlug: 'tabsons', dependencyId: 'DEP-3', executionId: 'EX-3', escalationType: 'REPEATED_CONGESTION', severity: 'WARNING', status: 'ACKNOWLEDGED', createdAt: '2026-05-27T00:00:00.000Z' },
    { id: 'ESC-3', escalationId: 'ESC-3', tenantSlug: 'tabsons', dependencyId: 'DEP-4', executionId: 'EX-4', escalationType: 'APPROVAL_CHAIN_STALLED', severity: 'HIGH', status: 'OPEN', createdAt: '2026-05-28T00:00:00.000Z' },
    { id: 'ESC-X', escalationId: 'ESC-X', tenantSlug: 'abc', dependencyId: 'DEP-X', executionId: 'EX-X', escalationType: 'ABC_PRIVATE_CONGESTION', severity: 'CRITICAL', strategicNotes: 'ABC confidential escalation' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', correlationId: 'BN-2', type: 'WORKFLOW_CONGESTION', status: 'DEGRADED', module: 'Strategic Bottleneck', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-2', tenantSlug: 'tabsons', correlationId: 'BN-3', type: 'APPROVAL_SLOWDOWN', status: 'FAILED', module: 'Strategic Bottleneck', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-3', tenantSlug: 'tabsons', correlationId: 'BN-4', type: 'BLOCKED_WORKFLOW_BUILDUP', status: 'BLOCKED', module: 'Strategic Bottleneck', createdAt: '2026-05-28T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', correlationId: 'BN-X', type: 'ABC_PRIVATE_CONGESTION', status: 'FAILED', strategicNotes: 'ABC confidential workflow' }
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
    'services/deliverableGovernanceService.js',
    'services/strategicReviewService.js',
    'services/escalationCommandService.js',
    'services/performanceGovernanceService.js',
    'services/communicationGovernanceService.js',
    'services/workflowDiscussionService.js',
    'services/deliverableTimelineService.js',
    'services/strategicDependencyService.js',
    'services/departmentExecutionBoardService.js',
    'services/quarterlyGoalService.js',
    'services/leadershipAccountabilityService.js'
  ].forEach(load);
  loadIfExists('services/kpiScorecardService.js');
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/strategicBottleneckService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedBottleneckData();

  const svc = global.StrategicBottleneckService;
  assert.ok(svc, 'StrategicBottleneckService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.BOTTLENECK_STATES), 'bottleneck states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_STRATEGIC_BOTTLENECK_SELF_TEST__.passed, true, 'development self-test should cover bottleneck failure cases');

  assert.equal(svc.classifyCongestionRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyCongestionRisk({ historicalMutation: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyCongestionRisk({ unsafeExecutionOverride: true }), 'HIGH_RISK');
  assert.equal(svc.classifyCongestionRisk({ congestionEscalation: true }), 'HIGH_RISK');
  assert.equal(svc.classifyCongestionRisk({ workflowBlockage: true }), 'WARNING');

  const employeeAssigned = svc.validateBottleneckScope({ tenantSlug: 'tabsons', empId: 'EMP-2', bottleneckId: 'BN-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-2', empId: 'EMP-2' }
  });
  assert.equal(employeeAssigned.allowed, true, 'employee may view assigned workflow bottlenecks');
  assert.equal(employeeAssigned.visibility, 'ASSIGNED_WORKFLOW_BOTTLENECKS_ONLY');

  const managerDepartment = svc.validateBottleneckScope({ tenantSlug: 'tabsons', department: 'Operations', bottleneckId: 'BN-2' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1', department: 'Operations' }
  });
  assert.equal(managerDepartment.allowed, true, 'manager may view department bottlenecks');
  assert.equal(managerDepartment.visibility, 'DEPARTMENT_BOTTLENECK_VISIBILITY');

  const superAdminOverride = svc.validateBottleneckScope({ tenantSlug: 'tabsons', bottleneckId: 'BN-2', executionOverride: true, strategicNotes: 'private execution override' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminOverride.allowed, false, 'SUPER_ADMIN must not modify strategic execution intelligence');
  assert.ok(superAdminOverride.failures.some(item => item.failureCode === 'SUPER_ADMIN_STRATEGIC_EXECUTION_MODIFICATION_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminOverride), /BN-2|private execution|strategicNotes/i);

  const platformScope = svc.validateBottleneckScope({ tenantSlug: 'tabsons', bottleneckId: 'BN-2', ownerId: 'MGR-1' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformScope.allowed, false, 'PLATFORM_OWNER must never appear in tenant execution chains');
  assert.ok(platformScope.failures.some(item => item.failureCode === 'PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED'));

  const crossTenant = svc.validateBottleneckScope({ tenantSlug: 'abc', bottleneckId: 'BN-X', ownerId: 'MGR-X', strategicNotes: 'ABC confidential bottleneck' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(crossTenant.allowed, false, 'cross-tenant execution visibility must be blocked');
  assert.equal(crossTenant.classification, 'CRITICAL_BLOCKER');
  assert.doesNotMatch(JSON.stringify(crossTenant), /BN-X|MGR-X|ABC confidential|strategicNotes/i);

  const archivedMutation = svc.validateBottleneckScope({ tenantSlug: 'tabsons', bottleneckId: 'BN-ARCH', state: 'ARCHIVED', executionOverride: true }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' }
  });
  assert.equal(archivedMutation.allowed, false, 'archived bottleneck record mutation must be blocked');
  assert.ok(archivedMutation.failures.some(item => item.failureCode === 'ARCHIVED_BOTTLENECK_MUTATION_BLOCKED'));

  const malformed = svc.normalizeBottleneckPayload(null, { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed bottleneck payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_BOTTLENECK_PAYLOAD'));

  const normalized = svc.normalizeBottleneckPayload({
    tenantSlug: 'tabsons',
    bottleneckId: 'BN-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'detected',
    kpiId: 'KPI-2',
    strategicNotes: 'private operations bottleneck'
  }, { tenantSlug: 'tabsons' });
  assert.equal(normalized.success, true, 'valid bottleneck payload should normalize');
  assert.equal(normalized.payload.state, 'DETECTED');
  assert.equal(normalized.payload.department, 'Operations');
  assert.ok(Object.isFrozen(normalized), 'normalized output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /BN-2|EMP-2|MGR-1|KPI-2|private operations|strategicNotes/i);

  const governance = svc.evaluateCongestionGovernance({
    tenantSlug: 'tabsons',
    bottleneckId: 'BN-2',
    empId: 'EMP-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    dependencyId: 'DEP-2',
    kpiId: 'KPI-2',
    state: 'DETECTED'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(governance.success, true, 'congestion governance should evaluate safely');
  assert.equal(governance.congestionGovernance.workflowQueueMonitoring, true);
  assert.equal(governance.congestionGovernance.delayedApprovalDetection, true);
  assert.equal(governance.congestionGovernance.unsafeWorkflowOverridesBlocked, true);

  const propagation = svc.detectDelayPropagation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-29T00:00:00.000Z' });
  assert.equal(propagation.success, true, 'delay propagation detection should work');
  assert.ok(propagation.summary.cascadingDelays >= 1);
  assert.ok(propagation.summary.dependencyLinkedSlowdowns >= 1);
  assert.ok(propagation.summary.executionChainFailures >= 1);
  assert.ok(propagation.summary.repeatedEscalationCongestion >= 1);
  assert.ok(propagation.summary.departmentExecutionOverload >= 1);
  assert.ok(propagation.summary.unresolvedApprovalChains >= 1);
  assert.ok(Object.isFrozen(propagation.signals), 'propagation signals must be immutable');
  assert.doesNotMatch(JSON.stringify(propagation), /BN-X|MGR-X|ABC confidential|private operations|strategicNotes/i);

  const escalated = svc.escalateCongestion({
    tenantSlug: 'tabsons',
    bottleneckId: 'BN-2',
    ownerId: 'MGR-1',
    department: 'Operations',
    state: 'DETECTED',
    dueDate: '2026-05-15'
  }, {
    tenantSlug: 'tabsons',
    actor: { role: 'HR_HEAD', id: 'HRH-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(escalated.success, true, 'congestion escalation should be governed');
  assert.equal(escalated.congestionEscalation.escalationGovernancePreserved, true);
  assert.doesNotMatch(JSON.stringify(escalated), /BN-2|MGR-1/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    strategicBottleneckRecords: before.strategicBottleneckRecords,
    workflowQueues: before.workflowQueues,
    pendingActions: before.pendingActions,
    deliverableDependencies: before.deliverableDependencies,
    departmentExecutionRecords: before.departmentExecutionRecords,
    kpiScorecards: before.kpiScorecards,
    performanceGoals: before.performanceGoals,
    escalations: before.escalations,
    workflowEvents: before.workflowEvents
  });
  const report = svc.generateStrategicBottleneckReport({ tenantSlug: 'tabsons' }, {
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' },
    now: '2026-05-29T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'strategic bottleneck report should generate');
  assert.equal(report.readOnly, true, 'strategic bottleneck report must be read-only');
  assert.ok(report.bottleneckHealth.totalBottlenecks >= 5);
  assert.ok(report.bottleneckHealth.detectedBottlenecks >= 1);
  assert.ok(report.bottleneckHealth.escalatedBottlenecks >= 1);
  assert.ok(report.congestionDetection.workflowQueueMonitoring >= 1);
  assert.equal(report.congestionDetection.unsafeWorkflowOverride, false);
  assert.equal(report.congestionDetection.historicalBottleneckRecordsImmutable, true);
  assert.ok(report.delayPropagationIntelligence.cascadingDelays >= 1);
  assert.ok(report.delayPropagationIntelligence.executionChainFailures >= 1);
  assert.ok(report.kpiExecutionIntegration.kpiLinkedCongestionScoring >= 1);
  assert.equal(report.kpiExecutionIntegration.unsafeKpiMutation, false);
  assert.ok(report.workflowDependencyIntegration.dependencyLinkedCongestion >= 1);
  assert.ok(report.workflowDependencyIntegration.workflowThroughputMonitoring >= 1);
  assert.ok(report.bottleneckAnalytics.congestionFrequency >= 1);
  assert.ok(report.bottleneckAnalytics.organizationalThroughputDecline >= 0);
  assert.equal(report.accessGovernance.superAdminStrategicExecutionModificationAuthority, false);
  assert.equal(report.accessGovernance.platformOwnerTenantExecutionChain, false);
  assert.ok(report.integrationHealth.leadershipAccountabilityIntegrated, 'LeadershipAccountabilityService integration should be detected');
  assert.ok(report.integrationHealth.strategicDependencyIntegrated, 'StrategicDependencyService integration should be detected');
  assert.ok(report.integrationHealth.departmentExecutionBoardIntegrated, 'DepartmentExecutionBoardService integration should be detected');
  assert.equal(report.integrationHealth.kpiScorecardIntegrated, !!global.KPIScorecardService, 'KPI scorecard integration should reflect optional dependency presence');
  assert.ok(Object.isFrozen(report), 'report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /BN-X|DEP-X|EX-X|WQ-X|EMP-X|MGR-X|ABC confidential|private operations|confidential engineering|strategicNotes|salary|payroll|leave balance/i);
  assert.equal(JSON.stringify({
    strategicBottleneckRecords: global.DB.get().strategicBottleneckRecords,
    workflowQueues: global.DB.get().workflowQueues,
    pendingActions: global.DB.get().pendingActions,
    deliverableDependencies: global.DB.get().deliverableDependencies,
    departmentExecutionRecords: global.DB.get().departmentExecutionRecords,
    kpiScorecards: global.DB.get().kpiScorecards,
    performanceGoals: global.DB.get().performanceGoals,
    escalations: global.DB.get().escalations,
    workflowEvents: global.DB.get().workflowEvents
  }), historicalBefore, 'bottleneck report must not mutate historical records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /BOTTLENECK|CONGESTION/.test(row.eventType || row.category || '')), 'bottleneck telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.STRATEGIC_BOTTLENECK_REPORTED, 'bottleneck metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /BOTTLENECK|CONGESTION/.test(row.actionType || row.action || '')), 'bottleneck actions should be audited safely');

  const originalKpi = global.KPIScorecardService;
  const originalLeadership = global.LeadershipAccountabilityService;
  const originalDependency = global.StrategicDependencyService;
  const originalExecution = global.DepartmentExecutionBoardService;
  const originalPerformance = global.PerformanceGovernanceService;
  const originalEscalation = global.EscalationCommandService;
  const originalTelemetry = global.WorkflowTelemetryService;
  try {
    delete global.KPIScorecardService;
    delete global.LeadershipAccountabilityService;
    delete global.StrategicDependencyService;
    delete global.DepartmentExecutionBoardService;
    delete global.PerformanceGovernanceService;
    delete global.EscalationCommandService;
    delete global.WorkflowTelemetryService;
    const degraded = svc.generateStrategicBottleneckReport({ tenantSlug: 'tabsons' }, {
      tenantSlug: 'tabsons',
      actor: { role: 'HR_HEAD', id: 'HRH-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing bottleneck integrations should degrade safely');
    assert.equal(degraded.integrationHealth.kpiScorecardIntegrated, false);
    assert.equal(degraded.integrationHealth.leadershipAccountabilityIntegrated, false);
    assert.equal(degraded.integrationHealth.strategicDependencyIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.performanceGovernanceIntegrated, false);
    assert.equal(degraded.integrationHealth.escalationCommandIntegrated, false);
    assert.equal(degraded.integrationHealth.workflowTelemetryIntegrated, false);
  } finally {
    if (originalKpi) global.KPIScorecardService = originalKpi;
    if (originalLeadership) global.LeadershipAccountabilityService = originalLeadership;
    if (originalDependency) global.StrategicDependencyService = originalDependency;
    if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
    if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
    if (originalEscalation) global.EscalationCommandService = originalEscalation;
    if (originalTelemetry) global.WorkflowTelemetryService = originalTelemetry;
  }

  console.log('strategicBottleneckService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
