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
  global.navigator = { userAgent: 'Node SCIM provisioning test', platform: 'Win32' };
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
    issuer: tenantSlug === 'tabsons' ? 'https://idp.tabsons.com/scim' : 'https://idp.abc.com/scim',
    actor: { id, role, tenantSlug, department: 'Identity' },
    now: '2026-07-02T12:00:00.000Z'
  };
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function text(value) {
  return JSON.stringify(value);
}

function seedScimData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private SCIM data' }
  ];
  data.users = [
    { id: 'LOCAL-1', empId: 'EMP-100', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', name: 'Local HR', email: 'local.hr@tabsons.com', role: 'hr', password: 'LocalPassword123!', activationStatus: 'Active' },
    { id: 'LOCAL-ABC', empId: 'EMP-ABC', tenantSlug: 'abc', tenantId: 'TEN-abc', name: 'ABC Private', email: 'abc.private@abc.com', role: 'hr', password: 'ABC-PRIVATE-PASSWORD' }
  ];
  data.employees = [
    { id: 'EMP-100', employeeId: 'EMP-100', tenantSlug: 'tabsons', tenantId: 'TEN-tabsons', name: 'Arya HR', email: 'arya@tabsons.com', dept: 'HR', department: 'HR', manager: 'MGR-1', desig: 'HR Lead', location: 'Mumbai', salary: 999999 },
    { id: 'EMP-ABC', employeeId: 'EMP-ABC', tenantSlug: 'abc', tenantId: 'TEN-abc', name: 'ABC Private', email: 'abc.private@abc.com', privateNote: 'ABC private SCIM data' }
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
  data.scimProviderConfigHistory = [];
  data.scimTokenHistory = [];
  data.scimUserHistory = [];
  data.scimGroupHistory = [];
  data.scimRoleMappingHistory = [];
  data.scimSyncHistory = [];
  data.scimRequestHistory = [];
  data.scimAuditHistory = [];
  data.scimAnalyticsHistory = [];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true },
    { tenantSlug: 'abc', matrixId: 'RBAC-ABC', state: 'ACTIVE', rbacAuthoritative: true, privateNote: 'ABC private SCIM data', immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.employeeLifecycleCurrent = [
    { tenantSlug: 'tabsons', employeeId: 'EMP-100', currentStatus: 'ACTIVE', version: 1, immutable: true }
  ];
  global.DB.save(data);
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
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
    'services/enterpriseSsoService.js',
    'services/employeeStatusLifecycleService.js',
    'services/permissionMatrixService.js',
    'services/apiPayloadValidationService.js'
  ].forEach(load);
  seedScimData();

  const authBefore = {
    hasAuth: !!global.authService,
    hasSso: !!global.EnterpriseSsoService,
    userCount: global.DB.get().users.length,
    employeeCount: global.DB.get().employees.length,
    localPassword: global.DB.get().users.find(user => user.id === 'LOCAL-1')?.password
  };

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/scimProvisioningService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('ScimProvisioningService should be exported');
    }
    throw error;
  }

  const svc = global.ScimProvisioningService;
  assert.ok(svc, 'ScimProvisioningService should be exported');
  assert.equal(global.scimProvisioningService, svc, 'lowercase SCIM alias should be exported');
  assert.ok(Object.isFrozen(svc), 'SCIM export should be frozen');
  ['SCIMService', 'ProvisioningEngine', 'GroupSyncService', 'AttributeMapper', 'RoleMapper', 'ProvisioningHealthService'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_SCIM_PROVISIONING_SELF_TEST__.passed, true, 'development self-test should pass');

  const provider = svc.SCIMService.configureProvider({
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    providerName: 'Okta Workforce SCIM',
    bearerToken: 'tabsons-scim-token-v1',
    tokenExpiresAt: '2027-07-02T00:00:00.000Z',
    allowedDomains: ['tabsons.com'],
    rateLimitPerMinute: 200,
    replayWindowSeconds: 300,
    enabled: true,
    attributeMapping: {
      userName: 'email',
      displayName: 'name',
      department: 'department',
      manager: 'manager',
      title: 'designation',
      employeeNumber: 'employeeId'
    },
    roleMappings: [
      { group: 'HR Team', role: 'HR' },
      { group: 'People Managers', role: 'MANAGER' },
      { group: 'Directors', role: 'DIRECTOR' }
    ]
  }, ctx());
  assert.equal(provider.success, true, 'SCIM provider should be configured');
  assert.equal(provider.provider.tenantSlug, 'tabsons');
  assert.equal(provider.provider.tokenConfigured, true);
  assert.doesNotMatch(text(provider), /tabsons-scim-token-v1|ABC private SCIM data|LocalPassword123/i, 'provider output must be sanitized');

  const schemas = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/Schemas',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1')
  }, ctx('HR'));
  assert.equal(schemas.status, 200, 'Schemas endpoint should work');
  assert.equal(schemas.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:ListResponse');
  assert.ok(schemas.body.Resources.some(row => row.id === 'urn:ietf:params:scim:schemas:core:2.0:User'), 'User schema should be published');

  const serviceProviderConfig = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/ServiceProviderConfig',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1')
  }, ctx('HR'));
  assert.equal(serviceProviderConfig.status, 200, 'ServiceProviderConfig endpoint should work');
  assert.equal(serviceProviderConfig.body.bulk.supported, true);
  assert.equal(serviceProviderConfig.body.patch.supported, true);
  assert.equal(serviceProviderConfig.body.authenticationSchemes[0].type, 'oauthbearertoken');

  const resourceTypes = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/ResourceTypes',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1')
  }, ctx('HR'));
  assert.equal(resourceTypes.status, 200, 'ResourceTypes endpoint should work');
  assert.ok(resourceTypes.body.Resources.some(row => row.name === 'User'));
  assert.ok(resourceTypes.body.Resources.some(row => row.name === 'Group'));

  const userPayload = {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User', 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'],
    externalId: 'okta-user-1',
    userName: 'new.employee@tabsons.com',
    displayName: 'New Employee',
    active: true,
    emails: [{ value: 'new.employee@tabsons.com', primary: true }],
    name: { givenName: 'New', familyName: 'Employee', formatted: 'New Employee' },
    title: 'HR Executive',
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      employeeNumber: 'EXT-001',
      department: 'HR',
      manager: { value: 'EMP-100', displayName: 'Arya HR' }
    },
    groups: [{ value: 'grp-hr', display: 'HR Team' }]
  };
  const created = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Users',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-CREATE-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: userPayload
  }, ctx('HR'));
  assert.equal(created.status, 201, 'SCIM user should be created');
  assert.equal(created.body.userName, 'new.employee@tabsons.com');
  assert.equal(created.body.active, true);
  assert.equal(created.body.meta.resourceType, 'User');
  assert.equal(created.body['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'].department, 'HR');
  assert.equal(created.provisioning.lifecycleAction, 'HIRE');
  assert.equal(created.provisioning.manualHrOnboardingPreserved, true);
  assert.equal(created.provisioning.employeeCreationRequired, true, 'SCIM creates identity records, not duplicate employees');

  const duplicate = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Users',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-CREATE-2',
    headers: bearer('tabsons-scim-token-v1'),
    body: { ...userPayload, externalId: 'okta-user-duplicate' }
  }, ctx('HR'));
  assert.equal(duplicate.status, 409, 'duplicate SCIM users should be detected');
  assert.equal(duplicate.body.scimType, 'uniqueness');

  const patched = svc.SCIMService.handleRequest({
    method: 'PATCH',
    path: `/scim/v2/Users/${created.body.id}`,
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-PATCH-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        { op: 'replace', path: 'title', value: 'Senior HR Executive' },
        { op: 'replace', path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department', value: 'People Operations' },
        { op: 'replace', path: 'active', value: false }
      ]
    }
  }, ctx('HR'));
  assert.equal(patched.status, 200, 'SCIM patch should update identity');
  assert.equal(patched.body.title, 'Senior HR Executive');
  assert.equal(patched.body.active, false);
  assert.equal(patched.provisioning.lifecycleAction, 'ACCOUNT_DISABLE');

  const reactivated = svc.ProvisioningEngine.reactivateUser({
    tenantSlug: 'tabsons',
    userId: created.body.id,
    reason: 'Identity provider re-enabled account'
  }, ctx('HR'));
  assert.equal(reactivated.success, true, 'reactivation should work');
  assert.equal(reactivated.user.active, true);
  assert.equal(reactivated.lifecycleAction, 'ACCOUNT_ENABLE');

  const group = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Groups',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-GROUP-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      externalId: 'grp-hr',
      displayName: 'HR Team',
      members: [{ value: created.body.id, display: 'New Employee' }]
    }
  }, ctx('HR'));
  assert.equal(group.status, 201, 'SCIM group should be created');
  assert.equal(group.body.displayName, 'HR Team');
  assert.equal(group.groupSync.membershipChangeCount, 1);

  const roleMapping = svc.RoleMapper.mapGroupsToRoles({
    tenantSlug: 'tabsons',
    providerId: provider.provider.providerId,
    groups: ['HR Team', 'People Managers', 'Unknown Group']
  }, ctx('HR'));
  assert.equal(roleMapping.success, true, 'role mapping should work');
  assert.deepEqual([...roleMapping.roles].sort(), ['HR', 'MANAGER']);
  assert.equal(roleMapping.unknownGroups.length, 1);
  assert.equal(roleMapping.rbacAuthoritative, true);

  const groupPatch = svc.SCIMService.handleRequest({
    method: 'PATCH',
    path: `/scim/v2/Groups/${group.body.id}`,
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-GROUP-PATCH-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        { op: 'add', path: 'members', value: [{ value: created.body.id, display: 'New Employee' }] },
        { op: 'replace', path: 'displayName', value: 'HR Team Updated' }
      ]
    }
  }, ctx('HR'));
  assert.equal(groupPatch.status, 200, 'SCIM group patch should work');
  assert.equal(groupPatch.body.displayName, 'HR Team Updated');
  assert.equal(groupPatch.groupSync.nestedGroupPrepared, true);

  const listed = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/Users',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1'),
    query: { filter: 'userName eq "new.employee@tabsons.com"', startIndex: 1, count: 10 }
  }, ctx('HR'));
  assert.equal(listed.status, 200, 'SCIM user listing should work');
  assert.equal(listed.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:ListResponse');
  assert.equal(listed.body.totalResults, 1);
  assert.equal(listed.body.Resources[0].userName, 'new.employee@tabsons.com');

  const bulk = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Bulk',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-BULK-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:BulkRequest'],
      failOnErrors: 1,
      Operations: [
        {
          method: 'POST',
          path: '/Users',
          bulkId: 'bulk-user-1',
          data: {
            userName: 'bulk.user@tabsons.com',
            displayName: 'Bulk User',
            active: true,
            emails: [{ value: 'bulk.user@tabsons.com', primary: true }],
            groups: [{ display: 'People Managers' }]
          }
        },
        {
          method: 'PATCH',
          path: `/Users/${created.body.id}`,
          data: { Operations: [{ op: 'replace', path: 'active', value: true }] }
        }
      ]
    }
  }, ctx('HR'));
  assert.equal(bulk.status, 200, 'Bulk endpoint should work');
  assert.equal(bulk.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:BulkResponse');
  assert.equal(bulk.body.Operations.length, 2);

  const badToken = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/Users',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('wrong-token')
  }, ctx('HR'));
  assert.equal(badToken.status, 401, 'invalid bearer tokens should be rejected');
  assert.equal(badToken.body.scimType, 'invalidToken');

  const replay = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Groups',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    requestId: 'REQ-GROUP-1',
    headers: bearer('tabsons-scim-token-v1'),
    body: { displayName: 'Replay Group' }
  }, ctx('HR'));
  assert.equal(replay.status, 409, 'replay requests should be rejected');
  assert.equal(replay.body.scimType, 'replay');

  const crossTenant = svc.SCIMService.handleRequest({
    method: 'POST',
    path: '/scim/v2/Users',
    tenantSlug: 'abc',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1'),
    body: { userName: 'abc.private@abc.com', displayName: 'ABC Private', active: true }
  }, ctx('HR', 'tabsons'));
  assert.equal(crossTenant.status, 403, 'cross-tenant provisioning should be blocked');
  assert.doesNotMatch(text(crossTenant), /ABC private SCIM data|abc.private/i, 'cross-tenant output must not leak tenant data');

  const rotated = svc.SCIMService.rotateToken({
    tenantSlug: 'tabsons',
    providerId: provider.provider.providerId,
    bearerToken: 'tabsons-scim-token-v2',
    tokenExpiresAt: '2027-09-02T00:00:00.000Z'
  }, ctx());
  assert.equal(rotated.success, true, 'token rotation should work');
  assert.equal(rotated.token.tokenConfigured, true);
  assert.doesNotMatch(text(rotated), /tabsons-scim-token-v2|tabsons-scim-token-v1/i, 'rotated token value must be redacted');

  const oldTokenAfterRotation = svc.SCIMService.handleRequest({
    method: 'GET',
    path: '/scim/v2/Users',
    tenantSlug: 'tabsons',
    issuer: 'https://idp.tabsons.com/scim',
    headers: bearer('tabsons-scim-token-v1')
  }, ctx('HR'));
  assert.equal(oldTokenAfterRotation.status, 401, 'old token should stop working after rotation');

  const report = svc.ProvisioningHealthService.generateProvisioningReport({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(report.success, true, 'provisioning report should generate');
  assertScore(report.analytics.provisioningHealthScore, 'provisioning health score');
  assertScore(report.analytics.identitySyncScore, 'identity sync score');
  assert.ok(report.analytics.provisionedUsers >= 2, 'provisioned users should be tracked');
  assert.ok(report.analytics.groupSyncs >= 1, 'group syncs should be tracked');
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.identityLifecycleGovernancePreserved, true);
  assert.equal(report.governance.existingAuthenticationPreserved, true);
  assert.equal(report.governance.existingSsoPreserved, true);
  assert.equal(report.governance.manualHrOnboardingPreserved, true);
  assert.ok(Object.isFrozen(report), 'report output should be immutable');
  assert.doesNotMatch(text(report), /tabsons-scim-token|ABC private SCIM data|ABC-PRIVATE-PASSWORD|LocalPassword123|999999/i, 'report must not expose secrets, credentials, PII, or cross-tenant data');

  const after = global.DB.get();
  assert.equal(after.users.length, authBefore.userCount, 'SCIM must not mutate existing auth users');
  assert.equal(after.employees.length, authBefore.employeeCount, 'SCIM must not create duplicate HR employee records');
  assert.equal(after.users.find(user => user.id === 'LOCAL-1')?.password, authBefore.localPassword, 'local auth credentials must remain untouched');
  assert.equal(authBefore.hasAuth, true, 'existing auth should still be loaded');
  assert.equal(authBefore.hasSso, true, 'existing SSO should still be loaded');
  assert.ok((after.auditLogs || []).some(row => /SCIM/.test(row.eventType || row.type || '')), 'SCIM actions should be audited');
  assert.ok((after.scimAuditHistory || []).every(row => row.immutable === true), 'SCIM audit history should be immutable');

  console.log('scimProvisioningService.test.js passed');
}

main();
