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
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        remove() {},
        insertBefore() {},
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        setAttribute() {},
        removeAttribute() {},
        textContent: '',
        innerHTML: '',
        value: '',
        placeholder: '',
        firstChild: null,
        nextElementSibling: null,
        id: ''
    };
}

function load(file) {
    require(path.resolve(__dirname, '..', file));
}

async function main() {
    global.window = global;
    global.localStorage = new Store();
    global.sessionStorage = new Store();
    global.confirm = () => true;
    global.alert = () => {};
    global.document = {
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getElementById() { return null; },
        createElement() { return fakeEl(); },
        addEventListener(_event, cb) { if (typeof cb === 'function') cb(); },
        body: fakeEl(),
        documentElement: fakeEl()
    };
    global.location = { href: '', pathname: '', replace(url) { this.href = url; } };

    [
        'db.js',
        'services/supabaseClient.js',
        'services/errorService.js',
        'services/exportService.js',
        'services/storageService.js',
        'services/employeeService.js',
        'services/authService.js',
        'services/authInviteService.js',
        'services/platformGovernanceService.js',
        'services/migrationControlService.js',
        'services/deploymentSafetyService.js',
        'services/notificationService.js',
        'services/workflowEngine.js',
        'services/expenseService.js',
        'services/payrollService.js',
        'services/attendanceService.js',
        'services/leaveService.js',
        'services/importStagingService.js',
        'services/importService.js',
        'services/qaValidationService.js',
        'services/enterpriseTestLabService.js',
        'services/operationsMonitoringService.js'
    ].forEach(load);

    assert.ok(global.operationsMonitoringService, 'operationsMonitoringService should be registered');

    const health = global.operationsMonitoringService.runHealthCheck();
    assert.ok(health.modules.length >= 7, 'health check should cover core operational modules');
    assert.ok(Number.isFinite(health.score), 'health score should be numeric');

    const incident = global.operationsMonitoringService.createIncident({
        severity: 'CRITICAL',
        module: 'Payroll',
        title: 'Payroll generation failure',
        description: 'Payroll failed during smoke test',
        source: 'unit-test'
    }, { role: 'platform_owner', id: 'TEST' });
    assert.ok(incident.incidentId, 'incident should have id');
    assert.equal(global.DB.getOperationIncidents({ status: 'Open' }).length, 1, 'open incident should be tracked');

    const metric = global.operationsMonitoringService.recordPerformance({
        module: 'Payroll',
        operation: 'generatePayroll',
        durationMs: 6500,
        status: 'Slow'
    });
    assert.ok(metric.metricId, 'performance metric should have id');
    assert.ok(global.DB.getOperationIncidents({ module: 'Payroll' }).some(row => row.source === 'performance'), 'slow metric should raise performance incident');

    const error = global.operationsMonitoringService.recordError(new Error('Supabase auth unavailable'), {
        module: 'Auth',
        action: 'session-restore',
        severity: 'HIGH'
    });
    assert.ok(error.errorId, 'service error should be logged');
    assert.ok(global.DB.getServiceErrorLogs({ module: 'Auth' }).length >= 1, 'auth error should be queryable');

    const dashboard = global.operationsMonitoringService.getOperationalDashboard();
    assert.ok(dashboard.widgets.activeIncidents >= 2, 'dashboard should expose active incident count');
    assert.ok(Array.isArray(dashboard.pendingRecoveryActions), 'dashboard should include recovery actions');

    global.workflowEngine.emitWorkflowEvent(global.WORKFLOW_EVENTS.DELIVERABLE_OVERDUE, {
        actorRole: 'manager',
        actorId: 'MGR1',
        module: 'Strategic Deliverables',
        targetId: 'DEL-TEST',
        title: 'Critical deliverable overdue',
        message: 'Operations should capture critical workflow events.',
        priority: 'CRITICAL',
        suppressNotification: true
    });
    assert.ok(global.DB.getOperationIncidents({ module: 'Strategic Deliverables' }).some(row => row.source === 'workflow'), 'critical workflow events should raise incidents');
    assert.ok(global.DB.getOperationMetrics({ operation: 'workflow_event' }).length >= 1, 'workflow events should log performance metrics');

    const resolved = global.operationsMonitoringService.resolveIncident(incident.incidentId, 'Smoke resolved', { role: 'platform_owner', id: 'TEST' });
    assert.equal(resolved.status, 'Resolved', 'incident should resolve');

    const value = await global.operationsMonitoringService.trackOperation('fast-op', 'Workflow', async () => 'ok');
    assert.equal(value, 'ok', 'tracked operation should return wrapped value');
    assert.ok(global.DB.getOperationMetrics({ module: 'Workflow' }).some(row => row.operation === 'fast-op'), 'tracked operation should log metric');

    setTimeout(() => console.log('operationsMonitoring.test.js passed'), 20);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
