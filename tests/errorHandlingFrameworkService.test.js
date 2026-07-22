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
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){},
    removeAttribute(){},
    appendChild(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    focus(){ this.focused = true; },
    value: '',
    textContent: '',
    innerHTML: '',
    focused: false
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  const announcer = fakeEl();
  const toastHost = fakeEl();
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0',
    platform: 'Win32'
  };
  global.location = {
    href: 'https://tabsons.arthhrms.com/platform-control.html',
    origin: 'https://tabsons.arthhrms.com',
    hostname: 'tabsons.arthhrms.com',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    getElementById(id){
      if (id === 'platformA11yAnnouncements') return announcer;
      if (id === 'toast') return toastHost;
      return null;
    },
    createElement(){ return fakeEl(); },
    addEventListener(){},
    body: fakeEl(),
    documentElement: fakeEl()
  };
  global.__testAnnouncer = announcer;
  global.__testToastHost = toastHost;
}

function seedErrorData() {
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
  data.error_logs = [];
  data.errorLogs = [];
  data.auditLogs = [];
  data.operationIncidents = [];
  data.notifications = [];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  [
    'db.js',
    'services/workflowTelemetryService.js',
    'services/auditService.js',
    'services/errorService.js'
  ].forEach(load);
  seedErrorData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/errorHandlingFrameworkService.js');

  const svc = global.ErrorHandlingFrameworkService;
  assert.ok(svc, 'ErrorHandlingFrameworkService should be exported');
  assert.ok(global.ErrorLoggingService, 'ErrorLoggingService alias should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.equal(global.__ARTHHRMS_ERROR_FRAMEWORK_SELF_TEST__.passed, true, 'development self-test should pass');

  [
    'VALIDATION_ERROR',
    'AUTHENTICATION_ERROR',
    'AUTHORIZATION_ERROR',
    'RESOURCE_NOT_FOUND',
    'CONFLICT_ERROR',
    'RATE_LIMIT_ERROR',
    'NETWORK_ERROR',
    'FILE_UPLOAD_ERROR',
    'SERVER_ERROR',
    'UNKNOWN_ERROR'
  ].forEach(category => assert.ok(svc.ERROR_CATEGORIES.includes(category), `${category} should be supported`));

  ['LOADING', 'EMPTY', 'SUCCESS', 'ERROR', 'PERMISSION_DENIED', 'OFFLINE', 'MAINTENANCE'].forEach(state => {
    assert.ok(svc.UI_STATES.includes(state), `${state} UI state should be supported`);
  });

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'USR-1', role: 'HR', tenantSlug: 'tabsons' },
    module: 'Employee Import',
    action: 'validate bulk upload',
    endpoint: '/api/imports/employees'
  };

  const validation = svc.createValidationError({
    field: 'email',
    message: 'Email is required',
    value: '',
    tenantSlug: 'tabsons'
  }, context);
  assert.equal(validation.success, false);
  assert.equal(validation.error_code, 'VALIDATION_ERROR');
  assert.equal(validation.details.field, 'email');
  assert.equal(validation.ui.fieldHighlight, true);
  assert.equal(validation.ui.preventSubmit, true);
  assert.ok(Object.isFrozen(validation), 'validation output should be immutable');

  const conflict = svc.normalizeErrorPayload({
    category: 'CONFLICT_ERROR',
    message: 'Duplicate employee',
    details: { existingRecord: { employeeId: 'EMP-001', email: 'asha@example.com' } }
  }, context);
  assert.equal(conflict.ui.actions.includes('Resolve conflict'), true);
  assert.equal(conflict.error_code, 'CONFLICT_ERROR');

  const network = svc.normalizeErrorPayload(new Error('Failed to fetch because network timeout'), context);
  assert.equal(network.error_code, 'NETWORK_ERROR');
  assert.equal(network.ui.title, 'No Internet Connection');
  assert.ok(network.ui.actions.includes('Retry'));
  assert.ok(network.ui.actions.includes('Offline Mode'));

  const upload = svc.normalizeErrorPayload({ fileName: 'employees.exe', message: 'Unsupported file type' }, { ...context, action: 'upload file' });
  assert.equal(upload.error_code, 'FILE_UPLOAD_ERROR');
  assert.equal(upload.ui.title, 'Upload Failed');
  assert.ok(upload.ui.guidance.includes('CSV'));

  const serverError = new Error('SQLSTATE 23505 at C:\\secret\\internal\\db.js with salary 900000 and leaveBalance 30');
  serverError.stack = 'Error: SQLSTATE 23505\n    at C:\\secret\\internal\\db.js:10:5';
  const apiError = svc.createApiError(serverError, {
    ...context,
    metadata: {
      salary: 900000,
      leaveBalance: 30,
      tenantSlug: 'abc',
      privateNote: 'ABC confidential'
    }
  });
  assert.equal(apiError.success, false);
  assert.equal(apiError.error_code, 'SERVER_ERROR');
  assert.equal(apiError.message, 'Something went wrong. Our team has been notified.');
  assert.ok(apiError.errorReferenceId, 'server errors should expose a reference id');
  assert.doesNotMatch(JSON.stringify(apiError), /SQLSTATE|C:\\\\secret|900000|leaveBalance|ABC confidential|stack/i, 'user-facing server error must be sanitized');

  const success = svc.createApiSuccess({ employeeId: 'EMP-001' }, 'Employee Created Successfully');
  assert.deepEqual(success, { success: true, message: 'Employee Created Successfully', data: { employeeId: 'EMP-001' } });
  assert.ok(Object.isFrozen(success), 'success response should be immutable');

  const log = svc.logError(serverError, { ...context, severity: 'CRITICAL', metadata: { payroll: 'hidden', safe: 'ok' } });
  assert.equal(log.tenant_id, 'tabsons');
  assert.equal(log.user_id, 'USR-1');
  assert.equal(log.module, 'Employee Import');
  assert.equal(log.action, 'validate bulk upload');
  assert.equal(log.endpoint, '/api/imports/employees');
  assert.equal(log.error_code, 'SERVER_ERROR');
  assert.equal(log.severity, 'CRITICAL');
  assert.ok(log.stack_trace.includes('Error:'), 'stack trace should be captured in the internal log');
  assert.doesNotMatch(JSON.stringify(log.metadata), /payroll|hidden|salary|leaveBalance/i, 'log metadata should be sanitized');
  assert.ok(Object.isFrozen(log), 'logged output should be immutable');

  const data = global.DB.get();
  assert.ok(data.error_logs.length >= 1, 'error_logs records should be persisted');
  assert.ok(data.auditLogs.some(row => /ERROR_/.test(row.actionType || row.action || '')), 'error actions should be audited');

  const toast = svc.showToast({ type: 'ERROR', message: 'Operation Failed', category: 'SERVER_ERROR' }, context);
  assert.equal(toast.type, 'ERROR');
  assert.equal(global.__arthhrmsToastQueue.length >= 1, true, 'toast queue should collect feedback');
  assert.match(global.__testAnnouncer.textContent, /Operation Failed/, 'toast should announce through aria-live');

  const loading = svc.createUIState('LOADING', { variant: 'dashboard', message: 'Processing...' }, context);
  assert.equal(loading.state, 'LOADING');
  assert.equal(loading.skeleton.type, 'dashboard');
  assert.equal(loading.aria.live, 'polite');

  const empty = svc.createUIState('EMPTY', { entity: 'Employees', actionLabel: 'Add Employee' }, context);
  assert.equal(empty.title, 'No Employees');
  assert.ok(empty.illustrationPlaceholder, 'empty state should include an illustration placeholder');
  assert.ok(empty.actions.some(action => action.label === 'Add Employee'));

  const denied = svc.createUIState('PERMISSION_DENIED', {}, { ...context, actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug: 'tabsons' } });
  assert.ok(denied.actions.some(action => action.label === 'Request Access'));
  assert.ok(denied.actions.some(action => action.label === 'Contact Administrator'));

  const confirmation = svc.createConfirmationDialog({ action: 'Delete Employee', destructive: true, target: 'EMP-001' }, context);
  assert.equal(confirmation.required, true);
  assert.match(confirmation.message, /cannot be undone/i);
  assert.ok(Object.isFrozen(confirmation), 'confirmation dialog should be immutable');

  const boundary = svc.withErrorBoundary('WidgetErrorBoundary', () => {
    throw new Error('Component crashed at C:\\secret\\widget.js');
  }, context);
  assert.equal(boundary.success, false);
  assert.equal(boundary.boundary, 'WidgetErrorBoundary');
  assert.equal(boundary.ui.title, 'Unexpected Error Occurred');
  assert.ok(boundary.ui.actions.includes('Refresh Page'));
  assert.doesNotMatch(JSON.stringify(boundary), /C:\\\\secret|widget\.js|stack/i, 'boundary response must not expose internals');

  const asyncBoundary = svc.withErrorBoundary('ModuleErrorBoundary', () => Promise.reject(new Error('API failure')), context);
  assert.equal(typeof asyncBoundary.then, 'function', 'async boundary should return a promise');

  return asyncBoundary.then(asyncResult => {
    assert.equal(asyncResult.success, false);
    assert.equal(asyncResult.boundary, 'ModuleErrorBoundary');

    const report = svc.generateErrorGovernanceReport({ tenantSlug: 'tabsons' }, { actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, tenantSlug: 'tabsons' });
    assert.equal(report.success, true);
    assert.ok(report.summary.totalErrors >= 1);
    assert.ok(report.integrationHealth.auditIntegrated, 'audit integration should be visible');
    assert.ok(report.integrationHealth.runtimeHealthMonitoringPrepared, 'runtime integration should be prepared');
    assert.doesNotMatch(JSON.stringify(report), /abc|ABC confidential|900000|leaveBalance|C:\\\\secret|SQLSTATE/i, 'report must not leak cross-tenant or internal details');
    assert.ok(Object.isFrozen(report), 'report output should be immutable');

    assert.equal(typeof global.errorService.createApiError, 'function', 'legacy errorService should expose standardized helpers');
    const legacy = global.errorService.createApiError(new Error('invalid token'), context);
    assert.equal(legacy.success, false);
    assert.ok(['AUTHENTICATION_ERROR', 'UNKNOWN_ERROR'].includes(legacy.error_code));
  });
}

Promise.resolve(main()).catch(error => {
  console.error(error);
  process.exit(1);
});
