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
    global.location = { href: '', origin: 'https://pilot.example.com', pathname: '/platform-control.html', replace(url) { this.href = url; } };

    [
        'db.js',
        'services/supabaseClient.js',
        'services/errorService.js',
        'services/exportService.js',
        'services/storageService.js',
        'services/employeeService.js',
        'services/authService.js',
        'services/rbacEnforcementService.js',
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
        'services/operationsMonitoringService.js',
        'services/pilotOnboardingService.js'
    ].forEach(load);

    global.sessionStorage.setItem('currentUser', JSON.stringify({
        id: 'HR-PILOT-1',
        authUserId: 'HR-PILOT-1',
        empId: 'HR-PILOT-1',
        role: 'hr',
        tenantSlug: 'pilot-test',
        source: 'supabase',
        roleTrusted: true,
        sessionVersion: 1,
        sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600
    }));

    assert.ok(global.pilotOnboardingService, 'pilotOnboardingService should be registered');
    const fixture = global.DB.get();
    fixture.employees.push(...Array.from({ length: 5 }, (_, index) => ({
        id: `PILOT-EMP-${index + 1}`,
        empId: `PILOT-EMP-${index + 1}`,
        name: index === 0 ? 'Pilot Manager' : `Pilot Employee ${index + 1}`,
        email: `pilot.fixture.${index + 1}@example.com`,
        dept: 'Operations',
        desig: index === 0 ? 'Manager' : 'Executive',
        managerId: index === 0 ? null : 'PILOT-EMP-1',
        active: true
    })));
    global.DB.save(fixture);

    global.ARTHHRMS_CONFIG = {
        flags: {
            PRODUCTION_MODE: false,
            PILOT_MODE: true,
            DEVELOPMENT_MODE: false,
            DEMO_MODE: false,
            USE_SUPABASE_INVITES: true,
            USE_SUPABASE_AUTH: true
        },
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-test-key',
        INVITE_USER_ENDPOINT: '',
        AUTH_INVITE_REDIRECT_URL: 'https://pilot.example.com/auth-callback.html'
    };
    global.DB.setEnvironmentMode('PILOT', { role: 'platform_owner', id: 'TEST', name: 'Pilot Owner' }, 'pilot onboarding test');

    const readiness = global.pilotOnboardingService.validatePilotReadiness({ actorRole: 'platform_owner', actorId: 'TEST' });
    assert.equal(readiness.flow.length, 8, 'pilot flow should expose all activation stages');
    assert.ok(readiness.blockers.some(item => /invite endpoint/i.test(item)), 'missing invite endpoint should block controlled invite activation');
    assert.ok(readiness.dashboard.importedEmployees >= 5, 'dashboard should count existing employee records');
    assert.equal(typeof readiness.workflow.ok, 'boolean', 'workflow validation should return boolean status');

    const badPayload = [
        { empId: 'ARTH-EMP-2026-0101', fullName: 'Broken Manager', department: 'Operations', designation: 'Executive', managerId: 'ARTH-EMP-2026-9999', salary: '50000', joinDate: '2026-05-01', branch: 'HQ', shiftId: 'SH002', phone: '9000010101', email: 'broken.manager@example.com', employmentStatus: 'Active' },
        { empId: 'ARTH-EMP-2026-0100', fullName: 'Valid But Mixed', department: 'Operations', designation: 'Executive', managerId: '', salary: '50000', joinDate: '2026-05-01', branch: 'HQ', shiftId: 'SH002', phone: '9000010100', email: 'valid.mixed@example.com', employmentStatus: 'Active' }
    ];
    const validation = global.importService.validateRows('employees', badPayload);
    assert.equal(validation.summary.failedRows, 1, 'manager relationship validation should fail unsafe employee import rows');
    const staged = global.importService.stageImport('employees', validation, { actorRole: 'hr', uploadedBy: 'HR1', fileName: 'bad-employees.xlsx' });
    assert.equal(staged.blocked, false, 'validation preview can still be staged for review');
    const committed = await global.importStagingService.commitImportBatch(staged.batch.importBatchId, { actorRole: 'hr', actorId: 'HR1' });
    assert.equal(committed.blocked, true, 'pilot employee import commit should block failed rows');

    const clean = global.importService.validateRows('employees', [
        { empId: 'ARTH-EMP-2026-0102', fullName: 'Pilot Employee', department: 'Operations', designation: 'Executive', managerId: '', salary: '50000', joinDate: '2026-05-01', branch: 'HQ', shiftId: 'SH002', phone: '9000010102', email: 'pilot.employee@example.com', employmentStatus: 'Active' }
    ]);
    const cleanStage = global.importService.stageImport('employees', clean, { actorRole: 'hr', uploadedBy: 'HR1', fileName: 'clean-employees.xlsx' });
    const cleanCommit = await global.importStagingService.commitImportBatch(cleanStage.batch.importBatchId, { actorRole: 'hr', actorId: 'HR1' });
    assert.equal(cleanCommit.blocked, false, 'clean staged employee import should commit');

    const preview = global.pilotOnboardingService.previewBulkInvites({ limit: 20 });
    assert.ok(preview.totalEligible >= 1, 'bulk invite preview should find imported employees needing invites');
    assert.ok(preview.blockers.some(item => /invite endpoint/i.test(item.message)), 'bulk invite preview should surface missing endpoint blocker in pilot mode');

    let calls = 0;
    global.fetch = async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ ok: true, authUserId: '00000000-0000-4000-8000-' + String(calls).padStart(12, '0'), email: body.email }) };
    };
    const cfg = global.ARTHHRMS_CONFIG;
    cfg.INVITE_USER_ENDPOINT = 'https://functions.example.com/invite-user';
    global.ARTHHRMS_CONFIG = cfg;
    const authenticatedUser = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'hr.owner@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { role: 'hr', tenant_slug: 'pilot' },
        user_metadata: { name: 'Pilot HR' }
    };
    global.supabase = {
        createClient() {
            return {
                auth: {
                    async getSession() {
                        return {
                            data: {
                                session: {
                                    access_token: 'validated-pilot-owner-token',
                                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                                    user: authenticatedUser
                                }
                            },
                            error: null
                        };
                    },
                    async getUser() { return { data: { user: authenticatedUser }, error: null }; },
                    async signOut() { return { error: null }; }
                }
            };
        }
    };
    delete global.__arthSupabaseClient;
    const sent = await global.pilotOnboardingService.sendStagedInvites({ limit: 2, actorRole: 'hr', actorId: 'HR1' });
    assert.equal(sent.blocked, false, 'configured pilot invite batch should run');
    assert.ok(sent.sent >= 1, 'configured pilot invite batch should send at least one invite');
    assert.ok(global.DB.getOperationMetrics({ module: 'Pilot Onboarding' }).some(row => row.operation === 'bulk_invite_send'), 'bulk invite send should record monitoring metric');

    const after = global.pilotOnboardingService.getEmployeeActivationDashboard();
    assert.ok(after.pendingInvites + after.activatedUsers + after.failedInvites >= 1, 'activation dashboard should reflect invite state');

    console.log('pilotOnboarding.test.js passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
