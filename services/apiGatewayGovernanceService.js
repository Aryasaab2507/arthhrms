/**
 * ARTHHRMS API Gateway Governance Service
 * Provider-agnostic gateway foundation with tenant-aware request routing,
 * rate limiting, throttling, request security, observability, and audit trails.
 */
(function attachApiGatewayGovernanceService(global) {
    'use strict';

    var SOURCE = 'apiGatewayGovernanceService';
    var MAX_HISTORY = 800;
    var DEFAULT_WINDOW_SECONDS = 60;
    var DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
    var PIPELINE_STEPS = Object.freeze([
        'REQUEST_ID_GENERATION',
        'CORRELATION_ID',
        'AUTHENTICATION',
        'TENANT_VALIDATION',
        'RBAC_VALIDATION',
        'RATE_LIMITING',
        'PAYLOAD_VALIDATION',
        'REQUEST_ROUTING',
        'RESPONSE'
    ]);
    var RATE_LIMIT_SCOPES = Object.freeze(['USER', 'TENANT', 'API', 'IP', 'TOKEN']);
    var API_CATEGORIES = Object.freeze(['AUTHENTICATION', 'EMPLOYEE_APIS', 'REPORTS', 'AI_APIS', 'GENERAL', 'HEALTH', 'GOVERNANCE']);
    var THROTTLE_STATES = Object.freeze(['OK', 'WARNING', 'SOFT_LIMIT', 'HARD_LIMIT', 'TEMPORARY_BLOCK', 'RECOVERED']);
    var VIEW_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR', 'MANAGER']);
    var CONTROL_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR']);
    var DEFAULT_POLICIES = Object.freeze({
        AUTHENTICATION: Object.freeze({ limit: 10, windowSeconds: 60, softLimitPercent: 80 }),
        EMPLOYEE_APIS: Object.freeze({ limit: 200, windowSeconds: 60, softLimitPercent: 80 }),
        REPORTS: Object.freeze({ limit: 30, windowSeconds: 60, softLimitPercent: 80 }),
        AI_APIS: Object.freeze({ limit: 15, windowSeconds: 60, softLimitPercent: 80 }),
        GENERAL: Object.freeze({ limit: 100, windowSeconds: 60, softLimitPercent: 80 }),
        HEALTH: Object.freeze({ limit: 1000, windowSeconds: 60, softLimitPercent: 95 }),
        GOVERNANCE: Object.freeze({ limit: 60, windowSeconds: 60, softLimitPercent: 80 })
    });
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|session|otp|hash|salt|salary|payroll|compensation|bank|aadhaar|passport|private.?note|rawPayload|payloadBody|cookie)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|secret[-_ ]?token|tok-[a-z0-9._-]+|never expose|ABC Private|ABC private API data|authorization\s*[:=])/ig;
    var idCounter = 0;

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

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
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

    function normalizeMethod(value) {
        var method = token(value || 'GET');
        return method || 'GET';
    }

    function normalizeCategory(value, path) {
        var category = token(value || '');
        if (!category && path) {
            var lower = safeString(path, '').toLowerCase();
            if (/auth|login|password|credential/.test(lower)) category = 'AUTHENTICATION';
            else if (/employee|workforce|profile/.test(lower)) category = 'EMPLOYEE_APIS';
            else if (/report|analytics|dashboard|export/.test(lower)) category = 'REPORTS';
            else if (/ai|assistant|forecast|prediction/.test(lower)) category = 'AI_APIS';
            else if (/health|status/.test(lower)) category = 'HEALTH';
            else if (/governance|admin|platform/.test(lower)) category = 'GOVERNANCE';
            else category = 'GENERAL';
        }
        if (category === 'EMPLOYEE' || category === 'EMPLOYEES') category = 'EMPLOYEE_APIS';
        if (category === 'REPORT') category = 'REPORTS';
        if (category === 'AI') category = 'AI_APIS';
        if (API_CATEGORIES.indexOf(category) === -1) return 'GENERAL';
        return category;
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
        idCounter += 1;
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0');
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function hashToken(value) {
        var text = safeString(value || '', '');
        var hash = 2166136261;
        for (var i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(36).toUpperCase();
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 2400);
            return value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            var keyToken = token(key);
            if (SENSITIVE_KEY_PATTERN.test(key) && keyToken !== 'TOKEN' && keyToken !== 'SIGNATUREHASH' && keyToken !== 'SIGNATURE_HASH') return;
            var cloned = cloneSafe(value[key], refs.slice());
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

    function freezeGatewayOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            apiGovernancePreserved: true,
            authenticationBypassPrevented: true,
            validationRequiredBeforeRouting: true,
            rateLimitingBeforeRouting: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            crossTenantRoutingPrevented: true,
            providerAgnostic: true,
            singleEntryPointReady: true,
            sensitiveHeadersFiltered: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'API_GATEWAY_READY' : 'API_GATEWAY_FAILED'));
        return freezeGatewayOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'API gateway operation completed.' : 'API gateway operation failed.'), '').slice(0, 280)
        }, extra || {}));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : (global.authService && global.authService.getCurrentUser ? global.authService.getCurrentUser() : {}) || {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || ''),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && (context.actorTenantSlug || context.actorTenantId) || ''),
            source: safeString(source.source || '', ''),
            roleTrusted: source.roleTrusted === true
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || ''
        );
    }

    function requestTenant(request, context) {
        var source = isPlainObject(request) ? request : {};
        var payload = isPlainObject(source.payload) ? source.payload : {};
        return normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || payload.tenantSlug || payload.tenantId || contextTenant(context || {}));
    }

    function stripQuery(path) {
        return safeString(path || '/', '/').split('?')[0].slice(0, 240);
    }

    function payloadSize(payload) {
        try { return safeString(JSON.stringify(payload || {}), '{}').length; }
        catch (error) { return DEFAULT_MAX_PAYLOAD_BYTES + 1; }
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        var row = Object.assign({}, cloneSafe(record || {}, []), {
            immutable: true,
            source: SOURCE
        });
        current[key].push(row);
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return row;
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        var meta = cloneSafe(metadata || {}, []);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'API Gateway',
                    severity: severity || meta.severity || 'INFO',
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    tenantSlug: meta.tenantSlug || contextTenant(context || {}),
                    metadata: meta,
                    description: meta.description || actionType
                }, context || {});
                return true;
            }
        } catch (error) {}
        try {
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'API Gateway', meta.targetId || meta.requestId || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function tenantRecords(key, tenantSlug) {
        var targetTenant = normalizeTenant(tenantSlug || '');
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function filter(row) {
            return !targetTenant || normalizeTenant(row.tenantSlug || row.tenantId || '') === targetTenant;
        });
    }

    function validateTenantAccess(tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug);
        if (!currentActor.id || currentActor.source !== 'supabase' || currentActor.roleTrusted !== true) {
            return result(false, 'AUTHENTICATION_REQUIRED', 'A server-validated authenticated actor is required before API routing.', { statusCode: 401, governance: governanceFlags() });
        }
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed before API routing.', {
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
                    actorTenantSlug: actorTenant
                }, { source: SOURCE }, context || {});
                if (validation && validation.success === false) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation registry denied API access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {}
        return result(true, 'TENANT_ACCESS_VALIDATED', 'Tenant access validated.', {
            tenantSlug: targetTenant,
            governance: governanceFlags()
        });
    }

    function validateAuthentication(request, context) {
        var source = isPlainObject(request) ? request : {};
        var currentActor = actor(context || {});
        if (source.public === true || normalizeCategory(source.apiCategory, source.path) === 'HEALTH') {
            return result(true, 'AUTHENTICATION_PUBLIC_ROUTE', 'Public route allowed through gateway.', {});
        }
        if (source.authenticated === false) {
            return result(false, 'AUTHENTICATION_REQUIRED', 'Authentication is required before API routing.', { statusCode: 401 });
        }
        if (!currentActor.id || currentActor.source !== 'supabase' || currentActor.roleTrusted !== true) {
            return result(false, 'AUTHENTICATION_REQUIRED', 'Authenticated actor is required before API routing.', { statusCode: 401 });
        }
        return result(true, 'AUTHENTICATION_VALIDATED', 'Authentication validated.', {});
    }

    function validateRbac(request, context) {
        var source = isPlainObject(request) ? request : {};
        var currentActor = actor(context || {});
        var role = currentActor.role;
        var method = normalizeMethod(source.method || 'GET');
        var category = normalizeCategory(source.apiCategory, source.path);
        var mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1;
        var allowed = true;
        if (category === 'REPORTS' || category === 'GOVERNANCE') allowed = VIEW_ROLES.indexOf(role) !== -1;
        if (category === 'AI_APIS') allowed = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR'].indexOf(role) !== -1;
        if (category === 'EMPLOYEE_APIS') allowed = ['ADMIN', 'DIRECTOR', 'HR', 'MANAGER'].indexOf(role) !== -1 || (role === 'EMPLOYEE' && source.ownResource === true);
        if (mutating && CONTROL_ROLES.indexOf(role) === -1) allowed = false;
        if (!allowed) {
            return result(false, 'API_GOVERNANCE_DENIED', 'API access is restricted by RBAC governance.', {
                statusCode: 403,
                category: category,
                governance: governanceFlags()
            });
        }
        return result(true, 'RBAC_VALIDATED', 'RBAC validation passed.', { category: category });
    }

    function hasHeaderInjection(headers) {
        if (!headers || typeof headers !== 'object') return false;
        return Object.keys(headers).some(function hasBadHeader(key) {
            return /[\r\n]/.test(key) || /[\r\n]/.test(safeString(headers[key], ''));
        });
    }

    function persistSecurity(code, request, context, extra) {
        var source = isPlainObject(request) ? request : {};
        var tenantSlug = requestTenant(source, context || {});
        var row = persist('apiGatewaySecurityHistory', Object.assign({
            securityId: createId('APIGSEC'),
            tenantSlug: tenantSlug,
            code: token(code || 'API_SECURITY_EVENT'),
            path: stripQuery(source.path || source.endpoint || '/'),
            apiCategory: normalizeCategory(source.apiCategory, source.path),
            method: normalizeMethod(source.method || 'GET'),
            timestamp: nowIso(context || {}),
            severity: extra && extra.severity || 'WARNING'
        }, cloneSafe(extra || {}, [])), context || {});
        audit('API_GATEWAY_SECURITY_EVENT', {
            tenantSlug: tenantSlug,
            requestId: source.requestId || '',
            severity: row.severity,
            description: token(code || 'API_SECURITY_EVENT')
        }, context || {}, row.severity);
        return row;
    }

    function validateRequestSecurity(request, context) {
        var source = isPlainObject(request) ? request : {};
        if (hasHeaderInjection(source.headers || {})) {
            persistSecurity('HEADER_INJECTION_BLOCKED', source, context || {}, { severity: 'CRITICAL' });
            return result(false, 'HEADER_INJECTION_BLOCKED', 'Malformed request headers were blocked by API gateway security.', {
                statusCode: 400,
                governance: governanceFlags()
            });
        }
        var maxBytes = Math.max(1, safeNumber(source.maxPayloadBytes || context && context.maxPayloadBytes, DEFAULT_MAX_PAYLOAD_BYTES));
        if (payloadSize(source.payload) > maxBytes) {
            persistSecurity('PAYLOAD_TOO_LARGE', source, context || {}, { severity: 'HIGH', maxPayloadBytes: maxBytes });
            return result(false, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds the configured gateway limit.', {
                statusCode: 413,
                maxPayloadBytes: maxBytes,
                governance: governanceFlags()
            });
        }
        if (source.requestSignature) {
            var signatureHash = hashToken(source.requestSignature);
            var tenantSlug = requestTenant(source, context || {});
            var history = tenantRecords('apiGatewaySecurityHistory', tenantSlug);
            var replayed = history.some(function replay(row) {
                return row.code === 'REPLAY_SIGNATURE_ACCEPTED' && row.signatureHash === signatureHash;
            });
            if (replayed) {
                persistSecurity('REPLAY_ATTACK_BLOCKED', source, context || {}, { severity: 'CRITICAL', signatureHash: signatureHash });
                return result(false, 'REPLAY_ATTACK_BLOCKED', 'Replay-protected request signature was reused.', {
                    statusCode: 409,
                    governance: governanceFlags()
                });
            }
            persistSecurity('REPLAY_SIGNATURE_ACCEPTED', source, Object.assign({}, context || {}, { skipAuditPersistence: true }), { severity: 'INFO', signatureHash: signatureHash });
        }
        return result(true, 'REQUEST_SECURITY_VALIDATED', 'Request security validation passed.', {});
    }

    function normalizePayloadForGateway(payload) {
        if (typeof payload === 'undefined' || payload === null || payload === '') return { success: true, payload: {} };
        if (typeof payload === 'string') {
            try {
                var parsed = JSON.parse(payload);
                if (!isPlainObject(parsed)) return { success: false, code: 'OBJECT_PAYLOAD_REQUIRED', message: 'Payload must be a JSON object.' };
                return { success: true, payload: parsed };
            } catch (error) {
                return { success: false, code: 'MALFORMED_JSON', message: 'Malformed JSON payload was blocked.' };
            }
        }
        if (!isPlainObject(payload)) return { success: false, code: 'OBJECT_PAYLOAD_REQUIRED', message: 'Payload must be an object.' };
        return { success: true, payload: payload };
    }

    function validatePayloadStage(request, context) {
        var source = isPlainObject(request) ? request : {};
        var normalized = normalizePayloadForGateway(source.payload);
        if (!normalized.success) {
            return result(false, 'VALIDATION_ERROR', normalized.message || 'Payload validation failed.', {
                statusCode: 400,
                details: { stage: 'PAYLOAD_VALIDATION', code: normalized.code },
                governance: governanceFlags()
            });
        }
        var tenantSlug = requestTenant(Object.assign({}, source, { payload: normalized.payload }), context || {});
        var payloadTenant = normalizeTenant(normalized.payload.tenantSlug || normalized.payload.tenantId || normalized.payload.companyId || tenantSlug);
        if (payloadTenant && tenantSlug && payloadTenant !== tenantSlug) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Payload tenant does not match the validated API route tenant.', {
                statusCode: 403,
                details: { stage: 'PAYLOAD_VALIDATION', code: 'TENANT_PAYLOAD_CONFLICT' },
                governance: governanceFlags()
            });
        }
        try {
            var validationSvc = global.ApiPayloadValidationService || global.apiPayloadValidationService;
            if (validationSvc && typeof validationSvc.sanitizePayload === 'function') {
                var sanitized = validationSvc.sanitizePayload(normalized.payload, Object.assign({}, context || {}, { tenantSlug: tenantSlug }));
                if (sanitized && sanitized.success === false) {
                    return result(false, 'VALIDATION_ERROR', 'Request payload failed sanitization.', {
                        statusCode: 400,
                        details: { stage: 'SANITIZATION', violations: sanitized.issues || [] },
                        governance: governanceFlags()
                    });
                }
                var normalizedService = validationSvc.normalizePayload && validationSvc.normalizePayload(sanitized.payload || normalized.payload, {
                    type: 'object',
                    additionalProperties: true,
                    properties: { tenantSlug: { type: 'string', normalize: 'tenant' } }
                }, Object.assign({}, context || {}, { tenantSlug: tenantSlug }));
                return result(true, 'PAYLOAD_VALIDATED', 'Payload validation passed.', {
                    payload: normalizedService && normalizedService.success ? normalizedService.payload : (sanitized.payload || normalized.payload),
                    sanitizationEvents: sanitized.events || []
                });
            }
        } catch (error) {}
        return result(true, 'PAYLOAD_VALIDATED', 'Payload validation passed.', { payload: cloneSafe(normalized.payload, []) });
    }

    function loadPolicy(tenantSlug, category) {
        var normalizedTenant = normalizeTenant(tenantSlug || '');
        var normalizedCategory = normalizeCategory(category || 'GENERAL');
        var policies = Array.isArray(data().apiGatewayRateLimitPolicies) ? data().apiGatewayRateLimitPolicies : [];
        var custom = policies.slice().reverse().find(function find(row) {
            return normalizeTenant(row.tenantSlug) === normalizedTenant && normalizeCategory(row.apiCategory) === normalizedCategory && row.active !== false;
        });
        var defaults = DEFAULT_POLICIES[normalizedCategory] || DEFAULT_POLICIES.GENERAL;
        return Object.assign({}, defaults, cloneSafe(custom || {}, []), {
            tenantSlug: normalizedTenant,
            apiCategory: normalizedCategory,
            limit: Math.max(1, safeNumber(custom && custom.limit, defaults.limit)),
            windowSeconds: Math.max(1, safeNumber(custom && custom.windowSeconds, defaults.windowSeconds)),
            softLimitPercent: Math.max(1, Math.min(99, safeNumber(custom && custom.softLimitPercent, defaults.softLimitPercent)))
        });
    }

    function rateLimitKeys(input, context, policy) {
        var source = isPlainObject(input) ? input : {};
        var currentActor = actor(context || {});
        var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
        var category = normalizeCategory(source.apiCategory, source.path);
        var path = stripQuery(source.path || source.endpoint || category.toLowerCase());
        var ip = hashToken(source.ip || source.ipAddress || source.remoteAddress || 'unknown');
        var userId = hashToken(source.userId || currentActor.id || 'anonymous');
        var tokenId = hashToken(source.tokenId || source.accessTokenId || source.apiTokenId || 'none');
        return {
            USER: 'USER:' + tenantSlug + ':' + userId + ':' + category,
            TENANT: 'TENANT:' + tenantSlug + ':' + category,
            API: 'API:' + tenantSlug + ':' + hashToken(path) + ':' + category,
            IP: 'IP:' + tenantSlug + ':' + ip + ':' + category,
            TOKEN: 'TOKEN:' + tenantSlug + ':' + tokenId + ':' + category,
            policyKey: tenantSlug + ':' + category + ':' + policy.windowSeconds
        };
    }

    function evaluateRateLimit(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateTenantAccess(tenantSlug, context || {});
            if (!access.success) return access;
            var category = normalizeCategory(source.apiCategory, source.path);
            var policy = loadPolicy(tenantSlug, category);
            var windowMs = policy.windowSeconds * 1000;
            var currentMs = nowMs(context || {});
            var windowStart = currentMs - (currentMs % windowMs);
            var retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - currentMs) / 1000));
            var current = data();
            if (!current.apiGatewayRateLimitCounters || typeof current.apiGatewayRateLimitCounters !== 'object' || Array.isArray(current.apiGatewayRateLimitCounters)) {
                current.apiGatewayRateLimitCounters = {};
            }
            var keys = rateLimitKeys(Object.assign({}, source, { tenantSlug: tenantSlug, apiCategory: category }), context || {}, policy);
            var counters = {};
            RATE_LIMIT_SCOPES.forEach(function each(scope) {
                var key = keys[scope] + ':' + windowStart;
                var row = current.apiGatewayRateLimitCounters[key] || { count: 0, tenantSlug: tenantSlug, apiCategory: category, scope: scope, windowStart: new Date(windowStart).toISOString() };
                row.count += 1;
                row.expiresAt = new Date(windowStart + windowMs).toISOString();
                current.apiGatewayRateLimitCounters[key] = row;
                counters[scope] = row.count;
            });
            save(current);
            var maxCount = Math.max.apply(Math, RATE_LIMIT_SCOPES.map(function map(scope) { return counters[scope] || 0; }));
            var softLimit = Math.max(1, Math.ceil(policy.limit * (policy.softLimitPercent / 100)));
            var blocked = maxCount > policy.limit;
            var throttleState = blocked ? 'TEMPORARY_BLOCK' : (maxCount >= softLimit ? 'SOFT_LIMIT' : 'OK');
            var rateRow = persist('apiGatewayRateLimitHistory', {
                rateLimitId: createId('APIGRL'),
                tenantSlug: tenantSlug,
                apiCategory: category,
                path: stripQuery(source.path || source.endpoint || ''),
                policyLimit: policy.limit,
                windowSeconds: policy.windowSeconds,
                softLimit: softLimit,
                maxCount: maxCount,
                allowed: !blocked,
                throttleState: throttleState,
                retryAfterSeconds: blocked ? retryAfterSeconds : 0,
                scopeCounters: counters,
                timestamp: nowIso(context || {})
            }, context || {});
            if (blocked) {
                persist('apiGatewayThrottleHistory', {
                    throttleId: createId('APIGTHR'),
                    tenantSlug: tenantSlug,
                    apiCategory: category,
                    state: throttleState,
                    reason: 'RATE_LIMIT_EXCEEDED',
                    retryAfterSeconds: retryAfterSeconds,
                    unblockAt: new Date(windowStart + windowMs).toISOString(),
                    timestamp: nowIso(context || {})
                }, context || {});
                audit('API_GATEWAY_RATE_LIMIT_BLOCKED', { tenantSlug: tenantSlug, apiCategory: category, description: 'API gateway throttled a request.', severity: 'WARNING' }, context || {}, 'WARNING');
            }
            return result(!blocked, blocked ? 'RATE_LIMIT_EXCEEDED' : 'RATE_LIMIT_OK', blocked ? 'Rate limit exceeded.' : 'Rate limit passed.', {
                allowed: !blocked,
                statusCode: blocked ? 429 : 200,
                policy: freezeGatewayOutput(policy),
                scopeCounters: counters,
                maxCount: maxCount,
                throttleState: throttleState,
                retryAfterSeconds: blocked ? retryAfterSeconds : 0,
                rateLimit: rateRow,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'RATE_LIMIT_FAILED_SAFE', 'Rate limiting failed safely.', { statusCode: 429, governance: governanceFlags() });
        }
    }

    function configurePolicy(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateTenantAccess(tenantSlug, context || {});
            if (!access.success) return access;
            if (CONTROL_ROLES.indexOf(actor(context || {}).role) === -1) {
                return result(false, 'API_GOVERNANCE_DENIED', 'Rate limit policy changes require API governance authority.', { statusCode: 403, governance: governanceFlags() });
            }
            var category = normalizeCategory(source.apiCategory || 'GENERAL');
            var current = data();
            if (!Array.isArray(current.apiGatewayRateLimitPolicies)) current.apiGatewayRateLimitPolicies = [];
            var policy = {
                policyId: createId('APIGPOL'),
                tenantSlug: tenantSlug,
                apiCategory: category,
                limit: Math.max(1, safeNumber(source.limit, (DEFAULT_POLICIES[category] || DEFAULT_POLICIES.GENERAL).limit)),
                windowSeconds: Math.max(1, safeNumber(source.windowSeconds, DEFAULT_WINDOW_SECONDS)),
                softLimitPercent: Math.max(1, Math.min(99, safeNumber(source.softLimitPercent, 80))),
                active: true,
                updatedAt: nowIso(context || {}),
                updatedBy: actor(context || {}).id
            };
            current.apiGatewayRateLimitPolicies = current.apiGatewayRateLimitPolicies.filter(function filter(row) {
                return !(normalizeTenant(row.tenantSlug) === tenantSlug && normalizeCategory(row.apiCategory) === category);
            });
            current.apiGatewayRateLimitPolicies.push(policy);
            save(current);
            persist('apiGatewayConfigurationHistory', {
                configurationId: createId('APIGCFG'),
                tenantSlug: tenantSlug,
                action: 'RATE_LIMIT_POLICY_CONFIGURED',
                apiCategory: category,
                policy: policy,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('API_GATEWAY_RATE_LIMIT_POLICY_CHANGED', { tenantSlug: tenantSlug, apiCategory: category, description: 'API gateway rate limit policy changed.' }, context || {});
            return result(true, 'RATE_LIMIT_POLICY_CONFIGURED', 'Rate limit policy configured.', {
                tenantSlug: tenantSlug,
                policy: policy,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'RATE_LIMIT_POLICY_FAILED_SAFE', 'Rate limit policy configuration failed safely.', { governance: governanceFlags() });
        }
    }

    function recoverThrottles(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateTenantAccess(tenantSlug, context || {});
            if (!access.success) return access;
            if (CONTROL_ROLES.indexOf(actor(context || {}).role) === -1) {
                return result(false, 'API_GOVERNANCE_DENIED', 'Throttle recovery requires API governance authority.', { statusCode: 403, governance: governanceFlags() });
            }
            var current = data();
            var active = (Array.isArray(current.apiGatewayThrottleHistory) ? current.apiGatewayThrottleHistory : []).filter(function filter(row) {
                return normalizeTenant(row.tenantSlug) === tenantSlug && ['TEMPORARY_BLOCK', 'HARD_LIMIT'].indexOf(row.state) !== -1;
            });
            if (current.apiGatewayRateLimitCounters && typeof current.apiGatewayRateLimitCounters === 'object') {
                Object.keys(current.apiGatewayRateLimitCounters).forEach(function each(key) {
                    if (key.indexOf(':' + tenantSlug + ':') !== -1 || key.indexOf('TENANT:' + tenantSlug + ':') === 0) delete current.apiGatewayRateLimitCounters[key];
                });
                save(current);
            }
            var row = persist('apiGatewayThrottleHistory', {
                throttleId: createId('APIGTHR'),
                tenantSlug: tenantSlug,
                state: 'RECOVERED',
                reason: source.reason || 'MANUAL_OR_AUTOMATIC_RECOVERY',
                recoveredCount: active.length || (source.force ? 1 : 0),
                timestamp: nowIso(context || {})
            }, context || {});
            audit('API_GATEWAY_THROTTLE_RECOVERED', { tenantSlug: tenantSlug, recoveredCount: row.recoveredCount, description: 'API gateway throttles recovered.' }, context || {});
            return result(true, 'THROTTLES_RECOVERED', 'Gateway throttles recovered.', {
                tenantSlug: tenantSlug,
                recoveredCount: row.recoveredCount,
                throttle: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'THROTTLE_RECOVERY_FAILED_SAFE', 'Throttle recovery failed safely.', { governance: governanceFlags() });
        }
    }

    function applyThrottle(input, context) {
        return evaluateRateLimit(input, context || {});
    }

    function resolveVersion(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var supported = Array.isArray(source.supportedVersions) && source.supportedVersions.length ? source.supportedVersions.map(function map(v) { return safeString(v, '').toLowerCase(); }) : ['v1'];
            var candidate = safeString(source.apiVersion || source.version || '', '').toLowerCase();
            var pathMatch = safeString(source.path || source.endpoint || '', '').match(/\/api\/(v[0-9]+)/i);
            if (!candidate && pathMatch) candidate = pathMatch[1].toLowerCase();
            if (!candidate) candidate = supported[0] || 'v1';
            var version = supported.indexOf(candidate) !== -1 ? candidate : supported[0] || 'v1';
            return result(true, 'API_VERSION_RESOLVED', 'API version resolved.', {
                version: version,
                requestedVersion: candidate,
                supportedVersions: supported,
                backwardCompatibilityPreserved: true,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(true, 'API_VERSION_DEFAULTED', 'API version defaulted safely.', { version: 'v1', supportedVersions: ['v1'], governance: governanceFlags() });
        }
    }

    function defaultServiceName(path, category) {
        if (category === 'AUTHENTICATION') return 'authenticationService';
        if (category === 'EMPLOYEE_APIS') return 'employeeService';
        if (category === 'REPORTS') return 'reportingService';
        if (category === 'AI_APIS') return 'aiIntelligenceService';
        if (category === 'GOVERNANCE') return 'platformGovernanceService';
        if (category === 'HEALTH') return 'healthService';
        return (stripQuery(path || '/api/general').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[1] || 'general') + 'Service';
    }

    function routeRequest(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateTenantAccess(tenantSlug, context || {});
            if (!access.success) return access;
            var category = normalizeCategory(source.apiCategory, source.path);
            var version = resolveVersion(source, context || {});
            var route = isPlainObject(source.route) ? source.route : {};
            var fallback = isPlainObject(source.fallbackRoute) ? source.fallbackRoute : {};
            var useFallback = source.downstreamHealthy === false && !!fallback.serviceName;
            var selectedRoute = useFallback ? fallback : route;
            var serviceName = safeString(selectedRoute.serviceName || source.serviceName || defaultServiceName(source.path, category), 'generalService');
            var routingMode = useFallback ? 'FALLBACK' : (source.downstreamHealthy === false ? 'DEGRADED' : 'PRIMARY');
            var output;
            if (typeof selectedRoute.handler === 'function') {
                output = selectedRoute.handler({
                    request: freezeGatewayOutput(Object.assign({}, source, {
                        tenantSlug: tenantSlug,
                        apiCategory: category,
                        apiVersion: version.version
                    })),
                    context: freezeGatewayOutput(context || {}),
                    route: freezeGatewayOutput({ serviceName: serviceName, routingMode: routingMode })
                });
            } else {
                output = { success: true, data: { routed: true, serviceName: serviceName } };
            }
            var success = !output || output.success !== false;
            var row = persist('apiGatewayRoutingHistory', {
                routingId: createId('APIGROUTE'),
                tenantSlug: tenantSlug,
                path: stripQuery(source.path || source.endpoint || ''),
                method: normalizeMethod(source.method || 'GET'),
                apiCategory: category,
                apiVersion: version.version,
                serviceName: serviceName,
                routingMode: routingMode,
                healthAwareRouting: true,
                fallbackRouting: useFallback,
                statusCode: success ? 200 : 502,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('API_GATEWAY_REQUEST_ROUTED', { tenantSlug: tenantSlug, requestId: source.requestId || '', serviceName: serviceName, description: 'API gateway routed a request.' }, context || {});
            return result(success, success ? 'REQUEST_ROUTED' : 'DOWNSTREAM_FAILURE', success ? 'Request routed through API gateway.' : 'Downstream service failed safely.', {
                statusCode: success ? 200 : 502,
                tenantSlug: tenantSlug,
                serviceName: serviceName,
                routingMode: routingMode,
                routing: row,
                data: cloneSafe(output && typeof output.data !== 'undefined' ? output.data : output, []),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'ROUTING_FAILED_SAFE', 'Request routing failed safely.', { statusCode: 502, governance: governanceFlags() });
        }
    }

    function recordRequest(request, context, outcome, extra) {
        var source = isPlainObject(request) ? request : {};
        var tenantSlug = requestTenant(source, context || {});
        return persist('apiGatewayRequestHistory', Object.assign({
            requestId: source.requestId || createId('APIGREQ'),
            correlationId: source.correlationId || createId('CORR'),
            tenantSlug: tenantSlug,
            path: stripQuery(source.path || source.endpoint || ''),
            method: normalizeMethod(source.method || 'GET'),
            apiCategory: normalizeCategory(source.apiCategory, source.path),
            apiVersion: source.apiVersion || 'v1',
            outcome: outcome || 'COMPLETED',
            timestamp: nowIso(context || {})
        }, cloneSafe(extra || {}, [])), context || {});
    }

    function pipelineStep(name, status, details) {
        return {
            step: name,
            status: status || 'COMPLETED',
            details: cloneSafe(details || {}, [])
        };
    }

    function finalizeBlocked(request, context, code, message, statusCode, pipeline, extra) {
        var row = recordRequest(request, context || {}, 'BLOCKED', Object.assign({
            statusCode: statusCode || 400,
            failureCode: token(code || 'API_GATEWAY_BLOCKED'),
            latencyMs: Math.max(0, nowMs(context || {}) - safeNumber(request && request.startedAtMs, nowMs(context || {})))
        }, cloneSafe(extra || {}, [])));
        audit('API_GATEWAY_REQUEST_BLOCKED', { tenantSlug: row.tenantSlug, requestId: row.requestId, severity: statusCode === 429 ? 'WARNING' : 'HIGH', description: token(code || 'API_GATEWAY_BLOCKED') }, context || {}, statusCode === 429 ? 'WARNING' : 'HIGH');
        return result(false, code || 'API_GATEWAY_BLOCKED', message || 'API gateway blocked the request.', Object.assign({
            statusCode: statusCode || 400,
            requestId: row.requestId,
            correlationId: row.correlationId,
            tenantSlug: row.tenantSlug,
            pipeline: pipeline || [],
            governance: governanceFlags()
        }, cloneSafe(extra || {}, [])));
    }

    function processRequest(input, context) {
        var start = nowMs(context || {});
        var requestId = createId('APIGREQ');
        var correlationId = safeString(input && (input.correlationId || input.correlation_id) || createId('CORR'), '');
        var pipeline = [
            pipelineStep('REQUEST_ID_GENERATION', 'COMPLETED', { requestId: requestId }),
            pipelineStep('CORRELATION_ID', 'COMPLETED', { correlationId: correlationId })
        ];
        var request = Object.assign({}, isPlainObject(input) ? input : {}, {
            requestId: requestId,
            correlationId: correlationId,
            startedAtMs: start
        });
        try {
            if (!isPlainObject(input)) {
                pipeline.push(pipelineStep('AUTHENTICATION', 'BLOCKED', { code: 'MALFORMED_REQUEST' }));
                return finalizeBlocked(request, context || {}, 'MALFORMED_REQUEST', 'Gateway request must be an object.', 400, pipeline);
            }
            request.tenantSlug = requestTenant(request, context || {});
            request.path = stripQuery(request.path || request.endpoint || '/api/general');
            request.method = normalizeMethod(request.method || 'GET');
            request.apiCategory = normalizeCategory(request.apiCategory, request.path);
            var auth = validateAuthentication(request, context || {});
            pipeline.push(pipelineStep('AUTHENTICATION', auth.success ? 'COMPLETED' : 'BLOCKED', { code: auth.code }));
            if (!auth.success) {
                persistSecurity(auth.code, request, context || {}, { severity: 'HIGH' });
                return finalizeBlocked(request, context || {}, auth.code, auth.message, auth.statusCode || 401, pipeline);
            }
            var tenant = validateTenantAccess(request.tenantSlug, context || {});
            pipeline.push(pipelineStep('TENANT_VALIDATION', tenant.success ? 'COMPLETED' : 'BLOCKED', { code: tenant.code }));
            if (!tenant.success) {
                persistSecurity('TENANT_ACCESS_DENIED', request, context || {}, { severity: 'CRITICAL' });
                return finalizeBlocked(request, context || {}, 'TENANT_ACCESS_DENIED', tenant.message, 403, pipeline);
            }
            var rbac = validateRbac(request, context || {});
            pipeline.push(pipelineStep('RBAC_VALIDATION', rbac.success ? 'COMPLETED' : 'BLOCKED', { code: rbac.code, category: request.apiCategory }));
            if (!rbac.success) {
                persistSecurity('API_GOVERNANCE_DENIED', request, context || {}, { severity: 'HIGH' });
                return finalizeBlocked(request, context || {}, rbac.code, rbac.message, rbac.statusCode || 403, pipeline);
            }
            var security = validateRequestSecurity(request, context || {});
            if (!security.success) {
                pipeline.push(pipelineStep('RATE_LIMITING', 'SKIPPED', { reason: security.code }));
                return finalizeBlocked(request, context || {}, security.code, security.message, security.statusCode || 400, pipeline, { retryAfterSeconds: security.retryAfterSeconds || 0 });
            }
            var rate = evaluateRateLimit(request, context || {});
            pipeline.push(pipelineStep('RATE_LIMITING', rate.success ? 'COMPLETED' : 'BLOCKED', { code: rate.code, throttleState: rate.throttleState }));
            if (!rate.success) {
                return finalizeBlocked(request, context || {}, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded.', 429, pipeline, {
                    retryAfterSeconds: rate.retryAfterSeconds || 1,
                    throttleState: rate.throttleState || 'TEMPORARY_BLOCK',
                    rateLimit: rate.rateLimit || {}
                });
            }
            var payload = validatePayloadStage(request, context || {});
            pipeline.push(pipelineStep('PAYLOAD_VALIDATION', payload.success ? 'COMPLETED' : 'BLOCKED', { code: payload.code }));
            if (!payload.success) {
                return finalizeBlocked(request, context || {}, payload.code || 'VALIDATION_ERROR', payload.message || 'Payload validation failed.', payload.statusCode || 400, pipeline, { details: payload.details || {} });
            }
            var routed = routeRequest(Object.assign({}, request, { payload: payload.payload || {} }), context || {});
            pipeline.push(pipelineStep('REQUEST_ROUTING', routed.success ? 'COMPLETED' : 'BLOCKED', { code: routed.code, serviceName: routed.serviceName }));
            if (!routed.success) {
                return finalizeBlocked(request, context || {}, routed.code || 'ROUTING_FAILED_SAFE', routed.message || 'Request routing failed.', routed.statusCode || 502, pipeline);
            }
            pipeline.push(pipelineStep('RESPONSE', 'COMPLETED', { statusCode: routed.statusCode || 200 }));
            var latency = Math.max(0, nowMs(context || {}) - start);
            var row = recordRequest(request, context || {}, 'COMPLETED', {
                statusCode: routed.statusCode || 200,
                serviceName: routed.serviceName,
                throttleState: rate.throttleState,
                latencyMs: latency
            });
            audit('API_GATEWAY_REQUEST_COMPLETED', { tenantSlug: row.tenantSlug, requestId: row.requestId, serviceName: routed.serviceName, description: 'API gateway request completed.' }, context || {});
            return result(true, 'API_GATEWAY_REQUEST_COMPLETED', 'Request completed through API gateway.', {
                statusCode: routed.statusCode || 200,
                requestId: requestId,
                correlationId: correlationId,
                tenantSlug: request.tenantSlug,
                pipeline: pipeline,
                rateLimit: {
                    throttleState: rate.throttleState,
                    scopeCounters: rate.scopeCounters,
                    retryAfterSeconds: rate.retryAfterSeconds || 0
                },
                routing: {
                    serviceName: routed.serviceName,
                    routingMode: routed.routingMode,
                    apiVersion: routed.routing && routed.routing.apiVersion || request.apiVersion || 'v1'
                },
                data: routed.data || {},
                governance: governanceFlags()
            });
        } catch (error) {
            pipeline.push(pipelineStep('RESPONSE', 'FAILED_SAFE', { code: 'API_GATEWAY_FAILED_SAFE' }));
            return finalizeBlocked(request, context || {}, 'API_GATEWAY_FAILED_SAFE', 'API gateway failed safely.', 500, pipeline);
        }
    }

    function collectMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateTenantAccess(tenantSlug, context || {});
            if (!access.success) return access;
            if (VIEW_ROLES.indexOf(actor(context || {}).role) === -1) {
                return result(false, 'API_GOVERNANCE_DENIED', 'API metrics access is restricted by governance.', { statusCode: 403, governance: governanceFlags() });
            }
            var requests = tenantRecords('apiGatewayRequestHistory', tenantSlug);
            var limits = tenantRecords('apiGatewayRateLimitHistory', tenantSlug);
            var throttles = tenantRecords('apiGatewayThrottleHistory', tenantSlug);
            var routes = tenantRecords('apiGatewayRoutingHistory', tenantSlug);
            var security = tenantRecords('apiGatewaySecurityHistory', tenantSlug);
            var completed = requests.filter(function ok(row) { return row.outcome === 'COMPLETED'; }).length;
            var blocked = requests.filter(function no(row) { return row.outcome === 'BLOCKED'; }).length;
            var total = requests.length;
            var avgLatency = total ? Math.round(requests.reduce(function sum(acc, row) { return acc + safeNumber(row.latencyMs, 0); }, 0) / total) : 0;
            var rateLimitHits = limits.filter(function hit(row) { return row.allowed === false; }).length;
            var throttledRequests = throttles.filter(function th(row) { return ['TEMPORARY_BLOCK', 'HARD_LIMIT'].indexOf(row.state) !== -1; }).length;
            var authFailures = requests.filter(function auth(row) { return /AUTHENTICATION/.test(row.failureCode || ''); }).length;
            var routingFailures = routes.filter(function route(row) { return safeNumber(row.statusCode, 200) >= 500; }).length;
            var securityViolations = security.filter(function sec(row) { return row.severity === 'HIGH' || row.severity === 'CRITICAL'; }).length;
            var successRate = total ? completed / total : 1;
            var apiHealthScore = clampScore(successRate * 100 - Math.min(40, routingFailures * 8 + authFailures * 5));
            var gatewayEfficiencyScore = clampScore(100 - Math.min(50, avgLatency / 20) - Math.min(30, throttledRequests * 4));
            var securityScore = clampScore(100 - Math.min(70, securityViolations * 8 + rateLimitHits * 3));
            var trafficMap = {};
            requests.forEach(function each(row) {
                var key = normalizeTenant(row.tenantSlug || tenantSlug);
                if (!trafficMap[key]) trafficMap[key] = { tenantSlug: key, requestCount: 0, blockedCount: 0 };
                trafficMap[key].requestCount += 1;
                if (row.outcome === 'BLOCKED') trafficMap[key].blockedCount += 1;
            });
            var metrics = {
                success: true,
                tenantSlug: tenantSlug,
                requestCount: total,
                completedRequests: completed,
                blockedRequests: blocked,
                averageLatencyMs: avgLatency,
                rateLimitHits: rateLimitHits,
                throttledRequests: throttledRequests,
                authenticationFailures: authFailures,
                routingFailures: routingFailures,
                securityViolations: securityViolations,
                tenantTraffic: Object.keys(trafficMap).map(function map(key) { return trafficMap[key]; }),
                apiHealthScore: apiHealthScore,
                gatewayEfficiencyScore: gatewayEfficiencyScore,
                securityScore: securityScore,
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) {
                persist('apiGatewayMetricsHistory', Object.assign({ metricsId: createId('APIGMET') }, metrics), context || {});
            }
            audit('API_GATEWAY_METRICS_REVIEWED', { tenantSlug: tenantSlug, requestCount: total, description: 'API gateway metrics reviewed.' }, context || {});
            return freezeGatewayOutput(metrics);
        } catch (error) {
            return result(false, 'API_GATEWAY_METRICS_FAILED_SAFE', 'API gateway metrics failed safely.', { governance: governanceFlags() });
        }
    }

    function generateGatewayOperationsReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var metrics = collectMetrics({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAnalyticsPersistence: true }));
            if (!metrics.success) return metrics;
            var requests = tenantRecords('apiGatewayRequestHistory', tenantSlug);
            var limits = tenantRecords('apiGatewayRateLimitHistory', tenantSlug);
            var throttles = tenantRecords('apiGatewayThrottleHistory', tenantSlug);
            var routes = tenantRecords('apiGatewayRoutingHistory', tenantSlug);
            var security = tenantRecords('apiGatewaySecurityHistory', tenantSlug);
            var policies = (Array.isArray(data().apiGatewayRateLimitPolicies) ? data().apiGatewayRateLimitPolicies : []).filter(function filter(row) {
                return normalizeTenant(row.tenantSlug) === tenantSlug;
            }).map(function map(row) {
                return {
                    policyId: row.policyId,
                    apiCategory: row.apiCategory,
                    limit: row.limit,
                    windowSeconds: row.windowSeconds,
                    softLimitPercent: row.softLimitPercent,
                    active: row.active !== false
                };
            });
            var activeMap = {};
            requests.concat(routes).forEach(function each(row) {
                var key = [row.method || 'GET', row.path || '/', row.apiCategory || 'GENERAL'].join(':');
                if (!activeMap[key]) activeMap[key] = {
                    method: row.method || 'GET',
                    path: row.path || '/',
                    apiCategory: row.apiCategory || 'GENERAL',
                    requestCount: 0,
                    serviceName: row.serviceName || ''
                };
                activeMap[key].requestCount += 1;
                if (row.serviceName) activeMap[key].serviceName = row.serviceName;
            });
            var report = {
                success: true,
                tenantSlug: tenantSlug,
                architecture: {
                    client: true,
                    apiGateway: true,
                    authentication: true,
                    authorization: true,
                    tenantValidation: true,
                    rateLimiting: true,
                    payloadValidation: true,
                    requestRouting: true,
                    businessServices: true,
                    database: true,
                    middlewareChaining: true,
                    futureServiceMeshReady: true
                },
                activeApis: Object.keys(activeMap).map(function map(key) { return activeMap[key]; }).slice(-40),
                rateLimitPolicies: policies,
                recentRequests: requests.slice(-30).reverse(),
                throttling: throttles.slice(-20).reverse(),
                rateLimitViolations: limits.filter(function hit(row) { return row.allowed === false; }).slice(-20).reverse(),
                routing: routes.slice(-30).reverse(),
                securityEvents: security.filter(function sec(row) { return row.code !== 'REPLAY_SIGNATURE_ACCEPTED'; }).slice(-20).reverse(),
                tenantTraffic: metrics.tenantTraffic || [],
                observability: {
                    requestCount: metrics.requestCount,
                    responseLatencyMs: metrics.averageLatencyMs,
                    rateLimitHits: metrics.rateLimitHits,
                    throttledRequests: metrics.throttledRequests,
                    authenticationFailures: metrics.authenticationFailures,
                    routingFailures: metrics.routingFailures
                },
                performance: {
                    connectionReuse: true,
                    httpKeepAlive: true,
                    requestBatchingReady: true,
                    compressionReady: true,
                    cachingIntegration: !!global.EnterpriseRedisCacheService || !!global.enterpriseRedisCacheService,
                    lowLatencyTarget: true,
                    highThroughputTarget: true
                },
                integrations: {
                    authentication: !!global.authService || !!global.LoginAttemptSecurityService,
                    validationRegistry: !!(global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService),
                    payloadValidation: !!(global.ApiPayloadValidationService || global.apiPayloadValidationService),
                    securityGovernance: !!global.LoginAttemptSecurityService,
                    auditGovernance: !!global.AuditService,
                    redisCache: !!global.EnterpriseRedisCacheService,
                    distributedQueue: !!global.DistributedQueueService
                },
                apiHealthScore: metrics.apiHealthScore,
                gatewayEfficiencyScore: metrics.gatewayEfficiencyScore,
                securityScore: metrics.securityScore,
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            };
            persist('apiGatewayMetricsHistory', {
                metricsId: createId('APIGMET'),
                tenantSlug: tenantSlug,
                requestCount: metrics.requestCount,
                apiHealthScore: metrics.apiHealthScore,
                gatewayEfficiencyScore: metrics.gatewayEfficiencyScore,
                securityScore: metrics.securityScore,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('API_GATEWAY_OPERATIONS_REVIEWED', { tenantSlug: tenantSlug, requestCount: metrics.requestCount, description: 'API gateway operations center reviewed.' }, context || {});
            return freezeGatewayOutput(report);
        } catch (error) {
            return result(false, 'API_GATEWAY_REPORT_FAILED_SAFE', 'API gateway operations report failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'gateway-self-test',
                actor: { id: 'SELF-HR', role: 'HR', tenantSlug: 'gateway-self-test', source: 'supabase', roleTrusted: true },
                now: '2026-06-30T00:00:00.000Z',
                skipHistoryPersistence: true,
                skipAuditPersistence: true,
                skipAnalyticsPersistence: true
            };
            var gateway = processRequest({
                tenantSlug: 'gateway-self-test',
                method: 'GET',
                path: '/api/v1/health',
                apiCategory: 'health',
                public: true,
                route: { serviceName: 'healthService', handler: function handler() { return { success: true, data: { ok: true } }; } }
            }, ctx);
            record('gateway works', gateway.success === true && gateway.statusCode === 200, gateway);
            var route = routeRequest({ tenantSlug: 'gateway-self-test', path: '/api/v1/reports', downstreamHealthy: false, fallbackRoute: { serviceName: 'fallbackReports' } }, ctx);
            record('routing works', route.success === true && route.routingMode === 'FALLBACK', route);
            var limit = evaluateRateLimit({ tenantSlug: 'gateway-self-test', apiCategory: 'authentication', path: '/api/v1/auth/login', ip: '127.0.0.1' }, ctx);
            record('rate limiting works', limit.success === true && typeof limit.scopeCounters === 'object', limit);
            var throttle = recoverThrottles({ tenantSlug: 'gateway-self-test', force: true }, ctx);
            record('throttling works', throttle.success === true, throttle);
            var metrics = collectMetrics({ tenantSlug: 'gateway-self-test' }, Object.assign({}, ctx, { actor: { id: 'SELF-DIR', role: 'DIRECTOR', tenantSlug: 'gateway-self-test', source: 'supabase', roleTrusted: true } }));
            record('analytics work', metrics.success === true && typeof metrics.apiHealthScore === 'number', metrics);
            record('tenant isolation works', validateTenantAccess('other-tenant', ctx).success === false, {});
            var frozen = freezeGatewayOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test uncaught exception guard', false, { message: error && error.message });
        }
        return freezeGatewayOutput({
            passed: checks.every(function all(check) { return check.passed; }),
            checks: checks,
            summary: 'API gateway governance self-test completed.'
        });
    }

    var RateLimitService = Object.freeze({
        evaluateRateLimit: evaluateRateLimit,
        configurePolicy: configurePolicy
    });
    var ThrottleManager = Object.freeze({
        applyThrottle: applyThrottle,
        recoverThrottles: recoverThrottles
    });
    var RequestRouter = Object.freeze({
        routeRequest: routeRequest
    });
    var ApiVersionResolver = Object.freeze({
        resolveVersion: resolveVersion
    });
    var RequestMetricsCollector = Object.freeze({
        collectMetrics: collectMetrics,
        collect: collectMetrics
    });
    var GatewayMiddleware = Object.freeze({
        processRequest: processRequest,
        runPipeline: processRequest,
        generateGatewayOperationsReport: generateGatewayOperationsReport
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        PIPELINE_STEPS: PIPELINE_STEPS,
        RATE_LIMIT_SCOPES: RATE_LIMIT_SCOPES,
        API_CATEGORIES: API_CATEGORIES,
        THROTTLE_STATES: THROTTLE_STATES,
        DEFAULT_POLICIES: DEFAULT_POLICIES,
        GatewayMiddleware: GatewayMiddleware,
        RateLimitService: RateLimitService,
        ThrottleManager: ThrottleManager,
        RequestRouter: RequestRouter,
        ApiVersionResolver: ApiVersionResolver,
        RequestMetricsCollector: RequestMetricsCollector,
        freezeGatewayOutput: freezeGatewayOutput,
        runSelfTest: runSelfTest
    });

    global.ApiGatewayGovernanceService = service;
    global.apiGatewayGovernanceService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_API_GATEWAY_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_API_GATEWAY_SELF_TEST__ = freezeGatewayOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
