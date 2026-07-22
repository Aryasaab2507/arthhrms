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
    style: { setProperty(){}, removeProperty(){} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
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

function seedWorkforceData() {
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
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', tenantSlug: 'tabsons', department: 'Operations', status: 'ACTIVE', hireDate: '2025-01-01', salary: 75000, leaveBalance: 11 },
    { id: 'EMP-2', empId: 'EMP-2', tenantSlug: 'tabsons', department: 'HR', status: 'ACTIVE', hireDate: '2025-03-01', salary: 82000, leaveBalance: 9 },
    { id: 'EMP-3', empId: 'EMP-3', tenantSlug: 'tabsons', department: 'Operations', status: 'PROBATION', hireDate: '2026-01-15' },
    { id: 'ABC-1', empId: 'ABC-1', tenantSlug: 'abc', department: 'Finance', status: 'ACTIVE', salary: 999999, leaveBalance: 44 }
  ];
  data.attendanceRecords = [
    { tenantSlug: 'tabsons', empId: 'EMP-1', department: 'Operations', date: '2026-05-01', status: 'PRESENT', punctualityScore: 92 },
    { tenantSlug: 'tabsons', empId: 'EMP-2', department: 'HR', date: '2026-05-01', status: 'LATE', punctualityScore: 68 },
    { tenantSlug: 'tabsons', empId: 'EMP-3', department: 'Operations', date: '2026-05-02', status: 'ABSENT', punctualityScore: 30 },
    { tenantSlug: 'abc', empId: 'ABC-1', department: 'Finance', date: '2026-05-02', status: 'PRESENT', salary: 999999 }
  ];
  data.leaveRequests = [
    { tenantSlug: 'tabsons', empId: 'EMP-1', department: 'Operations', status: 'APPROVED', leaveDays: 2, requestedDays: 2 },
    { tenantSlug: 'tabsons', empId: 'EMP-2', department: 'HR', status: 'PENDING', leaveDays: 4, requestedDays: 4, pendingHours: 48 },
    { tenantSlug: 'tabsons', empId: 'EMP-3', department: 'Operations', status: 'REVIEW', leaveDays: 5, requestedDays: 5, pendingHours: 72 },
    { tenantSlug: 'abc', empId: 'ABC-1', department: 'Finance', status: 'APPROVED', leaveBalance: 44, salary: 999999 }
  ];
  data.onboardingWorkflows = [
    { tenantSlug: 'tabsons', department: 'Operations', status: 'DELAYED', completionRate: 55, cycleDays: 18 },
    { tenantSlug: 'tabsons', department: 'HR', status: 'ACTIVE', completionRate: 82, cycleDays: 9 },
    { tenantSlug: 'abc', department: 'Finance', status: 'ACTIVE', salary: 999999 }
  ];
  data.employeeLifecycleEvents = [
    { tenantSlug: 'tabsons', department: 'Operations', eventType: 'transfer', riskScore: 42 },
    { tenantSlug: 'tabsons', department: 'HR', eventType: 'onboarding', riskScore: 28 },
    { tenantSlug: 'abc', department: 'Finance', eventType: 'payroll', salary: 999999 }
  ];
  data.predictiveWorkforceForecastHistory = [];
  data.predictiveWorkforceReportHistory = [];
  data.predictiveWorkforceRecommendationHistory = [];
  data.predictiveWorkforceAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function assertImmutable(value, label) {
  assert.ok(Object.isFrozen(value), `${label} should be frozen`);
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item, index) => {
      if (item && typeof item === 'object') assert.ok(Object.isFrozen(item), `${label}.${index} should be frozen`);
    });
  }
}

function liveRecordSnapshot() {
  const data = global.DB.get();
  return JSON.stringify({
    employees: data.employees,
    attendanceRecords: data.attendanceRecords,
    leaveRequests: data.leaveRequests,
    onboardingWorkflows: data.onboardingWorkflows,
    employeeLifecycleEvents: data.employeeLifecycleEvents
  });
}

