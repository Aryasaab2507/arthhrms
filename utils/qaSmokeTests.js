// Lightweight QA smoke tests for ARTHHRMS. Load manually in browser console or Node harness.
(function (global) {
    function assert(name, condition, details = '') {
        return { name, pass: !!condition, details: condition ? '' : details };
    }

    function db() { return global.DB; }

    function duplicateValues(items, selector) {
        const seen = new Set();
        const dupes = new Set();
        (items || []).forEach(item => {
            const value = selector(item);
            if (!value) return;
            if (seen.has(value)) dupes.add(value);
            seen.add(value);
        });
        return Array.from(dupes);
    }

    function runArthQASmokeTests() {
        const results = [];
        const database = db();
        const data = database?.get?.() || {};
        const employees = database?.getEmployees?.() || data.employees || [];
        const users = data.users || [];

        results.push(assert('DB available', !!database?.get, 'DB.get is missing'));
        results.push(assert('Employees available', employees.length > 0, 'No employees found'));
        results.push(assert('No duplicate employee IDs', duplicateValues(employees, e => e.id || e.empId).length === 0, 'Duplicate employee IDs found'));
        results.push(assert('No duplicate user IDs', duplicateValues(users, u => u.id).length === 0, 'Duplicate user IDs found'));
        results.push(assert('Auth service loaded', !!global.authService, 'authService missing'));
        results.push(assert('Error service loaded', !!global.errorService?.safeAsync, 'errorService.safeAsync missing'));
        results.push(assert('Export service loaded', !!global.exportService?.toCSV, 'exportService.toCSV missing'));
        results.push(assert('Storage service loaded', !!global.storageService?.validateFile, 'storageService.validateFile missing'));
        results.push(assert('Auth invite service loaded', !!global.authInviteService?.sendInvite, 'authInviteService.sendInvite missing'));

        const snapshot = global.exportService?.exportBackupSnapshot?.({ download: false });
        const restoreCheck = global.exportService?.validateRestoreSnapshot?.(snapshot);
        results.push(assert('Backup snapshot validates', restoreCheck?.ok, (restoreCheck?.errors || []).join('; ')));

        const flags = global.supabaseClientService?.readConfig?.()?.flags || {};
        results.push(assert('Production demo fallback is controlled', !(flags.PRODUCTION_MODE && flags.DEMO_MODE === true), 'Production mode should set DEMO_MODE=false'));

        const inviteCheck = global.authInviteService?.validateInvitePayload?.({ email: 'new.user@example.com', role: 'employee' });
        results.push(assert('Invite payload validation works', !!inviteCheck?.ok, (inviteCheck?.errors || []).join('; ')));

        return {
            passed: results.filter(r => r.pass).length,
            failed: results.filter(r => !r.pass).length,
            results
        };
    }

    global.runArthQASmokeTests = runArthQASmokeTests;
})(typeof window !== 'undefined' ? window : globalThis);
