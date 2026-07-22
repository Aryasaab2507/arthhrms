// Supabase migration control service.
// Coordinates live table readiness without removing the local DB fallback.
(function (global) {
    function db() { return global.DB; }
    function supabaseSvc() { return global.supabaseClientService; }
    function client() { return supabaseSvc()?.getClient?.() || null; }

    const LIVE_CORE_ORDER = ['employees', 'attendance', 'leaveRequests', 'expenseClaims', 'payroll'];

    function nowIso() {
        return new Date().toISOString();
    }

    function actor(input = {}) {
        if (typeof input === 'string') return { role: '', id: '', name: input, source: '', roleTrusted: false };
        const user = input && Object.keys(input).length ? input : (global.authService?.getCurrentUser?.() || {});
        return {
            role: user.role || '',
            id: user.id || user.empId || user.email || '',
            name: user.name || user.email || user.id || '',
            source: user.source || '',
            roleTrusted: user.roleTrusted === true
        };
    }

    function requirePlatform(input, action = 'manage') {
        const currentActor = actor(input);
        if (!global.rbacEnforcementService?.requireAccess) throw new Error('RBAC enforcement service is unavailable.');
        global.rbacEnforcementService.requireAccess({ resource: 'platform_governance', action, actor: currentActor });
        return currentActor;
    }

    function config() {
        return supabaseSvc()?.readConfig?.() || { flags: {} };
    }

    function hasClient() {
        return !!client();
    }

    function timeoutMs() {
        return Number(config().SUPABASE_TIMEOUT_MS || 10000);
    }

    async function withTimeout(operation, label) {
        if (global.errorService?.withTimeout) return global.errorService.withTimeout(operation, timeoutMs(), label);
        return operation;
    }

    function definitions() {
        return db().getMigrationModuleDefinitions ? db().getMigrationModuleDefinitions() : {};
    }

    function state() {
        return db().getMigrationState();
    }

    function moduleRow(moduleKey) {
        return state().modules[moduleKey] || null;
    }

    function dependencyStatus(moduleKey) {
        const modules = state().modules || {};
        const row = modules[moduleKey];
        const deps = (row?.dependencies || []).map(key => modules[key]).filter(Boolean);
        const missing = deps.filter(dep => !['HYBRID', 'LIVE'].includes(dep.mode) || dep.health !== 'HEALTHY');
        return {
            ok: missing.length === 0,
            dependencies: deps.map(dep => ({ moduleKey: dep.moduleKey, label: dep.label, mode: dep.mode, health: dep.health })),
            missing: missing.map(dep => dep.label || dep.moduleKey)
        };
    }

    async function verifyConnectivity() {
        if (!supabaseSvc()?.hasConfig?.()) return { ok: false, health: 'FAILED', reason: 'Supabase config missing' };
        if (!hasClient()) return { ok: false, health: 'FAILED', reason: 'Supabase JS library not loaded' };
        try {
            const result = supabaseSvc().healthCheck ? await supabaseSvc().healthCheck() : { ok: true };
            return result.ok ? { ok: true, health: 'HEALTHY', checkedAt: nowIso() } : { ok: false, health: 'FAILED', reason: result.reason || 'Connectivity check failed', checkedAt: nowIso() };
        } catch (err) {
            return { ok: false, health: 'FAILED', reason: err.message || String(err), checkedAt: nowIso() };
        }
    }

    async function verifyTable(tableName) {
        if (!tableName) return { table: tableName, ok: true, skipped: true, message: 'No SQL table check required' };
        if (!hasClient()) return { table: tableName, ok: false, reason: 'Supabase client unavailable' };
        try {
            const query = client().from(tableName).select('*', { count: 'exact', head: true });
            const { error, count } = await withTimeout(query, 'Verify table ' + tableName);
            if (error) {
                return {
                    table: tableName,
                    ok: false,
                    reason: error.message || 'Table check failed',
                    code: error.code || ''
                };
            }
            return { table: tableName, ok: true, count: Number(count || 0) };
        } catch (err) {
            return { table: tableName, ok: false, reason: err.message || String(err) };
        }
    }

    async function verifyModule(moduleKey, options = {}) {
        const verifiedActor = requirePlatform(options.actor, 'read');
        const row = moduleRow(moduleKey);
        if (!row) return { ok: false, moduleKey, health: 'FAILED', reason: 'Unknown migration module' };
        const connectivity = await verifyConnectivity();
        if (!connectivity.ok) {
            const result = { ok: false, moduleKey, health: 'FAILED', status: 'Connectivity Failed', reason: connectivity.reason, checkedAt: nowIso(), connectivity };
            db().recordMigrationHealth(moduleKey, result, verifiedActor);
            return result;
        }
        const tableHealth = [];
        for (const tableName of row.tables || []) {
            tableHealth.push(await verifyTable(tableName));
        }
        const tablesRequired = (row.tables || []).length > 0;
        const okTables = tableHealth.filter(t => t.ok).length;
        const failedTables = tableHealth.filter(t => !t.ok);
        const ok = tablesRequired ? failedTables.length === 0 : true;
        const result = {
            ok,
            moduleKey,
            health: ok ? 'HEALTHY' : (okTables ? 'PARTIAL' : 'FAILED'),
            status: ok ? 'Verified' : 'Table Verification Failed',
            checkedAt: nowIso(),
            tableHealth,
            connectivity,
            insertTest: options.insertTest ? {
                skipped: true,
                reason: 'Write probes are intentionally disabled in the browser migration controller. Run insert tests only in an isolated Supabase branch or SQL transaction.'
            } : { skipped: true }
        };
        if (!ok) result.reason = failedTables.map(t => `${t.table}: ${t.reason || t.code || 'failed'}`).join('; ');
        db().recordMigrationHealth(moduleKey, result, verifiedActor);
        return result;
    }

    async function runHealthChecks(options = {}) {
        const verifiedActor = requirePlatform(options.actor, 'read');
        const modules = db().getMigrationModules();
        const connectivity = await verifyConnectivity();
        const results = [];
        for (const row of modules) {
            if (row.tables && row.tables.length) results.push(await verifyModule(row.moduleKey, { actor: verifiedActor }));
            else {
                const result = {
                    ok: false,
                    moduleKey: row.moduleKey,
                    health: connectivity.ok ? 'CHECKLIST' : 'FAILED',
                    status: connectivity.ok ? 'Manual SQL Checklist Required' : 'Connectivity Failed',
                    checkedAt: nowIso(),
                    tableHealth: [],
                    reason: connectivity.reason || '',
                    rlsStatus: row.moduleKey.includes('rls') || row.moduleKey.includes('security') ? 'Use context/sql/security_policy_tests.sql after policies are applied' : 'Not Directly Tested'
                };
                db().recordMigrationHealth(row.moduleKey, result, verifiedActor);
                results.push(result);
            }
        }
        return {
            checkedAt: nowIso(),
            connectivity,
            results,
            summary: db().getMigrationHealthSummary()
        };
    }

    function canActivate(moduleKey, mode) {
        const nextMode = String(mode || '').toUpperCase();
        const row = moduleRow(moduleKey);
        if (!row) return { ok: false, reason: 'Unknown migration module' };
        if (nextMode === 'LOCAL') return { ok: true };
        if (!supabaseSvc()?.hasConfig?.()) return { ok: false, reason: 'Supabase config is missing' };
        if (row.health !== 'HEALTHY') return { ok: false, reason: 'Run and pass module verification before enabling ' + nextMode };
        const deps = dependencyStatus(moduleKey);
        if (nextMode === 'LIVE' && !deps.ok) return { ok: false, reason: 'Dependencies must be HYBRID/LIVE and healthy first: ' + deps.missing.join(', ') };
        return { ok: true, dependencies: deps.dependencies };
    }

    function setModuleMode(moduleKey, mode, note = '', actorInput = {}) {
        const verifiedActor = requirePlatform(actorInput, 'manage');
        const nextMode = String(mode || '').toUpperCase();
        const readiness = canActivate(moduleKey, nextMode);
        if (!readiness.ok) {
            db().logMigrationEvent({
                moduleKey,
                eventType: 'MIGRATION_MODE_BLOCKED',
                status: 'Blocked',
                message: readiness.reason,
                actor: verifiedActor,
                metadata: { requestedMode: nextMode }
            });
            return { ok: false, blocked: true, reason: readiness.reason };
        }
        return db().setModuleMigrationMode(moduleKey, nextMode, verifiedActor, note);
    }

    function forceLocalFallback(moduleKey, reason = '', actorInput = {}) {
        return db().recordMigrationFallback(moduleKey, reason || 'Manual fallback from Platform Control Center', requirePlatform(actorInput, 'manage'));
    }

    function getImportReadiness(importType, rowCount) {
        return db().getImportReadiness(importType, rowCount);
    }

    function assertImportReady(importType, rowCount) {
        const readiness = getImportReadiness(importType, rowCount);
        if (!readiness.ok) {
            db().logMigrationEvent({
                moduleKey: readiness.moduleKey || importType,
                eventType: 'IMPORT_SAFETY_LOCK',
                status: 'Blocked',
                message: readiness.reason || 'Import blocked by migration readiness lock',
                actor: actor(),
                metadata: readiness
            });
        }
        return readiness;
    }

    function getModuleStatusStrategy() {
        return LIVE_CORE_ORDER.map(moduleKey => {
            const row = moduleRow(moduleKey);
            return {
                moduleKey,
                label: row?.label || moduleKey,
                mode: row?.mode || 'LOCAL',
                health: row?.health || 'UNKNOWN',
                nextSafeStep: row?.mode === 'LOCAL' ? 'Verify table then enable HYBRID' : row?.mode === 'HYBRID' ? 'Run workflow tests then enable LIVE' : 'Monitor health and fallback logs'
            };
        });
    }

    function validateRlsReadiness() {
        const modules = state().modules || {};
        const required = ['employees', 'attendance', 'leaveRequests', 'expenseClaims', 'payroll'];
        const rows = required.map(key => ({
            moduleKey: key,
            label: modules[key]?.label || key,
            mode: modules[key]?.mode || 'LOCAL',
            health: modules[key]?.health || 'UNKNOWN',
            rlsValidation: modules[key]?.health === 'HEALTHY'
                ? 'Ready for role-isolation SQL tests'
                : 'Verify table health before RLS role tests'
        }));
        return {
            ok: rows.every(row => row.health === 'HEALTHY'),
            rows,
            checklist: [
                'employee cannot fetch another employee payroll',
                'manager sees only reporting team records',
                'HR/Admin broad operational access works',
                'super_admin and platform_owner governance paths work'
            ]
        };
    }

    const migrationControlService = {
        definitions,
        getState: state,
        getModules: () => db().getMigrationModules(),
        getLogs: moduleKey => db().getMigrationLogs(moduleKey),
        getSummary: () => db().getMigrationHealthSummary(),
        verifyConnectivity,
        verifyTable,
        verifyModule,
        runHealthChecks,
        canActivate,
        setModuleMode,
        forceLocalFallback,
        recordFallback: forceLocalFallback,
        getImportReadiness,
        assertImportReady,
        getModuleStatusStrategy,
        validateRlsReadiness,
        generateTestDataset: options => db().generateMigrationTestDataset({ ...(options || {}), actor: requirePlatform(options?.actor || {}, 'execute') })
    };

    global.migrationControlService = { ...(global.migrationControlService || {}), ...migrationControlService };
})(typeof window !== 'undefined' ? window : globalThis);
