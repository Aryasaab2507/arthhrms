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
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node enterprise sso test', platform: 'Win32' };
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

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return {
    tenantSlug,
    tenantId: tenantSlug === 'tabsons' ? 'TEN-tabsons' : 'TEN-abc',
    actor: { id, role, tenantSlug, department: 'Identity' },
    now: '2026-07-01T12:00:00.000Z'
  };
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function text(value) {
  return JSON.stringify(value);
}

function seedSsoData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private identity data' }
  ];
  data.users = [
    { id: 'LOCAL-1', authUserId: 'AUTH-LOCAL-1', empId: 'EMP-100', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', name: 'Local HR', email: 'local.hr@tabsons.com', role: 'hr', activationStatus: 'Active' },
    { id: 'LOCAL-ABC', authUserId: 'AUTH-LOCAL-ABC', empId: 'EMP-ABC', tenantSlug: 'abc', tenantId: 'TEN-abc', name: 'ABC Private', email: 'abc.private@abc.com', role: 'hr', activationStatus: 'Active' }
  ];
  data.employees = [
    { id: 'EMP-100', employeeId: 'EMP-100', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', name: 'Arya HR', email: 'arya@tabsons.com', dept: 'HR', department: 'HR', manager: 'MGR-1', desig: 'HR Lead', location: 'Mumbai', salary: 999999 },
    { id: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', tenantId: 'TEN-abc', name: 'ABC Private', email: 'abc.private@abc.com', privateNote: 'ABC private identity data' }
  ];
  data.auditLogs = [];
  data.enterpriseSsoProviderHistory = [];
  data.enterpriseSsoLoginHistory = [];
  data.enterpriseSsoProvisioningHistory = [];
  data.enterpriseSsoSessionHistory = [];
  data.enterpriseSsoAuditHistory = [];
  data.enterpriseSsoAnalyticsHistory = [];
  data.enterpriseSsoSecurityHistory = [];
  data.ssoProvisionedUsers = [];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.sessionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'SESS-1', idleTimeoutMinutes: 30, absoluteLifetimeHours: 12, state: 'ACTIVE', immutable: true }
  ];
  data.loginSecurityPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'LOGIN-1', lockoutThreshold: 5, state: 'ACTIVE', immutable: true }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/supabaseClient.js',
    'services/errorService.js',
    'services/auditService.js',
    'services/authService.js',
    'services/sessionGovernanceService.js',
    'services/loginAttemptSecurityService.js',
    'services/permissionMatrixService.js'
  ].forEach(load);
  seedSsoData();

  const localAuthBefore = {
    hasAuthService: !!global.authService,
    hasLogin: typeof global.authService?.loginWithSupabase === 'function',
    userCount: global.DB.get().users.length,
    hasLocalPasswords: global.DB.get().users.some(user => Object.hasOwn(user, 'password'))
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseSsoService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('EnterpriseSsoService should be exported');
    }
    throw error;
  }

  const svc = global.EnterpriseSsoService;
  assert.ok(svc, 'EnterpriseSsoService should be exported');
  assert.equal(global.enterpriseSsoService, svc, 'lowercase SSO alias should be exported');
  assert.ok(Object.isFrozen(svc), 'enterprise SSO export should be frozen');
  ['IdentityProviderRegistry', 'SAMLService', 'OIDCService', 'OAuthService', 'ClaimMapper', 'JITProvisioningService', 'IdentityHealthService'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_SSO_SELF_TEST__.passed, true, 'development self-test should pass');

  const providers = svc.IdentityProviderRegistry.listSupportedProviders();
  ['Microsoft Entra ID', 'Okta', 'Google Workspace', 'Auth0', 'Keycloak', 'Ping Identity', 'OneLogin', 'Generic SAML Provider', 'Generic OIDC Provider'].forEach(name => {
    assert.ok(providers.some(row => row.name === name), `${name} should be supported`);
  });

  const oidcProvider = svc.IdentityProviderRegistry.configureProvider({
    tenantSlug: 'tabsons',
    providerType: 'MICROSOFT_ENTRA_ID',
    protocol: 'OIDC',
    clientId: 'client-tabsons',
    clientSecret: 'secret-value',
    issuer: 'https://login.microsoftonline.com/tabsons/v2.0',
    metadataUrl: 'https://login.microsoftonline.com/tabsons/.well-known/openid-configuration',
    certificate: 'CERTDATA',
    certificateExpiresAt: '2027-07-01T00:00:00.000Z',
    redirectUris: ['https://platform.arthhrms.example/auth/sso/callback'],
    logoutUrls: ['https://platform.arthhrms.example/logout'],
    allowedDomains: ['tabsons.com'],
    audience: 'client-tabsons',
    enabled: true,
    attributeMapping: {
      employeeId: 'employee_id',
      email: 'email',
      displayName: 'name',
      department: 'department',
      manager: 'manager',
      role: 'role',
      jobTitle: 'title',
      location: 'location',
      externalUserId: 'sub'
    }
  }, ctx());
  assert.equal(oidcProvider.success, true, 'OIDC provider should be configured');
  assert.equal(oidcProvider.provider.enabled, true);
  assert.equal(oidcProvider.provider.tenantSlug, 'tabsons');
  assert.equal(oidcProvider.provider.clientSecretConfigured, true);
  assert.doesNotMatch(text(oidcProvider), /secret-value|CERTDATA|ABC private identity data|LocalPassword123/i, 'provider output must be sanitized');
  assert.ok(Object.isFrozen(oidcProvider), 'provider output should be immutable');

  const samlProvider = svc.IdentityProviderRegistry.configureProvider({
    tenantSlug: 'tabsons',
    providerType: 'GENERIC_SAML_PROVIDER',
    protocol: 'SAML',
    issuer: 'https://idp.tabsons.com/saml',
    metadataUrl: 'https://idp.tabsons.com/metadata',
    certificate: 'SAML-CERT',
    certificateExpiresAt: '2027-07-01T00:00:00.000Z',
    redirectUris: ['https://platform.arthhrms.example/auth/saml/acs'],
    logoutUrls: ['https://platform.arthhrms.example/saml/logout'],
    allowedDomains: ['tabsons.com'],
    audience: 'arthhrms-tabsons',
    enabled: true
  }, ctx());
  assert.equal(samlProvider.success, true, 'SAML provider should be configured');

  const tenantProviders = svc.IdentityProviderRegistry.getTenantProviders({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(tenantProviders.success, true, 'tenant providers should load');
  assert.ok(tenantProviders.providers.length >= 2, 'tenant should see configured providers');
  assert.ok(tenantProviders.providers.every(row => row.tenantSlug === 'tabsons'), 'provider list must be tenant scoped');
  assert.doesNotMatch(text(tenantProviders), /secret-value|CERTDATA|SAML-CERT|ABC private identity data/i, 'tenant provider list must be sanitized and isolated');

  const crossTenantProviders = svc.IdentityProviderRegistry.getTenantProviders({ tenantSlug: 'abc' }, ctx('PLATFORM_OWNER', 'tabsons'));
  assert.equal(crossTenantProviders.success, false, 'cross-tenant provider visibility should be denied');
  assert.equal(crossTenantProviders.errorCode, 'SSO_TENANT_ACCESS_DENIED');

  const mapped = svc.ClaimMapper.mapClaims({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    claims: {
      email: 'arya@tabsons.com',
      employee_id: 'EMP-100',
      name: 'Arya HR',
      department: 'HR',
      manager: 'MGR-1',
      role: 'HR',
      title: 'HR Lead',
      location: 'Mumbai',
      sub: 'ext-arya'
    }
  }, ctx('HR'));
  assert.equal(mapped.success, true, 'claim mapping should work');
  assert.equal(mapped.identity.email, 'arya@tabsons.com');
  assert.equal(mapped.identity.employeeId, 'EMP-100');
  assert.equal(mapped.identity.externalUserId, 'ext-arya');
  assert.equal(mapped.identity.tenantSlug, 'tabsons');

  const samlLogin = svc.SAMLService.initiateSPLogin({
    tenantSlug: 'tabsons',
    providerId: samlProvider.provider.providerId,
    relayState: 'dashboard'
  }, ctx('HR'));
  assert.equal(samlLogin.success, true, 'SP-initiated SAML should start');
  assert.ok(samlLogin.state && samlLogin.requestId && samlLogin.redirectUrl, 'SAML login should include state, request, and redirect');

  const samlValidation = svc.SAMLService.validateSAMLResponse({
    tenantSlug: 'tabsons',
    providerId: samlProvider.provider.providerId,
    state: samlLogin.state,
    assertion: {
      signed: true,
      audience: 'arthhrms-tabsons',
      issuer: 'https://idp.tabsons.com/saml',
      notBefore: '2026-07-01T11:58:00.000Z',
      notOnOrAfter: '2026-07-01T12:05:00.000Z',
      nameId: 'arya@tabsons.com',
      email: 'arya@tabsons.com',
      employee_id: 'EMP-100',
      nonce: 'nonce-saml-1',
      sessionIndex: 'saml-session-1'
    }
  }, ctx('HR'));
  assert.equal(samlValidation.success, true, 'SAML assertion should validate');
  assert.equal(samlValidation.identity.email, 'arya@tabsons.com');

  const replay = svc.SAMLService.validateSAMLResponse({
    tenantSlug: 'tabsons',
    providerId: samlProvider.provider.providerId,
    state: samlLogin.state,
    assertion: {
      signed: true,
      audience: 'arthhrms-tabsons',
      issuer: 'https://idp.tabsons.com/saml',
      notBefore: '2026-07-01T11:58:00.000Z',
      notOnOrAfter: '2026-07-01T12:05:00.000Z',
      email: 'arya@tabsons.com',
      nonce: 'nonce-saml-1',
      sessionIndex: 'saml-session-1'
    }
  }, ctx('HR'));
  assert.equal(replay.success, false, 'reused SAML assertion should be blocked');
  assert.equal(replay.errorCode, 'SSO_REPLAY_DETECTED');

  const invalidTenantSaml = svc.SAMLService.validateSAMLResponse({
    tenantSlug: 'tabsons',
    providerId: samlProvider.provider.providerId,
    state: svc.SAMLService.initiateSPLogin({ tenantSlug: 'tabsons', providerId: samlProvider.provider.providerId }, ctx('HR')).state,
    assertion: {
      signed: true,
      audience: 'arthhrms-tabsons',
      issuer: 'https://idp.abc.com/saml',
      email: 'abc.private@abc.com',
      nonce: 'nonce-bad-1',
      sessionIndex: 'saml-bad-1'
    }
  }, ctx('HR'));
  assert.equal(invalidTenantSaml.success, false, 'wrong issuer or domain should be denied');
  assert.match(invalidTenantSaml.errorCode, /SSO_(ISSUER|DOMAIN|TENANT|ASSERTION)/);

  const oidcRequest = svc.OIDCService.createAuthorizationRequest({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    redirectUri: 'https://platform.arthhrms.example/auth/sso/callback',
    pkce: true
  }, ctx('HR'));
  assert.equal(oidcRequest.success, true, 'OIDC request should be created');
  assert.ok(oidcRequest.state && oidcRequest.nonce && oidcRequest.pkce?.codeChallenge && oidcRequest.pkce?.codeVerifier, 'OIDC should include state, nonce, and PKCE');

  const oidcCallback = svc.OIDCService.validateAuthorizationCodeCallback({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    code: 'auth-code-1',
    state: oidcRequest.state,
    nonce: oidcRequest.nonce,
    codeVerifier: oidcRequest.pkce.codeVerifier,
    idToken: {
      issuer: 'https://login.microsoftonline.com/tabsons/v2.0',
      audience: 'client-tabsons',
      nonce: oidcRequest.nonce,
      email: 'arya@tabsons.com',
      employee_id: 'EMP-100',
      name: 'Arya HR',
      sub: 'oidc-arya',
      exp: 1790000000
    }
  }, ctx('HR'));
  assert.equal(oidcCallback.success, true, 'OIDC callback should validate');
  assert.equal(oidcCallback.identity.externalUserId, 'oidc-arya');

  const oauthRequest = svc.OAuthService.createAuthorizationRequest({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    redirectUri: 'https://platform.arthhrms.example/auth/sso/callback',
    pkce: true,
    scopes: ['openid', 'email', 'profile']
  }, ctx('HR'));
  assert.equal(oauthRequest.success, true, 'OAuth request should be created');

  const oauthCallback = svc.OAuthService.validateAuthorizationCodeCallback({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    code: 'oauth-code-1',
    state: oauthRequest.state,
    codeVerifier: oauthRequest.pkce.codeVerifier,
    userInfo: {
      issuer: 'https://login.microsoftonline.com/tabsons/v2.0',
      audience: 'client-tabsons',
      email: 'arya@tabsons.com',
      employee_id: 'EMP-100',
      name: 'Arya HR',
      sub: 'oauth-arya'
    }
  }, ctx('HR'));
  assert.equal(oauthCallback.success, true, 'OAuth callback should validate');
  assert.equal(oauthCallback.identity.externalUserId, 'oauth-arya');

  const provisioned = svc.JITProvisioningService.provisionUser({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    identity: oidcCallback.identity,
    rules: {
      createUserOnFirstLogin: true,
      updateProfileOnLogin: true,
      deactivateUnknownUsers: false,
      defaultRole: 'employee'
    }
  }, ctx('HR'));
  assert.equal(provisioned.success, true, 'JIT provisioning should work');
  assert.match(provisioned.provisioning.status, /CREATED|UPDATED/);
  assert.equal(provisioned.provisioning.tenantSlug, 'tabsons');
  assert.equal(provisioned.provisioning.immutable, true);

  const ssoSession = svc.IdentityHealthService.createSsoSession({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    externalUserId: 'oidc-arya',
    applicationUserId: 'EMP-100',
    sessionIndex: 'oidc-session-1'
  }, ctx('HR'));
  assert.equal(ssoSession.success, true, 'SSO session should be created');
  assert.equal(ssoSession.session.enterpriseSsoSession, true);
  assert.equal(ssoSession.session.applicationSessionPrepared, true);
  assert.equal(ssoSession.session.logoutPropagationPrepared, true);

  const report = svc.IdentityHealthService.generateIdentityReport({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(report.success, true, 'identity report should generate');
  assertScore(report.analytics.identityHealthScore, 'identity health score');
  assertScore(report.analytics.authenticationSuccessRate, 'authentication success rate');
  assertScore(report.analytics.federationReadinessScore, 'federation readiness score');
  assert.equal(report.governance.localAuthenticationPreserved, true, 'local login must remain preserved');
  assert.equal(report.governance.tenantIsolationPreserved, true, 'tenant isolation must be preserved');
  assert.equal(report.governance.identityGovernancePreserved, true, 'identity governance must be preserved');
  assert.doesNotMatch(text(report), /secret-value|CERTDATA|SAML-CERT|ABC private identity data|LocalPassword123|ABC-PRIVATE-PASSWORD|999999/i, 'report must not expose secrets, PII, or cross-tenant data');
  assert.ok(Object.isFrozen(report), 'report output should be immutable');

  const expiredCert = svc.IdentityProviderRegistry.configureProvider({
    tenantSlug: 'tabsons',
    providerType: 'GENERIC_OIDC_PROVIDER',
    protocol: 'OIDC',
    clientId: 'expired-client',
    issuer: 'https://expired.tabsons.example',
    certificate: 'EXPIRED-CERT',
    certificateExpiresAt: '2025-01-01T00:00:00.000Z',
    allowedDomains: ['tabsons.com'],
    audience: 'expired-client',
    enabled: true
  }, ctx());
  assert.equal(expiredCert.success, true, 'expired cert provider can be stored for governance review');
  const expiredRequest = svc.OIDCService.createAuthorizationRequest({
    tenantSlug: 'tabsons',
    providerId: expiredCert.provider.providerId,
    redirectUri: 'https://platform.arthhrms.example/auth/sso/callback',
    pkce: true
  }, ctx('HR'));
  assert.equal(expiredRequest.success, false, 'expired certificates should block authentication');
  assert.equal(expiredRequest.errorCode, 'SSO_CERTIFICATE_EXPIRED');

  const unsupportedDomain = svc.OIDCService.validateAuthorizationCodeCallback({
    tenantSlug: 'tabsons',
    providerId: oidcProvider.provider.providerId,
    code: 'auth-code-bad-domain',
    state: svc.OIDCService.createAuthorizationRequest({
      tenantSlug: 'tabsons',
      providerId: oidcProvider.provider.providerId,
      redirectUri: 'https://platform.arthhrms.example/auth/sso/callback',
      pkce: true
    }, ctx('HR')).state,
    nonce: 'unknown-nonce',
    idToken: {
      issuer: 'https://login.microsoftonline.com/tabsons/v2.0',
      audience: 'client-tabsons',
      nonce: 'unknown-nonce',
      email: 'outsider@example.com',
      sub: 'outsider'
    }
  }, ctx('HR'));
  assert.equal(unsupportedDomain.success, false, 'unknown domains should be blocked');

  const dataAfter = global.DB.get();
  assert.equal(localAuthBefore.hasAuthService, true, 'auth service should still exist');
  assert.equal(localAuthBefore.hasLogin, true, 'enterprise Supabase authentication should remain available');
  assert.equal(dataAfter.users.length, localAuthBefore.userCount, 'SSO governance must not mutate existing local users');
  assert.equal(localAuthBefore.hasLocalPasswords, false, 'SSO fixtures must not depend on local password credentials');
  assert.equal(dataAfter.users.some(user => Object.hasOwn(user, 'password')), false, 'SSO governance must not introduce local password credentials');
  assert.ok((dataAfter.auditLogs || []).some(row => /ENTERPRISE_SSO/.test(row.eventType || row.type || '')), 'SSO actions should be audited');
  assert.ok((dataAfter.enterpriseSsoAuditHistory || []).every(row => row.immutable === true), 'SSO audit history should be immutable');

  console.log('enterpriseSsoService.test.js passed');
}

main();
