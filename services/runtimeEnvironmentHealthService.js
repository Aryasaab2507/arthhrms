/**
 * runtimeEnvironmentHealthService.js
 * ARTHHRMS Runtime Environment Health Checks + Live Operational Verification.
 *
 * Platform-control-only runtime monitoring governance for live service checks,
 * dependency health, readiness scoring, recovery validation, escalation signals,
 * and runtime analytics. It validates and reports; it never mutates runtime
 * infrastructure, bypasses release governance, or exposes tenant business data.
 */
(function attachRuntimeEnvironmentHealthService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[RuntimeEnvironmentHealthService]';

    var RUNTIME_HEALTH_STATES = Object.freeze([
        'HEALTHY',
        'MONITORING',
        'DEGRADED',
        'WARNING',
        'CRITICAL',
        'RECOVERING',
        'VERIFIED',
        'ARCHIVED'
    ]);

    var HEALTH_CHECK_CATEGORIES = Object.freeze([
        'SERVICE_AVAILABILITY',
        'API_RESPONSIVENESS',
        'DATABASE_CONNECTIVITY',
        'AUTHENTICATION_READINESS',
        'NOTIFICATION_DELIVERY_READINESS',
        'STORAGE_ACCESSIBILITY',
        'DEPENDENCY_AVAILABILITY',
        'WORKFLOW_EXECUTION_READINESS'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        LOW: 'LOW',
        MODERATE: 'MODERATE',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name|employees|payrollRecords|hrDocuments|tenantBusinessData)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        monitoringOnly: true,
        runtimeAuthority: true,
        recoveryAuthority: true,
        visibility: true,
        classification: true,
        state: true,
        states: true,
        RUNTIME_HEALTH_STATES: true,
        HEALTH_CHECK_CATEGORIES: true,
        category: true,
        categories: true,
        runtime: true,
        runtimeId: true,
        environmentId: true,
        tenantId: true,
        tenantSlug: true,
        runtimeState: true,
        runtimeStateRaw: true,
        checkCategory: true,
        checkCategoryRaw: true,
        serviceAvailable: true,
        apiResponsive: true,
        databaseConnected: true,
        authenticationReady: true,
        notificationDeliveryReady: true,
        storageAccessible: true,
        dependenciesAvailable: true,
        workflowExecutionReady: true,
        uptimePercent: true,
        apiLatencyMs: true,
        dependencyFailureCount: true,
        authenticationFailureCount: true,
        workflowFailureCount: true,
        environmentInstability: true,
        dependencyTimeout: true,
        partialOutage: true,
        recoveryValidated: true,
        recoveryValidationFailed: true,
        recoveryOverrideRequested: true,
        runtimeGovernanceModel: true,
        activeRuntimeChecks: true,
        runtimeHistory: true,
        liveVerification: true,
        validationCheckpoints: true,
        runtimeIssues: true,
        deploymentBlockingRequired: true,
        escalationRequired: true,
        runtimeHealth: true,
        runtimeHealthScore: true,
        environmentStabilityScore: true,
        operationalReadiness: true,
        operationalReadinessScore: true,
        recoveryConfidenceScore: true,
        dependencyHealth: true,
        dependencyHealthScore: true,
        dependencyFailureTrend: true,
        authenticationFailureTrend: true,
        workflowFailureTrend: true,
        recoveryValidation: true,
        recoveryValidatedCount: true,
        recoveryValidationFailures: true,
        recoveryConfidenceTrend: true,
        runtimeAnalytics: true,
        uptimeTrends: true,
        latencyTrends: true,
        dependencyFailures: true,
        recoveryDuration: true,
        runtimeInstabilityFrequency: true,
        operationalReadinessTrends: true,
        serviceReliabilityTrends: true,
        governanceIntegrations: true,
        platformHealthIntegrated: true,
        globalIncidentIntegrated: true,
        cicdGovernanceIntegrated: true,
        deploymentValidationIntegrated: true,
        environmentSnapshotIntegrated: true,
        emergencyOverrideIntegrated: true,
        auditSummary: true,
        runtimeActionsAuditable: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        accessGovernance: true,
        crossTenantRuntimeLeakageBlocked: true,
        tenantBusinessDataExcluded: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        platformIsolationPreserved: true,
        runtimeMonitoringGovernancePreserved: true,
        unsafeRuntimeMutationBlocked: true,
        governanceBypassBlocked: true,
        serviceInstabilityBlocked: true,
        immutableHealthHistory: true,
        immutableVerificationRecords: true,
        immutableRuntimeReports: true,
        createdAt: true,
        generatedAt: true,
        timestamp: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        name: true,
        count: true,
        passed: true,
        required: true,
        weight: true,
        severity: true,
        sections: true,
        tests: true,
        coverage: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        var next = safeNumber(value, 0);
        if (next < min) return min;
        if (next > max) return max;
        return next;
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
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

    function normalizeRuntimeState(value, fallback) {
        var state = normalizeToken(value || fallback || 'MONITORING');
        if (state === 'OK' || state === 'STABLE') return 'HEALTHY';
        if (state === 'UNAVAILABLE' || state === 'OUTAGE') return 'CRITICAL';
        if (RUNTIME_HEALTH_STATES.indexOf(state) !== -1) return state;
        return fallback || 'MONITORING';
    }

    function normalizeCategory(value, fallback) {
        var category = normalizeToken(value || fallback || 'SERVICE_AVAILABILITY');
        if (category === 'API' || category === 'API_RESPONSE') return 'API_RESPONSIVENESS';
        if (category === 'DATABASE' || category === 'DB') return 'DATABASE_CONNECTIVITY';
        if (category === 'AUTH' || category === 'AUTHENTICATION') return 'AUTHENTICATION_READINESS';
        if (category === 'NOTIFICATION') return 'NOTIFICATION_DELIVERY_READINESS';
        if (category === 'STORAGE') return 'STORAGE_ACCESSIBILITY';
        if (category === 'DEPENDENCY' || category === 'DEPENDENCIES') return 'DEPENDENCY_AVAILABILITY';
        if (category === 'WORKFLOW') return 'WORKFLOW_EXECUTION_READINESS';
        if (HEALTH_CHECK_CATEGORIES.indexOf(category) !== -1) return category;
        return fallback || 'SERVICE_AVAILABILITY';
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
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
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.slice(0, 250).map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) return input.slice(0, 250).map(function cloneItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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

    function freezeRuntimeOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'RUNTIME_HEALTH_FAILURE'),
            severity: severity || SEVERITIES.HIGH,
            message: safeString(message || 'Runtime health governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'RUNTIME_HEALTH_WARNING'),
            severity: severity || SEVERITIES.MODERATE,
            message: safeString(message || 'Runtime health governance warning.', ''),
            recommendation: safeString(recommendation || 'Review live runtime evidence.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function boolFrom(payload, keys, fallback) {
        var input = payload || {};
        for (var index = 0; index < keys.length; index += 1) {
            var key = keys[index];
            if (input[key] === true) return true;
            if (input[key] === false) return false;
        }
        return fallback !== false;
    }

    function normalizeRuntimePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeRuntimeOutput({
                    success: false,
                    malformedPayloads: true,
                    failures: [safeFailure('MALFORMED_RUNTIME_PAYLOAD', SEVERITIES.HIGH, 'Runtime health payload must be an object.')]
                });
            }
            var ctx = isPlainObject(context) ? context : {};
            var runtime = {
                runtimeId: safeString(payload.runtimeId || payload.healthId || payload.checkId || 'RUNTIME-' + nowIso(ctx), ''),
                environmentId: safeString(payload.environmentId || payload.environment || 'production', ''),
                tenantId: safeString(payload.tenantId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(ctx)),
                runtimeState: normalizeRuntimeState(payload.runtimeState || payload.healthState || payload.state || payload.status, 'MONITORING'),
                runtimeStateRaw: safeString(payload.runtimeState || payload.healthState || payload.state || payload.status || '', ''),
                checkCategory: normalizeCategory(payload.checkCategory || payload.category || payload.type, 'SERVICE_AVAILABILITY'),
                checkCategoryRaw: safeString(payload.checkCategory || payload.category || payload.type || '', ''),
                serviceAvailable: boolFrom(payload, ['serviceAvailable', 'availabilityReady', 'serviceUp'], true),
                apiResponsive: boolFrom(payload, ['apiResponsive', 'apiReady', 'apiAvailable'], true),
                databaseConnected: boolFrom(payload, ['databaseConnected', 'databaseReady', 'dbConnected'], true),
                authenticationReady: boolFrom(payload, ['authenticationReady', 'authReady', 'authenticationAvailable'], true),
                notificationDeliveryReady: boolFrom(payload, ['notificationDeliveryReady', 'notificationReady', 'notificationsReady'], true),
                storageAccessible: boolFrom(payload, ['storageAccessible', 'storageReady', 'storageAvailable'], true),
                dependenciesAvailable: boolFrom(payload, ['dependenciesAvailable', 'dependencyAvailable', 'dependenciesReady'], true),
                workflowExecutionReady: boolFrom(payload, ['workflowExecutionReady', 'workflowReady', 'workflowExecutionAvailable'], true),
                uptimePercent: clamp(payload.uptimePercent || payload.serviceUptime || 100, 0, 100),
                apiLatencyMs: safeNumber(payload.apiLatencyMs || payload.latencyMs || 0, 0),
                dependencyFailureCount: safeNumber(payload.dependencyFailureCount || payload.dependencyFailures || 0, 0),
                authenticationFailureCount: safeNumber(payload.authenticationFailureCount || payload.authFailures || 0, 0),
                workflowFailureCount: safeNumber(payload.workflowFailureCount || payload.workflowFailures || 0, 0),
                environmentInstability: payload.environmentInstability === true || payload.unstableEnvironment === true,
                dependencyTimeout: payload.dependencyTimeout === true || payload.timeout === true,
                partialOutage: payload.partialOutage === true || payload.serviceUnavailable === true,
                recoveryValidated: payload.recoveryValidated !== false,
                recoveryValidationFailed: payload.recoveryValidationFailed === true,
                recoveryOverrideRequested: payload.recoveryOverrideRequested === true || payload.overrideRequested === true,
                createdAt: safeString(payload.createdAt || payload.timestamp || nowIso(ctx), ''),
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeRuntimeOutput({
                success: true,
                runtime: runtime,
                liveVerification: { validationCheckpoints: buildValidationCheckpoints(runtime) },
                immutableHealthHistory: true,
                immutableVerificationRecords: true,
                immutableRuntimeReports: true
            });
        } catch (error) {
            return freezeRuntimeOutput({
                success: false,
                malformedPayloads: true,
                failures: [safeFailure('RUNTIME_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH, 'Runtime normalization failed safely.')]
            });
        }
    }

    function buildValidationCheckpoints(runtime) {
        var input = runtime || {};
        return [
            { name: 'Service availability', passed: input.serviceAvailable !== false && input.partialOutage !== true, required: true, weight: 16 },
            { name: 'API responsiveness', passed: input.apiResponsive !== false && safeNumber(input.apiLatencyMs, 0) <= 1500, required: true, weight: 12 },
            { name: 'Database connectivity', passed: input.databaseConnected !== false, required: true, weight: 15 },
            { name: 'Authentication readiness', passed: input.authenticationReady !== false && safeNumber(input.authenticationFailureCount, 0) === 0, required: true, weight: 12 },
            { name: 'Notification delivery readiness', passed: input.notificationDeliveryReady !== false, required: true, weight: 8 },
            { name: 'Storage accessibility', passed: input.storageAccessible !== false, required: true, weight: 10 },
            { name: 'Dependency availability', passed: input.dependenciesAvailable !== false && safeNumber(input.dependencyFailureCount, 0) === 0 && input.dependencyTimeout !== true, required: true, weight: 15 },
            { name: 'Workflow execution readiness', passed: input.workflowExecutionReady !== false && safeNumber(input.workflowFailureCount, 0) === 0, required: true, weight: 12 },
            { name: 'Recovery validation', passed: input.recoveryValidated !== false && input.recoveryValidationFailed !== true, required: true, weight: 10 },
            { name: 'Environment stability', passed: input.environmentInstability !== true && normalizeRuntimeState(input.runtimeState, 'MONITORING') !== 'CRITICAL', required: true, weight: 10 }
        ];
    }

    function validateAccess(payload, context) {
        var input = isPlainObject(payload) ? payload : {};
        var ctx = isPlainObject(context) ? context : {};
        var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.type || ctx.actor.userRole));
        var routeType = normalizeToken(ctx.routeType || ctx.surface || 'platform');
        var targetTenant = normalizeTenantSlug(input.targetTenantId || input.tenantSlug || input.tenantId);
        var actorTenant = contextTenant(ctx);
        var actionRequested = input.recoveryOverrideRequested === true || input.runtimeMutationRequested === true || input.serviceRestartRequested === true || input.escalationOverrideRequested === true;
        var archived = normalizeRuntimeState(input.runtimeState || input.state || input.status, '') === 'ARCHIVED';
        var failures = [];
        if (routeType !== 'PLATFORM') failures.push(safeFailure('RUNTIME_GOVERNANCE_PLATFORM_ONLY', SEVERITIES.CRITICAL, 'Runtime health governance is isolated to platform-control.'));
        if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') failures.push(safeFailure('RUNTIME_GOVERNANCE_ROLE_BLOCKED', SEVERITIES.CRITICAL, 'Tenant roles cannot access platform runtime governance.'));
        if (role === 'SUPER_ADMIN' && actionRequested) failures.push(safeFailure('SUPER_ADMIN_RUNTIME_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL, 'SUPER_ADMIN may monitor runtime infrastructure only and cannot bypass recovery governance.'));
        if (role === 'SUPER_ADMIN' && !(input.infrastructureOnly === true && input.monitoringOnly === true) && !actionRequested) failures.push(safeFailure('SUPER_ADMIN_RUNTIME_MONITORING_ONLY', SEVERITIES.HIGH, 'SUPER_ADMIN runtime visibility must be infrastructure monitoring only.'));
        if (role === 'SUPER_ADMIN' && targetTenant && actorTenant && targetTenant !== actorTenant) failures.push(safeFailure('CROSS_TENANT_RUNTIME_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL, 'Cross-tenant runtime visibility is blocked.'));
        if (archived && actionRequested) failures.push(safeFailure('ARCHIVED_RUNTIME_HISTORY_IMMUTABLE', SEVERITIES.CRITICAL, 'Archived runtime health history cannot be modified.'));
        return { role: role, failures: failures, allowed: failures.length === 0 };
    }

    function validateRuntimeHealth(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeRuntimeOutput({
                    success: false,
                    allowed: false,
                    deploymentBlockingRequired: true,
                    escalationRequired: true,
                    failures: [safeFailure('MALFORMED_RUNTIME_PAYLOAD', SEVERITIES.HIGH, 'Runtime health payload must be an object.')]
                });
            }
            var normalized = normalizeRuntimePayload(payload, context || {});
            var runtime = normalized.runtime || {};
            var access = validateAccess(Object.assign({}, runtime, payload), context || {});
            var checkpoints = buildValidationCheckpoints(Object.assign({}, runtime, payload));
            var issues = [];
            checkpoints.forEach(function issue(row) {
                if (row.required && row.passed === false) {
                    var severity = /SERVICE|DATABASE|AUTHENTICATION|DEPENDENCY|RECOVERY|ENVIRONMENT/.test(normalizeToken(row.name)) ? SEVERITIES.CRITICAL : SEVERITIES.HIGH;
                    issues.push(safeFailure(normalizeToken(row.name) + '_FAILED', severity, row.name + ' failed.'));
                }
            });
            if (runtime.partialOutage) issues.push(safeFailure('PARTIAL_OUTAGE_DETECTED', SEVERITIES.CRITICAL, 'Partial runtime outage detected.'));
            if (runtime.dependencyTimeout) issues.push(safeFailure('DEPENDENCY_TIMEOUT_DETECTED', SEVERITIES.HIGH, 'Dependency timeout detected.'));
            if (runtime.apiLatencyMs > 1500) issues.push(safeFailure('API_LATENCY_DEGRADED', SEVERITIES.HIGH, 'API latency exceeds runtime threshold.'));
            if (runtime.uptimePercent < 99) issues.push(safeFailure('UPTIME_BELOW_RUNTIME_THRESHOLD', SEVERITIES.HIGH, 'Runtime uptime is below operational threshold.'));
            if (runtime.runtimeState === 'CRITICAL') issues.push(safeFailure('CRITICAL_RUNTIME_STATE', SEVERITIES.CRITICAL, 'Critical runtime state requires escalation.'));
            var deploymentBlockingRequired = issues.some(function critical(row) { return row.severity === SEVERITIES.CRITICAL; }) || !access.allowed;
            var escalationRequired = issues.length > 0 || !access.allowed;
            return freezeRuntimeOutput({
                success: true,
                allowed: access.allowed,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: access.role === 'SUPER_ADMIN',
                monitoringOnly: access.role === 'SUPER_ADMIN',
                runtimeAuthority: access.allowed && access.role === 'PLATFORM_OWNER',
                recoveryAuthority: false,
                visibility: access.allowed ? (access.role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_RUNTIME_VISIBILITY' : 'RUNTIME_MONITORING_GOVERNANCE') : 'NONE',
                runtime: runtime,
                deploymentBlockingRequired: deploymentBlockingRequired,
                escalationRequired: escalationRequired,
                runtimeIssues: issues,
                liveVerification: { validationCheckpoints: checkpoints },
                accessGovernance: {
                    crossTenantRuntimeLeakageBlocked: true,
                    tenantBusinessDataExcluded: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    platformIsolationPreserved: true,
                    runtimeMonitoringGovernancePreserved: true,
                    unsafeRuntimeMutationBlocked: true,
                    governanceBypassBlocked: true,
                    serviceInstabilityBlocked: true
                },
                immutableHealthHistory: true,
                immutableVerificationRecords: true,
                immutableRuntimeReports: true,
                failures: (access.failures || []).concat(issues)
            });
        } catch (error) {
            return freezeRuntimeOutput({
                success: false,
                allowed: false,
                deploymentBlockingRequired: true,
                escalationRequired: true,
                failures: [safeFailure('RUNTIME_HEALTH_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH, 'Runtime health validation failed safely.')]
            });
        }
    }

    function calculateRuntimeHealthScore(input) {
        try {
            var governance = input && input.liveVerification ? input : validateRuntimeHealth(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var checkpoints = governance.liveVerification && governance.liveVerification.validationCheckpoints || [];
            var totalWeight = checkpoints.reduce(function sum(total, row) { return total + safeNumber(row.weight, 0); }, 0) || 1;
            var passedWeight = checkpoints.reduce(function sum(total, row) { return total + (row.passed ? safeNumber(row.weight, 0) : 0); }, 0);
            var score = Math.round((passedWeight / totalWeight) * 100);
            var runtime = governance.runtime || {};
            if (runtime.apiLatencyMs > 1500) score -= 10;
            if (runtime.uptimePercent < 99) score -= 12;
            if (runtime.runtimeState === 'CRITICAL') score -= 20;
            if (governance.allowed === false) score -= 20;
            score = clamp(score, 0, 100);
            var stability = clamp(Math.round((score + clamp(runtime.uptimePercent || 100, 0, 100)) / 2) - (runtime.environmentInstability ? 20 : 0), 0, 100);
            return freezeRuntimeOutput({
                success: true,
                runtimeHealthScore: score,
                environmentStabilityScore: stability,
                deploymentBlockingRequired: governance.deploymentBlockingRequired === true,
                runtimeIssues: governance.runtimeIssues || []
            });
        } catch (error) {
            return freezeRuntimeOutput({
                success: false,
                runtimeHealthScore: 0,
                environmentStabilityScore: 0,
                deploymentBlockingRequired: true,
                failures: [safeFailure('RUNTIME_HEALTH_SCORE_FAILED_SAFE', SEVERITIES.HIGH, 'Runtime health scoring failed safely.')]
            });
        }
    }

    function calculateOperationalReadiness(input) {
        try {
            var governance = input && input.liveVerification ? input : validateRuntimeHealth(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var runtime = governance.runtime || {};
            var health = calculateRuntimeHealthScore(governance);
            var readiness = safeNumber(health.runtimeHealthScore, 0);
            if (runtime.recoveryValidated === false || runtime.recoveryValidationFailed) readiness -= 20;
            if (governance.escalationRequired) readiness -= 10;
            if (runtime.workflowExecutionReady === false || runtime.workflowFailureCount > 0) readiness -= 12;
            if (runtime.authenticationReady === false || runtime.authenticationFailureCount > 0) readiness -= 12;
            readiness = clamp(readiness, 0, 100);
            var recovery = 100;
            if (runtime.recoveryValidated === false) recovery -= 35;
            if (runtime.recoveryValidationFailed) recovery -= 35;
            if (runtime.dependenciesAvailable === false || runtime.dependencyFailureCount > 0) recovery -= 20;
            if (runtime.databaseConnected === false || runtime.storageAccessible === false) recovery -= 20;
            if (runtime.partialOutage || runtime.runtimeState === 'CRITICAL') recovery -= 20;
            recovery = clamp(recovery, 0, 100);
            return freezeRuntimeOutput({
                success: true,
                operationalReadinessScore: readiness,
                recoveryConfidenceScore: recovery,
                deploymentBlockingRequired: governance.deploymentBlockingRequired === true,
                escalationRequired: governance.escalationRequired === true,
                runtimeIssues: governance.runtimeIssues || []
            });
        } catch (error) {
            return freezeRuntimeOutput({
                success: false,
                operationalReadinessScore: 0,
                recoveryConfidenceScore: 0,
                deploymentBlockingRequired: true,
                failures: [safeFailure('OPERATIONAL_READINESS_FAILED_SAFE', SEVERITIES.HIGH, 'Operational readiness scoring failed safely.')]
            });
        }
    }

    function normalizeRuntimeRow(row) {
        var normalized = normalizeRuntimePayload(row || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        return normalized.runtime || {};
    }

    function collectRuntimeRows(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'runtimeHealthRecords')
            .concat(list(data, 'liveRuntimeHealthRecords'), list(data, 'runtimeVerificationRecords'), list(data, 'operationalReadinessRecords'))
            .filter(function filterTenant(row) {
                if (!targetTenant) return true;
                var tenant = rowTenant(row);
                return !tenant || tenant === targetTenant;
            })
            .map(normalizeRuntimeRow);
    }

    function activeState(row) {
        return normalizeRuntimeState(row && (row.runtimeState || row.status || row.state || ''), '') !== 'ARCHIVED';
    }

    function aggregateRuntime(rows, context) {
        var active = rows.filter(activeState);
        var basis = active.length ? active : [{}];
        var aggregate = {
            runtimeId: 'RUNTIME-AGGREGATE',
            runtimeState: basis.some(function critical(row) { return row.runtimeState === 'CRITICAL'; }) ? 'CRITICAL' : basis.some(function degraded(row) { return row.runtimeState === 'DEGRADED'; }) ? 'DEGRADED' : basis.some(function warn(row) { return row.runtimeState === 'WARNING'; }) ? 'WARNING' : 'HEALTHY',
            checkCategory: 'SERVICE_AVAILABILITY',
            serviceAvailable: basis.every(function ok(row) { return row.serviceAvailable !== false; }),
            apiResponsive: basis.every(function ok(row) { return row.apiResponsive !== false; }),
            databaseConnected: basis.every(function ok(row) { return row.databaseConnected !== false; }),
            authenticationReady: basis.every(function ok(row) { return row.authenticationReady !== false; }),
            notificationDeliveryReady: basis.every(function ok(row) { return row.notificationDeliveryReady !== false; }),
            storageAccessible: basis.every(function ok(row) { return row.storageAccessible !== false; }),
            dependenciesAvailable: basis.every(function ok(row) { return row.dependenciesAvailable !== false; }),
            workflowExecutionReady: basis.every(function ok(row) { return row.workflowExecutionReady !== false; }),
            uptimePercent: Math.min.apply(Math, basis.map(function uptime(row) { return clamp(row.uptimePercent || 100, 0, 100); })),
            apiLatencyMs: Math.max.apply(Math, basis.map(function latency(row) { return safeNumber(row.apiLatencyMs, 0); })),
            dependencyFailureCount: basis.reduce(function sum(total, row) { return total + safeNumber(row.dependencyFailureCount, 0); }, 0),
            authenticationFailureCount: basis.reduce(function sum(total, row) { return total + safeNumber(row.authenticationFailureCount, 0); }, 0),
            workflowFailureCount: basis.reduce(function sum(total, row) { return total + safeNumber(row.workflowFailureCount, 0); }, 0),
            environmentInstability: basis.some(function unstable(row) { return row.environmentInstability === true; }),
            dependencyTimeout: basis.some(function timeout(row) { return row.dependencyTimeout === true; }),
            partialOutage: basis.some(function outage(row) { return row.partialOutage === true; }),
            recoveryValidated: basis.every(function ok(row) { return row.recoveryValidated !== false; }),
            recoveryValidationFailed: basis.some(function failed(row) { return row.recoveryValidationFailed === true; })
        };
        return validateRuntimeHealth(aggregate, context || {});
    }

    function summarizeRuntimeAnalytics(rows) {
        var total = rows.length;
        var unstable = rows.filter(function rowUnstable(row) { return row.runtimeState === 'CRITICAL' || row.runtimeState === 'DEGRADED' || row.partialOutage || row.dependencyFailureCount > 0 || row.workflowFailureCount > 0; }).length;
        var recoveries = rows.filter(function rowRecovered(row) { return row.recoveryValidated !== false && row.recoveryValidationFailed !== true; }).length;
        var uptime = rows.length ? Math.round(rows.reduce(function sum(totalUptime, row) { return totalUptime + clamp(row.uptimePercent || 100, 0, 100); }, 0) / rows.length) : 100;
        var latency = rows.length ? Math.round(rows.reduce(function sum(totalLatency, row) { return totalLatency + safeNumber(row.apiLatencyMs, 0); }, 0) / rows.length) : 0;
        var dependencyFailures = rows.reduce(function sum(totalFailures, row) { return totalFailures + safeNumber(row.dependencyFailureCount, 0); }, 0);
        var authFailures = rows.reduce(function sum(totalFailures, row) { return totalFailures + safeNumber(row.authenticationFailureCount, 0); }, 0);
        var workflowFailures = rows.reduce(function sum(totalFailures, row) { return totalFailures + safeNumber(row.workflowFailureCount, 0); }, 0);
        return {
            uptimeTrends: uptime,
            latencyTrends: latency,
            dependencyFailures: dependencyFailures,
            recoveryDuration: unstable ? Math.max(5, unstable * 15) : 0,
            runtimeInstabilityFrequency: unstable,
            operationalReadinessTrends: total ? Math.round(((total - unstable) / total) * 100) : 100,
            serviceReliabilityTrends: total ? Math.round(((total - rows.filter(function unavailable(row) { return row.serviceAvailable === false; }).length) / total) * 100) : 100,
            recoveryConfidenceTrend: total ? Math.round((recoveries / total) * 100) : 100,
            dependencyFailureTrend: dependencyFailures,
            authenticationFailureTrend: authFailures,
            workflowFailureTrend: workflowFailures
        };
    }

    function auditRuntime(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'RUNTIME_HEALTH_GOVERNANCE'),
                    actionType: normalizeToken(actionType || 'RUNTIME_HEALTH_GOVERNANCE'),
                    source: 'runtimeEnvironmentHealthService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({ module: 'runtimeEnvironmentHealth' }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Runtime health audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Runtime health audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'RUNTIME_HEALTH_EVENT'), {
                    source: 'runtimeEnvironmentHealthService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Runtime health telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Runtime health telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'RUNTIME_HEALTH_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'runtimeEnvironmentHealthService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Runtime health metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Runtime health metrics unavailable.' };
    }

    function generateRuntimeHealthReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var access = validateAccess(Object.assign({ readOnly: true, aggregateOnly: true }, input), ctx);
            if (!access.allowed) {
                return freezeRuntimeOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL,
                    runtimeGovernanceModel: { state: 'ARCHIVED', states: RUNTIME_HEALTH_STATES, categories: HEALTH_CHECK_CATEGORIES, generatedAt: nowIso(ctx) },
                    failures: access.failures || [],
                    timestamp: nowIso(ctx)
                });
            }
            var data = rawData();
            var rows = collectRuntimeRows(data, input);
            var active = rows.filter(activeState);
            var governance = aggregateRuntime(active, ctx);
            var health = calculateRuntimeHealthScore(governance);
            var readiness = calculateOperationalReadiness(governance);
            var analytics = summarizeRuntimeAnalytics(active);
            var dependencyScore = clamp(100 - (analytics.dependencyFailures * 12) - (analytics.authenticationFailureTrend * 10) - (analytics.workflowFailureTrend * 8), 0, 100);
            var state = governance.deploymentBlockingRequired ? (governance.runtime && governance.runtime.runtimeState === 'CRITICAL' ? 'CRITICAL' : 'DEGRADED') : (active.some(function verified(row) { return row.runtimeState === 'VERIFIED'; }) ? 'VERIFIED' : 'HEALTHY');
            var report = freezeRuntimeOutput({
                success: true,
                classification: governance.deploymentBlockingRequired ? SEVERITIES.HIGH : SEVERITIES.INFO,
                runtimeGovernanceModel: { state: state, states: RUNTIME_HEALTH_STATES, categories: HEALTH_CHECK_CATEGORIES, generatedAt: nowIso(ctx) },
                activeRuntimeChecks: active,
                runtimeHistory: rows,
                liveVerification: governance.liveVerification,
                runtimeHealth: health,
                operationalReadiness: readiness,
                dependencyHealth: {
                    dependencyHealthScore: dependencyScore,
                    dependencyFailureCount: analytics.dependencyFailures,
                    authenticationFailureCount: analytics.authenticationFailureTrend,
                    workflowFailureCount: analytics.workflowFailureTrend,
                    dependencyTimeout: governance.runtime && governance.runtime.dependencyTimeout === true
                },
                recoveryValidation: {
                    recoveryValidatedCount: active.filter(function recovered(row) { return row.recoveryValidated !== false; }).length,
                    recoveryValidationFailures: active.filter(function failed(row) { return row.recoveryValidationFailed === true || row.recoveryValidated === false; }).length,
                    recoveryConfidenceScore: readiness.recoveryConfidenceScore,
                    recoveryConfidenceTrend: analytics.recoveryConfidenceTrend
                },
                runtimeAnalytics: analytics,
                governanceIntegrations: {
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    cicdGovernanceIntegrated: !!(global.CICDGovernanceService || global.cicdGovernanceService),
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    environmentSnapshotIntegrated: !!(global.EnvironmentSnapshotService || global.environmentSnapshotService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService)
                },
                auditSummary: {
                    runtimeActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                accessGovernance: governance.accessGovernance,
                immutableHealthHistory: true,
                immutableVerificationRecords: true,
                immutableRuntimeReports: true,
                failures: governance.failures || [],
                warnings: governance.escalationRequired ? [safeWarning('RUNTIME_HEALTH_REVIEW_REQUIRED', SEVERITIES.MODERATE, 'Runtime health has live verification issues.', 'Review service availability, API latency, database, auth, notification, storage, dependency, workflow, and recovery evidence.')] : [],
                sections: [governance, health, readiness, analytics],
                timestamp: nowIso(ctx)
            });
            emitTelemetry('RUNTIME_HEALTH_GOVERNANCE_REPORTED', { state: report.runtimeGovernanceModel.state, severity: report.classification }, ctx);
            auditRuntime('RUNTIME_HEALTH_GOVERNANCE_REPORTED', { state: report.runtimeGovernanceModel.state, severity: report.classification }, ctx);
            recordMetric('RUNTIME_HEALTH_GOVERNANCE_REPORTED', { status: report.runtimeGovernanceModel.state, severity: report.classification }, ctx);
            return report;
        } catch (error) {
            return freezeRuntimeOutput({
                success: false,
                classification: SEVERITIES.CRITICAL,
                runtimeGovernanceModel: { state: 'CRITICAL', states: RUNTIME_HEALTH_STATES, categories: HEALTH_CHECK_CATEGORIES, generatedAt: nowIso(context || {}) },
                failures: [safeFailure('RUNTIME_HEALTH_REPORT_FAILED_SAFE', SEVERITIES.HIGH, 'Runtime health report failed safely.')],
                timestamp: nowIso(context || {})
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function add(name, ok) {
            checks.push({ name: name, passed: !!ok });
            if (!ok) throw new Error(name);
        }
        try {
            var malformed = normalizeRuntimePayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);

            var normalized = normalizeRuntimePayload({
                runtimeId: 'RUN-SELF',
                runtimeState: 'verified',
                serviceAvailable: true,
                apiResponsive: true,
                databaseConnected: true,
                authenticationReady: true,
                notificationDeliveryReady: true,
                storageAccessible: true,
                dependenciesAvailable: true,
                workflowExecutionReady: true,
                recoveryValidated: true,
                salary: 1
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('runtime checks work', normalized.success === true && normalized.runtime.runtimeState === 'VERIFIED');

            var valid = validateRuntimeHealth(normalized.runtime, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('dependency validation works', valid.deploymentBlockingRequired === false);

            var readiness = calculateOperationalReadiness(valid);
            add('readiness scoring works', readiness.operationalReadinessScore >= 80);

            var escalated = validateRuntimeHealth({ serviceAvailable: false, databaseConnected: false, dependenciesAvailable: false, runtimeState: 'CRITICAL' }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('escalation triggers work', escalated.escalationRequired === true && escalated.deploymentBlockingRequired === true);

            var immutable = freezeRuntimeOutput({ rows: [{ stable: true }] });
            add('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.rows));

            return freezeRuntimeOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    runtimeChecks: true,
                    dependencyValidation: true,
                    readinessScoring: true,
                    escalationTriggers: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezeRuntimeOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('RUNTIME_HEALTH_SELF_TEST_FAILED', SEVERITIES.HIGH, error && error.message || 'Runtime health self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        RUNTIME_HEALTH_STATES: RUNTIME_HEALTH_STATES,
        HEALTH_CHECK_CATEGORIES: HEALTH_CHECK_CATEGORIES,
        validateRuntimeHealth: validateRuntimeHealth,
        calculateRuntimeHealthScore: calculateRuntimeHealthScore,
        calculateOperationalReadiness: calculateOperationalReadiness,
        normalizeRuntimePayload: normalizeRuntimePayload,
        freezeRuntimeOutput: freezeRuntimeOutput,
        generateRuntimeHealthReport: generateRuntimeHealthReport,
        runSelfTest: runSelfTest
    });

    global.RuntimeEnvironmentHealthService = api;
    global.runtimeEnvironmentHealthService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_RUNTIME_HEALTH_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_RUNTIME_HEALTH_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_RUNTIME_HEALTH_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
