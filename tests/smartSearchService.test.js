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

function seedSmartSearchData() {
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
  data.departments = [
    { departmentId: 'DEPT-ENG', name: 'Engineering', headId: 'MGR-1', tenantSlug: 'tabsons', status: 'ACTIVE' },
    { departmentId: 'DEPT-HR', name: 'People Operations', headId: 'HR-1', tenantSlug: 'tabsons', status: 'ACTIVE' },
    { departmentId: 'DEPT-X', name: 'Other Tenant Payroll', tenantSlug: 'abc', status: 'ACTIVE' }
  ];
  data.leaveRequests = [
    { leaveId: 'LV-1', empId: 'EMP-1', title: 'Apollo release leave request', type: 'Casual Leave', status: 'PENDING', department: 'Engineering', from: '2026-06-08', to: '2026-06-09', tenantSlug: 'tabsons', reason: 'Apollo launch support handoff' },
    { leaveId: 'LV-X', empId: 'EMP-X', title: 'Payroll exposure leave', status: 'APPROVED', tenantSlug: 'abc', reason: 'salary 888888 leave balance 42' }
  ];
  data.attendance = [
    { attendanceId: 'AT-1', empId: 'EMP-1', date: '2026-06-01', status: 'PRESENT', department: 'Engineering', tenantSlug: 'tabsons', note: 'Apollo daily standup' },
    { attendanceId: 'AT-X', empId: 'EMP-X', date: '2026-06-01', status: 'PRESENT', tenantSlug: 'abc', note: 'Other payroll standup' }
  ];
  data.strategicGoals = [
    { goalId: 'GOAL-1', title: 'Apollo Expansion OKR', description: 'Scale Apollo onboarding capacity', status: 'ACTIVE', department: 'Leadership', ownerId: 'DIR-1', tenantSlug: 'tabsons', updatedAt: '2026-06-01T10:00:00.000Z' }
  ];
  data.strategicDeliverables = [
    { deliverableId: 'DEL-1', title: 'Apollo Hiring Sprint', description: 'Hiring deliverable for Apollo expansion', status: 'ACTIVE', department: 'Engineering', ownerId: 'MGR-1', tenantSlug: 'tabsons', updatedAt: '2026-06-02T10:00:00.000Z' }
  ];
  data.projects = [
    { projectId: 'PROJ-1', title: 'Apollo Platform Migration', status: 'ACTIVE', department: 'Engineering', ownerId: 'MGR-1', tenantSlug: 'tabsons', updatedAt: '2026-06-03T10:00:00.000Z' }
  ];
  data.announcements = [
    { announcementId: 'ANN-1', title: 'Apollo launch town hall', body: 'Engineering and HR launch readiness.', category: 'HR', status: 'PUBLISHED', tenantSlug: 'tabsons', createdBy: 'HR-1', createdAt: '2026-06-04T10:00:00.000Z' }
  ];
  data.discussions = [
    { discussionId: 'DISC-1', title: 'Apollo workflow discussion', message: 'Resolve approval handoff.', category: 'WORKFLOW', status: 'OPEN', department: 'Engineering', tenantSlug: 'tabsons', createdBy: 'MGR-1', participants: ['EMP-1', 'MGR-1'] }
  ];
  data.notifications = [
    { notificationId: 'N-1', id: 'N-1', title: 'Apollo approval waiting', message: 'Manager approval is waiting.', category: 'APPROVAL', state: 'CREATED', priority: 'HIGH', toRole: 'MANAGER', tenantSlug: 'tabsons', correlationId: 'CORR-APOLLO' },
    { notificationId: 'N-X', id: 'N-X', title: 'Payroll Exposure', message: 'Salary 888888 payrollAmount 888888', category: 'PAYROLL', state: 'CREATED', priority: 'CRITICAL', toRole: 'HR', tenantSlug: 'abc', salary: 888888 }
  ];
  data.auditLogs = [
    { id: 'AUD-1', logId: 'AUD-1', actionType: 'GOVERNANCE_SEARCH_REVIEW', module: 'Audit Governance', description: 'Apollo search governance reviewed', tenantSlug: 'tabsons', actorRole: 'HR', actorId: 'HR-1', createdAt: '2026-06-04T11:00:00.000Z' },
    { id: 'AUD-X', logId: 'AUD-X', actionType: 'PAYROLL_EXPORT', module: 'Payroll', description: 'Salary 888888 exported', tenantSlug: 'abc', actorRole: 'HR', actorId: 'HR-X', createdAt: '2026-06-04T11:30:00.000Z' }
  ];
  data.documents = [
    { documentId: 'DOC-1', title: 'Apollo HR Policy', category: 'POLICY', status: 'ACTIVE', ownerEmpId: 'HR-1', department: 'People', visibility: 'HR', tenantSlug: 'tabsons', createdAt: '2026-06-02T08:00:00.000Z', body: 'Apollo HR rollout policy' },
    { documentId: 'DOC-X', title: 'Other Tenant Salary Document', category: 'PAYROLL', status: 'ACTIVE', ownerEmpId: 'EMP-X', visibility: 'HR', tenantSlug: 'abc', body: 'salary 888888 payrollAmount 888888' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', title: 'Apollo approval workflow', type: 'APPROVAL', status: 'BLOCKED', workflowId: 'WF-APOLLO', empId: 'EMP-1', department: 'Engineering', tenantSlug: 'tabsons', createdAt: '2026-06-03T12:00:00.000Z' }
  ];

  for (let i = 0; i < 1200; i += 1) {
    data.employees.push({
      id: `EMP-BULK-${i}`,
      empId: `EMP-BULK-${i}`,
      name: `Bulk Search Employee ${i}`,
      role: 'EMPLOYEE',
      department: i % 2 ? 'Engineering' : 'People',
      tenantSlug: 'tabsons',
      managerId: 'MGR-1'
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
    'services/notificationCenterService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/smartSearchService.js');
  seedSmartSearchData();
}

function assertNoConfidentialLeak(value, label) {
  assert.doesNotMatch(JSON.stringify(value), /888888|999999|salary|payrollAmount|leave balance|Other Tenant Secret|Other Tenant Salary|Payroll Exposure/i, label);
}

function main() {
  loadRuntime();
  const svc = global.SmartSearchService;
  assert.ok(svc, 'SmartSearchService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.SEARCH_DOMAINS), 'search domains must be immutable');
  assert.equal(global.__ARTHHRMS_SMART_SEARCH_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  const malformed = svc.normalizeSearchPayload('bad-payload', { tenantSlug: 'tabsons' });
  assert.equal(malformed.success, false, 'malformed payloads should be rejected safely');
  assert.ok(Object.isFrozen(malformed), 'malformed result must be immutable');

  const index = svc.buildSearchIndex({ tenantSlug: 'tabsons' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(index.success, true, 'tenant search index should build');
  assert.ok(index.entries.length > 1000, 'index should support thousands of records');
  assert.ok(index.domains.includes('employees'), 'employee domain should be indexed');
  assert.ok(index.domains.includes('documents'), 'document domain should be indexed');
  assertNoConfidentialLeak(index, 'index output must be tenant-scoped and redacted');
  assert.ok(Object.isFrozen(index.entries), 'index output entries must be immutable');

  const directorSearch = svc.performSmartSearch({
    query: 'Apollo Hiring Sprint',
    tenantSlug: 'tabsons',
    scope: 'global',
    limit: 10
  }, {
    actor: { role: 'director', id: 'DIR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(directorSearch.success, true, 'director search should complete');
  assert.equal(directorSearch.results[0].relevanceClass, 'EXACT_MATCH', 'exact title match should rank first');
  assert.equal(directorSearch.results[0].domain, 'deliverables', 'strategic deliverable should be discoverable by directors');
  assert.ok(directorSearch.searchConfidenceScore >= 70, 'confidence score should be calculated');
  assert.ok(directorSearch.groupedResults.deliverables.length >= 1, 'grouped results should include deliverables');
  assertNoConfidentialLeak(directorSearch, 'director results must not leak confidential values');

  const fuzzySearch = svc.performSmartSearch({
    query: 'Apolo Hirng',
    tenantSlug: 'tabsons',
    scope: 'global',
    fuzzy: true,
    limit: 10
  }, {
    actor: { role: 'director', id: 'DIR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(fuzzySearch.success, true, 'fuzzy search should complete');
  assert.ok(fuzzySearch.results.some(row => row.entityId === 'DEL-1'), 'fuzzy search should recover Apollo Hiring Sprint');
  assert.ok(fuzzySearch.results.some(row => ['HIGH_RELEVANCE', 'MEDIUM_RELEVANCE', 'EXACT_MATCH'].includes(row.relevanceClass)), 'fuzzy results should classify relevance');

  const employeeSearch = svc.performSmartSearch({
    query: 'Apollo',
    tenantSlug: 'tabsons',
    scope: 'global',
    limit: 25
  }, {
    actor: { role: 'employee', id: 'EMP-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(employeeSearch.success, true, 'employee search should complete');
  assert.ok(employeeSearch.results.some(row => row.domain === 'employees' && row.entityId === 'EMP-1'), 'employee should see own employee record');
  assert.ok(employeeSearch.results.some(row => row.domain === 'leave_requests' && row.entityId === 'LV-1'), 'employee should see own leave request');
  assert.ok(!employeeSearch.results.some(row => row.domain === 'audit_records'), 'employee should not see audit records');
  assert.ok(!employeeSearch.results.some(row => row.entityId === 'DOC-1'), 'employee should not see HR-only document');
  assertNoConfidentialLeak(employeeSearch, 'employee search must be tenant-scoped and redacted');

  const managerSearch = svc.performSmartSearch({
    query: 'Apollo',
    tenantSlug: 'tabsons',
    filters: { department: 'Engineering' },
    limit: 25
  }, {
    actor: { role: 'manager', id: 'MGR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(managerSearch.success, true, 'manager search should complete');
  assert.ok(managerSearch.results.some(row => row.domain === 'projects' && row.entityId === 'PROJ-1'), 'manager should see managed department project');
  assert.ok(managerSearch.results.some(row => row.domain === 'workflows' && row.entityId === 'WF-1'), 'manager should see managed workflow');
  assert.ok(!managerSearch.results.some(row => row.domain === 'audit_records'), 'manager should not see audit records');
  assertNoConfidentialLeak(managerSearch, 'manager search must be redacted');

  const hrDocumentSearch = svc.performSmartSearch({
    query: 'Apollo policy',
    tenantSlug: 'tabsons',
    scope: 'entity',
    domains: ['documents'],
    filters: { category: 'POLICY', status: 'ACTIVE', creator: 'HR-1', dateFrom: '2026-06-01', dateTo: '2026-06-05' },
    limit: 10
  }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(hrDocumentSearch.success, true, 'HR document search should complete');
  assert.equal(hrDocumentSearch.results.length, 1, 'multi-filter document search should narrow results');
  assert.equal(hrDocumentSearch.results[0].entityId, 'DOC-1');
  assert.equal(hrDocumentSearch.filtersApplied.length >= 4, true, 'multiple filters should be applied');
  assertNoConfidentialLeak(hrDocumentSearch, 'HR document search must not expose raw confidential body');

  const platformSearch = svc.performSmartSearch({
    query: 'governance',
    tenantSlug: 'tabsons',
    domains: ['audit_records', 'notifications'],
    limit: 10
  }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    routeType: 'platform'
  });
  assert.equal(platformSearch.success, true, 'platform governance search should complete');
  assert.ok(platformSearch.results.every(row => ['audit_records', 'notifications'].includes(row.domain)), 'platform search should honor domain filters');
  assertNoConfidentialLeak(platformSearch, 'platform search must remain governance-only and redacted');

  const emptySearch = svc.performSmartSearch({ query: '', tenantSlug: 'tabsons' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(emptySearch.success, true, 'empty queries should return suggestions instead of throwing');
  assert.equal(emptySearch.results.length, 0, 'empty query should not dump all records');
  assert.ok(emptySearch.suggestions.length >= 1, 'empty query should provide suggestions');

  const score = svc.calculateRelevanceScore(
    { title: 'Apollo Hiring Sprint', keywords: ['apollo', 'hiring', 'sprint'], domain: 'deliverables', updatedAt: '2026-06-02T10:00:00.000Z' },
    { query: 'Apollo Hiring Sprint', terms: ['apollo', 'hiring', 'sprint'], role: 'DIRECTOR' }
  );
  assert.equal(score.relevanceClass, 'EXACT_MATCH', 'score helper should classify exact matches');
  assert.ok(Object.isFrozen(score), 'score output must be immutable');

  assert.ok(global.DB.get().smartSearchHistory.some(row => row.query === 'Apollo Hiring Sprint'), 'search history should be persisted immutably');
  assert.ok(global.DB.get().smartSearchAnalytics.some(row => row.eventType === 'SMART_SEARCH_PERFORMED'), 'search analytics should be persisted immutably');
  assert.ok(global.DB.getAuditLogs().some(row => /SMART_SEARCH/.test(row.actionType || row.action || '')), 'search access should be audited');
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /SMART_SEARCH/.test(row.eventType)), 'search telemetry should emit safely');

  const crossTenant = svc.performSmartSearch({ query: 'Other Tenant', tenantSlug: 'abc' }, {
    actor: { role: 'hr', id: 'HR-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(crossTenant.success, false, 'cross-tenant search requests must be blocked');
  assert.ok(Object.isFrozen(crossTenant), 'blocked search output must be immutable');
}

main();
