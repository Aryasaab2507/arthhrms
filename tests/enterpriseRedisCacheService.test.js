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
  global.navigator = { userAgent: 'Node enterprise redis cache test', platform: 'Win32' };
  global.location = {
    href: '', origin: 'https://platform.arthhrms.example', hostname: 'platform.arthhrms.example', pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
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
    companyName: 'Tabsons',
    timezone: 'Asia/Calcutta'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC confidential' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Esha Engineer', email: 'esha@example.com', department: 'Engineering', tenantSlug: 'tabsons', password: 'secret-1', token: 'tok-1', privateNote: 'tabsons-private' },
    { id: 'EMP-2', empId: 'EMP-2', employeeId: 'EMP-2', name: 'Mira Manager', email: 'mira@example.com', department: 'People', tenantSlug: 'tabsons' },
    { id: 'ABC-1', empId: 'ABC-1', employeeId: 'ABC-1', name: 'ABC Employee', email: 'abc@example.com', department: 'Finance', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-ENG', departmentCode: 'ENG', departmentName: 'Engineering', tenantSlug: 'tabsons' },
    { departmentId: 'D-PEO', departmentCode: 'PEO', departmentName: 'People', tenantSlug: 'tabsons' },
    { departmentId: 'D-ABC', departmentCode: 'ABC', departmentName: 'ABC Finance', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.permissionMatrix = [
    { permissionId: 'PERM-1', role: 'HR', capability: 'workforce_import', tenantSlug: 'tabsons' },
    { permissionId: 'PERM-ABC', role: 'HR', capability: 'abc-only', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.featureFlags = [
    { flagKey: 'advanced_okr', enabled: true, tenantSlug: 'tabsons' },
    { flagKey: 'abc_beta', enabled: true, tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.roles = [
    { roleId: 'ROLE-HR', role: 'HR', tenantSlug: 'tabsons' },
    { roleId: 'ROLE-ABC', role: 'HR', tenantSlug: 'abc', privateNote: 'ABC confidential' }
  ];
  data.dashboardPerformanceHistory = [
    { id: 'DP-1', tenantSlug: 'tabsons', performanceScore: 82, responsivenessScore: 80 },
    { id: 'DP-ABC', tenantSlug: 'abc', performanceScore: 70, privateNote: 'ABC confidential' }
  ];
  data.enterpriseCacheOperationHistory = [];
  data.enterpriseCacheInvalidationHistory = [];
  data.enterpriseCacheWarmupHistory = [];
  data.enterpriseCacheMetricsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function text(value) {
  return JSON.stringify(value);
}

async function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  ['db.js', 'services/auditService.js', 'services/validationRegistryService.js'].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseRedisCacheService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.EnterpriseRedisCacheService;
  assert.ok(svc, 'EnterpriseRedisCacheService should be exported');
  assert.ok(Object.isFrozen(svc), 'cache service export should be frozen');
  assert.equal(global.enterpriseRedisCacheService, svc, 'lowercase cache service alias should be exported');
  ['CacheService', 'CacheKeyBuilder', 'CacheManager', 'CacheInvalidator', 'CacheWarmupService', 'CacheMetricsCollector'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['employee_profiles', 'departments', 'permissions', 'roles', 'dashboard_metrics', 'organization_settings', 'feature_flags', 'lookup_tables'].forEach(domain => {
    assert.ok(svc.CACHE_DOMAINS.includes(domain), `${domain} cache domain should be supported`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_REDIS_CACHE_SELF_TEST__.passed, true, 'development self-test should pass');

  const key = svc.CacheKeyBuilder.buildKey({ tenantSlug: 'tabsons', domain: 'employee_profiles', entityId: 'EMP-1' }, ownerContext());
  assert.equal(key.success, true);
  assert.equal(key.key, 'tenant:tabsons:employee_profiles:EMP-1');
  assert.equal(key.governance.tenantIsolationPreserved, true);

  const crossTenantKey = svc.CacheKeyBuilder.buildKey({ tenantSlug: 'abc', domain: 'employee_profiles', entityId: 'ABC-1' }, ownerContext('tabsons'));
  assert.equal(crossTenantKey.success, false, 'cache key builder must reject cross-tenant keys');
  assert.equal(crossTenantKey.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenantKey), /ABC confidential|ABC Employee/i);

  const unsupported = await svc.CacheService.set({ tenantSlug: 'tabsons', domain: 'tokens', entityId: 'AUTH-1', value: { token: 'secret-token' } }, ownerContext());
  assert.equal(unsupported.success, false, 'credential-like domains are not cacheable');
  assert.equal(unsupported.governance.credentialsCachingBlocked, true);

  const write = await svc.CacheService.set({
    tenantSlug: 'tabsons',
    domain: 'employee_profiles',
    entityId: 'EMP-1',
    ttlSeconds: 1800,
    value: {
      employeeId: 'EMP-1',
      name: 'Esha Engineer',
      department: 'Engineering',
      password: 'secret-1',
      token: 'tok-1',
      nested: { apiKey: 'hidden-key', title: 'Engineer' }
    }
  }, ownerContext());
  assert.equal(write.success, true, 'cache write should succeed');
  assert.equal(write.key, 'tenant:tabsons:employee_profiles:EMP-1');
  assert.equal(write.ttlSeconds, 1800);
  assert.equal(write.governance.cacheAsidePattern, true);
  assert.equal(write.governance.credentialsCachingBlocked, true);
  assert.ok(Object.isFrozen(write));

  const hit = await svc.CacheService.get({ tenantSlug: 'tabsons', domain: 'employee_profiles', entityId: 'EMP-1' }, ownerContext());
  assert.equal(hit.success, true, 'cache read should hit after write');
  assert.equal(hit.cacheStatus, 'HIT');
  assert.equal(hit.value.employeeId, 'EMP-1');
  assert.equal(hit.value.name, 'Esha Engineer');
  assert.equal(hit.value.nested.title, 'Engineer');
  assert.equal(hit.value.password, undefined);
  assert.equal(hit.value.token, undefined);
  assert.equal(hit.value.nested.apiKey, undefined);
  assert.doesNotMatch(text(hit), /secret-1|tok-1|hidden-key/i, 'cached output should never expose credentials or token values');

  const ttlWrite = await svc.CacheService.set({
    tenantSlug: 'tabsons',
    domain: 'feature_flags',
    entityId: 'short-flag',
    ttlSeconds: 1,
    value: { flagKey: 'short-flag', enabled: true }
  }, ownerContext());
  assert.equal(ttlWrite.success, true);
  const stale = await svc.CacheService.get({ tenantSlug: 'tabsons', domain: 'feature_flags', entityId: 'short-flag' }, { ...ownerContext(), now: '2026-06-28T10:00:03.000Z' });
  assert.equal(stale.success, false, 'expired cache entries should not be served by default');
  assert.equal(stale.cacheStatus, 'STALE');
  assert.equal(stale.governance.staleDataBlocked, true);

  let loaderCalls = 0;
  const loaded = await svc.CacheManager.getOrSet({
    tenantSlug: 'tabsons',
    domain: 'departments',
    entityId: 'D-ENG',
    ttlSeconds: 3600
  }, async () => {
    loaderCalls += 1;
    return { departmentId: 'D-ENG', departmentName: 'Engineering', tenantSlug: 'tabsons' };
  }, ownerContext());
  assert.equal(loaded.success, true, 'cache-aside loader should populate a missed key');
  assert.equal(loaded.cacheStatus, 'MISS_LOADED');
  assert.equal(loaderCalls, 1);
  const loadedAgain = await svc.CacheManager.getOrSet({
    tenantSlug: 'tabsons',
    domain: 'departments',
    entityId: 'D-ENG'
  }, async () => {
    loaderCalls += 1;
    return { departmentId: 'D-ENG', departmentName: 'Engineering' };
  }, ownerContext());
  assert.equal(loadedAgain.cacheStatus, 'HIT');
  assert.equal(loaderCalls, 1, 'cache-aside loader should not be called on hit');

  const missingLoaded = await svc.CacheManager.getOrSet({
    tenantSlug: 'tabsons',
    domain: 'lookup_tables',
    entityId: 'missing-row',
    ttlSeconds: 300
  }, () => null, ownerContext());
  assert.equal(missingLoaded.success, false, 'null loader result should be negative cached');
  assert.equal(missingLoaded.cacheStatus, 'NEGATIVE_CACHED');
  assert.equal(missingLoaded.governance.cachePenetrationProtected, true);

  global.ARTHHRMS_REDIS_ADAPTER = {
    get() { throw new Error('redis network unavailable'); },
    set() { throw new Error('redis network unavailable'); },
    delete() { throw new Error('redis network unavailable'); }
  };
  const fallback = await svc.CacheManager.getOrSet({
    tenantSlug: 'tabsons',
    domain: 'roles',
    entityId: 'ROLE-HR',
    adapter: 'redis'
  }, () => ({ roleId: 'ROLE-HR', role: 'HR', tenantSlug: 'tabsons' }), ownerContext());
  assert.equal(fallback.success, true, 'Redis adapter outage should fall back to loader/database path');
  assert.equal(fallback.governance.databaseFallbackReady, true);
  assert.equal(fallback.governance.redisUnavailableHandled, true);
  delete global.ARTHHRMS_REDIS_ADAPTER;

  const warm = await svc.CacheWarmupService.warmTenantCache({
    tenantSlug: 'tabsons',
    domains: ['organization_settings', 'departments', 'roles', 'permissions', 'feature_flags', 'dashboard_metrics']
  }, ownerContext());
  assert.equal(warm.success, true, 'cache warming should succeed');
  assert.ok(warm.warmedKeys.length >= 5, 'startup warmup should preload tenant lookup and dashboard keys');
  assert.equal(warm.governance.tenantIsolationPreserved, true);
  assert.doesNotMatch(text(warm), /ABC confidential|ABC Employee/i, 'warmup output must remain tenant scoped');

  const invalidateOne = await svc.CacheInvalidator.invalidate({
    tenantSlug: 'tabsons',
    domain: 'employee_profiles',
    entityId: 'EMP-1',
    reason: 'employee update'
  }, ownerContext());
  assert.equal(invalidateOne.success, true);
  assert.equal(invalidateOne.invalidatedKeys.length, 1);
  const afterInvalidate = await svc.CacheService.get({ tenantSlug: 'tabsons', domain: 'employee_profiles', entityId: 'EMP-1' }, ownerContext());
  assert.equal(afterInvalidate.cacheStatus, 'MISS', 'selective invalidation should remove the key');

  await svc.CacheService.set({ tenantSlug: 'tabsons', domain: 'feature_flags', entityId: 'advanced_okr', value: { flagKey: 'advanced_okr', enabled: true } }, ownerContext());
  const mutationInvalidation = await svc.CacheInvalidator.invalidateAfterMutation({
    tenantSlug: 'tabsons',
    mutationType: 'FEATURE_FLAG_UPDATED',
    entityId: 'advanced_okr'
  }, ownerContext());
  assert.equal(mutationInvalidation.success, true);
  assert.ok(mutationInvalidation.invalidatedKeys.some(cacheKey => cacheKey.includes('feature_flags')), 'feature flag updates should invalidate feature flag cache keys');

  const bulk = await svc.CacheInvalidator.bulkInvalidate({
    tenantSlug: 'tabsons',
    domains: ['departments', 'permissions', 'roles'],
    reason: 'organization setup changed'
  }, ownerContext());
  assert.equal(bulk.success, true);
  assert.ok(bulk.invalidatedKeys.length >= 1, 'bulk invalidation should remove warmed organization keys');

  const metrics = svc.CacheMetricsCollector.collect({ tenantSlug: 'tabsons' }, ownerContext());
  assert.equal(metrics.success, true, 'metrics collector should return analytics');
  assert.ok(metrics.analytics.cacheHitRate >= 0 && metrics.analytics.cacheHitRate <= 100);
  assert.ok(metrics.analytics.cacheMissRate >= 0 && metrics.analytics.cacheMissRate <= 100);
  assert.ok(metrics.analytics.averageLookupTimeMs >= 0);
  assert.ok(metrics.analytics.memoryUsageBytes >= 0);
  assert.ok(metrics.cacheHealthScore >= 0 && metrics.cacheHealthScore <= 100);
  assert.ok(metrics.performanceScore >= 0 && metrics.performanceScore <= 100);
  assert.ok(metrics.optimizationScore >= 0 && metrics.optimizationScore <= 100);

  const report = svc.generateCacheOperationsReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'director should have cache operations visibility');
  assert.equal(report.architecture.cacheAsidePattern, true);
  assert.equal(report.architecture.redisCacheLayer, true);
  assert.equal(report.performance.capabilities.compression, true);
  assert.equal(report.performance.capabilities.pipelining, true);
  assert.equal(report.performance.capabilities.connectionPooling, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.credentialsCachingBlocked, true);
  assert.doesNotMatch(text(report), /ABC confidential|ABC Employee|secret-1|tok-1/i, 'operations report must be tenant scoped and redacted');
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.analytics));

  const employeeReport = svc.generateCacheOperationsReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeReport.success, false, 'employee cannot view platform cache operations');
  assert.equal(employeeReport.code, 'CACHE_GOVERNANCE_DENIED');

  const malformed = await svc.CacheService.set('bad-payload', ownerContext());
  assert.equal(malformed.success, false, 'malformed cache payload should fail safely');
  assert.ok(Object.isFrozen(malformed));

  const data = global.DB.get();
  assert.ok(data.enterpriseCacheOperationHistory.length >= 1, 'cache operation history should be persisted');
  assert.ok(data.enterpriseCacheOperationHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseCacheInvalidationHistory.length >= 2, 'cache invalidation history should be persisted');
  assert.ok(data.enterpriseCacheInvalidationHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseCacheWarmupHistory.length >= 1, 'cache warmup history should be persisted');
  assert.ok(data.enterpriseCacheWarmupHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseCacheMetricsHistory.length >= 1, 'cache metrics history should be persisted');
  assert.ok(data.enterpriseCacheMetricsHistory.every(row => row.immutable === true));
  assert.ok((data.auditLogs || []).some(row => /CACHE_(INVALIDATION|WARMUP|CONFIGURATION|FAILURE|FLUSH|WRITE|METRICS)/.test(String(row.actionType || row.action || row.type || ''))), 'cache governance actions should be audited');

  const frozen = svc.freezeCacheOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'cache outputs should be deeply frozen');

  console.log('enterpriseRedisCacheService.test.js passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
