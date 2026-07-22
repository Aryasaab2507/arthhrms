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

function seedOperationalData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', onboardingStage: 'pilot_group', lifecycleState: 'PILOT_ACTIVE', employeeCount: 200 },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', onboardingStage: 'created', lifecycleState: 'CREATED', employeeCount: 5 }
  ];
  data.employees = [
    { id: 'EMP-T1', name: 'Tenant One', role: 'employee', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', salary: 900000, leaveBalance: 22 },
    { id: 'EMP-A1', name: 'Other Tenant Employee', role: 'employee', tenantSlug: 'abc', tenantId: 'TEN-abc', payrollAmount: 700000 }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', createdAt: '2026-05-22T01:00:00.000Z' },
    { eventId: 'WF-2', type: 'DELIVERABLE_OVERDUE', status: 'OVERDUE', module: 'Strategic Deliverables', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', createdAt: '2026-05-22T02:00:00.000Z' },
    { eventId: 'WF-X', type: 'PAYROLL_FAILED', status: 'FAILED', module: 'Payroll', tenantSlug: 'abc', tenantId: 'TEN-abc', createdAt: '2026-05-22T03:00:00.000Z', employeeName: 'Other Tenant Employee', salary: 700000 }
  ];
  data.pendingActions = [
    { id: 'PA-1', title: 'Review delayed deliverable', status: 'PENDING', actionType: 'STRATEGIC_REVIEW', tenantSlug: 'tabsons', dueAt: '2026-05-15T00:00:00.000Z' },
    { id: 'PA-X', title: 'Other tenant review', status: 'PENDING', actionType: 'STRATEGIC_REVIEW', tenantSlug: 'abc', dueAt: '2026-05-15T00:00:00.000Z' }
  ];
  data.authInvites = [
    { inviteId: 'INV-1', email: 'new1@tabsons.test', role: 'employee', tenantSlug: 'tabsons', status: 'FAILED' },
    { inviteId: 'INV-2', email: 'new2@tabsons.test', role: 'employee', tenantSlug: 'tabsons', status: 'FAILED' },
    { inviteId: 'INV-3', email: 'new3@tabsons.test', role: 'employee', tenantSlug: 'tabsons', status: 'EXPIRED' }
  ];
  data.escalations = [
    { id: 'ESC-1', escalationType: 'SLA_BREACH', severity: 'HIGH', tenantSlug: 'tabsons' },
    { id: 'ESC-2', escalationType: 'WORKFLOW_FAILURE', severity: 'CRITICAL', tenantSlug: 'tabsons' }
  ];
  data.deliverableReviews = [
    { reviewId: 'REV-1', review_status: 'PENDING', submitted_at: '2026-05-10T00:00:00.000Z', risk_level: 'HIGH', tenantSlug: 'tabsons' }
  ];
  data.operationIncidents = [
    { incidentId: 'INC-1', severity: 'CRITICAL', module: 'Workflow', title: 'Workflow backlog', status: 'Open', tenantSlug: 'tabsons', createdAt: '2026-05-22T03:30:00.000Z' }
  ];
  data.serviceErrorLogs = [
    { errorId: 'ERR-1', severity: 'HIGH', module: 'Auth', message: 'Invite activation failed', tenantSlug: 'tabsons', createdAt: '2026-05-22T04:00:00.000Z' }
  ];
  data.sessionGovernance = {
    sessions: [
      { sessionId: 'SES-1', userId: 'USR-1', role: 'employee', tenantSlug: 'tabsons', state: 'SUSPICIOUS', riskLevel: 'HIGH', lastActivityAt: '2026-05-22T04:00:00.000Z', expiresAt: '2026-05-22T12:00:00.000Z', device: { browser: 'Chrome', os: 'Windows' } },
      { sessionId: 'SES-2', userId: 'USR-2', role: 'platform_owner', tenantSlug: '', state: 'ACTIVE', riskLevel: 'LOW', lastActivityAt: '2026-05-22T04:00:00.000Z', expiresAt: '2026-05-22T12:00:00.000Z', device: { browser: 'Chrome', os: 'Windows' } }
    ]
  };
  global.DB.save(data);
  global.OrchestrationMetricsService.recordWorkflowMetric('WORKFLOW_FAILED_SAFE', { tenantSlug: 'tabsons', failed: true });
  global.OrchestrationMetricsService.recordHandlerMetric('notificationHandler', 'FAILED');
  global.OrchestrationMetricsService.recordEscalationMetric('SLA_BREACH', 'HIGH');
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
    'services/tenantProvisioningService.js',
    'services/tenantIsolationService.js',
    'services/sessionGovernanceService.js',
    'services/permissionMatrixService.js'
  ].forEach(load);
  global.__ARTHHRMS_DEV__ = true;
  load('services/operationsMonitoringService.js');
  seedOperationalData();

  const svc = global.operationsMonitoringService;
  assert.ok(svc, 'operationsMonitoringService should be registered');
  assert.ok(Object.isFrozen(svc.HEALTH_STATES), 'health state constants must be immutable');
  assert.equal(global.__ARTHHRMS_OPERATIONAL_MONITORING_SELF_TEST__.passed, true, 'development self-test should cover failure cases');

  assert.equal(svc.classifyOperationalHealth({ criticalBlockers: 1 }), 'CRITICAL', 'critical blockers should classify as CRITICAL');
  assert.equal(svc.classifyOperationalHealth({ failedWorkflows: 4 }), 'HIGH_RISK', 'workflow failure concentration should classify as HIGH_RISK');
  assert.equal(svc.classifyOperationalHealth({ warnings: 1 }), 'WARNING', 'warnings should classify as WARNING');

  const metricInput = { operation: 'payroll_generation', durationMs: 5000, salary: 123456, metadata: { service_role: 'hidden', safe: true } };
  const metricBefore = JSON.stringify(metricInput);
  const normalizedMetric = svc.normalizeRuntimeMetric(metricInput);
  assert.equal(JSON.stringify(metricInput), metricBefore, 'runtime metric normalization must not mutate input');
  assert.ok(Object.isFrozen(normalizedMetric), 'normalized runtime metric output should be immutable');
  assert.doesNotMatch(JSON.stringify(normalizedMetric), /123456|service_role|hidden/i, 'runtime metrics must redact sensitive fields');

  const congestion = svc.detectWorkflowCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
  assert.equal(congestion.congested, true, 'workflow congestion should be detected from failed workflows and overdue reviews');
  assert.ok(congestion.alerts.some(item => item.classification === 'HIGH_RISK' || item.classification === 'CRITICAL_BLOCKER'));

  const visibility = svc.validateOperationalVisibility(
    { tenantSlug: 'abc', recordType: 'workflow', metadata: { salary: 500000 } },
    { tenantSlug: 'tabsons' }
  );
  assert.equal(visibility.allowed, false, 'cross-tenant operational visibility must be blocked');
  assert.ok(visibility.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'));
  assert.doesNotMatch(JSON.stringify(visibility), /500000|salary/i, 'visibility failures must not expose sensitive HR data');

  const dataBefore = JSON.stringify(global.DB.get());
  const previewReport = svc.generateOperationalMonitoringReport({ tenantSlug: 'tabsons' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons',
    skipAuditPersistence: true,
    skipTelemetry: true,
    skipMetrics: true
  });
  assert.equal(JSON.stringify(global.DB.get()), dataBefore, 'preview operational report must remain read-only');
  assert.equal(previewReport.success, true, 'operational monitoring report should complete safely');
  assert.equal(previewReport.readOnly, true, 'operational monitoring should be read-only by default');
  assert.ok(['HIGH_RISK', 'CRITICAL'].includes(previewReport.healthState), 'seeded anomalies should raise operational health risk');
  assert.ok(previewReport.workflowHealth.failedWorkflows >= 2, 'workflow monitoring should count failed workflows');
  assert.ok(previewReport.sessionSecurity.suspiciousSessions >= 1, 'session/security monitoring should include suspicious sessions');
  assert.ok(previewReport.escalationMonitoring.escalationDensity >= 2, 'escalation monitoring should aggregate escalation density');
  assert.ok(previewReport.onboardingMonitoring.failedInvites >= 2, 'onboarding failures should be visible');
  assert.ok(previewReport.alerts.some(item => item.classification === 'CRITICAL_BLOCKER'), 'cross-tenant workflow anomaly should produce critical alert');
  assert.ok(previewReport.alerts.some(item => item.alertCode === 'REPEATED_ONBOARDING_FAILURES'), 'repeated onboarding failures should produce alert');
  assert.doesNotMatch(JSON.stringify(previewReport), /Other Tenant Employee|900000|700000|leaveBalance|payrollAmount|salary/i, 'monitoring report must not expose sensitive HR or cross-tenant record data');
  assert.ok(Object.isFrozen(previewReport), 'monitoring report must be immutable');
  assert.ok(Object.isFrozen(previewReport.alerts), 'alert list must be immutable');

  const auditReport = svc.generateOperationalMonitoringReport({ tenantSlug: 'tabsons' }, {
    actor: { role: 'platform_owner', id: 'PO-1' },
    tenantSlug: 'tabsons'
  });
  assert.equal(auditReport.success, true);
  assert.ok(global.WorkflowTelemetryService.getRecentTelemetry().some(row => /OPERATIONAL_MONITORING|RUNTIME_ANOMALY/.test(row.eventType)), 'operational monitoring should emit telemetry safely');
  assert.ok(global.DB.getAuditLogs().some(row => /OPERATIONAL_MONITORING|OPERATIONAL_ALERT/.test(row.actionType || row.action || '')), 'operational monitoring access and alerts should be audited safely');
  assert.ok(global.OrchestrationMetricsService.getMetricsSnapshot().workflows.OPERATIONAL_MONITORING_REPORTED, 'operational monitoring should aggregate metrics safely');

  const originalSessionService = global.SessionGovernanceService;
  global.SessionGovernanceService = null;
  const degraded = svc.generateOperationalMonitoringReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(degraded.success, true, 'missing session dependency should degrade safely');
  assert.ok(degraded.warnings.some(item => item.alertCode === 'SESSION_GOVERNANCE_UNAVAILABLE'));
  global.SessionGovernanceService = originalSessionService;

  const malformed = svc.generateOperationalMonitoringReport('bad-input', { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
  assert.equal(malformed.success, true, 'malformed payloads should be handled safely');
  assert.equal(malformed.healthState, 'HIGH_RISK', 'malformed payloads should not silently pass operational monitoring');
}

main();
