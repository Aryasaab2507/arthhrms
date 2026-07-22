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

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node reporting hierarchy test', platform: 'Win32' };
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

function seedReportingHierarchyData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.departments = [
    { id: 'DEP-LEAD', name: 'Leadership', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ENG', name: 'Engineering', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-HR', name: 'HR', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-OPS', name: 'Operations', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ABC', name: 'Finance', tenantSlug: 'abc', active: true }
  ];
  data.employees = [
    { id: 'CEO-1', empId: 'CEO-1', employeeId: 'CEO-1', employeeCode: 'CEO-1', name: 'Ada CEO', role: 'DIRECTOR', designation: 'CEO', department: 'Leadership', managerId: '', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE', salary: 1000000, leaveBalance: 20 },
    { id: 'DIR-1', empId: 'DIR-1', employeeId: 'DIR-1', employeeCode: 'DIR-1', name: 'Divya Director', role: 'DIRECTOR', designation: 'Director', department: 'Engineering', managerId: 'CEO-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', employeeCode: 'MGR-1', name: 'Mohan Manager', role: 'MANAGER', designation: 'Manager', department: 'Engineering', managerId: 'DIR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'LEAD-1', empId: 'LEAD-1', employeeId: 'LEAD-1', employeeCode: 'LEAD-1', name: 'Leena Lead', role: 'MANAGER', designation: 'Team Lead', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'HR-1', empId: 'HR-1', employeeId: 'HR-1', employeeCode: 'HR-1', name: 'Hari HR', role: 'HR', designation: 'HR Manager', department: 'HR', managerId: 'DIR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', employeeCode: 'EMP-1', name: 'Esha Engineer', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', managerId: 'LEAD-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE', password: 'secret' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', employeeCode: 'EMP-2', name: 'Omar Ops', role: 'EMPLOYEE', designation: 'Analyst', department: 'Operations', managerId: '', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'EMP-3', empId: 'EMP-3', employeeId: 'EMP-3', employeeCode: 'EMP-3', name: 'Priya Project', role: 'EMPLOYEE', designation: 'Consultant', department: 'Engineering', managerId: 'MGR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'ACTIVE' },
    { id: 'INACTIVE-MGR', empId: 'INACTIVE-MGR', employeeId: 'INACTIVE-MGR', employeeCode: 'INACTIVE-MGR', name: 'Inactive Manager', role: 'MANAGER', designation: 'Manager', department: 'Engineering', managerId: 'DIR-1', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', employmentStatus: 'TERMINATED' },
    { id: 'ABC-MGR', empId: 'ABC-MGR', employeeId: 'ABC-MGR', employeeCode: 'ABC-MGR', name: 'ABC Manager', role: 'MANAGER', designation: 'Manager', department: 'Finance', managerId: '', tenantSlug: 'abc', tenantId: 'TEN-abc', employmentStatus: 'ACTIVE', privateNote: 'ABC confidential hierarchy' },
    { id: 'ABC-EMP', empId: 'ABC-EMP', employeeId: 'ABC-EMP', employeeCode: 'ABC-EMP', name: 'ABC Employee', role: 'EMPLOYEE', designation: 'Analyst', department: 'Finance', managerId: 'ABC-MGR', tenantSlug: 'abc', tenantId: 'TEN-abc', employmentStatus: 'ACTIVE', salary: 999999 }
  ];
  data.reportingHierarchyRelationships = [];
  data.reportingHierarchyVersions = [];
  data.reportingHierarchyHistory = [];
  data.reportingHierarchySnapshots = [];
  data.reportingHierarchyRollbackHistory = [];
  data.reportingHierarchyImports = [];
  data.reportingHierarchyAnalytics = [];
  data.approvalWorkflowRuns = [
    { workflowId: 'APR-1', tenantSlug: 'tabsons', employeeId: 'EMP-1', status: 'PENDING', approverId: 'LEAD-1' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', tenantSlug: 'tabsons', empId: 'EMP-1', status: 'APPROVED', approverId: 'LEAD-1' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-1', tenantSlug: 'tabsons', empId: 'EMP-1', status: 'PRESENT', date: '2026-07-09' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', type: 'LEAVE_APPROVAL', status: 'PENDING', employeeId: 'EMP-1' }
  ];
  data.auditLogs = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/managerHierarchyService.js'
  ].forEach(load);
  seedReportingHierarchyData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/reportingHierarchyService.js');

  const svc = global.ReportingHierarchyService;
  assert.ok(svc, 'ReportingHierarchyService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.RELATIONSHIP_TYPES), 'relationship types must be immutable');
  assert.equal(global.__ARTHHRMS_REPORTING_HIERARCHY_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'validateHierarchyChange',
    'assignReportingRelationship',
    'bulkAssignRelationships',
    'importHierarchyRelationships',
    'buildOrganizationChart',
    'generateApprovalChain',
    'generateEscalationChain',
    'validateHierarchyIntegrity',
    'rollbackHierarchyVersion',
    'generateHierarchyAnalytics',
    'generateHierarchyDashboard',
    'freezeHierarchyOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.HierarchyService, svc, 'HierarchyService alias should be available');
  assert.equal(global.OrganizationChartBuilder, svc, 'OrganizationChartBuilder alias should be available');
  assert.equal(global.ApprovalChainBuilder, svc, 'ApprovalChainBuilder alias should be available');
  assert.equal(global.EscalationEngine, svc, 'EscalationEngine alias should be available');
  assert.equal(global.HierarchyValidator, svc, 'HierarchyValidator alias should be available');
  assert.equal(global.RelationshipManager, svc, 'RelationshipManager alias should be available');
  assert.equal(global.HierarchyAnalyticsService, svc, 'HierarchyAnalyticsService alias should be available');

  const hrContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const directorContext = { actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const beforeProtected = JSON.stringify({
    approvalWorkflowRuns: global.DB.get().approvalWorkflowRuns,
    leaveRequests: global.DB.get().leaveRequests,
    attendanceRecords: global.DB.get().attendanceRecords,
    workflowEvents: global.DB.get().workflowEvents
  });

  const preview = svc.validateHierarchyChange({
    tenantSlug: 'tabsons',
    employeeId: 'EMP-1',
    managerId: 'MGR-1',
    relationshipType: 'DIRECT_MANAGER',
    effectiveDate: '2026-07-10',
    reason: 'Reporting realignment'
  }, hrContext);
  assert.equal(preview.success, true, 'valid manager assignment should preview');
  assert.equal(preview.oldManagerId, 'LEAD-1');
  assert.equal(preview.newManagerId, 'MGR-1');
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-1').managerId, 'LEAD-1', 'validation must not mutate employee');

  const assignment = svc.assignReportingRelationship({
    tenantSlug: 'tabsons',
    employeeId: 'EMP-1',
    managerId: 'MGR-1',
    relationshipType: 'DIRECT_MANAGER',
    effectiveDate: '2026-07-10',
    reason: 'Reporting realignment',
    supportingNotes: 'Approved during onboarding hierarchy setup.',
    expectedVersion: 0
  }, hrContext);
  assert.equal(assignment.success, true, 'manager assignment should persist');
  assert.equal(assignment.relationship.oldManagerId, 'LEAD-1');
  assert.equal(assignment.relationship.managerId, 'MGR-1');
  assert.equal(assignment.version.version, 1);
  assert.equal(assignment.governance.versioned, true);
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-1').managerId, 'MGR-1');
  assert.ok(Object.isFrozen(assignment), 'assignment output must be immutable');
  assert.doesNotMatch(text(assignment), /salary|leaveBalance|password|ABC confidential|ABC Employee/i, 'assignment output must be sanitized and tenant scoped');

  const approval = svc.generateApprovalChain({ tenantSlug: 'tabsons', employeeId: 'EMP-1', approvalType: 'LEAVE' }, hrContext);
  assert.equal(approval.success, true, 'approval chains should generate');
  assert.equal(approval.approvalType, 'LEAVE');
  assert.deepEqual(approval.chain.map(row => row.employeeId), ['MGR-1', 'DIR-1', 'CEO-1']);
  assert.equal(approval.governance.workflowExecutionChanged, false);

  const payrollApproval = svc.generateApprovalChain({ tenantSlug: 'tabsons', employeeId: 'EMP-1', approvalType: 'PAYROLL' }, hrContext);
  assert.equal(payrollApproval.success, true, 'payroll approval chain should generate without payroll recalculation');
  assert.ok(payrollApproval.chain.some(row => row.role === 'DIRECTOR'));

  const escalation = svc.generateEscalationChain({ tenantSlug: 'tabsons', employeeId: 'EMP-1', escalationType: 'TIME_BASED', delayHours: 24 }, hrContext);
  assert.equal(escalation.success, true, 'escalation chain should generate');
  assert.deepEqual(escalation.chain.map(row => row.employeeId), ['MGR-1', 'DIR-1', 'CEO-1']);
  assert.ok(escalation.rules.some(row => row.type === 'TIME_BASED'));

  const chart = svc.buildOrganizationChart({ tenantSlug: 'tabsons', viewMode: 'ORGANIZATION' }, hrContext);
  assert.equal(chart.success, true, 'organization chart should build');
  assert.ok(chart.nodes.some(row => row.employeeId === 'EMP-1' && row.managerId === 'MGR-1'));
  assert.ok(chart.edges.some(row => row.from === 'MGR-1' && row.to === 'EMP-1' && row.relationshipType === 'DIRECT_MANAGER'));
  assert.ok(chart.organizationTree.length >= 1);
  assert.ok(chart.departmentTree.Engineering.length >= 1);
  assert.doesNotMatch(text(chart), /ABC Employee|ABC confidential|999999|salary|leaveBalance|password/i, 'chart must not leak sensitive or cross-tenant data');

  const invalidCycle = svc.validateHierarchyIntegrity({
    tenantSlug: 'tabsons',
    proposedRelationships: [
      { employeeId: 'EMP-2', managerId: 'EMP-3', relationshipType: 'DIRECT_MANAGER' },
      { employeeId: 'EMP-3', managerId: 'EMP-2', relationshipType: 'DIRECT_MANAGER' }
    ]
  }, hrContext);
  assert.equal(invalidCycle.success, false, 'circular hierarchy must be blocked');
  assert.ok(invalidCycle.issues.some(issue => issue.code === 'CIRCULAR_REFERENCE'));

  const selfReporting = svc.validateHierarchyChange({ tenantSlug: 'tabsons', employeeId: 'EMP-2', managerId: 'EMP-2', relationshipType: 'DIRECT_MANAGER', reason: 'bad' }, hrContext);
  assert.equal(selfReporting.success, false);
  assert.ok(selfReporting.issues.some(issue => issue.code === 'SELF_REPORTING'));

  const inactiveManager = svc.validateHierarchyChange({ tenantSlug: 'tabsons', employeeId: 'EMP-2', managerId: 'INACTIVE-MGR', relationshipType: 'DIRECT_MANAGER', reason: 'bad' }, hrContext);
  assert.equal(inactiveManager.success, false);
  assert.ok(inactiveManager.issues.some(issue => issue.code === 'INACTIVE_MANAGER'));

  const crossTenant = svc.assignReportingRelationship({ tenantSlug: 'tabsons', employeeId: 'EMP-2', managerId: 'ABC-MGR', relationshipType: 'DIRECT_MANAGER', reason: 'bad' }, hrContext);
  assert.equal(crossTenant.success, false, 'cross-tenant manager assignments must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_ASSIGNMENT_BLOCKED'));
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-2').managerId, '');

  const denied = svc.assignReportingRelationship({ tenantSlug: 'tabsons', employeeId: 'EMP-2', managerId: 'MGR-1', relationshipType: 'DIRECT_MANAGER', reason: 'bad' }, employeeContext);
  assert.equal(denied.success, false, 'employees cannot mutate hierarchy');
  assert.ok(denied.issues.some(issue => issue.code === 'HIERARCHY_GOVERNANCE_DENIED'));

  const importPreview = svc.importHierarchyRelationships({
    tenantSlug: 'tabsons',
    fileName: 'hierarchy.csv',
    fileType: 'CSV',
    dryRun: true,
    fileContent: [
      'Employee ID,Direct Manager,Dotted Line Manager,Functional Manager,Project Manager',
      'EMP-2,MGR-1,DIR-1,HR-1,MGR-1',
      'EMP-3,MGR-1,,HR-1,'
    ].join('\n')
  }, hrContext);
  assert.equal(importPreview.success, true, 'CSV import preview should work');
  assert.equal(importPreview.dryRun, true);
  assert.equal(importPreview.summary.validRelationships, 6);
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-2').managerId, '', 'dry-run import must not mutate employees');

  const rollback = svc.rollbackHierarchyVersion({ tenantSlug: 'tabsons', versionId: assignment.version.versionId, reason: 'Undo onboarding hierarchy test' }, directorContext);
  assert.equal(rollback.success, true, 'rollback should restore previous manager');
  assert.equal(rollback.rollback.restoredRelationships, 1);
  assert.equal(global.DB.get().employees.find(row => row.employeeId === 'EMP-1').managerId, 'LEAD-1');

  const analytics = svc.generateHierarchyAnalytics({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(analytics.success, true, 'analytics should generate');
  assert.ok(analytics.analytics.hierarchyDepth >= 0);
  assert.ok(analytics.analytics.spanOfControl.max >= 0);
  assert.ok(analytics.analytics.orphanEmployees >= 0);
  assert.ok(analytics.organizationHealthScore >= 0);
  assert.ok(analytics.hierarchyIntegrityScore >= 0);
  assert.ok(analytics.managementCoverageScore >= 0);

  const dashboard = svc.generateHierarchyDashboard({ tenantSlug: 'tabsons' }, hrContext);
  assert.equal(dashboard.success, true, 'dashboard should generate');
  assert.ok(dashboard.managerRelationships.length >= 1);
  assert.ok(dashboard.approvalChains.length >= 1);
  assert.ok(dashboard.escalationChains.length >= 1);
  assert.ok(dashboard.recentChanges.length >= 1);
  assert.equal(dashboard.compatibility.employeeModulePreserved, true);
  assert.equal(dashboard.compatibility.approvalModulePreserved, true);
  assert.equal(dashboard.compatibility.leaveModulePreserved, true);
  assert.equal(dashboard.compatibility.attendanceModulePreserved, true);
  assert.equal(dashboard.compatibility.workflowModulePreserved, true);
  assert.doesNotMatch(text(dashboard), /ABC Employee|ABC confidential|999999|salary|leaveBalance|password/i);

  assert.equal(JSON.stringify({
    approvalWorkflowRuns: global.DB.get().approvalWorkflowRuns,
    leaveRequests: global.DB.get().leaveRequests,
    attendanceRecords: global.DB.get().attendanceRecords,
    workflowEvents: global.DB.get().workflowEvents
  }), beforeProtected, 'reporting hierarchy changes must not mutate approval, leave, attendance, or workflow records');

  assert.ok(global.DB.getAuditLogs().some(row => /REPORTING_HIERARCHY|HIERARCHY_RELATIONSHIP|HIERARCHY_ROLLBACK/.test(row.actionType || row.action || '')), 'hierarchy actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /REPORTING_HIERARCHY|HIERARCHY_RELATIONSHIP|HIERARCHY_ROLLBACK/.test(row.eventType || row.category || '')), 'hierarchy telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.HIERARCHY_RELATIONSHIP_ASSIGNED, 'hierarchy metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'organization-hierarchy-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Organization Hierarchy Center dashboard page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Organization Hierarchy Center/i);
  assert.match(dashboardHtml, /Approval Chains/i);
  assert.match(dashboardHtml, /Escalation Chains/i);
  assert.match(dashboardHtml, /ReportingHierarchyService/i);

  console.log('reportingHierarchyService.test.js passed');
}

main();
