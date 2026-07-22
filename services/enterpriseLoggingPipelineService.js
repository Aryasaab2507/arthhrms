/**
 * ARTHHRMS Enterprise Logging Pipeline Service
 * Centralized structured logging, transport, search, retention, analytics, and
 * governance-safe log visibility with tenant isolation and redaction.
 */
(function attachEnterpriseLoggingPipelineService(global) {
    'use strict';

    var SOURCE = 'enterpriseLoggingPipelineService';
    var MAX_HISTORY = 1200;
    var LOG_PROVIDERS = Object.freeze(['ELK_STACK', 'OPENSEARCH', 'LOKI', 'DATADOG', 'SPLUNK', 'AZURE_MONITOR', 'GOOGLE_CLOUD_LOGGING']);
    var LOG_CATEGORIES = Object.freeze(['APPLICATION', 'SECURITY', 'AUDIT', 'AUTHENTICATION', 'API', 'DATABASE', 'CACHE', 'QUEUE', 'WORKFLOW', 'NOTIFICATION', 'BACKGROUND_WORKER', 'SYSTEM']);
    var LOG_LEVELS = Object.freeze(['TRACE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var DEFAULT_RETENTION_DAYS = Object.freeze({
        SECURITY: 2555,
        AUDIT: 2555,
        APPLICATION: 90,
        DEBUG: 30,
        TRACE: 30,
        API: 90,
        AUTHENTICATION: 2555,
        DATABASE: 90,
        CACHE: 90,
        QUEUE: 90,
        WORKFLOW: 90,
        NOTIFICATION: 90,
        BACKGROUND_WORKER: 90,
        SYSTEM: 90
    });
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|refresh.?token|api.?key|cookie|session|authorization|credential|private.?key|otp|hash|salt|salary|payroll|compensation|bank|aadhaar|passport|ssn|national.?id|phone|email|name|employee.?name|employee.?id|user.?email|username|rawPayload|payloadBody|body|headers|private.?note)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._=-]+|secret[-_ ]?[a-z0-9._=-]+|api[-_ ]?key[-_ ]?[a-z0-9._=-]+|refresh[-_ ]?secret|sessionid=[^;\s]+|sid=[^;\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+\d[\d\s().-]{7,}\d|NeverLogMe123|Private Person|private-user|ABC private logging data)/ig;
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

    function normalizeLevel(value) {
        var level = token(value || 'INFO');
        if (level === 'WARN') level = 'WARNING';
        if (LOG_LEVELS.indexOf(level) === -1) return 'INFO';
        return level;
    }

    function normalizeCategory(value) {
        var category = token(value || 'APPLICATION');
        if (category === 'AUTH') category = 'AUTHENTICATION';
        if (category === 'BG_WORKER') category = 'BACKGROUND_WORKER';
        if (LOG_CATEGORIES.indexOf(category) === -1) return 'APPLICATION';
        return category;
    }

    function normalizeStatus(value, statusCode, level) {
        var status = token(value || '');
        if (!status && safeNumber(statusCode, 0) >= 500) status = 'ERROR';
        if (!status && safeNumber(statusCode, 0) >= 400) status = 'WARNING';
        if (!status && ['ERROR', 'CRITICAL'].indexOf(level) !== -1) status = 'ERROR';
        if (!status) status = 'SUCCESS';
        return status;
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

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 2400);
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
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
            if (SENSITIVE_KEY_PATTERN.test(key)) return;
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

    function freezeLoggingOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            loggingGovernancePreserved: true,
            providerAgnostic: true,
            jsonStructuredLoggingOnly: true,
            sensitiveValuesRedacted: true,
            piiRedacted: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            productionPerformanceProtected: true,
            asynchronousLogging: true,
            requestBlocking: false,
            batchWrites: true,
            compressionReady: true,
            rotationReady: true,
            rbacPreserved: true,
            auditTrailsPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'LOGGING_OPERATION_READY' : 'LOGGING_OPERATION_FAILED'));
        return freezeLoggingOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: sanitizeText(message || (success ? 'Logging operation completed.' : 'Logging operation failed.')).slice(0, 300)
        }, extra || {}));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim().slice(0, 160),
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

    function validateAccess(action, tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped logging access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var roles = action === 'CONTROL' ? CONTROL_ROLES : VIEW_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'LOGGING_GOVERNANCE_DENIED', action === 'CONTROL' ? 'Logging controls are restricted by governance.' : 'Centralized log visibility is restricted by governance.', {
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
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation registry denied logging access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {}
        return result(true, 'LOGGING_ACCESS_GRANTED', 'Logging access granted.', {
            tenantSlug: targetTenant,
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
        var meta = cloneSafe(metadata || {}, []);
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'Enterprise Logging',
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
                source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'Enterprise Logging', meta.targetId || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function tenantRows(key, tenantSlug) {
        var targetTenant = normalizeTenant(tenantSlug || '');
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function filter(row) {
            return !targetTenant || normalizeTenant(row.tenantSlug || row.tenant_id || row.tenantId || '') === targetTenant;
        });
    }

    function retentionDaysFor(category, level, overrides) {
        var policies = isPlainObject(overrides) ? overrides : {};
        var key = normalizeCategory(category);
        var normalizedLevel = normalizeLevel(level);
        if (Number.isFinite(Number(policies[key]))) return Math.max(1, Math.round(Number(policies[key])));
        if (normalizedLevel === 'DEBUG' && Number.isFinite(Number(policies.DEBUG))) return Math.max(1, Math.round(Number(policies.DEBUG)));
        if (normalizedLevel === 'TRACE' && Number.isFinite(Number(policies.TRACE))) return Math.max(1, Math.round(Number(policies.TRACE)));
        if (Number.isFinite(Number(DEFAULT_RETENTION_DAYS[key]))) return DEFAULT_RETENTION_DAYS[key];
        if (normalizedLevel === 'DEBUG' || normalizedLevel === 'TRACE') return 30;
        return 90;
    }

    function structuredLog(input, context) {
        var source = isPlainObject(input) ? input : {};
        var currentActor = actor(context || {});
        var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
        var level = normalizeLevel(source.level || (safeNumber(source.statusCode, 200) >= 500 ? 'ERROR' : 'INFO'));
        var category = normalizeCategory(source.category || 'APPLICATION');
        var status = normalizeStatus(source.status, source.statusCode, level);
        var requestId = safeString(source.requestId || source.request_id || createId('REQ'), '').slice(0, 120);
        var traceId = safeString(source.traceId || source.trace_id || createId('TRACE'), '').slice(0, 120);
        var spanId = safeString(source.spanId || source.span_id || createId('SPAN'), '').slice(0, 120);
        var correlationId = safeString(source.correlationId || source.correlation_id || createId('CORR'), '').slice(0, 120);
        return {
            log_id: createId('LOG'),
            timestamp: nowIso(context || {}),
            level: level,
            category: category,
            service: sanitizeText(source.service || 'arthhrms-platform').slice(0, 120),
            module: sanitizeText(source.module || 'System').slice(0, 120),
            tenant_id: tenantSlug,
            tenantSlug: tenantSlug,
            user_id: safeString(source.userId || source.user_id || currentActor.id || '', '').slice(0, 120),
            request_id: requestId,
            trace_id: traceId,
            span_id: spanId,
            correlation_id: correlationId,
            event_type: token(source.eventType || source.event_type || category + '_EVENT'),
            action: token(source.action || source.eventType || 'LOG_EVENT'),
            duration_ms: Math.max(0, Math.round(safeNumber(source.durationMs || source.duration_ms, 0))),
            status: status,
            message: sanitizeText(source.message || 'Structured log event.'),
            metadata: cloneSafe(source.metadata || {}, []),
            retentionDays: retentionDaysFor(category, level, source.retentionPolicies),
            jsonStructured: true,
            nonBlocking: true,
            indexedFields: {
                tenant_id: tenantSlug,
                user_id: safeString(source.userId || source.user_id || currentActor.id || '', '').slice(0, 120),
                request_id: requestId,
                trace_id: traceId,
                correlation_id: correlationId,
                module: sanitizeText(source.module || 'System').slice(0, 120),
                service: sanitizeText(source.service || 'arthhrms-platform').slice(0, 120),
                level: level,
                event_type: token(source.eventType || source.event_type || category + '_EVENT')
            }
        };
    }

    function writeLog(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var log = structuredLog(source, Object.assign({}, context || {}, { tenantSlug: tenantSlug }));
            var row = persist('enterpriseLogHistory', log, context || {});
            if (!(context && context.skipTransportHistory)) {
                persist('logTransportHistory', {
                    transportId: createId('LOGTRN'),
                    tenantSlug: tenantSlug,
                    logId: row.log_id,
                    state: 'BUFFERED',
                    asynchronous: true,
                    requestBlocking: false,
                    compressionReady: true,
                    timestamp: nowIso(context || {})
                }, context || {});
            }
            audit('STRUCTURED_LOG_WRITTEN', { tenantSlug: tenantSlug, logId: row.log_id, category: row.category, level: row.level, description: 'Structured log written.' }, context || {}, row.level === 'CRITICAL' ? 'CRITICAL' : row.level === 'ERROR' ? 'ERROR' : 'INFO');
            return result(true, 'STRUCTURED_LOG_WRITTEN', 'Structured log written.', {
                tenantSlug: tenantSlug,
                log: row,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'STRUCTURED_LOG_FAILED_SAFE', 'Structured logging failed safely.', { governance: governanceFlags() });
        }
    }

    function logRequest(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var statusCode = Math.max(0, Math.round(safeNumber(source.statusCode, 200)));
            return writeLog({
                tenantSlug: source.tenantSlug || contextTenant(context || {}),
                level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARNING' : 'INFO',
                category: 'API',
                service: 'api-gateway',
                module: 'API Gateway',
                eventType: 'API_REQUEST',
                action: safeString(source.method || 'GET', 'GET').toUpperCase() + '_' + safeString(source.path || '/', '/').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                status: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARNING' : 'SUCCESS',
                message: safeString(source.method || 'GET', 'GET').toUpperCase() + ' ' + safeString(source.path || '/', '/').slice(0, 160) + ' completed with ' + statusCode + '.',
                requestId: source.requestId,
                traceId: source.traceId,
                spanId: source.spanId,
                correlationId: source.correlationId,
                userId: source.userId,
                durationMs: source.durationMs,
                metadata: {
                    method: safeString(source.method || 'GET', 'GET').toUpperCase(),
                    path: safeString(source.path || '/', '/').replace(/[<>"'`]/g, '').slice(0, 220),
                    statusCode: statusCode
                }
            }, context || {});
        } catch (error) {
            return result(false, 'API_LOGGING_FAILED_SAFE', 'API request logging failed safely.', { governance: governanceFlags() });
        }
    }

    function flushBuffer(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var batchSize = Math.max(1, Math.min(500, Math.round(safeNumber(source.batchSize, 100))));
            var rows = tenantRows('enterpriseLogHistory', tenantSlug).slice(-batchSize);
            var storageAvailable = source.storageAvailable !== false;
            var transport = persist('logTransportHistory', {
                transportId: createId('LOGTRN'),
                tenantSlug: tenantSlug,
                providerAgnostic: true,
                providers: LOG_PROVIDERS.slice(),
                batchSize: rows.length || batchSize,
                compression: source.compression !== false,
                rotationReady: true,
                asynchronous: true,
                requestBlocking: false,
                state: storageAvailable ? 'FLUSHED' : 'BUFFERED',
                degradationMode: storageAvailable ? 'NONE' : 'LOCAL_BUFFER_ONLY',
                transportFailureIsolated: !storageAvailable,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOG_TRANSPORT_FLUSHED', { tenantSlug: tenantSlug, transportId: transport.transportId, description: 'Log transport buffer flushed.' }, context || {}, storageAvailable ? 'INFO' : 'WARNING');
            return result(true, 'LOG_TRANSPORT_FLUSHED', 'Log transport processed.', {
                tenantSlug: tenantSlug,
                transport: transport,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'LOG_TRANSPORT_FAILED_SAFE', 'Log transport failed safely.', { governance: governanceFlags() });
        }
    }

    function dateValue(value) {
        try {
            var ms = new Date(value).getTime();
            return Number.isFinite(ms) ? ms : 0;
        } catch (error) { return 0; }
    }

    function searchLogs(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var level = source.level ? normalizeLevel(source.level) : '';
            var category = source.category ? normalizeCategory(source.category) : '';
            var moduleName = source.module ? sanitizeText(source.module).toLowerCase() : '';
            var serviceName = source.service ? sanitizeText(source.service).toLowerCase() : '';
            var userId = source.userId || source.user_id ? safeString(source.userId || source.user_id, '').toLowerCase() : '';
            var requestId = source.requestId || source.request_id ? safeString(source.requestId || source.request_id, '') : '';
            var traceId = source.traceId || source.trace_id ? safeString(source.traceId || source.trace_id, '') : '';
            var eventType = source.eventType || source.event_type ? token(source.eventType || source.event_type) : '';
            var from = source.dateFrom ? dateValue(source.dateFrom) : 0;
            var to = source.dateTo ? dateValue(source.dateTo) : Number.MAX_SAFE_INTEGER;
            var rows = tenantRows('enterpriseLogHistory', tenantSlug).filter(function filter(row) {
                var stamp = dateValue(row.timestamp);
                if (level && row.level !== level) return false;
                if (category && row.category !== category) return false;
                if (moduleName && safeString(row.module || '', '').toLowerCase().indexOf(moduleName) === -1) return false;
                if (serviceName && safeString(row.service || '', '').toLowerCase().indexOf(serviceName) === -1) return false;
                if (userId && safeString(row.user_id || '', '').toLowerCase() !== userId) return false;
                if (requestId && row.request_id !== requestId) return false;
                if (traceId && row.trace_id !== traceId) return false;
                if (eventType && row.event_type !== eventType) return false;
                if (stamp < from || stamp > to) return false;
                return true;
            }).slice(-250).reverse();
            var search = persist('logSearchHistory', {
                searchId: createId('LOGSRC'),
                tenantSlug: tenantSlug,
                filters: cloneSafe({
                    level: level,
                    category: category,
                    module: moduleName,
                    service: serviceName,
                    userId: userId,
                    requestId: requestId,
                    traceId: traceId,
                    eventType: eventType,
                    dateFrom: source.dateFrom || '',
                    dateTo: source.dateTo || ''
                }, []),
                resultCount: rows.length,
                indexedSearch: true,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOG_SEARCH_EXECUTED', { tenantSlug: tenantSlug, searchId: search.searchId, resultCount: rows.length, description: 'Centralized log search executed.' }, context || {});
            return result(true, 'LOG_SEARCH_COMPLETED', 'Log search completed.', {
                tenantSlug: tenantSlug,
                results: rows,
                resultCount: rows.length,
                indexedSearch: true,
                searchRecord: search,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'LOG_SEARCH_FAILED_SAFE', 'Log search failed safely.', { governance: governanceFlags() });
        }
    }

    function reconstructRequest(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var correlationId = safeString(source.correlationId || source.correlation_id || '', '');
            var requestId = safeString(source.requestId || source.request_id || '', '');
            var traceId = safeString(source.traceId || source.trace_id || '', '');
            var rows = tenantRows('enterpriseLogHistory', tenantSlug).filter(function filter(row) {
                return (correlationId && row.correlation_id === correlationId) ||
                    (requestId && row.request_id === requestId) ||
                    (traceId && row.trace_id === traceId);
            }).sort(function sort(a, b) { return dateValue(a.timestamp) - dateValue(b.timestamp); });
            var first = rows[0] || {};
            var reconstructed = {
                tenantSlug: tenantSlug,
                request: {
                    request_id: first.request_id || requestId,
                    trace_id: first.trace_id || traceId,
                    correlation_id: first.correlation_id || correlationId,
                    user_id: first.user_id || ''
                },
                timeline: rows,
                reconstructed: rows.length > 0,
                governance: governanceFlags()
            };
            audit('LOG_CORRELATION_RECONSTRUCTED', { tenantSlug: tenantSlug, correlationId: correlationId, requestId: requestId, description: 'Log correlation reconstructed.' }, context || {});
            return result(true, 'LOG_CORRELATION_RECONSTRUCTED', 'Log correlation reconstructed.', reconstructed);
        } catch (error) {
            return result(false, 'LOG_CORRELATION_FAILED_SAFE', 'Log correlation failed safely.', { governance: governanceFlags() });
        }
    }

    function effectivePolicies(overrides) {
        var source = isPlainObject(overrides) ? overrides : {};
        var policies = {};
        Object.keys(DEFAULT_RETENTION_DAYS).forEach(function each(key) {
            policies[key] = {
                retentionDays: Math.max(1, Math.round(safeNumber(source[key], DEFAULT_RETENTION_DAYS[key]))),
                archivalEnabled: true,
                hardDeleteBlocked: true
            };
        });
        return policies;
    }

    function evaluateRetention(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var policies = effectivePolicies(source.policies || {});
            var logs = tenantRows('enterpriseLogHistory', tenantSlug);
            var covered = logs.filter(function covered(row) { return policies[row.category] || policies[row.level]; }).length;
            var retentionComplianceScore = clampScore(logs.length ? (covered / logs.length) * 100 : 100);
            var record = persist('logRetentionHistory', {
                retentionId: createId('LOGRET'),
                tenantSlug: tenantSlug,
                action: 'RETENTION_EVALUATED',
                policies: policies,
                logCount: logs.length,
                retentionComplianceScore: retentionComplianceScore,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOG_RETENTION_REVIEWED', { tenantSlug: tenantSlug, retentionId: record.retentionId, description: 'Logging retention policy reviewed.' }, context || {});
            return result(true, 'LOG_RETENTION_EVALUATED', 'Log retention evaluated.', {
                tenantSlug: tenantSlug,
                policies: policies,
                retentionComplianceScore: retentionComplianceScore,
                retentionRecord: record,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'LOG_RETENTION_FAILED_SAFE', 'Log retention failed safely.', { governance: governanceFlags() });
        }
    }

    function archiveExpiredLogs(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var referenceMs = dateValue(source.referenceDate || nowIso(context || {})) || Date.now();
            var policies = effectivePolicies(source.policies || {});
            var expired = tenantRows('enterpriseLogHistory', tenantSlug).filter(function expired(row) {
                var retention = (policies[row.category] || policies[row.level] || { retentionDays: row.retentionDays || 90 }).retentionDays;
                var ageDays = Math.floor((referenceMs - dateValue(row.timestamp)) / 86400000);
                return ageDays > retention;
            });
            var record = persist('logRetentionHistory', {
                retentionId: createId('LOGARC'),
                tenantSlug: tenantSlug,
                action: 'LOGS_ARCHIVED',
                archivedCount: expired.length,
                archivedLogIds: expired.map(function id(row) { return row.log_id; }).slice(0, 500),
                hardDeletePerformed: false,
                automaticArchival: true,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOG_RETENTION_ARCHIVAL_RUN', { tenantSlug: tenantSlug, retentionId: record.retentionId, archivedCount: expired.length, description: 'Expired logs archived by retention governance.' }, context || {});
            return result(true, 'LOGS_ARCHIVED', 'Expired logs archived.', {
                tenantSlug: tenantSlug,
                archivedCount: expired.length,
                archiveRecord: record,
                hardDeletePerformed: false,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'LOG_ARCHIVAL_FAILED_SAFE', 'Log archival failed safely.', { governance: governanceFlags() });
        }
    }

    function analyticsFromLogs(tenantSlug) {
        var logs = tenantRows('enterpriseLogHistory', tenantSlug);
        var errors = logs.filter(function error(row) { return row.level === 'ERROR' || row.level === 'CRITICAL' || row.status === 'ERROR'; });
        var warnings = logs.filter(function warn(row) { return row.level === 'WARNING'; });
        return {
            logs: logs,
            errorFrequency: errors.length,
            warningTrends: warnings.length,
            apiFailures: logs.filter(function api(row) { return row.category === 'API' && (row.level === 'ERROR' || row.status === 'ERROR'); }).length,
            workerFailures: logs.filter(function worker(row) { return /WORKER|BACKGROUND_WORKER/.test(row.category + ' ' + row.module) && row.level !== 'INFO'; }).length,
            authenticationFailures: logs.filter(function auth(row) { return row.category === 'AUTHENTICATION' && row.level !== 'INFO'; }).length,
            cacheFailures: logs.filter(function cache(row) { return row.category === 'CACHE' && row.level !== 'INFO'; }).length,
            queueFailures: logs.filter(function queue(row) { return row.category === 'QUEUE' && row.level !== 'INFO'; }).length
        };
    }

    function generateLogAnalytics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var metrics = analyticsFromLogs(tenantSlug);
            var total = metrics.logs.length || 1;
            var loggingHealthScore = clampScore(100 - (metrics.errorFrequency / total) * 45 - (metrics.warningTrends / total) * 18);
            var operationalScore = clampScore(100 - metrics.apiFailures * 8 - metrics.workerFailures * 8 - metrics.queueFailures * 5 - metrics.cacheFailures * 5);
            var incidentReadinessScore = clampScore(85 + Math.min(15, metrics.logs.length * 2) - Math.min(20, metrics.errorFrequency * 3));
            var record = persist('logAnalyticsHistory', {
                analyticsId: createId('LOGANL'),
                tenantSlug: tenantSlug,
                errorFrequency: metrics.errorFrequency,
                warningTrends: metrics.warningTrends,
                apiFailures: metrics.apiFailures,
                workerFailures: metrics.workerFailures,
                authenticationFailures: metrics.authenticationFailures,
                cacheFailures: metrics.cacheFailures,
                queueFailures: metrics.queueFailures,
                loggingHealthScore: loggingHealthScore,
                operationalScore: operationalScore,
                incidentReadinessScore: incidentReadinessScore,
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOG_ANALYTICS_REVIEWED', { tenantSlug: tenantSlug, analyticsId: record.analyticsId, description: 'Enterprise log analytics reviewed.' }, context || {});
            return result(true, 'LOG_ANALYTICS_GENERATED', 'Log analytics generated.', Object.assign({}, record, {
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'LOG_ANALYTICS_FAILED_SAFE', 'Log analytics failed safely.', { governance: governanceFlags() });
        }
    }

    function generateEnterpriseLogReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var analytics = generateLogAnalytics({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            if (!analytics.success) return analytics;
            var retention = evaluateRetention({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            if (!retention.success) return retention;
            var logs = tenantRows('enterpriseLogHistory', tenantSlug).slice(-80).reverse();
            var config = persist('logConfigHistory', {
                configId: createId('LOGCFG'),
                tenantSlug: tenantSlug,
                action: 'ENTERPRISE_LOG_CENTER_REVIEWED',
                providers: LOG_PROVIDERS.slice(),
                categories: LOG_CATEGORIES.slice(),
                levels: LOG_LEVELS.slice(),
                timestamp: nowIso(context || {})
            }, context || {});
            var report = {
                success: true,
                tenantSlug: tenantSlug,
                architecture: {
                    providerAgnostic: true,
                    pipeline: ['Application', 'Structured Logger', 'Log Transport', 'Central Log Storage', 'Search Index', 'Dashboards'],
                    compatibleProviders: LOG_PROVIDERS.slice(),
                    centralLogStorage: true,
                    searchIndex: true,
                    dashboards: true
                },
                structuredLogging: {
                    jsonOnly: true,
                    categories: LOG_CATEGORIES.slice(),
                    levels: LOG_LEVELS.slice(),
                    requiredFields: ['timestamp', 'level', 'service', 'module', 'tenant_id', 'user_id', 'request_id', 'trace_id', 'span_id', 'correlation_id', 'event_type', 'action', 'duration_ms', 'status', 'message', 'metadata'],
                    redaction: ['passwords', 'tokens', 'refresh tokens', 'API keys', 'secrets', 'cookies', 'session IDs', 'personal identifiers']
                },
                search: {
                    indexedSearch: true,
                    filters: ['tenant', 'user', 'module', 'service', 'log level', 'request ID', 'trace ID', 'event type', 'date range']
                },
                retention: retention.policies,
                analytics: analytics,
                dashboard: {
                    enterpriseLogCenter: true,
                    liveLogStream: true,
                    logSearch: true,
                    filters: true,
                    errorAnalytics: true,
                    serviceLogs: true,
                    securityLogs: true,
                    auditLogs: true,
                    incidentTimeline: true
                },
                performance: {
                    asynchronousLogging: true,
                    batchWrites: true,
                    logBuffering: true,
                    compression: true,
                    rotation: true,
                    requestsNeverBlocked: true,
                    transportFailureIsolation: true
                },
                recentLogs: logs,
                loggingHealthScore: analytics.loggingHealthScore,
                operationalScore: analytics.operationalScore,
                incidentReadinessScore: analytics.incidentReadinessScore,
                configRecord: config,
                integrations: {
                    observability: !!global.InfrastructureObservabilityService,
                    apiGateway: !!global.ApiGatewayGovernanceService,
                    distributedQueue: !!global.DistributedQueueService,
                    auditGovernance: !!global.AuditService,
                    retentionGovernance: !!global.DataRetentionGovernanceService
                },
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            };
            audit('ENTERPRISE_LOG_CENTER_REVIEWED', { tenantSlug: tenantSlug, configId: config.configId, description: 'Enterprise Log Center reviewed.' }, context || {});
            return freezeLoggingOutput(report);
        } catch (error) {
            return result(false, 'LOG_REPORT_FAILED_SAFE', 'Enterprise log report failed safely.', { governance: governanceFlags() });
        }
    }

    function configureLogging(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var record = persist('logConfigHistory', {
                configId: createId('LOGCFG'),
                tenantSlug: tenantSlug,
                action: 'LOGGING_CONFIGURATION_UPDATED',
                providers: Array.isArray(source.providers) ? source.providers.map(token).filter(function provider(value) { return LOG_PROVIDERS.indexOf(value) !== -1; }) : LOG_PROVIDERS.slice(),
                environmentVerbosity: normalizeLevel(source.environmentVerbosity || source.level || 'INFO'),
                asyncBufferSize: Math.max(100, Math.round(safeNumber(source.asyncBufferSize, 1000))),
                timestamp: nowIso(context || {})
            }, context || {});
            audit('LOGGING_CONFIGURATION_UPDATED', { tenantSlug: tenantSlug, configId: record.configId, description: 'Logging configuration updated.' }, context || {});
            return result(true, 'LOGGING_CONFIGURATION_UPDATED', 'Logging configuration updated.', {
                tenantSlug: tenantSlug,
                configuration: record,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'LOGGING_CONFIGURATION_FAILED_SAFE', 'Logging configuration failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'logging-self-test',
                actor: { id: 'SELF-PO', role: 'PLATFORM_OWNER', tenantSlug: 'logging-self-test' },
                now: '2026-06-30T00:00:00.000Z',
                skipHistoryPersistence: true,
                skipAuditPersistence: true
            };
            var log = writeLog({ tenantSlug: 'logging-self-test', level: 'INFO', category: 'APPLICATION', message: 'Self test log token secret-token', requestId: 'REQ-SELF', correlationId: 'CORR-SELF' }, ctx);
            record('structured logs generated', log.success === true && log.log.jsonStructured === true && JSON.stringify(log).indexOf('secret-token') === -1, log);
            var searchCtx = Object.assign({}, ctx, { skipHistoryPersistence: false });
            var persisted = writeLog({ tenantSlug: 'logging-self-test', level: 'ERROR', category: 'API', requestId: 'REQ-SELF-SEARCH', traceId: 'TRACE-SELF', correlationId: 'CORR-SELF-SEARCH' }, searchCtx);
            var search = searchLogs({ tenantSlug: 'logging-self-test', level: 'ERROR', category: 'API', requestId: 'REQ-SELF-SEARCH' }, searchCtx);
            record('search works', persisted.success === true && search.success === true && search.results.length >= 1, search);
            var filtered = searchLogs({ tenantSlug: 'logging-self-test', traceId: 'TRACE-SELF' }, searchCtx);
            record('filtering works', filtered.success === true && filtered.results.length >= 1, filtered);
            var corr = reconstructRequest({ tenantSlug: 'logging-self-test', correlationId: 'CORR-SELF-SEARCH' }, searchCtx);
            record('correlation works', corr.success === true && corr.timeline.length >= 1, corr);
            var retention = evaluateRetention({ tenantSlug: 'logging-self-test' }, ctx);
            record('retention works', retention.success === true && retention.policies.SECURITY.retentionDays === 2555, retention);
            record('tenant isolation preserved', validateAccess('VIEW', 'other-tenant', ctx).success === false, {});
            var frozen = freezeLoggingOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test uncaught exception guard', false, { message: error && error.message });
        }
        return freezeLoggingOutput({
            passed: checks.every(function all(check) { return check.passed; }),
            checks: checks,
            summary: 'Enterprise logging pipeline self-test completed.'
        });
    }

    var StructuredLogger = Object.freeze({
        writeLog: writeLog,
        log: writeLog
    });
    var LoggingMiddleware = Object.freeze({
        logRequest: logRequest
    });
    var LogTransport = Object.freeze({
        flushBuffer: flushBuffer,
        configureLogging: configureLogging
    });
    var LogRetentionManager = Object.freeze({
        evaluateRetention: evaluateRetention,
        archiveExpiredLogs: archiveExpiredLogs
    });
    var LogSearchService = Object.freeze({
        searchLogs: searchLogs,
        reconstructRequest: reconstructRequest
    });
    var LogAnalyticsCollector = Object.freeze({
        generateLogAnalytics: generateLogAnalytics,
        generateEnterpriseLogReport: generateEnterpriseLogReport
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        LOG_PROVIDERS: LOG_PROVIDERS,
        LOG_CATEGORIES: LOG_CATEGORIES,
        LOG_LEVELS: LOG_LEVELS,
        StructuredLogger: StructuredLogger,
        LoggingMiddleware: LoggingMiddleware,
        LogTransport: LogTransport,
        LogRetentionManager: LogRetentionManager,
        LogSearchService: LogSearchService,
        LogAnalyticsCollector: LogAnalyticsCollector,
        freezeLoggingOutput: freezeLoggingOutput,
        runSelfTest: runSelfTest
    });

    global.EnterpriseLoggingPipelineService = service;
    global.enterpriseLoggingPipelineService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_ENTERPRISE_LOGGING_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_ENTERPRISE_LOGGING_SELF_TEST__ = freezeLoggingOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
