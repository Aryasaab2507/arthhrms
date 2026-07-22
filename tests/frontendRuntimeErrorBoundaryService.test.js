const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function fakeEl(tagName = 'div') {
  return {
    tagName: String(tagName).toUpperCase(), style: {}, children: [], attributes: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; }, querySelectorAll() { return []; }, focus() { this.focused = true; },
    value: '', textContent: '', innerHTML: '', focused: false, isConnected: true
  };
}

function load(file) { require(path.resolve(__dirname, '..', file)); }

function setupRuntime() {
  const listeners = {};
  const body = fakeEl('body');
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.navigator = { userAgent: 'Mozilla/5.0 Boundary Test', platform: 'Win32', onLine: true };
  global.location = { href: 'https://tabsons.arthhrms.example/hr-dashboard.html', origin: 'https://tabsons.arthhrms.example', hostname: 'tabsons.arthhrms.example', pathname: '/hr-dashboard.html', reload() {} };
  global.addEventListener = (type, handler) => { listeners[type] = handler; };
  global.removeEventListener = () => {};
  global.document = {
    readyState: 'complete', body, documentElement: fakeEl('html'),
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement(tag) { return fakeEl(tag); }, addEventListener(type, handler) { listeners[`document:${type}`] = handler; }
  };
  global.__boundaryListeners = listeners;
  global.__boundaryBody = body;
}

function seedData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = { ...(data.companySettings || {}), tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyId: 'TEN-tabsons' };
  data.frontendCrashHistory = [
    { crashId: 'CRASH-ABC', tenantSlug: 'abc', boundaryType: 'WIDGET', moduleName: 'Payroll', componentName: 'ABC Secret Salary Chart', route: '/abc', state: 'ERROR', timestamp: '2026-06-19T00:00:00.000Z', stackTrace: 'ABC confidential 90000' }
  ];
  data.frontendRecoveryHistory = [];
  data.frontendResilienceAnalytics = [];
  data.error_logs = [];
  data.auditLogs = [];
  data.notifications = [];
  global.DB.save(data);
}

