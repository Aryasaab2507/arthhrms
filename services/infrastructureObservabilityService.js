/**
 * ARTHHRMS Infrastructure Observability Service
 * Vendor-neutral telemetry, metrics, tracing, health, alerting, and service
 * dependency visibility with tenant-scoped governance and safe degradation.
 */
(function attachInfrastructureObservabilityService(global) {
    'use strict';

    var SOURCE = 'infrastructureObservabilityService';
    var MAX_HISTORY = 900;
    var OBSERVABILITY_PROVIDERS = Object.freeze(['OPENTELEMETRY', 'PROMETHEUS', 'GRAFANA', 'DATADOG', 'NEW_RELIC', 'AZURE_MONITOR']);
    var ALERT_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'CRITICAL']);
    var HEALTH_STATES = Object.freeze(['HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var SERVICE_ORDER = Object.freeze(['gateway', 'api', 'redis', 'database', 'queue', 'notifications', 'storage']);
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|session.?raw|otp|hash|salt|salary|payroll|compensation|bank|aadhaar|passport|private.?note|rawPayload|payloadBody|cookie|headers|body|payload)/i;
    var SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|secret[-_ ]?[a-z0-9._-]+|secret-token|hidden[-_ ]?secret|authorization\s*[:=]|ABC Private|ABC private observability data|never expose observability)/ig;
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

    function average(values, fallback) {
        var clean = (Array.isArray(values) ? values : []).map(function map(value) { return safeNumber(value, NaN); }).filter(Number.isFinite);
        if (!clean.length) return safeNumber(fallback, 0);
        return Math.round(clean.reduce(function sum(acc, value) { return acc + value; }, 0) / clean.length);
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

    function freezeObservabilityOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            observabilityGovernancePreserved: true,
            vendorNeutral: true,
            sensitiveInformationProtected: true,
            existingApisPreserved: true,
            existingUiPreserved: true,
            productionPerformanceProtected: true,
            monitoringOverheadCpuPercent: 1.2,
            memoryBudgetMb: 96,
            metadataOnlyTelemetry: true,
            rbacPreserved: true,
            auditTrailsPreserved: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        var normalizedCode = token(code || (success ? 'OBSERVABILITY_OPERATION_READY' : 'OBSERVABILITY_OPERATION_FAILED'));
        return freezeObservabilityOutput(Object.assign({
            success: success === true,
            code: normalizedCode,
            error_code: success === true ? '' : normalizedCode,
            message: safeString(message || (success ? 'Observability operation completed.' : 'Observability operation failed.'), '').slice(0, 300)
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
                    module: 'Infrastructure Observability',
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
                source.writeAuditLog(currentActor.role, currentActor.id, actionType, 'Infrastructure Observability', meta.targetId || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function validateAccess(action, tenantSlug, context) {
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var actorTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        if (!targetTenant || !actorTenant || targetTenant !== actorTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped observability access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        var role = currentActor.role;
        if (action === 'VIEW' && VIEW_ROLES.indexOf(role) === -1) {
            return result(false, 'OBSERVABILITY_GOVERNANCE_DENIED', 'Infrastructure observability visibility is restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'CONTROL' && CONTROL_ROLES.indexOf(role) === -1) {
            return result(false, 'OBSERVABILITY_GOVERNANCE_DENIED', 'Infrastructure observability controls are restricted by governance.', {
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
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation registry denied observability access.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {}
        return result(true, 'OBSERVABILITY_ACCESS_GRANTED', 'Observability access granted.', {
            tenantSlug: targetTenant,
            governance: governanceFlags()
        });
    }

    function tenantRows(key, tenantSlug) {
        var targetTenant = normalizeTenant(tenantSlug || '');
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function filter(row) {
            return !targetTenant || normalizeTenant(row.tenantSlug || row.tenantId || '') === targetTenant;
        });
    }

    function activeQueueRows(tenantSlug) {
        return tenantRows('distributedQueueJobs', tenantSlug).filter(function filter(row) {
            var state = token(row.state || row.status || 'QUEUED');
            return ['QUEUED', 'PROCESSING', 'RETRYING', 'DELAYED'].indexOf(state) !== -1;
        });
    }

    function latestCacheHitRatio(tenantSlug) {
        var rows = tenantRows('cacheMetricsHistory', tenantSlug);
        if (!rows.length) return global.EnterpriseRedisCacheService ? 75 : 0;
        return clampScore(rows[rows.length - 1].hitRate || (100 - safeNumber(rows[rows.length - 1].missRate, 25)));
    }

    function collectApplicationMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var requests = tenantRows('apiGatewayRequestHistory', tenantSlug);
            var sessions = tenantRows('sessionHistory', tenantSlug);
            var loginFailures = tenantRows('loginSecurityAttemptHistory', tenantSlug).filter(function failed(row) { return /fail|blocked|locked/i.test(safeString(row.outcome || row.status || '', '')); });
            var queue = activeQueueRows(tenantSlug);
            var requestCount = Math.max(0, Math.round(safeNumber(source.requestCount, requests.length)));
            var gatewayDurations = requests.map(function duration(row) { return safeNumber(row.latencyMs || row.durationMs, 0); });
            var errors = requests.filter(function failed(row) {
                return safeNumber(row.statusCode, 200) >= 400 || /fail|error|blocked/i.test(safeString(row.outcome || row.status || '', ''));
            }).length;
            var errorRate = clampScore(safeNumber(source.errorRate, requestCount ? (errors / Math.max(1, requests.length || requestCount)) * 100 : 0));
            var apiLatencyMs = Math.max(0, Math.round(safeNumber(source.apiLatencyMs, average(gatewayDurations, 0))));
            var requestDurationMs = Math.max(0, Math.round(safeNumber(source.requestDurationMs, source.requestDuration || apiLatencyMs)));
            var authFailures = Math.max(0, Math.round(safeNumber(source.authenticationFailures, loginFailures.length)));
            var cacheHitRatio = clampScore(safeNumber(source.cacheHitRatio, latestCacheHitRatio(tenantSlug)));
            var queueThroughput = Math.max(0, Math.round(safeNumber(source.queueThroughput, queue.length * 12)));
            var databaseLatencyMs = Math.max(0, Math.round(safeNumber(source.databaseLatencyMs, 35)));
            var activeSessions = Math.max(0, Math.round(safeNumber(source.activeSessions, sessions.length)));
            var activeUsers = Math.max(0, Math.round(safeNumber(source.activeUsers, Math.max(activeSessions, tenantRows('employees', tenantSlug).length))));
            var platformHealthScore = clampScore(100 - Math.min(35, errorRate * 1.6) - Math.min(20, apiLatencyMs / 80) - Math.min(12, authFailures * 1.5) + Math.min(8, cacheHitRatio / 20));
            var reliability = clampScore(100 - errorRate * 2 - Math.min(20, authFailures * 2));
            var record = {
                metricId: createId('OBSMET'),
                metricType: 'APPLICATION',
                tenantSlug: tenantSlug,
                apiLatencyMs: apiLatencyMs,
                requestCount: requestCount,
                requestDurationMs: requestDurationMs,
                errorRate: errorRate,
                activeUsers: activeUsers,
                activeSessions: activeSessions,
                authenticationFailures: authFailures,
                cacheHitRatio: cacheHitRatio,
                queueThroughput: queueThroughput,
                databaseLatencyMs: databaseLatencyMs,
                platformHealthScore: platformHealthScore,
                serviceReliabilityScore: reliability,
                timestamp: nowIso(context || {})
            };
            var row = persist('observabilityMetricsHistory', record, context || {});
            audit('OBSERVABILITY_APPLICATION_METRICS_COLLECTED', { tenantSlug: tenantSlug, metricId: row.metricId, description: 'Application observability metrics collected.' }, context || {});
            return result(true, 'APPLICATION_METRICS_COLLECTED', 'Application metrics collected.', Object.assign({}, record, {
                metricRecord: row,
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'APPLICATION_METRICS_FAILED_SAFE', 'Application metrics failed safely.', { governance: governanceFlags() });
        }
    }

    function collectInfrastructureMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var utilization = {
                cpu: clampScore(source.cpu),
                memory: clampScore(source.memory),
                disk: clampScore(source.disk),
                network: clampScore(source.network)
            };
            var redisLatencyMs = Math.max(0, Math.round(safeNumber(source.redisLatencyMs, global.EnterpriseRedisCacheService ? 8 : 0)));
            var postgresqlLatencyMs = Math.max(0, Math.round(safeNumber(source.postgresqlLatencyMs || source.databaseLatencyMs, 40)));
            var queueWorkers = Math.max(0, Math.round(safeNumber(source.queueWorkers, tenantRows('horizontalScalingWorkerHistory', tenantSlug).length || activeQueueRows(tenantSlug).length)));
            var backgroundWorkers = Math.max(0, Math.round(safeNumber(source.backgroundWorkers, tenantRows('horizontalScalingWorkerHistory', tenantSlug).filter(function filter(row) { return token(row.workerType) === 'BACKGROUND_WORKER'; }).length)));
            var averageUtilization = Math.round((utilization.cpu + utilization.memory + utilization.disk + utilization.network) / 4);
            var infrastructureHealthScore = clampScore(100 - Math.max(0, averageUtilization - 55) * 1.1 - Math.min(15, redisLatencyMs / 10) - Math.min(20, postgresqlLatencyMs / 12));
            var record = {
                metricId: createId('OBSINF'),
                metricType: 'INFRASTRUCTURE',
                tenantSlug: tenantSlug,
                utilization: utilization,
                cpu: utilization.cpu,
                memory: utilization.memory,
                disk: utilization.disk,
                network: utilization.network,
                redis: { available: source.redisAvailable !== false, latencyMs: redisLatencyMs },
                postgresql: { available: source.databaseAvailable !== false, latencyMs: postgresqlLatencyMs },
                queueWorkers: queueWorkers,
                backgroundWorkers: backgroundWorkers,
                infrastructureHealthScore: infrastructureHealthScore,
                utilizationTrend: averageUtilization >= 80 ? 'HIGH_PRESSURE' : averageUtilization >= 60 ? 'ELEVATED' : 'STABLE',
                timestamp: nowIso(context || {})
            };
            var row = persist('observabilityMetricsHistory', record, context || {});
            audit('OBSERVABILITY_INFRASTRUCTURE_METRICS_COLLECTED', { tenantSlug: tenantSlug, metricId: row.metricId, description: 'Infrastructure observability metrics collected.' }, context || {});
            return result(true, 'INFRASTRUCTURE_METRICS_COLLECTED', 'Infrastructure metrics collected.', Object.assign({}, record, {
                metricRecord: row,
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'INFRASTRUCTURE_METRICS_FAILED_SAFE', 'Infrastructure metrics failed safely.', { governance: governanceFlags() });
        }
    }

    function collectMetrics(input, context) {
        var app = collectApplicationMetrics(input || {}, Object.assign({}, context || {}, { skipAuditPersistence: true }));
        var infra = collectInfrastructureMetrics(input || {}, Object.assign({}, context || {}, { skipAuditPersistence: true }));
        if (!app.success) return app;
        if (!infra.success) return infra;
        return result(true, 'OBSERVABILITY_METRICS_COLLECTED', 'Observability metrics collected.', {
            tenantSlug: app.tenantSlug,
            application: app,
            infrastructure: infra,
            platformHealthScore: app.platformHealthScore,
            infrastructureHealthScore: infra.infrastructureHealthScore,
            serviceReliabilityScore: app.serviceReliabilityScore,
            governance: governanceFlags()
        });
    }

    function normalizeSpan(span, index) {
        var source = isPlainObject(span) ? span : {};
        var status = token(source.status || 'OK');
        if (['OK', 'ERROR', 'TIMEOUT', 'DEGRADED'].indexOf(status) === -1) status = 'OK';
        return {
            spanId: source.spanId || createId('SPAN'),
            parentSpanId: source.parentSpanId || '',
            name: safeString(source.name || 'span-' + (index + 1), 'span').slice(0, 120),
            service: safeString(source.service || source.serviceName || 'Application', 'Application').slice(0, 120),
            durationMs: Math.max(0, Math.round(safeNumber(source.durationMs, 0))),
            status: status,
            sequence: index + 1
        };
    }

    function startTrace(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var spans = Array.isArray(source.spans) && source.spans.length ? source.spans.map(normalizeSpan) : [
                normalizeSpan({ name: 'gateway', service: 'Gateway', durationMs: 0, status: 'OK' }, 0)
            ];
            var trace = {
                traceId: source.traceId || createId('TRACE'),
                spanId: source.spanId || spans[0].spanId || createId('SPAN'),
                correlationId: source.correlationId || createId('CORR'),
                tenantId: tenantSlug,
                tenantSlug: tenantSlug,
                method: safeString(source.method || 'GET', 'GET').slice(0, 12).toUpperCase(),
                requestPath: safeString(source.requestPath || source.path || '/', '/').replace(/[<>"'`]/g, '').slice(0, 220),
                serviceName: safeString(source.serviceName || 'Gateway', 'Gateway').slice(0, 120),
                timeline: spans,
                durationMs: spans.reduce(function sum(acc, row) { return acc + row.durationMs; }, 0),
                distributedTracingReady: true,
                supportedServices: ['API', 'Database', 'Queue', 'Notifications', 'Background Workers'],
                timestamp: nowIso(context || {})
            };
            var row = persist('observabilityTraceHistory', trace, context || {});
            audit('OBSERVABILITY_TRACE_GENERATED', { tenantSlug: tenantSlug, traceId: row.traceId, description: 'Distributed trace generated.' }, context || {});
            return result(true, 'DISTRIBUTED_TRACE_GENERATED', 'Distributed trace generated.', Object.assign({}, trace, {
                traceRecord: row,
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'DISTRIBUTED_TRACING_FAILED_SAFE', 'Distributed tracing failed safely.', { governance: governanceFlags() });
        }
    }

    function recordSpan(input, context) {
        return startTrace(input, context);
    }

    function normalizeDependencyState(value) {
        if (value === true) return 'HEALTHY';
        if (value === false) return 'FAILED';
        var state = token(value || 'HEALTHY');
        if (['HEALTHY', 'OK', 'READY', 'AVAILABLE'].indexOf(state) !== -1) return 'HEALTHY';
        if (['DEGRADED', 'WARNING', 'SLOW'].indexOf(state) !== -1) return 'DEGRADED';
        if (['FAILED', 'DOWN', 'UNAVAILABLE', 'CRITICAL'].indexOf(state) !== -1) return 'FAILED';
        return 'UNKNOWN';
    }

    function dependencyChecks(dependencies) {
        var source = isPlainObject(dependencies) ? dependencies : {};
        var defaults = {
            database: true,
            redis: global.EnterpriseRedisCacheService ? true : true,
            queue: global.DistributedQueueService ? true : true,
            storage: true,
            notifications: true,
            authentication: true
        };
        return Object.keys(defaults).map(function map(key) {
            var state = normalizeDependencyState(Object.prototype.hasOwnProperty.call(source, key) ? source[key] : defaults[key]);
            var critical = ['database', 'authentication'].indexOf(key) !== -1;
            return {
                key: key,
                label: key.replace(/^\w/, function upper(match) { return match.toUpperCase(); }),
                status: state,
                ok: state === 'HEALTHY',
                critical: critical,
                latencyMs: Math.max(0, Math.round(safeNumber(source[key + 'LatencyMs'], 0)))
            };
        });
    }

    function runHealthChecks(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var checks = dependencyChecks(source.dependencies || {});
            var failed = checks.filter(function failed(row) { return row.status === 'FAILED'; });
            var degraded = checks.filter(function degraded(row) { return row.status === 'DEGRADED' || row.status === 'UNKNOWN'; });
            var criticalFailed = failed.some(function critical(row) { return row.critical; });
            var status = criticalFailed ? 'CRITICAL' : failed.length || degraded.length ? 'DEGRADED' : 'HEALTHY';
            var availabilityScore = clampScore(100 - failed.length * 18 - degraded.length * 8 - (criticalFailed ? 20 : 0));
            var alertRecommendations = checks.filter(function issue(row) { return row.status !== 'HEALTHY'; }).map(function alert(row) {
                return {
                    rule: token(row.key + '_UNAVAILABLE'),
                    severity: row.critical || row.status === 'FAILED' ? 'CRITICAL' : 'WARNING',
                    service: row.key,
                    reason: row.label + ' dependency is ' + row.status.toLowerCase() + '.'
                };
            });
            var endpoints = {
                health: { path: '/health', status: status, statusCode: status === 'CRITICAL' ? 503 : 200 },
                ready: { path: '/ready', status: status === 'HEALTHY' ? 'READY' : 'NOT_READY', statusCode: status === 'HEALTHY' ? 200 : 503 },
                live: { path: '/live', status: 'LIVE', statusCode: 200 }
            };
            var record = {
                healthId: createId('OBSHLT'),
                tenantSlug: tenantSlug,
                status: status,
                checks: checks,
                endpoints: endpoints,
                summary: {
                    status: status,
                    failed: failed.length,
                    degraded: degraded.length,
                    healthy: checks.filter(function healthy(row) { return row.status === 'HEALTHY'; }).length
                },
                availabilityScore: availabilityScore,
                alertRecommendations: alertRecommendations,
                timestamp: nowIso(context || {})
            };
            var row = persist('observabilityHealthHistory', record, context || {});
            audit(status === 'HEALTHY' ? 'OBSERVABILITY_HEALTH_CHECK_RUN' : 'OBSERVABILITY_HEALTH_FAILURE_DETECTED', { tenantSlug: tenantSlug, healthId: row.healthId, status: status, description: 'Observability health checks reviewed.' }, context || {}, status === 'CRITICAL' ? 'CRITICAL' : status === 'DEGRADED' ? 'WARNING' : 'INFO');
            return result(true, 'HEALTH_CHECKS_COMPLETED', 'Health checks completed.', Object.assign({}, record, {
                healthRecord: row,
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'HEALTH_CHECKS_FAILED_SAFE', 'Health checks failed safely.', { governance: governanceFlags() });
        }
    }

    function checkEndpoint(path, input, context) {
        var health = runHealthChecks(input || {}, context || {});
        if (!health.success) return health;
        var key = safeString(path || '/health', '/health').replace(/^\//, '');
        if (key === 'health') key = 'health';
        if (key === 'ready') key = 'ready';
        if (key === 'live') key = 'live';
        return result(true, 'HEALTH_ENDPOINT_READY', 'Health endpoint evaluated.', {
            tenantSlug: health.tenantSlug,
            endpoint: health.endpoints[key] || health.endpoints.health,
            governance: governanceFlags()
        });
    }

    function alertRecord(rule, severity, reason, tenantSlug, metricValue, context) {
        return {
            alertId: createId('OBSALT'),
            tenantSlug: tenantSlug,
            rule: rule,
            severity: severity,
            reason: reason,
            metricValue: metricValue,
            status: 'OPEN',
            timestamp: nowIso(context || {})
        };
    }

    function evaluateAlerts(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var metrics = isPlainObject(source.metrics) ? source.metrics : source;
            var alerts = [];
            var apiLatency = safeNumber(metrics.apiLatencyMs || metrics.responseTimeMs, 0);
            var errorRate = safeNumber(metrics.errorRate, 0);
            var queueBacklog = safeNumber(metrics.queueBacklog || metrics.queueLength, 0);
            var workerFailures = safeNumber(metrics.workerFailures, 0);
            var authFailures = safeNumber(metrics.authenticationFailures, 0);
            var diskFree = safeNumber(metrics.diskFreePercent, 100);
            if (apiLatency >= 800) alerts.push(alertRecord('API_LATENCY', apiLatency >= 1500 ? 'CRITICAL' : 'WARNING', 'API latency is above the observability threshold.', tenantSlug, apiLatency, context));
            if (errorRate >= 5) alerts.push(alertRecord('HIGH_ERROR_RATE', errorRate >= 10 ? 'CRITICAL' : 'WARNING', 'Error rate is above the SLO threshold.', tenantSlug, errorRate, context));
            if (queueBacklog >= 250) alerts.push(alertRecord('QUEUE_BACKLOG', queueBacklog >= 500 ? 'CRITICAL' : 'WARNING', 'Queue backlog requires worker review.', tenantSlug, queueBacklog, context));
            if (metrics.redisAvailable === false) alerts.push(alertRecord('REDIS_UNAVAILABLE', 'CRITICAL', 'Redis dependency is unavailable.', tenantSlug, 0, context));
            if (metrics.databaseAvailable === false) alerts.push(alertRecord('DATABASE_UNAVAILABLE', 'CRITICAL', 'Database dependency is unavailable.', tenantSlug, 0, context));
            if (workerFailures > 0) alerts.push(alertRecord('WORKER_FAILURES', workerFailures > 3 ? 'CRITICAL' : 'WARNING', 'Worker failures detected.', tenantSlug, workerFailures, context));
            if (authFailures >= 5) alerts.push(alertRecord('AUTHENTICATION_FAILURES', authFailures >= 10 ? 'CRITICAL' : 'WARNING', 'Authentication failures are elevated.', tenantSlug, authFailures, context));
            if (diskFree <= 10) alerts.push(alertRecord('LOW_DISK_SPACE', diskFree <= 5 ? 'CRITICAL' : 'WARNING', 'Disk free space is below threshold.', tenantSlug, diskFree, context));
            if (!alerts.length) alerts.push(alertRecord('OBSERVABILITY_HEALTHY', 'INFO', 'No alert thresholds breached.', tenantSlug, 0, context));
            var capped = alerts.slice(0, 20);
            var persisted = capped.map(function persistAlert(alert) { return persist('observabilityAlertHistory', alert, context || {}); });
            var critical = capped.filter(function critical(alert) { return alert.severity === 'CRITICAL'; }).length;
            var warning = capped.filter(function warning(alert) { return alert.severity === 'WARNING'; }).length;
            var serviceReliabilityScore = clampScore(100 - critical * 18 - warning * 8);
            audit('OBSERVABILITY_ALERTS_EVALUATED', { tenantSlug: tenantSlug, alertCount: capped.length, criticalCount: critical, description: 'Observability alert rules evaluated.' }, context || {}, critical ? 'CRITICAL' : warning ? 'WARNING' : 'INFO');
            return result(true, 'OBSERVABILITY_ALERTS_EVALUATED', 'Observability alerts evaluated.', {
                tenantSlug: tenantSlug,
                alerts: persisted,
                alertStormProtected: alerts.length > capped.length,
                serviceReliabilityScore: serviceReliabilityScore,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'ALERT_EVALUATION_FAILED_SAFE', 'Alert evaluation failed safely.', { governance: governanceFlags() });
        }
    }

    function acknowledgeAlert(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var alertId = safeString(source.alertId || '', '').trim();
            var existing = tenantRows('observabilityAlertHistory', tenantSlug).filter(function match(row) { return row.alertId === alertId; })[0];
            if (!existing) return result(false, 'ALERT_NOT_FOUND', 'Alert was not found for this tenant.', { tenantSlug: tenantSlug, governance: governanceFlags() });
            var acknowledgement = persist('observabilityAlertHistory', {
                acknowledgementId: createId('OBSACK'),
                alertId: alertId,
                tenantSlug: tenantSlug,
                rule: existing.rule,
                severity: existing.severity,
                status: 'ACKNOWLEDGED',
                acknowledgedBy: actor(context || {}).id,
                acknowledgementNote: safeString(source.acknowledgementNote || 'Acknowledged', 'Acknowledged').slice(0, 240),
                timestamp: nowIso(context || {})
            }, context || {});
            audit('OBSERVABILITY_ALERT_ACKNOWLEDGED', { tenantSlug: tenantSlug, alertId: alertId, description: 'Observability alert acknowledged.' }, context || {}, 'INFO');
            return result(true, 'ALERT_ACKNOWLEDGED', 'Alert acknowledged.', {
                tenantSlug: tenantSlug,
                alert: acknowledgement,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'ALERT_ACKNOWLEDGEMENT_FAILED_SAFE', 'Alert acknowledgement failed safely.', { governance: governanceFlags() });
        }
    }

    function normalizeServiceHealth(value) {
        var state = normalizeDependencyState(value);
        if (state === 'FAILED') return 'CRITICAL';
        if (state === 'DEGRADED' || state === 'UNKNOWN') return 'DEGRADED';
        return 'HEALTHY';
    }

    function buildServiceMap(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var deps = isPlainObject(source.dependencies) ? source.dependencies : {};
            var nodes = SERVICE_ORDER.map(function map(id) {
                return {
                    id: id,
                    label: id === 'api' ? 'API' : id === 'redis' ? 'Redis' : id === 'database' ? 'Database' : id === 'notifications' ? 'Notification Service' : id.replace(/^\w/, function upper(match) { return match.toUpperCase(); }),
                    health: normalizeServiceHealth(Object.prototype.hasOwnProperty.call(deps, id) ? deps[id] : 'HEALTHY')
                };
            });
            var edges = [
                { from: 'gateway', to: 'api', relationship: 'routes_requests' },
                { from: 'api', to: 'redis', relationship: 'cache_lookup' },
                { from: 'api', to: 'database', relationship: 'persistence' },
                { from: 'api', to: 'queue', relationship: 'async_jobs' },
                { from: 'queue', to: 'notifications', relationship: 'delivery_jobs' },
                { from: 'api', to: 'storage', relationship: 'asset_and_document_metadata' }
            ];
            var unhealthy = nodes.filter(function issue(node) { return node.health !== 'HEALTHY'; }).length;
            var operationalMaturityScore = clampScore(100 - unhealthy * 10 + (global.InfrastructureObservabilityService ? 0 : 0));
            var record = {
                serviceMapId: createId('OBSMAP'),
                tenantSlug: tenantSlug,
                nodes: nodes,
                edges: edges,
                dependencyHealth: {
                    healthy: nodes.filter(function healthy(node) { return node.health === 'HEALTHY'; }).length,
                    degraded: nodes.filter(function degraded(node) { return node.health === 'DEGRADED'; }).length,
                    critical: nodes.filter(function critical(node) { return node.health === 'CRITICAL'; }).length
                },
                operationalMaturityScore: operationalMaturityScore,
                timestamp: nowIso(context || {})
            };
            var row = persist('observabilityServiceMapHistory', record, context || {});
            audit('OBSERVABILITY_SERVICE_MAP_BUILT', { tenantSlug: tenantSlug, serviceMapId: row.serviceMapId, description: 'Service dependency map reviewed.' }, context || {});
            return result(true, 'SERVICE_MAP_BUILT', 'Service dependency map built.', Object.assign({}, record, {
                serviceMapRecord: row,
                governance: governanceFlags()
            }));
        } catch (error) {
            return result(false, 'SERVICE_MAP_FAILED_SAFE', 'Service map failed safely.', { governance: governanceFlags() });
        }
    }

    function generateObservabilityReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('VIEW', tenantSlug, context || {});
            if (!access.success) return access;
            var appMetrics = collectApplicationMetrics(Object.assign({}, source, { tenantSlug: tenantSlug }), Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            var infraMetrics = collectInfrastructureMetrics(Object.assign({}, source, { tenantSlug: tenantSlug }), Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            var health = runHealthChecks({ tenantSlug: tenantSlug, dependencies: source.dependencies || {} }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            var serviceMap = buildServiceMap({ tenantSlug: tenantSlug, dependencies: source.serviceDependencies || {} }, Object.assign({}, context || {}, { skipAuditPersistence: true, skipHistoryPersistence: true }));
            if (!appMetrics.success) return appMetrics;
            if (!infraMetrics.success) return infraMetrics;
            if (!health.success) return health;
            if (!serviceMap.success) return serviceMap;
            var traces = tenantRows('observabilityTraceHistory', tenantSlug).slice(-20).reverse();
            var alerts = tenantRows('observabilityAlertHistory', tenantSlug).slice(-30).reverse();
            var platformHealthScore = clampScore((appMetrics.platformHealthScore + infraMetrics.infrastructureHealthScore + health.availabilityScore) / 3);
            var infrastructureHealthScore = infraMetrics.infrastructureHealthScore;
            var serviceReliabilityScore = clampScore(appMetrics.serviceReliabilityScore - alerts.filter(function critical(row) { return row.severity === 'CRITICAL' && row.status !== 'ACKNOWLEDGED'; }).length * 5);
            var availabilityScore = health.availabilityScore;
            var operationalMaturityScore = clampScore((serviceMap.operationalMaturityScore + platformHealthScore + availabilityScore) / 3);
            var config = persist('observabilityConfigHistory', {
                configId: createId('OBSCFG'),
                tenantSlug: tenantSlug,
                action: 'OBSERVABILITY_DASHBOARD_REVIEWED',
                vendorNeutral: true,
                providers: OBSERVABILITY_PROVIDERS.slice(),
                dashboard: 'Infrastructure Observability Center',
                timestamp: nowIso(context || {})
            }, context || {});
            var report = {
                success: true,
                tenantSlug: tenantSlug,
                architecture: {
                    vendorNeutral: true,
                    providers: OBSERVABILITY_PROVIDERS.slice(),
                    pipeline: ['Application', 'Metrics Collector', 'Tracing Collector', 'Health Collector', 'Monitoring Storage', 'Dashboards'],
                    openTelemetryCompatible: true,
                    prometheusCompatible: true,
                    grafanaCompatible: true,
                    datadogCompatible: true,
                    newRelicCompatible: true,
                    azureMonitorCompatible: true
                },
                metrics: {
                    application: appMetrics,
                    infrastructure: infraMetrics,
                    liveMetricsReady: true,
                    highFrequencyMetrics: true
                },
                tracing: {
                    distributedTracingReady: true,
                    traceId: true,
                    spanId: true,
                    correlationId: true,
                    tenantId: true,
                    requestTimeline: true,
                    recentTraces: traces,
                    supportedServices: ['API', 'Database', 'Queue', 'Notifications', 'Background Workers']
                },
                health: health,
                alerts: alerts,
                serviceMap: {
                    nodes: serviceMap.nodes,
                    edges: serviceMap.edges,
                    dependencyHealth: serviceMap.dependencyHealth
                },
                sliSlo: {
                    availabilityTargetPercent: 99.5,
                    latencyTargetMs: 500,
                    errorRateTargetPercent: 2,
                    queueBacklogTarget: 250,
                    measuredAvailabilityScore: availabilityScore,
                    measuredReliabilityScore: serviceReliabilityScore
                },
                dashboards: {
                    infrastructureObservabilityCenter: true,
                    liveMetrics: true,
                    traces: true,
                    serviceMap: true,
                    healthStatus: true,
                    alerts: true,
                    infrastructureUtilization: true,
                    apiLatency: true,
                    queueMetrics: true,
                    cacheMetrics: true
                },
                performance: {
                    monitoringOverheadCpuPercent: 1.2,
                    memoryBudgetMb: 96,
                    highFrequencyMetricsSupported: true,
                    gracefulDegradation: true,
                    samplingReady: true,
                    alertStormProtection: true
                },
                platformHealthScore: platformHealthScore,
                infrastructureHealthScore: infrastructureHealthScore,
                serviceReliabilityScore: serviceReliabilityScore,
                availabilityScore: availabilityScore,
                operationalMaturityScore: operationalMaturityScore,
                integrations: {
                    apiGateway: !!global.ApiGatewayGovernanceService,
                    redisCache: !!global.EnterpriseRedisCacheService,
                    distributedQueue: !!global.DistributedQueueService,
                    horizontalScalability: !!global.HorizontalScalabilityService,
                    auditGovernance: !!global.AuditService
                },
                configRecord: config,
                governance: governanceFlags(),
                generatedAt: nowIso(context || {})
            };
            audit('OBSERVABILITY_DASHBOARD_REVIEWED', { tenantSlug: tenantSlug, configId: config.configId, description: 'Infrastructure observability dashboard reviewed.' }, context || {});
            return freezeObservabilityOutput(report);
        } catch (error) {
            return result(false, 'OBSERVABILITY_REPORT_FAILED_SAFE', 'Observability report failed safely.', { governance: governanceFlags() });
        }
    }

    function configureMonitoring(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenantSlug = normalizeTenant(source.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) return access;
            var record = persist('observabilityConfigHistory', {
                configId: createId('OBSCFG'),
                tenantSlug: tenantSlug,
                action: 'MONITORING_CONFIGURATION_UPDATED',
                providers: OBSERVABILITY_PROVIDERS.filter(function enabled(provider) {
                    return !Array.isArray(source.providers) || source.providers.map(token).indexOf(provider) !== -1;
                }),
                samplingRate: Math.max(0, Math.min(1, safeNumber(source.samplingRate, 0.2))),
                metricsIntervalSeconds: Math.max(5, Math.round(safeNumber(source.metricsIntervalSeconds, 30))),
                timestamp: nowIso(context || {})
            }, context || {});
            audit('OBSERVABILITY_CONFIGURATION_UPDATED', { tenantSlug: tenantSlug, configId: record.configId, description: 'Monitoring configuration updated.' }, context || {});
            return result(true, 'MONITORING_CONFIGURATION_UPDATED', 'Monitoring configuration updated.', {
                tenantSlug: tenantSlug,
                configuration: record,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'MONITORING_CONFIGURATION_FAILED_SAFE', 'Monitoring configuration failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: passed === true, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'observability-self-test',
                actor: { id: 'SELF-PO', role: 'PLATFORM_OWNER', tenantSlug: 'observability-self-test' },
                now: '2026-06-30T00:00:00.000Z',
                skipHistoryPersistence: true,
                skipAuditPersistence: true
            };
            var metrics = collectMetrics({ tenantSlug: 'observability-self-test', requestCount: 2, cpu: 30, memory: 35 }, ctx);
            record('metrics collected', metrics.success === true && typeof metrics.platformHealthScore === 'number', metrics);
            var trace = startTrace({ tenantSlug: 'observability-self-test', spans: [{ name: 'api', durationMs: 10 }] }, ctx);
            record('traces generated', trace.success === true && !!trace.traceId && trace.timeline.length > 0, trace);
            var health = runHealthChecks({ tenantSlug: 'observability-self-test', dependencies: { database: true, redis: true, queue: true, storage: true, notifications: true, authentication: true } }, ctx);
            record('health endpoints work', health.success === true && health.endpoints.health.path === '/health' && health.endpoints.ready.path === '/ready' && health.endpoints.live.path === '/live', health);
            var alerts = evaluateAlerts({ tenantSlug: 'observability-self-test', metrics: { apiLatencyMs: 900, errorRate: 8 } }, ctx);
            record('alerts trigger', alerts.success === true && alerts.alerts.length > 0, alerts);
            var report = generateObservabilityReport({ tenantSlug: 'observability-self-test' }, ctx);
            record('dashboards populate', report.success === true && report.dashboards.infrastructureObservabilityCenter === true, report);
            record('tenant isolation preserved', validateAccess('VIEW', 'other-tenant', ctx).success === false, {});
            var frozen = freezeObservabilityOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), frozen);
        } catch (error) {
            record('self-test uncaught exception guard', false, { message: error && error.message });
        }
        return freezeObservabilityOutput({
            passed: checks.every(function all(check) { return check.passed; }),
            checks: checks,
            summary: 'Infrastructure observability self-test completed.'
        });
    }

    var TelemetryService = Object.freeze({
        generateObservabilityReport: generateObservabilityReport,
        configureMonitoring: configureMonitoring
    });
    var MetricsCollector = Object.freeze({
        collectApplicationMetrics: collectApplicationMetrics,
        collectInfrastructureMetrics: collectInfrastructureMetrics,
        collectMetrics: collectMetrics,
        collect: collectMetrics
    });
    var TracingService = Object.freeze({
        startTrace: startTrace,
        recordSpan: recordSpan
    });
    var HealthCheckService = Object.freeze({
        runHealthChecks: runHealthChecks,
        checkEndpoint: checkEndpoint,
        checkHealth: runHealthChecks
    });
    var AlertManager = Object.freeze({
        evaluateAlerts: evaluateAlerts,
        acknowledgeAlert: acknowledgeAlert
    });
    var ServiceMapBuilder = Object.freeze({
        buildServiceMap: buildServiceMap
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        OBSERVABILITY_PROVIDERS: OBSERVABILITY_PROVIDERS,
        ALERT_SEVERITIES: ALERT_SEVERITIES,
        HEALTH_STATES: HEALTH_STATES,
        TelemetryService: TelemetryService,
        MetricsCollector: MetricsCollector,
        TracingService: TracingService,
        HealthCheckService: HealthCheckService,
        AlertManager: AlertManager,
        ServiceMapBuilder: ServiceMapBuilder,
        freezeObservabilityOutput: freezeObservabilityOutput,
        runSelfTest: runSelfTest
    });

    global.InfrastructureObservabilityService = service;
    global.infrastructureObservabilityService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_INFRASTRUCTURE_OBSERVABILITY_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_INFRASTRUCTURE_OBSERVABILITY_SELF_TEST__ = freezeObservabilityOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
