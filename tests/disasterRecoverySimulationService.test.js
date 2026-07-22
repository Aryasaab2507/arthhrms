const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Node disaster recovery simulation test', platform: 'Win32' };
  global.location = { hostname: 'tabsons.arthhrms.example', pathname: '/platform-control.html' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons' };
  data.employees = [
    { id: 'EMP-1', name: 'Tabsons Employee', tenantSlug: 'tabsons', salary: 90000 },
    { id: 'ABC-1', name: 'ABC Employee', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.tenantBackupHistory = [
    { historyId: 'TBH-TAB', backupId: 'TBK-TAB', tenantSlug: 'tabsons', state: 'COMPLETED', integrityHash: 'hash-tabsons', timestamp: '2026-06-20T00:00:00.000Z' },
    { historyId: 'TBH-ABC', backupId: 'TBK-ABC', tenantSlug: 'abc', state: 'COMPLETED', integrityHash: 'hash-abc', privateNote: 'ABC confidential' }
  ];
  data.tenantBackupValidationHistory = [
    { validationId: 'TBV-TAB', backupId: 'TBK-TAB', tenantSlug: 'tabsons', integrityValid: true, validatedAt: '2026-06-20T01:00:00.000Z' },
    { validationId: 'TBV-ABC', backupId: 'TBK-ABC', tenantSlug: 'abc', integrityValid: true, validatedAt: '2026-06-20T01:00:00.000Z' }
  ];
  data.workflowFailureHistory = [
    { failureId: 'FAIL-TAB', workflowId: 'WF-TAB', tenantSlug: 'tabsons', state: 'RECOVERABLE' },
    { failureId: 'FAIL-ABC', workflowId: 'WF-ABC', tenantSlug: 'abc', state: 'RECOVERABLE', privateNote: 'ABC confidential' }
  ];
  data.workflowRecoveryHistory = [
    { recoveryId: 'REC-TAB', workflowId: 'WF-TAB', tenantSlug: 'tabsons', action: 'RETRY', outcome: 'SUCCEEDED', state: 'COMPLETED' },
    { recoveryId: 'REC-ABC', workflowId: 'WF-ABC', tenantSlug: 'abc', action: 'RETRY', outcome: 'SUCCEEDED', state: 'COMPLETED' }
  ];
  data.disasterRecoverySimulationHistory = [];
  data.disasterRecoveryReportHistory = [];
  data.disasterRecoveryAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug },
    now: '2026-06-23T10:00:00.000Z'
  };
}

