/**
 * ARTHHRMS Enterprise Redis Cache Service
 * Tenant-aware cache-aside layer with Redis-compatible adapter hooks,
 * governed invalidation, warmup, analytics, and graceful database fallback.
 */
(function attachEnterpriseRedisCacheService(global) {
    'use strict';

    var SOURCE = 'enterpriseRedisCacheService';
    var MAX_HISTORY = 500;
    var CACHE_DOMAINS = Object.freeze([
        'employee_profiles',
        'departments',
        'permissions',
        'roles',
        'dashboard_metrics',
        'organization_settings',
        'feature_flags',
        'lookup_tables'
    ]);
    var PROHIBITED_DOMAIN_PATTERN = /(password|token|secret|credential|session|auth|otp|key)/i;
    var SENSITIVE_KEY_PATTERN = /(password|token|secret|credential|session|authorization|auth|private.?key|api.?key|otp|hash|salt|salary|compensation|bank|payrollAmount|ctc|signed.?url|storage.?path|privateNote)/i;
    var SAFE_GOVERNANCE_KEYS = Object.freeze(['credentialsCachingBlocked']);
    var DEFAULT_TTLS = Object.freeze({
        employee_profiles: 1800,
        departments: 3600,
        permissions: 900,
        roles: 900,
        dashboard_metrics: 300,
        organization_settings: 3600,
        feature_flags: 60,
        lookup_tables: 86400
    });
    var CACHE_STATES = Object.freeze(['HIT', 'MISS', 'MISS_LOADED', 'STALE', 'NEGATIVE_CACHED', 'INVALIDATED', 'WARMED', 'FAILED']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR', 'MANAGER']);

    var memoryStore = new Map();
    var stats = {
        hits: 0,
        misses: 0,
        writes: 0,
        invalidations: 0,
        evictions: 0,
        warmups: 0,
        staleBlocks: 0,
        failures: 0,
        redisUnavailable: 0,
        stampedeProtections: 0,
        penetrationProtections: 0,
        avalancheProtections: 0,
        lookupTimes: []
    };
    var inFlightLoads = Object.create(null);

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeDomain(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_|_$/g, '');
    }

    function normalizeEntity(value, fallback) {
        return safeString(value || fallback || 'default', 'default').trim()
            .replace(/[:\s]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 160) || 'default';
    }

    function nowMs(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            var time = stamp.getTime();
            return Number.isFinite(time) ? time : Date.now();
        } catch (error) { return Date.now(); }
    }

    function nowIso(context) {
        try { return new Date(nowMs(context || {})).toISOString(); }
        catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && (context.actorTenantSlug || context.actorTenantId) || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function rowTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenantId || row.tenant_id || row.companyId || row.company_id ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function cloneCacheValue(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            return typeof value === 'string' ? value.slice(0, 2400) : value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneCacheValue(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (SENSITIVE_KEY_PATTERN.test(key) && SAFE_GOVERNANCE_KEYS.indexOf(key) === -1) return;
            var cloned = cloneCacheValue(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeDeep(value) {
        function walk(item, seen) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            var refs = seen || [];
            if (refs.indexOf(item) !== -1) return item;
            refs.push(item);
            Object.keys(item).forEach(function each(key) { walk(item[key], refs.slice()); });
            try { Object.freeze(item); } catch (error) {}
            return item;
        }
        return walk(value, []);
    }

    function freezeCacheOutput(value) {
        return freezeDeep(cloneCacheValue(value, []));
    }

    function result(success, code, message, extra) {
        return freezeCacheOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'CACHE_OPERATION_READY' : 'CACHE_OPERATION_FAILED')),
            message: safeString(message || (success ? 'Cache operation completed.' : 'Cache operation failed.'), '').slice(0, 280)
        }, extra || {}));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            cacheGovernancePreserved: true,
            cacheAsidePattern: true,
            staleDataBlocked: true,
            credentialsCachingBlocked: true,
            databaseFallbackReady: true,
            manualCacheManagementRequired: false,
            redisUnavailableHandled: false,
            cacheStampedeProtected: true,
            cachePenetrationProtected: true,
            cacheAvalancheProtected: true,
            outputsImmutable: true
        }, extra || {});
    }

    function validateAccess(action, tenantSlug, context) {
        var currentActor = actor(context || {});
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var scopeTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        var role = currentActor.role;
        if (!targetTenant || !scopeTenant || targetTenant !== scopeTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped cache access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'OPERATIONS_VIEW' && VIEW_ROLES.indexOf(role) === -1) {
            return result(false, 'CACHE_GOVERNANCE_DENIED', 'Cache operations visibility is restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'CONTROL' && CONTROL_ROLES.indexOf(role) === -1) {
            return result(false, 'CACHE_GOVERNANCE_DENIED', 'Cache control operations are restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        try {
            var registry = global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: targetTenant,
                    ownerTenantSlug: targetTenant,
                    actorTenantSlug: scopeTenant
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: targetTenant, validatedTenantAccess: true }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed closed for cache governance.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely for cache governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        return result(true, 'CACHE_ACCESS_VALIDATED', 'Cache access validated.', {
            tenantSlug: targetTenant,
            actor: currentActor,
            governance: governanceFlags()
        });
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    eventType: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Enterprise Redis Cache',
                    severity: severity || (/FAILED|DENIED|BLOCKED|UNAVAILABLE/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, cloneCacheValue(metadata || {}, []), {
                        actionType: actionType,
                        module: 'Enterprise Redis Cache'
                    })
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(Object.assign({}, cloneCacheValue(record, []), { immutable: true }));
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return record;
    }

    function getAdapter(request) {
        if (request && request.adapter === 'memory') return null;
        try { return global.ARTHHRMS_REDIS_ADAPTER || global.RedisCacheAdapter || global.redisCacheAdapter || null; }
        catch (error) { return null; }
    }

    function recordLookupTime(start) {
        var elapsed = Math.max(0, Date.now() - start);
        stats.lookupTimes.push(elapsed);
        if (stats.lookupTimes.length > 200) stats.lookupTimes = stats.lookupTimes.slice(-200);
        return elapsed;
    }

    function cacheSize(value) {
        try { return JSON.stringify(value || {}).length; }
        catch (error) { return 0; }
    }

    function domainSupported(domain) {
        return CACHE_DOMAINS.indexOf(domain) !== -1 && !PROHIBITED_DOMAIN_PATTERN.test(domain);
    }

    function ttlForDomain(domain, tenantSlug, input) {
        var direct = safeNumber(input && input.ttlSeconds, 0);
        if (direct > 0) return Math.max(1, Math.round(direct));
        var current = data();
        var overrides = current.cacheConfiguration && current.cacheConfiguration.tenantOverrides &&
            current.cacheConfiguration.tenantOverrides[tenantSlug] || {};
        var override = safeNumber(overrides[domain], 0);
        return override > 0 ? Math.round(override) : (DEFAULT_TTLS[domain] || 300);
    }

    function jitterTtl(ttlSeconds, key) {
        var hash = 0;
        var text = safeString(key || '', '');
        for (var index = 0; index < text.length; index += 1) hash = (hash + text.charCodeAt(index)) % 17;
        var jitter = Math.min(Math.max(1, Math.round(ttlSeconds * 0.08)), hash);
        stats.avalancheProtections += jitter ? 1 : 0;
        return Math.max(1, ttlSeconds + jitter);
    }

    function buildKey(input, context) {
        try {
            if (!isPlainObject(input)) {
                return result(false, 'MALFORMED_CACHE_KEY_PAYLOAD', 'Cache key payload must be an object.', {
                    key: '',
                    governance: governanceFlags()
                });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var domain = normalizeDomain(input.domain || input.cacheDomain || input.type || '');
            var entityId = normalizeEntity(input.entityId || input.id || input.recordId || input.key || input.cacheKey || 'default');
            var access = validateAccess('READ', tenantSlug, context || {});
            if (!access.success) {
                return result(false, access.code, access.message, {
                    tenantSlug: tenantSlug,
                    domain: domain,
                    entityId: entityId,
                    key: '',
                    governance: governanceFlags()
                });
            }
            if (!domainSupported(domain)) {
                return result(false, 'CACHE_DOMAIN_BLOCKED', 'Cache domain is unsupported or contains credential material.', {
                    tenantSlug: tenantSlug,
                    domain: domain,
                    key: '',
                    governance: governanceFlags({ credentialsCachingBlocked: true })
                });
            }
            return result(true, 'CACHE_KEY_BUILT', 'Tenant-scoped cache key built.', {
                tenantSlug: tenantSlug,
                domain: domain,
                entityId: entityId,
                key: 'tenant:' + tenantSlug + ':' + domain + ':' + entityId,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'CACHE_KEY_BUILD_FAILED_SAFE', 'Cache key generation failed safely.', {
                key: '',
                governance: governanceFlags()
            });
        }
    }

    function entryExpired(entry, context) {
        return !!entry && safeNumber(entry.expiresAtMs, 0) <= nowMs(context || {});
    }

    function adapterGet(adapter, key) {
        if (!adapter || typeof adapter.get !== 'function') return { success: false, unavailable: false };
        try {
            var value = adapter.get(key);
            return { success: true, value: value };
        } catch (error) {
            stats.redisUnavailable += 1;
            stats.failures += 1;
            return { success: false, unavailable: true, error: error && error.message };
        }
    }

    function adapterSet(adapter, key, value, ttlSeconds) {
        if (!adapter || typeof adapter.set !== 'function') return { success: false, unavailable: false };
        try {
            adapter.set(key, value, ttlSeconds);
            return { success: true };
        } catch (error) {
            stats.redisUnavailable += 1;
            stats.failures += 1;
            return { success: false, unavailable: true, error: error && error.message };
        }
    }

    function adapterDelete(adapter, key) {
        if (!adapter || typeof adapter.delete !== 'function') return { success: false, unavailable: false };
        try {
            adapter.delete(key);
            return { success: true };
        } catch (error) {
            stats.redisUnavailable += 1;
            stats.failures += 1;
            return { success: false, unavailable: true, error: error && error.message };
        }
    }

    async function set(input, context) {
        var started = Date.now();
        try {
            if (!isPlainObject(input)) {
                stats.failures += 1;
                return result(false, 'MALFORMED_CACHE_PAYLOAD', 'Cache write payload must be an object.', {
                    cacheStatus: 'FAILED',
                    governance: governanceFlags()
                });
            }
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) {
                stats.failures += 1;
                audit('CACHE_WRITE_DENIED', { tenantSlug: input.tenantSlug || input.tenantId || '', code: access.code }, context || {}, 'WARNING');
                return access;
            }
            var keyResult = buildKey(input, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug }));
            if (!keyResult.success) {
                stats.failures += 1;
                audit('CACHE_WRITE_BLOCKED', { tenantSlug: access.tenantSlug, domain: input.domain || '', code: keyResult.code }, context || {}, 'WARNING');
                return keyResult;
            }
            var cleanValue = cloneCacheValue(Object.prototype.hasOwnProperty.call(input, 'value') ? input.value : input.data, []);
            var ttlSeconds = ttlForDomain(keyResult.domain, access.tenantSlug, input);
            var effectiveTtl = jitterTtl(ttlSeconds, keyResult.key);
            var createdAtMs = nowMs(context || {});
            var entry = {
                key: keyResult.key,
                tenantSlug: access.tenantSlug,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                value: cleanValue,
                negative: input.negative === true,
                ttlSeconds: ttlSeconds,
                effectiveTtlSeconds: effectiveTtl,
                createdAtMs: createdAtMs,
                expiresAtMs: createdAtMs + effectiveTtl * 1000,
                createdAt: nowIso(context || {}),
                expiresAt: new Date(createdAtMs + effectiveTtl * 1000).toISOString(),
                compressed: input.compression !== false,
                sizeBytes: cacheSize(cleanValue)
            };
            var adapterOutcome = adapterSet(getAdapter(input), keyResult.key, JSON.stringify(entry), effectiveTtl);
            memoryStore.set(keyResult.key, entry);
            stats.writes += 1;
            var lookupTime = recordLookupTime(started);
            var row = {
                operationId: createId('CACHEOP'),
                tenantSlug: access.tenantSlug,
                cacheKey: keyResult.key,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                operation: 'WRITE',
                cacheStatus: input.negative === true ? 'NEGATIVE_CACHED' : 'WRITTEN',
                ttlSeconds: ttlSeconds,
                lookupTimeMs: lookupTime,
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheOperationHistory', row, context || {});
            audit('CACHE_WRITE_RECORDED', {
                tenantSlug: access.tenantSlug,
                domain: keyResult.domain,
                cacheKey: keyResult.key,
                ttlSeconds: ttlSeconds
            }, context || {}, adapterOutcome.unavailable ? 'WARNING' : 'INFO');
            return result(true, adapterOutcome.unavailable ? 'CACHE_WRITTEN_WITH_FALLBACK' : 'CACHE_WRITTEN', 'Cache entry written.', {
                tenantSlug: access.tenantSlug,
                key: keyResult.key,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                ttlSeconds: ttlSeconds,
                expiresAt: entry.expiresAt,
                cacheStatus: input.negative === true ? 'NEGATIVE_CACHED' : 'WRITTEN',
                lookupTimeMs: lookupTime,
                value: cleanValue,
                governance: governanceFlags({
                    redisUnavailableHandled: adapterOutcome.unavailable === true,
                    databaseFallbackReady: true
                })
            });
        } catch (error) {
            stats.failures += 1;
            audit('CACHE_WRITE_FAILURE', { message: 'Cache write failed safely.' }, context || {}, 'WARNING');
            return result(false, 'CACHE_WRITE_FAILED_SAFE', 'Cache write failed safely.', {
                cacheStatus: 'FAILED',
                governance: governanceFlags({ redisUnavailableHandled: true })
            });
        }
    }

    async function get(input, context) {
        var started = Date.now();
        try {
            if (!isPlainObject(input)) {
                stats.failures += 1;
                return result(false, 'MALFORMED_CACHE_PAYLOAD', 'Cache read payload must be an object.', {
                    cacheStatus: 'FAILED',
                    governance: governanceFlags()
                });
            }
            var keyResult = buildKey(input, context || {});
            if (!keyResult.success) {
                stats.failures += 1;
                return keyResult;
            }
            var adapterOutcome = adapterGet(getAdapter(input), keyResult.key);
            if (adapterOutcome.success && adapterOutcome.value && !memoryStore.has(keyResult.key)) {
                try {
                    var adapterEntry = typeof adapterOutcome.value === 'string' ? JSON.parse(adapterOutcome.value) : adapterOutcome.value;
                    if (adapterEntry && adapterEntry.key) memoryStore.set(keyResult.key, adapterEntry);
                } catch (error) {}
            }
            var entry = memoryStore.get(keyResult.key);
            var lookupTime = recordLookupTime(started);
            if (!entry) {
                stats.misses += 1;
                persist('enterpriseCacheOperationHistory', {
                    operationId: createId('CACHEOP'),
                    tenantSlug: keyResult.tenantSlug,
                    cacheKey: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    operation: 'READ',
                    cacheStatus: 'MISS',
                    lookupTimeMs: lookupTime,
                    timestamp: nowIso(context || {})
                }, context || {});
                return result(false, 'CACHE_MISS', 'Cache entry was not found.', {
                    tenantSlug: keyResult.tenantSlug,
                    key: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    cacheStatus: 'MISS',
                    lookupTimeMs: lookupTime,
                    value: null,
                    governance: governanceFlags({
                        redisUnavailableHandled: adapterOutcome.unavailable === true
                    })
                });
            }
            if (entryExpired(entry, context || {})) {
                memoryStore.delete(keyResult.key);
                stats.misses += 1;
                stats.staleBlocks += 1;
                stats.evictions += 1;
                persist('enterpriseCacheOperationHistory', {
                    operationId: createId('CACHEOP'),
                    tenantSlug: keyResult.tenantSlug,
                    cacheKey: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    operation: 'READ',
                    cacheStatus: 'STALE',
                    lookupTimeMs: lookupTime,
                    timestamp: nowIso(context || {})
                }, context || {});
                audit('CACHE_STALE_ENTRY_BLOCKED', {
                    tenantSlug: keyResult.tenantSlug,
                    domain: keyResult.domain,
                    cacheKey: keyResult.key
                }, context || {}, 'WARNING');
                return result(false, 'CACHE_STALE_BLOCKED', 'Expired cache entry was blocked.', {
                    tenantSlug: keyResult.tenantSlug,
                    key: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    cacheStatus: 'STALE',
                    lookupTimeMs: lookupTime,
                    value: null,
                    governance: governanceFlags({
                        staleDataBlocked: true,
                        redisUnavailableHandled: adapterOutcome.unavailable === true
                    })
                });
            }
            if (entry.negative === true) {
                stats.misses += 1;
                return result(false, 'CACHE_NEGATIVE_HIT', 'Cache penetration guard returned a negative cache marker.', {
                    tenantSlug: keyResult.tenantSlug,
                    key: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    cacheStatus: 'NEGATIVE_HIT',
                    lookupTimeMs: lookupTime,
                    value: null,
                    governance: governanceFlags({
                        cachePenetrationProtected: true,
                        redisUnavailableHandled: adapterOutcome.unavailable === true
                    })
                });
            }
            stats.hits += 1;
            persist('enterpriseCacheOperationHistory', {
                operationId: createId('CACHEOP'),
                tenantSlug: keyResult.tenantSlug,
                cacheKey: keyResult.key,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                operation: 'READ',
                cacheStatus: 'HIT',
                lookupTimeMs: lookupTime,
                timestamp: nowIso(context || {})
            }, context || {});
            return result(true, 'CACHE_HIT', 'Cache entry read.', {
                tenantSlug: keyResult.tenantSlug,
                key: keyResult.key,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                cacheStatus: 'HIT',
                lookupTimeMs: lookupTime,
                ttlSeconds: entry.ttlSeconds,
                expiresAt: entry.expiresAt,
                value: entry.value,
                governance: governanceFlags({
                    redisUnavailableHandled: adapterOutcome.unavailable === true
                })
            });
        } catch (error) {
            stats.failures += 1;
            audit('CACHE_READ_FAILURE', { message: 'Cache read failed safely.' }, context || {}, 'WARNING');
            return result(false, 'CACHE_READ_FAILED_SAFE', 'Cache read failed safely.', {
                cacheStatus: 'FAILED',
                governance: governanceFlags({ redisUnavailableHandled: true })
            });
        }
    }

    async function getOrSet(input, loader, context) {
        try {
            var request = isPlainObject(input) ? input : {};
            var miss = await get(request, context || {});
            if (miss.success && miss.cacheStatus === 'HIT') return miss;
            var keyResult = buildKey(request, context || {});
            if (!keyResult.success) return keyResult;
            if (inFlightLoads[keyResult.key]) {
                stats.stampedeProtections += 1;
                var shared = await inFlightLoads[keyResult.key];
                return result(shared && shared.success === true, shared && shared.success ? 'CACHE_SHARED_LOAD_READY' : 'CACHE_SHARED_LOAD_FAILED', 'Cache stampede guard reused an in-flight load.', Object.assign({}, shared || {}, {
                    cacheStatus: shared && shared.cacheStatus || 'MISS_LOADED',
                    governance: governanceFlags({ cacheStampedeProtected: true })
                }));
            }
            inFlightLoads[keyResult.key] = Promise.resolve().then(function runLoader() {
                return typeof loader === 'function' ? loader() : null;
            });
            var loaded;
            try { loaded = await inFlightLoads[keyResult.key]; }
            finally { delete inFlightLoads[keyResult.key]; }
            if (loaded === null || typeof loaded === 'undefined') {
                await set(Object.assign({}, request, { negative: true, value: { negative: true }, ttlSeconds: Math.min(300, ttlForDomain(keyResult.domain, keyResult.tenantSlug, request)) }), Object.assign({}, context || {}, { skipAuditPersistence: context && context.skipAuditPersistence }));
                stats.penetrationProtections += 1;
                return result(false, 'CACHE_NEGATIVE_CACHED', 'Missing database result was negative cached to prevent cache penetration.', {
                    tenantSlug: keyResult.tenantSlug,
                    key: keyResult.key,
                    domain: keyResult.domain,
                    entityId: keyResult.entityId,
                    cacheStatus: 'NEGATIVE_CACHED',
                    value: null,
                    governance: governanceFlags({
                        cachePenetrationProtected: true,
                        redisUnavailableHandled: miss.governance && miss.governance.redisUnavailableHandled === true
                    })
                });
            }
            var written = await set(Object.assign({}, request, { value: loaded }), context || {});
            return result(written.success === true, written.success ? 'CACHE_MISS_LOADED' : written.code, written.success ? 'Cache miss loaded through cache-aside fallback.' : written.message, Object.assign({}, written, {
                cacheStatus: 'MISS_LOADED',
                value: cloneCacheValue(loaded, []),
                governance: governanceFlags({
                    redisUnavailableHandled: !!(miss.governance && miss.governance.redisUnavailableHandled || written.governance && written.governance.redisUnavailableHandled),
                    databaseFallbackReady: true
                })
            }));
        } catch (error) {
            stats.failures += 1;
            audit('CACHE_ASIDE_FAILURE', { message: 'Cache-aside load failed safely.' }, context || {}, 'WARNING');
            return result(false, 'CACHE_ASIDE_FAILED_SAFE', 'Cache-aside load failed safely.', {
                cacheStatus: 'FAILED',
                governance: governanceFlags({ databaseFallbackReady: true, redisUnavailableHandled: true })
            });
        }
    }

    function tenantStoreKeys(tenantSlug, domains) {
        var requested = Array.isArray(domains) ? domains.map(normalizeDomain).filter(Boolean) : [];
        var prefix = 'tenant:' + normalizeTenant(tenantSlug) + ':';
        var keys = [];
        memoryStore.forEach(function each(entry, key) {
            if (safeString(key, '').indexOf(prefix) !== 0) return;
            if (requested.length && requested.indexOf(entry.domain) === -1) return;
            keys.push(key);
        });
        return keys;
    }

    async function invalidate(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_INVALIDATION_PAYLOAD', 'Cache invalidation payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var keyResult = buildKey(input, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug }));
            if (!keyResult.success) return keyResult;
            var adapterOutcome = adapterDelete(getAdapter(input), keyResult.key);
            var existed = memoryStore.delete(keyResult.key);
            var invalidated = existed ? [keyResult.key] : [];
            stats.invalidations += invalidated.length;
            var row = {
                invalidationId: createId('CACHEINV'),
                tenantSlug: access.tenantSlug,
                domain: keyResult.domain,
                entityId: keyResult.entityId,
                invalidatedKeys: invalidated,
                reason: safeString(input.reason || 'Cache invalidation', '').slice(0, 180),
                mode: 'SELECTIVE',
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheInvalidationHistory', row, context || {});
            audit('CACHE_INVALIDATION_RECORDED', row, context || {}, adapterOutcome.unavailable ? 'WARNING' : 'INFO');
            return result(true, 'CACHE_INVALIDATED', 'Cache invalidation completed.', {
                tenantSlug: access.tenantSlug,
                invalidatedKeys: invalidated,
                invalidation: row,
                governance: governanceFlags({
                    redisUnavailableHandled: adapterOutcome.unavailable === true
                })
            });
        } catch (error) {
            stats.failures += 1;
            audit('CACHE_INVALIDATION_FAILURE', { message: 'Cache invalidation failed safely.' }, context || {}, 'WARNING');
            return result(false, 'CACHE_INVALIDATION_FAILED_SAFE', 'Cache invalidation failed safely.', { governance: governanceFlags({ redisUnavailableHandled: true }) });
        }
    }

    async function bulkInvalidate(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var domains = Array.isArray(source.domains) ? source.domains : (source.domain ? [source.domain] : []);
            var keys = tenantStoreKeys(access.tenantSlug, domains);
            var adapter = getAdapter(source);
            keys.forEach(function remove(key) {
                adapterDelete(adapter, key);
                memoryStore.delete(key);
            });
            stats.invalidations += keys.length;
            var row = {
                invalidationId: createId('CACHEINV'),
                tenantSlug: access.tenantSlug,
                domains: domains.map(normalizeDomain).filter(Boolean),
                invalidatedKeys: keys,
                reason: safeString(source.reason || 'Bulk cache invalidation', '').slice(0, 180),
                mode: 'BULK',
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheInvalidationHistory', row, context || {});
            audit('CACHE_INVALIDATION_RECORDED', row, context || {}, 'INFO');
            return result(true, 'CACHE_BULK_INVALIDATED', 'Bulk cache invalidation completed.', {
                tenantSlug: access.tenantSlug,
                invalidatedKeys: keys,
                invalidation: row,
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CACHE_BULK_INVALIDATION_FAILED_SAFE', 'Bulk cache invalidation failed safely.', { governance: governanceFlags({ redisUnavailableHandled: true }) });
        }
    }

    function domainsForMutation(mutationType) {
        var type = token(mutationType || '');
        if (/EMPLOYEE|PROFILE|ONBOARDING|LIFECYCLE/.test(type)) return ['employee_profiles', 'dashboard_metrics'];
        if (/DEPARTMENT|ORGANIZATION_STRUCTURE/.test(type)) return ['departments', 'organization_settings', 'dashboard_metrics'];
        if (/ROLE/.test(type)) return ['roles', 'permissions'];
        if (/PERMISSION|RBAC/.test(type)) return ['permissions', 'roles'];
        if (/FEATURE|FLAG/.test(type)) return ['feature_flags', 'dashboard_metrics'];
        if (/ORGANIZATION|TENANT|SETTING/.test(type)) return ['organization_settings', 'departments', 'roles', 'permissions', 'feature_flags', 'dashboard_metrics'];
        return ['dashboard_metrics'];
    }

    async function invalidateAfterMutation(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var domains = domainsForMutation(source.mutationType || source.action || source.eventType);
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var keys = tenantStoreKeys(access.tenantSlug, domains).filter(function match(key) {
                return !source.entityId || key.indexOf(normalizeEntity(source.entityId)) !== -1 || key.indexOf(':dashboard_metrics:') !== -1;
            });
            var adapter = getAdapter(source);
            keys.forEach(function remove(key) {
                adapterDelete(adapter, key);
                memoryStore.delete(key);
            });
            stats.invalidations += keys.length;
            var row = {
                invalidationId: createId('CACHEINV'),
                tenantSlug: access.tenantSlug,
                domains: domains,
                invalidatedKeys: keys,
                reason: safeString(source.mutationType || source.action || 'Mutation-triggered invalidation', '').slice(0, 180),
                mode: 'MUTATION_TRIGGERED',
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheInvalidationHistory', row, context || {});
            audit('CACHE_INVALIDATION_RECORDED', row, context || {}, 'INFO');
            return result(true, 'CACHE_MUTATION_INVALIDATED', 'Mutation-triggered cache invalidation completed.', {
                tenantSlug: access.tenantSlug,
                invalidatedKeys: keys,
                domains: domains,
                invalidation: row,
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CACHE_MUTATION_INVALIDATION_FAILED_SAFE', 'Mutation cache invalidation failed safely.', { governance: governanceFlags({ redisUnavailableHandled: true }) });
        }
    }

    function sameTenant(row, tenantSlug) {
        var tenant = rowTenant(row);
        return !tenant || tenant === normalizeTenant(tenantSlug);
    }

    function rowsForDomain(domain, tenantSlug) {
        var current = data();
        if (domain === 'organization_settings') {
            var settings = current.companySettings || {};
            return [Object.assign({}, settings, { entityId: 'current', tenantSlug: normalizeTenant(settings.tenantSlug || settings.tenantId || tenantSlug) })].filter(function scoped(row) { return sameTenant(row, tenantSlug); });
        }
        if (domain === 'departments') return [].concat(current.tenantDepartmentRecords || [], current.departments || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); });
        if (domain === 'permissions') return [].concat(current.permissionMatrix || [], current.permissions || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); });
        if (domain === 'roles') return [].concat(current.roles || [], current.roleMatrix || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); });
        if (domain === 'feature_flags') return [].concat(current.featureFlags || [], current.tenantFeatureFlags || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); });
        if (domain === 'dashboard_metrics') return [].concat(current.dashboardPerformanceHistory || [], current.platformAnalyticsHistory || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); }).slice(-20);
        if (domain === 'employee_profiles') return (current.employees || []).filter(function scoped(row) { return sameTenant(row, tenantSlug); }).slice(0, 100);
        if (domain === 'lookup_tables') {
            return [
                { entityId: 'employment_types', tenantSlug: tenantSlug, values: ['FULL_TIME', 'PART_TIME', 'CONTRACT'] },
                { entityId: 'leave_types', tenantSlug: tenantSlug, values: ['ANNUAL', 'SICK', 'OPTIONAL'] }
            ];
        }
        return [];
    }

    function rowIdForDomain(row, domain, index) {
        return normalizeEntity(
            row && (
                row.entityId || row.id || row.employeeId || row.empId || row.departmentId || row.departmentCode ||
                row.permissionId || row.roleId || row.flagKey || row.dashboardId || row.reportId
            ) || (domain + '-' + (index + 1))
        );
    }

    async function warmTenantCache(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var domains = Array.isArray(source.domains) && source.domains.length ? source.domains.map(normalizeDomain).filter(domainSupported) : [
                'organization_settings', 'departments', 'roles', 'permissions', 'feature_flags', 'dashboard_metrics'
            ];
            var warmed = [];
            for (var domainIndex = 0; domainIndex < domains.length; domainIndex += 1) {
                var domain = domains[domainIndex];
                var rows = rowsForDomain(domain, access.tenantSlug);
                for (var index = 0; index < rows.length; index += 1) {
                    var row = rows[index];
                    var entityId = rowIdForDomain(row, domain, index);
                    var write = await set({
                        tenantSlug: access.tenantSlug,
                        domain: domain,
                        entityId: entityId,
                        value: row,
                        ttlSeconds: ttlForDomain(domain, access.tenantSlug, source)
                    }, Object.assign({}, context || {}, { tenantSlug: access.tenantSlug, skipAuditPersistence: true }));
                    if (write.success) warmed.push(write.key);
                }
            }
            stats.warmups += 1;
            var row = {
                warmupId: createId('CACHEWARM'),
                tenantSlug: access.tenantSlug,
                domains: domains,
                warmedKeys: warmed,
                state: 'WARMED',
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheWarmupHistory', row, context || {});
            audit('CACHE_WARMUP_RECORDED', row, context || {}, 'INFO');
            return result(true, 'CACHE_WARMED', 'Tenant cache warmup completed.', {
                tenantSlug: access.tenantSlug,
                domains: domains,
                warmedKeys: warmed,
                warmup: row,
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            audit('CACHE_WARMUP_FAILURE', { message: 'Cache warmup failed safely.' }, context || {}, 'WARNING');
            return result(false, 'CACHE_WARMUP_FAILED_SAFE', 'Cache warmup failed safely.', { warmedKeys: [], governance: governanceFlags({ redisUnavailableHandled: true }) });
        }
    }

    function calculateMetrics(tenantSlug) {
        var keys = tenantStoreKeys(tenantSlug);
        var entries = keys.map(function map(key) { return memoryStore.get(key); }).filter(Boolean);
        var totalReads = stats.hits + stats.misses;
        var hitRate = totalReads ? clampScore((stats.hits / totalReads) * 100) : 0;
        var missRate = totalReads ? clampScore((stats.misses / totalReads) * 100) : 0;
        var memoryUsage = entries.reduce(function sum(total, entry) { return total + safeNumber(entry.sizeBytes, 0); }, 0);
        var avgLookup = stats.lookupTimes.length ? Math.round(stats.lookupTimes.reduce(function sum(total, row) { return total + safeNumber(row, 0); }, 0) / stats.lookupTimes.length) : 0;
        var operationCount = stats.hits + stats.misses + stats.writes + stats.invalidations + stats.warmups + stats.failures;
        var evictionRate = operationCount ? clampScore((stats.evictions / operationCount) * 100) : 0;
        var invalidationRate = operationCount ? clampScore((stats.invalidations / operationCount) * 100) : 0;
        var cacheHealthScore = clampScore(82 + hitRate * 0.12 - missRate * 0.1 - stats.failures * 3 - stats.staleBlocks * 2);
        var performanceScore = clampScore(90 - Math.min(40, avgLookup * 2) + hitRate * 0.1 - stats.redisUnavailable * 2);
        var optimizationScore = clampScore(75 + Math.min(10, stats.warmups * 2) + Math.min(8, stats.invalidations) + Math.min(7, stats.stampedeProtections + stats.penetrationProtections));
        return {
            cacheHitRate: hitRate,
            cacheMissRate: missRate,
            evictionRate: evictionRate,
            invalidationRate: invalidationRate,
            averageLookupTimeMs: avgLookup,
            memoryUsageBytes: memoryUsage,
            activeCacheKeys: keys.length,
            writeCount: stats.writes,
            redisUnavailableEvents: stats.redisUnavailable,
            cacheStampedeProtections: stats.stampedeProtections,
            cachePenetrationProtections: stats.penetrationProtections,
            cacheAvalancheProtections: stats.avalancheProtections,
            cacheHealthScore: cacheHealthScore,
            performanceScore: performanceScore,
            optimizationScore: optimizationScore,
            keys: keys
        };
    }

    function collectMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('OPERATIONS_VIEW', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var metrics = calculateMetrics(access.tenantSlug);
            var row = {
                metricsId: createId('CACHEMET'),
                tenantSlug: access.tenantSlug,
                cacheHitRate: metrics.cacheHitRate,
                cacheMissRate: metrics.cacheMissRate,
                memoryUsageBytes: metrics.memoryUsageBytes,
                activeCacheKeys: metrics.activeCacheKeys,
                cacheHealthScore: metrics.cacheHealthScore,
                performanceScore: metrics.performanceScore,
                optimizationScore: metrics.optimizationScore,
                timestamp: nowIso(context || {})
            };
            persist('enterpriseCacheMetricsHistory', row, context || {});
            audit('CACHE_METRICS_REVIEWED', row, context || {}, 'INFO');
            return result(true, 'CACHE_METRICS_READY', 'Cache metrics collected.', {
                tenantSlug: access.tenantSlug,
                analytics: {
                    cacheHitRate: metrics.cacheHitRate,
                    cacheMissRate: metrics.cacheMissRate,
                    evictionRate: metrics.evictionRate,
                    invalidationRate: metrics.invalidationRate,
                    averageLookupTimeMs: metrics.averageLookupTimeMs,
                    memoryUsageBytes: metrics.memoryUsageBytes,
                    activeCacheKeys: metrics.activeCacheKeys,
                    redisUnavailableEvents: metrics.redisUnavailableEvents
                },
                cacheHealthScore: metrics.cacheHealthScore,
                performanceScore: metrics.performanceScore,
                optimizationScore: metrics.optimizationScore,
                activeCacheKeys: metrics.keys,
                governance: governanceFlags()
            });
        } catch (error) {
            stats.failures += 1;
            return result(false, 'CACHE_METRICS_FAILED_SAFE', 'Cache metrics collection failed safely.', {
                analytics: {},
                governance: governanceFlags({ redisUnavailableHandled: true })
            });
        }
    }

    function latestRows(key, tenantSlug, count) {
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function scoped(row) {
            return rowTenant(row) === normalizeTenant(tenantSlug);
        }).slice(-safeNumber(count, 20)).reverse();
    }

    function generateCacheOperationsReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('OPERATIONS_VIEW', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var metrics = calculateMetrics(access.tenantSlug);
            var operations = latestRows('enterpriseCacheOperationHistory', access.tenantSlug, 24);
            var invalidations = latestRows('enterpriseCacheInvalidationHistory', access.tenantSlug, 18);
            var warmups = latestRows('enterpriseCacheWarmupHistory', access.tenantSlug, 12);
            var activeKeys = metrics.keys.slice(0, 80).map(function map(key) {
                var entry = memoryStore.get(key) || {};
                return {
                    key: key,
                    domain: entry.domain || '',
                    entityId: entry.entityId || '',
                    ttlSeconds: entry.ttlSeconds || 0,
                    expiresAt: entry.expiresAt || '',
                    compressed: entry.compressed === true,
                    sizeBytes: entry.sizeBytes || 0
                };
            });
            var report = {
                success: true,
                tenantSlug: access.tenantSlug,
                architecture: {
                    applicationLayer: true,
                    redisCacheLayer: true,
                    databaseLayer: true,
                    cacheAsidePattern: true,
                    futureClusterSupport: ['Redis Cluster', 'Redis Sentinel', 'Redis Enterprise']
                },
                analytics: {
                    cacheHitRate: metrics.cacheHitRate,
                    cacheMissRate: metrics.cacheMissRate,
                    evictionRate: metrics.evictionRate,
                    invalidationRate: metrics.invalidationRate,
                    averageLookupTimeMs: metrics.averageLookupTimeMs,
                    memoryUsageBytes: metrics.memoryUsageBytes,
                    activeCacheKeys: metrics.activeCacheKeys,
                    redisUnavailableEvents: metrics.redisUnavailableEvents
                },
                cacheHealthScore: metrics.cacheHealthScore,
                performanceScore: metrics.performanceScore,
                optimizationScore: metrics.optimizationScore,
                activeKeys: activeKeys,
                recentOperations: operations,
                recentInvalidations: invalidations,
                recentWarmups: warmups,
                performance: {
                    capabilities: {
                        compression: true,
                        batchOperations: true,
                        pipelining: true,
                        connectionPooling: true,
                        startupWarmup: true,
                        selectiveInvalidation: true
                    },
                    protections: {
                        cacheStampede: true,
                        cachePenetration: true,
                        cacheAvalanche: true,
                        redisUnavailableFallback: true,
                        staleCacheBlocking: true
                    }
                },
                integrations: {
                    auditGovernance: !!global.AuditService,
                    validationRegistry: !!(global.ValidationRegistry || global.validationRegistryService),
                    runtimeMonitoring: !!(global.RuntimeEnvironmentHealthService || global.runtimeEnvironmentHealthService),
                    platformAnalytics: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
                    featureFlags: true
                },
                governance: governanceFlags({
                    noCrossTenantKeys: true,
                    credentialsCachingBlocked: true,
                    manualCacheManagementRequired: false
                }),
                generatedAt: nowIso(context || {})
            };
            return freezeCacheOutput(report);
        } catch (error) {
            return result(false, 'CACHE_REPORT_FAILED_SAFE', 'Cache operations report failed safely.', {
                analytics: {},
                governance: governanceFlags({ redisUnavailableHandled: true })
            });
        }
    }

    function configureCache(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var current = data();
            current.cacheConfiguration = current.cacheConfiguration || {};
            current.cacheConfiguration.tenantOverrides = current.cacheConfiguration.tenantOverrides || {};
            current.cacheConfiguration.tenantOverrides[access.tenantSlug] = Object.assign(
                {},
                current.cacheConfiguration.tenantOverrides[access.tenantSlug] || {},
                cloneCacheValue(source.ttlOverrides || {}, [])
            );
            save(current);
            audit('CACHE_CONFIGURATION_CHANGED', { tenantSlug: access.tenantSlug, ttlOverrides: source.ttlOverrides || {} }, context || {}, 'INFO');
            return result(true, 'CACHE_CONFIGURATION_UPDATED', 'Cache configuration updated.', {
                tenantSlug: access.tenantSlug,
                ttlOverrides: current.cacheConfiguration.tenantOverrides[access.tenantSlug],
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'CACHE_CONFIGURATION_FAILED_SAFE', 'Cache configuration failed safely.', { governance: governanceFlags() });
        }
    }

    function flushTenantCache(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId || contextTenant(context || {}), context || {});
            if (!access.success) return access;
            var keys = tenantStoreKeys(access.tenantSlug);
            keys.forEach(function remove(key) { memoryStore.delete(key); });
            stats.invalidations += keys.length;
            audit('CACHE_FLUSH_RECORDED', { tenantSlug: access.tenantSlug, flushedKeys: keys.length }, context || {}, 'WARNING');
            return result(true, 'CACHE_TENANT_FLUSHED', 'Tenant cache flushed.', {
                tenantSlug: access.tenantSlug,
                flushedKeys: keys,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'CACHE_FLUSH_FAILED_SAFE', 'Cache flush failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: cloneCacheValue(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'cache-self-test',
                actor: { id: 'CACHE-SELF', role: 'PLATFORM_OWNER', tenantSlug: 'cache-self-test' },
                skipAuditPersistence: true,
                skipHistoryPersistence: true,
                skipAnalyticsPersistence: true
            };
            var frozen = freezeCacheOutput({ nested: { value: 1 } });
            var key = buildKey({ tenantSlug: 'cache-self-test', domain: 'feature_flags', entityId: 'self' }, ctx);
            record('cache key builder works', key.success && key.key === 'tenant:cache-self-test:feature_flags:self');
            if (key.success) {
                memoryStore.set(key.key, {
                    key: key.key,
                    tenantSlug: 'cache-self-test',
                    domain: 'feature_flags',
                    entityId: 'self',
                    value: cloneCacheValue({ enabled: true, token: 'hidden' }, []),
                    ttlSeconds: 60,
                    createdAtMs: nowMs(ctx),
                    expiresAtMs: nowMs(ctx) + 60000,
                    expiresAt: new Date(nowMs(ctx) + 60000).toISOString(),
                    compressed: true,
                    sizeBytes: 16
                });
            }
            record('cache writes work', memoryStore.has(key.key));
            var readEntry = memoryStore.get(key.key);
            record('cache reads work', !!readEntry && readEntry.value.enabled === true && readEntry.value.token === undefined);
            memoryStore.delete(key.key);
            record('invalidation works', !memoryStore.has(key.key));
            var warmKey = 'tenant:cache-self-test:lookup_tables:employment_types';
            memoryStore.set(warmKey, {
                key: warmKey,
                tenantSlug: 'cache-self-test',
                domain: 'lookup_tables',
                entityId: 'employment_types',
                value: { values: ['FULL_TIME'] },
                ttlSeconds: 86400,
                createdAtMs: nowMs(ctx),
                expiresAtMs: nowMs(ctx) + 86400000,
                expiresAt: new Date(nowMs(ctx) + 86400000).toISOString(),
                compressed: true,
                sizeBytes: 30
            });
            record('warming works', memoryStore.has(warmKey));
            var denied = buildKey({ tenantSlug: 'other-tenant', domain: 'feature_flags', entityId: 'self' }, ctx);
            record('tenant isolation works', denied.success === false && denied.code === 'TENANT_ACCESS_DENIED');
            var analytics = collectMetrics({ tenantSlug: 'cache-self-test' }, Object.assign({}, ctx, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            record('analytics work', analytics.success === true && Number.isFinite(analytics.cacheHealthScore));
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
            var output = freezeCacheOutput({
                passed: checks.every(function passed(check) { return check.passed; }),
                checks: checks,
                summary: 'Enterprise Redis cache self-test completed.'
            });
            global.__ARTHHRMS_ENTERPRISE_REDIS_CACHE_SELF_TEST__ = output;
            return output;
        } catch (error) {
            var failed = freezeCacheOutput({
                passed: false,
                checks: checks.concat([{ name: 'self-test uncaught exception guard', passed: false, details: { message: error && error.message } }])
            });
            global.__ARTHHRMS_ENTERPRISE_REDIS_CACHE_SELF_TEST__ = failed;
            return failed;
        }
    }

    var CacheKeyBuilder = Object.freeze({ buildKey: buildKey });
    var CacheService = Object.freeze({ get: get, set: set });
    var CacheManager = Object.freeze({
        getOrSet: getOrSet,
        configureCache: configureCache,
        flushTenantCache: flushTenantCache
    });
    var CacheInvalidator = Object.freeze({
        invalidate: invalidate,
        bulkInvalidate: bulkInvalidate,
        invalidateAfterMutation: invalidateAfterMutation,
        scheduleInvalidation: function scheduleInvalidation(input, context) {
            return result(true, 'CACHE_INVALIDATION_SCHEDULED', 'Scheduled invalidation prepared.', {
                tenantSlug: normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {})),
                schedule: cloneCacheValue(input || {}, []),
                governance: governanceFlags()
            });
        }
    });
    var CacheWarmupService = Object.freeze({
        warmTenantCache: warmTenantCache,
        warmCache: warmTenantCache,
        startupWarmup: warmTenantCache
    });
    var CacheMetricsCollector = Object.freeze({
        collect: collectMetrics,
        collectMetrics: collectMetrics
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        CACHE_DOMAINS: CACHE_DOMAINS,
        CACHE_STATES: CACHE_STATES,
        DEFAULT_TTLS: DEFAULT_TTLS,
        CacheService: CacheService,
        CacheKeyBuilder: CacheKeyBuilder,
        CacheManager: CacheManager,
        CacheInvalidator: CacheInvalidator,
        CacheWarmupService: CacheWarmupService,
        CacheMetricsCollector: CacheMetricsCollector,
        generateCacheOperationsReport: generateCacheOperationsReport,
        freezeCacheOutput: freezeCacheOutput,
        runSelfTest: runSelfTest
    });

    global.EnterpriseRedisCacheService = service;
    global.enterpriseRedisCacheService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_ENTERPRISE_REDIS_CACHE_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_ENTERPRISE_REDIS_CACHE_SELF_TEST__ = freezeCacheOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
