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
  global.navigator = { userAgent: 'Node API validation test', platform: 'Win32' };
  global.location = { hostname: 'tabsons.arthhrms.example', pathname: '/api/employees' };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; }, addEventListener() {},
    body: {}, documentElement: {}
  };
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'TEN-tabsons' };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', employeeId: 'EMP-1', name: 'Asha', role: 'EMPLOYEE', department: 'Engineering', tenantSlug: 'tabsons' },
    { id: 'EMP-X', empId: 'EMP-X', employeeId: 'EMP-X', name: 'ABC Private', role: 'EMPLOYEE', department: 'Finance', tenantSlug: 'abc', privateNote: 'never expose' }
  ];
  data.tenantDepartmentRecords = [
    { departmentId: 'D-ENG', departmentCode: 'ENG', departmentName: 'Engineering', tenantSlug: 'tabsons', state: 'ACTIVE' },
    { departmentId: 'D-ABC', departmentCode: 'ABC', departmentName: 'ABC Finance', tenantSlug: 'abc', state: 'ACTIVE' }
  ];
  data.workflowEvents = [
    { eventId: 'WF-1', workflowId: 'WF-1', tenantSlug: 'tabsons', state: 'PENDING' },
    { eventId: 'WF-X', workflowId: 'WF-X', tenantSlug: 'abc', state: 'PENDING' }
  ];
  data.apiValidationHistory = [];
  data.apiViolationHistory = [];
  data.apiValidationAnalytics = [];
  data.auditLogs = [];
  data.error_logs = [];
  global.DB.save(data);
}

const schema = {
  type: 'object',
  required: ['tenantSlug', 'employeeId', 'departmentId', 'email', 'role', 'profile', 'tags', 'workflowId', 'lifecycleState'],
  additionalProperties: false,
  properties: {
    tenantSlug: { type: 'string', minLength: 2, maxLength: 80, normalize: 'tenant' },
    employeeId: { type: 'string', minLength: 2, maxLength: 40 },
    departmentId: { type: 'string', minLength: 2, maxLength: 40 },
    email: { type: 'string', format: 'email', maxLength: 160, normalize: 'email' },
    role: { type: 'string', enum: ['EMPLOYEE', 'MANAGER', 'HR'], normalize: 'role' },
    workflowId: { type: 'string', maxLength: 40 },
    lifecycleState: { type: 'string', enum: ['ACTIVE', 'INACTIVE'], normalize: 'token' },
    profile: {
      type: 'object', required: ['displayName'], additionalProperties: false,
      properties: { displayName: { type: 'string', minLength: 1, maxLength: 80 }, age: { type: 'integer', minimum: 18, maximum: 100 } }
    },
    tags: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 24 } }
  }
};

const businessRules = {
  employeeField: 'employeeId',
  departmentField: 'departmentId',
  workflowField: 'workflowId',
  allowedWorkflowStates: ['PENDING'],
  lifecycleField: 'lifecycleState',
  allowedLifecycleStates: ['ACTIVE']
};