function sampleWorkforcePayload() {
  return {
    tenantSlug: 'tabsons',
    forecastDomains: [
      'workforce_growth',
      'workforce_capacity',
      'attendance_patterns',
      'leave_demand',
      'department_utilization',
      'workforce_engagement',
      'hiring_demand',
      'staffing_gaps'
    ],
    forecastHorizons: ['weekly', 'monthly', 'quarterly', 'annual'],
    attendanceHistory: [
      { tenantSlug: 'tabsons', department: 'Operations', period: '2026-W18', attendanceRate: 82, absenceRate: 12, lateRate: 8, headcount: 18 },
      { tenantSlug: 'tabsons', department: 'HR', period: '2026-W18', attendanceRate: 90, absenceRate: 6, lateRate: 4, headcount: 7 },
      { tenantSlug: 'abc', department: 'Finance', salary: 999999, leaveBalance: 44, attendanceRate: 99 }
    ],
    leaveHistory: [
      { tenantSlug: 'tabsons', department: 'Operations', period: '2026-05', requestedDays: 36, approvedDays: 24, pendingRequests: 5, seasonalIndex: 1.2 },
      { tenantSlug: 'tabsons', department: 'HR', period: '2026-05', requestedDays: 14, approvedDays: 8, pendingRequests: 3, seasonalIndex: 1.1 },
      { tenantSlug: 'abc', department: 'Finance', salary: 999999, leaveBalance: 44, requestedDays: 99 }
    ],
    workforceDistribution: [
      { tenantSlug: 'tabsons', department: 'Operations', headcount: 24, targetHeadcount: 30, utilizationRate: 88, openRoles: 4, attritionRisk: 14 },
      { tenantSlug: 'tabsons', department: 'HR', headcount: 8, targetHeadcount: 10, utilizationRate: 76, openRoles: 1, attritionRisk: 8 },
      { tenantSlug: 'abc', department: 'Finance', headcount: 99, targetHeadcount: 99, salary: 999999 }
    ],
    employeeLifecycleTrends: [
      { tenantSlug: 'tabsons', department: 'Operations', eventType: 'transfer', volume: 4, riskScore: 46 },
      { tenantSlug: 'tabsons', department: 'HR', eventType: 'onboarding', volume: 2, riskScore: 22 }
    ],
    onboardingTrends: [
      { tenantSlug: 'tabsons', department: 'Operations', completionRate: 62, cycleDays: 18, delayedCount: 3 },
      { tenantSlug: 'tabsons', department: 'HR', completionRate: 84, cycleDays: 9, delayedCount: 1 }
    ],
    workforceGrowthTrends: [
      { tenantSlug: 'tabsons', department: 'Operations', period: '2026-Q1', growthRate: 7, hiringVelocity: 4, targetGrowthRate: 12 },
      { tenantSlug: 'tabsons', department: 'HR', period: '2026-Q1', growthRate: 4, hiringVelocity: 2, targetGrowthRate: 6 }
    ],
    departmentStaffingTrends: [
      { tenantSlug: 'tabsons', department: 'Operations', staffingGap: 6, utilizationRate: 88, capacityRisk: 72 },
      { tenantSlug: 'tabsons', department: 'HR', staffingGap: 2, utilizationRate: 76, capacityRisk: 44 }
    ],
    engagementSignals: [
      { tenantSlug: 'tabsons', department: 'Operations', engagementScore: 67, sentimentScore: 64, workloadPressure: 74 },
      { tenantSlug: 'tabsons', department: 'HR', engagementScore: 75, sentimentScore: 72, workloadPressure: 52 }
    ],
    analytics: {
      workforceForecastAccuracy: 78,
      staffingTrend: 14,
      utilizationTrend: 18,
      workforceStabilityTrend: -7,
      leaveDemandTrend: 16,
      attendanceForecastingTrend: 9,
      hiringDemandTrend: 19
    },
    metadata: {
      source: 'workforce-test',
      confidentialEmployeeRecord: 'salary 999999 leaveBalance 44',
      rawPayload: 'private tenant workforce data'
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
    'services/tenantIsolationService.js',
    'services/aiRiskPredictionService.js',
    'services/aiKpiForecastingService.js',
    'services/smartEscalationPredictionService.js',
    'services/organizationPerformanceForecastingService.js',
    'services/executiveDecisionIntelligenceService.js',
    'services/strategicAIAssistantService.js'
  ].forEach(load);
  seedWorkforceData();

  let loadError = null;
  try {
    load('services/predictiveWorkforceAnalyticsService.js');
  } catch (error) {
    loadError = error;
  }
  assert.ifError(loadError);

  const svc = global.PredictiveWorkforceAnalyticsService;
  assert.ok(svc, 'PredictiveWorkforceAnalyticsService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export must be frozen');
  assert.equal(typeof svc.generateWorkforceForecast, 'function');
  assert.equal(typeof svc.calculateWorkforceHealth, 'function');
  assert.equal(typeof svc.calculateCapacityForecast, 'function');
  assert.equal(typeof svc.explainWorkforceForecast, 'function');
  assert.equal(typeof svc.normalizeWorkforcePayload, 'function');
  assert.equal(typeof svc.freezeWorkforceOutput, 'function');
  assert.equal(global.__ARTHHRMS_PREDICTIVE_WORKFORCE_SELF_TEST__.passed, true, 'development self-test should cover workforce forecasting, capacity forecasting, explainability, tenant isolation, and immutability');

  const directorContext = {
    tenantSlug: 'tabsons',
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons', department: 'Leadership' }
  };

  const malformed = svc.normalizeWorkforcePayload('bad payload', directorContext);
  assert.equal(malformed.success, false, 'malformed workforce payload should fail safely');
  assertImmutable(malformed, 'malformed workforce output');

  const normalized = svc.normalizeWorkforcePayload(sampleWorkforcePayload(), directorContext);
  assert.equal(normalized.success, true, 'workforce payload should normalize');
  assert.equal(normalized.tenantSlug, 'tabsons');
  assert.equal(normalized.forecastDomains.length, 8);
  assert.equal(normalized.forecastHorizons.length, 4);
  assert.equal(normalized.attendanceHistory.length, 2, 'cross-tenant attendance history should be filtered');
  assert.equal(normalized.leaveHistory.length, 2, 'cross-tenant leave history should be filtered');
  assert.equal(normalized.workforceDistribution.length, 2, 'cross-tenant workforce distribution should be filtered');
  assert.doesNotMatch(JSON.stringify(normalized), /999999|salary|leaveBalance|confidentialEmployeeRecord|rawPayload|ABC|abc/i, 'normalized output must redact sensitive and cross-tenant values');
  assertImmutable(normalized, 'normalized workforce output');

  const health = svc.calculateWorkforceHealth(normalized, directorContext);
  assert.equal(health.success, true, 'workforce health should calculate');
  assert.ok(health.workforceIntelligenceScore > 0);
  assert.ok(health.workforceReadinessScore > 0);
  assert.ok(health.workforceHealthScore > 0);
  assert.ok(health.workforceStabilityScore >= 0);
  assert.ok(health.utilizationScore >= 0);
  assert.ok(health.confidenceScore > 0);
  assertImmutable(health, 'workforce health output');

  const capacity = svc.calculateCapacityForecast(normalized, directorContext);
  assert.equal(capacity.success, true, 'capacity forecast should calculate');
  assert.ok(capacity.capacityForecasts.length >= 2);
  assert.ok(capacity.staffingForecasts.length >= 2);
  assert.ok(capacity.hiringDemandForecasts.length >= 1);
  assert.ok(capacity.workforceUtilizationScore >= 0);
  assertImmutable(capacity, 'capacity forecast output');

  const explanation = svc.explainWorkforceForecast({
    domain: 'workforce_capacity',
    department: 'Operations',
    forecastLevel: 'HIGH',
    workforceHealthScore: 61,
    confidenceScore: 72,
    contributingFactors: ['Operations utilization is above target capacity', 'leave demand is increasing for the next forecast horizon'],
    assumptions: ['tenant-scoped attendance and leave history remain comparable'],
    recommendedActions: ['Ask HR leadership to review staffing coverage before changing workforce structures']
  }, directorContext);
  assert.equal(explanation.success, true, 'workforce explanation should generate');
  assert.ok(explanation.explanation.length > 20);
  assert.ok(explanation.contributingFactors.length >= 2);
  assert.ok(explanation.assumptions.length >= 1);
  assert.ok(explanation.recommendedActions.length >= 1);
  assert.doesNotMatch(JSON.stringify(explanation), /AI predicts staffing issues/i);
  assertImmutable(explanation, 'workforce explanation output');

  const liveBefore = liveRecordSnapshot();
  const report = svc.generateWorkforceForecast(sampleWorkforcePayload(), directorContext);
  assert.equal(report.success, true, 'predictive workforce report should generate');
  assert.equal(report.readOnly, true);
  assert.ok(report.weeklyForecasts.length >= 1);
  assert.ok(report.monthlyForecasts.length >= 1);
  assert.ok(report.quarterlyForecasts.length >= 1);
  assert.ok(report.annualForecasts.length >= 1);
  assert.ok(report.staffingForecasts.length >= 1);
  assert.ok(report.capacityForecasts.length >= 1);
  assert.ok(report.workforceRiskIndicators.length >= 1);
  assert.ok(report.workforceOpportunityIndicators.length >= 1);
  assert.ok(report.hiringRecommendations.length >= 1);
  assert.ok(report.recommendedActions.length >= 1);
  assert.equal(report.governance.aiAdvisoryOnly, true);
  assert.equal(report.governance.noAutonomousActions, true);
  assert.equal(report.governance.noHRDecisionMaking, true);
  assert.equal(report.governance.noHiringAction, true);
  assert.equal(report.governance.noTerminationAction, true);
  assert.equal(report.governance.noLeaveApproval, true);
  assert.equal(report.governance.noPromotionApproval, true);
  assert.equal(report.governance.noEmployeeRecordModification, true);
  assert.equal(report.governance.noWorkforceStructureMutation, true);
  assert.equal(report.governance.noWorkflowExecution, true);
  assert.equal(report.governance.noPermissionChanges, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.workforceAnalyticsGovernancePreserved, true);
  assert.equal(report.governance.outputsImmutable, true);
  assert.equal(liveRecordSnapshot(), liveBefore, 'workforce forecasting must not mutate HR, leave, attendance, onboarding, or lifecycle records');
  assert.ok(report.forecasts.every(row => row.explanation && row.contributingFactors.length && row.assumptions.length && row.recommendedActions.length && row.confidenceLevel));
  assert.doesNotMatch(JSON.stringify(report), /999999|salary|leaveBalance|rawPayload|ABC|abc/i, 'report must not leak confidential or cross-tenant workforce data');
  assertImmutable(report, 'predictive workforce output');

  const dataAfter = global.DB.get();
  assert.ok((dataAfter.predictiveWorkforceForecastHistory || []).length >= 1, 'forecast history should persist immutably');
  assert.ok((dataAfter.predictiveWorkforceReportHistory || []).length >= 1, 'workforce report history should persist immutably');
  assert.ok((dataAfter.predictiveWorkforceRecommendationHistory || []).length >= 1, 'recommendation history should persist immutably');
  assert.ok((dataAfter.predictiveWorkforceAnalyticsHistory || []).length >= 1, 'analytics history should persist immutably');
  assert.ok((dataAfter.auditLogs || []).some(log => /PREDICTIVE_WORKFORCE|WORKFORCE_FORECAST/.test(log.actionType || log.eventType || '')), 'audit integration should record workforce forecasting access');

  const blockedCrossTenant = svc.generateWorkforceForecast({ ...sampleWorkforcePayload(), tenantSlug: 'abc' }, directorContext);
  assert.equal(blockedCrossTenant.success, false, 'cross-tenant workforce forecasting should be blocked');
  assert.match(blockedCrossTenant.classification, /TENANT|SCOPE|BLOCK/i);

  const managerScoped = svc.generateWorkforceForecast(sampleWorkforcePayload(), {
    tenantSlug: 'tabsons',
    actor: { id: 'MGR-1', role: 'MANAGER', tenantSlug: 'tabsons', department: 'Operations' }
  });
  assert.equal(managerScoped.success, true, 'manager-scoped workforce forecast should safely return department scope');
  assert.equal(managerScoped.visibility.scope, 'DEPARTMENT_WORKFORCE_FORECAST_VISIBILITY');
  assert.ok(managerScoped.forecasts.every(row => row.department === 'Operations' || row.scope === 'department_summary'), 'manager must not see unrelated department workforce forecasts');

  const insufficient = svc.generateWorkforceForecast({ tenantSlug: 'tabsons', forecastDomains: ['workforce_capacity'] }, directorContext);
  assert.equal(insufficient.success, true, 'sparse workforce datasets should not throw');
  assert.equal(insufficient.dataQuality.sparseDatasetsDetected, true);
  assert.ok(insufficient.forecasts.length >= 1);

  const originalAudit = global.AuditService;
  const originalTelemetry = global.WorkflowTelemetryService;
  const originalRisk = global.AIRiskPredictionService;
  const originalAssistant = global.StrategicAIAssistantService;
  const originalRiskLower = global.aiRiskPredictionService;
  const originalAssistantLower = global.strategicAIAssistantService;
  delete global.AuditService;
  delete global.WorkflowTelemetryService;
  delete global.AIRiskPredictionService;
  delete global.StrategicAIAssistantService;
  delete global.aiRiskPredictionService;
  delete global.strategicAIAssistantService;
  const dependencyAbsent = svc.generateWorkforceForecast(sampleWorkforcePayload(), {
    ...directorContext,
    skipAuditPersistence: true,
    skipTelemetry: true
  });
  assert.equal(dependencyAbsent.success, true, 'dependency absence should degrade safely');
  assert.equal(dependencyAbsent.integrationHealth.auditIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.telemetryIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.aiRiskPredictionIntegrated, false);
  assert.equal(dependencyAbsent.integrationHealth.strategicAIAssistantIntegrated, false);
  global.AuditService = originalAudit;
  global.WorkflowTelemetryService = originalTelemetry;
  global.AIRiskPredictionService = originalRisk;
  global.StrategicAIAssistantService = originalAssistant;
  global.aiRiskPredictionService = originalRiskLower;
  global.strategicAIAssistantService = originalAssistantLower;

  console.log('predictiveWorkforceAnalyticsService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
