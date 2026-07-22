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
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node no-code workflow automation test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1', now = '2026-07-03T12:00:00.000Z') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug },
    now
  };
}

function seedAutomationData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private workflow data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', tenantSlug: 'tabsons', name: 'Asha', department: 'People', role: 'HR', salary: 900000 },
    { id: 'EMP-ABC', empId: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', name: 'ABC Private', privateNote: 'ABC private workflow data' }
  ];
  data.leaveRequests = [
    { id: 'LV-1', empId: 'EMP-1', tenantSlug: 'tabsons', status: 'Pending Manager Approval', days: 2 },
    { id: 'LV-ABC', empId: 'EMP-ABC', tenantSlug: 'abc', status: 'Pending Manager Approval', privateNote: 'ABC private workflow data' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-ABC', tenantSlug: 'abc', type: 'LEAVE_APPLIED', status: 'FAILED', privateNote: 'ABC private workflow data' }
  ];
  [
    'noCodeWorkflowDefinitionHistory',
    'noCodeWorkflowVersionHistory',
    'noCodeWorkflowExecutionHistory',
    'noCodeWorkflowScheduleHistory',
    'noCodeWorkflowTemplateHistory',
    'noCodeWorkflowAuditHistory',
    'noCodeWorkflowAnalyticsHistory',
    'auditLogs'
  ].forEach(key => { data[key] = []; });
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/workflowHandlers.js',
    'services/workflowEngine.js',
    'services/validationRegistryService.js',
    'services/webhookPlatformService.js',
    'services/distributedQueueService.js',
    'services/notificationDeliveryTrackingService.js'
  ].forEach(load);
  seedAutomationData();

  const before = {
    workflowEngine: global.workflowEngine,
    emitWorkflowEvent: global.workflowEngine && global.workflowEngine.emitWorkflowEvent,
    approvePayrollRecord: global.DB.approvePayrollRecord,
    approveExpenseClaim: global.DB.approveExpenseClaim,
    approveExpenseClaimByManager: global.DB.approveExpenseClaimByManager,
    leaveStatuses: global.DB.get().leaveRequests.map(row => ({ id: row.id, status: row.status }))
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/noCodeWorkflowAutomationService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('NoCodeWorkflowAutomationService should be exported');
    }
    throw error;
  }

  const svc = global.NoCodeWorkflowAutomationService;
  assert.ok(svc, 'NoCodeWorkflowAutomationService should be exported');
  assert.equal(global.noCodeWorkflowAutomationService, svc, 'lowercase automation alias should be exported');
  assert.ok(Object.isFrozen(svc), 'automation service export should be frozen');
  [
    'WorkflowDesigner',
    'WorkflowExecutionEngine',
    'WorkflowScheduler',
    'TriggerRegistry',
    'ActionRegistry',
    'ConditionEvaluator',
    'ApprovalEngine',
    'AutomationAnalyticsService'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_NO_CODE_WORKFLOW_SELF_TEST__.passed, true, 'development self-test should pass');

  const catalog = svc.TriggerRegistry.listTriggers({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(catalog.success, true, 'trigger catalog should load');
  [
    'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'ATTENDANCE_SUBMITTED', 'LEAVE_APPLIED',
    'LEAVE_APPROVED', 'PAYROLL_GENERATED', 'DOCUMENT_UPLOADED', 'PERFORMANCE_REVIEW',
    'WEBHOOK_RECEIVED', 'API_EVENT', 'SCHEDULE', 'MANUAL_TRIGGER', 'AI_TRIGGER_FUTURE'
  ].forEach(trigger => assert.ok(catalog.triggers.some(row => row.triggerType === trigger), `${trigger} trigger should be registered`));
  assert.ok(catalog.governance.workflowGovernancePreserved, 'trigger catalog should report workflow governance');

  const actions = svc.ActionRegistry.listActions({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(actions.success, true, 'action catalog should load');
  [
    'CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORD', 'SEND_EMAIL', 'SEND_NOTIFICATION',
    'SEND_SMS', 'CREATE_TASK', 'GENERATE_DOCUMENT', 'GENERATE_REPORT', 'CALL_API',
    'INVOKE_WEBHOOK', 'QUEUE_JOB', 'ASSIGN_MANAGER', 'CREATE_APPROVAL', 'AI_ACTION_FUTURE'
  ].forEach(action => assert.ok(actions.actions.some(row => row.actionType === action), `${action} action should be registered`));

  const templates = svc.WorkflowDesigner.listTemplates({ tenantSlug: 'tabsons' }, ctx('HR'));
  assert.equal(templates.success, true, 'workflow templates should load');
  [
    'Employee Onboarding', 'Employee Offboarding', 'Leave Approval', 'Expense Approval',
    'Travel Approval', 'Probation Confirmation', 'Promotion', 'Document Expiry Reminder',
    'Birthday Wishes', 'Work Anniversary', 'Payroll Notification', 'Asset Allocation'
  ].forEach(name => assert.ok(templates.templates.some(row => row.name === name), `${name} template should exist`));

  const invalidLoop = svc.WorkflowDesigner.createWorkflow({
    tenantSlug: 'tabsons',
    name: 'Invalid circular automation',
    trigger: { triggerType: 'MANUAL_TRIGGER' },
    nodes: [
      { nodeId: 'start', type: 'TRIGGER', next: ['loop'] },
      { nodeId: 'loop', type: 'LOOP', next: ['loop'] }
    ]
  }, ctx('HR'));
  assert.equal(invalidLoop.success, false, 'circular workflows should be rejected');
  assert.equal(invalidLoop.code, 'WORKFLOW_DESIGN_INVALID');

  const created = svc.WorkflowDesigner.createWorkflow({
    tenantSlug: 'tabsons',
    name: 'Leave escalation automation',
    description: 'Escalate delayed leave approvals without approving leave.',
    trigger: { triggerType: 'LEAVE_APPLIED' },
    nodes: [
      { nodeId: 'trigger', type: 'TRIGGER', next: ['condition'] },
      {
        nodeId: 'condition',
        type: 'CONDITION',
        operator: 'AND',
        conditions: [
          { field: 'department', operator: 'EQUALS', value: 'People' },
          { field: 'days', operator: 'GREATER_THAN', value: 1 }
        ],
        next: ['approval']
      },
      {
        nodeId: 'approval',
        type: 'APPROVAL',
        approval: {
          mode: 'SEQUENTIAL',
          approvers: ['MANAGER', 'HR', 'DIRECTOR'],
          dynamicApprovers: ['MANAGER']
        },
        next: ['notify']
      },
      {
        nodeId: 'notify',
        type: 'ACTION',
        action: { actionType: 'SEND_NOTIFICATION', targetRole: 'HR', title: 'Leave approval requires review' },
        next: ['delay']
      },
      { nodeId: 'delay', type: 'DELAY', delay: { amount: 1, unit: 'BUSINESS_DAYS' }, next: ['end'] },
      { nodeId: 'end', type: 'END' }
    ],
    errorHandling: { strategy: 'RETRY', maxRetries: 3, onFailure: 'MANUAL_REVIEW' }
  }, ctx('HR'));
  assert.equal(created.success, true, 'workflow builder should create a governed workflow');
  assert.equal(created.workflow.status, 'DRAFT');
  assert.equal(created.workflow.version, 1);
  assert.equal(created.workflow.unlimitedDepthSupported, true);
  assert.equal(created.workflow.governance.existingApprovalWorkflowsPreserved, true);
  assert.doesNotMatch(text(created), /ABC private workflow data|salary|privateNote/i, 'workflow design output must be sanitized');

  const published = svc.WorkflowDesigner.publishWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    approval: { approved: true, approvedBy: 'DIRECTOR-1', approvalReference: 'APR-AUTO-1' }
  }, ctx('DIRECTOR'));
  assert.equal(published.success, true, 'workflow publishing should work with approval evidence');
  assert.equal(published.workflow.status, 'PUBLISHED');
  assert.equal(published.workflow.version, 2);
  assert.equal(published.version.changeType, 'PUBLISHED');

  const rollback = svc.WorkflowDesigner.rollbackWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    targetVersion: 1,
    reason: 'Rollback dry run'
  }, ctx('DIRECTOR'));
  assert.equal(rollback.success, true, 'workflow rollback should create a new governed version');
  assert.equal(rollback.workflow.version, 3);
  assert.equal(rollback.workflow.status, 'DRAFT');

  const republished = svc.WorkflowDesigner.publishWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    approval: { approved: true, approvedBy: 'DIRECTOR-1', approvalReference: 'APR-AUTO-2' }
  }, ctx('DIRECTOR'));
  assert.equal(republished.success, true, 'workflow should republish after rollback');

  const scheduled = svc.WorkflowScheduler.scheduleWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    scheduleType: 'WEEKLY',
    timezone: 'Asia/Kolkata',
    cron: '0 9 * * 1',
    businessDaysOnly: true
  }, ctx('HR'));
  assert.equal(scheduled.success, true, 'scheduler should support weekly timezone-aware schedules');
  assert.equal(scheduled.schedule.timezoneAware, true);
  assert.equal(scheduled.schedule.businessDaysOnly, true);

  const scheduleInvalid = svc.WorkflowScheduler.scheduleWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    scheduleType: 'CRON',
    cron: '* *',
    timezone: 'Asia/Kolkata'
  }, ctx('HR'));
  assert.equal(scheduleInvalid.success, false, 'invalid schedules should fail safely');
  assert.equal(scheduleInvalid.code, 'WORKFLOW_SCHEDULE_INVALID');

  const evaluated = svc.ConditionEvaluator.evaluateConditions({
    tenantSlug: 'tabsons',
    expression: { operator: 'AND', conditions: [
      { field: 'department', operator: 'EQUALS', value: 'People' },
      { field: 'role', operator: 'IN', value: ['HR', 'DIRECTOR'] },
      { operator: 'NOT', conditions: [{ field: 'location', operator: 'EQUALS', value: 'Remote' }] }
    ] },
    facts: { department: 'People', role: 'HR', location: 'Mumbai' }
  }, ctx('HR'));
  assert.equal(evaluated.success, true);
  assert.equal(evaluated.matched, true, 'condition evaluator should support AND/NOT/IN');

  const approvalPlan = svc.ApprovalEngine.configureApproval({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    mode: 'PARALLEL',
    approvers: ['MANAGER', 'DEPARTMENT_HEAD', 'HR', 'DIRECTOR'],
    dynamicApprovers: ['MANAGER', 'DEPARTMENT_HEAD']
  }, ctx('HR'));
  assert.equal(approvalPlan.success, true, 'approval builder should configure governed approval metadata');
  assert.equal(approvalPlan.approval.approvalExecutionMode, 'PARALLEL');
  assert.equal(approvalPlan.approval.mutatesExistingApprovals, false);

  const execution = await svc.WorkflowExecutionEngine.executeWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    triggerType: 'LEAVE_APPLIED',
    eventId: 'EVT-1',
    facts: { department: 'People', role: 'HR', location: 'Mumbai', days: 2 },
    dryRun: false
  }, ctx('HR'));
  assert.equal(execution.success, true, 'execution engine should execute a published workflow');
  assert.equal(execution.execution.status, 'WAITING_FOR_APPROVAL');
  assert.ok(execution.execution.executionId, 'execution id should be tracked');
  assert.ok(execution.execution.logs.length >= 3, 'execution logs should be recorded');
  assert.equal(execution.execution.actions.some(row => row.actionType === 'CREATE_APPROVAL'), true, 'approval action should be represented');
  assert.equal(execution.governance.existingApprovalWorkflowsPreserved, true);
  assert.equal(global.DB.get().leaveRequests.find(row => row.id === 'LV-1').status, 'Pending Manager Approval', 'existing approval workflow data should not be modified');

  const duplicate = await svc.WorkflowExecutionEngine.executeWorkflow({
    tenantSlug: 'tabsons',
    workflowId: created.workflow.workflowId,
    eventId: 'EVT-1',
    triggerType: 'LEAVE_APPLIED',
    facts: { department: 'People', role: 'HR', days: 2 }
  }, ctx('HR'));
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.duplicatePrevented, true, 'duplicate executions should be idempotent');

  const missingAction = svc.WorkflowDesigner.createWorkflow({
    tenantSlug: 'tabsons',
    name: 'Missing action automation',
    trigger: { triggerType: 'MANUAL_TRIGGER' },
    nodes: [
      { nodeId: 'trigger', type: 'TRIGGER', next: ['broken'] },
      { nodeId: 'broken', type: 'ACTION', action: { actionType: 'UNKNOWN_ACTION' }, next: ['end'] },
      { nodeId: 'end', type: 'END' }
    ]
  }, ctx('HR'));
  assert.equal(missingAction.success, false, 'missing actions should be rejected');

  const tenantDenied = svc.WorkflowDesigner.createWorkflow({
    tenantSlug: 'abc',
    name: 'Cross tenant automation',
    trigger: { triggerType: 'MANUAL_TRIGGER' },
    nodes: [{ nodeId: 'start', type: 'TRIGGER', next: ['end'] }, { nodeId: 'end', type: 'END' }]
  }, ctx('HR', 'tabsons'));
  assert.equal(tenantDenied.success, false);
  assert.equal(tenantDenied.code, 'TENANT_ACCESS_DENIED');

  const health = svc.AutomationAnalyticsService.generateAutomationAnalytics({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(health.success, true, 'automation analytics should generate');
  assertScore(health.automationScore, 'automation score');
  assertScore(health.workflowHealthScore, 'workflow health score');
  assertScore(health.efficiencyScore, 'efficiency score');
  assert.ok(health.analytics.workflowRuns >= 1);
  assert.ok(health.analytics.topWorkflows.some(row => row.workflowId === created.workflow.workflowId));
  assert.ok(health.analytics.mostUsedTriggers.some(row => row.triggerType === 'LEAVE_APPLIED'));
  assert.doesNotMatch(text(health), /WF-ABC|ABC private workflow data|salary|privateNote/i, 'automation analytics must remain tenant scoped and sanitized');

  const frozen = svc.freezeWorkflowAutomationOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'frozen outputs should be deep frozen');

  assert.equal(global.workflowEngine, before.workflowEngine, 'existing workflow engine must remain unchanged');
  assert.equal(global.workflowEngine.emitWorkflowEvent, before.emitWorkflowEvent, 'existing emitWorkflowEvent must remain unchanged');
  assert.equal(global.DB.approvePayrollRecord, before.approvePayrollRecord, 'existing payroll approval function must remain unchanged');
  assert.equal(global.DB.approveExpenseClaim, before.approveExpenseClaim, 'existing expense approval function must remain unchanged');
  assert.equal(global.DB.approveExpenseClaimByManager, before.approveExpenseClaimByManager, 'existing manager approval function must remain unchanged');
  assert.deepEqual(global.DB.get().leaveRequests.map(row => ({ id: row.id, status: row.status })), before.leaveStatuses, 'existing leave approval statuses must remain unchanged');
  assert.ok(global.DB.get().auditLogs.some(row => /NO_CODE_WORKFLOW_(CREATED|PUBLISHED|EXECUTED|SCHEDULED)/.test(String(row.actionType || row.action || row.type || ''))), 'automation actions should be audited');

  console.log('noCodeWorkflowAutomationService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
