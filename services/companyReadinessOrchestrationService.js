// Tenant-scoped readiness orchestration and audited Company Owner handoff.
(function attachCompanyReadinessOrchestrationService(global) {
    'use strict';

    var FLAG = 'USE_COMPANY_SETUP_ORCHESTRATION';

    function normalizeRole(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function freeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeChild(key) { freeze(value[key]); });
        return Object.freeze(value);
    }

    function result(ok, code, message, data) {
        return freeze(Object.assign({
            success: !!ok,
            ok: !!ok,
            code: code,
            message: message
        }, data || {}));
    }

    function enabled() {
        return !!global.supabaseClientService?.isEnabled?.(FLAG);
    }

    function client() {
        return global.supabaseClientService?.getClient?.() || null;
    }

    function operationId(prefix) {
        var id = '';
        try {
            id = global.crypto?.randomUUID?.() || '';
        } catch (_error) {}
        if (!id) id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        return String(prefix || 'company-readiness') + ':' + id;
    }

    async function trustedContext() {
        var actor = global.authService?.getCurrentUser?.()
            || global.__ARTHHRMS_AUTH_CONTEXT__?.actor
            || {};
        if (actor && typeof actor.then === 'function') actor = await actor;
        var role = normalizeRole(actor?.role);
        var tenantId = String(actor?.tenantId || actor?.tenant_id || actor?.tenantSlug || '').trim();
        var organizationId = String(actor?.organizationId || actor?.organization_id || '').trim();
        if (!actor?.id || role !== 'super_admin') {
            return result(false, 'COMPANY_OWNER_REQUIRED', 'Company Owner authorization is required.');
        }
        if (!tenantId || !organizationId) {
            return result(false, 'TRUSTED_TENANT_REQUIRED', 'Trusted tenant and organization claims are required.');
        }
        return result(true, 'COMPANY_OWNER_AUTHORIZED', 'Company Owner authorization is valid.', {
            actor: Object.assign({}, actor, {
                role: role,
                tenantId: tenantId,
                tenantSlug: tenantId,
                organizationId: organizationId
            }),
            tenantId: tenantId,
            organizationId: organizationId,
            context: {
                tenantSlug: tenantId,
                tenantId: tenantId,
                organizationId: organizationId,
                actor: Object.assign({}, actor, {
                    role: role,
                    tenantId: tenantId,
                    tenantSlug: tenantId,
                    organizationId: organizationId
                })
            }
        });
    }

    function core() {
        return global.GoLiveValidationService || global.goLiveValidationService || null;
    }

    async function loadRequest(tenantId) {
        var supabase = client();
        if (!supabase) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase is unavailable.');
        try {
            var response = await supabase
                .from('platform_company_readiness_requests')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('requested_at', { ascending: false })
                .limit(1);
            if (response.error) throw response.error;
            return result(true, 'READINESS_REQUEST_LOADED', 'Readiness request loaded.', {
                request: response.data?.[0] || null
            });
        } catch (error) {
            return result(false, 'READINESS_REQUEST_LOAD_FAILED', error?.message || 'Readiness request could not be loaded.');
        }
    }

    async function generateDashboard() {
        var access = await trustedContext();
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'COMPANY_READINESS_DISABLED', 'Company readiness orchestration is disabled.');
        if (!core()?.generateDashboard) {
            return result(false, 'READINESS_SERVICE_UNAVAILABLE', 'Go-live validation service is unavailable.');
        }
        var dashboard = core().generateDashboard(
            { tenantSlug: access.tenantId },
            access.context
        );
        if (!dashboard?.success) return dashboard;
        var requestResult = await loadRequest(access.tenantId);
        return result(true, 'COMPANY_READINESS_DASHBOARD_READY', 'Company readiness dashboard is ready.', {
            tenantId: access.tenantId,
            organizationId: access.organizationId,
            dashboard: dashboard,
            readinessRequest: requestResult.ok ? requestResult.request : null,
            readinessRequestWarning: requestResult.ok ? '' : requestResult.message
        });
    }

    async function runValidation(options) {
        var access = await trustedContext();
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'COMPANY_READINESS_DISABLED', 'Company readiness orchestration is disabled.');
        if (!core()?.runValidation) {
            return result(false, 'READINESS_SERVICE_UNAVAILABLE', 'Go-live validation service is unavailable.');
        }
        var validation = core().runValidation({
            tenantSlug: access.tenantId,
            mode: String(options?.mode || 'FULL').toUpperCase()
        }, access.context);
        if (!validation?.success) return validation;
        try {
            await global.supabasePersistenceService?.flush?.();
        } catch (error) {
            return result(false, 'READINESS_PERSISTENCE_FAILED', error?.message || 'Validation could not be persisted.');
        }
        return result(true, 'COMPANY_VALIDATION_COMPLETED', 'Company validation completed.', {
            validation: validation
        });
    }

    function existingApproval(runId, tenantId) {
        var state = global.DB?.get?.() || {};
        return (state.goLiveApprovals || []).find(function findApproval(row) {
            return String(row?.runId || '') === String(runId || '')
                && String(row?.tenantSlug || row?.tenantId || '') === tenantId
                && row?.status === 'APPROVED_FOR_CERTIFICATION';
        }) || null;
    }

    async function submitForPilot(input) {
        var access = await trustedContext();
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'COMPANY_READINESS_DISABLED', 'Company readiness orchestration is disabled.');
        var supabase = client();
        if (!supabase) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase is unavailable.');
        var validationRunId = String(input?.validationRunId || '').trim();
        if (!validationRunId) return result(false, 'VALIDATION_RUN_REQUIRED', 'A passing validation run is required.');

        var dashboard = core()?.generateDashboard?.(
            { tenantSlug: access.tenantId },
            access.context
        );
        var run = (dashboard?.validationHistory || []).find(function findRun(row) {
            return String(row?.runId || '') === validationRunId;
        });
        if (!run || run.status !== 'READY_FOR_APPROVAL' || run.certificationEligible !== true
            || (run.blockingIssues || []).length) {
            return result(false, 'READINESS_SUBMISSION_BLOCKED', 'Resolve every blocking validation issue before requesting pilot review.');
        }

        var approval = existingApproval(validationRunId, access.tenantId);
        if (!approval) {
            var approvalResult = core()?.approveGoLive?.({
                tenantSlug: access.tenantId,
                runId: validationRunId,
                administratorConfirmed: true,
                reason: String(input?.reason || 'Company Owner submitted the organization for Platform Owner pilot review.')
            }, access.context);
            if (!approvalResult?.success) return approvalResult;
            approval = approvalResult.approval;
        }

        try {
            await global.supabasePersistenceService?.flush?.();
            var rpc = await supabase.rpc('arth_submit_company_readiness_review', {
                p_validation_run_id: validationRunId,
                p_idempotency_key: String(input?.idempotencyKey || operationId('readiness-submit'))
            });
            if (rpc.error) throw rpc.error;
            return result(true, 'PILOT_REVIEW_REQUESTED', 'Pilot review was submitted to the Platform Owner.', {
                approval: approval,
                request: rpc.data?.request || null,
                lifecycle: rpc.data?.lifecycle || null,
                replayed: !!rpc.data?.replayed
            });
        } catch (error) {
            return result(false, 'PILOT_REVIEW_REQUEST_FAILED', error?.message || 'Pilot review could not be submitted.');
        }
    }

    var service = Object.freeze({
        FLAG: FLAG,
        isEnabled: enabled,
        generateDashboard: generateDashboard,
        runValidation: runValidation,
        submitForPilot: submitForPilot
    });

    global.CompanyReadinessOrchestrationService = service;
    global.companyReadinessOrchestrationService = service;
}(typeof window !== 'undefined' ? window : globalThis));
