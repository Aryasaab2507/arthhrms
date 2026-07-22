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
        'services/enterpriseTestLabService.js'
    ].forEach(load);

    assert.ok(global.enterpriseTestLabService, 'enterpriseTestLabService should be registered');
    const before = global.DB.get().employees.length;

    const sandbox = global.enterpriseTestLabService.generateTestDataset('medium');
    assert.equal(sandbox.isolated, true, 'dataset must be isolated');
    assert.ok(sandbox.data.employees.length >= 20, 'medium preset should create realistic employee volume');
    assert.ok(sandbox.data.attendance.length > sandbox.data.employees.length, 'attendance patterns should be generated');
    assert.ok(sandbox.data.payroll.length > 0, 'payroll sample records should be generated');
    assert.equal(global.DB.get().employees.length, before, 'dataset generation must not mutate live employees');

    const workflow = global.enterpriseTestLabService.runWorkflowSimulation('standard', sandbox);
    assert.ok(workflow.results.some(row => row.key === 'leave_approval_chain' && row.status === 'PASS'), 'leave workflow should pass');
    assert.ok(workflow.results.some(row => row.key === 'expense_payment_chain' && row.status === 'PASS'), 'expense workflow should pass');

    const permission = global.enterpriseTestLabService.runPermissionValidation(sandbox);
    assert.ok(permission.results.some(row => row.key === 'employee_isolation' && row.status === 'PASS'), 'employee isolation check should pass');
    assert.ok(permission.results.some(row => row.key === 'manager_team_visibility' && row.status === 'PASS'), 'manager team check should pass');

    const stress = global.enterpriseTestLabService.runStressTest('medium', sandbox);
    assert.ok(stress.observations.notificationSpike >= 100, 'medium stress should create notification spike observation');
    assert.ok(stress.results.every(row => ['PASS', 'WARNING'].includes(row.status)), 'stress should avoid hard failures in isolated mode');

    const suite = await global.enterpriseTestLabService.runEnterpriseSuite({
        preset: 'small',
        actor: { role: 'platform_owner', id: 'TEST', name: 'Test Owner' }
    });
    assert.ok(suite.testRunId, 'suite should return persisted testRunId');
    assert.ok(suite.summary.totalTests > 0, 'suite should include tests');
    assert.equal(global.DB.get().employees.length, before, 'suite must not mutate live employees');
    assert.ok(global.DB.getTestLabRuns().some(row => row.testRunId === suite.testRunId), 'suite should be logged');

    setTimeout(() => console.log('enterpriseTestLab.test.js passed'), 20);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