function successfulScenario(overrides = {}) {
  return {
    tenantSlug: 'tabsons',
    simulationType: 'DATABASE_FAILURE',
    scenarioName: 'Primary database unavailable',
    rtoMinutes: 60,
    rpoMinutes: 15,
    recoveryDurationMinutes: 42,
    recoveredDataPointMinutes: 8,
    recoverySuccessRate: 100,
    recoveryAccuracy: 98,
    backupIntegrityValid: true,
    workflowRecoveryValid: true,
    auditIntegrityPreserved: true,
    tenantIsolationPreserved: true,
    securityPreserved: true,
    failureInjectionIsolated: true,
    expectedComponents: ['database', 'workflows', 'audit'],
    recoveredComponents: ['database', 'workflows', 'audit'],
    ...overrides
  };
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  load('db.js');
  load('services/auditService.js');
  seedData();
  global.ValidationRegistry = {
    executeValidationRule(ruleId, value) {
      if (ruleId !== 'TENANT_ACCESS') return { success: true };
      return { success: value.tenantSlug === value.actorTenantSlug && value.tenantSlug === value.ownerTenantSlug };
    }
  };
  global.TenantBackupExportService = Object.freeze({});
  global.SoftDeleteRestoreGovernanceService = Object.freeze({});
  global.WorkflowRecoveryService = Object.freeze({});
  global.operationsMonitoringService = Object.freeze({});

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/disasterRecoverySimulationService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.DisasterRecoverySimulationService;
  assert.ok(svc, 'DisasterRecoverySimulationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.SIMULATION_TYPES, [
    'DATABASE_FAILURE', 'APPLICATION_FAILURE', 'STORAGE_FAILURE', 'NOTIFICATION_FAILURE',
    'AUTHENTICATION_FAILURE', 'TENANT_RECOVERY', 'FULL_PLATFORM_RECOVERY'
  ]);
  assert.deepEqual(svc.SIMULATION_STATES, [
    'SCENARIO_SELECTED', 'SIMULATION_STARTED', 'FAILURE_INJECTED', 'RECOVERY_EXECUTED',
    'RECOVERY_VALIDATED', 'COMPLETED', 'FAILED'
  ]);
  [
    'runRecoverySimulation', 'injectFailureScenario', 'validateRecoveryOutcome',
    'calculateRecoveryReadiness', 'generateBusinessContinuityReport', 'freezeSimulationOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));
  assert.equal(global.__ARTHHRMS_DISASTER_RECOVERY_SELF_TEST__.passed, true, 'development self-test should pass');

  const before = global.DB.get();
  const protectedSnapshot = JSON.stringify({
    employees: before.employees,
    backups: before.tenantBackupHistory,
    validations: before.tenantBackupValidationHistory,
    failures: before.workflowFailureHistory,
    recoveries: before.workflowRecoveryHistory
  });

  const result = svc.runRecoverySimulation(successfulScenario(), ownerContext());
  assert.equal(result.success, true, 'platform owner can run a recovery drill');
  assert.equal(result.simulation.state, 'COMPLETED');
  assert.equal(result.simulation.simulationType, 'DATABASE_FAILURE');
  assert.equal(result.failureInjection.simulationOnly, true);
  assert.equal(result.failureInjection.liveFailureInjected, false);
  assert.equal(result.governance.productionDataMutated, false);
  assert.equal(result.governance.liveRestoreExecuted, false);
  assert.equal(result.governance.workflowExecutionTriggered, false);
  assert.equal(result.recoveryValidation.passed, true);
  assert.equal(result.recoveryValidation.rtoMet, true);
  assert.equal(result.recoveryValidation.rpoMet, true);
  assert.ok(result.scores.recoveryReadinessScore >= 85);
  assert.ok(result.scores.businessContinuityScore >= 85);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.scores));

  const afterRun = global.DB.get();
  assert.equal(JSON.stringify({
    employees: afterRun.employees,
    backups: afterRun.tenantBackupHistory,
    validations: afterRun.tenantBackupValidationHistory,
    failures: afterRun.workflowFailureHistory,
    recoveries: afterRun.workflowRecoveryHistory
  }), protectedSnapshot, 'simulation must not mutate source data or recovery systems');
  assert.ok(afterRun.disasterRecoverySimulationHistory.length >= 6, 'complete lifecycle should be appended to immutable simulation history');
  assert.ok(afterRun.disasterRecoverySimulationHistory.every(row => row.immutable === true));
  assert.ok(afterRun.disasterRecoveryReportHistory.length >= 1);
  assert.ok(afterRun.disasterRecoveryAnalyticsHistory.length >= 1);
  assert.ok(afterRun.auditLogs.some(row => /DISASTER_RECOVERY_(SIMULATION|VALIDATION|READINESS)/.test(String(row.actionType || row.action || row.type || ''))));

  const injection = svc.injectFailureScenario({ tenantSlug: 'tabsons', simulationType: 'NOTIFICATION_FAILURE' }, ownerContext());
  assert.equal(injection.success, true);
  assert.equal(injection.failureInjection.affectedCapability, 'notification delivery');
  assert.equal(injection.failureInjection.simulationOnly, true);
  assert.doesNotThrow(() => svc.injectFailureScenario(null, ownerContext()));

  const partial = svc.runRecoverySimulation(successfulScenario({
    simulationType: 'STORAGE_FAILURE',
    recoveredComponents: ['audit'],
    backupIntegrityValid: false,
    corruptedBackup: true,
    partialRecovery: true,
    recoveryDurationMinutes: 95
  }), ownerContext());
  assert.equal(partial.success, true, 'failed drill should still produce a governed report');
  assert.equal(partial.simulation.state, 'FAILED');
  assert.equal(partial.recoveryValidation.passed, false);
  assert.equal(partial.recoveryValidation.backupIntegrityPreserved, false);
  assert.equal(partial.recoveryValidation.rtoMet, false);
  assert.ok(partial.weakRecoveryAreas.length >= 1);

  const timeout = svc.runRecoverySimulation(successfulScenario({
    simulationType: 'APPLICATION_FAILURE', timedOut: true, recoveryDurationMinutes: 180
  }), ownerContext());
  assert.equal(timeout.simulation.state, 'FAILED');
  assert.ok(timeout.recoveryBottlenecks.some(item => /timeout/i.test(item)));
  const interimReport = svc.generateBusinessContinuityReport({ tenantSlug: 'tabsons' }, ownerContext());
  assert.equal(interimReport.analytics.averageRecoveryDurationMinutes, 106, 'duration analytics should not be capped at 100 minutes');

  const isolationEvidenceFailure = svc.runRecoverySimulation(successfulScenario({
    simulationType: 'TENANT_RECOVERY', tenantIsolationPreserved: false
  }), ownerContext());
  assert.equal(isolationEvidenceFailure.recoveryValidation.tenantIsolationPreserved, false, 'failed isolation evidence should fail the drill');
  assert.equal(isolationEvidenceFailure.governance.tenantIsolationPreserved, true, 'the simulation engine must remain tenant isolated even when modeled evidence fails');

  const malformed = svc.runRecoverySimulation('bad-payload', ownerContext());
  assert.equal(malformed.success, false);
  assert.equal(malformed.code, 'MALFORMED_SIMULATION_PAYLOAD');
  assert.doesNotThrow(() => svc.validateRecoveryOutcome(null, ownerContext()));

  const director = { tenantSlug: 'tabsons', actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug: 'tabsons' } };
  const hr = { tenantSlug: 'tabsons', actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' } };
  const employee = { tenantSlug: 'tabsons', actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } };
  assert.equal(svc.runRecoverySimulation(successfulScenario(), director).success, false, 'director cannot execute simulations');
  assert.equal(svc.generateBusinessContinuityReport({ tenantSlug: 'tabsons' }, director).success, true, 'director receives readiness visibility');
  assert.equal(svc.generateBusinessContinuityReport({ tenantSlug: 'tabsons' }, hr).success, true, 'HR receives operational visibility');
  assert.equal(svc.generateBusinessContinuityReport({ tenantSlug: 'tabsons' }, employee).success, false, 'employee has no simulation access');
  assert.equal(svc.runRecoverySimulation(successfulScenario({ tenantSlug: 'abc' }), ownerContext()).code, 'TENANT_ACCESS_DENIED');

  const report = svc.generateBusinessContinuityReport({ tenantSlug: 'tabsons' }, ownerContext());
  assert.equal(report.success, true);
  assert.ok(report.analytics.totalSimulations >= 4);
  assert.ok(report.analytics.recoverySuccessRate >= 0 && report.analytics.recoverySuccessRate <= 100);
  assert.ok(report.recoveryReadinessScore >= 0 && report.recoveryReadinessScore <= 100);
  assert.ok(report.continuityReadinessScore >= 0 && report.continuityReadinessScore <= 100);
  assert.ok(report.operationalResilienceScore >= 0 && report.operationalResilienceScore <= 100);
  assert.ok(report.disasterPreparednessScore >= 0 && report.disasterPreparednessScore <= 100);
  assert.equal(report.integrations.backupGovernance, true);
  assert.equal(report.integrations.restoreGovernance, true);
  assert.equal(report.integrations.workflowRecovery, true);
  assert.equal(report.integrations.auditGovernance, true);
  assert.equal(report.integrations.monitoringPlatform, true);
  assert.equal(report.governance.failureInjectionMode, 'ISOLATED_DECLARATIVE');
  assert.doesNotMatch(JSON.stringify(report), /ABC Employee|ABC confidential|TBK-ABC|WF-ABC/i, 'reports must not expose another tenant');
  assert.ok(Object.isFrozen(report));

  const frozen = svc.freezeSimulationOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
  console.log('disasterRecoverySimulationService.test.js passed');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
