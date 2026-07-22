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
  global.navigator = { userAgent: 'Node validation registry test', platform: 'Win32' };
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
  data.validationRuleHistory = [];
  data.validationExecutionHistory = [
    { executionId: 'VAL-ABC', tenantSlug: 'abc', ruleId: 'EMAIL', version: 1, success: false, code: 'ABC_PRIVATE_FAILURE', timestamp: '2026-06-20T00:00:00.000Z' }
  ];
  data.validationRegistryAnalytics = [];
  data.auditLogs = [];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  load('db.js');
  load('services/auditService.js');
  seedData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/validationRegistryService.js');

  const svc = global.ValidationRegistry;
  assert.ok(svc, 'ValidationRegistry should be exported');
  assert.equal(global.ValidationRegistryService, svc, 'service alias should remain available');
  assert.ok(Object.isFrozen(svc), 'registry API should be frozen');
  assert.deepEqual(svc.VALIDATION_CATEGORIES, [
    'FIELD_VALIDATION', 'ENTITY_VALIDATION', 'WORKFLOW_VALIDATION', 'SECURITY_VALIDATION',
    'POLICY_VALIDATION', 'TENANT_VALIDATION', 'LIFECYCLE_VALIDATION'
  ]);
  assert.equal(global.__ARTHHRMS_VALIDATION_REGISTRY_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'registerValidationRule', 'executeValidationRule', 'validateEntity', 'validateWorkflow',
    'calculateValidationHealth', 'freezeValidationRegistryOutput'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const context = {
    tenantSlug: 'tabsons', validatedTenantAccess: true,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' },
    now: '2026-06-21T00:00:00.000Z'
  };

  const builtIns = svc.listValidationRules({ status: 'ACTIVE' }, context);
  assert.equal(builtIns.success, true);
  ['EMAIL', 'PHONE', 'EMPLOYEE_ID', 'DEPARTMENT_CODE', 'DATE_RANGE', 'PASSWORD_POLICY', 'ROLE_ASSIGNMENT', 'TENANT_ACCESS']
    .forEach(ruleId => assert.ok(builtIns.rules.some(rule => rule.ruleId === ruleId), `${ruleId} should be registered`));
  assert.ok(Object.isFrozen(builtIns));
  assert.doesNotMatch(JSON.stringify(builtIns), /validator|function\s*\(/i, 'rule listings must not expose executable code');

  assert.equal(svc.executeValidationRule('EMAIL', 'asha@example.com', {}, context).success, true);
  const invalidEmail = svc.executeValidationRule('EMAIL', 'not-an-email', {}, context);
  assert.equal(invalidEmail.success, false);
  assert.equal(invalidEmail.code, 'INVALID_EMAIL');
  assert.equal(svc.executeValidationRule('PHONE', '+91 98765 43210', {}, context).success, true);
  assert.equal(svc.executeValidationRule('EMPLOYEE_ID', 'EMP-001', {}, context).success, true);
  assert.equal(svc.executeValidationRule('DEPARTMENT_CODE', 'ENG-OPS', {}, context).success, true);
  assert.equal(svc.executeValidationRule('DATE_RANGE', { startDate: '2026-06-01', endDate: '2026-06-30' }, {}, context).success, true);
  assert.equal(svc.executeValidationRule('PASSWORD_POLICY', 'weak', {}, context).success, false);
  assert.equal(svc.executeValidationRule('ROLE_ASSIGNMENT', { role: 'HR', allowedRoles: ['HR', 'DIRECTOR'] }, {}, context).success, true);

  const tenantAllowed = svc.executeValidationRule('TENANT_ACCESS', {
    tenantSlug: 'tabsons', ownerTenantSlug: 'tabsons', actorTenantSlug: 'tabsons'
  }, {}, context);
  assert.equal(tenantAllowed.success, true);
  const tenantDenied = svc.executeValidationRule('TENANT_ACCESS', {
    tenantSlug: 'abc', ownerTenantSlug: 'abc', actorTenantSlug: 'tabsons', privateRecord: 'ABC confidential'
  }, {}, context);
  assert.equal(tenantDenied.success, false, 'cross-tenant access must fail closed');
  assert.equal(tenantDenied.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(JSON.stringify(tenantDenied), /ABC confidential|privateRecord/i, 'validation output must not expose payload values');

  const deniedRegistration = svc.registerValidationRule({
    ruleId: 'CUSTOM_SCORE', version: 1, category: 'POLICY_VALIDATION', validator: () => true
  }, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } });
  assert.equal(deniedRegistration.success, false, 'tenant roles cannot change validation governance');

  const draftV1 = svc.registerValidationRule({
    ruleId: 'CUSTOM_SCORE', name: 'Custom Score', version: 1, category: 'POLICY_VALIDATION',
    owner: 'Platform Risk', validator: value => Number(value) >= 50,
    message: 'Score must be at least 50.'
  }, context);
  assert.equal(draftV1.success, true);
  assert.equal(draftV1.rule.status, 'DRAFT');
  assert.equal(svc.executeValidationRule('CUSTOM_SCORE', 60, {}, context).code, 'RULE_NOT_ACTIVE');
  assert.equal(svc.approveValidationRule('CUSTOM_SCORE', 1, context).success, true);
  assert.equal(svc.activateValidationRule('CUSTOM_SCORE', 1, context).success, true);
  assert.equal(svc.executeValidationRule('CUSTOM_SCORE', 60, {}, context).success, true);
  assert.equal(svc.executeValidationRule('CUSTOM_SCORE', 40, {}, context).success, false);

  const conflict = svc.registerValidationRule({
    ruleId: 'CUSTOM_SCORE', version: 1, category: 'POLICY_VALIDATION', validator: () => true
  }, context);
  assert.equal(conflict.success, false);
  assert.equal(conflict.code, 'RULE_VERSION_CONFLICT');

  const draftV2 = svc.registerValidationRule({
    ruleId: 'CUSTOM_SCORE', name: 'Custom Score', version: 2, category: 'POLICY_VALIDATION',
    owner: 'Platform Risk', validator: value => Number(value) >= 75,
    message: 'Score must be at least 75.', activationDate: '2026-06-21T00:00:00.000Z'
  }, context);
  assert.equal(draftV2.success, true);
  svc.approveValidationRule('CUSTOM_SCORE', 2, context);
  svc.activateValidationRule('CUSTOM_SCORE', 2, context);
  const latest = svc.executeValidationRule('CUSTOM_SCORE', 60, {}, context);
  assert.equal(latest.version, 2, 'latest active version should execute by default');
  assert.equal(latest.success, false);
  const compatibleV1 = svc.executeValidationRule('CUSTOM_SCORE', 60, { version: 1, allowDeprecated: true }, context);
  assert.equal(compatibleV1.success, true, 'explicit deprecated versions remain available for compatibility');
  assert.equal(compatibleV1.version, 1);

  svc.registerValidationRule({
    ruleId: 'SAFE_OUTPUT', version: 1, category: 'SECURITY_VALIDATION',
    validator: value => ({ valid: false, code: 'SAFE_OUTPUT_REJECTED', details: { echoedValue: value } })
  }, context);
  svc.approveValidationRule('SAFE_OUTPUT', 1, context);
  svc.activateValidationRule('SAFE_OUTPUT', 1, context);
  const safeOutput = svc.executeValidationRule('SAFE_OUTPUT', 'private-credential-value', {}, context);
  assert.doesNotMatch(JSON.stringify(safeOutput), /private-credential-value|echoedValue/i, 'custom validators cannot expose validated values');

  const employee = { email: 'worker@example.com', employeeId: 'EMP-9', departmentCode: 'OPS' };
  const entityResult = svc.validateEntity('EMPLOYEE_IMPORT', employee, {
    rules: [
      { ruleId: 'EMAIL', field: 'email' },
      { ruleId: 'EMPLOYEE_ID', field: 'employeeId' },
      { ruleId: 'DEPARTMENT_CODE', field: 'departmentCode' }
    ]
  }, context);
  assert.equal(entityResult.success, true);
  assert.deepEqual(employee, { email: 'worker@example.com', employeeId: 'EMP-9', departmentCode: 'OPS' }, 'entity validation must not mutate inputs');
  const workflowResult = svc.validateWorkflow({ tenantSlug: 'tabsons', state: 'ACTIVE' }, {
    rules: [{ ruleId: 'TENANT_ACCESS', value: row => ({ tenantSlug: row.tenantSlug, ownerTenantSlug: row.tenantSlug, actorTenantSlug: 'tabsons' }) }]
  }, context);
  assert.equal(workflowResult.success, true);

  svc.registerValidationRule({ ruleId: 'CIRCULAR_A', version: 1, category: 'WORKFLOW_VALIDATION', dependencies: ['CIRCULAR_B'], validator: () => true }, context);
  svc.registerValidationRule({ ruleId: 'CIRCULAR_B', version: 1, category: 'WORKFLOW_VALIDATION', dependencies: ['CIRCULAR_A'], validator: () => true }, context);
  svc.approveValidationRule('CIRCULAR_A', 1, context); svc.activateValidationRule('CIRCULAR_A', 1, context);
  svc.approveValidationRule('CIRCULAR_B', 1, context); svc.activateValidationRule('CIRCULAR_B', 1, context);
  const circular = svc.executeValidationRule('CIRCULAR_A', true, {}, context);
  assert.equal(circular.success, false);
  assert.equal(circular.code, 'CIRCULAR_RULE_DEPENDENCY');
  assert.doesNotThrow(() => svc.registerValidationRule(null, context));
  assert.equal(svc.executeValidationRule('MISSING_RULE', 'value', {}, context).code, 'RULE_NOT_FOUND');

  const report = svc.calculateValidationHealth({ tenantSlug: 'tabsons' }, context);
  assert.equal(report.success, true);
  assert.ok(report.validationHealthScore >= 0 && report.validationHealthScore <= 100);
  assert.ok(report.ruleQualityScore >= 0 && report.ruleQualityScore <= 100);
  assert.ok(report.governanceScore >= 0 && report.governanceScore <= 100);
  assert.ok(report.analytics.validationUsage > 0);
  assert.ok(report.analytics.ruleFailures > 0);
  assert.doesNotMatch(JSON.stringify(report), /VAL-ABC|ABC_PRIVATE_FAILURE|ABC confidential/i, 'analytics must remain tenant scoped');
  assert.ok(Object.isFrozen(report));

  load('services/apiPayloadValidationService.js');
  const beforeApi = global.DB.get().validationExecutionHistory.length;
  const apiResult = global.ApiPayloadValidationService.validatePayload(
    { email: 'api@example.com' },
    { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
    context
  );
  assert.equal(apiResult.success, true);
  const apiExecutions = global.DB.get().validationExecutionHistory.slice(beforeApi);
  assert.ok(apiExecutions.some(row => row.ruleId === 'EMAIL' && row.source === 'apiPayloadValidationService'), 'API validation should delegate reusable rules to the registry');

  const beforeTenantBusinessRule = global.DB.get().validationExecutionHistory.length;
  const apiTenantResult = global.ApiPayloadValidationService.validateBusinessRules({ tenantSlug: 'abc' }, {}, context);
  assert.equal(apiTenantResult.success, false);
  assert.ok(global.DB.get().validationExecutionHistory.slice(beforeTenantBusinessRule)
    .some(row => row.ruleId === 'TENANT_ACCESS' && row.source === 'apiPayloadValidationService'), 'API business validation should delegate tenant ownership to the registry');
  const apiGovernanceReport = global.ApiPayloadValidationService.generateApiValidationReport({ tenantSlug: 'tabsons' }, context);
  assert.equal(apiGovernanceReport.integrations.validationRegistry, true, 'API governance should report centralized registry integration');

  load('services/validationService.js');
  assert.equal(global.validationService.registry, svc, 'legacy validation adapter should expose the registry without replacing existing methods');
  assert.equal(global.validationService.executeValidationRule('EMAIL', 'adapter@example.com', {}, context).success, true);

  const data = global.DB.get();
  assert.ok(data.validationRuleHistory.some(row => row.action === 'RULE_CREATED'));
  assert.ok(data.validationExecutionHistory.some(row => row.success === false));
  assert.ok(data.auditLogs.some(row => /VALIDATION_RULE|VALIDATION_FAILURE/.test(String(row.actionType || row.action || row.type || ''))), 'governance and failures should be audited');
  assert.ok(Object.isFrozen(svc.freezeValidationRegistryOutput({ nested: { value: 1 } }).nested));

  console.log('validationRegistryService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