async function main() {
  setupRuntime();
  ['db.js', 'services/auditService.js', 'services/errorService.js', 'services/errorHandlingFrameworkService.js'].forEach(load);
  seedData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/apiPayloadValidationService.js');

  const svc = global.ApiPayloadValidationService;
  assert.ok(svc, 'ApiPayloadValidationService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.VALIDATION_STAGES, [
    'INCOMING_REQUEST', 'AUTHENTICATION_CHECK', 'AUTHORIZATION_CHECK', 'SCHEMA_VALIDATION',
    'FIELD_VALIDATION', 'SANITIZATION', 'NORMALIZATION', 'BUSINESS_RULE_VALIDATION', 'CONTROLLER_EXECUTION'
  ]);
  assert.equal(global.__ARTHHRMS_API_VALIDATION_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'validatePayload', 'sanitizePayload', 'normalizePayload', 'validateBusinessRules',
    'calculateRequestTrust', 'freezeValidationResult'
  ].forEach(name => assert.equal(typeof svc[name], 'function', `${name} helper should exist`));

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' },
    endpoint: '/api/employees/EMP-1',
    now: '2026-06-19T00:00:00.000Z'
  };
  const validPayload = {
    tenantSlug: 'TEN-tabsons', employeeId: 'EMP-1', departmentId: 'D-ENG',
    email: '  ASHA@EXAMPLE.COM ', role: 'hr', workflowId: 'WF-1', lifecycleState: 'active',
    profile: { displayName: '<b>Asha Engineer</b>', age: 31 }, tags: [' primary ', 'engineering']
  };

  const schemaResult = svc.validatePayload(validPayload, schema, context);
  assert.equal(schemaResult.success, true, 'schema validation should support nested objects and arrays');
  assert.ok(Object.isFrozen(schemaResult));

  const sanitized = svc.sanitizePayload(validPayload, context);
  assert.equal(sanitized.success, true, 'safe HTML should be reduced to plain text');
  assert.equal(sanitized.payload.profile.displayName, 'Asha Engineer');
  assert.ok(sanitized.events.some(event => event.code === 'HTML_REMOVED'));
  assert.equal(validPayload.profile.displayName, '<b>Asha Engineer</b>', 'sanitization must not mutate input');

  const normalized = svc.normalizePayload(sanitized.payload, schema, context);
  assert.equal(normalized.success, true);
  assert.equal(normalized.payload.tenantSlug, 'tabsons');
  assert.equal(normalized.payload.email, 'asha@example.com');
  assert.equal(normalized.payload.role, 'HR');
  assert.equal(normalized.payload.tags[0], 'primary');

  const business = svc.validateBusinessRules(normalized.payload, businessRules, context);
  assert.equal(business.success, true, 'tenant-owned employee, department, workflow, and lifecycle should validate');

  let controllerCalls = 0;
  const accepted = await svc.executeValidatedRequest(
    { payload: validPayload, tenantSlug: 'tabsons', method: 'PATCH', endpoint: '/api/employees/EMP-1' },
    { schema, businessRules, allowedRoles: ['HR', 'DIRECTOR'], maxPayloadBytes: 8192 },
    context,
    payload => { controllerCalls += 1; return { success: true, employeeId: payload.employeeId, displayName: payload.profile.displayName, email: payload.email }; }
  );
  assert.equal(accepted.success, true, 'valid request should reach controller execution');
  assert.equal(controllerCalls, 1);
  assert.equal(accepted.data.displayName, 'Asha Engineer');
  assert.equal(accepted.data.email, 'asha@example.com');
  assert.ok(Object.isFrozen(accepted));

  const missingField = { ...validPayload };
  delete missingField.email;
  const missing = await svc.executeValidatedRequest(
    { payload: missingField, tenantSlug: 'tabsons', method: 'POST', endpoint: '/api/employees' },
    { schema, businessRules, allowedRoles: ['HR'] }, context,
    () => { controllerCalls += 1; return { success: true }; }
  );
  assert.equal(missing.success, false);
  assert.equal(missing.error_code, 'VALIDATION_ERROR');
  assert.equal(missing.details.stage, 'SCHEMA_VALIDATION');
  assert.ok(missing.details.violations.some(item => item.code === 'REQUIRED_FIELD_MISSING'));
  assert.equal(controllerCalls, 1, 'invalid request must never execute the controller');

  const malformed = svc.validateApiRequest(
    { payload: '{"email":', tenantSlug: 'tabsons', endpoint: '/api/employees' },
    { schema, allowedRoles: ['HR'] }, context
  );
  assert.equal(malformed.success, false);
  assert.equal(malformed.error_code, 'VALIDATION_ERROR');
  assert.ok(malformed.details.violations.some(item => item.code === 'MALFORMED_JSON'));

  const oversized = svc.validateApiRequest(
    { payload: { tenantSlug: 'tabsons', content: 'x'.repeat(1000) }, tenantSlug: 'tabsons', endpoint: '/api/upload' },
    { schema: { type: 'object' }, allowedRoles: ['HR'], maxPayloadBytes: 128 }, context
  );
  assert.equal(oversized.success, false);
  assert.ok(oversized.details.violations.some(item => item.code === 'PAYLOAD_TOO_LARGE'));

  const xss = svc.sanitizePayload({ bio: '<script>alert(1)</script>', link: 'javascript:alert(1)' }, context);
  assert.equal(xss.success, false, 'script injection should be rejected');
  assert.ok(xss.issues.some(item => item.code === 'SCRIPT_INJECTION_DETECTED'));
  const sql = svc.sanitizePayload({ search: "' OR 1=1 --" }, context);
  assert.equal(sql.success, false, 'SQL injection patterns should be rejected');
  assert.ok(sql.issues.some(item => item.code === 'SQL_INJECTION_DETECTED'));
  const encodedXss = svc.sanitizePayload({ bio: '&lt;script&gt;alert(1)&lt;/script&gt;' }, context);
  assert.equal(encodedXss.success, false, 'encoded script injection should be rejected');
  assert.ok(encodedXss.issues.some(item => item.code === 'SCRIPT_INJECTION_DETECTED'));
  const polluted = svc.sanitizePayload(JSON.parse('{"safe":"ok","__proto__":{"admin":true}}'), context);
  assert.equal(polluted.success, false, 'prototype pollution keys should be rejected');
  assert.ok(polluted.issues.some(item => item.code === 'PROTOTYPE_POLLUTION_ATTEMPT'));

  const spoofed = svc.validateApiRequest(
    { payload: { ...validPayload, tenantSlug: 'abc', employeeId: 'EMP-X', departmentId: 'D-ABC', workflowId: 'WF-X' }, tenantSlug: 'abc', endpoint: '/api/employees/EMP-X' },
    { schema, businessRules, allowedRoles: ['HR'] }, context
  );
  assert.equal(spoofed.success, false, 'tenant spoofing must be blocked');
  assert.equal(spoofed.details.stage, 'AUTHORIZATION_CHECK');
  assert.ok(spoofed.details.violations.some(item => item.code === 'TENANT_SPOOFING_DETECTED'));

  const crossTenantEntity = svc.validateBusinessRules(
    { ...normalized.payload, employeeId: 'EMP-X', departmentId: 'D-ABC', workflowId: 'WF-X' },
    businessRules, context
  );
  assert.equal(crossTenantEntity.success, false, 'cross-tenant entities must not satisfy business validation');

  const ownerInvalid = svc.validateApiRequest(
    { payload: missingField, tenantSlug: 'tabsons', endpoint: '/api/employees' },
    { schema, businessRules, allowedRoles: ['PLATFORM_OWNER'] },
    { ...context, actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug: 'tabsons' } }
  );
  assert.equal(ownerInvalid.success, false, 'platform owner cannot bypass schema validation');

  const unauthorized = svc.validateApiRequest(
    { payload: validPayload, tenantSlug: 'tabsons', endpoint: '/api/employees?token=top-secret' },
    { schema, allowedRoles: ['DIRECTOR'] }, context
  );
  assert.equal(unauthorized.success, false);
  assert.ok(unauthorized.details.violations.some(item => item.code === 'ROLE_NOT_AUTHORIZED'));

  const trust = svc.calculateRequestTrust({ tenantSlug: 'tabsons', actorId: 'HR-1', endpoint: '/api/employees' }, context);
  assert.ok(trust.validationRiskScore >= 0 && trust.validationRiskScore <= 100);
  assert.ok(trust.requestTrustScore >= 0 && trust.requestTrustScore <= 100);

  const report = svc.generateApiValidationReport({ tenantSlug: 'tabsons' }, { ...context, actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, validatedTenantAccess: true });
  assert.equal(report.success, true);
  assert.ok(report.analytics.validationFailures >= 1);
  assert.ok(report.analytics.schemaFailures >= 1);
  assert.ok(report.analytics.sanitizationEvents >= 1);
  assert.ok(report.apiHealthScore >= 0 && report.apiHealthScore <= 100);
  assert.ok(Object.isFrozen(report));
  assert.doesNotMatch(JSON.stringify(report), /Asha Engineer|ABC Private|never expose|OR 1=1|script/i, 'reports must not expose request payloads');

  const data = global.DB.get();
  assert.ok(data.apiValidationHistory.length >= 6, 'validation history should be recorded');
  assert.ok(data.apiViolationHistory.length >= 5, 'violations should be recorded without raw payloads');
  assert.doesNotMatch(JSON.stringify(data.apiValidationHistory), /Asha Engineer|ABC Private|never expose|OR 1=1|<script/i);
  assert.doesNotMatch(JSON.stringify(data.apiValidationHistory), /top-secret|token=/i, 'endpoint query secrets must not be persisted');
  assert.ok((data.auditLogs || []).some(row => /API_|VALIDATION_|PAYLOAD_/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'validation events should be audited');

  console.log('apiPayloadValidationService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
