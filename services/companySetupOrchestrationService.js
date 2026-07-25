// Durable tenant setup workspace adapter for the Company Administration plane.
(function attachCompanySetupOrchestrationService(global) {
    'use strict';

    var FLAG = 'USE_COMPANY_SETUP_ORCHESTRATION';
    var CORE_STEPS = Object.freeze([
        'organizationInformation',
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
        { key: 'companyProfile', label: 'Company Profile', route: 'company-profile-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'branding', label: 'Branding', route: 'company-profile-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'legalInformation', label: 'Legal Information', route: 'company-profile-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'locations', label: 'Locations', route: 'company-profile-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'departments', label: 'Departments', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'businessUnits', label: 'Business Units', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'designations', label: 'Designations', route: 'organization-import-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'workingCalendar', label: 'Working Calendar', route: 'working-calendar-center.html', owner: 'Company Owner', minutes: 15 },
        { key: 'holidayCalendar', label: 'Holiday Calendar', route: 'working-calendar-center.html', owner: 'Company Owner', minutes: 10 },
        { key: 'attendanceRules', label: 'Attendance Rules', route: 'attendance-policy-center.html', owner: 'HR Admin', minutes: 20 },
        { key: 'leaveRules', label: 'Leave Rules', route: 'leave-policy-center.html', owner: 'HR Admin', minutes: 20 },
        { key: 'payrollBasics', label: 'Payroll Basics', route: 'payroll-configuration-center.html', owner: 'Company Owner', minutes: 25 },
        { key: 'approvalWorkflow', label: 'Approval Workflow', route: 'organization-hierarchy-center.html', owner: 'HR Admin', minutes: 20 },
        { key: 'companyOwner', label: 'Company Owner', route: 'super-admin.html', owner: 'Company Owner', minutes: 0 },
        { key: 'hrAdmin', label: 'HR Admin', route: 'super-admin.html', owner: 'Company Owner', minutes: 5 },
        { key: 'managers', label: 'Managers', route: 'organization-hierarchy-center.html', owner: 'HR Admin', minutes: 15 },
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
        error: ''
    };

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

    function completedSet() {
        return new Set(Array.isArray(cache.workspace?.completed_steps) ? cache.workspace.completed_steps : []);
    }

    function taskState(task, completed) {
        var mappings = {
            companyProfile: 'organizationInformation',
            branding: 'organizationInformation',
            legalInformation: 'organizationInformation',
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
                return setupHome();
            } catch (error) {
                cache.error = error?.message || String(error);
                return output(false, 'COMPANY_SETUP_LOAD_FAILED', cache.error);
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
        if (!cache.workspace) {
            var loaded = await loadWorkspace({ actor: access.actor });
            if (!loaded.ok) return loaded;
        }
        var payload = input?.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
            ? input.payload
            : {};
        var supabase = client();
        try {
            var response = await supabase.rpc('arth_save_company_setup_step', {
                p_step_key: stepKey,
                p_payload: payload,
                p_expected_revision: Number(input?.expectedRevision ?? cache.workspace.revision ?? 0),
                p_idempotency_key: String(input?.idempotencyKey || operationId('setup-step')),
                p_complete: input?.complete !== false
            });
            if (response.error) throw response.error;
            if (!response.data?.ok || !response.data?.workspace) throw new Error('Company setup save was not confirmed.');
            cache.workspace = response.data.workspace;
            return output(true, 'COMPANY_SETUP_STEP_SAVED', 'Company setup progress saved.', {
                workspace: cache.workspace,
                version: response.data.version || null,
                home: setupHome()
            });
        } catch (error) {
            return output(false, 'COMPANY_SETUP_STEP_SAVE_FAILED', error?.message || 'Company setup progress could not be saved.');
        }
    }

    async function completeCoreSetup(options, context) {
        var access = requireCompanyOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return output(false, 'COMPANY_SETUP_DISABLED', 'Durable company setup orchestration is disabled.');
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
            return output(true, 'COMPANY_CORE_SETUP_COMPLETED', 'Core company setup completed.', {
                workspace: cache.workspace,
                lifecycle: response.data.lifecycle || null,
                home: setupHome()
            });
        } catch (error) {
            return output(false, 'COMPANY_CORE_SETUP_FAILED', error?.message || 'Core company setup could not be completed.');
        }
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
        getWorkspace: function getWorkspace() { return freeze(cache.workspace); },
        getDraft: getDraft,
        getSetupHome: setupHome
    });

    global.CompanySetupOrchestrationService = service;
    global.companySetupOrchestrationService = service;
}(typeof window !== 'undefined' ? window : globalThis));
