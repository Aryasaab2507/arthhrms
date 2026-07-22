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
  global.navigator = { userAgent: 'Mozilla/5.0 Chrome/125.0', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.com',
    hostname: 'platform.arthhrms.com',
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

function seedUXData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', department: 'Operations', role: 'EMPLOYEE', salary: 75000, leaveBalance: 11 },
    { id: 'MGR-1', empId: 'MGR-1', tenantSlug: 'tabsons', department: 'Operations', role: 'MANAGER' },
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', department: 'Finance', role: 'HR', salary: 999999, leaveBalance: 44 }
  ];
  data.uxPermissionSimplificationHistory = [];
  data.uxPermissionSimplificationAnalytics = [];
  global.DB.save(data);
}

function assertImmutable(value, label) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object') assert.ok(Object.isFrozen(item), `${label}[${index}] should be frozen`);
    });
  }
}

function samplePayload() {
  return {
    tenantSlug: 'tabsons',
    navigationItems: [
      { itemId: 'attendance', label: 'Attendance', group: 'My Work', route: 'employee-portal.html#attendance', allowedRoles: ['EMPLOYEE', 'MANAGER'], requiredCapability: 'own_attendance', priority: 95, journey: 'attendance', tenantSlug: 'tabsons', usageCount: 140 },
      { itemId: 'leave', label: 'Leave', group: 'My Work', route: 'employee-portal.html#leave', allowedRoles: ['EMPLOYEE', 'MANAGER'], requiredCapability: 'own_leave', priority: 92, journey: 'leave', tenantSlug: 'tabsons', usageCount: 120 },
      { itemId: 'profile', label: 'Profile', group: 'My Work', route: 'employee-portal.html#profile', allowedRoles: ['EMPLOYEE', 'MANAGER', 'HR'], requiredCapability: 'own_profile', priority: 80, journey: 'profile', tenantSlug: 'tabsons', usageCount: 90 },
      { itemId: 'notifications', label: 'Notifications', group: 'My Work', route: 'employee-portal.html#notifications', allowedRoles: ['EMPLOYEE', 'MANAGER', 'HR', 'DIRECTOR'], requiredCapability: 'self_visibility', priority: 84, journey: 'notifications', tenantSlug: 'tabsons', usageCount: 100 },
      { itemId: 'approvals', label: 'Approvals', group: 'Team', route: 'manager.html#approvals', allowedRoles: ['MANAGER'], requiredCapability: 'approval_visibility', priority: 96, journey: 'approvals', tenantSlug: 'tabsons', usageCount: 95 },
      { itemId: 'team', label: 'Team Management', group: 'Team', route: 'manager.html#team', allowedRoles: ['MANAGER'], requiredCapability: 'team_visibility', priority: 88, journey: 'team_management', tenantSlug: 'tabsons', usageCount: 70 },
      { itemId: 'performance', label: 'Performance Tracking', group: 'Team', route: 'manager.html#performance', allowedRoles: ['MANAGER', 'HR_HEAD'], requiredCapability: 'manager_dashboard', priority: 72, journey: 'performance_tracking', tenantSlug: 'tabsons', usageCount: 38 },
      { itemId: 'workforce', label: 'Workforce Governance', group: 'HR', route: 'hr-dashboard.html#workforce', allowedRoles: ['HR', 'HR_HEAD'], requiredCapability: 'employee_visibility', priority: 94, journey: 'workforce_governance', tenantSlug: 'tabsons', usageCount: 80 },
      { itemId: 'employee-lifecycle', label: 'Employee Lifecycle', group: 'HR', route: 'hr-dashboard.html#lifecycle', allowedRoles: ['HR', 'HR_HEAD'], requiredCapability: 'onboarding_visibility', priority: 90, journey: 'employee_lifecycle', tenantSlug: 'tabsons', usageCount: 78 },
      { itemId: 'payroll-ops', label: 'Payroll Operations', group: 'HR', route: 'hr-dashboard.html#payroll', allowedRoles: ['HR'], requiredCapability: 'hr_dashboard', priority: 74, journey: 'payroll_operations', tenantSlug: 'tabsons', usageCount: 42, metadata: { salary: 999999 } },
      { itemId: 'strategy', label: 'Strategic Execution', group: 'Leadership', route: 'director.html#strategy', allowedRoles: ['DIRECTOR'], requiredCapability: 'strategic_dashboard_access', priority: 96, journey: 'strategic_execution', tenantSlug: 'tabsons', usageCount: 50 },
      { itemId: 'kpi-governance', label: 'KPI Governance', group: 'Leadership', route: 'director.html#kpi', allowedRoles: ['DIRECTOR'], requiredCapability: 'kpi_visibility', priority: 90, journey: 'kpi_governance', tenantSlug: 'tabsons', usageCount: 44 },
      { itemId: 'infra-monitoring', label: 'Infrastructure Monitoring', group: 'Infrastructure', route: 'super-admin.html#infra', allowedRoles: ['SUPER_ADMIN'], requiredCapability: 'workflow_monitoring', priority: 98, journey: 'infrastructure_monitoring', tenantSlug: 'tabsons', usageCount: 68 },
      { itemId: 'platform-governance', label: 'Platform Governance', group: 'Platform', route: 'platform-control.html#governance', allowedRoles: ['PLATFORM_OWNER'], requiredCapability: 'platform_governance', priority: 99, journey: 'platform_governance', routeType: 'platform', usageCount: 32 },
      { itemId: 'tenant-governance', label: 'Tenant Governance', group: 'Platform', route: 'platform-control.html#tenants', allowedRoles: ['PLATFORM_OWNER'], requiredCapability: 'tenant_provisioning', priority: 97, journey: 'tenant_governance', routeType: 'platform', usageCount: 26 },
      { itemId: 'platform-governance-duplicate', label: 'Platform Governance', group: 'Platform', route: 'platform-control.html#governance', allowedRoles: ['PLATFORM_OWNER'], requiredCapability: 'platform_governance', priority: 55, routeType: 'platform', usageCount: 0 },
      { itemId: 'abc-payroll', label: 'ABC Payroll Salaries', group: 'HR', route: 'hr-dashboard.html#salary', allowedRoles: ['HR'], requiredCapability: 'hr_dashboard', tenantSlug: 'abc', priority: 100, metadata: { salary: 888888, leaveBalance: 44 } }
    ],
    dashboards: [
      { dashboardId: 'employee-dashboard', dashboardType: 'employee', allowedRoles: ['EMPLOYEE'], widgetIds: ['attendance-widget', 'leave-widget', 'profile-widget', 'notification-widget'], tenantSlug: 'tabsons' },
      { dashboardId: 'manager-dashboard', dashboardType: 'manager', allowedRoles: ['MANAGER'], widgetIds: ['approvals-widget', 'team-widget', 'performance-widget'], tenantSlug: 'tabsons' },
      { dashboardId: 'hr-dashboard', dashboardType: 'hr', allowedRoles: ['HR'], widgetIds: ['workforce-widget', 'lifecycle-widget', 'payroll-widget'], tenantSlug: 'tabsons' },
      { dashboardId: 'director-dashboard', dashboardType: 'director', allowedRoles: ['DIRECTOR'], widgetIds: ['strategy-widget', 'kpi-widget'], tenantSlug: 'tabsons' },
      { dashboardId: 'platform-control', dashboardType: 'platform', allowedRoles: ['PLATFORM_OWNER', 'SUPER_ADMIN'], widgetIds: ['ux-governance-widget'], routeType: 'platform' }
    ],
    widgets: [
      { widgetId: 'attendance-widget', label: 'Attendance', allowedRoles: ['EMPLOYEE'], journey: 'attendance', tenantSlug: 'tabsons', usageCount: 120 },
      { widgetId: 'leave-widget', label: 'Leave', allowedRoles: ['EMPLOYEE'], journey: 'leave', tenantSlug: 'tabsons', usageCount: 110 },
      { widgetId: 'payroll-widget', label: 'Payroll Operations', allowedRoles: ['HR'], tenantSlug: 'tabsons', confidential: false },
      { widgetId: 'salary-widget', label: 'Salary Details', allowedRoles: ['SUPER_ADMIN'], tenantSlug: 'tabsons', salary: 123456 },
      { widgetId: 'abc-widget', label: 'ABC Private', allowedRoles: ['HR'], tenantSlug: 'abc', salary: 888888 }
    ],
    workflows: [
      { workflowId: 'attendance-flow', journey: 'attendance', role: 'EMPLOYEE', steps: 2, completionRate: 0.92, abandonmentRate: 0.04, averageSeconds: 35, tenantSlug: 'tabsons' },
      { workflowId: 'leave-flow', journey: 'leave', role: 'EMPLOYEE', steps: 4, completionRate: 0.82, abandonmentRate: 0.12, averageSeconds: 90, tenantSlug: 'tabsons' },
      { workflowId: 'approval-flow', journey: 'approvals', role: 'MANAGER', steps: 6, completionRate: 0.72, abandonmentRate: 0.2, averageSeconds: 160, tenantSlug: 'tabsons' },
      { workflowId: 'tenant-private', journey: 'payroll_operations', role: 'HR', steps: 4, completionRate: 0.9, abandonmentRate: 0.03, tenantSlug: 'abc', salary: 888888 }
    ],
    visibilityRules: [
      { ruleId: 'employee-attendance', targetId: 'attendance', targetType: 'navigation', allowedRoles: ['EMPLOYEE'], requiredCapability: 'own_attendance', tenantSlug: 'tabsons' },
      { ruleId: 'conflict-platform', targetId: 'platform-governance', targetType: 'navigation', allowedRoles: ['EMPLOYEE'], deniedRoles: ['EMPLOYEE'], routeType: 'tenant', tenantSlug: 'tabsons' },
      { ruleId: 'director-kpi', targetId: 'kpi-governance', targetType: 'navigation', allowedRoles: ['DIRECTOR'], requiredCapability: 'kpi_visibility', tenantSlug: 'tabsons' }
    ],
    analytics: {
      menuUsage: { attendance: 120, leave: 110, 'platform-governance-duplicate': 0 },
      shortcutUsage: { attendance: 60, approvals: 18 },
      abandonedFlows: { approvals: 6, leave: 4 }
    },
    metadata: {
      rawPayload: 'salary 999999 leaveBalance 44',
      confidentialEmployeeRecord: 'hidden'
    }
  };
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = true;
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/orchestrationMetricsService.js',
    'services/platformGovernanceService.js',
    'services/tenantIsolationService.js',
    'services/permissionMatrixService.js',
    'services/smartSearchService.js',
    'services/globalActivityFeedService.js',
    'services/notificationCenterService.js'
  ].forEach(load);
  seedUXData();

  let loadError = null;
  try {
    load('services/uxPermissionSimplificationService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.UXPermissionSimplificationService;
  assert.ok(svc, 'UXPermissionSimplificationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.buildRoleNavigation, 'function');
  assert.equal(typeof svc.calculateUXComplexity, 'function');
  assert.equal(typeof svc.optimizeUserJourney, 'function');
  assert.equal(typeof svc.normalizeUXPayload, 'function');
  assert.equal(typeof svc.freezeUXOutput, 'function');
  assert.equal(typeof svc.generateUXGovernanceReport, 'function');
  assert.equal(global.__ARTHHRMS_UX_PERMISSION_SIMPLIFICATION_SELF_TEST__.passed, true, 'development self-test should cover role navigation, visibility, dashboard optimization, scoring, and immutability');

  const malformed = svc.normalizeUXPayload('bad payload', {});
  assert.equal(malformed.success, false, 'malformed payload should fail safely');
  assertImmutable(malformed, 'malformed UX output');

  const payload = samplePayload();
  const employeeContext = {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'EMPLOYEE', id: 'EMP-1', tenantSlug: 'tabsons' }
  };
  const employeeNavigation = svc.buildRoleNavigation(payload, employeeContext);
  assert.equal(employeeNavigation.success, true, 'employee role navigation should build');
  assert.deepEqual(employeeNavigation.roles, ['EMPLOYEE']);
  assert.ok(employeeNavigation.navigation.some(item => item.itemId === 'attendance'), 'employee sees attendance');
  assert.ok(employeeNavigation.navigation.some(item => item.itemId === 'leave'), 'employee sees leave');
  assert.ok(employeeNavigation.navigation.some(item => item.itemId === 'profile'), 'employee sees profile');
  assert.ok(employeeNavigation.quickActions.some(item => item.actionId === 'attendance'), 'employee quick actions include attendance');
  assert.equal(employeeNavigation.navigation.some(item => item.itemId === 'platform-governance'), false, 'employee must not see platform governance');
  assert.equal(employeeNavigation.navigation.some(item => item.itemId === 'payroll-ops'), false, 'employee must not see HR payroll operations');
  assert.doesNotMatch(JSON.stringify(employeeNavigation), /salary|leaveBalance|999999|888888|ABC Payroll/i, 'employee navigation must not expose sensitive or cross-tenant data');
  assert.equal(employeeNavigation.governance.rbacAuthoritative, true, 'RBAC remains authoritative');
  assertImmutable(employeeNavigation, 'employee navigation output');

  const managerNavigation = svc.buildRoleNavigation(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: ['EMPLOYEE', 'MANAGER'], id: 'MGR-1', tenantSlug: 'tabsons' }
  });
  assert.equal(managerNavigation.success, true, 'multi-role manager navigation should build');
  assert.ok(managerNavigation.navigation.some(item => item.itemId === 'approvals'), 'manager sees approvals');
  assert.ok(managerNavigation.navigation.some(item => item.itemId === 'team'), 'manager sees team management');
  assert.equal(new Set(managerNavigation.navigation.map(item => item.route)).size, managerNavigation.navigation.length, 'duplicate navigation routes should be removed');
  assert.ok(managerNavigation.dashboardLayout.widgets.some(widget => widget.widgetId === 'approvals-widget'), 'manager dashboard should be role-specific');
  assertImmutable(managerNavigation, 'manager navigation output');

  const platformNavigation = svc.buildRoleNavigation(payload, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformNavigation.success, true, 'platform owner navigation should build');
  assert.ok(platformNavigation.navigation.some(item => item.itemId === 'platform-governance'), 'platform owner sees platform governance');
  assert.ok(platformNavigation.navigation.some(item => item.itemId === 'tenant-governance'), 'platform owner sees tenant governance');
  assert.equal(platformNavigation.navigation.some(item => item.itemId === 'attendance'), false, 'platform owner must not appear in tenant employee journeys');

  const platformOwnerTenant = svc.buildRoleNavigation(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformOwnerTenant.success, false, 'PLATFORM_OWNER tenant navigation must be blocked');
  assert.match(platformOwnerTenant.classification, /PLATFORM_OWNER|RBAC|SCOPE|BLOCK/i);

  const superAdminNav = svc.buildRoleNavigation(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    infrastructureOnly: true,
    monitoringOnly: true,
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tabsons' }
  });
  assert.equal(superAdminNav.success, true, 'SUPER_ADMIN infrastructure navigation should build');
  assert.ok(superAdminNav.navigation.some(item => item.itemId === 'infra-monitoring'), 'SUPER_ADMIN sees infrastructure monitoring');
  assert.equal(superAdminNav.navigation.some(item => item.itemId === 'payroll-ops'), false, 'SUPER_ADMIN must not gain payroll operations UI');

  const normalized = svc.normalizeUXPayload(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(normalized.success, true, 'normalization should accept UX payload');
  assert.equal(normalized.navigationItems.some(item => item.itemId === 'abc-payroll'), false, 'cross-tenant nav should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|888888|salary|leaveBalance|rawPayload|confidentialEmployeeRecord/i, 'normalized output must redact sensitive fields');
  assertImmutable(normalized, 'normalized UX output');

  const complexity = svc.calculateUXComplexity(normalized);
  assert.equal(complexity.success, true, 'UX complexity should calculate');
  assert.ok(complexity.uxSimplicityScore < 90, 'duplicate and unused items should reduce simplicity score');
  assert.ok(complexity.navigationEfficiencyScore < 100, 'navigation clutter should reduce efficiency score');
  assert.ok(complexity.unusedNavigationItems.some(item => item.itemId === 'platform-governance-duplicate'), 'unused duplicate nav item should be detected');
  assert.ok(complexity.workflowFrictionPoints.some(item => item.workflowId === 'approval-flow'), 'high-abandonment workflow should be a friction point');
  assertImmutable(complexity, 'UX complexity output');

  const optimized = svc.optimizeUserJourney(normalized, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'MANAGER', id: 'MGR-1', tenantSlug: 'tabsons' }
  });
  assert.equal(optimized.success, true, 'journey optimization should generate');
  assert.ok(optimized.roleExperiences.MANAGER.quickActions.some(item => item.actionId === 'approvals'), 'manager optimization should prioritize approvals');
  assert.ok(optimized.optimizationOpportunities.some(item => /duplicate|unused|friction|shortcut/i.test(item.type)), 'optimization opportunities should be generated');
  assert.equal(optimized.governance.rbacAuthoritative, true);
  assertImmutable(optimized, 'optimized journey output');

  const report = svc.generateUXGovernanceReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(report.success, true, 'UX governance report should generate');
  assert.equal(report.governance.backwardCompatibilityPreserved, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.rbacGovernancePreserved, true);
  assert.ok(report.roleExperiences.EMPLOYEE.navigation.some(item => item.itemId === 'attendance'), 'employee role summary should be present');
  assert.ok(report.roleExperiences.DIRECTOR.navigation.some(item => item.itemId === 'kpi-governance'), 'director role summary should be present');
  assert.equal(report.roleExperiences.PLATFORM_OWNER.navigation.some(item => item.itemId === 'attendance'), false, 'platform owner summary excludes tenant employee journeys');
  assert.doesNotMatch(JSON.stringify(report), /999999|888888|salary|leaveBalance|ABC Payroll|confidential/i, 'report must not leak sensitive or cross-tenant data');
  assertImmutable(report, 'UX governance report');

  const dataAfterReport = global.DB.get();
  assert.ok((dataAfterReport.uxPermissionSimplificationHistory || []).length >= 1, 'UX history should persist');
  assert.ok((dataAfterReport.uxPermissionSimplificationAnalytics || []).length >= 1, 'UX analytics should persist');
  assert.ok((dataAfterReport.auditLogs || []).some(log => /UX_PERMISSION_SIMPLIFICATION|UX_GOVERNANCE/.test(log.actionType || log.eventType || '')), 'audit integration should record UX governance review');

  const blockedReport = svc.generateUXGovernanceReport(payload, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'HR', id: 'HR-1', tenantSlug: 'tabsons' }
  });
  assert.equal(blockedReport.success, false, 'tenant HR should not access platform UX governance report');
  assertImmutable(blockedReport, 'blocked report output');

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalPermission = global.PermissionMatrixService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.PermissionMatrixService;
  const dependencyAbsent = svc.generateUXGovernanceReport(payload, {
    routeType: 'platform',
    tenantSlug: 'tabsons',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1', tenantSlug: 'tabsons' },
    infrastructureOnly: true,
    monitoringOnly: true,
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely for infrastructure UX monitoring');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.permissionMatrixIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.PermissionMatrixService = originalPermission;

  console.log('uxPermissionSimplificationService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
