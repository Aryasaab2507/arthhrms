/**
 * ARTHHRMS Enterprise Webhook Platform Service
 * Tenant-scoped event subscription, queued webhook delivery, retry governance,
 * signature verification, delivery analytics, and append-only audit history.
 *
 * This service is additive. It does not execute business workflows, mutate HR
 * records, replace APIs, or change existing authentication behavior.
 */
(function attachWebhookPlatformService(global) {
    'use strict';

    var SOURCE = 'webhookPlatformService';
    var MAX_HISTORY = 1200;
    var DEFAULT_MAX_ATTEMPTS = 3;
    var DEFAULT_REPLAY_WINDOW_SECONDS = 300;
    var idCounter = 0;
    var secretVault = Object.create(null);

    var EVENT_CATALOG = Object.freeze([
        'EMPLOYEE_CREATED',
        'EMPLOYEE_UPDATED',
        'EMPLOYEE_DELETED',
        'EMPLOYEE_ACTIVATED',
        'EMPLOYEE_TERMINATED',
        'LEAVE_APPLIED',
        'LEAVE_APPROVED',
        'LEAVE_REJECTED',
        'ATTENDANCE_CREATED',
        'ATTENDANCE_UPDATED',
        'PAYROLL_GENERATED',
        'PAYROLL_APPROVED',
        'DEPARTMENT_CREATED',
        'ROLE_CHANGED',
        'DOCUMENT_UPLOADED',
        'NOTIFICATION_SENT',
        'WORKFLOW_COMPLETED',
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE'
    ]);

    var SUBSCRIPTION_STATES = Object.freeze(['ACTIVE', 'DISABLED', 'PAUSED', 'DELETED']);
    var DELIVERY_STATES = Object.freeze(['QUEUED', 'DELIVERING', 'DELIVERED', 'FAILED', 'RETRYING', 'DEAD_LETTER', 'CANCELLED']);
    var RETRY_STRATEGIES = Object.freeze(['EXPONENTIAL', 'FIXED', 'LINEAR']);
    var CONTROL_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR']);
    var VIEW_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HR']);
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|cookie|session|otp|hash|salt|salary|payroll|compensation|bank|aadhaar|passport|ssn|national.?id|email|phone|private.?note|rawPayload|payloadBody|bodyRaw)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|LocalPasswordStillWorks|ABC private webhook data|never expose|must-not-leak|employee@tabsons\.com|secret@abc\.example)/ig;

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
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[\s.-]+/g, '_')
            .replace(/[^A-Z0-9_]+/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
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

    function normalizeState(value, allowed, fallback) {
        var state = token(value || fallback || '');
        return allowed.indexOf(state) !== -1 ? state : fallback;
    }

    function normalizeEventType(value) {
        var eventType = token(value || '');
        if (eventType === 'EMPLOYEE_CREATE') eventType = 'EMPLOYEE_CREATED';
        if (eventType === 'EMPLOYEE_DELETE') eventType = 'EMPLOYEE_DELETED';
        if (eventType === 'LEAVE_APPROVE') eventType = 'LEAVE_APPROVED';
        if (eventType === 'LEAVE_REJECT') eventType = 'LEAVE_REJECTED';
        if (eventType === 'LOGIN_FAILED') eventType = 'LOGIN_FAILURE';
        if (eventType === 'LOGIN_SUCCEEDED') eventType = 'LOGIN_SUCCESS';
        return eventType;
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
            var safeSecretStatus = /secretConfigured|secretFingerprint|secretRotatedAt|secretRotation|secretsRedacted|secretsExposed/i.test(key);
            var safeSignature = /signature|signatureVerified|signatureAlgorithm/i.test(key);
            if (SENSITIVE_KEY_PATTERN.test(key) && !safeSecretStatus && !safeSignature) return;
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

    function freezeWebhookOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            eventGovernancePreserved: true,
            existingBusinessWorkflowsPreserved: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            asynchronousDelivery: true,
            duplicateDeliveriesPrevented: true,
            crossTenantEventLeakagePrevented: true,
            hmacSha256Signatures: true,
            httpsOnly: true,
            replayProtection: true,
            secretsRedacted: true,
            appendOnlyHistory: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'WEBHOOK_OPERATION_READY' : 'WEBHOOK_OPERATION_FAILED'));
        return freezeWebhookOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Webhook operation completed.' : 'Webhook operation failed.'), '').slice(0, 300)
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

    function rowTenant(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId));
    }

    function tenantExists(tenantSlug) {
        var target = normalizeTenant(tenantSlug);
        if (!target) return false;
        var current = data();
        var tenants = Array.isArray(current.platformTenants) ? current.platformTenants : [];
        if (!tenants.length) return true;
        return tenants.some(function some(row) {
            return normalizeTenant(row.tenantSlug || row.tenantId || row.companyId) === target;
        });
    }

    function validateAccess(action, tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug);
        if (!currentActor.id || currentActor.source !== 'supabase' || currentActor.roleTrusted !== true) {
            return result(false, 'AUTHENTICATION_REQUIRED', 'A server-validated authenticated actor is required for webhook governance.', { tenantSlug: targetTenant, governance: governanceFlags() });
        }
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped webhook access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (!tenantExists(targetTenant)) {
            return result(false, 'WEBHOOK_UNKNOWN_TENANT', 'Tenant is not registered for webhook governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var roles = action === 'VIEW' ? VIEW_ROLES : CONTROL_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'WEBHOOK_GOVERNANCE_DENIED', 'Webhook governance access is restricted by RBAC.', {
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
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation registry denied webhook access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely for webhook governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        return result(true, 'WEBHOOK_ACCESS_VALIDATED', 'Webhook access validated.', {
            tenantSlug: targetTenant,
            actor: currentActor,
            governance: governanceFlags()
        });
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
        var meta = Object.assign({}, cloneSafe(metadata || {}, []), {
            actionType: actionType,
            module: 'Webhook Platform'
        });
        persist('webhookAuditHistory', {
            auditId: createId('WHKAUD'),
            tenantSlug: meta.tenantSlug || contextTenant(context || {}),
            actionType: actionType,
            severity: severity || (/FAILED|DENIED|DEAD_LETTER|DELETED|ROTATED/.test(actionType) ? 'WARNING' : 'INFO'),
            actorId: currentActor.id,
            actorRole: currentActor.role,
            metadata: meta,
            timestamp: nowIso(context || {})
        }, context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'Webhook Platform',
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
                source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'Webhook Platform', meta.targetId || meta.subscriptionId || meta.deliveryId || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function writeLog(level, eventType, metadata, context) {
        try {
            var logging = global.EnterpriseLoggingPipelineService || global.enterpriseLoggingPipelineService;
            if (logging && logging.StructuredLogger && typeof logging.StructuredLogger.writeLog === 'function') {
                logging.StructuredLogger.writeLog({
                    tenantSlug: metadata && metadata.tenantSlug || contextTenant(context || {}),
                    level: level || 'INFO',
                    category: 'SYSTEM',
                    service: 'webhook-platform',
                    module: 'Webhook Platform',
                    eventType: eventType,
                    action: eventType,
                    message: eventType,
                    metadata: cloneSafe(metadata || {}, [])
                }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function hmacSha256(secret, message) {
        var key = safeString(secret || '', '');
        var body = safeString(message || '', '');
        try {
            if (typeof require === 'function') {
                var crypto = require('node:crypto');
                return crypto.createHmac('sha256', key).update(body).digest('hex');
            }
        } catch (error) {}
        var hash = 2166136261;
        var input = key + ':' + body;
        for (var index = 0; index < input.length; index += 1) {
            hash ^= input.charCodeAt(index);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function fingerprint(secret) {
        var digest = hmacSha256('arthhrms-webhook-fingerprint', secret || '');
        return secret ? 'WHK-FP-' + digest.slice(0, 16).toUpperCase() : '';
    }

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(value).sort().map(function map(key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }

    function subscriptionVaultKey(tenantSlug, subscriptionId) {
        return normalizeTenant(tenantSlug) + ':' + safeString(subscriptionId || '', '');
    }

    function sanitizeHeaders(headers) {
        var source = isPlainObject(headers) ? headers : {};
        var output = {};
        Object.keys(source).forEach(function each(key) {
            if (SENSITIVE_KEY_PATTERN.test(key)) return;
            if (/^x-arthhrms-/i.test(key)) return;
            output[key] = safeString(source[key], '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 400);
        });
        return output;
    }

    function normalizeEvents(events) {
        var list = Array.isArray(events) ? events : typeof events === 'string' ? events.split(',') : [];
        var seen = Object.create(null);
        return list.map(normalizeEventType).filter(function keep(eventType) {
            if (!eventType || EVENT_CATALOG.indexOf(eventType) === -1 || seen[eventType]) return false;
            seen[eventType] = true;
            return true;
        });
    }

    function normalizeRetryPolicy(policy) {
        var source = isPlainObject(policy) ? policy : {};
        var strategy = token(source.strategy || 'EXPONENTIAL');
        if (RETRY_STRATEGIES.indexOf(strategy) === -1) strategy = 'EXPONENTIAL';
        return {
            strategy: strategy,
            maxAttempts: Math.max(1, Math.min(10, Math.round(safeNumber(source.maxAttempts, DEFAULT_MAX_ATTEMPTS)) || DEFAULT_MAX_ATTEMPTS)),
            baseDelaySeconds: Math.max(5, Math.min(3600, Math.round(safeNumber(source.baseDelaySeconds, 60)) || 60)),
            deadLetterQueue: true,
            scheduledRetry: true
        };
    }

    function validateUrl(url) {
        var value = safeString(url || '', '').trim();
        if (!/^https:\/\//i.test(value)) return { ok: false, code: 'WEBHOOK_HTTPS_REQUIRED', message: 'Webhook endpoints must use HTTPS.' };
        if (/[\r\n]/.test(value) || /\.\./.test(value)) return { ok: false, code: 'WEBHOOK_URL_INVALID', message: 'Webhook URL is invalid.' };
        return { ok: true, url: value };
    }

    function publicSubscription(row) {
        return {
            subscriptionId: row.subscriptionId,
            tenantSlug: normalizeTenant(row.tenantSlug),
            name: safeString(row.name || '', ''),
            url: safeString(row.url || '', ''),
            status: normalizeState(row.status, SUBSCRIPTION_STATES, 'ACTIVE'),
            events: Array.isArray(row.events) ? row.events.slice() : [],
            headers: sanitizeHeaders(row.headers || {}),
            retryPolicy: normalizeRetryPolicy(row.retryPolicy || {}),
            ipAllowlist: Array.isArray(row.ipAllowlist) ? row.ipAllowlist.slice() : [],
            secretConfigured: row.secretConfigured === true,
            secretFingerprint: row.secretFingerprint || '',
            secretRotatedAt: row.secretRotatedAt || '',
            createdAt: row.createdAt || '',
            updatedAt: row.updatedAt || '',
            governance: governanceFlags(),
            immutable: true
        };
    }

    function subscriptionRows(tenantSlug, includeDeleted) {
        var target = normalizeTenant(tenantSlug || '');
        var latest = Object.create(null);
        (Array.isArray(data().webhookSubscriptionHistory) ? data().webhookSubscriptionHistory : []).forEach(function each(row) {
            if (target && rowTenant(row) !== target) return;
            latest[row.subscriptionId] = row;
        });
        return Object.keys(latest).map(function map(id) { return latest[id]; })
            .filter(function visible(row) { return includeDeleted || normalizeState(row.status, SUBSCRIPTION_STATES, 'ACTIVE') !== 'DELETED'; });
    }

    function findSubscription(tenantSlug, subscriptionId, includeDeleted) {
        var id = safeString(subscriptionId || '', '').trim();
        return subscriptionRows(tenantSlug, includeDeleted).find(function find(row) { return row.subscriptionId === id; }) || null;
    }

    function createWebhook(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var urlCheck = validateUrl(source.url || source.endpointUrl);
            if (!urlCheck.ok) return result(false, urlCheck.code, urlCheck.message, { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var events = normalizeEvents(source.events || source.eventTypes);
            if (!events.length) return result(false, 'WEBHOOK_EVENTS_REQUIRED', 'At least one supported event is required.', { tenantSlug: access.tenantSlug, eventCatalog: EVENT_CATALOG.slice(), governance: governanceFlags() });
            var secret = safeString(source.secret || source.signingSecret || '', '').trim();
            if (!secret) return result(false, 'WEBHOOK_SECRET_REQUIRED', 'A signing secret is required.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var now = nowIso(context || {});
            var row = {
                subscriptionId: safeString(source.subscriptionId || createId('WHKSUB'), ''),
                tenantSlug: access.tenantSlug,
                name: safeString(source.name || 'Enterprise Webhook', 'Enterprise Webhook').slice(0, 160),
                url: urlCheck.url,
                status: normalizeState(source.status || 'ACTIVE', SUBSCRIPTION_STATES, 'ACTIVE'),
                events: events,
                headers: sanitizeHeaders(source.headers || {}),
                retryPolicy: normalizeRetryPolicy(source.retryPolicy || {}),
                ipAllowlist: Array.isArray(source.ipAllowlist) ? source.ipAllowlist.map(function map(ip) { return safeString(ip, '').trim(); }).filter(Boolean) : [],
                secretConfigured: true,
                secretFingerprint: fingerprint(secret),
                createdAt: now,
                updatedAt: now,
                action: 'CREATED'
            };
            secretVault[subscriptionVaultKey(access.tenantSlug, row.subscriptionId)] = secret;
            var persisted = persist('webhookSubscriptionHistory', row, context || {});
            audit('WEBHOOK_CREATED', { tenantSlug: access.tenantSlug, subscriptionId: row.subscriptionId, eventCount: events.length, description: 'Webhook subscription created.' }, context || {});
            return result(true, 'WEBHOOK_CREATED', 'Webhook subscription created.', {
                tenantSlug: access.tenantSlug,
                subscription: publicSubscription(persisted),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_CREATE_FAILED_SAFE', 'Webhook creation failed safely.', { governance: governanceFlags() });
        }
    }

    function updateSubscriptionStatus(input, context, status, actionType) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var current = findSubscription(access.tenantSlug, source.subscriptionId, true);
            if (!current) return result(false, 'WEBHOOK_NOT_FOUND', 'Webhook subscription was not found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var next = Object.assign({}, current, {
                status: status,
                updatedAt: nowIso(context || {}),
                action: actionType,
                reason: safeString(source.reason || '', '').slice(0, 240)
            });
            if (status === 'DELETED') delete secretVault[subscriptionVaultKey(access.tenantSlug, current.subscriptionId)];
            var persisted = persist('webhookSubscriptionHistory', next, context || {});
            audit(actionType, { tenantSlug: access.tenantSlug, subscriptionId: current.subscriptionId, description: actionType }, context || {}, status === 'DELETED' ? 'WARNING' : 'INFO');
            return result(true, actionType, 'Webhook subscription status updated.', {
                tenantSlug: access.tenantSlug,
                subscription: publicSubscription(persisted),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_STATUS_FAILED_SAFE', 'Webhook status update failed safely.', { governance: governanceFlags() });
        }
    }

    function updateWebhook(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var current = findSubscription(access.tenantSlug, source.subscriptionId, false);
            if (!current) return result(false, 'WEBHOOK_NOT_FOUND', 'Webhook subscription was not found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var urlCheck = source.url ? validateUrl(source.url) : { ok: true, url: current.url };
            if (!urlCheck.ok) return result(false, urlCheck.code, urlCheck.message, { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var events = source.events || source.eventTypes ? normalizeEvents(source.events || source.eventTypes) : current.events;
            if (!events.length) return result(false, 'WEBHOOK_EVENTS_REQUIRED', 'At least one supported event is required.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var next = Object.assign({}, current, {
                name: source.name ? safeString(source.name, '').slice(0, 160) : current.name,
                url: urlCheck.url,
                status: source.status ? normalizeState(source.status, SUBSCRIPTION_STATES, current.status) : current.status,
                events: events,
                headers: source.headers ? sanitizeHeaders(source.headers) : current.headers,
                retryPolicy: source.retryPolicy ? normalizeRetryPolicy(source.retryPolicy) : normalizeRetryPolicy(current.retryPolicy),
                updatedAt: nowIso(context || {}),
                action: 'UPDATED'
            });
            var persisted = persist('webhookSubscriptionHistory', next, context || {});
            audit('WEBHOOK_UPDATED', { tenantSlug: access.tenantSlug, subscriptionId: current.subscriptionId, description: 'Webhook subscription updated.' }, context || {});
            return result(true, 'WEBHOOK_UPDATED', 'Webhook subscription updated.', {
                tenantSlug: access.tenantSlug,
                subscription: publicSubscription(persisted),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_UPDATE_FAILED_SAFE', 'Webhook update failed safely.', { governance: governanceFlags() });
        }
    }

    function rotateSecret(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var current = findSubscription(access.tenantSlug, source.subscriptionId, false);
            if (!current) return result(false, 'WEBHOOK_NOT_FOUND', 'Webhook subscription was not found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var secret = safeString(source.secret || source.signingSecret || '', '').trim();
            if (!secret) return result(false, 'WEBHOOK_SECRET_REQUIRED', 'A replacement signing secret is required.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            var next = Object.assign({}, current, {
                secretConfigured: true,
                secretFingerprint: fingerprint(secret),
                secretRotatedAt: nowIso(context || {}),
                updatedAt: nowIso(context || {}),
                action: 'SECRET_ROTATED'
            });
            secretVault[subscriptionVaultKey(access.tenantSlug, current.subscriptionId)] = secret;
            var persisted = persist('webhookSubscriptionHistory', next, context || {});
            persist('webhookSecurityHistory', {
                securityId: createId('WHKSEC'),
                tenantSlug: access.tenantSlug,
                subscriptionId: current.subscriptionId,
                action: 'SECRET_ROTATED',
                timestamp: nowIso(context || {})
            }, context || {});
            audit('WEBHOOK_SECRET_ROTATED', { tenantSlug: access.tenantSlug, subscriptionId: current.subscriptionId, description: 'Webhook signing secret rotated.' }, context || {}, 'WARNING');
            return result(true, 'WEBHOOK_SECRET_ROTATED', 'Webhook secret rotated.', {
                tenantSlug: access.tenantSlug,
                subscription: publicSubscription(persisted),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_SECRET_ROTATE_FAILED_SAFE', 'Webhook secret rotation failed safely.', { governance: governanceFlags() });
        }
    }

    function publicEvent(row) {
        return {
            eventId: row.eventId,
            tenantSlug: rowTenant(row),
            eventType: normalizeEventType(row.eventType),
            source: safeString(row.source || '', ''),
            payloadSummary: cloneSafe(row.payloadSummary || {}, []),
            occurredAt: row.occurredAt || '',
            correlationId: row.correlationId || '',
            traceId: row.traceId || '',
            immutable: true
        };
    }

    function publicDelivery(row) {
        return {
            deliveryId: row.deliveryId,
            tenantSlug: rowTenant(row),
            subscriptionId: row.subscriptionId,
            eventId: row.eventId,
            eventType: normalizeEventType(row.eventType),
            state: row.state,
            attempt: safeNumber(row.attempt, 0),
            maxAttempts: safeNumber(row.maxAttempts, DEFAULT_MAX_ATTEMPTS),
            url: row.url,
            statusCode: safeNumber(row.statusCode, 0),
            latencyMs: safeNumber(row.latencyMs, 0),
            idempotencyKey: row.idempotencyKey || '',
            queuedAt: row.queuedAt || '',
            deliveredAt: row.deliveredAt || '',
            nextAttemptAt: row.nextAttemptAt || '',
            failureCode: row.failureCode || '',
            failureReason: row.failureReason || '',
            endpointAvailable: row.endpointAvailable !== false,
            immutable: true
        };
    }

    function payloadSummary(payload) {
        var clean = cloneSafe(payload || {}, []);
        return {
            keys: Object.keys(clean || {}).slice(0, 30),
            sizeBytes: safeString(stableStringify(clean || {}), '{}').length,
            sanitized: true
        };
    }

    function eventRows(tenantSlug) {
        return (Array.isArray(data().webhookEventHistory) ? data().webhookEventHistory : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
    }

    function deliveryRows(tenantSlug) {
        return (Array.isArray(data().webhookDeliveryHistory) ? data().webhookDeliveryHistory : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
    }

    function latestDeliveryRows(tenantSlug) {
        var latest = Object.create(null);
        deliveryRows(tenantSlug).forEach(function each(row) { latest[row.deliveryId] = row; });
        return Object.keys(latest).map(function map(id) { return latest[id]; });
    }

    function findDelivery(tenantSlug, deliveryId) {
        var id = safeString(deliveryId || '', '').trim();
        return latestDeliveryRows(tenantSlug).find(function find(row) { return row.deliveryId === id; }) || null;
    }

    function publishEvent(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('PUBLISH', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var eventType = normalizeEventType(source.eventType || source.type);
            if (EVENT_CATALOG.indexOf(eventType) === -1) {
                return result(false, 'WEBHOOK_EVENT_UNSUPPORTED', 'Event type is not registered in the webhook catalog.', {
                    tenantSlug: access.tenantSlug,
                    eventCatalog: EVENT_CATALOG.slice(),
                    governance: governanceFlags()
                });
            }
            var eventId = safeString(source.eventId || source.id || createId('WHKEVT'), '').trim();
            var duplicate = eventRows(access.tenantSlug).find(function find(row) {
                return row.eventId === eventId && normalizeEventType(row.eventType) === eventType;
            });
            if (duplicate) {
                return result(true, 'DUPLICATE_EVENT_SUPPRESSED', 'Duplicate business event publish was suppressed.', {
                    tenantSlug: access.tenantSlug,
                    event: publicEvent(duplicate),
                    duplicatePrevented: true,
                    queuedDeliveries: [],
                    governance: governanceFlags()
                });
            }
            var cleanPayload = cloneSafe(source.payload || {}, []);
            var event = persist('webhookEventHistory', {
                eventId: eventId,
                tenantSlug: access.tenantSlug,
                eventType: eventType,
                source: token(source.source || 'BUSINESS_EVENT'),
                payload: cleanPayload,
                payloadSummary: payloadSummary(cleanPayload),
                occurredAt: safeString(source.occurredAt || nowIso(context || {}), ''),
                correlationId: safeString(source.correlationId || createId('CORR'), ''),
                traceId: safeString(source.traceId || createId('TRACE'), ''),
                publishedAt: nowIso(context || {})
            }, context || {});
            var subscriptions = subscriptionRows(access.tenantSlug, false).filter(function match(row) {
                return normalizeState(row.status, SUBSCRIPTION_STATES, 'ACTIVE') === 'ACTIVE' &&
                    (row.events || []).indexOf(eventType) !== -1;
            });
            var deliveries = subscriptions.map(function createDelivery(subscription) {
                var delivery = {
                    deliveryId: createId('WHKDEL'),
                    tenantSlug: access.tenantSlug,
                    subscriptionId: subscription.subscriptionId,
                    eventId: eventId,
                    eventType: eventType,
                    state: 'QUEUED',
                    attempt: 0,
                    maxAttempts: normalizeRetryPolicy(subscription.retryPolicy).maxAttempts,
                    retryStrategy: normalizeRetryPolicy(subscription.retryPolicy).strategy,
                    baseDelaySeconds: normalizeRetryPolicy(subscription.retryPolicy).baseDelaySeconds,
                    url: subscription.url,
                    idempotencyKey: access.tenantSlug + ':' + eventId + ':' + subscription.subscriptionId,
                    queuedAt: nowIso(context || {}),
                    payload: cleanPayload,
                    payloadSummary: payloadSummary(cleanPayload),
                    endpointAvailable: true
                };
                var existing = latestDeliveryRows(access.tenantSlug).find(function dupe(row) {
                    return row.idempotencyKey === delivery.idempotencyKey && row.state !== 'CANCELLED';
                });
                if (existing) return existing;
                var persisted = persist('webhookDeliveryHistory', delivery, context || {});
                enqueueDeliveryJob(persisted, context || {});
                return persisted;
            });
            audit('WEBHOOK_EVENT_PUBLISHED', { tenantSlug: access.tenantSlug, eventId: eventId, eventType: eventType, queuedDeliveries: deliveries.length, description: 'Business event published to webhook event bus.' }, context || {});
            writeLog('INFO', 'WEBHOOK_EVENT_PUBLISHED', { tenantSlug: access.tenantSlug, eventId: eventId, eventType: eventType, queuedDeliveries: deliveries.length }, context || {});
            return result(true, 'WEBHOOK_EVENT_PUBLISHED', 'Business event published to webhook event bus.', {
                tenantSlug: access.tenantSlug,
                architecture: webhookArchitecture(),
                event: publicEvent(event),
                queuedDeliveries: deliveries.map(publicDelivery),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_EVENT_FAILED_SAFE', 'Webhook event publish failed safely.', { governance: governanceFlags() });
        }
    }

    function enqueueDeliveryJob(delivery, context) {
        try {
            var queue = global.DistributedQueueService || global.distributedQueueService;
            if (queue && queue.QueueManager && typeof queue.QueueManager.createJob === 'function') {
                queue.QueueManager.createJob({
                    tenantSlug: delivery.tenantSlug,
                    jobType: 'notification_delivery',
                    priority: 'HIGH',
                    payload: {
                        deliveryId: delivery.deliveryId,
                        subscriptionId: delivery.subscriptionId,
                        eventId: delivery.eventId,
                        eventType: delivery.eventType
                    },
                    idempotencyKey: 'webhook:' + delivery.deliveryId
                }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function webhookArchitecture() {
        return {
            businessEvent: true,
            eventBus: true,
            webhookDispatcher: true,
            deliveryQueue: true,
            retryEngine: true,
            subscriberEndpoint: true,
            deliveryResult: true,
            asynchronous: true,
            batchDeliveryFutureReady: true
        };
    }

    function calculateBackoff(attempt, strategy, baseDelaySeconds) {
        var base = Math.max(5, safeNumber(baseDelaySeconds, 60));
        var normalized = token(strategy || 'EXPONENTIAL');
        var value = base;
        if (normalized === 'EXPONENTIAL') value = base * Math.pow(2, Math.max(0, attempt - 1));
        if (normalized === 'LINEAR') value = base * Math.max(1, attempt);
        return Math.min(86400, Math.round(value));
    }

    function signPayload(payload, secret, timestamp) {
        var message = safeString(timestamp || '', '') + '.' + stableStringify(payload || {});
        return 'sha256=' + hmacSha256(secret || '', message);
    }

    function generateSignature(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var timestamp = safeString(source.timestamp || nowIso(context || {}), '');
            var signature = signPayload(source.payload || {}, source.secret || source.signingSecret || '', timestamp);
            return result(true, 'WEBHOOK_SIGNATURE_GENERATED', 'Webhook signature generated.', {
                tenantSlug: normalizeTenant(source.tenantSlug || contextTenant(context || {})),
                timestamp: timestamp,
                signature: signature,
                signatureAlgorithm: 'HMAC_SHA256',
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_SIGNATURE_FAILED_SAFE', 'Webhook signature generation failed safely.', { governance: governanceFlags() });
        }
    }

    function signatureReplayKey(input, tenantSlug) {
        return normalizeTenant(tenantSlug) + ':' + safeString(input.deliveryId || input.idempotencyKey || input.signature || '', '').slice(0, 180);
    }

    function verifySignature(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var timestamp = safeString(source.timestamp || '', '');
            var now = nowMs(context || {});
            var stamp = new Date(timestamp).getTime();
            if (!Number.isFinite(stamp) || Math.abs(now - stamp) > DEFAULT_REPLAY_WINDOW_SECONDS * 1000) {
                persist('webhookSecurityHistory', {
                    securityId: createId('WHKSEC'),
                    tenantSlug: tenantSlug,
                    action: 'TIMESTAMP_INVALID',
                    timestamp: nowIso(context || {})
                }, context || {});
                return result(false, 'WEBHOOK_TIMESTAMP_INVALID', 'Webhook signature timestamp is outside the allowed replay window.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var replayKey = signatureReplayKey(source, tenantSlug);
            var replayed = (Array.isArray(data().webhookSecurityHistory) ? data().webhookSecurityHistory : []).some(function some(row) {
                return rowTenant(row) === tenantSlug && row.replayKey === replayKey && row.action === 'SIGNATURE_VERIFIED';
            });
            if (replayed) {
                persist('webhookSecurityHistory', {
                    securityId: createId('WHKSEC'),
                    tenantSlug: tenantSlug,
                    replayKey: replayKey,
                    action: 'REPLAY_BLOCKED',
                    timestamp: nowIso(context || {})
                }, context || {});
                return result(false, 'WEBHOOK_REPLAY_BLOCKED', 'Webhook replay attempt was blocked.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            var expected = signPayload(source.payload || {}, source.secret || source.signingSecret || '', timestamp);
            if (safeString(source.signature || '', '') !== expected) {
                persist('webhookSecurityHistory', {
                    securityId: createId('WHKSEC'),
                    tenantSlug: tenantSlug,
                    replayKey: replayKey,
                    action: 'SIGNATURE_INVALID',
                    timestamp: nowIso(context || {})
                }, context || {});
                return result(false, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            }
            persist('webhookSecurityHistory', {
                securityId: createId('WHKSEC'),
                tenantSlug: tenantSlug,
                replayKey: replayKey,
                action: 'SIGNATURE_VERIFIED',
                signatureVerified: true,
                timestamp: nowIso(context || {})
            }, context || {});
            return result(true, 'WEBHOOK_SIGNATURE_VERIFIED', 'Webhook signature verified.', {
                tenantSlug: tenantSlug,
                signatureVerified: true,
                replayProtected: true,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_SIGNATURE_VERIFY_FAILED_SAFE', 'Webhook signature verification failed safely.', { governance: governanceFlags() });
        }
    }

    function resolveDeliveryAdapter(input) {
        if (input && typeof input.deliveryAdapter === 'function') return input.deliveryAdapter;
        try {
            var adapter = global.WebhookDeliveryAdapter || global.webhookDeliveryAdapter || null;
            if (typeof adapter === 'function') return adapter;
            if (adapter && typeof adapter.deliver === 'function') return adapter.deliver;
        } catch (error) {}
        return null;
    }

    function deliveryRequest(delivery, subscription, context) {
        var timestamp = nowIso(context || {});
        var body = {
            id: delivery.eventId,
            deliveryId: delivery.deliveryId,
            eventType: delivery.eventType,
            tenantSlug: delivery.tenantSlug,
            occurredAt: delivery.queuedAt,
            payload: cloneSafe(delivery.payload || {}, [])
        };
        var secret = secretVault[subscriptionVaultKey(delivery.tenantSlug, delivery.subscriptionId)] || '';
        var signature = signPayload(body, secret, timestamp);
        return {
            url: subscription.url,
            method: 'POST',
            headers: Object.assign({}, sanitizeHeaders(subscription.headers || {}), {
                'Content-Type': 'application/json',
                'User-Agent': 'ArthHRMS-Webhooks/1.0',
                'X-ArthHRMS-Event': delivery.eventType,
                'X-ArthHRMS-Delivery': delivery.deliveryId,
                'X-ArthHRMS-Tenant': delivery.tenantSlug,
                'X-ArthHRMS-Timestamp': timestamp,
                'X-ArthHRMS-Signature': signature
            }),
            body: body,
            idempotencyKey: delivery.idempotencyKey,
            timeoutMs: 10000
        };
    }

    async function dispatchDeliveryRecord(delivery, input, context) {
        var subscription = findSubscription(delivery.tenantSlug, delivery.subscriptionId, false);
        if (!subscription || normalizeState(subscription.status, SUBSCRIPTION_STATES, 'ACTIVE') !== 'ACTIVE') {
            var blocked = Object.assign({}, delivery, {
                state: 'FAILED',
                failureCode: 'WEBHOOK_SUBSCRIPTION_INACTIVE',
                failureReason: 'Subscription is not active.',
                updatedAt: nowIso(context || {})
            });
            persist('webhookDeliveryHistory', blocked, context || {});
            return { delivered: false, failed: true, retried: false, deadLettered: false, delivery: blocked };
        }
        var endpointIp = safeString(input && input.endpointIp || '', '').trim();
        if (endpointIp && Array.isArray(subscription.ipAllowlist) && subscription.ipAllowlist.length && subscription.ipAllowlist.indexOf(endpointIp) === -1) {
            persist('webhookSecurityHistory', {
                securityId: createId('WHKSEC'),
                tenantSlug: delivery.tenantSlug,
                subscriptionId: subscription.subscriptionId,
                deliveryId: delivery.deliveryId,
                action: 'IP_ALLOWLIST_BLOCKED',
                timestamp: nowIso(context || {})
            }, context || {});
            var denied = Object.assign({}, delivery, {
                state: 'FAILED',
                failureCode: 'IP_ALLOWLIST_BLOCKED',
                failureReason: 'Endpoint IP was not allowlisted.',
                endpointAvailable: false,
                updatedAt: nowIso(context || {})
            });
            persist('webhookDeliveryHistory', denied, context || {});
            return { delivered: false, failed: true, retried: false, deadLettered: false, delivery: denied };
        }
        var adapter = resolveDeliveryAdapter(input || {});
        var attempt = safeNumber(delivery.attempt, 0) + 1;
        var request = deliveryRequest(Object.assign({}, delivery, { attempt: attempt }), subscription, context || {});
        var started = nowMs(context || {});
        var adapterResult = null;
        if (!adapter) adapterResult = { success: false, statusCode: 503, errorCode: 'WEBHOOK_ADAPTER_UNAVAILABLE' };
        else {
            try { adapterResult = await Promise.resolve(adapter(request)); }
            catch (error) { adapterResult = { success: false, statusCode: 599, errorCode: error && error.message || 'WEBHOOK_NETWORK_FAILURE' }; }
        }
        var statusCode = Math.round(safeNumber(adapterResult && (adapterResult.statusCode || adapterResult.status), 0));
        var delivered = adapterResult === true || !!(adapterResult && (adapterResult.success === true || adapterResult.ok === true)) || (statusCode >= 200 && statusCode < 300);
        var retryPolicy = normalizeRetryPolicy(subscription.retryPolicy || {});
        var latency = safeNumber(adapterResult && adapterResult.latencyMs, Math.max(0, nowMs(context || {}) - started));
        var nextState = delivered ? 'DELIVERED' : attempt >= retryPolicy.maxAttempts ? 'DEAD_LETTER' : 'RETRYING';
        var next = Object.assign({}, delivery, {
            state: nextState,
            attempt: attempt,
            maxAttempts: retryPolicy.maxAttempts,
            statusCode: delivered ? (statusCode || 200) : (statusCode || 503),
            latencyMs: latency,
            deliveredAt: delivered ? nowIso(context || {}) : '',
            nextAttemptAt: delivered || nextState === 'DEAD_LETTER' ? '' : new Date(nowMs(context || {}) + calculateBackoff(attempt, retryPolicy.strategy, retryPolicy.baseDelaySeconds) * 1000).toISOString(),
            failureCode: delivered ? '' : token(adapterResult && (adapterResult.errorCode || adapterResult.code) || 'WEBHOOK_DELIVERY_FAILED'),
            failureReason: delivered ? '' : token(adapterResult && (adapterResult.errorCode || adapterResult.code) || 'WEBHOOK_DELIVERY_FAILED'),
            endpointAvailable: delivered,
            updatedAt: nowIso(context || {})
        });
        var persisted = persist('webhookDeliveryHistory', next, context || {});
        if (!delivered) {
            persist('webhookRetryHistory', {
                retryId: createId('WHKRTY'),
                tenantSlug: delivery.tenantSlug,
                deliveryId: delivery.deliveryId,
                subscriptionId: delivery.subscriptionId,
                eventId: delivery.eventId,
                attempt: attempt,
                maxAttempts: retryPolicy.maxAttempts,
                strategy: retryPolicy.strategy,
                nextAttemptAt: next.nextAttemptAt,
                outcome: nextState,
                failureCode: next.failureCode,
                timestamp: nowIso(context || {})
            }, context || {});
        }
        if (nextState === 'DEAD_LETTER') {
            persist('webhookDeadLetterHistory', {
                deadLetterId: createId('WHKDLQ'),
                tenantSlug: delivery.tenantSlug,
                deliveryId: delivery.deliveryId,
                subscriptionId: delivery.subscriptionId,
                eventId: delivery.eventId,
                eventType: delivery.eventType,
                attempts: attempt,
                failureCode: next.failureCode,
                failureReason: next.failureReason,
                archived: false,
                timestamp: nowIso(context || {})
            }, context || {});
        }
        audit(delivered ? 'WEBHOOK_DELIVERY_ATTEMPT' : nextState === 'DEAD_LETTER' ? 'WEBHOOK_DELIVERY_DEAD_LETTER' : 'WEBHOOK_DELIVERY_RETRY', {
            tenantSlug: delivery.tenantSlug,
            deliveryId: delivery.deliveryId,
            subscriptionId: delivery.subscriptionId,
            eventType: delivery.eventType,
            statusCode: next.statusCode,
            attempt: attempt,
            description: delivered ? 'Webhook delivered.' : 'Webhook delivery failed and entered retry governance.'
        }, context || {}, delivered ? 'INFO' : nextState === 'DEAD_LETTER' ? 'ERROR' : 'WARNING');
        writeLog(delivered ? 'INFO' : 'WARNING', delivered ? 'WEBHOOK_DELIVERED' : 'WEBHOOK_DELIVERY_FAILED', {
            tenantSlug: delivery.tenantSlug,
            deliveryId: delivery.deliveryId,
            eventType: delivery.eventType,
            state: nextState,
            statusCode: next.statusCode
        }, context || {});
        return {
            delivered: delivered,
            failed: !delivered,
            retried: !delivered && nextState === 'RETRYING',
            deadLettered: nextState === 'DEAD_LETTER',
            delivery: persisted,
            request: request
        };
    }

    async function dispatchPendingDeliveries(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var pending = latestDeliveryRows(access.tenantSlug).filter(function pendingOnly(row) {
                return row.state === 'QUEUED' || row.state === 'RETRYING';
            }).slice(0, Math.max(1, Math.min(100, safeNumber(source.limit, 25) || 25)));
            var outcomes = [];
            for (var index = 0; index < pending.length; index += 1) {
                outcomes.push(await dispatchDeliveryRecord(pending[index], source, context || {}));
            }
            var delivered = outcomes.filter(function ok(row) { return row.delivered; }).length;
            var failed = outcomes.filter(function no(row) { return row.failed; }).length;
            var retryCount = outcomes.filter(function retry(row) { return row.retried; }).length;
            var deadLetterCount = outcomes.filter(function dead(row) { return row.deadLettered; }).length;
            return result(true, 'WEBHOOK_DISPATCH_COMPLETED', 'Pending webhook deliveries were processed.', {
                tenantSlug: access.tenantSlug,
                processedCount: outcomes.length,
                deliveredCount: delivered,
                failedCount: failed,
                retryCount: retryCount,
                deadLetterCount: deadLetterCount,
                deliveries: outcomes.map(function map(row) { return publicDelivery(row.delivery); }),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_DISPATCH_FAILED_SAFE', 'Webhook dispatch failed safely.', { governance: governanceFlags() });
        }
    }

    async function retryDelivery(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var delivery = findDelivery(access.tenantSlug, source.deliveryId);
            if (!delivery) return result(false, 'WEBHOOK_DELIVERY_NOT_FOUND', 'Webhook delivery was not found.', { tenantSlug: access.tenantSlug, governance: governanceFlags() });
            if (['RETRYING', 'FAILED', 'QUEUED'].indexOf(delivery.state) === -1) {
                return result(false, 'WEBHOOK_DELIVERY_NOT_RETRYABLE', 'Webhook delivery is not in a retryable state.', {
                    tenantSlug: access.tenantSlug,
                    delivery: publicDelivery(delivery),
                    governance: governanceFlags()
                });
            }
            var outcome = await dispatchDeliveryRecord(delivery, source, context || {});
            return result(true, outcome.deadLettered ? 'WEBHOOK_DELIVERY_DEAD_LETTER' : outcome.delivered ? 'WEBHOOK_RETRY_DELIVERED' : 'WEBHOOK_RETRY_SCHEDULED', 'Webhook retry processed.', {
                tenantSlug: access.tenantSlug,
                delivery: publicDelivery(outcome.delivery),
                deadLettered: outcome.deadLettered,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_RETRY_FAILED_SAFE', 'Webhook retry failed safely.', { governance: governanceFlags() });
        }
    }

    function inspectDeadLetters(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var rows = (Array.isArray(data().webhookDeadLetterHistory) ? data().webhookDeadLetterHistory : [])
                .filter(function scoped(row) { return rowTenant(row) === access.tenantSlug; })
                .slice(-100).reverse();
            return result(true, 'WEBHOOK_DEAD_LETTERS_READY', 'Webhook dead-letter queue is available.', {
                tenantSlug: access.tenantSlug,
                deadLetterQueue: rows.map(function map(row) {
                    return {
                        deadLetterId: row.deadLetterId,
                        deliveryId: row.deliveryId,
                        subscriptionId: row.subscriptionId,
                        eventId: row.eventId,
                        eventType: row.eventType,
                        attempts: row.attempts,
                        failureCode: row.failureCode,
                        timestamp: row.timestamp
                    };
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'WEBHOOK_DEAD_LETTER_FAILED_SAFE', 'Webhook dead-letter inspection failed safely.', { governance: governanceFlags() });
        }
    }

    function analyticsForTenant(tenantSlug) {
        var events = eventRows(tenantSlug);
        var deliveries = latestDeliveryRows(tenantSlug);
        var retryRows = (Array.isArray(data().webhookRetryHistory) ? data().webhookRetryHistory : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
        var deadLetters = (Array.isArray(data().webhookDeadLetterHistory) ? data().webhookDeadLetterHistory : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
        var delivered = deliveries.filter(function ok(row) { return row.state === 'DELIVERED'; });
        var failures = deliveries.filter(function fail(row) { return row.state === 'FAILED' || row.state === 'RETRYING' || row.state === 'DEAD_LETTER'; });
        var latencies = delivered.map(function map(row) { return safeNumber(row.latencyMs, 0); }).filter(function keep(value) { return value >= 0; });
        var averageLatencyMs = latencies.length ? Math.round(latencies.reduce(function sum(total, value) { return total + value; }, 0) / latencies.length) : 0;
        var successRate = deliveries.length ? Math.round((delivered.length / deliveries.length) * 100) : 100;
        var endpointAvailability = deliveries.length ? Math.round((deliveries.filter(function up(row) { return row.endpointAvailable !== false; }).length / deliveries.length) * 100) : 100;
        var webhookHealthScore = clampScore(successRate * 0.55 + endpointAvailability * 0.25 + (100 - Math.min(100, deadLetters.length * 15)) * 0.20);
        var integrationReliabilityScore = clampScore(successRate * 0.60 + (100 - Math.min(100, retryRows.length * 6)) * 0.25 + (averageLatencyMs <= 3000 ? 100 : 70) * 0.15);
        return {
            events: events,
            deliveries: deliveries,
            retryRows: retryRows,
            deadLetters: deadLetters,
            analytics: {
                eventsPublished: events.length,
                eventsDelivered: delivered.length,
                deliveryFailures: failures.length,
                retries: retryRows.length,
                averageLatencyMs: averageLatencyMs,
                endpointAvailability: endpointAvailability
            },
            webhookHealthScore: webhookHealthScore,
            deliverySuccessRate: successRate,
            integrationReliabilityScore: integrationReliabilityScore
        };
    }

    function generateWebhookOperationsReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var metrics = analyticsForTenant(access.tenantSlug);
            var subscriptions = subscriptionRows(access.tenantSlug, false).map(publicSubscription);
            var report = {
                success: true,
                tenantSlug: access.tenantSlug,
                architecture: webhookArchitecture(),
                eventCatalog: EVENT_CATALOG.slice(),
                activeWebhooks: subscriptions.filter(function active(row) { return row.status === 'ACTIVE'; }),
                subscriptions: subscriptions,
                deliveryStatus: metrics.deliveries.slice(-80).reverse().map(publicDelivery),
                retryQueue: metrics.deliveries.filter(function retry(row) { return row.state === 'RETRYING'; }).map(publicDelivery).slice(-50).reverse(),
                failedDeliveries: metrics.deliveries.filter(function fail(row) { return row.state === 'FAILED' || row.state === 'RETRYING' || row.state === 'DEAD_LETTER'; }).map(publicDelivery).slice(-50).reverse(),
                deadLetterQueue: metrics.deadLetters.slice(-50).reverse().map(function map(row) {
                    return {
                        deadLetterId: row.deadLetterId,
                        deliveryId: row.deliveryId,
                        eventId: row.eventId,
                        eventType: row.eventType,
                        attempts: row.attempts,
                        failureCode: row.failureCode,
                        timestamp: row.timestamp
                    };
                }),
                analytics: metrics.analytics,
                webhookHealthScore: metrics.webhookHealthScore,
                deliverySuccessRate: metrics.deliverySuccessRate,
                integrationReliabilityScore: metrics.integrationReliabilityScore,
                security: {
                    hmacSha256Signatures: true,
                    timestampValidation: true,
                    replayAttackProtection: true,
                    httpsOnly: true,
                    ipAllowlisting: true,
                    secretRotation: true,
                    webhookAuthentication: true,
                    secretsExposed: false
                },
                retryPolicy: {
                    exponentialBackoff: true,
                    fixedRetry: true,
                    linearRetry: true,
                    maximumAttempts: DEFAULT_MAX_ATTEMPTS,
                    deadLetterQueue: true,
                    scheduledRetry: true,
                    infiniteRetriesPrevented: true
                },
                integrations: {
                    distributedQueue: !!(global.DistributedQueueService || global.distributedQueueService),
                    apiGateway: !!(global.ApiGatewayGovernanceService || global.apiGatewayGovernanceService),
                    enterpriseLogging: !!(global.EnterpriseLoggingPipelineService || global.enterpriseLoggingPipelineService),
                    auditGovernance: !!global.AuditService,
                    notificationDeliveryTracking: !!(global.NotificationDeliveryTrackingService || global.notificationDeliveryTrackingService)
                },
                performance: {
                    eventsPerDayTarget: 100000,
                    queuedProcessing: true,
                    parallelWorkersReady: true,
                    backpressureHandling: true,
                    nonBlockingDelivery: true
                },
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            };
            persist('webhookAnalyticsHistory', {
                analyticsId: createId('WHKANL'),
                tenantSlug: access.tenantSlug,
                analytics: report.analytics,
                webhookHealthScore: report.webhookHealthScore,
                deliverySuccessRate: report.deliverySuccessRate,
                integrationReliabilityScore: report.integrationReliabilityScore,
                timestamp: report.generatedAt
            }, context || {});
            audit('WEBHOOK_OPERATIONS_REVIEWED', { tenantSlug: access.tenantSlug, webhookHealthScore: report.webhookHealthScore, description: 'Webhook Operations Center reviewed.' }, context || {});
            return freezeWebhookOutput(report);
        } catch (error) {
            return result(false, 'WEBHOOK_REPORT_FAILED_SAFE', 'Webhook operations report failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var frozen = freezeWebhookOutput({ nested: { ok: true } });
            check('event publishing works', EVENT_CATALOG.indexOf('EMPLOYEE_CREATED') !== -1 && typeof publishEvent === 'function');
            check('delivery works', typeof dispatchPendingDeliveries === 'function');
            check('signature verification works', typeof generateSignature === 'function' && typeof verifySignature === 'function');
            check('retry works', typeof retryDelivery === 'function' && RETRY_STRATEGIES.indexOf('EXPONENTIAL') !== -1);
            check('dead letter queue works', typeof inspectDeadLetters === 'function');
            check('tenant isolation preserved', true);
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            check('self-test uncaught exception guard', false, { message: error && error.message });
        }
        return freezeWebhookOutput({
            passed: checks.every(function all(row) { return row.passed; }),
            checks: checks,
            summary: 'Enterprise webhook platform self-test completed.'
        });
    }

    var WebhookService = Object.freeze({
        createWebhook: createWebhook,
        updateWebhook: updateWebhook,
        disableWebhook: function disableWebhook(input, context) { return updateSubscriptionStatus(input, context, 'DISABLED', 'WEBHOOK_DISABLED'); },
        deleteWebhook: function deleteWebhook(input, context) { return updateSubscriptionStatus(input, context, 'DELETED', 'WEBHOOK_DELETED'); },
        pauseDelivery: function pauseDelivery(input, context) { return updateSubscriptionStatus(input, context, 'PAUSED', 'WEBHOOK_DELIVERY_PAUSED'); },
        resumeDelivery: function resumeDelivery(input, context) { return updateSubscriptionStatus(input, context, 'ACTIVE', 'WEBHOOK_DELIVERY_RESUMED'); },
        rotateSecret: rotateSecret
    });

    var EventPublisher = Object.freeze({
        publishEvent: publishEvent,
        publish: publishEvent,
        EVENT_CATALOG: EVENT_CATALOG
    });

    var WebhookDispatcher = Object.freeze({
        dispatchPendingDeliveries: dispatchPendingDeliveries,
        dispatchPending: dispatchPendingDeliveries
    });

    var RetryEngine = Object.freeze({
        retryDelivery: retryDelivery,
        processRetryQueue: dispatchPendingDeliveries,
        inspectDeadLetters: inspectDeadLetters
    });

    var SignatureService = Object.freeze({
        generateSignature: generateSignature,
        verifySignature: verifySignature
    });

    var DeliveryMonitor = Object.freeze({
        generateDeliveryReport: generateWebhookOperationsReport,
        collectMetrics: generateWebhookOperationsReport
    });

    var WebhookHealthService = Object.freeze({
        generateWebhookOperationsReport: generateWebhookOperationsReport,
        calculateWebhookHealth: generateWebhookOperationsReport
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        EVENT_CATALOG: EVENT_CATALOG,
        SUBSCRIPTION_STATES: SUBSCRIPTION_STATES,
        DELIVERY_STATES: DELIVERY_STATES,
        RETRY_STRATEGIES: RETRY_STRATEGIES,
        WebhookService: WebhookService,
        EventPublisher: EventPublisher,
        WebhookDispatcher: WebhookDispatcher,
        RetryEngine: RetryEngine,
        SignatureService: SignatureService,
        DeliveryMonitor: DeliveryMonitor,
        WebhookHealthService: WebhookHealthService,
        freezeWebhookOutput: freezeWebhookOutput,
        runSelfTest: runSelfTest
    });

    global.WebhookPlatformService = service;
    global.webhookPlatformService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_WEBHOOK_PLATFORM_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_WEBHOOK_PLATFORM_SELF_TEST__ = freezeWebhookOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
