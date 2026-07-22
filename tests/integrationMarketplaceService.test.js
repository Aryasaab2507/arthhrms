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
  global.navigator = { userAgent: 'Node integration marketplace test', platform: 'Win32' };
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

function ctx(role = 'HR', tenantSlug = 'tabsons', id = 'HR-1', now = '2026-07-03T11:00:00.000Z') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, source: 'supabase', roleTrusted: true },
    now
  };
}

function seedIntegrationData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private integration data' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', tenantSlug: 'tabsons', name: 'Asha', email: 'asha@tabsons.example', salary: 900000 },
    { id: 'EMP-ABC', empId: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', name: 'ABC Private', email: 'secret@abc.example', privateNote: 'ABC private integration data' }
  ];
  data.users = [
    { id: 'USR-1', tenantSlug: 'tabsons', email: 'hr@tabsons.example', role: 'hr', password: 'LocalPasswordStillWorks!' }
  ];
  [
    'integrationConnectorHistory',
    'integrationConnectionHistory',
    'integrationCredentialHistory',
    'integrationSyncHistory',
    'integrationMappingHistory',
    'integrationRetryHistory',
    'integrationAuditHistory',
    'integrationAnalyticsHistory',
    'developerApiKeyHistory',
    'developerOAuthClientHistory',
    'developerApiUsageHistory',
    'developerPortalAuditHistory',
    'webhookSubscriptionHistory',
    'webhookEventHistory',
    'webhookDeliveryHistory',
    'webhookRetryHistory',
    'webhookDeadLetterHistory',
    'webhookAuditHistory',
    'apiGatewayRequestHistory',
    'apiGatewayRateLimitHistory',
    'apiGatewayThrottleHistory',
    'apiGatewayRoutingHistory',
    'apiGatewaySecurityHistory',
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
    'services/scimProvisioningService.js',
    'services/developerPlatformService.js'
  ].forEach(load);
  seedIntegrationData();

  const before = {
    userCount: global.DB.get().users.length,
    employeeCount: global.DB.get().employees.length,
    localPassword: global.DB.get().users.find(user => user.id === 'USR-1')?.password,
    apiGatewayService: global.ApiGatewayGovernanceService,
    webhookService: global.WebhookPlatformService,
    ssoService: global.EnterpriseSsoService,
    scimService: global.SCIMProvisioningService || global.ScimProvisioningService
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/integrationMarketplaceService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('IntegrationMarketplaceService should be exported');
    }
    throw error;
  }

  const svc = global.IntegrationMarketplaceService;
  assert.ok(svc, 'IntegrationMarketplaceService should be exported');
  assert.equal(global.integrationMarketplaceService, svc, 'lowercase marketplace alias should be exported');
  assert.ok(Object.isFrozen(svc), 'integration marketplace export should be frozen');
  [
    'ConnectorRegistry',
    'ConnectorManager',
    'SyncEngine',
    'CredentialVault',
    'FieldMapper',
    'IntegrationAnalyticsService',
    'MarketplaceService'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_INTEGRATION_MARKETPLACE_SELF_TEST__.passed, true, 'development self-test should pass');

  const catalog = svc.ConnectorRegistry.listConnectors({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(catalog.success, true, 'connector catalog should load');
  [
    'MICROSOFT_365', 'GOOGLE_WORKSPACE', 'SLACK', 'MICROSOFT_TEAMS', 'ZOOM',
    'JIRA', 'CONFLUENCE', 'NOTION', 'DROPBOX', 'GOOGLE_DRIVE', 'ONEDRIVE',
    'SALESFORCE', 'HUBSPOT', 'QUICKBOOKS', 'RAZORPAY', 'STRIPE', 'SAP',
    'ORACLE_HCM', 'WORKDAY', 'BAMBOOHR_MIGRATION', 'DARWINBOX_MIGRATION'
  ].forEach(connectorId => {
    assert.ok(catalog.connectors.some(row => row.connectorId === connectorId), `${connectorId} connector should be registered`);
  });
  assert.ok(catalog.connectors.every(row => row.provider && row.category && row.version && row.status && row.health), 'connector registry should expose required metadata');
  assert.equal(catalog.architecture.providerAgnostic, true);
  assert.equal(catalog.governance.integrationGovernancePreserved, true);
  assert.doesNotMatch(text(catalog), /LocalPasswordStillWorks|ABC private integration data|secret@abc/i, 'connector catalog must not leak tenant data');

  const marketplace = svc.MarketplaceService.generateMarketplace({ tenantSlug: 'tabsons', search: 'workspace' }, ctx('DIRECTOR'));
  assert.equal(marketplace.success, true, 'marketplace report should generate');
  assert.equal(marketplace.marketplace.availableApps, true);
  assert.equal(marketplace.marketplace.marketplaceSearch, true);
  assert.ok(marketplace.availableApps.length >= 20, 'marketplace should list available apps');
  assert.ok(marketplace.searchResults.some(row => /Workspace/.test(row.provider)), 'marketplace search should find workspace apps');
  assert.equal(marketplace.integrations.apiGateway, true, 'marketplace should integrate with API gateway');
  assert.equal(marketplace.integrations.webhooks, true, 'marketplace should integrate with webhooks');
  assert.equal(marketplace.integrations.sso, true, 'marketplace should see SSO integration');
  assert.equal(marketplace.integrations.scim, true, 'marketplace should see SCIM integration');
  assert.doesNotMatch(text(marketplace), /LocalPasswordStillWorks|ABC private integration data|m365-client-secret-v1/i, 'marketplace output must be sanitized');

  const credential = svc.CredentialVault.storeCredential({
    tenantSlug: 'tabsons',
    connectorId: 'MICROSOFT_365',
    authenticationType: 'OAUTH2',
    credential: {
      clientId: 'm365-client',
      clientSecret: 'm365-client-secret-v1',
      refreshToken: 'm365-refresh-token-v1',
      tenantDomain: 'tabsons.example'
    }
  }, ctx('HR'));
  assert.equal(credential.success, true, 'credential vault should store references');
  assert.equal(credential.credential.authenticationType, 'OAUTH2');
  assert.equal(credential.credential.secretStoredPlaintext, false);
  assert.ok(credential.credential.credentialRef, 'credential reference should be returned');
  assert.doesNotMatch(text(credential), /m365-client-secret-v1|m365-refresh-token-v1/i, 'credential output must not expose secrets');

  const install = svc.ConnectorManager.installConnector({
    tenantSlug: 'tabsons',
    connectorId: 'MICROSOFT_365',
    authenticationType: 'OAUTH2',
    credential: {
      clientId: 'm365-client',
      clientSecret: 'm365-client-secret-v2',
      refreshToken: 'm365-refresh-token-v2'
    },
    scopes: ['employees.read', 'documents.read'],
    syncDirection: 'TWO_WAY',
    triggers: ['WEBHOOK', 'SCHEDULE', 'MANUAL'],
    schedule: '0 */6 * * *',
    mappings: [
      { entity: 'employees', sourceField: 'mail', targetField: 'email' },
      { entity: 'departments', sourceField: 'department', targetField: 'departmentName' }
    ]
  }, ctx('HR'));
  assert.equal(install.success, true, 'connector installation should work');
  assert.equal(install.connection.connectorId, 'MICROSOFT_365');
  assert.equal(install.connection.tenantSlug, 'tabsons');
  assert.equal(install.connection.status, 'CONNECTED');
  assert.equal(install.connection.credentialPlaintextStored, false);
  assert.equal(install.governance.tenantIsolationPreserved, true);
  assert.equal(install.governance.existingApisPreserved, true);
  assert.equal(install.governance.existingWebhooksPreserved, true);
  assert.equal(install.governance.existingSsoPreserved, true);
  assert.equal(install.governance.existingScimPreserved, true);
  assert.doesNotMatch(text(install), /m365-client-secret-v2|m365-refresh-token-v2|LocalPasswordStillWorks/i, 'install output must not expose credentials');

  const mapping = svc.FieldMapper.configureMapping({
    tenantSlug: 'tabsons',
    connectionId: install.connection.connectionId,
    mappings: [
      { entity: 'employees', sourceField: 'displayName', targetField: 'name' },
      { entity: 'employees', sourceField: 'displayName', targetField: 'name' },
      { entity: 'managers', sourceField: 'manager.mail', targetField: 'managerEmail' },
      { entity: 'custom_fields', sourceField: 'extensionAttribute1', targetField: 'customField1' }
    ]
  }, ctx('HR'));
  assert.equal(mapping.success, true, 'field mapping should be configurable');
  assert.ok(mapping.duplicateMappingsSuppressed >= 1, 'duplicate mappings should be suppressed');
  ['EMPLOYEES', 'MANAGERS', 'CUSTOM_FIELDS'].forEach(entity => {
    assert.ok(mapping.mappings.some(row => row.entity === entity), `${entity} mapping should be supported`);
  });

  const sync = await svc.SyncEngine.runSync({
    tenantSlug: 'tabsons',
    connectionId: install.connection.connectionId,
    triggerType: 'MANUAL',
    syncMode: 'INCREMENTAL',
    records: [
      { externalId: 'm365-1', entity: 'employees', operation: 'UPSERT', updatedAt: '2026-07-03T10:00:00.000Z' },
      { externalId: 'm365-2', entity: 'departments', operation: 'UPSERT', updatedAt: '2026-07-03T10:01:00.000Z' },
      { externalId: 'm365-1', entity: 'employees', operation: 'UPSERT', updatedAt: '2026-07-03T09:00:00.000Z' }
    ]
  }, ctx('HR'));
  assert.equal(sync.success, true, 'manual incremental sync should work');
  assert.equal(sync.sync.syncMode, 'INCREMENTAL');
  assert.equal(sync.sync.triggerType, 'MANUAL');
  assert.ok(sync.sync.recordsProcessed >= 2, 'sync should process records');
  assert.ok(sync.sync.conflictsDetected >= 1, 'sync should detect conflicts');
  assert.equal(sync.sync.retryScheduled, false);

  const providerDown = await svc.SyncEngine.runSync({
    tenantSlug: 'tabsons',
    connectionId: install.connection.connectionId,
    triggerType: 'SCHEDULE',
    syncMode: 'BULK',
    providerStatus: 'DOWN',
    records: [{ externalId: 'm365-3', entity: 'employees', operation: 'UPSERT' }]
  }, ctx('HR'));
  assert.equal(providerDown.success, false, 'provider downtime should fail safely');
  assert.equal(providerDown.code, 'INTEGRATION_PROVIDER_UNAVAILABLE');
  assert.equal(providerDown.retry.retryScheduled, true);
  assert.equal(providerDown.retry.retryQueue, true);

  const crossTenantInstall = svc.ConnectorManager.installConnector({
    tenantSlug: 'abc',
    connectorId: 'SLACK',
    authenticationType: 'API_KEY',
    credential: { apiKey: 'abc-slack-secret', privateNote: 'ABC private integration data' }
  }, ctx('HR', 'tabsons', 'HR-1'));
  assert.equal(crossTenantInstall.success, false, 'cross-tenant connector install should be denied');
  assert.equal(crossTenantInstall.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenantInstall), /ABC private integration data|abc-slack-secret|secret@abc/i, 'cross-tenant denial must not leak tenant data');

  const crossTenantSync = await svc.SyncEngine.runSync({
    tenantSlug: 'abc',
    connectionId: install.connection.connectionId,
    triggerType: 'MANUAL',
    records: [{ externalId: 'abc-1', privateNote: 'ABC private integration data' }]
  }, ctx('HR', 'abc', 'HR-ABC'));
  assert.equal(crossTenantSync.success, false, 'connection IDs should not be usable across tenants');
  assert.ok(['INTEGRATION_CONNECTION_NOT_FOUND', 'TENANT_ACCESS_DENIED'].includes(crossTenantSync.code));
  assert.doesNotMatch(text(crossTenantSync), /ABC private integration data|EMP-ABC|secret@abc/i, 'cross-tenant sync denial must not leak tenant data');

  const rotatedCredential = svc.CredentialVault.rotateCredential({
    tenantSlug: 'tabsons',
    credentialRef: install.connection.credentialRef,
    credential: { clientSecret: 'm365-client-secret-v3', refreshToken: 'm365-refresh-token-v3' }
  }, ctx('HR'));
  assert.equal(rotatedCredential.success, true, 'credential rotation should work');
  assert.equal(rotatedCredential.credential.secretStoredPlaintext, false);
  assert.doesNotMatch(text(rotatedCredential), /m365-client-secret-v3|m365-refresh-token-v3/i, 'rotated credential output must be redacted');

  const analytics = svc.IntegrationAnalyticsService.generateAnalytics({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(analytics.success, true, 'integration analytics should generate');
  assertScore(analytics.integrationHealthScore, 'integration health score');
  assertScore(analytics.marketplaceScore, 'marketplace score');
  assertScore(analytics.reliabilityScore, 'reliability score');
  assert.ok(analytics.analytics.connectedApps >= 1, 'connected app count should be tracked');
  assert.ok(analytics.analytics.syncSuccess >= 1, 'successful syncs should be tracked');
  assert.ok(analytics.analytics.syncFailures >= 1, 'failed syncs should be tracked');

  const updatedMarketplace = svc.MarketplaceService.generateMarketplace({ tenantSlug: 'tabsons' }, ctx('DIRECTOR'));
  assert.equal(updatedMarketplace.success, true);
  assert.ok(updatedMarketplace.installedApps.some(row => row.connectionId === install.connection.connectionId), 'installed app should appear in marketplace');
  assert.ok(updatedMarketplace.syncHistory.some(row => row.connectionId === install.connection.connectionId), 'sync history should appear in marketplace');
  assert.equal(updatedMarketplace.governance.tenantIsolationPreserved, true);
  assert.equal(updatedMarketplace.governance.integrationGovernancePreserved, true);
  assert.doesNotMatch(text(updatedMarketplace), /m365-client-secret|m365-refresh-token|LocalPasswordStillWorks|ABC private integration data/i, 'marketplace reports must remain sanitized');

  const removed = svc.ConnectorManager.removeConnector({
    tenantSlug: 'tabsons',
    connectionId: install.connection.connectionId,
    reason: 'test cleanup'
  }, ctx('HR'));
  assert.equal(removed.success, true, 'connector removal should work');
  assert.equal(removed.connection.status, 'REMOVED');

  const after = global.DB.get();
  assert.equal(after.users.length, before.userCount, 'integration marketplace must not modify users');
  assert.equal(after.employees.length, before.employeeCount, 'integration marketplace must not modify employees');
  assert.equal(after.users.find(user => user.id === 'USR-1')?.password, before.localPassword, 'existing authentication credentials must remain untouched');
  assert.equal(global.ApiGatewayGovernanceService, before.apiGatewayService, 'existing public/internal API gateway service must remain unchanged');
  assert.equal(global.WebhookPlatformService, before.webhookService, 'existing webhook platform must remain unchanged');
  assert.equal(global.EnterpriseSsoService, before.ssoService, 'existing SSO service must remain unchanged');
  assert.equal(global.SCIMProvisioningService || global.ScimProvisioningService, before.scimService, 'existing SCIM service must remain unchanged');
  [
    'integrationConnectionHistory',
    'integrationCredentialHistory',
    'integrationSyncHistory',
    'integrationMappingHistory',
    'integrationRetryHistory',
    'integrationAuditHistory',
    'integrationAnalyticsHistory'
  ].forEach(key => {
    assert.ok(Array.isArray(after[key]), `${key} should exist`);
    assert.ok(after[key].length >= 1, `${key} should record rows`);
    assert.ok(after[key].every(row => row.immutable === true), `${key} rows should be immutable`);
  });
  assert.ok((after.auditLogs || []).some(row => /INTEGRATION|CONNECTOR|SYNC|CREDENTIAL/.test(String(row.eventType || row.actionType || row.action || row.module || ''))), 'integration marketplace actions should be audited');
  assert.doesNotMatch(text(after.integrationCredentialHistory), /m365-client-secret|m365-refresh-token|abc-slack-secret|LocalPasswordStillWorks/i, 'credential history must not persist raw credentials');
  assert.doesNotMatch(text(after.integrationConnectionHistory), /m365-client-secret|m365-refresh-token|ABC private integration data/i, 'connection history must be sanitized');
  assert.doesNotMatch(text(after.integrationSyncHistory), /ABC private integration data|secret@abc|900000/i, 'sync history must not leak cross-tenant or sensitive records');

  const frozen = svc.freezeIntegrationOutput({ nested: { ok: true } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'integration outputs should be deeply frozen');

  console.log('integrationMarketplaceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
