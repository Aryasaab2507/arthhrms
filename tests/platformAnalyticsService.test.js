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

function seedPlatformData() {
  global.DB.migrate();
  global.DB.today = () => '2026-05-28';
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', status: 'ACTIVE', createdAt: '2026-01-05T00:00:00.000Z', planType: 'enterprise', lastActiveAt: '2026-05-27T00:00:00.000Z', quotaBytes: 5000 },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC Holdings', status: 'ACTIVE', createdAt: '2026-03-11T00:00:00.000Z', planType: 'standard', lastActiveAt: '2026-05-26T00:00:00.000Z', quotaBytes: 4000 },
    { tenantId: 'TEN-dormant', tenantSlug: 'dormant', companyName: 'Dormant Org', status: 'INACTIVE', createdAt: '2026-02-20T00:00:00.000Z', planType: 'pilot', lastActiveAt: '2026-04-01T00:00:00.000Z', quotaBytes: 1000 }
  ];
  data.users = [
    { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'platform', email: 'owner@platform.local' },
    { id: 'SA-1', role: 'SUPER_ADMIN', tenantSlug: 'tabsons', email: 'it@tabsons.local' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 90000, leaveBalance: 12, payrollAmount: 90000, privateNote: 'salary review' },
    { id: 'EMP-2', empId: 'EMP-2', role: 'MANAGER', department: 'Operations', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 120000, leaveBalance: 8 },
    { id: 'HR-1', empId: 'HR-1', role: 'HR', department: 'HR', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', compensationBand: 'confidential' },
    { id: 'EMP-X', empId: 'EMP-X', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 100000, leaveBalance: 14, privateNote: 'ABC confidential employee' },
    { id: 'EMP-Y', empId: 'EMP-Y', role: 'EMPLOYEE', department: 'Support', tenantSlug: 'abc', tenantId: 'TEN-abc', salary: 70000, leaveBalance: 10 }
  ];
  data.authInvitations = [
    { id: 'INV-1', tenantSlug: 'tabsons', status: 'ACCEPTED', module: 'onboarding' },
    { id: 'INV-2', tenantSlug: 'tabsons', status: 'PENDING', module: 'onboarding' },
    { id: 'INV-X', tenantSlug: 'abc', status: 'FAILED', module: 'onboarding', privateNote: 'ABC confidential onboarding' }
  ];
  data.employeeOnboarding = [
    { id: 'ONB-1', tenantSlug: 'tabsons', status: 'COMPLETED' },
    { id: 'ONB-2', tenantSlug: 'tabsons', status: 'FAILED' },
    { id: 'ONB-X', tenantSlug: 'abc', status: 'IN_PROGRESS' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', tenantSlug: 'tabsons', type: 'LEAVE_APPROVAL', status: 'COMPLETED', module: 'Leave', createdAt: '2026-05-26T00:00:00.000Z' },
    { eventId: 'WF-2', tenantSlug: 'tabsons', type: 'PAYROLL_APPROVAL', status: 'FAILED', module: 'Payroll', createdAt: '2026-05-27T00:00:00.000Z', salary: 90000 },
    { eventId: 'WF-3', tenantSlug: 'tabsons', type: 'ONBOARDING_FLOW', status: 'DEGRADED', module: 'Onboarding', createdAt: '2026-05-27T00:00:00.000Z' },
    { eventId: 'WF-X', tenantSlug: 'abc', type: 'ABC_PRIVATE_WORKFLOW', status: 'FAILED', module: 'Payroll', confidentialPayroll: 'ABC salary data' }
  ];
  data.asyncJobs = [
    { id: 'JOB-1', tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', status: 'FAILED' },
    { id: 'JOB-2', tenantSlug: 'tabsons', jobType: 'IMPORT', status: 'COMPLETED' },
    { id: 'JOB-X', tenantSlug: 'abc', jobType: 'ONBOARDING', status: 'FAILED', privatePayload: 'ABC confidential job' }
  ];
  data.notifications = [
    { id: 'N-1', tenantSlug: 'tabsons', status: 'DELIVERED', category: 'announcement' },
    { id: 'N-2', tenantSlug: 'tabsons', status: 'FAILED', category: 'workflow' },
    { id: 'N-X', tenantSlug: 'abc', status: 'FAILED', category: 'payroll', privateMessage: 'ABC confidential notification' }
  ];
  data.notificationQueue = [
    { id: 'NQ-1', tenantSlug: 'tabsons', status: 'FAILED', channel: 'email' },
    { id: 'NQ-X', tenantSlug: 'abc', status: 'PENDING', channel: 'sms', confidentialBody: 'ABC private queue item' }
  ];
  data.communications = [
    { id: 'COM-1', tenantSlug: 'tabsons', type: 'ANNOUNCEMENT', viewedUserIds: ['EMP-1'], acknowledgedUserIds: ['EMP-1'], audienceUserIds: ['EMP-1', 'EMP-2'], body: 'confidential body hidden' },
    { id: 'COM-X', tenantSlug: 'abc', type: 'LEADERSHIP', viewedUserIds: [], audienceUserIds: ['EMP-X'], body: 'ABC confidential communication' }
  ];
  data.policyAcknowledgements = [
    { id: 'ACK-1', tenantSlug: 'tabsons', status: 'ACKNOWLEDGED' },
    { id: 'ACK-2', tenantSlug: 'tabsons', status: 'OVERDUE' },
    { id: 'ACK-X', tenantSlug: 'abc', status: 'PENDING', privateNote: 'ABC confidential policy ack' }
  ];
  data.escalations = [
    { id: 'ESC-1', tenantSlug: 'tabsons', status: 'ESCALATED', severity: 'HIGH', type: 'WORKFLOW_DELAY' },
    { id: 'ESC-2', tenantSlug: 'tabsons', status: 'OPEN', severity: 'WARNING', type: 'APPROVAL_DELAY' },
    { id: 'ESC-X', tenantSlug: 'abc', status: 'ESCALATED', severity: 'CRITICAL', privateNote: 'ABC confidential escalation' }
  ];
  data.fileAttachments = [
    { id: 'ATT-1', tenantSlug: 'tabsons', sizeBytes: 2500, status: 'ACTIVE', documentUrl: 'https://storage.example/private/tabsons/a.pdf' },
    { id: 'ATT-2', tenantSlug: 'tabsons', sizeBytes: 3000, status: 'FAILED', failureReason: 'mime mismatch' },
    { id: 'ATT-X', tenantSlug: 'abc', sizeBytes: 1800, status: 'ACTIVE', documentUrl: 'https://storage.example/private/abc/x.pdf', privateNote: 'ABC confidential attachment' }
  ];
  data.storageObjects = [
    { id: 'OBJ-1', tenantSlug: 'tabsons', sizeBytes: 3500, state: 'ACTIVE', accessDenied: false, publicUrl: 'https://public.example/object' },
    { id: 'OBJ-2', tenantSlug: 'tabsons', sizeBytes: 1800, state: 'FAILED', suspiciousAccess: true },
    { id: 'OBJ-X', tenantSlug: 'abc', sizeBytes: 2000, state: 'ACTIVE', privatePath: 'tenant/abc/private' }
  ];
  data.uploadValidationRecords = [
    { id: 'UV-1', tenantSlug: 'tabsons', state: 'APPROVED', mimeType: 'application/pdf' },
    { id: 'UV-2', tenantSlug: 'tabsons', state: 'REJECTED', mimeMismatch: true },
    { id: 'UV-X', tenantSlug: 'abc', state: 'QUARANTINED', privateThreatNote: 'ABC suspicious macro' }
  ];
  data.signedAccessRecords = [
    { id: 'SA-URL-1', tenantSlug: 'tabsons', state: 'ACTIVE', accessType: 'PREVIEW' },
    { id: 'SA-URL-2', tenantSlug: 'tabsons', state: 'EXPIRED', accessType: 'DOWNLOAD', token: 'secret-token' },
    { id: 'SA-URL-X', tenantSlug: 'abc', state: 'REVOKED', token: 'abc-secret-token' }
  ];
  data.fileRetentionRecords = [
    { id: 'RET-1', tenantSlug: 'tabsons', lifecycleState: 'ARCHIVED', sizeBytes: 1500 },
    { id: 'RET-2', tenantSlug: 'tabsons', lifecycleState: 'EXPIRING', sizeBytes: 500 },
    { id: 'RET-X', tenantSlug: 'abc', lifecycleState: 'ARCHIVED', privateArchiveNote: 'ABC confidential archive' }
  ];
  data.departmentExecutionRecords = [
    { id: 'EX-1', tenantSlug: 'tabsons', department: 'Operations', state: 'BLOCKED', workloadUnits: 8, dueDate: '2026-05-20', strategicNotes: 'private execution note' },
    { id: 'EX-2', tenantSlug: 'tabsons', department: 'Engineering', state: 'IN_PROGRESS', workloadUnits: 2, dueDate: '2026-05-30' },
    { id: 'EX-X', tenantSlug: 'abc', department: 'Finance', state: 'BLOCKED', workloadUnits: 10, strategicNotes: 'ABC confidential execution' }
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
    'services/storageHardeningService.js',
    'services/uploadValidationService.js',
    'services/fileRetentionService.js',
    'services/signedUrlGovernanceService.js',
    'services/communicationGovernanceService.js',
    'services/teamWorkspaceService.js',
    'services/workflowDiscussionService.js',
    'services/communicationAnalyticsService.js',
    'services/departmentExecutionBoardService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  let loadError = null;
  try {
    load('services/platformAnalyticsService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);
  seedPlatformData();

  const svc = global.PlatformAnalyticsService;
  assert.ok(svc, 'PlatformAnalyticsService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.ok(Object.isFrozen(svc.ANALYTICS_STATES), 'analytics states must be immutable');
  assert.ok(Object.isFrozen(svc.FAILURE_CLASSIFICATIONS), 'failure classifications must be immutable');
  assert.equal(global.__ARTHHRMS_PLATFORM_ANALYTICS_SELF_TEST__.passed, true, 'development self-test should cover platform analytics failure cases');

  assert.equal(svc.classifyPlatformRisk({ crossTenant: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPlatformRisk({ salaryVisibility: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPlatformRisk({ leaveBalanceVisibility: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPlatformRisk({ superAdminPayrollVisibility: true }), 'CRITICAL_BLOCKER');
  assert.equal(svc.classifyPlatformRisk({ platformDegradation: true }), 'WARNING');

  const platformOwner = svc.validatePlatformAnalyticsScope({ aggregateOnly: true }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(platformOwner.allowed, true, 'PLATFORM_OWNER may view isolated aggregate platform analytics');
  assert.equal(platformOwner.visibility, 'ISOLATED_PLATFORM_ANALYTICS');
  assert.equal(platformOwner.metadata.aggregateOnly, true);

  const superAdminInfra = svc.validatePlatformAnalyticsScope({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminInfra.allowed, true, 'SUPER_ADMIN may view infrastructure-only monitoring');
  assert.equal(superAdminInfra.visibility, 'INFRASTRUCTURE_MONITORING_ONLY');

  const superAdminAggregate = svc.validatePlatformAnalyticsScope({ aggregateOnly: true, mode: 'TENANT_GROWTH' }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminAggregate.allowed, false, 'SUPER_ADMIN must not access broad platform aggregate analytics');
  assert.ok(superAdminAggregate.failures.some(item => item.failureCode === 'SUPER_ADMIN_INFRASTRUCTURE_ONLY_ANALYTICS'));

  const superAdminInfraReport = svc.generatePlatformAnalyticsReport({ infrastructureOnly: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' },
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(superAdminInfraReport.success, true, 'SUPER_ADMIN infrastructure report should generate');
  assert.equal(superAdminInfraReport.accessGovernance.superAdminInfrastructureOnly, true);
  assert.equal(superAdminInfraReport.tenantIntelligence.activeEmployeesCount, 0, 'SUPER_ADMIN infrastructure view must not expose employee counts');
  assert.equal(superAdminInfraReport.engagementIntelligence.organizationEngagement, 0, 'SUPER_ADMIN infrastructure view must not expose organization engagement');
  assert.doesNotMatch(JSON.stringify(superAdminInfraReport), /"salary"\s*:|"leaveBalance"\s*:|payrollAmount|EMP-1|EMP-X|organizationEngagement":(?!0)/i);

  const superAdminPayroll = svc.validatePlatformAnalyticsScope({ salaryVisibility: true, payrollVisibility: true }, {
    routeType: 'platform',
    actor: { role: 'SUPER_ADMIN', id: 'SA-1' }
  });
  assert.equal(superAdminPayroll.allowed, false, 'SUPER_ADMIN payroll visibility must be blocked');
  assert.ok(superAdminPayroll.failures.some(item => item.failureCode === 'SUPER_ADMIN_PAYROLL_VISIBILITY_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(superAdminPayroll), /salary|payrollVisibility|SA-1/i);

  const directorDenied = svc.validatePlatformAnalyticsScope({ aggregateOnly: true }, {
    routeType: 'tenant',
    tenantSlug: 'tabsons',
    actor: { role: 'DIRECTOR', id: 'DIR-1' }
  });
  assert.equal(directorDenied.allowed, false, 'tenant roles must never access platform analytics');
  assert.ok(directorDenied.failures.some(item => item.failureCode === 'TENANT_ROLE_PLATFORM_ANALYTICS_BLOCKED'));

  const rawTenantDenied = svc.validatePlatformAnalyticsScope({ rawTenantDataAccess: true, tenantSlug: 'tabsons', salary: 90000, leaveBalance: 12 }, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' }
  });
  assert.equal(rawTenantDenied.allowed, false, 'raw confidential tenant data must be blocked');
  assert.ok(rawTenantDenied.failures.some(item => item.failureCode === 'RAW_CONFIDENTIAL_TENANT_DATA_BLOCKED'));
  assert.doesNotMatch(JSON.stringify(rawTenantDenied), /salary|leaveBalance|90000|12/i);

  const malformed = svc.normalizePlatformMetrics(null, { routeType: 'platform' });
  assert.equal(malformed.success, false, 'malformed platform metrics payload should fail safely');
  assert.ok(malformed.failures.some(item => item.failureCode === 'MALFORMED_PLATFORM_METRICS'));

  const normalized = svc.normalizePlatformMetrics({
    state: 'aggregated',
    tenantSlug: 'tabsons',
    activeTenants: 2,
    activeEmployeesCount: 5,
    salary: 90000,
    leaveBalance: 12,
    confidentialEmployeeName: 'Hidden Employee'
  }, { routeType: 'platform' });
  assert.equal(normalized.success, true, 'valid platform metrics should normalize');
  assert.equal(normalized.payload.state, 'AGGREGATED');
  assert.equal(normalized.payload.activeTenants, 2);
  assert.ok(Object.isFrozen(normalized), 'normalized metrics output must be immutable');
  assert.doesNotMatch(JSON.stringify(normalized), /salary|leaveBalance|Hidden Employee|90000/i);

  const degradation = svc.detectPlatformDegradation({}, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(degradation.success, true, 'platform degradation detection should work');
  assert.ok(degradation.summary.workflowCongestion >= 1);
  assert.ok(degradation.summary.failedJobs >= 1);
  assert.ok(degradation.summary.uploadFailureRates >= 1);
  assert.ok(degradation.summary.notificationFailures >= 1);
  assert.ok(degradation.summary.storagePressure >= 1);
  assert.ok(degradation.summary.escalationSpikes >= 1);
  assert.ok(degradation.summary.onboardingFailures >= 1);
  assert.ok(degradation.summary.inactiveTenantDetection >= 1);
  assert.ok(Object.isFrozen(degradation.healthSignals), 'degradation signals must be immutable');
  assert.doesNotMatch(JSON.stringify(degradation), /salary|leaveBalance|ABC confidential|private\/abc|secret-token/i);

  const before = global.DB.get();
  const historicalBefore = JSON.stringify({
    employees: before.employees,
    platformTenants: before.platformTenants,
    workflowEvents: before.workflowEvents,
    fileAttachments: before.fileAttachments,
    storageObjects: before.storageObjects
  });
  const report = svc.generatePlatformAnalyticsReport({}, {
    routeType: 'platform',
    actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
    now: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(report.success, true, 'platform analytics report should generate');
  assert.equal(report.readOnly, true, 'platform analytics report must be read-only');
  assert.equal(report.platformAnalyticsModel.state, 'ALERTING');
  assert.equal(report.accessGovernance.salaryVisibility, false);
  assert.equal(report.accessGovernance.leaveBalanceVisibility, false);
  assert.equal(report.accessGovernance.superAdminPayrollVisibility, false);
  assert.equal(report.accessGovernance.platformOwnerTenantUiIsolation, true);
  assert.equal(report.accessGovernance.crossTenantConfidentialLeakageBlocked, true);
  assert.ok(report.tenantIntelligence.activeTenants >= 2);
  assert.ok(report.tenantIntelligence.activeEmployeesCount >= 5);
  assert.ok(report.tenantIntelligence.tenantGrowthAnalytics >= 3);
  assert.ok(report.platformHealth.workflowCongestion >= 1);
  assert.ok(report.platformHealth.failedJobs >= 1);
  assert.ok(report.platformHealth.uploadFailureRates >= 1);
  assert.ok(report.platformHealth.notificationFailures >= 1);
  assert.ok(report.platformHealth.storagePressure >= 1);
  assert.ok(report.platformHealth.escalationSpikes >= 1);
  assert.ok(report.platformHealth.onboardingFailures >= 1);
  assert.ok(report.platformHealth.inactiveTenantDetection >= 1);
  assert.ok(report.storageUsageAnalytics.tenantStorageGrowth >= 1);
  assert.ok(report.storageUsageAnalytics.uploadCongestion >= 1);
  assert.ok(report.storageUsageAnalytics.signedUrlUsage >= 1);
  assert.ok(report.storageUsageAnalytics.attachmentGrowth >= 1);
  assert.ok(report.storageUsageAnalytics.quotaUtilization >= 1);
  assert.ok(report.storageUsageAnalytics.retentionGrowth >= 1);
  assert.ok(report.workflowExecutionAnalytics.workflowCompletionTrends >= 1);
  assert.ok(report.workflowExecutionAnalytics.executionCongestion >= 1);
  assert.ok(report.workflowExecutionAnalytics.escalationGrowth >= 1);
  assert.ok(report.workflowExecutionAnalytics.delayedApprovalTrends >= 1);
  assert.ok(report.workflowExecutionAnalytics.operationalBottlenecks >= 1);
  assert.ok(report.workflowExecutionAnalytics.workloadImbalance >= 1);
  assert.ok(report.engagementIntelligence.organizationEngagement >= 0);
  assert.ok(report.engagementIntelligence.featureAdoptionRate >= 0);
  assert.ok(report.engagementIntelligence.onboardingCompletionRate >= 0);
  assert.equal(report.integrationHealth.workflowTelemetryIntegrated, true);
  assert.equal(report.integrationHealth.communicationAnalyticsIntegrated, true);
  assert.equal(report.integrationHealth.departmentExecutionBoardIntegrated, true);
  assert.ok(Object.isFrozen(report), 'platform analytics report must be immutable');
  assert.doesNotMatch(JSON.stringify(report), /"salary"\s*:|"leaveBalance"\s*:|payrollAmount|EMP-1|EMP-X|ABC confidential|documentUrl|publicUrl|privatePath|secret-token|confidential body/i);
  assert.equal(JSON.stringify({
    employees: global.DB.get().employees,
    platformTenants: global.DB.get().platformTenants,
    workflowEvents: global.DB.get().workflowEvents,
    fileAttachments: global.DB.get().fileAttachments,
    storageObjects: global.DB.get().storageObjects
  }), historicalBefore, 'platform analytics must not mutate tenant records');

  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /PLATFORM_ANALYTICS/.test(row.eventType || row.category || '')), 'platform analytics telemetry should emit safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.PLATFORM_ANALYTICS_REPORTED, 'platform analytics metrics should aggregate safely');
  assert.ok(global.DB.getAuditLogs().some(row => /PLATFORM_ANALYTICS/.test(row.actionType || row.action || '')), 'platform analytics actions should be audited safely');

  const originalWorkflowTelemetry = global.WorkflowTelemetryService;
  const originalCommunicationAnalytics = global.CommunicationAnalyticsService;
  const originalDepartmentExecution = global.DepartmentExecutionBoardService;
  const originalStorageHardening = global.StorageHardeningService;
  try {
    delete global.WorkflowTelemetryService;
    delete global.CommunicationAnalyticsService;
    delete global.DepartmentExecutionBoardService;
    delete global.StorageHardeningService;
    const degraded = svc.generatePlatformAnalyticsReport({}, {
      routeType: 'platform',
      actor: { role: 'PLATFORM_OWNER', id: 'PO-1' },
      skipAuditPersistence: true,
      skipTelemetry: true,
      skipMetrics: true
    });
    assert.equal(degraded.success, true, 'missing platform analytics integrations should degrade safely');
    assert.equal(degraded.integrationHealth.workflowTelemetryIntegrated, false);
    assert.equal(degraded.integrationHealth.communicationAnalyticsIntegrated, false);
    assert.equal(degraded.integrationHealth.departmentExecutionBoardIntegrated, false);
    assert.equal(degraded.integrationHealth.storageAnalyticsIntegrated, false);
  } finally {
    if (originalWorkflowTelemetry) global.WorkflowTelemetryService = originalWorkflowTelemetry;
    if (originalCommunicationAnalytics) global.CommunicationAnalyticsService = originalCommunicationAnalytics;
    if (originalDepartmentExecution) global.DepartmentExecutionBoardService = originalDepartmentExecution;
    if (originalStorageHardening) global.StorageHardeningService = originalStorageHardening;
  }

  console.log('platformAnalyticsService.test.js passed');
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
