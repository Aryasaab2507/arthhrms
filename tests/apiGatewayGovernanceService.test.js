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

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node API gateway test', platform: 'Win32' };
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

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'HR-1', role: 'HR', tenantSlug, source: 'supabase', roleTrusted: true },
    now: '2026-06-30T10:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug, source: 'supabase', roleTrusted: true },
    now: '2026-06-30T10:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug, source: 'supabase', roleTrusted: true },
    now: '2026-06-30T10:00:00.000Z'
  };
}

function seedData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private API data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'ABC Private', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', privateNote: 'never expose' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-ENG', departmentCode: 'ENG', departmentName: 'Engineering', tenantSlug: 'tabsons', state: 'ACTIVE' },
    { departmentId: 'D-ABC', departmentCode: 'ABC', departmentName: 'ABC Finance', tenantSlug: 'abc', state: 'ACTIVE' }
  ];
  [
    'apiGatewayRequestHistory',
    'apiGatewayRateLimitHistory',
    'apiGatewayThrottleHistory',
    'apiGatewayRoutingHistory',
    'apiGatewaySecurityHistory',
    'apiGatewayMetricsHistory',
    'apiGatewayConfigurationHistory',
    'apiValidationHistory',
    'apiViolationHistory',
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
    'services/errorService.js',
    'services/errorHandlingFrameworkService.js',
    'services/validationRegistryService.js',
    'services/apiPayloadValidationService.js',
    'services/loginAttemptSecurityService.js',
    'services/sessionGovernanceService.js',
    'services/enterpriseRedisCacheService.js',
    'services/distributedQueueService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/apiGatewayGovernanceService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.ApiGatewayGovernanceService;
  assert.ok(svc, 'ApiGatewayGovernanceService should be exported');
  assert.equal(global.apiGatewayGovernanceService, svc, 'lowercase gateway service alias should be exported');
  assert.ok(Object.isFrozen(svc), 'gateway service export should be frozen');
  ['GatewayMiddleware', 'RateLimitService', 'ThrottleManager', 'RequestRouter', 'ApiVersionResolver', 'RequestMetricsCollector'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['USER', 'TENANT', 'API', 'IP', 'TOKEN'].forEach(scope => assert.ok(svc.RATE_LIMIT_SCOPES.includes(scope), `${scope} scope should be supported`));
  ['REQUEST_ID_GENERATION', 'CORRELATION_ID', 'AUTHENTICATION', 'TENANT_VALIDATION', 'RBAC_VALIDATION', 'RATE_LIMITING', 'PAYLOAD_VALIDATION', 'REQUEST_ROUTING', 'RESPONSE'].forEach(step => {
    assert.ok(svc.PIPELINE_STEPS.includes(step), `${step} pipeline step should be supported`);
  });
  assert.equal(global.__ARTHHRMS_API_GATEWAY_SELF_TEST__.passed, true, 'development self-test should pass');

  const policy = svc.RateLimitService.configurePolicy({
    tenantSlug: 'tabsons',
    apiCategory: 'employee_apis',
    limit: 4,
    windowSeconds: 60,
    softLimitPercent: 50
  }, ownerContext());
  assert.equal(policy.success, true, 'rate limit policy configuration should succeed');
  assert.equal(policy.policy.limit, 4);
  assert.equal(policy.governance.apiGovernancePreserved, true);

  const gatewayRequest = {
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/employees',
    apiVersion: 'v1',
    apiCategory: 'employee_apis',
    ip: '10.0.0.10',
    tokenId: 'tok-employee-api',
    headers: { 'x-client': 'platform-control' },
    payload: { tenantSlug: 'tabsons' },
    route: {
      serviceName: 'employeeDirectory',
      handler: ({ request }) => ({ success: true, data: { tenantSlug: request.tenantSlug, employees: 2 } })
    }
  };

  const first = await svc.GatewayMiddleware.processRequest(gatewayRequest, ownerContext());
  assert.equal(first.success, true, 'valid gateway request should reach the routed service');
  assert.equal(first.statusCode, 200);
  assert.ok(first.requestId, 'request id should be generated');
  assert.ok(first.correlationId, 'correlation id should be generated');
  assert.equal(first.routing.serviceName, 'employeeDirectory');
  assert.equal(first.governance.backwardCompatibilityPreserved, true);
  assert.equal(first.governance.tenantIsolationPreserved, true);
  assert.equal(first.governance.apiGovernancePreserved, true);
  assert.doesNotMatch(text(first), /tok-employee-api|secret|authorization/i, 'gateway output should not expose tokens');

  const version = svc.ApiVersionResolver.resolveVersion({ path: '/api/v2/reports', supportedVersions: ['v1', 'v2'] }, ownerContext());
  assert.equal(version.success, true);
  assert.equal(version.version, 'v2');

  const fallback = await svc.RequestRouter.routeRequest({
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/reports',
    apiCategory: 'reports',
    downstreamHealthy: false,
    fallbackRoute: {
      serviceName: 'reportFallback',
      handler: () => ({ success: true, data: { cached: true } })
    }
  }, ownerContext());
  assert.equal(fallback.success, true, 'fallback routing should work when downstream is unhealthy');
  assert.equal(fallback.routingMode, 'FALLBACK');
  assert.equal(fallback.serviceName, 'reportFallback');

  const soft = svc.RateLimitService.evaluateRateLimit({
    tenantSlug: 'tabsons',
    userId: 'PO-1',
    apiCategory: 'employee_apis',
    path: '/api/v1/employees',
    ip: '10.0.0.10',
    tokenId: 'soft-token'
  }, ownerContext());
  assert.equal(soft.success, true);
  assert.ok(['OK', 'WARNING', 'SOFT_LIMIT'].includes(soft.throttleState));
  assert.ok(soft.scopeCounters.USER >= 1, 'per-user counter should be tracked');
  assert.ok(soft.scopeCounters.TENANT >= 1, 'per-tenant counter should be tracked');
  assert.ok(soft.scopeCounters.API >= 1, 'per-api counter should be tracked');
  assert.ok(soft.scopeCounters.IP >= 1, 'per-IP counter should be tracked');
  assert.ok(soft.scopeCounters.TOKEN >= 1, 'per-token counter should be tracked');

  await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, requestSignature: 'flood-1' }, ownerContext());
  await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, requestSignature: 'flood-2' }, ownerContext());
  const limited = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, requestSignature: 'flood-3' }, ownerContext());
  assert.equal(limited.success, false, 'rate limit should block excess requests');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.error_code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(limited.retryAfterSeconds > 0, '429 response should include retry information');

  const recovered = svc.ThrottleManager.recoverThrottles({ tenantSlug: 'tabsons', force: true }, ownerContext());
  assert.equal(recovered.success, true, 'temporary throttles should recover safely');
  assert.ok(recovered.recoveredCount >= 1);

  const crossTenant = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, tenantSlug: 'abc', path: '/api/v1/employees/EMP-X', payload: { tenantSlug: 'abc', privateNote: 'never expose' } }, ownerContext('tabsons'));
  assert.equal(crossTenant.success, false, 'cross-tenant routing should be denied');
  assert.equal(crossTenant.error_code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /never expose|ABC Private/i, 'cross-tenant denials must not leak tenant data');

  const denied = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, apiCategory: 'reports', path: '/api/v1/reports/payroll' }, employeeContext());
  assert.equal(denied.success, false, 'employees should not access governed report APIs');
  assert.equal(denied.error_code, 'API_GOVERNANCE_DENIED');

  const headerInjection = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, headers: { 'x-client\r\nx-admin': 'true' } }, ownerContext());
  assert.equal(headerInjection.success, false, 'header injection should be blocked');
  assert.equal(headerInjection.error_code, 'HEADER_INJECTION_BLOCKED');

  const oversized = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, payload: { tenantSlug: 'tabsons', blob: 'x'.repeat(9000) }, maxPayloadBytes: 128 }, ownerContext());
  assert.equal(oversized.success, false, 'oversized requests should be blocked before routing');
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.error_code, 'PAYLOAD_TOO_LARGE');

  const replayOne = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, apiCategory: 'general', requestSignature: 'replay-1', tokenId: 'replay-token' }, ownerContext());
  assert.equal(replayOne.success, true);
  const replayTwo = await svc.GatewayMiddleware.processRequest({ ...gatewayRequest, apiCategory: 'general', requestSignature: 'replay-1', tokenId: 'replay-token' }, ownerContext());
  assert.equal(replayTwo.success, false, 'replayed request signatures should be blocked');
  assert.equal(replayTwo.error_code, 'REPLAY_ATTACK_BLOCKED');

  const metrics = svc.RequestMetricsCollector.collectMetrics({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(metrics.success, true);
  assertScore(metrics.apiHealthScore, 'API health score');
  assertScore(metrics.gatewayEfficiencyScore, 'gateway efficiency score');
  assertScore(metrics.securityScore, 'security score');

  const report = svc.GatewayMiddleware.generateGatewayOperationsReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'gateway operations report should render');
  assert.equal(report.architecture.apiGateway, true);
  assert.ok(report.activeApis.length >= 1, 'active APIs should be listed');
  assert.ok(report.tenantTraffic.some(row => row.tenantSlug === 'tabsons'), 'tenant traffic should be tracked');
  assertScore(report.apiHealthScore, 'report API health score');
  assertScore(report.gatewayEfficiencyScore, 'report gateway efficiency score');
  assertScore(report.securityScore, 'report security score');
  assert.doesNotMatch(text(report), /never expose|tok-employee-api|authorization|secret/i, 'reports must not expose sensitive details');

  const frozen = svc.freezeGatewayOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'gateway outputs should be deeply frozen');

  const data = global.DB.get();
  assert.ok(data.apiGatewayRequestHistory.length >= 5, 'gateway request history should be recorded');
  assert.ok(data.apiGatewayRateLimitHistory.length >= 3, 'rate-limit history should be recorded');
  assert.ok(data.apiGatewayThrottleHistory.length >= 1, 'throttle history should be recorded');
  assert.ok(data.apiGatewayRoutingHistory.length >= 2, 'routing history should be recorded');
  assert.ok(data.apiGatewaySecurityHistory.length >= 3, 'security history should be recorded');
  assert.ok(data.apiGatewayMetricsHistory.length >= 1, 'metrics history should be recorded');
  assert.ok(data.apiGatewayConfigurationHistory.length >= 1, 'configuration history should be recorded');
  assert.ok((data.auditLogs || []).some(row => /API_GATEWAY|RATE_LIMIT|THROTTLE|ROUTING/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'gateway actions should be audited');
  assert.doesNotMatch(text(data.apiGatewayRequestHistory), /tok-employee-api|never expose|ABC Private|secret|authorization/i, 'gateway histories should not persist sensitive payloads');

  console.log('apiGatewayGovernanceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
