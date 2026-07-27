// Durable tenant setup workspace adapter for the Company Administration plane.
(function attachCompanySetupOrchestrationService(global) {
    'use strict';

    var FLAG = 'USE_COMPANY_SETUP_ORCHESTRATION';
    var CORE_STEPS = Object.freeze([
        'organizationStructure',
        'workingConfiguration',
        'leaveConfiguration',
        'payrollConfiguration',
        'identitySecurity',
        'notifications',
        'administrator',
        'review',
        'provisionTenant'
    ]);
    var SETUP_TASKS = Object.freeze([
        { key: 'locations', label: 'Locations', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'departments', label: 'Departments', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'businessUnits', label: 'Business Units', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'designations', label: 'Designations', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'workingCalendar', label: 'Working Calendar', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'holidayCalendar', label: 'Holiday Calendar', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'attendanceRules', label: 'Attendance Rules', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 20 },
        { key: 'leaveRules', label: 'Leave Rules', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 20 },
        { key: 'payrollBasics', label: 'Payroll Basics', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 25 },
        { key: 'approvalWorkflow', label: 'Approval Workflow', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 20 },
        { key: 'companyOwner', label: 'Company Owner', route: 'super-admin.html', owner: 'Company Owner', minutes: 0 },
        { key: 'hrAdmin', label: 'HR Admin', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 5 },
        { key: 'managers', label: 'Managers', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'employeeImport', label: 'Employee Import', route: 'employee-migration-center.html', owner: 'HR Admin', minutes: 30 },
        { key: 'validation', label: 'Validation', route: 'employee-data-quality-center.html', owner: 'HR Admin', minutes: 20 },
        { key: 'readiness', label: 'Readiness', route: 'go-live-readiness-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'pilot', label: 'Pilot', route: 'go-live-readiness-center.html', owner: 'Company Owner', minutes: 30 },
        { key: 'goLive', label: 'Go Live', route: 'go-live-certification-center.html', owner: 'Company Owner', minutes: 15 }
    ].map(function freezeTask(task, index) {
        return Object.freeze(Object.assign({ order: index + 1, required: true }, task));
    }));

    var cache = {
        workspace: null,
        company: null,
        loading: null,
        error: '',
        audit: {
            pending: 0,
            delivered: 0,
            lastError: ''
        }
    };
    var mutationQueue = Promise.resolve();

    function freeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeChild(key) { freeze(value[key]); });
        return Object.freeze(value);
    }

    function output(ok, code, message, data) {
        return freeze(Object.assign({ ok: !!ok, success: !!ok, code: code, message: message }, data || {}));
    }

    function normalizeRole(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function actorFrom(context) {
        return context?.actor || global.authService?.getCurrentUser?.() || {};
    }

    function requireCompanyOwner(context) {
        var actor = actorFrom(context);
        var tenant = String(actor.tenantSlug || actor.tenantId || '').trim();
        var organization = String(actor.organizationId || actor.companyId || '').trim();
        if (
            !actor.id ||
            normalizeRole(actor.role) !== 'super_admin' ||
            actor.source !== 'supabase' ||
            actor.roleTrusted !== true ||
            actor.companyOwner !== true ||
            !tenant ||
            !organization
        ) {
            return output(false, 'COMPANY_OWNER_REQUIRED', 'A trusted Company Owner session is required.');
        }
        return output(true, 'COMPANY_OWNER_AUTHORIZED', 'Company Owner authorization is valid.', {
            actor: actor,
            tenantId: tenant,
            organizationId: organization
        });
    }

    function enabled() {
        return !!global.supabaseClientService?.isEnabled?.(FLAG);
    }

    function client() {
        return global.supabaseClientService?.getClient?.() || null;
    }

    function operationId(prefix) {
        var id = '';
        try { id = global.crypto?.randomUUID?.() || ''; } catch (_error) {}
        if (!id) id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        return String(prefix || 'company-setup') + ':' + id;
    }

    function backendError(error) {
        var message = String(error?.message || '').trim();
        var details = String(error?.details || '').trim();
        var hint = String(error?.hint || '').trim();
        var reason = [message, details && details !== message ? details : '', hint ? 'Hint: ' + hint : '']
            .filter(Boolean)
            .join(' ');
        return {
            code: String(error?.code || '').trim().toUpperCase(),
            status: Number(error?.status || error?.statusCode || 0),
            message: message,
            details: details,
            hint: hint,
            reason: reason
        };
    }

    function classifiedError(error, fallbackCode, fallbackMessage) {
        var backend = backendError(error);
        var code = backend.code;
        var status = backend.status;
        var rawMessage = backend.reason;
        var diagnostic = {
            backendCode: backend.code,
            backendMessage: backend.message,
            backendDetails: backend.details,
            backendHint: backend.hint,
            httpStatus: backend.status || null
        };
        if (code === '42501' || status === 401 || status === 403 || /permission|forbidden|authorization/i.test(rawMessage)) {
            return output(false, 'COMPANY_SETUP_PERMISSION_ERROR', 'Permission Error: ' + (rawMessage || 'your Company Owner session is not authorized for this setup operation.'), {
                category: 'PERMISSION',
                retryable: false,
                ...diagnostic
            });
        }
        if (code === '40001' || /revision is stale|conflict/i.test(rawMessage)) {
            return output(false, 'COMPANY_SETUP_CONFLICT', 'Database Conflict: ' + (rawMessage || 'this setup was updated elsewhere. Refresh the workspace and try again.'), {
                category: 'DATABASE',
                retryable: true,
                ...diagnostic
            });
        }
        if (code === '22023' || code.startsWith('23') || /invalid|required|validation/i.test(rawMessage)) {
            return output(false, 'COMPANY_SETUP_VALIDATION_ERROR', 'Validation Error: ' + (rawMessage || fallbackMessage), {
                category: 'VALIDATION',
                retryable: false,
                ...diagnostic
            });
        }
        if (status >= 500 || code.startsWith('PGRST') || /database|postgres|relation|rpc/i.test(rawMessage)) {
            return output(false, 'COMPANY_SETUP_DATABASE_ERROR', 'Database Error: ' + (rawMessage || fallbackMessage), {
                category: 'DATABASE',
                retryable: true,
                ...diagnostic
            });
        }
        if (/fetch|network|offline|timeout|connection/i.test(rawMessage)) {
            return output(false, 'COMPANY_SETUP_NETWORK_ERROR', 'Network Error: ' + (rawMessage || 'check your connection and retry the setup operation.'), {
                category: 'NETWORK',
                retryable: true,
                ...diagnostic
            });
        }
        return output(false, fallbackCode, rawMessage || fallbackMessage, {
            category: 'APPLICATION',
            retryable: true,
            ...diagnostic
        });
    }

    function enqueueMutation(operation) {
        var result = mutationQueue.then(operation, operation);
        mutationQueue = result.then(function mutationComplete() {}, function mutationRecovered() {});
        return result;
    }

    function delay(milliseconds) {
        return new Promise(function wait(resolve) {
            global.setTimeout(resolve, milliseconds);
        });
    }

    async function flushAuditQueue(context) {
        var access = requireCompanyOwner(context);
        if (!access.ok || !enabled()) return access;
        var supabase = client();
        if (!supabase?.rpc) return output(false, 'SUPABASE_UNAVAILABLE', 'Supabase audit delivery is unavailable.');
        try {
            var response = await supabase.rpc('arth_flush_company_setup_audit', { p_limit: 25 });
            if (response.error) throw response.error;
            cache.audit.pending = Number(response.data?.pending || 0);
            cache.audit.delivered = Number(response.data?.delivered || 0);
            cache.audit.lastError = '';
            return output(true, 'COMPANY_SETUP_AUDIT_FLUSHED', cache.audit.pending
                ? 'Setup audit delivery remains queued.'
                : 'Setup audit delivery is current.', {
                audit: Object.assign({}, cache.audit)
            });
        } catch (error) {
            cache.audit.lastError = String(error?.message || error || 'Audit delivery failed.');
            return output(false, 'COMPANY_SETUP_AUDIT_QUEUED', 'Setup saved. Audit delivery will retry automatically.', {
                category: 'AUDIT',
                retryable: true,
                audit: Object.assign({}, cache.audit)
            });
        }
    }

    function completedSet() {
        return new Set(Array.isArray(cache.workspace?.completed_steps) ? cache.workspace.completed_steps : []);
    }

    function taskState(task, completed) {
        var mappings = {
            locations: 'organizationStructure',
            departments: 'organizationStructure',
            businessUnits: 'organizationStructure',
            designations: 'organizationStructure',
            workingCalendar: 'workingConfiguration',
            holidayCalendar: 'workingConfiguration',
            attendanceRules: 'workingConfiguration',
            leaveRules: 'leaveConfiguration',
            payrollBasics: 'payrollConfiguration',
            companyOwner: 'identitySecurity'
        };
        if (task.key === 'companyOwner') return { completed: true, drafted: true };
        var drafted = completed.has(mappings[task.key] || task.key);
        return { completed: false, drafted: drafted };
    }

    function setupHome() {
        var completed = completedSet();
        var tasks = SETUP_TASKS.map(function mapTask(task) {
            var state = taskState(task, completed);
            return freeze(Object.assign({}, task, {
                status: state.completed ? 'COMPLETED' : state.drafted ? 'DRAFTED' : 'PENDING',
                completed: state.completed,
                drafted: state.drafted
            }));
        });
        var completedCount = tasks.filter(function count(task) { return task.completed; }).length;
        return output(true, cache.workspace ? 'COMPANY_SETUP_READY' : 'COMPANY_SETUP_NOT_LOADED', cache.workspace
            ? 'Company setup workspace is ready.'
            : 'Company setup workspace has not loaded yet.', {
            workspace: cache.workspace,
            company: cache.company,
            tasks: tasks,
            completedTasks: completedCount,
            totalTasks: tasks.length,
            overallProgress: tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0,
            coreProgress: Number(cache.workspace?.progress || 0),
            estimatedMinutesRemaining: tasks.filter(function pending(task) { return !task.completed; })
                .reduce(function sum(total, task) { return total + Number(task.minutes || 0); }, 0),
            loading: !!cache.loading,
            error: cache.error
        });
    }

    async function loadWorkspace(context) {
        var access = requireCompanyOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return output(false, 'COMPANY_SETUP_DISABLED', 'Durable company setup orchestration is disabled.');
        if (cache.loading) return cache.loading;
        var supabase = client();
        if (!supabase?.rpc) return output(false, 'SUPABASE_UNAVAILABLE', 'Supabase company setup is unavailable.');

        cache.loading = (async function load() {
            try {
                var response = await supabase.rpc('arth_get_or_create_company_setup');
                if (response.error) throw response.error;
                if (!response.data?.ok || !response.data?.workspace) {
                    throw new Error('Company setup workspace was not returned.');
                }
                cache.workspace = response.data.workspace;
                cache.company = response.data.company || null;
                cache.error = '';
                flushAuditQueue({ actor: access.actor });
                return setupHome();
            } catch (error) {
                cache.error = error?.message || String(error);
                return classifiedError(error, 'COMPANY_SETUP_LOAD_FAILED', 'Configuration Error: the company setup workspace could not be loaded.');
            } finally {
                cache.loading = null;
            }
        }());
        return cache.loading;
    }

    async function saveStep(input, context) {
        var access = requireCompanyOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return output(false, 'COMPANY_SETUP_DISABLED', 'Durable company setup orchestration is disabled.');
        var stepKey = String(input?.stepKey || '').trim();
        if (!CORE_STEPS.includes(stepKey)) {
            return output(false, 'COMPANY_SETUP_STEP_INVALID', 'Company setup step is invalid.');
        }
        var payload = input?.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
            ? input.payload
            : {};
        return enqueueMutation(async function persistStep() {
            if (!cache.workspace) {
                var loaded = await loadWorkspace({ actor: access.actor });
                if (!loaded.ok) return loaded;
            }
            var supabase = client();
            var operationKey = String(input?.idempotencyKey || operationId('setup-step'));
            var lastFailure = null;
            for (var attempt = 1; attempt <= 3; attempt += 1) {
                try {
                    var response = await supabase.rpc('arth_save_company_setup_step', {
                        p_step_key: stepKey,
                        p_payload: payload,
                        p_expected_revision: Number(input?.expectedRevision ?? cache.workspace.revision ?? 0),
                        p_idempotency_key: operationKey,
                        p_complete: input?.complete !== false
                    });
                    if (response.error) throw response.error;
                    if (!response.data?.ok || !response.data?.workspace) throw new Error('Company setup save was not confirmed.');
                    cache.workspace = response.data.workspace;
                    flushAuditQueue({ actor: access.actor });
                    return output(true, 'COMPANY_SETUP_STEP_SAVED', input?.complete === false
                        ? 'Company setup draft saved.'
                        : 'Company setup step completed.', {
                        workspace: cache.workspace,
                        version: response.data.version || null,
                        home: setupHome(),
                        attempts: attempt
                    });
                } catch (error) {
                    lastFailure = classifiedError(error, 'COMPANY_SETUP_STEP_SAVE_FAILED', 'Database Error: company setup progress could not be saved.');
                    if (!lastFailure.retryable || attempt >= 3) break;
                    if (lastFailure.code === 'COMPANY_SETUP_CONFLICT') {
                        var refreshed = await loadWorkspace({ actor: access.actor });
                        if (!refreshed.ok) return refreshed;
                    }
                    await delay(attempt * 350);
                }
            }
            return lastFailure;
        });
    }

    async function completeCoreSetup(options, context) {
        var access = requireCompanyOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return output(false, 'COMPANY_SETUP_DISABLED', 'Durable company setup orchestration is disabled.');
        return enqueueMutation(async function completeSetup() {
            if (!cache.workspace) {
                var loaded = await loadWorkspace({ actor: access.actor });
                if (!loaded.ok) return loaded;
            }
            var supabase = client();
            try {
                var response = await supabase.rpc('arth_complete_company_core_setup', {
                    p_expected_revision: Number(options?.expectedRevision ?? cache.workspace.revision ?? 0),
                    p_idempotency_key: String(options?.idempotencyKey || operationId('core-setup-complete'))
                });
                if (response.error) throw response.error;
                if (!response.data?.ok || !response.data?.workspace) throw new Error('Core company setup completion was not confirmed.');
                cache.workspace = response.data.workspace;
                flushAuditQueue({ actor: access.actor });
                return output(true, 'COMPANY_CORE_SETUP_COMPLETED', 'Core company setup completed.', {
                    workspace: cache.workspace,
                    lifecycle: response.data.lifecycle || null,
                    home: setupHome()
                });
            } catch (error) {
                return classifiedError(error, 'COMPANY_CORE_SETUP_FAILED', 'Database Error: core company setup could not be completed.');
            }
        });
    }

    function getDraft() {
        return freeze(cache.workspace?.draft_payload || {});
    }

    var service = Object.freeze({
        FLAG: FLAG,
        CORE_STEPS: CORE_STEPS,
        SETUP_TASKS: SETUP_TASKS,
        isEnabled: enabled,
        loadWorkspace: loadWorkspace,
        refresh: loadWorkspace,
        saveStep: saveStep,
        completeCoreSetup: completeCoreSetup,
        flushAuditQueue: flushAuditQueue,
        getWorkspace: function getWorkspace() { return freeze(cache.workspace); },
        getDraft: getDraft,
        getAuditState: function getAuditState() { return freeze(Object.assign({}, cache.audit)); },
        getSetupHome: setupHome
    });

    global.CompanySetupOrchestrationService = service;
    global.companySetupOrchestrationService = service;
    global.addEventListener?.('online', function retryCompanySetupAudit() {
        var actor = actorFrom({});
        if (actor?.companyOwner === true) flushAuditQueue({ actor: actor });
    });
}(typeof window !== 'undefined' ? window : globalThis));
