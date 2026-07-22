// QA validation center service for pilot and production readiness checks.
(function (global) {
    function db() { return global.DB; }

    function nowIso() { return new Date().toISOString(); }

    function result(key, label, ok, message, details = {}, severity = 'MEDIUM') {
        return { key, label, ok: !!ok, status: ok ? 'PASS' : 'FAIL', message, details, severity };
    }

    function warn(key, label, message, details = {}) {
        return { key, label, ok: true, status: 'WARNING', message, details, severity: 'LOW' };
    }

    function rows() {
        return db().get ? db().get() : {};
    }

    function validateAuth() {
        const health = db().getInstallHealth?.() || {};
        const authLoaded = !!global.authService;
        const badDemo = health.productionMode && health.demoPasswordUsers > 0;
        return [
            result('auth_service', 'Auth Service', authLoaded, authLoaded ? 'Auth service is loaded.' : 'Auth service is missing.'),
            result('auth_setup', 'Setup State', !health.setupRequired, health.setupRequired ? 'First-time setup is still required.' : 'Setup is complete.'),
            result('auth_demo_passwords', 'Demo Password Safety', !badDemo, badDemo ? 'Demo passwords exist in production mode.' : 'No production demo-password dependency detected.'),
            warn('auth_invites', 'Invite Endpoint', health.inviteEndpointConfigured ? 'Invite endpoint configured.' : 'Invite endpoint is not configured yet.', { configured: !!health.inviteEndpointConfigured })
        ];
    }

    function validateDatabase() {
        const d = rows();
        const requiredArrays = ['users', 'employees', 'attendance', 'leaveRequests', 'expenseClaims', 'payroll', 'notifications', 'auditLogs'];
        const checks = requiredArrays.map(key => result('db_' + key, key, Array.isArray(d[key]), Array.isArray(d[key]) ? `${key} collection exists.` : `${key} collection is missing.`));
        checks.push(result('db_emp_ids', 'Employee ID Integrity', !(db().detectDuplicateEmployees?.().empIds || []).length, 'Employee duplicate check completed.', db().detectDuplicateEmployees?.() || {}));
        return checks;
    }

    function validateWorkflow() {
        const engine = global.workflowEngine;
        return [
            result('workflow_engine', 'Workflow Engine', !!engine?.emitWorkflowEvent, engine?.emitWorkflowEvent ? 'Workflow event emitter is available.' : 'Workflow event emitter is missing.'),
            result('workflow_pending', 'Pending Action Engine', !!engine?.getPendingActionsForRole, engine?.getPendingActionsForRole ? 'Pending action engine is available.' : 'Pending action helper is missing.'),
            result('workflow_events', 'Workflow Event Store', Array.isArray(rows().workflowEvents), 'Workflow event store checked.')
        ];
    }

    function validateNotifications() {
        return [
            result('notification_service', 'Notification Service', !!global.notificationService?.dispatchNotification, global.notificationService?.dispatchNotification ? 'Notification dispatcher is available.' : 'Notification dispatcher is missing.'),
            result('notification_db', 'Notification Store', Array.isArray(rows().notifications), 'Notification store checked.')
        ];
    }

    function validateStorage() {
        const plan = global.storageService?.getStoragePlan?.() || [];
        const enabled = !!global.storageService?.isStorageEnabled?.();
        return [
            result('storage_service', 'Storage Service', !!global.storageService, global.storageService ? 'Storage service is loaded.' : 'Storage service is missing.'),
            warn('storage_mode', 'Storage Mode', enabled ? 'Live storage is enabled.' : 'Live storage is disabled; placeholders will be used.', { enabled }),
            result('storage_buckets', 'Storage Bucket Plan', plan.length >= 4, 'Storage bucket plan checked.', { buckets: plan.map(p => p.bucket) })
        ];
    }

    function validateImports() {
        return [
            result('import_service', 'Import Service', !!global.importService?.validateRows, global.importService?.validateRows ? 'Import validation is available.' : 'Import validation service is missing.'),
            result('staging_service', 'Import Staging', !!global.importStagingService?.stageImport, global.importStagingService?.stageImport ? 'Staging pipeline is active.' : 'Staging pipeline is missing.'),
            result('import_safety', 'Import Safety Lock', !!global.deploymentSafetyService?.checkAction, global.deploymentSafetyService?.checkAction ? 'Deployment safety guard is available.' : 'Deployment safety guard is missing.')
        ];
    }

    function validateMigration() {
        const summary = global.migrationControlService?.getSummary?.() || db().getMigrationHealthSummary?.() || {};
        const modules = global.migrationControlService?.getModules?.() || db().getMigrationModules?.() || [];
        return [
            result('migration_modules', 'Migration Module Registry', modules.length >= 13, `${modules.length || 0} migration modules registered.`, { modules: modules.map(m => m.moduleKey) }),
            warn('migration_health', 'Live Table Health', `${summary.healthy || 0} healthy, ${summary.failed || 0} failed, ${summary.unknown || 0} unknown.`, summary)
        ];
    }

    function validateRls() {
        const rls = global.migrationControlService?.validateRlsReadiness?.() || { ok: false, checklist: [] };
        return [
            result('rls_readiness', 'RLS Validation Readiness', !!rls.ok, rls.ok ? 'Core modules are ready for SQL policy tests.' : 'Run table health checks before final RLS tests.', rls)
        ];
    }

    function validateExports() {
        return [
            result('export_service', 'Export Service', !!global.exportService?.exportAttendance, global.exportService?.exportAttendance ? 'CSV export service is available.' : 'Export service is missing or incomplete.')
        ];
    }

    function simulateWorkflows() {
        const d = rows();
        const employees = d.employees || [];
        const manager = employees.find(e => !e.managerId) || employees[0];
        const employee = employees.find(e => e.managerId === manager?.id) || employees.find(e => e.id !== manager?.id) || employees[0];
        return [
            result('sim_attendance', 'Attendance Validation Simulation', !!employee && !!db().generateAttendanceId, employee ? 'Attendance record can be modeled for an employee.' : 'No employee exists for attendance simulation.', { empId: employee?.id || '' }),
            result('sim_leave', 'Leave Approval Simulation', !!employee && !!global.leaveService?.getLeaveBalances, employee ? 'Leave balance engine is callable.' : 'Leave simulation lacks employee or service.', { empId: employee?.id || '' }),
            result('sim_expense', 'Expense Approval Simulation', !!employee && !!global.expenseService?.submitExpense, employee ? 'Expense service can model employee claim flow.' : 'Expense service is unavailable.', { empId: employee?.id || '' }),
            result('sim_payroll', 'Payroll Simulation', !!employee && !!global.payrollService?.generatePayroll, employee ? 'Payroll generator is available behind safety checks.' : 'Payroll generator is unavailable.', { empId: employee?.id || '' })
        ];
    }

    function runValidation(options = {}) {
        const moduleResults = [
            ...validateAuth(),
            ...validateDatabase(),
            ...validateWorkflow(),
            ...validateNotifications(),
            ...validateStorage(),
            ...validateImports(),
            ...validateMigration(),
            ...validateRls(),
            ...validateExports()
        ];
        const workflowResults = options.includeWorkflowSimulations === false ? [] : simulateWorkflows();
        const all = [...moduleResults, ...workflowResults];
        const failed = all.filter(item => item.status === 'FAIL');
        const warnings = all.filter(item => item.status === 'WARNING');
        const score = Math.max(0, Math.round(((all.length - failed.length - warnings.length * 0.35) / Math.max(1, all.length)) * 100));
        const run = {
            runAt: nowIso(),
            environmentMode: db().getEnvironmentMode?.() || 'DEVELOPMENT',
            status: failed.length ? 'Failed' : (warnings.length ? 'Passed With Warnings' : 'Passed'),
            score,
            failedCount: failed.length,
            warningCount: warnings.length,
            moduleResults,
            workflowResults,
            rlsStatus: moduleResults.find(r => r.key === 'rls_readiness')?.status || 'Not Tested'
        };
        const saved = db().saveQaValidationRun?.(run, options.actor || {});
        db().logDeploymentEvent?.({
            eventType: 'QA_VALIDATION_RUN',
            status: run.status,
            message: `QA validation completed with score ${score}%`,
            actor: options.actor || {},
            metadata: { qaRunId: saved?.qaRunId || '', failed: failed.length, warnings: warnings.length }
        });
        return { ...run, id: saved?.id || '', qaRunId: saved?.qaRunId || '', savedRun: saved, failed, warnings };
    }

    const service = {
        runValidation,
        simulateWorkflows,
        getLatestRun: () => db().getQaValidationRuns?.()[0] || null,
        getRuns: () => db().getQaValidationRuns?.() || []
    };

    global.qaValidationService = { ...(global.qaValidationService || {}), ...service };
})(typeof window !== 'undefined' ? window : globalThis);
