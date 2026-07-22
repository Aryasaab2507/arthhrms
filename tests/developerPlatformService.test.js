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

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node developer platform test', platform: 'Win32' };
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

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'HR', tenantSlug = 'tabsons', id = 'HR-1', now = '2026-07-03T10:00:00.000Z') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, source: 'supabase', roleTrusted: true },
    now
  };
}

function seedDeveloperData() {
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
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', tenantSlug: 'tabsons', name: 'Asha', email: 'asha@tabsons.example', salary: 900000 },
    { id: 'EMP-ABC', empId: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', name: 'ABC Private', email: 'secret@abc.example', privateNote: 'ABC private API data' }
  ];
  data.users = [
    { id: 'USR-1', tenantSlug: 'tabsons', email: 'hr@tabsons.example', role: 'hr', password: 'LocalPasswordStillWorks!' }
  ];
  [
    'developerApiKeyHistory',
    'developerOAuthClientHistory',
    'developerApiUsageHistory',
    'developerPortalAuditHistory',
    'developerPortalAnalyticsHistory',
    'developerOpenApiHistory',
    'developerSdkHistory',
    'apiGatewayRequestHistory',
    'apiGatewayRateLimitHistory',
    'apiGatewayThrottleHistory',
    'apiGatewayRoutingHistory',
    'apiGatewaySecurityHistory',
    'apiGatewayMetricsHistory',
    'apiGatewayConfigurationHistory',
    'webhookSubscriptionHistory',
    'webhookEventHistory',
    'webhookDeliveryHistory',
    'webhookRetryHistory',
    'webhookDeadLetterHistory',
    'webhookAuditHistory',
    'webhookAnalyticsHistory',
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
    'services/validationRegistryService.js',
    'services/apiPayloadValidationService.js',
    'services/apiGatewayGovernanceService.js',
    'services/webhookPlatformService.js',
    'services/enterpriseSsoService.js',
    'services/scimProvisioningService.js'
  ].forEach(load);
  seedDeveloperData();

  const before = {
    userCount: global.DB.get().users.length,
    employeeCount: global.DB.get().employees.length,
    localPassword: global.DB.get().users.find(user => user.id === 'USR-1')?.password,
    gatewayService: global.ApiGatewayGovernanceService,
    webhookService: global.WebhookPlatformService
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/developerPlatformService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('DeveloperPlatformService should be exported');
    }
    throw error;
  }

  const svc = global.DeveloperPlatformService;
  assert.ok(svc, 'DeveloperPlatformService should be exported');
  assert.equal(global.developerPlatformService, svc, 'lowercase developer platform alias should be exported');
  assert.ok(Object.isFrozen(svc), 'developer platform export should be frozen');
  [
    'DeveloperPortalService',
    'ApiCatalogService',
    'ApiKeyManager',
    'OAuthClientManager',
    'OpenApiGenerator',
    'SdkGenerator',
    'UsageAnalyticsService'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_DEVELOPER_PLATFORM_SELF_TEST__.passed, true, 'development self-test should pass');

  const catalog = svc.ApiCatalogService.generateCatalog({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(catalog.success, true, 'API catalog should generate');
  assert.ok(catalog.publicApis.length >= 13, 'catalog should include public API modules');
  ['AUTHENTICATION', 'EMPLOYEES', 'DEPARTMENTS', 'ATTENDANCE', 'LEAVE', 'PAYROLL', 'DOCUMENTS', 'NOTIFICATIONS', 'ORGANIZATION', 'ROLES', 'PERMISSIONS', 'REPORTS', 'WEBHOOKS', 'AUDIT'].forEach(moduleName => {
    assert.ok(catalog.publicApis.some(api => api.module === moduleName), `${moduleName} should be discoverable`);
  });
  ['employees.read', 'employees.write', 'attendance.read', 'leave.write', 'documents.read', 'reports.read', 'admin.manage'].forEach(scopeName => {
    assert.ok(catalog.scopes.some(scope => scope.scope === scopeName), `${scopeName} scope should exist`);
  });
  assert.ok(catalog.versions.some(version => version.version === 'v1' && version.lifecycle === 'STABLE'), 'v1 should be stable');
  assert.ok(catalog.versions.some(version => version.version === 'v2' && ['PREVIEW', 'BETA'].includes(version.lifecycle)), 'v2 should be future-ready');
  assert.equal(catalog.governance.internalServicesExposed, false);
  assert.equal(catalog.governance.existingInternalApisPreserved, true);
  assert.doesNotMatch(text(catalog), /employeeDirectory|internalHandler|LocalPasswordStillWorks|ABC private API data|secret@abc/i, 'catalog must not expose internal services or tenant data');

  const openApi = svc.OpenApiGenerator.generateOpenApiSpec({
    tenantSlug: 'tabsons',
    version: 'v1',
    serverUrl: 'https://api.arthhrms.example'
  }, ctx('DIRECTOR'));
  assert.equal(openApi.success, true, 'OpenAPI spec should generate');
  assert.equal(openApi.spec.openapi, '3.1.0');
  assert.ok(openApi.spec.paths['/api/v1/employees'], 'OpenAPI should include employees path');
  assert.ok(openApi.spec.components.securitySchemes.ApiKeyAuth, 'OpenAPI should include API key auth');
  assert.ok(openApi.spec.components.securitySchemes.OAuth2, 'OpenAPI should include OAuth2');
  assert.doesNotMatch(text(openApi), /internalHandler|LocalPasswordStillWorks|secret|ABC private API data/i, 'OpenAPI output must be sanitized');

  const apiKey = svc.ApiKeyManager.createKey({
    tenantSlug: 'tabsons',
    name: 'Workforce Sync',
    scopes: ['employees.read', 'departments.read', 'reports.read'],
    expiresInDays: 30,
    rateLimit: { perMinute: 3, perHour: 50, perDay: 1000 }
  }, ctx('HR'));
  assert.equal(apiKey.success, true, 'API key should be created');
  assert.ok(apiKey.oneTimeSecret, 'API key secret should be returned once at creation');
  assert.equal(apiKey.key.secretExposedAfterCreation, false);
  assert.equal(apiKey.key.tenantSlug, 'tabsons');
  assert.equal(apiKey.governance.apiGovernancePreserved, true);
  assert.equal(apiKey.governance.tenantIsolationPreserved, true);
  assert.doesNotMatch(text(apiKey.key), new RegExp(apiKey.oneTimeSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'persistable key metadata must not contain raw secret');

  const validKey = svc.ApiKeyManager.validateApiKey({
    tenantSlug: 'tabsons',
    keySecret: apiKey.oneTimeSecret,
    requiredScopes: ['employees.read'],
    endpoint: '/api/v1/employees',
    method: 'GET'
  }, ctx('HR'));
  assert.equal(validKey.success, true, 'fresh API key should validate');
  assert.equal(validKey.principal.type, 'API_KEY');
  assert.equal(validKey.principal.tenantSlug, 'tabsons');

  const scopeDenied = svc.ApiKeyManager.validateApiKey({
    tenantSlug: 'tabsons',
    keySecret: apiKey.oneTimeSecret,
    requiredScopes: ['payroll.write'],
    endpoint: '/api/v1/payroll',
    method: 'POST'
  }, ctx('HR'));
  assert.equal(scopeDenied.success, false, 'scope violations should be blocked');
  assert.equal(scopeDenied.code, 'API_SCOPE_DENIED');

  const crossTenantKey = svc.ApiKeyManager.validateApiKey({
    tenantSlug: 'abc',
    keySecret: apiKey.oneTimeSecret,
    requiredScopes: ['employees.read']
  }, ctx('PLATFORM_OWNER', 'abc', 'PO-ABC'));
  assert.equal(crossTenantKey.success, false, 'API keys should not work across tenants');
  assert.equal(crossTenantKey.code, 'API_KEY_INVALID');
  assert.doesNotMatch(text(crossTenantKey), /ABC Private|ABC private API data|secret@abc/i, 'cross-tenant API key denials must not leak tenant data');

  const oauthClient = svc.OAuthClientManager.registerClient({
    tenantSlug: 'tabsons',
    name: 'Reporting Partner',
    redirectUris: ['https://partner.example.com/callback'],
    grantTypes: ['client_credentials', 'authorization_code'],
    scopes: ['reports.read', 'employees.read'],
    allowedOrigins: ['https://partner.example.com']
  }, ctx('HR'));
  assert.equal(oauthClient.success, true, 'OAuth client should register');
  assert.ok(oauthClient.oneTimeClientSecret, 'OAuth client secret should be returned once at creation');
  assert.equal(oauthClient.client.secretExposedAfterCreation, false);
  assert.doesNotMatch(text(oauthClient.client), new RegExp(oauthClient.oneTimeClientSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'OAuth client metadata must not expose raw secret');

  const issuedToken = svc.OAuthClientManager.issueClientCredentialsToken({
    tenantSlug: 'tabsons',
    clientId: oauthClient.client.clientId,
    clientSecret: oauthClient.oneTimeClientSecret,
    scopes: ['reports.read']
  }, ctx('HR'));
  assert.equal(issuedToken.success, true, 'client credentials token should issue');
  assert.ok(issuedToken.accessToken, 'OAuth token should be returned to caller once');
  assert.equal(issuedToken.tokenType, 'Bearer');

  const oauthRequest = await svc.DeveloperPortalService.processPublicApiRequest({
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/reports',
    authorization: `Bearer ${issuedToken.accessToken}`,
    query: { range: 'today' }
  }, ctx('DIRECTOR'));
  assert.equal(oauthRequest.success, true, 'OAuth-authenticated public API request should succeed');
  assert.equal(oauthRequest.statusCode, 200);
  assert.equal(oauthRequest.publicApi, true);
  assert.equal(oauthRequest.internalServiceExposed, false);
  assert.equal(oauthRequest.routing.module, 'REPORTS');
  assert.doesNotMatch(text(oauthRequest), /employeeDirectory|LocalPasswordStillWorks|ABC private API data|secret@abc/i, 'public request output must not expose internal data');

  const publicRequest = await svc.DeveloperPortalService.processPublicApiRequest({
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/employees',
    apiKey: apiKey.oneTimeSecret
  }, ctx('DIRECTOR'));
  assert.equal(publicRequest.success, true, 'API key public request should succeed');
  assert.equal(publicRequest.routing.version, 'v1');
  assert.equal(publicRequest.routing.module, 'EMPLOYEES');
  assert.equal(publicRequest.governance.existingInternalApisPreserved, true);

  const deprecatedRequest = await svc.DeveloperPortalService.processPublicApiRequest({
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/audit',
    apiKey: apiKey.oneTimeSecret
  }, ctx('DIRECTOR'));
  assert.equal(deprecatedRequest.success, false, 'restricted audit API should require admin scopes');
  assert.equal(deprecatedRequest.code, 'API_SCOPE_DENIED');

  await svc.DeveloperPortalService.processPublicApiRequest({ tenantSlug: 'tabsons', method: 'GET', path: '/api/v1/employees', apiKey: apiKey.oneTimeSecret }, ctx('DIRECTOR'));
  await svc.DeveloperPortalService.processPublicApiRequest({ tenantSlug: 'tabsons', method: 'GET', path: '/api/v1/employees', apiKey: apiKey.oneTimeSecret }, ctx('DIRECTOR'));
  const limited = await svc.DeveloperPortalService.processPublicApiRequest({
    tenantSlug: 'tabsons',
    method: 'GET',
    path: '/api/v1/employees',
    apiKey: apiKey.oneTimeSecret
  }, ctx('DIRECTOR'));
  assert.equal(limited.success, false, 'public API rate limits should be enforced');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.code, 'PUBLIC_API_RATE_LIMITED');
  assert.ok(limited.retryAfterSeconds > 0, 'rate-limit response should include retry information');

  const rotated = svc.ApiKeyManager.rotateKey({
    tenantSlug: 'tabsons',
    keyId: apiKey.key.keyId
  }, ctx('HR'));
  assert.equal(rotated.success, true, 'API key rotation should work');
  assert.ok(rotated.oneTimeSecret, 'rotated API key should return a new one-time secret');
  assert.notEqual(rotated.oneTimeSecret, apiKey.oneTimeSecret);
  const oldDenied = svc.ApiKeyManager.validateApiKey({
    tenantSlug: 'tabsons',
    keySecret: apiKey.oneTimeSecret,
    requiredScopes: ['employees.read']
  }, ctx('HR'));
  assert.equal(oldDenied.success, false, 'old rotated API key secret should no longer validate');

  const sdk = svc.SdkGenerator.generateSdkManifest({
    tenantSlug: 'tabsons',
    languages: ['javascript', 'typescript', 'python'],
    version: 'v1'
  }, ctx('DIRECTOR'));
  assert.equal(sdk.success, true, 'SDK manifest should generate');
  assert.ok(sdk.sdks.some(row => row.language === 'javascript'), 'JavaScript SDK should be ready');
  assert.ok(sdk.sdks.some(row => row.language === 'python'), 'Python SDK should be ready');
  assert.equal(sdk.sdkReadyArchitecture.cachedSpecifications, true);
  assert.doesNotMatch(text(sdk), /secret|LocalPasswordStillWorks|ABC private API data/i, 'SDK metadata must be sanitized');

  const analytics = svc.UsageAnalyticsService.generateUsageAnalytics({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(analytics.success, true, 'usage analytics should generate');
  assertScore(analytics.developerHealthScore, 'developer health score');
  assertScore(analytics.apiReliabilityScore, 'API reliability score');
  assert.ok(analytics.analytics.apiCalls >= 3, 'public API calls should be counted');
  assert.ok(analytics.analytics.rateLimitHits >= 1, 'rate-limit hits should be counted');

  const portal = svc.DeveloperPortalService.generateDeveloperPortal({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(portal.success, true, 'Developer Portal should render');
  assert.equal(portal.portal.apiCatalog, true);
  assert.equal(portal.portal.interactiveDocs, true);
  assert.equal(portal.portal.swaggerOpenApi, true);
  assert.equal(portal.portal.sdkDownloads, true);
  assert.equal(portal.portal.apiExplorer, true);
  assert.equal(portal.portal.authenticationGuide, true);
  assert.equal(portal.portal.webhooksGuide, true);
  assert.equal(portal.governance.backwardCompatibilityPreserved, true);
  assert.equal(portal.governance.tenantIsolationPreserved, true);
  assert.equal(portal.governance.apiGovernancePreserved, true);
  assert.equal(portal.governance.existingInternalApisPreserved, true);
  assert.doesNotMatch(text(portal), /LocalPasswordStillWorks|ABC private API data|secret@abc|clientSecret|oneTime|ak_live|oauth_secret/i, 'developer portal must not expose secrets or cross-tenant data');
  assert.ok(Object.isFrozen(portal) && Object.isFrozen(portal.portal), 'portal outputs should be immutable');

  const after = global.DB.get();
  assert.equal(after.users.length, before.userCount, 'developer platform must not modify users');
  assert.equal(after.employees.length, before.employeeCount, 'developer platform must not modify employees');
  assert.equal(after.users.find(user => user.id === 'USR-1')?.password, before.localPassword, 'existing local authentication must remain untouched');
  assert.equal(global.ApiGatewayGovernanceService, before.gatewayService, 'existing API gateway service must remain unchanged');
  assert.equal(global.WebhookPlatformService, before.webhookService, 'existing webhook service must remain unchanged');
  [
    'developerApiKeyHistory',
    'developerOAuthClientHistory',
    'developerApiUsageHistory',
    'developerPortalAuditHistory',
    'developerPortalAnalyticsHistory',
    'developerOpenApiHistory',
    'developerSdkHistory'
  ].forEach(key => {
    assert.ok(Array.isArray(after[key]), `${key} should exist`);
    assert.ok(after[key].length >= 1, `${key} should record rows`);
    assert.ok(after[key].every(row => row.immutable === true), `${key} rows should be immutable`);
  });
  assert.ok((after.auditLogs || []).some(row => /DEVELOPER|PUBLIC_API|OAUTH|API_KEY/.test(String(row.eventType || row.actionType || row.action || row.module || ''))), 'developer platform actions should be audited');
  assert.doesNotMatch(text(after.developerApiKeyHistory), new RegExp(apiKey.oneTimeSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'stored API key history must not contain the original raw secret');
  assert.doesNotMatch(text(after.developerApiKeyHistory), new RegExp(rotated.oneTimeSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'stored API key history must not contain the rotated raw secret');
  assert.doesNotMatch(text(after.developerOAuthClientHistory), new RegExp(oauthClient.oneTimeClientSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'stored OAuth client history must not contain raw secrets');
  assert.doesNotMatch(text(after.developerApiUsageHistory), /LocalPasswordStillWorks|ABC private API data|secret@abc|Bearer /i, 'usage history must be sanitized');

  const frozen = svc.freezeDeveloperOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'developer platform outputs should be deeply frozen');

  console.log('developerPlatformService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
