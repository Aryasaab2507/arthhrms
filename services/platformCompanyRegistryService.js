// Durable Platform Owner company registry and tenant lifecycle adapter.
(function attachPlatformCompanyRegistryService(global) {
    'use strict';

    var FLAG = 'USE_PLATFORM_COMPANY_REGISTRY';
    var LIFECYCLE_STATES = Object.freeze([
        'DRAFT', 'PROVISIONED', 'OWNER_INVITED', 'OWNER_ACCEPTED',
        'CONFIGURING', 'ORG_STRUCTURE', 'POLICIES', 'HR_READY',
        'EMPLOYEE_IMPORT', 'VALIDATION', 'READY_FOR_REVIEW',
        'PILOT', 'LIVE', 'SUSPENDED', 'ARCHIVED', 'FAILED'
    ]);
    var ONBOARDING_STAGES = Object.freeze([
        'setup_only', 'pilot_group', 'limited_activation', 'full_activation'
    ]);
    var cache = {
        loaded: false,
        loading: null,
        companies: [],
        lifecycle: [],
        invitations: [],
        events: [],
        readinessRequests: [],
        error: ''
    };

    function freeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeChild(key) { freeze(value[key]); });
        return Object.freeze(value);
    }

    function result(ok, code, message, data) {
        return freeze(Object.assign({ success: !!ok, ok: !!ok, code: code, message: message }, data || {}));
    }

    function normalizeRole(value) {
        return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function normalizeSlug(value) {
        if (global.TenantProvisioningService?.normalizeTenantSlug) {
            return global.TenantProvisioningService.normalizeTenantSlug(value);
        }
        return String(value || '').trim().toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function actorFrom(context) {
        return context?.actor || global.authService?.getCurrentUser?.() || {};
    }

    function requirePlatformOwner(context) {
        var actor = actorFrom(context);
        if (normalizeRole(actor.role) !== 'platform_owner' || !actor.id) {
            return result(false, 'PLATFORM_OWNER_REQUIRED', 'Platform Owner authorization is required.');
        }
        return result(true, 'PLATFORM_OWNER_AUTHORIZED', 'Platform Owner authorization is valid.', { actor: actor });
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
        return String(prefix || 'platform') + ':' + id;
    }

    function normalizePayload(payload) {
        var source = payload && typeof payload === 'object' ? payload : {};
        var companyName = String(source.company_name || source.companyName || source.name || '').trim();
        var slug = normalizeSlug(source.tenant_slug || source.tenantSlug || source.slug || companyName);
        return {
            companyName: companyName,
            slug: slug,
            tenantId: String(source.tenant_id || source.tenantId || slug).trim(),
            organizationId: String(source.organization_id || source.organizationId || slug).trim(),
            companyEmail: String(source.company_email || source.companyEmail || source.email || '').trim().toLowerCase(),
            companyPhone: String(source.company_phone || source.companyPhone || source.phone || '').trim(),
            companySize: String(source.company_size || source.companySize || '').trim(),
            planType: String(source.plan_type || source.planType || 'enterprise').trim().toLowerCase(),
            timezone: String(source.timezone || 'Asia/Kolkata').trim(),
            country: String(source.country || 'India').trim()
        };
    }

    function lifecycleFor(company) {
        return cache.lifecycle.find(function findLifecycle(row) {
            return row.company_id === company.id;
        }) || null;
    }

    function invitationsFor(company) {
        return cache.invitations.filter(function filterInvitation(row) {
            return row.company_id === company.id;
        });
    }

    function readinessFor(company) {
        return cache.readinessRequests.find(function findReadiness(row) {
            return row.company_id === company.id;
        }) || null;
    }

    function eventsFor(company) {
        return cache.events.filter(function filterEvent(row) {
            return row.company_id === company.id;
        });
    }

    function onboardingStageFor(state) {
        if (state === 'PILOT') return 'pilot_group';
        if (state === 'LIVE') return 'full_activation';
        if (['OWNER_ACCEPTED', 'CONFIGURING', 'ORG_STRUCTURE', 'POLICIES', 'HR_READY', 'EMPLOYEE_IMPORT', 'VALIDATION', 'READY_FOR_REVIEW'].includes(state)) {
            return 'limited_activation';
        }
        return 'setup_only';
    }

    function legacyTenant(company) {
        var lifecycle = lifecycleFor(company) || {};
        var invitations = invitationsFor(company);
        var events = eventsFor(company);
        var readiness = readinessFor(company);
        var state = String(lifecycle.state || company.status || 'DRAFT').toUpperCase();
        var metadata = company.metadata && typeof company.metadata === 'object' ? company.metadata : {};
        var ownerProfile = metadata.companyOwner && typeof metadata.companyOwner === 'object'
            ? metadata.companyOwner
            : {};
        return freeze({
            id: company.id,
            companyId: company.id,
            tenantId: company.tenant_id,
            organizationId: company.organization_id,
            companyName: company.company_name,
            tenantSlug: company.slug,
            subdomain: '',
            companyEmail: company.company_email || '',
            companyPhone: company.company_phone || '',
            companySize: company.company_size || '',
            planType: company.plan_type || 'enterprise',
            timezone: company.timezone || 'Asia/Kolkata',
            country: company.country || 'India',
            lifecycleState: state,
            onboardingStage: onboardingStageFor(state),
            departments: [],
            roleMatrix: ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN'],
            progress: Number(lifecycle.progress || 0),
            currentOwnerRole: lifecycle.current_owner_role || 'platform_owner',
            nextAction: lifecycle.next_action || '',
            blockers: Array.isArray(lifecycle.blockers) ? lifecycle.blockers : [],
            ownerEmail: company.owner_email || '',
            ownerAuthUserId: company.owner_auth_user_id || '',
            invitationStatus: invitations[0]?.status || '',
            invitation: invitations[0] || null,
            invitations: invitations,
            lifecycleEvents: events,
            ownerProfile: ownerProfile,
            readinessRequestId: readiness?.id || '',
            readinessStatus: readiness?.status || '',
            readinessScore: Number(readiness?.readiness_score || 0),
            readinessRevision: Number(readiness?.revision || 0),
            readinessRequestedAt: readiness?.requested_at || '',
            revision: Number(company.revision || 0),
            createdAt: company.created_at || '',
            updatedAt: company.updated_at || '',
            metadata: metadata
        });
    }

    function refreshCacheRows(companies, lifecycle, invitations, events, readinessRequests) {
        cache.companies = Array.isArray(companies) ? companies.slice() : [];
        cache.lifecycle = Array.isArray(lifecycle) ? lifecycle.slice() : [];
        cache.invitations = Array.isArray(invitations) ? invitations.slice() : [];
        cache.events = Array.isArray(events) ? events.slice() : [];
        cache.readinessRequests = Array.isArray(readinessRequests) ? readinessRequests.slice() : [];
        cache.loaded = true;
        cache.error = '';
    }

    async function loadRegistry(context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        if (cache.loading) return cache.loading;
        var supabase = client();
        if (!supabase?.from) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase platform registry is unavailable.');

        cache.loading = (async function load() {
            try {
                var expiryResult = await supabase.rpc('arth_platform_expire_owner_invitations');
                if (expiryResult.error) throw expiryResult.error;
                var companyQuery = await supabase
                    .from('platform_companies')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (companyQuery.error) throw companyQuery.error;
                var lifecycleQuery = await supabase
                    .from('platform_tenant_lifecycle')
                    .select('*');
                if (lifecycleQuery.error) throw lifecycleQuery.error;
                var invitationQuery = await supabase
                    .from('platform_company_invitations')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (invitationQuery.error) throw invitationQuery.error;
                var eventsQuery = await supabase
                    .from('platform_lifecycle_events')
                    .select('*')
                    .order('occurred_at', { ascending: false });
                if (eventsQuery.error) throw eventsQuery.error;
                var readinessQuery = await supabase
                    .from('platform_company_readiness_requests')
                    .select('*')
                    .order('requested_at', { ascending: false });
                if (readinessQuery.error) throw readinessQuery.error;
                refreshCacheRows(companyQuery.data, lifecycleQuery.data, invitationQuery.data, eventsQuery.data, readinessQuery.data);
                return result(true, 'PLATFORM_REGISTRY_LOADED', 'Platform company registry loaded.', {
                    tenants: cache.companies.map(legacyTenant),
                    summary: summarize()
                });
            } catch (error) {
                cache.error = error?.message || String(error);
                return result(false, 'PLATFORM_REGISTRY_LOAD_FAILED', 'Platform company registry could not be loaded.', {
                    error: cache.error
                });
            } finally {
                cache.loading = null;
            }
        }());
        return cache.loading;
    }

    function summarize() {
        return cache.companies.reduce(function aggregate(acc, company) {
            var state = String(company.status || 'DRAFT').toUpperCase();
            acc.total += 1;
            acc[state] = (acc[state] || 0) + 1;
            return acc;
        }, { total: 0 });
    }

    function getTenants() {
        return freeze(cache.companies.map(legacyTenant));
    }

    function getReadinessRequests(context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        return result(true, 'READINESS_REQUESTS_READY', 'Company readiness requests are ready.', {
            requests: cache.readinessRequests.slice()
        });
    }

    function getTenantProvisioningView(context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        return result(true, cache.loaded ? 'PLATFORM_REGISTRY_READY' : 'PLATFORM_REGISTRY_LOADING', cache.loaded
            ? 'Platform company registry is ready.'
            : 'Platform company registry has not loaded yet.', {
            tenants: getTenants(),
            summary: summarize(),
            loading: !!cache.loading,
            loaded: cache.loaded,
            error: cache.error
        });
    }

    function getCompanyWorkspace(companyId, context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        var company = cache.companies.find(function findCompany(row) {
            return row.id === companyId;
        });
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Company registry record was not found.');
        var tenant = legacyTenant(company);
        return result(true, 'PLATFORM_COMPANY_WORKSPACE_READY', 'Platform company onboarding workspace is ready.', {
            company: tenant,
            lifecycle: lifecycleFor(company),
            invitations: invitationsFor(company),
            events: eventsFor(company),
            readiness: readinessFor(company)
        });
    }

    async function transitionCompany(companyId, expectedRevision, requestedState, options) {
        var context = options?.context || options || {};
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        var state = String(requestedState || '').trim().toUpperCase();
        if (!LIFECYCLE_STATES.includes(state)) {
            return result(false, 'LIFECYCLE_STATE_INVALID', 'The requested lifecycle state is invalid.');
        }
        var supabase = client();
        if (!supabase?.rpc) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase platform lifecycle is unavailable.');
        try {
            var rpcResult = await supabase.rpc('arth_platform_transition_company', {
                p_company_id: companyId,
                p_expected_revision: Number(expectedRevision || 0),
                p_new_state: state,
                p_reason: String(options?.reason || 'Platform lifecycle transition.'),
                p_idempotency_key: String(options?.idempotencyKey || operationId('lifecycle')),
                p_correlation_id: String(options?.correlationId || ''),
                p_payload: options?.payload || {}
            });
            if (rpcResult.error) throw rpcResult.error;
            await loadRegistry(Object.assign({}, context, { actor: access.actor }));
            return result(true, 'LIFECYCLE_TRANSITION_COMPLETED', 'Company lifecycle was updated.', rpcResult.data || {});
        } catch (error) {
            return result(false, 'LIFECYCLE_TRANSITION_FAILED', error?.message || 'Company lifecycle update failed.');
        }
    }

    async function createCompany(payload, options) {
        var context = options?.context || options || {};
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        var normalized = normalizePayload(payload);
        if (!normalized.companyName || normalized.companyName.length < 2) {
            return result(false, 'COMPANY_NAME_REQUIRED', 'A valid company name is required.');
        }
        var validation = global.TenantProvisioningService?.validateTenantSlug?.(normalized.slug, {
            tenants: getTenants()
        });
        if (validation && validation.valid === false) {
            return result(false, validation.failures?.[0]?.failureCode || 'TENANT_SLUG_INVALID', validation.failures?.[0]?.message || 'Tenant slug is invalid.', {
                failures: validation.failures,
                warnings: validation.warnings || []
            });
        }
        var supabase = client();
        if (!supabase?.rpc) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase platform registry is unavailable.');
        try {
            var createResult = await supabase.rpc('arth_platform_create_company', {
                p_company_name: normalized.companyName,
                p_slug: normalized.slug,
                p_tenant_id: normalized.tenantId,
                p_organization_id: normalized.organizationId,
                p_company_email: normalized.companyEmail,
                p_company_phone: normalized.companyPhone,
                p_company_size: normalized.companySize,
                p_plan_type: normalized.planType,
                p_timezone: normalized.timezone,
                p_country: normalized.country,
                p_idempotency_key: String(options?.idempotencyKey || operationId('company-create')),
                p_correlation_id: String(options?.correlationId || '')
            });
            if (createResult.error) throw createResult.error;
            var createdCompany = createResult.data?.company || {};
            if (options?.provision === false) {
                await loadRegistry({ actor: access.actor });
                return result(true, 'PLATFORM_COMPANY_CREATED', 'Company registry record created.', {
                    created: true,
                    tenant: legacyTenant(createdCompany),
                    company: createdCompany,
                    lifecycle: createResult.data?.lifecycle || null,
                    failures: [],
                    warnings: []
                });
            }
            var provisionResult = await transitionCompany(createdCompany.id, createdCompany.revision, 'PROVISIONED', {
                context: { actor: access.actor },
                reason: 'Tenant provisioning completed.',
                idempotencyKey: String(options?.provisionIdempotencyKey || operationId('tenant-provision')),
                correlationId: String(options?.correlationId || ''),
                payload: { slug: normalized.slug }
            });
            if (!provisionResult.ok) {
                return result(false, 'TENANT_PROVISIONING_INCOMPLETE', 'Company was created as a draft, but tenant provisioning did not complete.', {
                    company: createdCompany,
                    failures: [{ failureCode: provisionResult.code, message: provisionResult.message }]
                });
            }
            var company = provisionResult.company || createdCompany;
            await loadRegistry({ actor: access.actor });
            return result(true, 'TENANT_PROVISIONED', 'Tenant provisioned successfully.', {
                created: true,
                tenant: legacyTenant(company),
                company: company,
                lifecycle: provisionResult.lifecycle,
                failures: [],
                warnings: []
            });
        } catch (error) {
            return result(false, 'PLATFORM_COMPANY_CREATE_FAILED', error?.message || 'Company creation failed.', {
                created: false,
                tenant: null,
                failures: [{ failureCode: 'PLATFORM_COMPANY_CREATE_FAILED', message: error?.message || 'Company creation failed.' }]
            });
        }
    }

    async function createCompanyDraft(payload, options) {
        return createCompany(payload, Object.assign({}, options || {}, { provision: false }));
    }

    async function provisionCompany(companyId, options) {
        var context = options?.context || options || {};
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!cache.loaded) {
            var loaded = await loadRegistry({ actor: access.actor });
            if (!loaded.ok) return loaded;
        }
        var company = cache.companies.find(function findCompany(row) {
            return row.id === companyId;
        });
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Company registry record was not found.');
        if (company.status === 'PROVISIONED') {
            return result(true, 'TENANT_ALREADY_PROVISIONED', 'Tenant is already provisioned.', {
                tenant: legacyTenant(company),
                company: company,
                lifecycle: lifecycleFor(company),
                replayed: true
            });
        }
        if (company.status !== 'DRAFT') {
            return result(false, 'TENANT_PROVISION_STATE_INVALID', 'Tenant provisioning is available only for a draft company.');
        }
        var provisioned = await transitionCompany(company.id, company.revision, 'PROVISIONED', {
            context: { actor: access.actor },
            reason: 'Tenant provisioning completed from the Platform Owner onboarding workspace.',
            idempotencyKey: String(options?.idempotencyKey || operationId('tenant-provision')),
            correlationId: String(options?.correlationId || ''),
            payload: { slug: company.slug, source: 'company-setup.html' }
        });
        if (!provisioned.ok) return provisioned;
        var provisionedCompany = provisioned.company || cache.companies.find(function findProvisioned(row) {
            return row.id === company.id;
        });
        return result(true, 'TENANT_PROVISIONED', 'Tenant provisioned successfully.', {
            tenant: provisionedCompany ? legacyTenant(provisionedCompany) : null,
            company: provisionedCompany || null,
            lifecycle: provisioned.lifecycle || (provisionedCompany ? lifecycleFor(provisionedCompany) : null),
            replayed: !!provisioned.replayed
        });
    }

    async function retryProvisioning(companyId, options) {
        var context = options?.context || options || {};
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!cache.loaded) {
            var loaded = await loadRegistry({ actor: access.actor });
            if (!loaded.ok) return loaded;
        }
        var company = cache.companies.find(function findCompany(row) {
            return row.id === companyId;
        });
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Company registry record was not found.');
        if (company.status !== 'FAILED') return provisionCompany(companyId, options);
        var reset = await transitionCompany(company.id, company.revision, 'DRAFT', {
            context: { actor: access.actor },
            reason: 'Tenant provisioning retry requested.',
            idempotencyKey: String(options?.resetIdempotencyKey || operationId('tenant-provision-reset')),
            correlationId: String(options?.correlationId || ''),
            payload: { source: 'company-setup.html' }
        });
        if (!reset.ok) return reset;
        return provisionCompany(companyId, options);
    }

    async function updateCompany(companyId, payload, options) {
        var context = options?.context || options || {};
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        if (!cache.loaded) {
            var loaded = await loadRegistry({ actor: access.actor });
            if (!loaded.ok) return loaded;
        }
        var company = cache.companies.find(function findCompany(row) {
            return row.id === companyId;
        });
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Company registry record was not found.');
        var normalized = normalizePayload(Object.assign({}, company, payload || {}));
        var ownerProfile = payload?.ownerProfile && typeof payload.ownerProfile === 'object'
            ? payload.ownerProfile
            : {};
        var changeType = String(options?.changeType || 'COMPANY_INFORMATION').trim().toUpperCase();
        var supabase = client();
        if (!supabase?.rpc) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase platform registry is unavailable.');
        try {
            var response = await supabase.rpc('arth_platform_update_company', {
                p_company_id: company.id,
                p_expected_revision: Number(options?.expectedRevision ?? company.revision ?? 0),
                p_company_name: normalized.companyName,
                p_slug: normalized.slug,
                p_tenant_id: normalized.tenantId,
                p_organization_id: normalized.organizationId,
                p_company_email: normalized.companyEmail,
                p_company_phone: normalized.companyPhone,
                p_company_size: normalized.companySize,
                p_plan_type: normalized.planType,
                p_timezone: normalized.timezone,
                p_country: normalized.country,
                p_owner_profile: ownerProfile,
                p_change_type: changeType,
                p_idempotency_key: String(options?.idempotencyKey || operationId('company-update')),
                p_correlation_id: String(options?.correlationId || '')
            });
            if (response.error) throw response.error;
            await loadRegistry({ actor: access.actor });
            var updated = response.data?.company || null;
            return result(true, changeType === 'OWNER_PROFILE' ? 'COMPANY_OWNER_PROFILE_SAVED' : 'COMPANY_INFORMATION_SAVED', changeType === 'OWNER_PROFILE'
                ? 'Company Owner profile saved.'
                : 'Company information saved.', {
                company: updated,
                tenant: updated ? legacyTenant(updated) : getTenants().find(function match(row) { return row.companyId === company.id; }),
                lifecycle: response.data?.lifecycle || null,
                replayed: !!response.data?.replayed
            });
        } catch (error) {
            return result(false, 'PLATFORM_COMPANY_UPDATE_FAILED', error?.message || 'Company onboarding information could not be saved.');
        }
    }

    async function saveCompanyOwnerProfile(companyId, profile, options) {
        var company = cache.companies.find(function findCompany(row) {
            return row.id === companyId;
        });
        if (!company) {
            var context = options?.context || options || {};
            var loaded = await loadRegistry(context);
            if (!loaded.ok) return loaded;
            company = cache.companies.find(function findLoadedCompany(row) {
                return row.id === companyId;
            });
        }
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Company registry record was not found.');
        return updateCompany(companyId, {
            company_name: company.company_name,
            tenant_slug: company.slug,
            tenant_id: company.tenant_id,
            organization_id: company.organization_id,
            company_email: company.company_email,
            company_phone: company.company_phone,
            company_size: company.company_size,
            plan_type: company.plan_type,
            timezone: company.timezone,
            country: company.country,
            ownerProfile: Object.assign({}, profile || {}, {
                role: 'super_admin',
                persona: 'company_owner'
            })
        }, Object.assign({}, options || {}, {
            changeType: 'OWNER_PROFILE',
            expectedRevision: Number(options?.expectedRevision ?? company.revision ?? 0)
        }));
    }

    async function provisionTenant(payload, context) {
        return createCompany(payload, { context: context });
    }

    async function updateTenantActivation(slug, updates, context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        var company = cache.companies.find(function findCompany(row) {
            return normalizeSlug(row.slug) === normalizeSlug(slug) || row.tenant_id === slug || row.id === slug;
        });
        if (!company) return result(false, 'TENANT_NOT_FOUND', 'Tenant was not found.');
        var requested = String(updates?.lifecycleState || updates?.lifecycle_state || '').toUpperCase();
        var stateMap = {
            CREATED: 'PROVISIONED',
            CONFIGURING: 'CONFIGURING',
            PILOT_ACTIVE: 'PILOT',
            PRODUCTION_ACTIVE: 'LIVE'
        };
        return transitionCompany(company.id, company.revision, stateMap[requested] || requested, {
            context: { actor: access.actor },
            reason: 'Platform activation stage updated.',
            payload: { onboardingStage: updates?.onboarding_stage || updates?.onboardingStage || '' }
        });
    }

    async function reviewReadinessRequest(requestId, decision, reason, context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        var request = cache.readinessRequests.find(function findRequest(row) {
            return row.id === requestId;
        });
        if (!request) return result(false, 'READINESS_REQUEST_NOT_FOUND', 'Readiness request was not found.');
        var supabase = client();
        if (!supabase?.rpc) return result(false, 'SUPABASE_UNAVAILABLE', 'Supabase platform registry is unavailable.');
        try {
            var response = await supabase.rpc('arth_review_company_pilot_request', {
                p_request_id: request.id,
                p_decision: String(decision || '').toUpperCase(),
                p_reason: String(reason || '').trim(),
                p_expected_revision: Number(request.revision || 0),
                p_idempotency_key: operationId('pilot-review')
            });
            if (response.error) throw response.error;
            await loadRegistry({ actor: access.actor });
            return result(true, 'READINESS_REQUEST_REVIEWED', 'Company readiness request was reviewed.', {
                request: response.data?.request || null,
                lifecycle: response.data?.lifecycle || null,
                replayed: !!response.data?.replayed
            });
        } catch (error) {
            return result(false, 'READINESS_REQUEST_REVIEW_FAILED', error?.message || 'Readiness request could not be reviewed.');
        }
    }

    async function callCompanyOwnerInvitation(action, companyId, payload, context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_REGISTRY_DISABLED', 'Durable platform company registry is disabled.');
        var cfg = global.supabaseClientService?.readConfig?.() || {};
        var endpoint = cfg.SUPABASE_URL ? cfg.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/invite-company-owner' : '';
        var redirectTo = cfg.AUTH_INVITE_REDIRECT_URL || '';
        if (!cfg.flags?.USE_SUPABASE_INVITES || !endpoint || !redirectTo) {
            return result(false, 'COMPANY_OWNER_INVITE_CONFIG_MISSING', 'Company Owner invitation configuration is incomplete.');
        }
        var session = await global.authService?.getSupabaseSession?.();
        if (!session?.access_token) return result(false, 'SESSION_REQUIRED', 'A valid Platform Owner session is required.');
        var normalizedAction = String(action || 'send').trim().toLowerCase();
        if (!['send', 'resend', 'revoke'].includes(normalizedAction)) {
            return result(false, 'COMPANY_OWNER_INVITE_ACTION_INVALID', 'Company Owner invitation action is invalid.');
        }
        var idempotencyKey = String(payload?.idempotencyKey || operationId('owner-invite-' + normalizedAction));
        var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
        var timeoutId = controller ? global.setTimeout(function abortInvitationRequest() {
            controller.abort();
        }, 30000) : null;
        try {
            var response = await fetch(endpoint, {
                method: 'POST',
                signal: controller?.signal,
                headers: {
                    'Authorization': 'Bearer ' + session.access_token,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    action: normalizedAction,
                    companyId: companyId,
                    invitationId: String(payload?.invitationId || ''),
                    email: String(payload?.email || '').trim().toLowerCase(),
                    name: String(payload?.name || '').trim(),
                    phone: String(payload?.phone || '').trim(),
                    role: 'super_admin',
                    department: String(payload?.department || '').trim(),
                    reason: String(payload?.reason || '').trim(),
                    redirectTo: redirectTo,
                    idempotencyKey: idempotencyKey,
                    correlationId: String(payload?.correlationId || '')
                })
            });
            var body = await response.json().catch(function emptyBody() { return {}; });
            if (!response.ok || body.error) throw new Error(body.error || body.message || 'Company Owner invitation failed.');
            await loadRegistry({ actor: access.actor });
            var responseCode = normalizedAction === 'revoke'
                ? 'COMPANY_OWNER_INVITATION_REVOKED'
                : normalizedAction === 'resend'
                    ? 'COMPANY_OWNER_INVITATION_RESENT'
                    : 'COMPANY_OWNER_INVITED';
            var responseMessage = normalizedAction === 'revoke'
                ? 'Company Owner invitation revoked.'
                : normalizedAction === 'resend'
                    ? 'Company Owner invitation resent.'
                    : 'Company Owner invitation sent.';
            return result(true, responseCode, responseMessage, body);
        } catch (error) {
            if (error?.name === 'AbortError') {
                return result(false, 'COMPANY_OWNER_INVITE_TIMEOUT', 'Company Owner invitation service timed out. No success was recorded; refresh the persisted invitation status before retrying.');
            }
            await loadRegistry({ actor: access.actor });
            return result(false, 'COMPANY_OWNER_INVITE_FAILED', error?.message || 'Company Owner invitation action failed.');
        } finally {
            if (timeoutId) global.clearTimeout(timeoutId);
        }
    }

    async function inviteCompanyOwner(companyId, payload, context) {
        return callCompanyOwnerInvitation('send', companyId, payload, context);
    }

    async function resendCompanyOwnerInvitation(companyId, invitationId, payload, context) {
        return callCompanyOwnerInvitation('resend', companyId, Object.assign({}, payload || {}, {
            invitationId: invitationId
        }), context);
    }

    async function revokeCompanyOwnerInvitation(companyId, invitationId, payload, context) {
        return callCompanyOwnerInvitation('revoke', companyId, Object.assign({}, payload || {}, {
            invitationId: invitationId
        }), context);
    }

    function legacyHelper(name, fallback) {
        var service = global.TenantProvisioningService || global.tenantProvisioningService;
        return typeof service?.[name] === 'function' ? service[name] : fallback;
    }

    var service = Object.freeze({
        FLAG: FLAG,
        LIFECYCLE_STATES: LIFECYCLE_STATES,
        ONBOARDING_STAGES: ONBOARDING_STAGES,
        isEnabled: enabled,
        normalizePayload: normalizePayload,
        normalizeTenantSlug: function normalizeTenantSlug(value) {
            return normalizeSlug(value);
        },
        validateTenantSlug: function validateTenantSlug(value, options) {
            return legacyHelper('validateTenantSlug', function fallbackValidation(slug) {
                return freeze({ valid: !!normalizeSlug(slug), failures: [], warnings: [], recommendations: [] });
            })(value, options);
        },
        detectSlugCollision: function detectSlugCollision(value, rows) {
            return legacyHelper('detectSlugCollision', function fallbackCollision(slug, tenants) {
                return (tenants || []).some(function sameTenant(tenant) {
                    return normalizeSlug(tenant?.tenantSlug || tenant?.slug) === normalizeSlug(slug);
                });
            })(value, rows);
        },
        extractTenantFromHostname: function extractTenantFromHostname(hostname, baseDomain) {
            return legacyHelper('extractTenantFromHostname', function fallbackRoute() {
                return freeze({ success: true, matched: false, hostname: hostname || '', tenantSlug: '', subdomain: '', warning: '' });
            })(hostname, baseDomain);
        },
        loadRegistry: loadRegistry,
        refresh: loadRegistry,
        getTenants: getTenants,
        getReadinessRequests: getReadinessRequests,
        getTenantProvisioningView: getTenantProvisioningView,
        getCompanyWorkspace: getCompanyWorkspace,
        createCompanyDraft: createCompanyDraft,
        createCompany: createCompany,
        provisionTenant: provisionTenant,
        provisionCompany: provisionCompany,
        retryProvisioning: retryProvisioning,
        updateCompany: updateCompany,
        saveCompanyOwnerProfile: saveCompanyOwnerProfile,
        transitionCompany: transitionCompany,
        updateTenantActivation: updateTenantActivation,
        reviewReadinessRequest: reviewReadinessRequest,
        inviteCompanyOwner: inviteCompanyOwner,
        resendCompanyOwnerInvitation: resendCompanyOwnerInvitation,
        revokeCompanyOwnerInvitation: revokeCompanyOwnerInvitation
    });

    global.PlatformCompanyRegistryService = service;
    global.platformCompanyRegistryService = service;
}(typeof window !== 'undefined' ? window : globalThis));
