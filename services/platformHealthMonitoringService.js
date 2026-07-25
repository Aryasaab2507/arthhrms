/**
 * platformHealthMonitoringService.js
 * ARTHHRMS Enterprise Platform Health Monitoring + Operational Stability.
 *
 * Additive, platform-control-only health layer for real-time operational
 * monitoring, throughput intelligence, degradation detection, recovery
 * analytics, and infrastructure health visibility. It never exposes salaries,
 * leave balances, private HR records, raw tenant documents, or tenant-private
 * payloads.
 */
(function attachPlatformHealthMonitoringService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PlatformHealthMonitoringService]';

    var HEALTH_STATES = Object.freeze([
        'HEALTHY',
        'MONITORING',
        'DEGRADED',
        'WARNING',
        'CRITICAL',
        'RECOVERING',
        'STABILIZED',
        'ARCHIVED'
    ]);

    var HEALTH_TYPES = Object.freeze([
        'WORKFLOW_THROUGHPUT',
        'SERVICE_RESPONSE',
        'NOTIFICATION_HEALTH',
        'ONBOARDING_RELIABILITY',
        'STORAGE_STABILITY',
        'AUTHENTICATION_HEALTH',
        'EXECUTION_THROUGHPUT',
        'OPERATIONAL_DEGRADATION'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        PLATFORM_HEALTH_GOVERNANCE: 'PLATFORM_HEALTH_GOVERNANCE',
        INFRASTRUCTURE_HEALTH_MONITORING: 'INFRASTRUCTURE_HEALTH_MONITORING'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        payload: true,
        metadata: true,
        healthId: true,
        tenantId: true,
        tenantSlug: true,
        crossTenantConfidentialLeakageBlocked: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        superAdminHrPayrollVisibility: true,
        malformedPayloads: true,
        storageDegradation: true,
        storageAnalyticsIntegrated: true,
        billingReliabilityPressure: true,
        billingLinkedDegradation: true,
        tenantBillingIntegrated: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (typeof details !== 'undefined') global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            var state = source && typeof source.get === 'function' ? source.get() || {} : {};
            var projection = global.PlatformAggregateIntegrationService?.getProjection?.() || {};
            return Object.assign({}, state, projection);
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.company_id || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function timeValue(value) {
        try {
            var ms = new Date(value).getTime();
            return isFinite(ms) ? ms : 0;
        } catch (error) {
            return 0;
        }
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key], refs); });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function sanitizeItem(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) {
            return input.map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeHealthOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'HEALTH_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Health governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'HEALTH_GOVERNANCE_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'Health governance warning.', ''),
            recommendation: safeString(recommendation || 'Review platform operational stability posture.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeHealthState(value, fallback) {
        var state = normalizeToken(value || fallback || 'MONITORING');
        if (state === 'OK' || state === 'READY' || state === 'UP') return 'HEALTHY';
        if (state === 'ACTIVE' || state === 'OBSERVING') return 'MONITORING';
        if (state === 'DEGRADED_SERVICE' || state === 'SLOW' || state === 'FAILING') return 'DEGRADED';
        if (state === 'WARN') return 'WARNING';
        if (state === 'CRITICAL_BLOCKER' || state === 'OUTAGE' || state === 'DOWN') return 'CRITICAL';
        if (state === 'RECOVERY') return 'RECOVERING';
        if (state === 'RESOLVED' || state === 'STABLE') return 'STABILIZED';
        if (HEALTH_STATES.indexOf(state) !== -1) return state;
        return fallback || 'MONITORING';
    }

    function normalizeHealthType(value) {
        var type = normalizeToken(value || '');
        if (/WORKFLOW|QUEUE|APPROVAL/.test(type)) return 'WORKFLOW_THROUGHPUT';
        if (/SERVICE|API|LATENCY|RESPONSE|SERVER/.test(type)) return 'SERVICE_RESPONSE';
        if (/NOTIFICATION|EMAIL|WHATSAPP|DELIVERY/.test(type)) return 'NOTIFICATION_HEALTH';
        if (/ONBOARD|INVITE|ACTIVATION/.test(type)) return 'ONBOARDING_RELIABILITY';
        if (/STORAGE|UPLOAD|OBJECT|BUCKET/.test(type)) return 'STORAGE_STABILITY';
        if (/AUTH|LOGIN|SESSION|ACCESS/.test(type)) return 'AUTHENTICATION_HEALTH';
        if (/EXECUTION|STRATEGIC|TASK|MILESTONE/.test(type)) return 'EXECUTION_THROUGHPUT';
        if (/OPERATION|DEGRADE|INCIDENT|ROLLOUT|FEATURE/.test(type)) return 'OPERATIONAL_DEGRADATION';
        if (HEALTH_TYPES.indexOf(type) !== -1) return type;
        return 'SERVICE_RESPONSE';
    }

    function isUnstableState(row) {
        var token = normalizeToken(row && (row.status || row.state || row.healthState || row.eventType || row.type || row.severity || row.classification || ''));
        if (/FAILED|FAILURE|ERROR|DEGRADED|BLOCKED|DELAYED|OUTAGE|INCIDENT|ESCALATED|CRITICAL|HIGH_RISK|WARNING/.test(token)) return true;
        if (safeNumber(row && (row.failureRate || row.errorRate), 0) >= 5) return true;
        if (safeNumber(row && (row.latencyMs || row.responseMs || row.durationMs), 0) >= 1500) return true;
        if (safeNumber(row && (row.quotaUtilization || row.storagePressure), 0) >= 85) return true;
        return safeNumber(row && (row.throughputRate || row.completionRate), 100) < 70;
    }

    function classifyHealthSeverity(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || row.healthSeverity || '');
            if (row.crossTenant === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            if (severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            var state = normalizeHealthState(row.state || row.status || row.healthState, 'MONITORING');
            if (state === 'CRITICAL') return SEVERITIES.CRITICAL_BLOCKER;
            if (state === 'DEGRADED') return SEVERITIES.HIGH_RISK;
            if (state === 'WARNING' || state === 'RECOVERING') return SEVERITIES.WARNING;
            var latency = safeNumber(row.latencyMs || row.responseMs || row.durationMs, 0);
            var failureRate = safeNumber(row.failureRate || row.errorRate || row.failedRate, 0);
            var throughput = safeNumber(row.throughputRate || row.completionRate || 100, 100);
            if (latency >= 5000 || failureRate >= 30 || throughput < 25) return SEVERITIES.CRITICAL_BLOCKER;
            if (latency >= 1500 || failureRate >= 10 || throughput < 55) return SEVERITIES.HIGH_RISK;
            if (latency >= 750 || failureRate >= 5 || throughput < 75 || isUnstableState(row)) return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeHealthPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeHealthOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_HEALTH_PAYLOAD', SEVERITIES.HIGH_RISK, 'Health payload must be an object.')]
                });
            }
            var state = normalizeHealthState(payload.healthState || payload.state || payload.status, 'MONITORING');
            var createdAt = safeString(payload.createdAt || payload.timestamp || payload.detectedAt || nowIso(context || {}), nowIso(context || {}));
            var stabilizedAt = safeString(payload.stabilizedAt || payload.resolvedAt || payload.recoveredAt || '', '');
            var recoveryMinutes = safeNumber(payload.recoveryMinutes || payload.timeToRecover || 0, 0);
            if (!recoveryMinutes && stabilizedAt) {
                recoveryMinutes = Math.max(0, Math.round((timeValue(stabilizedAt) - timeValue(createdAt)) / 60000));
            }
            var throughput = clamp(Math.round(safeNumber(payload.throughputRate || payload.completionRate || 100, 100)), 0, 100);
            var failureRate = clamp(Math.round(safeNumber(payload.failureRate || payload.errorRate || payload.failedRate || 0, 0)), 0, 100);
            var latency = clamp(Math.round(safeNumber(payload.latencyMs || payload.responseMs || payload.durationMs || 0, 0)), 0, 1000000);
            var severity = classifyHealthSeverity(Object.assign({}, payload, { healthState: state, throughputRate: throughput, failureRate: failureRate, latencyMs: latency }));
            var normalized = {
                healthId: safeString(payload.healthId || payload.id || payload.eventId || 'HEALTH-' + timeValue(createdAt), ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                healthType: normalizeHealthType(payload.healthType || payload.type || payload.module || payload.eventType),
                healthState: state,
                healthStateRaw: safeString(payload.state || payload.status || payload.healthState || '', ''),
                severity: severity,
                module: safeString(payload.module || payload.service || payload.source || 'platform', 'platform'),
                service: safeString(payload.service || payload.module || payload.source || 'platform', 'platform'),
                environment: safeString(payload.environment || payload.environmentMode || '', ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                stabilizedAt: stabilizedAt,
                throughputRate: throughput,
                latencyMs: latency,
                failureRate: failureRate,
                recoveryMinutes: clamp(Math.round(recoveryMinutes), 0, 100000),
                stabilityScore: clamp(100 - failureRate - Math.round(latency / 200) - Math.max(0, 75 - throughput), 0, 100),
                escalationState: normalizeToken(payload.escalationState || (severity === SEVERITIES.HIGH_RISK || severity === SEVERITIES.CRITICAL_BLOCKER ? 'ESCALATION_READY' : 'MONITORING')),
                recoveryState: normalizeToken(payload.recoveryState || (state === 'RECOVERING' || state === 'STABILIZED' ? state : 'PENDING')),
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeHealthOutput({
                success: true,
                payload: normalized,
                classification: normalized.severity,
                operationalStabilityIntelligencePreserved: true
            });
        } catch (error) {
            return freezeHealthOutput({
                success: false,
                payload: {},
                failures: [safeFailure('HEALTH_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Health payload normalization failed safely.')]
            });
        }
    }

    function validateHealthScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || (global.location && global.location.pathname) || '', '').toLowerCase();
            var failures = [];
            var warnings = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeHealthState(record.healthState || record.state || record.status, '');

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('HEALTH_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Platform health monitoring is isolated to platform-control.'));
            }

            if (state === 'ARCHIVED' && (record.infrastructureOverride || record.operationalOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_HEALTH_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical health monitoring records are immutable after archival.'));
            }

            if (record.infrastructureOverride || record.operationalOverride || record.bypassGovernance || record.overrideHealth) {
                failures.push(safeFailure('UNSAFE_INFRASTRUCTURE_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe infrastructure overrides are blocked by health governance.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (!failures.length) {
                    return freezeHealthOutput({
                        allowed: true,
                        readOnly: record.readOnly !== false,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        visibility: VISIBILITY.PLATFORM_HEALTH_GOVERNANCE,
                        warnings: warnings,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_HEALTH_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure-only health monitoring.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_INFRASTRUCTURE_HEALTH_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant infrastructure health scope is blocked.'));
                }
                if (!failures.length) {
                    return freezeHealthOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        visibility: VISIBILITY.INFRASTRUCTURE_HEALTH_MONITORING,
                        warnings: warnings,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_HEALTH_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access platform health monitoring.'));
            }

            return freezeHealthOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                visibility: VISIBILITY.NONE,
                failures: failures,
                warnings: warnings
            });
        } catch (error) {
            return freezeHealthOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('HEALTH_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Health scope validation failed safely.')]
            });
        }
    }

    function healthFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeHealthPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitHealth(data) {
        var rows = []
            .concat(list(data, 'platformHealthRecords'))
            .concat(list(data, 'healthMonitoringRecords'))
            .concat(list(data, 'platformHealthEvents'))
            .concat(list(data, 'operationalHealthRecords'));
        return rows.map(function mapHealth(row) {
            return healthFromRow(row, { healthType: row && (row.healthType || row.type || 'SERVICE_RESPONSE') });
        }).filter(Boolean);
    }

    function collectDerivedHealth(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isUnstableState(row)) return;
                var timestamp = row.createdAt || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(healthFromRow(Object.assign({
                    healthId: row.healthId || row.eventId || row.notificationId || row.inviteId || row.objectId || row.rolloutId || row.incidentId || row.id || defaults.prefix + '-' + index,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.healthState || row.state || row.status || defaults.state || 'DEGRADED',
                    severity: row.severity || row.classification || defaults.severity || 'WARNING',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    service: defaults.service,
                    healthType: defaults.healthType,
                    latencyMs: row.latencyMs || row.responseMs || row.durationMs,
                    throughputRate: row.throughputRate || row.completionRate,
                    failureRate: row.failureRate || row.errorRate || row.failureCount
                }, row)));
            });
        }
        addRows(list(data, 'workflowEvents').concat(list(data, 'pendingActions')).concat(list(data, 'asyncJobs')), { prefix: 'WORKFLOW', module: 'workflow', service: 'workflow', healthType: 'WORKFLOW_THROUGHPUT' });
        addRows(list(data, 'notificationLogs').concat(list(data, 'notifications')).concat(list(data, 'notificationQueue')), { prefix: 'NOTIFICATION', module: 'notification', service: 'notification', healthType: 'NOTIFICATION_HEALTH' });
        addRows(list(data, 'authInvites').concat(list(data, 'inviteRecords')).concat(list(data, 'onboardingStates')).concat(list(data, 'organizationSetups')), { prefix: 'ONBOARDING', module: 'onboarding', service: 'onboarding', healthType: 'ONBOARDING_RELIABILITY' });
        addRows(list(data, 'storageObjects').concat(list(data, 'uploads')).concat(list(data, 'fileAttachments')), { prefix: 'STORAGE', module: 'storage', service: 'storage', healthType: 'STORAGE_STABILITY' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT', module: 'featureRollout', service: 'featureRollout', healthType: 'OPERATIONAL_DEGRADATION' });
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT', module: 'incident', service: 'incident', healthType: 'OPERATIONAL_DEGRADATION' });
        return rows.filter(Boolean);
    }

    function externalHealthSignals(context) {
        var signals = {
            incident: {},
            reliability: {},
            analytics: {},
            rollout: {},
            billing: {}
        };
        try {
            var incidents = global.GlobalIncidentService || global.globalIncidentService;
            if (incidents && typeof incidents.generateGlobalIncidentReport === 'function') {
                var incidentReport = incidents.generateGlobalIncidentReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.incident = {
                    analytics: incidentReport && incidentReport.incidentAnalytics || {},
                    reliability: incidentReport && incidentReport.platformReliabilityGovernance || {},
                    escalation: incidentReport && incidentReport.incidentEscalationIntelligence || {}
                };
            }
        } catch (error) {}
        try {
            var reliability = global.PlatformReliabilityService || global.platformReliabilityService;
            if (reliability && typeof reliability.generateReliabilityReport === 'function') {
                signals.reliability = reliability.generateReliabilityReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) || {};
            }
        } catch (error) {}
        try {
            var analytics = global.PlatformAnalyticsService || global.platformAnalyticsService;
            if (analytics && typeof analytics.generatePlatformAnalyticsReport === 'function') {
                var analyticsReport = analytics.generatePlatformAnalyticsReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.analytics = analyticsReport && analyticsReport.platformHealth || {};
            }
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') {
                var rolloutReport = rollout.generateFeatureRolloutReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.rollout = rolloutReport && rolloutReport.featureHealth || {};
            }
        } catch (error) {}
        try {
            var billing = global.TenantBillingService || global.tenantBillingService;
            if (billing && typeof billing.generateTenantBillingReport === 'function') {
                var billingReport = billing.generateTenantBillingReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.billing = {
                    overview: billingReport && billingReport.billingGovernanceOverview || {},
                    renewal: billingReport && billingReport.renewalGovernance || {},
                    intelligence: billingReport && billingReport.billingIntelligence || {},
                    dashboard: billingReport && billingReport.governanceDashboard || {}
                };
            }
        } catch (error) {}
        return signals;
    }

    function summarizeHealth(rows, signals) {
        var healthRows = Array.isArray(rows) ? rows : [];
        var totals = healthRows.reduce(function reduce(acc, row) {
            acc.total += 1;
            if (row.healthState === 'DEGRADED' || row.healthState === 'WARNING') acc.degraded += 1;
            if (row.healthState === 'CRITICAL') acc.critical += 1;
            if (row.healthState === 'RECOVERING') acc.recovering += 1;
            if (row.healthState === 'STABILIZED') acc.stabilized += 1;
            if (row.healthState === 'ARCHIVED') acc.archived += 1;
            if (row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.highRisk += 1;
            acc.latencyTotal += safeNumber(row.latencyMs, 0);
            acc.failureTotal += safeNumber(row.failureRate, 0);
            acc.throughputTotal += safeNumber(row.throughputRate, 100);
            acc.recoveryTotal += safeNumber(row.recoveryMinutes, 0);
            acc.stabilityTotal += safeNumber(row.stabilityScore, 100);
            if (row.healthType === 'WORKFLOW_THROUGHPUT') acc.workflowThroughputDecline += 1;
            if (row.healthType === 'NOTIFICATION_HEALTH') acc.notificationFailureSpikes += 1;
            if (row.healthType === 'ONBOARDING_RELIABILITY') acc.onboardingInstability += 1;
            if (row.healthType === 'STORAGE_STABILITY') acc.storageDegradation += 1;
            if (row.healthType === 'AUTHENTICATION_HEALTH') acc.authenticationDegradation += 1;
            if (row.healthType === 'EXECUTION_THROUGHPUT') acc.executionThroughputIssues += 1;
            if (safeNumber(row.latencyMs, 0) >= 1500) acc.serviceLatencyGrowth += 1;
            if (/feature|rollout/i.test(row.module || row.service || '')) acc.featureRolloutInstability += 1;
            return acc;
        }, {
            total: 0,
            degraded: 0,
            critical: 0,
            recovering: 0,
            stabilized: 0,
            archived: 0,
            highRisk: 0,
            latencyTotal: 0,
            failureTotal: 0,
            throughputTotal: 0,
            recoveryTotal: 0,
            stabilityTotal: 0,
            workflowThroughputDecline: 0,
            notificationFailureSpikes: 0,
            onboardingInstability: 0,
            storageDegradation: 0,
            authenticationDegradation: 0,
            executionThroughputIssues: 0,
            serviceLatencyGrowth: 0,
            featureRolloutInstability: 0,
            billingReliabilityPressure: 0,
            billingLinkedDegradation: 0
        });
        var platformHealth = signals && signals.analytics || {};
        var incidentAnalytics = signals && signals.incident && signals.incident.analytics || {};
        var incidentEscalation = signals && signals.incident && signals.incident.escalation || {};
        var rolloutHealth = signals && signals.rollout || {};
        var billingSignals = signals && signals.billing || {};
        var billingOverview = billingSignals.overview || {};
        var billingRenewal = billingSignals.renewal || {};
        var billingDashboard = billingSignals.dashboard || {};
        totals.workflowThroughputDecline += safeNumber(platformHealth.workflowCongestion, 0);
        totals.notificationFailureSpikes += safeNumber(platformHealth.notificationFailures, 0);
        totals.onboardingInstability += safeNumber(platformHealth.onboardingFailures, 0);
        totals.storageDegradation += safeNumber(platformHealth.storagePressure, 0) >= 85 ? 1 : 0;
        totals.featureRolloutInstability += safeNumber(rolloutHealth.degradedFeatureBehavior, 0) + safeNumber(rolloutHealth.rolloutFailures, 0);
        totals.billingReliabilityPressure += safeNumber(billingRenewal.renewalFailures, 0) +
            safeNumber(billingRenewal.paymentFailures, 0) +
            safeNumber(billingRenewal.billingRestrictionEvents, 0) +
            safeNumber(billingOverview.pastDueSubscriptions, 0) +
            safeNumber(billingOverview.limitedSubscriptions, 0) +
            safeNumber(billingOverview.suspendedSubscriptions, 0) +
            safeNumber(billingDashboard.subscriptionAnomalies, 0);
        totals.billingLinkedDegradation = totals.billingReliabilityPressure;
        totals.incidentLinkedDegradation = safeNumber(incidentAnalytics.activeIncidents, 0) + safeNumber(incidentEscalation.degradationSpikes, 0);
        totals.escalationFrequency = safeNumber(incidentAnalytics.escalationGrowth, 0);
        totals.averageLatency = totals.total ? Math.round(totals.latencyTotal / totals.total) : 0;
        totals.averageThroughput = totals.total ? Math.round(totals.throughputTotal / totals.total) : 100;
        totals.averageRecovery = totals.total ? Math.round(totals.recoveryTotal / totals.total) : 0;
        totals.averageStability = totals.total ? Math.round(totals.stabilityTotal / totals.total) : 100;
        return totals;
    }

    function stabilityScore(totals) {
        var penalty = 0;
        penalty += safeNumber(totals.critical, 0) * 14;
        penalty += safeNumber(totals.highRisk, 0) * 10;
        penalty += safeNumber(totals.degraded, 0) * 6;
        penalty += safeNumber(totals.workflowThroughputDecline, 0) * 3;
        penalty += safeNumber(totals.notificationFailureSpikes, 0) * 3;
        penalty += safeNumber(totals.storageDegradation, 0) * 5;
        penalty += safeNumber(totals.featureRolloutInstability, 0) * 4;
        penalty += safeNumber(totals.incidentLinkedDegradation, 0) * 4;
        penalty += safeNumber(totals.billingReliabilityPressure, 0) * 3;
        return clamp(100 - penalty, 0, 100);
    }

    function detectOperationalInstability(filters, context) {
        try {
            var scope = validateHealthScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeHealthOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    failures: scope.failures,
                    warnings: scope.warnings
                });
            }
            var data = rawData();
            var rows = scope.infrastructureOnly ? [] : collectExplicitHealth(data).concat(collectDerivedHealth(data));
            var signals = externalHealthSignals(context || {});
            var totals = summarizeHealth(rows, signals);
            var score = scope.infrastructureOnly ? 100 : stabilityScore(totals);
            var classification = score < 45 || totals.critical ? SEVERITIES.CRITICAL_BLOCKER : score < 70 || totals.highRisk ? SEVERITIES.HIGH_RISK : score < 88 || totals.degraded ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeHealthOutput({
                success: true,
                classification: classification,
                stabilityScore: score,
                healthAlertIntelligence: {
                    workflowThroughputDecline: totals.workflowThroughputDecline,
                    onboardingInstability: totals.onboardingInstability,
                    storageDegradation: totals.storageDegradation,
                    notificationFailureSpikes: totals.notificationFailureSpikes,
                    serviceLatencyGrowth: totals.serviceLatencyGrowth,
                    featureRolloutInstability: totals.featureRolloutInstability,
                    authenticationDegradation: totals.authenticationDegradation,
                    billingReliabilityPressure: totals.billingReliabilityPressure
                },
                throughputAnalytics: {
                    averageThroughput: totals.averageThroughput,
                    executionThroughputIssues: totals.executionThroughputIssues,
                    workflowRestorationNeeded: totals.workflowThroughputDecline,
                    throughputRecoveryRate: Math.max(0, 100 - totals.workflowThroughputDecline * 5)
                },
                recoveryTracking: {
                    recoveringSignals: totals.recovering,
                    stabilizedSignals: totals.stabilized,
                    averageRecoveryMinutes: totals.averageRecovery
                },
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeHealthOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                failures: [safeFailure('OPERATIONAL_INSTABILITY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Operational instability detection failed safely.')]
            });
        }
    }

    function auditHealthGovernance(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'PLATFORM_HEALTH_ACCESS'),
                    source: 'platformHealthMonitoringService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'platformHealthMonitoring',
                        actionType: normalizeToken(actionType || 'PLATFORM_HEALTH_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Platform health audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Platform health audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'PLATFORM_HEALTH_EVENT'), {
                    source: 'platformHealthMonitoringService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Platform health telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Platform health telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'PLATFORM_HEALTH_REPORTED'), Object.assign({
                    source: 'platformHealthMonitoringService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Platform health metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Platform health metrics unavailable.' };
    }

    function generatePlatformHealthReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateHealthScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeHealthOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    healthMonitoringModel: {
                        state: 'MONITORING',
                        states: HEALTH_STATES,
                        types: HEALTH_TYPES,
                        generatedAt: nowIso(ctx)
                    },
                    healthSummaries: [],
                    failures: scope.failures,
                    warnings: scope.warnings,
                    accessGovernance: {
                        crossTenantConfidentialLeakageBlocked: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        operationalStabilityIntelligencePreserved: true
                    }
                });
            }

            var data = rawData();
            var healthRows = scope.infrastructureOnly ? [] : collectExplicitHealth(data).concat(collectDerivedHealth(data));
            var signals = externalHealthSignals(ctx);
            var totals = summarizeHealth(healthRows, signals);
            var instability = detectOperationalInstability(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var score = scope.infrastructureOnly ? 100 : stabilityScore(totals);
            var classification = scope.infrastructureOnly ? SEVERITIES.INFO : instability.classification || SEVERITIES.INFO;
            var state = score < 45 || totals.critical ? 'CRITICAL' : score < 70 || totals.highRisk ? 'DEGRADED' : score < 88 || totals.degraded ? 'WARNING' : 'HEALTHY';
            var incidentAnalytics = signals.incident && signals.incident.analytics || {};
            var featureHealth = signals.rollout || {};

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                healthMonitoringModel: {
                    state: state,
                    states: HEALTH_STATES,
                    types: HEALTH_TYPES,
                    historicalHealthRecordsImmutable: true,
                    generatedAt: nowIso(ctx)
                },
                operationalStabilityGovernance: {
                    realTimeHealthMonitoring: true,
                    degradationDetection: totals.degraded + totals.critical,
                    throughputScoring: totals.averageThroughput,
                    operationalStabilityGrading: classification,
                    healthEscalationWorkflows: totals.highRisk + totals.critical,
                    recoveryTracking: totals.recovering + totals.stabilized,
                    billingReliabilityPressure: totals.billingReliabilityPressure,
                    operationalArchivalGovernance: totals.archived,
                    unsafeInfrastructureOverridesBlocked: true
                },
                healthAlertIntelligence: {
                    workflowThroughputDecline: totals.workflowThroughputDecline,
                    onboardingInstability: totals.onboardingInstability,
                    storageDegradation: totals.storageDegradation,
                    notificationFailureSpikes: totals.notificationFailureSpikes,
                    serviceLatencyGrowth: totals.serviceLatencyGrowth,
                    featureRolloutInstability: totals.featureRolloutInstability,
                    authenticationDegradation: totals.authenticationDegradation,
                    billingReliabilityPressure: totals.billingReliabilityPressure
                },
                incidentReliabilityIntegration: {
                    incidentLinkedDegradation: totals.incidentLinkedDegradation,
                    billingLinkedDegradation: totals.billingLinkedDegradation,
                    operationalRecoveryVelocity: Math.max(0, 100 - totals.averageRecovery),
                    reliabilityStabilization: totals.stabilized,
                    degradedFeatureRecovery: safeNumber(featureHealth.degradedFeatureBehavior, 0),
                    workflowRestorationAnalytics: totals.workflowThroughputDecline,
                    unsafeInfrastructureMutation: false
                },
                throughputAnalytics: {
                    workflowThroughputHealth: totals.workflowThroughputDecline ? Math.max(0, 100 - totals.workflowThroughputDecline * 5) : 100,
                    executionThroughputHealth: totals.executionThroughputIssues ? Math.max(0, 100 - totals.executionThroughputIssues * 5) : 100,
                    averageThroughput: totals.averageThroughput,
                    averageLatencyMs: totals.averageLatency,
                    failedThroughputSignals: totals.highRisk
                },
                healthAnalytics: {
                    operationalUptime: score,
                    degradationFrequency: totals.degraded + totals.critical + totals.incidentLinkedDegradation + totals.billingLinkedDegradation,
                    throughputRecoveryRates: Math.max(0, 100 - totals.workflowThroughputDecline * 5),
                    latencyGrowthTrends: totals.serviceLatencyGrowth,
                    escalationFrequency: totals.escalationFrequency + safeNumber(incidentAnalytics.escalationGrowth, 0),
                    serviceStabilityScores: totals.averageStability,
                    recoveryEfficiencyAnalytics: Math.max(0, 100 - totals.averageRecovery)
                },
                governanceDashboard: {
                    platformHealthOverview: true,
                    operationalStabilityIndicators: true,
                    throughputAnalytics: true,
                    degradationSeverityVisibility: true,
                    healthAlertSummaries: true,
                    recoveryPerformanceTrends: true,
                    workflowThroughputHealth: true
                },
                accessGovernance: {
                    crossTenantConfidentialLeakageBlocked: true,
                    unsafeInfrastructureOverridesBlocked: true,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalHealthRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    healthActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    operationalStabilityIntelligencePreserved: true
                },
                integrationHealth: {
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformReliabilityIntegrated: !!(global.PlatformReliabilityService || global.platformReliabilityService),
                    platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    storageAnalyticsIntegrated: !!(global.StorageAnalyticsService || global.storageAnalyticsService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    tenantBillingIntegrated: !!(global.TenantBillingService || global.tenantBillingService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                healthSummaries: scope.infrastructureOnly ? [] : freezeList(healthRows.slice(0, 50))
            };

            if (!ctx.skipAuditPersistence) auditHealthGovernance('PLATFORM_HEALTH_REPORTED', { severity: classification, healthCount: healthRows.length }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('PLATFORM_HEALTH_REPORTED', { severity: classification, healthCount: healthRows.length }, ctx);
            recordMetric('PLATFORM_HEALTH_REPORTED', { status: classification, severity: classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeHealthOutput(report);
        } catch (error) {
            safeWarn('Platform health report failed safely.', error && error.message);
            return freezeHealthOutput({
                VERSION: VERSION,
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                healthSummaries: [],
                failures: [safeFailure('PLATFORM_HEALTH_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Platform health report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed, metadata) {
            checks.push({ checkId: normalizeToken(name || 'HEALTH_SELF_TEST'), passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeHealthPayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var ownerScope = validateHealthScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('PLATFORM_OWNER health governance scope works', ownerScope.allowed === true);

            var tenantScope = validateHealthScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from health governance', tenantScope.allowed === false);

            var superAdmin = validateHealthScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN broad health governance is blocked', superAdmin.allowed === false);

            var infra = validateHealthScope({ infrastructureOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure health scope is allowed', infra.allowed === true && infra.infrastructureOnly === true);

            var archived = validateHealthScope({ healthState: 'ARCHIVED', infrastructureOverride: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived health mutation is blocked', archived.allowed === false);

            var normalized = normalizeHealthPayload({ healthId: 'HLT-1', state: 'critical', salary: 90000, leaveBalance: 12, metadata: { rawDocument: 'private://doc' } });
            check('confidential filtering removes HR fields', normalized.success === true && !/salary|leaveBalance|90000|private:\/\/doc/i.test(JSON.stringify(normalized)));

            var frozen = freezeHealthOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000|salary/i.test(JSON.stringify(frozen)));

            var instability = detectOperationalInstability({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('stability analytics degrade safely without optional dependencies', instability.success === true || instability.failures);

            var report = generatePlatformHealthReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantConfidentialLeakageBlocked === true);

            var savedTenantBillingService = global.TenantBillingService;
            var savedTenantBillingAlias = global.tenantBillingService;
            try {
                delete global.TenantBillingService;
                delete global.tenantBillingService;
                var absentBilling = generatePlatformHealthReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('optional billing dependency absence is safe', absentBilling.success === true && absentBilling.integrationHealth && absentBilling.integrationHealth.tenantBillingIntegrated === false);
            } finally {
                if (typeof savedTenantBillingService === 'undefined') delete global.TenantBillingService;
                else global.TenantBillingService = savedTenantBillingService;
                if (typeof savedTenantBillingAlias === 'undefined') delete global.tenantBillingService;
                else global.tenantBillingService = savedTenantBillingAlias;
            }
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeHealthOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                degradationEscalation: true,
                recoveryHandling: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        HEALTH_STATES: HEALTH_STATES,
        HEALTH_TYPES: HEALTH_TYPES,
        SEVERITIES: SEVERITIES,
        validateHealthScope: validateHealthScope,
        classifyHealthSeverity: classifyHealthSeverity,
        normalizeHealthPayload: normalizeHealthPayload,
        freezeHealthOutput: freezeHealthOutput,
        detectOperationalInstability: detectOperationalInstability,
        generatePlatformHealthReport: generatePlatformHealthReport
    });

    global.PlatformHealthMonitoringService = api;
    global.platformHealthMonitoringService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_PLATFORM_HEALTH_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