async function main() {
  setupRuntime();
  ['db.js', 'services/auditService.js', 'services/errorService.js', 'services/errorHandlingFrameworkService.js'].forEach(load);
  seedData();
  global.__ARTHHRMS_DEV__ = true;
  load('services/frontendRuntimeErrorBoundaryService.js');

  const svc = global.FrontendRuntimeErrorBoundaryService;
  assert.ok(svc, 'FrontendRuntimeErrorBoundaryService should be exported');
  assert.ok(Object.isFrozen(svc), 'service export should be frozen');
  assert.deepEqual(svc.BOUNDARY_LEVELS, ['APPLICATION', 'MODULE', 'PAGE', 'WIDGET']);
  assert.deepEqual(svc.FALLBACK_STATES, ['ERROR', 'RECOVERING', 'RETRYING', 'PARTIAL_RENDER', 'OFFLINE']);
  assert.equal(global.__ARTHHRMS_FRONTEND_RESILIENCE_SELF_TEST__.passed, true, 'development self-test should pass');
  ['AppErrorBoundary', 'ModuleErrorBoundary', 'WidgetErrorBoundary', 'recoverComponent', 'generateCrashReport', 'freezeBoundaryOutput'].forEach(name => {
    assert.equal(typeof svc[name], 'function', `${name} helper should exist`);
  });

  const context = {
    tenantSlug: 'tabsons',
    actor: { id: 'HR-1', role: 'HR', tenantSlug: 'tabsons' },
    route: '/hr-dashboard.html',
    now: '2026-06-20T00:00:00.000Z'
  };

  const appSuccess = svc.AppErrorBoundary(() => ({ shell: 'alive' }), context);
  assert.deepEqual(appSuccess, { shell: 'alive' }, 'successful application render should pass through');

  const widgetFailure = svc.WidgetErrorBoundary('Workforce KPI', () => {
    const error = new Error('Salary chart failed for alice@example.com at C:\\private\\widget.js');
    error.stack = 'Error: Salary chart failed\n at C:\\private\\widget.js:10:2';
    throw error;
  }, { ...context, moduleName: 'Analytics', props: { salary: 90000, tenantSlug: 'abc' } });
  assert.equal(widgetFailure.success, false);
  assert.equal(widgetFailure.boundary.type, 'WIDGET');
  assert.equal(widgetFailure.state, 'ERROR');
  assert.equal(widgetFailure.fallback.title, 'Widget temporarily unavailable');
  assert.ok(widgetFailure.fallback.actions.some(action => action.action === 'retry'));
  assert.ok(widgetFailure.fallback.actions.some(action => action.action === 'reload_widget'));
  assert.doesNotMatch(JSON.stringify(widgetFailure), /Salary chart|alice@|C:\\private|90000|tenantSlug.*abc|stack/i, 'fallback must not expose errors or props');
  assert.ok(Object.isFrozen(widgetFailure));

  const isolated = svc.AppErrorBoundary(() => {
    const widget = svc.WidgetErrorBoundary('At Risk KPI', () => { throw new Error('widget crash'); }, context);
    return { shell: 'alive', navigation: 'alive', widget };
  }, context);
  assert.equal(isolated.shell, 'alive', 'widget failure must not crash application shell');
  assert.equal(isolated.navigation, 'alive');
  assert.equal(isolated.widget.success, false);

  const moduleFailure = svc.ModuleErrorBoundary('HR Module', () => { throw new Error('module failure'); }, context);
  assert.equal(moduleFailure.boundary.type, 'MODULE');
  assert.equal(moduleFailure.fallback.title, 'HR Module is temporarily unavailable');
  assert.ok(moduleFailure.fallback.actions.some(action => action.action === 'retry'));

  const pageFailure = svc.PageErrorBoundary('Leave Requests', () => { throw new Error('route render failed'); }, context);
  assert.equal(pageFailure.boundary.type, 'PAGE');
  assert.equal(pageFailure.state, 'ERROR');

  const appFailure = svc.AppErrorBoundary(() => { throw new Error('routing shell failed'); }, context);
  assert.equal(appFailure.boundary.type, 'APPLICATION');
  assert.equal(appFailure.fallback.title, 'Unexpected Error Occurred');
  assert.ok(appFailure.fallback.actions.some(action => action.action === 'refresh'));
  assert.ok(appFailure.fallback.actions.some(action => action.action === 'return_home'));
  assert.ok(appFailure.fallback.actions.some(action => action.action === 'report_issue'));

  const asyncFailure = await svc.ModuleErrorBoundary('Payroll Module', () => Promise.reject(new Error('async payroll failure')), context);
  assert.equal(asyncFailure.success, false, 'async rejection should be contained');
  assert.equal(asyncFailure.boundary.type, 'MODULE');

  const fullFramework = global.ErrorHandlingFrameworkService;
  const fullFrameworkAlias = global.errorHandlingFrameworkService;
  const fullLogger = global.ErrorLoggingService;
  const fullLoggerAlias = global.errorLoggingService;
  const lightweightErrorService = global.errorService;
  let lightweightCalls = 0;
  global.ErrorHandlingFrameworkService = null;
  global.errorHandlingFrameworkService = null;
  global.ErrorLoggingService = null;
  global.errorLoggingService = null;
  global.errorService = { createApiError() { lightweightCalls += 1; return { errorReferenceId: 'ERR-LIGHTWEIGHT' }; } };
  const lightweightReport = svc.generateCrashReport(new Error('lightweight shell failure'), { boundaryType: 'MODULE', moduleName: 'Attendance' }, context);
  assert.equal(lightweightCalls, 1, 'role shells should delegate to the lightweight error service');
  assert.equal(lightweightReport.errorReferenceId, 'ERR-LIGHTWEIGHT');
  global.ErrorHandlingFrameworkService = fullFramework;
  global.errorHandlingFrameworkService = fullFrameworkAlias;
  global.ErrorLoggingService = fullLogger;
  global.errorLoggingService = fullLoggerAlias;
  global.errorService = lightweightErrorService;

  let attempts = 0;
  const recovered = await svc.recoverComponent({
    boundaryId: widgetFailure.boundary.boundaryId,
    boundaryType: 'WIDGET', moduleName: 'Analytics', componentName: 'Workforce KPI', maxRetries: 2,
    retryRender() { attempts += 1; if (attempts === 1) throw new Error('first retry failed'); return { success: true, rendered: true }; }
  }, context);
  assert.equal(recovered.success, true);
  assert.equal(recovered.state, 'RECOVERED');
  assert.equal(recovered.attempts, 2);
  assert.ok(recovered.crashRecoveryScore >= 0 && recovered.crashRecoveryScore <= 100);

  const cachedRecovery = await svc.recoverComponent({
    boundaryId: moduleFailure.boundary.boundaryId, boundaryType: 'MODULE', moduleName: 'HR Module', maxRetries: 1,
    retryRender() { throw new Error('render unavailable'); },
    restoreCachedState() { return { success: true, source: 'cache' }; }
  }, context);
  assert.equal(cachedRecovery.success, true);
  assert.equal(cachedRecovery.strategy, 'RESTORE_CACHED_STATE');

  const failedRecovery = await svc.recoverComponent({
    boundaryId: pageFailure.boundary.boundaryId, boundaryType: 'PAGE', moduleName: 'Leave', maxRetries: 1,
    retryRender() { throw new Error('retry failed'); }, reloadWidget() { return { success: false }; }
  }, context);
  assert.equal(failedRecovery.success, false);
  assert.equal(failedRecovery.state, 'PARTIAL_RENDER');

  const report = svc.generateResilienceReport({ tenantSlug: 'tabsons' }, {
    ...context, actor: { id: 'PO-1', role: 'PLATFORM_OWNER' }, validatedTenantAccess: true
  });
  assert.equal(report.success, true);
  assert.ok(report.analytics.crashFrequency >= 1);
  assert.ok(report.analytics.widgetFailures >= 1);
  assert.ok(report.analytics.recoveryAttempts >= 3);
  assert.ok(report.uiResilienceScore >= 0 && report.uiResilienceScore <= 100);
  assert.ok(report.crashHealthScore >= 0 && report.crashHealthScore <= 100);
  assert.ok(report.recoveryEffectivenessScore >= 0 && report.recoveryEffectivenessScore <= 100);
  assert.doesNotMatch(JSON.stringify(report), /ABC Secret|ABC confidential|90000|Salary chart|alice@|C:\\private|stack/i, 'analytics must be tenant scoped and sanitized');
  assert.ok(Object.isFrozen(report));

  const deniedReport = svc.generateResilienceReport({ tenantSlug: 'tabsons' }, context);
  assert.equal(deniedReport.success, false, 'tenant users cannot access resilience governance analytics');

  assert.equal(typeof global.__boundaryListeners.error, 'function', 'global error listener should install');
  assert.equal(typeof global.__boundaryListeners.unhandledrejection, 'function', 'unhandled rejection listener should install');
  assert.doesNotThrow(() => global.__boundaryListeners.error({ error: new Error('global render failure'), filename: 'C:\\private\\app.js', preventDefault() {} }));
  assert.doesNotThrow(() => global.__boundaryListeners.unhandledrejection({ reason: new Error('async rejection'), preventDefault() {} }));

  const data = global.DB.get();
  assert.ok(data.frontendCrashHistory.filter(row => row.tenantSlug === 'tabsons').length >= 7, 'tenant crash history should be recorded');
  assert.ok(data.frontendRecoveryHistory.length >= 4, 'recovery attempts should be recorded immutably');
  assert.ok(data.error_logs.length >= 1, 'error logging framework should capture runtime failures');
  assert.ok(data.auditLogs.some(row => /BOUNDARY|RUNTIME|RECOVERY|CRASH/i.test([row.actionType, row.action, row.module, row.description].join(' '))), 'runtime failures and recovery should be audited');

  console.log('frontendRuntimeErrorBoundaryService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
