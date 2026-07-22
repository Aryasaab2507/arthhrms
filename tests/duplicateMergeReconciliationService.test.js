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
  global.navigator = { userAgent: 'Node duplicate merge reconciliation test', platform: 'Win32' };
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

function seedReconciliationData() {
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
  data.employees = [
    { id: 'MGR-1', empId: 'MGR-1', employeeId: 'MGR-1', employeeCode: 'MGR-1', name: 'Mohan Manager', firstName: 'Mohan', lastName: 'Manager', email: 'mohan.manager@example.com', phone: '+919800000001', role: 'MANAGER', designation: 'Manager', department: 'Engineering', branch: 'Mumbai', location: 'Mumbai', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-LEFT', empId: 'EMP-LEFT', employeeId: 'EMP-LEFT', employeeCode: 'DUP-100', name: 'Asha Rao', firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@example.com', phone: '+919800000002', pan: 'ABCDE1234F', aadhaar: '123456789012', passport: 'A1234567', bankAccount: '123456789012', governmentId: 'GOV-100', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Mumbai', location: 'Mumbai', managerId: 'MGR-1', employmentStatus: 'ACTIVE', salary: 100000, leaveBalance: 12, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-RIGHT', empId: 'EMP-RIGHT', employeeId: 'EMP-RIGHT', employeeCode: 'DUP-100', name: 'Asha R.', firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@example.com', phone: '+919800000003', pan: 'ABCDE1234F', aadhaar: '123456789013', passport: 'A1234568', bankAccount: '123456789999', governmentId: 'GOV-100', role: 'EMPLOYEE', designation: 'Senior Engineer', department: 'Engineering', branch: 'Bengaluru', location: 'Bengaluru', managerId: 'MGR-1', employmentStatus: 'ACTIVE', salary: 200000, leaveBalance: 25, tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-FUZZY', empId: 'EMP-FUZZY', employeeId: 'EMP-FUZZY', employeeCode: 'FUZZ-1', name: 'Asha Raoo', firstName: 'Asha', lastName: 'Raoo', email: 'asha.fuzzy@example.com', phone: '+919800000004', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Mumbai', location: 'Mumbai', managerId: 'MGR-1', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-REPORT', empId: 'EMP-REPORT', employeeId: 'EMP-REPORT', employeeCode: 'REP-1', name: 'Reportee One', firstName: 'Reportee', lastName: 'One', email: 'reportee@example.com', phone: '+919800000005', role: 'EMPLOYEE', designation: 'Engineer', department: 'Engineering', branch: 'Mumbai', location: 'Mumbai', managerId: 'EMP-RIGHT', employmentStatus: 'ACTIVE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'EMP-LEGAL', empId: 'EMP-LEGAL', employeeId: 'EMP-LEGAL', employeeCode: 'LEGAL-1', name: 'Legal Hold', firstName: 'Legal', lastName: 'Hold', email: 'legal.hold@example.com', legalHold: true, role: 'EMPLOYEE', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', employeeCode: 'DUP-100', name: 'ABC Confidential Employee', firstName: 'ABC', lastName: 'Employee', email: 'asha.rao@example.com', salary: 999999, leaveBalance: 40, privateNote: 'ABC confidential merge data', tenantSlug: 'abc', tenantId: 'TEN-abc' }
  ];
  data.departments = [
    { id: 'DEP-ENG', departmentId: 'DEP-ENG', code: 'ENG', departmentCode: 'ENG', name: 'Engineering', departmentName: 'Engineering', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ENG-DUP', departmentId: 'DEP-ENG-DUP', code: 'ENG', departmentCode: 'ENG', name: 'Engineering Team', departmentName: 'Engineering Team', tenantSlug: 'tabsons', active: true },
    { id: 'DEP-ABC', departmentId: 'DEP-ABC', code: 'ENG', departmentCode: 'ENG', name: 'Engineering', departmentName: 'Engineering', tenantSlug: 'abc', active: true }
  ];
  data.companyBranches = [
    { branchId: 'BR-MUM', branchCode: 'MUM', branchName: 'Mumbai', name: 'Mumbai', tenantSlug: 'tabsons', active: true },
    { branchId: 'BR-MUM-DUP', branchCode: 'MUM', branchName: 'Mumbai HQ', name: 'Mumbai HQ', tenantSlug: 'tabsons', active: true }
  ];
  data.companyLocations = [
    { locationId: 'LOC-MUM', locationCode: 'MUM', locationName: 'Mumbai', name: 'Mumbai', tenantSlug: 'tabsons', active: true },
    { locationId: 'LOC-MUM-DUP', locationCode: 'MUM', locationName: 'Mumbai Office', name: 'Mumbai Office', tenantSlug: 'tabsons', active: true }
  ];
  data.designations = [
    { designationId: 'DES-ENG', code: 'ENG', name: 'Engineer', tenantSlug: 'tabsons', active: true },
    { designationId: 'DES-ENG-DUP', code: 'ENG', name: 'Engineer I', tenantSlug: 'tabsons', active: true }
  ];
  data.businessUnits = [
    { businessUnitId: 'BU-ENG', code: 'ENG', name: 'Engineering BU', tenantSlug: 'tabsons', active: true },
    { businessUnitId: 'BU-ENG-DUP', code: 'ENG', name: 'Engineering Business Unit', tenantSlug: 'tabsons', active: true }
  ];
  data.costCenters = [
    { costCenterId: 'CC-ENG', code: 'ENG-A', name: 'Engineering Cost Center', tenantSlug: 'tabsons', active: true },
    { costCenterId: 'CC-ENG-DUP', code: 'ENG-A', name: 'Engineering Cost Centre', tenantSlug: 'tabsons', active: true }
  ];
  data.documents = [
    { documentId: 'DOC-L', tenantSlug: 'tabsons', employeeId: 'EMP-LEFT', documentType: 'PAN', status: 'VERIFIED' },
    { documentId: 'DOC-R', tenantSlug: 'tabsons', employeeId: 'EMP-RIGHT', documentType: 'AADHAAR', status: 'VERIFIED' }
  ];
  data.employeeNotes = [
    { noteId: 'NOTE-R', tenantSlug: 'tabsons', employeeId: 'EMP-RIGHT', note: 'Migration duplicate review' }
  ];
  data.attendanceRecords = [
    { attendanceId: 'ATT-R', tenantSlug: 'tabsons', empId: 'EMP-RIGHT', date: '2026-07-10', status: 'PRESENT' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-R', tenantSlug: 'tabsons', empId: 'EMP-RIGHT', status: 'APPROVED', fromDate: '2026-07-10', toDate: '2026-07-11' }
  ];
  data.payrollRuns = [
    { payrollRunId: 'PAY-R', tenantSlug: 'tabsons', empId: 'EMP-RIGHT', period: '2026-07', gross: 100000, net: 85000 }
  ];
  data.reportingHierarchyRelationships = [
    { relationshipId: 'REL-R', tenantSlug: 'tabsons', employeeId: 'EMP-RIGHT', managerId: 'MGR-1', relationshipType: 'DIRECT_MANAGER', active: true },
    { relationshipId: 'REL-REPORT', tenantSlug: 'tabsons', employeeId: 'EMP-REPORT', managerId: 'EMP-RIGHT', relationshipType: 'DIRECT_MANAGER', active: true }
  ];
  data.approvalRequests = [
    { approvalId: 'APP-R', tenantSlug: 'tabsons', employeeId: 'EMP-RIGHT', approverId: 'EMP-RIGHT', status: 'PENDING' }
  ];
  data.duplicateDetectionRuns = [];
  data.masterDataMergeHistory = [];
  data.masterDataMergeSnapshots = [];
  data.masterDataRollbackHistory = [];
  data.duplicateResolutionAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function protectedSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    documents: data.documents,
    employeeNotes: data.employeeNotes,
    attendanceRecords: data.attendanceRecords,
    leaveRequests: data.leaveRequests,
    payrollRuns: data.payrollRuns,
    reportingHierarchyRelationships: data.reportingHierarchyRelationships,
    approvalRequests: data.approvalRequests
  });
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/tenantIsolationService.js',
    'services/employeeDataValidationService.js'
  ].forEach(load);
  seedReconciliationData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/duplicateMergeReconciliationService.js');

  const svc = global.DuplicateMergeReconciliationService;
  assert.ok(svc, 'DuplicateMergeReconciliationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.DUPLICATE_ENTITY_TYPES), 'entity types must be immutable');
  assert.equal(global.__ARTHHRMS_DUPLICATE_MERGE_RECONCILIATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'detectDuplicates',
    'calculateMatchScore',
    'generateMergePreview',
    'executeMerge',
    'rollbackMerge',
    'resolveConflicts',
    'generateDuplicateAnalytics',
    'generateMasterDataHealth',
    'generateResolutionDashboard',
    'freezeReconciliationOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  assert.equal(global.DuplicateDetectionService, svc, 'DuplicateDetectionService alias should be available');
  assert.equal(global.MergeEngine, svc, 'MergeEngine alias should be available');
  assert.equal(global.MergePreviewService, svc, 'MergePreviewService alias should be available');
  assert.equal(global.ConflictResolver, svc, 'ConflictResolver alias should be available');
  assert.equal(global.RollbackManager, svc, 'RollbackManager alias should be available');
  assert.equal(global.DuplicateAnalyticsService, svc, 'DuplicateAnalyticsService alias should be available');
  assert.equal(global.MasterDataHealthService, svc, 'MasterDataHealthService alias should be available');

  const adminContext = { actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const employeeContext = { actor: { id: 'EMP-LEFT', role: 'EMPLOYEE', tenantSlug: 'tabsons' }, tenantSlug: 'tabsons' };
  const beforeDetection = protectedSnapshot();

  const detection = svc.detectDuplicates({ tenantSlug: 'tabsons', entityTypes: ['EMPLOYEE', 'DEPARTMENT', 'BRANCH', 'LOCATION', 'DESIGNATION', 'BUSINESS_UNIT', 'COST_CENTER'], threshold: 50 }, adminContext);
  assert.equal(detection.success, true, 'duplicate detection should complete');
  assert.equal(detection.readOnly, true);
  assert.equal(detection.nonDestructive, true);
  assert.ok(detection.summary.duplicatesFound >= 6, 'duplicate scan should cover multiple entity types');
  assert.ok(detection.duplicateQueue.some(row => row.entityType === 'EMPLOYEE' && row.matchingFields.includes('employeeCode')));
  assert.ok(detection.duplicateQueue.some(row => row.matchType === 'FUZZY'));
  assert.ok(detection.duplicateQueue.some(row => row.entityType === 'DEPARTMENT'));
  assert.ok(detection.confidenceDistribution.exact >= 1);
  assert.ok(detection.confidenceDistribution.high + detection.confidenceDistribution.veryHigh >= 1);
  assert.doesNotMatch(text(detection), /ABC Confidential|abc@example.com|999999|leaveBalance|private/i, 'detection output must be tenant scoped and sanitized');
  assert.equal(protectedSnapshot(), beforeDetection, 'detection must not mutate protected records');

  const score = svc.calculateMatchScore({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'EMP-RIGHT'
  }, adminContext);
  assert.equal(score.success, true);
  assert.ok(score.confidenceScore >= 90, 'exact identity matches should score very high');
  assert.equal(score.confidenceLabel, 'EXACT');

  const preview = svc.generateMergePreview({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'EMP-RIGHT',
    strategy: 'KEEP_LEFT',
    fieldSelections: { branch: 'right', location: 'right' }
  }, adminContext);
  assert.equal(preview.success, true, 'merge preview should generate');
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.requiresApproval, true);
  assert.ok(preview.fieldDifferences.length >= 1);
  assert.ok(preview.matchingFields.includes('employeeCode'));
  assert.ok(preview.relatedRecords.documents >= 1);
  assert.ok(preview.payrollImpact.referencesAffected >= 1);
  assert.ok(preview.attendanceImpact.referencesAffected >= 1);
  assert.ok(preview.approvalImpact.referencesAffected >= 1);
  assert.ok(preview.warnings.length >= 1);
  assert.ok(preview.riskScore >= 0);
  assert.ok(Object.isFrozen(preview), 'preview output must be immutable');
  assert.doesNotMatch(text(preview), /salary|leaveBalance|999999|private/i, 'preview must not leak sensitive field values');
  assert.equal(protectedSnapshot(), beforeDetection, 'preview must not mutate protected records');

  const noApproval = svc.executeMerge({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'EMP-RIGHT',
    strategy: 'KEEP_LEFT'
  }, adminContext);
  assert.equal(noApproval.success, false, 'merge without approval must be blocked');
  assert.ok(noApproval.issues.some(issue => issue.code === 'ADMIN_APPROVAL_REQUIRED'));
  assert.equal(protectedSnapshot(), beforeDetection, 'blocked merge must not mutate protected records');

  const crossTenant = svc.generateMergePreview({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'ABC-1'
  }, adminContext);
  assert.equal(crossTenant.success, false, 'cross tenant merge preview must be blocked');
  assert.ok(crossTenant.issues.some(issue => issue.code === 'CROSS_TENANT_MERGE_BLOCKED'));

  const legalHold = svc.executeMerge({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'EMP-LEGAL',
    strategy: 'KEEP_LEFT',
    adminApproval: { approved: true, approvedBy: 'HR-1', reason: 'test' }
  }, adminContext);
  assert.equal(legalHold.success, false, 'legal hold merge must be blocked');
  assert.ok(legalHold.issues.some(issue => issue.code === 'LEGAL_HOLD_MERGE_BLOCKED'));

  const merge = svc.executeMerge({
    tenantSlug: 'tabsons',
    entityType: 'EMPLOYEE',
    sourceRecordId: 'EMP-LEFT',
    candidateRecordId: 'EMP-RIGHT',
    strategy: 'KEEP_LEFT',
    fieldSelections: { branch: 'right', location: 'right' },
    conflictResolution: { manager: 'left', documents: 'merge', payrollReferences: 'repoint', attendanceReferences: 'repoint', approvalHistory: 'repoint' },
    adminApproval: { approved: true, approvedBy: 'HR-1', reason: 'Migration duplicate reconciliation' }
  }, adminContext);
  assert.equal(merge.success, true, 'approved merge should execute');
  assert.equal(merge.approved, true);
  assert.equal(merge.reversible, true);
  assert.ok(merge.mergeId);
  assert.ok(merge.snapshotId);
  assert.ok(merge.referencesUpdated.documents >= 1);
  assert.ok(merge.referencesUpdated.payroll >= 1);
  assert.ok(merge.referencesUpdated.attendance >= 1);
  assert.ok(merge.referencesUpdated.approvals >= 1);

  const afterMerge = global.DB.get();
  const survivor = afterMerge.employees.find(row => row.employeeId === 'EMP-LEFT');
  const merged = afterMerge.employees.find(row => row.employeeId === 'EMP-RIGHT');
  assert.equal(survivor.branch, 'Bengaluru', 'field-by-field selection should update survivor branch');
  assert.equal(survivor.location, 'Bengaluru', 'field-by-field selection should update survivor location');
  assert.equal(merged.mergeStatus, 'MERGED');
  assert.equal(merged.mergedInto, 'EMP-LEFT');
  assert.equal(merged.active, false);
  assert.ok(afterMerge.documents.every(row => row.employeeId !== 'EMP-RIGHT'), 'documents should be repointed');
  assert.ok(afterMerge.payrollRuns.every(row => row.empId !== 'EMP-RIGHT'), 'payroll references should be repointed without recalculation');
  assert.ok(afterMerge.attendanceRecords.every(row => row.empId !== 'EMP-RIGHT'), 'attendance references should be repointed');
  assert.ok(afterMerge.leaveRequests.every(row => row.empId !== 'EMP-RIGHT'), 'leave references should be repointed');
  assert.ok(afterMerge.reportingHierarchyRelationships.every(row => row.employeeId !== 'EMP-RIGHT' && row.managerId !== 'EMP-RIGHT'), 'hierarchy references should be repointed');
  assert.ok(afterMerge.masterDataMergeHistory.length >= 1, 'merge history should be stored immutably');
  assert.ok(afterMerge.masterDataMergeSnapshots.length >= 1, 'merge snapshot should be stored for rollback');

  const rollback = svc.rollbackMerge({
    tenantSlug: 'tabsons',
    mergeId: merge.mergeId,
    reason: 'Rollback drill',
    adminApproval: { approved: true, approvedBy: 'HR-1', reason: 'Rollback drill' }
  }, adminContext);
  assert.equal(rollback.success, true, 'approved rollback should restore snapshot');
  assert.equal(rollback.reverted, true);
  assert.equal(protectedSnapshot(), beforeDetection, 'rollback must restore original records and references');
  assert.ok(global.DB.get().masterDataRollbackHistory.length >= 1, 'rollback history should be stored');

  const analytics = svc.generateDuplicateAnalytics({ tenantSlug: 'tabsons' }, adminContext);
  assert.equal(analytics.success, true, 'analytics should generate');
  assert.ok(analytics.analytics.duplicatesFound >= 1);
  assert.ok(analytics.analytics.duplicatesMerged >= 1);
  assert.ok(analytics.analytics.rollbackCount >= 1);
  assert.ok(analytics.masterDataHealthScore >= 0);
  assert.ok(analytics.migrationReadinessScore >= 0);

  const health = svc.generateMasterDataHealth({ tenantSlug: 'tabsons' }, adminContext);
  assert.equal(health.success, true, 'master data health should generate');
  assert.ok(health.duplicateQualityScore >= 0);
  assert.ok(health.masterDataHealthScore >= 0);

  const dashboard = svc.generateResolutionDashboard({ tenantSlug: 'tabsons' }, adminContext);
  assert.equal(dashboard.success, true, 'dashboard data should generate');
  assert.ok(dashboard.duplicateQueue.length >= 1);
  assert.ok(dashboard.mergeHistory.length >= 1);
  assert.ok(dashboard.rollbackHistory.length >= 1);
  assert.ok(dashboard.recommendedActions.length >= 1);
  assert.equal(dashboard.compatibility.employeeModulePreserved, true);
  assert.equal(dashboard.compatibility.payrollModulePreserved, true);
  assert.equal(dashboard.compatibility.attendanceModulePreserved, true);
  assert.equal(dashboard.compatibility.leaveModulePreserved, true);

  const employeeBlocked = svc.detectDuplicates({ tenantSlug: 'tabsons' }, employeeContext);
  assert.equal(employeeBlocked.success, false, 'employees cannot run reconciliation scans');
  assert.ok(employeeBlocked.issues.some(issue => issue.code === 'DUPLICATE_RECONCILIATION_ACCESS_DENIED'));

  const tenantBlocked = svc.detectDuplicates({ tenantSlug: 'abc' }, adminContext);
  assert.equal(tenantBlocked.success, false, 'cross-tenant reconciliation must be blocked');
  assert.ok(tenantBlocked.issues.some(issue => issue.code === 'CROSS_TENANT_RECONCILIATION_BLOCKED'));

  assert.ok(global.DB.getAuditLogs().some(row => /DUPLICATE_DETECTION|MASTER_DATA_MERGE|MERGE_ROLLBACK/.test(row.actionType || row.action || '')), 'reconciliation actions should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /DUPLICATE_DETECTION|MASTER_DATA_MERGE|MERGE_ROLLBACK/.test(row.eventType || row.category || '')), 'reconciliation telemetry should emit');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.DUPLICATE_DETECTION_RUN, 'reconciliation metrics should aggregate');

  const dashboardHtmlPath = path.resolve(__dirname, '..', 'duplicate-resolution-center.html');
  assert.equal(fs.existsSync(dashboardHtmlPath), true, 'Duplicate Resolution Center page should exist');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');
  assert.match(dashboardHtml, /Duplicate Resolution Center/i);
  assert.match(dashboardHtml, /Merge Preview/i);
  assert.match(dashboardHtml, /Rollback History/i);
  assert.match(dashboardHtml, /DuplicateMergeReconciliationService/i);

  console.log('duplicateMergeReconciliationService.test.js passed');
}

main();
