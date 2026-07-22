// Real-company pilot onboarding and safe data activation service.
// Coordinates readiness checks without changing core workflow behavior.
(function (global) {
    function db() { return global.DB; }

    const OFFICIAL_ROLES = ['employee', 'manager', 'admin', 'hr', 'hr_head', 'director', 'super_admin'];
    const FLOW = [
        ['company_setup', 'Company setup validation'],
        ['platform_owner', 'Platform owner validation'],
        ['hr_admin', 'HR/Admin onboarding'],
        ['employee_import', 'Employee master import'],
        ['invite_activation', 'Invite activation'],
        ['attendance_activation', 'Attendance activation'],
        ['leave_activation', 'Leave activation'],
        ['payroll_activation', 'Payroll activation']
    ];

    function nowIso() { return new Date().toISOString(); }

    function cfg() {
        return global.supabaseClientService?.readConfig?.() || { flags: {} };
    }

    function normalizeRole(role = '') {
        return global.authService?.normalizeRole?.(role) || String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function actor(input = {}) {
        const current = input && Object.keys(input).length ? input : (global.authService?.getCurrentUser?.() || {});
        return {
            role: normalizeRole(current.role || current.actorRole || 'system'),
            id: current.id || current.actorId || current.empId || current.email || '',
            name: current.name || current.email || current.id || 'System'
        };
    }

    function environment() {
        return global.deploymentSafetyService?.getEnvironmentState?.() || db().getEnvironmentState?.() || { mode: 'DEVELOPMENT' };
    }

    function isStrictMode() {
        const env = environment();
        return !!(env.isPilot || env.isProduction || env.mode === 'PILOT' || env.mode === 'PRODUCTION');
    }

    function liveInvitesRequired() {
        const config = cfg();
        return !!(config.flags?.PILOT_MODE || config.flags?.PRODUCTION_MODE || (config.flags?.USE_SUPABASE_INVITES && !config.flags?.DEVELOPMENT_MODE));
    }

    function inviteEndpointConfigured() {
        return !!(cfg().INVITE_USER_ENDPOINT || global.authInviteService?.isInviteEnabled?.());
    }

    function normalizeEmail(email = '') {
        return db().normalizeEmail ? db().normalizeEmail(email) : String(email || '').trim().toLowerCase();
    }

    function employeeRole(emp = {}, data = null) {
        const d = data || db().get();
        const user = (d.users || []).find(u => u.empId === emp.id || normalizeEmail(u.email) === normalizeEmail(emp.email));
        return normalizeRole(user?.role || emp.role || 'employee');
    }

    function isArchived(emp = {}) {
        return /archived|suspended|terminated|inactive/i.test(`${emp.employmentStatus || ''} ${emp.status || ''} ${emp.activationStatus || ''}`);
    }

    function normalizedStatus(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    function isActivatedStatus(value = '') {
        return ['active', 'activated'].includes(normalizedStatus(value));
    }

    function isPendingInviteStatus(value = '') {
        return ['invite pending', 'pending', 'invite sent', 'sent'].includes(normalizedStatus(value));
    }

    function latestInvite(empId, data = null) {
        if (!empId) return null;
        if (db().getLatestAuthInviteForEmployee) return db().getLatestAuthInviteForEmployee(empId);
        const d = data || db().get();
        return (d.authInvites || [])
            .filter(inv => inv.empId === empId)
            .sort((a, b) => (b.createdAt || b.sentAt || '').localeCompare(a.createdAt || a.sentAt || ''))[0] || null;
    }

    function countDuplicateGroups(dupes = {}) {
        return ['empIds', 'emails', 'phones'].reduce((sum, key) => sum + ((dupes[key] || []).length), 0);
    }

    function getEmployeeActivationDashboard() {
        const data = db().get();
        const employees = data.employees || [];
        const invites = data.authInvites || [];
        const duplicateGroups = db().detectDuplicateEmployees ? db().detectDuplicateEmployees(data) : {};
        const relationship = db().getRelationshipAudit ? db().getRelationshipAudit(data) : { invalidManagers: [], brokenEmployeeLinks: [] };
        const invalidRoles = employees.filter(emp => !OFFICIAL_ROLES.includes(employeeRole(emp, data))).map(emp => emp.id);
        const orphanedAuthMappings = employees
            .filter(emp => emp.authUserId)
            .filter(emp => {
                const sameAuth = employees.filter(other => other.authUserId && other.authUserId === emp.authUserId);
                return sameAuth.length > 1;
            })
            .map(emp => emp.id);
        const pendingInvites = employees.filter(emp => {
            const inv = latestInvite(emp.id, data);
            return isPendingInviteStatus(inv?.inviteStatus || inv?.status || emp.inviteStatus || '') && !isActivatedStatus(inv?.activationStatus || emp.activationStatus || '');
        });
        const failedInvites = invites.filter(inv => /failed|expired|blocked/i.test(`${inv.inviteStatus || inv.status || ''} ${inv.activationStatus || ''}`));
        const activatedUsers = employees.filter(emp => isActivatedStatus(emp.activationStatus || '') || !!emp.authUserId);
        const archivedUsers = employees.filter(isArchived);
        const imported = employees.filter(emp => emp.source === 'import' || emp.importBatchId || emp.importedAt);
        return {
            generatedAt: nowIso(),
            totalEmployees: employees.length,
            importedEmployees: imported.length || employees.length,
            pendingInvites: pendingInvites.length,
            activatedUsers: activatedUsers.length,
            failedInvites: failedInvites.length,
            archivedUsers: archivedUsers.length,
            duplicateConflicts: countDuplicateGroups(duplicateGroups),
            brokenManagers: (relationship.invalidManagers || []).length,
            brokenEmployeeLinks: (relationship.brokenEmployeeLinks || []).length,
            invalidRoles: invalidRoles.length,
            orphanedAuthMappings: Array.from(new Set(orphanedAuthMappings)).length,
            latestImportBatch: (data.importBatches || []).slice().sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0] || null,
            latestInviteRows: invites.slice().sort((a, b) => (b.createdAt || b.sentAt || '').localeCompare(a.createdAt || a.sentAt || '')).slice(0, 10),
            conflicts: {
                duplicates: duplicateGroups,
                invalidManagers: relationship.invalidManagers || [],
                brokenEmployeeLinks: relationship.brokenEmployeeLinks || [],
                invalidRoles,
                orphanedAuthMappings: Array.from(new Set(orphanedAuthMappings))
            }
        };
    }

    function moduleState(moduleKey) {
        const state = global.migrationControlService?.getState?.() || db().getMigrationState?.() || {};
        return state.modules?.[moduleKey] || {};
    }

    function stage(id, label, ok, blockers = [], warnings = [], meta = {}) {
        return {
            id,
            label,
            status: blockers.length ? 'BLOCKED' : warnings.length ? 'ATTENTION' : ok ? 'READY' : 'PENDING',
            ok: !!ok && !blockers.length,
            blockers,
            warnings,
            meta
        };
    }

    function validateWorkflowActivation() {
        const data = db().get();
        const checks = [
            { key: 'workflowEngine', ok: !!global.workflowEngine?.emitWorkflowEvent, message: 'Workflow engine is loaded' },
            { key: 'notificationService', ok: !!global.notificationService?.dispatchNotification, message: 'Notification dispatcher is loaded' },
            { key: 'notificationStore', ok: Array.isArray(data.notifications), message: 'Notification store exists' },
            { key: 'auditLogging', ok: !!db().writeAuditLog, message: 'Audit writer exists' },
            { key: 'monitoringHooks', ok: !!global.operationsMonitoringService?.createIncident, message: 'Operations monitoring is loaded' },
            { key: 'roleRouting', ok: !!global.authService?.getRoleRedirect || !!global.authService?.requireCurrentRole, message: 'Role routing helpers are loaded' }
        ];
        return {
            ok: checks.every(row => row.ok),
            checks,
            blockers: checks.filter(row => !row.ok).map(row => row.message)
        };
    }

    function validateImportActivation(importType = 'employees', rowCount = 0) {
        const readiness = global.migrationControlService?.getImportReadiness
            ? global.migrationControlService.getImportReadiness(importType, rowCount)
            : db().getImportReadiness?.(importType, rowCount);
        const safety = global.deploymentSafetyService?.checkAction
            ? global.deploymentSafetyService.checkAction('import_commit', { importType, rowCount })
            : db().checkDeploymentAction?.('import_commit', { importType, rowCount }) || { allowed: true };
        return {
            ok: readiness?.ok !== false && safety.allowed !== false,
            readiness,
            safety,
            blockers: [
                ...(readiness?.ok === false ? [readiness.reason || 'Import readiness failed'] : []),
                ...(safety.allowed === false ? [safety.warning || 'Deployment safety blocked import'] : [])
            ],
            warnings: readiness?.warnings || []
        };
    }

    function validatePilotReadiness(options = {}) {
        const install = db().getInstallHealth ? db().getInstallHealth() : {};
        const env = environment();
        const data = db().get();
        const company = data.companySettings || data.settings || {};
        const dashboard = getEmployeeActivationDashboard();
        const workflow = validateWorkflowActivation();
        const checkpoints = global.deploymentSafetyService?.getCheckpoints?.() || db().getDeploymentCheckpoints?.() || [];
        const ownerUsers = (data.users || []).filter(u => normalizeRole(u.role) === 'platform_owner' && u.activationStatus !== 'Suspended');
        const opsUsers = (data.users || []).filter(u => ['hr', 'admin', 'super_admin'].includes(normalizeRole(u.role)) && u.activationStatus !== 'Suspended');
        const employeeImport = validateImportActivation('employees', dashboard.importedEmployees);
        const attendanceModule = moduleState('attendance');
        const leaveModule = moduleState('leaveRequests');
        const payrollModule = moduleState('payroll');
        const inviteBlockers = [];
        if (liveInvitesRequired() && !inviteEndpointConfigured()) inviteBlockers.push('Live invite endpoint is required before pilot invite activation.');
        if (dashboard.duplicateConflicts) inviteBlockers.push('Resolve duplicate employee identity conflicts before sending bulk invites.');
        if (dashboard.brokenManagers) inviteBlockers.push('Resolve broken manager hierarchy before sending bulk invites.');
        const flow = FLOW.map(([id, label]) => {
            if (id === 'company_setup') {
                const blockers = [];
                if (install.setupRequired) blockers.push('First-time setup is not complete.');
                if (!company.companyName) blockers.push('Company name is missing.');
                if (!company.timezone) blockers.push('Company timezone is missing.');
                return stage(id, label, !blockers.length, blockers, env.mode === 'PILOT' ? [] : ['Switch environment to PILOT before real-company rollout.'], { environment: env.mode });
            }
            if (id === 'platform_owner') return stage(id, label, !!ownerUsers.length, ownerUsers.length ? [] : ['No active platform owner exists.'], [], { platformOwners: ownerUsers.length });
            if (id === 'hr_admin') return stage(id, label, !!opsUsers.length, opsUsers.length ? [] : ['Create or activate at least one HR/Admin/Super Admin operator.'], [], { opsUsers: opsUsers.length });
            if (id === 'employee_import') {
                const blockers = [];
                if (!dashboard.totalEmployees) blockers.push('No employee master records exist.');
                if (dashboard.duplicateConflicts) blockers.push('Duplicate employee IDs, emails, or phone numbers exist.');
                if (dashboard.brokenManagers) blockers.push('Manager hierarchy has invalid references.');
                return stage(id, label, !blockers.length, blockers, employeeImport.warnings || [], dashboard);
            }
            if (id === 'invite_activation') return stage(id, label, !inviteBlockers.length, inviteBlockers, dashboard.failedInvites ? [`${dashboard.failedInvites} failed invite(s) need resend/review.`] : [], { pendingInvites: dashboard.pendingInvites, activatedUsers: dashboard.activatedUsers });
            if (id === 'attendance_activation') return stage(id, label, workflow.ok, workflow.blockers, attendanceModule.mode === 'LOCAL' ? ['Attendance is still LOCAL; verify table before live activation.'] : [], attendanceModule);
            if (id === 'leave_activation') return stage(id, label, workflow.ok, workflow.blockers, leaveModule.mode === 'LOCAL' ? ['Leave is still LOCAL; verify table before live activation.'] : [], leaveModule);
            if (id === 'payroll_activation') {
                const blockers = [...workflow.blockers];
                if (!checkpoints.length && isStrictMode()) blockers.push('Create a deployment checkpoint before payroll activation.');
                return stage(id, label, !blockers.length, blockers, payrollModule.mode === 'LOCAL' ? ['Payroll is still LOCAL; verify dependencies before live activation.'] : [], payrollModule);
            }
            return stage(id, label, true);
        });
        const blockers = flow.flatMap(row => row.blockers.map(message => `${row.label}: ${message}`));
        const warnings = flow.flatMap(row => row.warnings.map(message => `${row.label}: ${message}`));
        const result = {
            generatedAt: nowIso(),
            environment: env.mode || 'DEVELOPMENT',
            canProceed: blockers.length === 0,
            blockers,
            warnings,
            flow,
            dashboard,
            workflow,
            importActivation: employeeImport,
            safety: {
                pilotLimits: env.deploymentState?.pilotLimits || db().getDeploymentSafetyLimits?.() || {},
                checkpoints: checkpoints.length,
                inviteEndpointConfigured: inviteEndpointConfigured(),
                liveInvitesRequired: liveInvitesRequired()
            }
        };
        if (options.recordIncident && blockers.length && global.operationsMonitoringService?.createIncident) {
            global.operationsMonitoringService.createIncident({
                severity: 'HIGH',
                module: 'Pilot Onboarding',
                title: 'Pilot onboarding readiness blocked',
                description: blockers.slice(0, 3).join(' | '),
                source: 'pilot_onboarding',
                recoveryAction: 'Open Platform Control Center Pilot Onboarding, resolve blockers, create checkpoint, then rerun readiness.',
                metadata: { blockers, warnings }
            }, actor(options));
        }
        return result;
    }

    function previewBulkInvites(options = {}) {
        const data = db().get();
        const limit = Math.max(1, Number(options.limit || options.batchSize || 25));
        const employees = (data.employees || []).filter(emp => !isArchived(emp));
        const candidates = [];
        const blockers = [];
        employees.forEach(emp => {
            const role = employeeRole(emp, data);
            const email = normalizeEmail(emp.email);
            const invite = latestInvite(emp.id, data);
            const rowBlockers = [];
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowBlockers.push('Valid email is required');
            if (!OFFICIAL_ROLES.includes(role)) rowBlockers.push('Official role is required');
            if (isActivatedStatus(invite?.activationStatus || emp.activationStatus || '') || emp.authUserId) rowBlockers.push('Employee is already activated or linked');
            if (isPendingInviteStatus(invite?.inviteStatus || invite?.status || emp.inviteStatus || '') && !options.includePending) rowBlockers.push('Invite is already pending or sent');
            const row = {
                empId: emp.id,
                name: emp.name,
                email,
                role,
                inviteStatus: invite?.inviteStatus || emp.inviteStatus || 'Not Invited',
                activationStatus: emp.activationStatus || invite?.activationStatus || 'Not Activated',
                blockers: rowBlockers
            };
            if (rowBlockers.length) blockers.push({ empId: emp.id, email, message: rowBlockers.join('; ') });
            else candidates.push(row);
        });
        if (liveInvitesRequired() && !inviteEndpointConfigured()) {
            blockers.unshift({ empId: '', email: '', message: 'Live invite endpoint is required before staged invite sending.' });
        }
        const limits = environment().deploymentState?.pilotLimits || db().getDeploymentSafetyLimits?.() || {};
        const safeLimit = isStrictMode() ? Math.min(limit, Number(limits.maxBulkActionRows || limit)) : limit;
        return {
            generatedAt: nowIso(),
            totalEmployees: employees.length,
            totalEligible: candidates.length,
            sendLimit: safeLimit,
            candidates: candidates.slice(0, safeLimit),
            overflow: Math.max(0, candidates.length - safeLimit),
            blockers,
            endpointReady: inviteEndpointConfigured(),
            liveRequired: liveInvitesRequired()
        };
    }

    async function sendStagedInvites(options = {}) {
        const started = Date.now();
        const runActor = actor(options);
        const preview = previewBulkInvites({ ...options, includePending: false });
        if (preview.liveRequired && !preview.endpointReady) {
            global.operationsMonitoringService?.createIncident?.({
                severity: 'HIGH',
                module: 'Pilot Onboarding',
                title: 'Bulk invite send blocked',
                description: 'Live invite endpoint is missing.',
                source: 'pilot_onboarding',
                recoveryAction: 'Configure INVITE_USER_ENDPOINT and rerun invite preview before sending.'
            }, runActor);
            return { blocked: true, reason: 'Live invite endpoint is required before staged invite sending.', preview };
        }
        const safety = global.deploymentSafetyService?.guardAction
            ? global.deploymentSafetyService.guardAction('bulk_invite_send', { count: preview.candidates.length }, { label: `bulk invite send for ${preview.candidates.length} employees` })
            : { ok: true };
        if (!safety.ok) return { blocked: true, reason: safety.reason || 'Bulk invite send blocked by deployment safety controls', preview, safety };
        if (!preview.candidates.length) return { blocked: true, reason: 'No eligible employees found for staged invites', preview };
        let sent = 0;
        let failed = 0;
        const results = [];
        for (const candidate of preview.candidates) {
            const result = await global.authInviteService.sendInvite({
                empId: candidate.empId,
                email: candidate.email,
                role: candidate.role,
                name: candidate.name,
                invitedBy: runActor.id,
                invitedByRole: runActor.role
            });
            if (result.ok) sent++;
            else failed++;
            results.push({ empId: candidate.empId, email: candidate.email, ok: !!result.ok, error: result.error || (result.errors || []).join('; '), inviteId: result.invite?.inviteId || '' });
        }
        global.operationsMonitoringService?.recordPerformance?.({
            module: 'Pilot Onboarding',
            operation: 'bulk_invite_send',
            durationMs: Date.now() - started,
            recordCount: preview.candidates.length,
            status: failed ? 'Warning' : 'OK',
            metadata: { sent, failed, overflow: preview.overflow }
        });
        if (failed) {
            global.operationsMonitoringService?.createIncident?.({
                severity: 'HIGH',
                module: 'Pilot Onboarding',
                title: 'Bulk invite send completed with failures',
                description: `${failed} invite(s) failed during staged pilot sending.`,
                source: 'pilot_onboarding',
                recoveryAction: 'Review failed invite rows, fix endpoint/email issues, and use resend failed invites.',
                metadata: { sent, failed, results }
            }, runActor);
        }
        if (db().writeAuditLog) db().writeAuditLog(runActor.role, runActor.id, 'pilot staged invites sent', 'Pilot Onboarding', 'bulk-invite', `${sent} invite(s) sent, ${failed} failed`);
        return { blocked: false, sent, failed, results, preview };
    }

    async function resendFailedInvites(options = {}) {
        const runActor = actor(options);
        const limit = Math.max(1, Number(options.limit || 25));
        const failedRows = (db().getAuthInvites?.() || [])
            .filter(inv => /failed|expired/i.test(`${inv.inviteStatus || inv.status || ''} ${inv.activationStatus || ''}`))
            .slice(0, limit);
        const safety = global.deploymentSafetyService?.guardAction
            ? global.deploymentSafetyService.guardAction('bulk_invite_send', { count: failedRows.length }, { label: `failed invite resend for ${failedRows.length} records` })
            : { ok: true };
        if (!safety.ok) return { blocked: true, reason: safety.reason || 'Failed invite resend blocked', rows: failedRows };
        const results = [];
        let resent = 0;
        let failed = 0;
        for (const row of failedRows) {
            const result = await global.authInviteService.resendInvite(row.inviteId);
            if (result.ok) resent++;
            else failed++;
            results.push({ inviteId: row.inviteId, empId: row.empId, ok: !!result.ok, error: result.error || (result.errors || []).join('; ') });
        }
        if (db().writeAuditLog) db().writeAuditLog(runActor.role, runActor.id, 'failed invites resent', 'Pilot Onboarding', 'resend-failed', `${resent} failed invite(s) resent, ${failed} still failed`);
        return { blocked: false, resent, failed, results };
    }

    function createPilotCheckpoint(label = 'Pilot onboarding checkpoint', options = {}) {
        const runActor = actor(options);
        const checkpoint = global.deploymentSafetyService?.createCheckpoint
            ? global.deploymentSafetyService.createCheckpoint(label)
            : db().createDeploymentCheckpoint?.(label, runActor, { source: 'pilotOnboardingService' });
        global.operationsMonitoringService?.recordPerformance?.({
            module: 'Pilot Onboarding',
            operation: 'pilot_checkpoint',
            durationMs: 0,
            status: checkpoint?.checkpointId ? 'OK' : 'Failed',
            metadata: { checkpointId: checkpoint?.checkpointId || '' }
        });
        return checkpoint;
    }

    const service = {
        getEmployeeActivationDashboard,
        validateWorkflowActivation,
        validateImportActivation,
        validatePilotReadiness,
        previewBulkInvites,
        sendStagedInvites,
        resendFailedInvites,
        createPilotCheckpoint,
        getPilotSequence: () => FLOW.map(([id, label]) => ({ id, label }))
    };

    global.pilotOnboardingService = { ...(global.pilotOnboardingService || {}), ...service };
})(typeof window !== 'undefined' ? window : globalThis);
