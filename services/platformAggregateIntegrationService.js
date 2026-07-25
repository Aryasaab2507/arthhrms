// Aggregate-only adapter from the durable platform registry into existing platform intelligence.
(function attachPlatformAggregateIntegrationService(global) {
    'use strict';

    var FLAG = 'USE_PLATFORM_COMPANY_REGISTRY';
    var cache = {
        loaded: false,
        loading: null,
        loadedAt: '',
        projection: Object.freeze({}),
        snapshot: Object.freeze({}),
        error: ''
    };

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

    function actorFrom(context) {
        return context?.actor
            || global.authService?.getCurrentUser?.()
            || global.__ARTHHRMS_AUTH_CONTEXT__?.actor
            || {};
    }

    function requirePlatformOwner(context) {
        var actor = actorFrom(context);
        if (actor && typeof actor.then === 'function') {
            return result(false, 'PLATFORM_OWNER_CONTEXT_PENDING', 'Platform Owner context is still loading.');
        }
        if (!actor?.id || normalizeRole(actor.role) !== 'platform_owner') {
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

    function countBy(rows, key) {
        return (rows || []).reduce(function count(acc, row) {
            var value = String(typeof key === 'function' ? key(row) : row?.[key] || 'UNASSIGNED').toUpperCase();
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
    }

    function safeDate(value) {
        var time = new Date(value || '').getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function average(values) {
        var numbers = values.filter(Number.isFinite);
        return numbers.length ? Math.round((numbers.reduce(function sum(total, value) {
            return total + value;
        }, 0) / numbers.length) * 10) / 10 : 0;
    }

    function billingState(tenant) {
        var configured = String(tenant?.metadata?.billingState || '').trim().toUpperCase();
        if (configured) return configured;
        if (tenant.lifecycleState === 'SUSPENDED') return 'SUSPENDED';
        if (tenant.lifecycleState === 'ARCHIVED') return 'ARCHIVED';
        return 'ACTIVE';
    }

    function buildProjection(tenants, events) {
        var now = Date.now();
        var tenantsByCompany = tenants.reduce(function indexTenants(acc, tenant) {
            acc[tenant.companyId] = tenant;
            return acc;
        }, {});
        var tenantRows = tenants.map(function mapTenant(tenant) {
            return {
                id: tenant.companyId,
                companyId: tenant.companyId,
                tenantId: tenant.tenantId,
                tenantSlug: tenant.tenantSlug,
                companyName: tenant.companyName,
                status: tenant.lifecycleState,
                lifecycleState: tenant.lifecycleState,
                progress: tenant.progress,
                planType: tenant.planType,
                country: tenant.country,
                timezone: tenant.timezone,
                ownerAssigned: !!tenant.ownerAuthUserId,
                invitationStatus: tenant.invitationStatus,
                readinessStatus: tenant.readinessStatus,
                readinessScore: tenant.readinessScore,
                createdAt: tenant.createdAt,
                updatedAt: tenant.updatedAt
            };
        });
        var lifecycleDurations = [];
        var eventsByCompany = events.reduce(function group(acc, event) {
            (acc[event.company_id] ||= []).push(event);
            return acc;
        }, {});
        tenantRows.forEach(function calculateDuration(tenant) {
            var rows = eventsByCompany[tenant.companyId] || [];
            var created = rows.find(function findCreated(row) {
                return row.event_type === 'CompanyCreated' || row.new_state === 'DRAFT';
            });
            var activated = rows.find(function findActivated(row) {
                return row.new_state === 'LIVE';
            });
            if (created && activated) {
                lifecycleDurations.push((safeDate(activated.occurred_at) - safeDate(created.occurred_at)) / 86400000);
            }
        });
        var pendingReadiness = tenantRows.filter(function pending(row) {
            return row.readinessStatus === 'PENDING_REVIEW';
        }).length;
        var stalled = tenantRows.filter(function isStalled(row) {
            return !['LIVE', 'ARCHIVED', 'SUSPENDED'].includes(row.lifecycleState)
                && safeDate(row.updatedAt)
                && now - safeDate(row.updatedAt) > 7 * 86400000;
        });
        var snapshot = freeze({
            generatedAt: new Date().toISOString(),
            aggregateOnly: true,
            totalCompanies: tenantRows.length,
            activeCompanies: tenantRows.filter(function active(row) {
                return !['ARCHIVED', 'SUSPENDED', 'FAILED'].includes(row.lifecycleState);
            }).length,
            liveCompanies: tenantRows.filter(function live(row) { return row.lifecycleState === 'LIVE'; }).length,
            pilotCompanies: tenantRows.filter(function pilot(row) { return row.lifecycleState === 'PILOT'; }).length,
            failedCompanies: tenantRows.filter(function failed(row) { return row.lifecycleState === 'FAILED'; }).length,
            suspendedCompanies: tenantRows.filter(function suspended(row) { return row.lifecycleState === 'SUSPENDED'; }).length,
            pendingReadinessReviews: pendingReadiness,
            stalledOnboarding: stalled.length,
            averageOnboardingDays: average(lifecycleDurations),
            lifecycleDistribution: countBy(tenantRows, 'lifecycleState'),
            planDistribution: countBy(tenantRows, function plan(row) { return row.planType || 'UNASSIGNED'; }),
            countryDistribution: countBy(tenantRows, function country(row) { return row.country || 'UNASSIGNED'; }),
            employeeCount: tenantRows.reduce(function employees(total, row) {
                var tenant = tenantsByCompany[row.companyId];
                return total + Math.max(0, Number(tenant?.metadata?.employeeCount || 0));
            }, 0),
            eventCount: events.length,
            privacy: {
                tenantBusinessRecordsQueried: false,
                employeeRecordsQueried: false,
                payrollRecordsQueried: false,
                salaryVisibility: false
            }
        });
        var billing = tenantRows.map(function mapBilling(row) {
            return {
                tenantId: row.tenantId,
                tenantSlug: row.tenantSlug,
                planKey: row.planType || 'unassigned',
                planType: row.planType || 'unassigned',
                billingState: billingState(tenantsByCompany[row.companyId]),
                source: 'platform_company_registry',
                aggregateOnly: true
            };
        });
        var governance = tenantRows.map(function mapGovernance(row) {
            return {
                tenantId: row.tenantId,
                tenantSlug: row.tenantSlug,
                companyName: row.companyName,
                state: row.lifecycleState,
                lifecycleState: row.lifecycleState,
                progress: row.progress,
                readinessStatus: row.readinessStatus,
                riskState: row.lifecycleState === 'FAILED' || row.readinessStatus === 'RETURNED' ? 'HIGH_RISK'
                    : row.readinessStatus === 'PENDING_REVIEW' || stalled.some(function same(item) { return item.companyId === row.companyId; })
                        ? 'WARNING'
                        : 'INFO',
                aggregateOnly: true
            };
        });
        return {
            snapshot: snapshot,
            projection: freeze({
                platformTenants: tenantRows,
                tenantBillingRecords: billing,
                tenantGovernanceRecords: governance,
                platformLifecycleEvents: events.map(function mapEvent(event) {
                    return {
                        companyId: event.company_id,
                        tenantId: event.tenant_id,
                        tenantSlug: event.tenant_id,
                        eventType: event.event_type,
                        previousState: event.previous_state,
                        newState: event.new_state,
                        actorRole: event.actor_role,
                        occurredAt: event.occurred_at,
                        aggregateOnly: true
                    };
                }),
                platformAggregateSnapshot: snapshot
            })
        };
    }

    async function loadLifecycleEvents(supabase) {
        var rows = [];
        var pageSize = 1000;
        var page = 0;
        while (page < 25) {
            var from = page * pageSize;
            var response = await supabase
                .from('platform_lifecycle_events')
                .select('company_id,tenant_id,event_type,previous_state,new_state,actor_role,occurred_at')
                .order('occurred_at', { ascending: false })
                .range(from, from + pageSize - 1);
            if (response.error) throw response.error;
            var batch = Array.isArray(response.data) ? response.data : [];
            rows.push.apply(rows, batch);
            if (batch.length < pageSize) break;
            page += 1;
        }
        return rows;
    }

    async function load(context, options) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        if (!enabled()) return result(false, 'PLATFORM_AGGREGATES_DISABLED', 'Durable platform aggregates are disabled.');
        if (cache.loading && !options?.force) return cache.loading;
        var registry = global.PlatformCompanyRegistryService || global.platformCompanyRegistryService;
        var supabase = client();
        if (!registry?.loadRegistry || !supabase?.from) {
            return result(false, 'PLATFORM_AGGREGATE_DEPENDENCY_MISSING', 'Platform aggregate dependencies are unavailable.');
        }

        cache.loading = (async function loadAggregate() {
            try {
                var registryResult = await registry.loadRegistry({ actor: access.actor });
                if (!registryResult.ok) throw new Error(registryResult.message);
                var lifecycleEvents = await loadLifecycleEvents(supabase);
                var built = buildProjection(registry.getTenants(), lifecycleEvents);
                cache.projection = built.projection;
                cache.snapshot = built.snapshot;
                cache.loaded = true;
                cache.loadedAt = built.snapshot.generatedAt;
                cache.error = '';
                return result(true, 'PLATFORM_AGGREGATES_READY', 'Platform aggregate integrations are ready.', {
                    snapshot: cache.snapshot,
                    projection: cache.projection
                });
            } catch (error) {
                cache.error = error?.message || String(error);
                return result(false, 'PLATFORM_AGGREGATE_LOAD_FAILED', 'Platform aggregate integrations could not be loaded.', {
                    error: cache.error
                });
            } finally {
                cache.loading = null;
            }
        }());
        return cache.loading;
    }

    function getProjection() {
        return cache.projection;
    }

    function getSnapshot(context) {
        var access = requirePlatformOwner(context);
        if (!access.ok) return access;
        return result(true, cache.loaded ? 'PLATFORM_AGGREGATES_READY' : 'PLATFORM_AGGREGATES_LOADING', cache.loaded
            ? 'Platform aggregate integrations are ready.'
            : 'Platform aggregate integrations have not loaded yet.', {
            loaded: cache.loaded,
            loadedAt: cache.loadedAt,
            snapshot: cache.snapshot,
            error: cache.error
        });
    }

    var service = Object.freeze({
        FLAG: FLAG,
        isEnabled: enabled,
        load: load,
        refresh: function refresh(context) { return load(context, { force: true }); },
        getProjection: getProjection,
        getSnapshot: getSnapshot
    });

    global.PlatformAggregateIntegrationService = service;
    global.platformAggregateIntegrationService = service;
}(typeof window !== 'undefined' ? window : globalThis));
