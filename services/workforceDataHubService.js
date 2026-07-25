// Company-scoped workforce import orchestration over EmployeeMasterImportService.
(function (global) {
    'use strict';

    const RUN_STATES = Object.freeze(['REVIEW', 'BLOCKED', 'READY', 'COMMITTED', 'ROLLED_BACK']);
    const DUPLICATE_ACTIONS = Object.freeze(['MERGE_EXISTING', 'UPDATE_EXISTING', 'SKIP']);

    function enabled() {
        return !!global.supabaseClientService?.isEnabled?.('USE_WORKFORCE_DATA_HUB');
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value == null ? null : value));
    }

    function normalizeTenant(value) {
        return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function actor(context = {}) {
        return context.actor || global.authService?.getCurrentUser?.() || {};
    }

    function tenant(context = {}, input = {}) {
        const current = actor(context);
        const requested = normalizeTenant(input.tenantSlug || context.tenantSlug || current.tenantId || current.tenantSlug);
        const trusted = normalizeTenant(current.tenantId || current.tenantSlug);
        if (!requested || !trusted || requested !== trusted) throw new Error('Trusted tenant scope is required for Workforce Data Hub.');
        return requested;
    }

    function data() {
        const state = global.DB?.get?.() || {};
        if (!Array.isArray(state.workforceDataHubRuns)) state.workforceDataHubRuns = [];
        return state;
    }

    async function save(state) {
        global.DB?.save?.(state);
        if (global.supabasePersistenceService?.flush) await global.supabasePersistenceService.flush();
    }

    function runId() {
        if (global.crypto?.randomUUID) return `WDH-${global.crypto.randomUUID()}`;
        return `WDH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function core() {
        if (!global.EmployeeMasterImportService) throw new Error('Employee Master Import service is unavailable.');
        return global.EmployeeMasterImportService;
    }

    function contextFor(context, tenantSlug) {
        return { ...(context || {}), tenantSlug, actor: actor(context) };
    }

    function findRun(id, context = {}) {
        const tenantSlug = tenant(context);
        return (data().workforceDataHubRuns || []).find(row => row.runId === id && normalizeTenant(row.tenantSlug) === tenantSlug) || null;
    }

    function buildPayload(run, rows) {
        return {
            tenantSlug: run.tenantSlug,
            fileName: run.fileName,
            fileType: 'JSON',
            records: rows || run.records || [],
            conflictStrategy: run.conflictStrategy || 'MERGE',
            metadata: { sourceSystem: 'Workforce Data Hub', reviewRunId: run.runId }
        };
    }

    function effectiveRows(run) {
        const decisions = run.duplicateDecisions || {};
        const managers = run.managerAssignments || {};
        return (run.records || [])
            .filter(row => decisions[String(row.__rowNumber)] !== 'SKIP')
            .map(row => ({
                ...clone(row),
                manager: Object.prototype.hasOwnProperty.call(managers, String(row.__rowNumber))
                    ? managers[String(row.__rowNumber)]
                    : row.manager
            }));
    }

    function unresolvedDuplicates(run) {
        return (run.duplicates || []).filter(item => {
            if (!/^FILE_/.test(String(item.matchType || ''))) return false;
            return !DUPLICATE_ACTIONS.includes(String((run.duplicateDecisions || {})[String(item.rowNumber)] || ''));
        });
    }

    function summarizeState(run) {
        const unresolved = unresolvedDuplicates(run).length;
        const invalid = Number(run.validation?.summary?.invalidRecords || 0);
        run.state = invalid || unresolved ? 'BLOCKED' : 'READY';
        run.blockers = [
            ...(invalid ? [`${invalid} invalid employee row(s)`] : []),
            ...(unresolved ? [`${unresolved} duplicate decision(s) pending`] : [])
        ];
        return run;
    }

    function evaluate(run, context) {
        const payload = buildPayload(run, effectiveRows(run));
        const report = core().runDryRun(payload, contextFor(context, run.tenantSlug));
        run.validation = {
            success: !!report.success,
            summary: clone(report.validation?.summary || report.summary || {}),
            records: clone(report.validation?.records || [])
        };
        run.summary = clone(report.summary || {});
        run.duplicates = clone(report.duplicates?.duplicates || []);
        run.conflicts = clone(report.conflicts?.resolutions || []);
        run.riskScore = Number(report.riskScore || 0);
        run.updatedAt = new Date().toISOString();
        return summarizeState(run);
    }

    async function createReview(input = {}, context = {}) {
        const tenantSlug = tenant(context, input);
        const normalized = core().normalizeImportPayload(input, contextFor(context, tenantSlug));
        if (!normalized.success) return normalized;
        const report = core().runDryRun(input, contextFor(context, tenantSlug));
        const now = new Date().toISOString();
        const run = {
            runId: runId(),
            tenantSlug,
            fileName: String(input.fileName || ''),
            fileType: String(input.fileType || ''),
            conflictStrategy: String(input.conflictStrategy || 'MERGE'),
            records: clone(normalized.records || []),
            mapping: clone(normalized.mapping || {}),
            duplicateDecisions: {},
            managerAssignments: {},
            validation: {
                success: !!report.success,
                summary: clone(report.validation?.summary || report.summary || {}),
                records: clone(report.validation?.records || [])
            },
            summary: clone(report.summary || {}),
            duplicates: clone(report.duplicates?.duplicates || []),
            conflicts: clone(report.conflicts?.resolutions || []),
            riskScore: Number(report.riskScore || 0),
            state: 'REVIEW',
            blockers: [],
            createdBy: actor(context).id || '',
            createdAt: now,
            updatedAt: now,
            importId: '',
            rollbackId: ''
        };
        summarizeState(run);
        const state = data();
        state.workforceDataHubRuns.unshift(run);
        await save(state);
        return { success: true, run: clone(run), report };
    }

    async function resolveDuplicate(input = {}, context = {}) {
        const run = findRun(String(input.runId || ''), context);
        if (!run) return { success: false, error: 'Workforce review run was not found.' };
        const action = String(input.action || '').toUpperCase();
        if (!DUPLICATE_ACTIONS.includes(action)) return { success: false, error: 'A governed duplicate action is required.' };
        run.duplicateDecisions[String(input.rowNumber)] = action;
        evaluate(run, context);
        await save(data());
        return { success: true, run: clone(run) };
    }

    async function assignManager(input = {}, context = {}) {
        const run = findRun(String(input.runId || ''), context);
        if (!run) return { success: false, error: 'Workforce review run was not found.' };
        const managerId = String(input.managerId || '').trim();
        const manager = global.DB?.getEmployee?.(managerId);
        if (!manager || !managerId) return { success: false, error: 'Select an existing active tenant manager.' };
        if (/inactive|terminated|resigned|archived|suspended/i.test(String(manager.employmentStatus || manager.status || ''))) {
            return { success: false, error: 'Inactive employees cannot be assigned as reporting managers.' };
        }
        run.managerAssignments[String(input.rowNumber)] = managerId;
        evaluate(run, context);
        await save(data());
        return { success: true, run: clone(run) };
    }

    async function commit(input = {}, context = {}) {
        const run = findRun(String(input.runId || ''), context);
        if (!run) return { success: false, error: 'Workforce review run was not found.' };
        evaluate(run, context);
        if (run.state !== 'READY') {
            await save(data());
            return { success: false, error: 'Resolve all validation and duplicate blockers before import.', run: clone(run) };
        }
        const payload = buildPayload(run, effectiveRows(run));
        const result = core().executeImport(payload, contextFor(context, run.tenantSlug));
        if (!result.success) return { success: false, error: (result.issues || []).map(item => item.message).join(' ') || 'Employee import failed.', result };
        run.state = 'COMMITTED';
        run.importId = result.importId;
        run.committedAt = new Date().toISOString();
        run.updatedAt = run.committedAt;
        run.summary = clone(result.summary || run.summary);
        run.blockers = [];
        await save(data());
        return { success: true, run: clone(run), result };
    }

    async function rollback(input = {}, context = {}) {
        const run = findRun(String(input.runId || ''), context);
        if (!run || !run.importId) return { success: false, error: 'Committed workforce import was not found.' };
        const result = core().rollbackImport({
            tenantSlug: run.tenantSlug,
            importId: run.importId,
            reason: String(input.reason || 'Workforce Data Hub rollback')
        }, contextFor(context, run.tenantSlug));
        if (!result.success) return { success: false, error: (result.issues || []).map(item => item.message).join(' ') || 'Rollback failed.', result };
        run.state = 'ROLLED_BACK';
        run.rollbackId = result.rollback?.rollbackId || '';
        run.rolledBackAt = new Date().toISOString();
        run.updatedAt = run.rolledBackAt;
        await save(data());
        return { success: true, run: clone(run), result };
    }

    function dashboard(context = {}) {
        const tenantSlug = tenant(context);
        const runs = (data().workforceDataHubRuns || [])
            .filter(row => normalizeTenant(row.tenantSlug) === tenantSlug)
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return {
            success: true,
            runs: clone(runs),
            activeRun: runs.find(row => !['COMMITTED', 'ROLLED_BACK'].includes(row.state)) || runs[0] || null,
            totals: {
                runs: runs.length,
                ready: runs.filter(row => row.state === 'READY').length,
                blocked: runs.filter(row => row.state === 'BLOCKED').length,
                committed: runs.filter(row => row.state === 'COMMITTED').length,
                rolledBack: runs.filter(row => row.state === 'ROLLED_BACK').length
            }
        };
    }

    const service = Object.freeze({
        RUN_STATES,
        DUPLICATE_ACTIONS,
        isEnabled: enabled,
        createReview,
        resolveDuplicate,
        assignManager,
        commit,
        rollback,
        dashboard
    });

    global.WorkforceDataHubService = service;
    global.workforceDataHubService = service;
})(typeof window !== 'undefined' ? window : globalThis);
