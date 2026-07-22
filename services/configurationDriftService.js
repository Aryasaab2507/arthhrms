/**
 * configurationDriftService.js
 * ARTHHRMS Enterprise Configuration Drift + Environment Consistency Governance.
 *
 * Platform-control-only configuration intelligence for environment variable,
 * feature flag, deployment setting, RBAC, tenant isolation, workflow,
 * notification, and service dependency drift. It validates and reports; it
 * never mutates environment configuration or exposes confidential tenant data.
 */
(function attachConfigurationDriftService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ConfigurationDriftService]';

    var DRIFT_STATES = Object.freeze([
        'CONSISTENT',
        'MONITORING',
        'DRIFT_DETECTED',
        'WARNING',
        'HIGH_RISK',
        'REMEDIATING',
        'RESOLVED',
        'ARCHIVED'
    ]);

    var DRIFT_SEVERITIES = Object.freeze([
        'LOW',
        'MODERATE',
        'HIGH',
        'CRITICAL'
    ]);

    var DRIFT_CATEGORIES = Object.freeze([
        Object.freeze({ key: 'env', category: 'ENVIRONMENT_VARIABLES', label: 'Environment variables', weight: 12 }),
        Object.freeze({ key: 'featureFlags', category: 'FEATURE_FLAGS', label: 'Feature flags', weight: 10 }),
        Object.freeze({ key: 'deploymentSettings', category: 'DEPLOYMENT_SETTINGS', label: 'Deployment settings', weight: 12 }),
        Object.freeze({ key: 'rbac', category: 'RBAC_CONFIGURATION', label: 'RBAC configuration', weight: 18 }),
        Object.freeze({ key: 'tenantIsolation', category: 'TENANT_ISOLATION_CONFIGURATION', label: 'Tenant isolation configuration', weight: 22 }),
        Object.freeze({ key: 'workflowSettings', category: 'WORKFLOW_SETTINGS', label: 'Workflow settings', weight: 8 }),
        Object.freeze({ key: 'notificationSettings', category: 'NOTIFICATION_SETTINGS', label: 'Notification settings', weight: 6 }),
        Object.freeze({ key: 'serviceDependencies', category: 'SERVICE_DEPENDENCY_CONFIGURATION', label: 'Service dependencies', weight: 14 })
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        monitoringOnly: true,
        configurationAuthority: true,
        configurationMutationAuthority: true,
        visibility: true,
        payload: true,
        metadata: true,
        configurationId: true,
        configId: true,
        driftId: true,
        baselineId: true,
        releaseId: true,
        tenantId: true,
        tenantSlug: true,
        environment: true,
        sourceEnvironment: true,
        targetEnvironment: true,
        driftState: true,
        driftStateRaw: true,
        state: true,
        states: true,
        severity: true,
        severities: true,
        category: true,
        categories: true,
        label: true,
        key: true,
        baselineValue: true,
        activeValue: true,
        releaseValue: true,
        valueFingerprint: true,
        count: true,
        counts: true,
        driftCount: true,
        driftDetected: true,
        driftItems: true,
        activeDriftAlerts: true,
        driftDetection: true,
        driftGovernanceModel: true,
        environmentConsistency: true,
        consistencyScore: true,
        environmentConsistent: true,
        driftRiskScore: true,
        remediationPriorityScore: true,
        consistencyTrend: true,
        remediationGovernance: true,
        remediationRequired: true,
        remediationStatus: true,
        remediationPriority: true,
        remediationWorkflows: true,
        remediationApprovalsRequired: true,
        undisclosedConfigurationChangesBlocked: true,
        unsafeEnvironmentMutationBlocked: true,
        deploymentDriftBlocking: true,
        promotionValidationSupported: true,
        rollbackVerificationSupported: true,
        governanceIntegrations: true,
        auditSummary: true,
        configurationActionsAuditable: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        driftAnalytics: true,
        driftFrequency: true,
        driftSeverityTrends: true,
        remediationTimes: true,
        environmentConsistencyTrends: true,
        deploymentDriftIncidents: true,
        recurringConfigurationIssues: true,
        configurationStabilityScore: true,
        configurationHistory: true,
        baselineRecords: true,
        immutableDriftHistory: true,
        immutableConfigurationReports: true,
        immutableBaselineRecords: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        accessGovernance: true,
        tenantIsolationPreserved: true,
        crossTenantConfigurationLeakageBlocked: true,
        platformOwnerIsolatedFromTenantRbac: true,
        superAdminConfigurationAuthority: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        sections: true,
        generatedAt: true,
        timestamp: true,
        coverage: true,
        tests: true,
        name: true,
        passed: true
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

    function normalizeEnvironment(value, fallback) {
        var env = normalizeToken(value || fallback || 'PRODUCTION');
        if (env === 'PROD' || env === 'FULL_PRODUCTION' || env === 'LIMITED_PRODUCTION') return 'PRODUCTION';
        if (env === 'STAGE') return 'STAGING';
        if (env === 'DEV') return 'DEVELOPMENT';
        return env || 'PRODUCTION';
    }

    function normalizeDriftState(value, fallback) {
        var state = normalizeToken(value || fallback || 'MONITORING');
        if (state === 'DETECTED') return 'DRIFT_DETECTED';
        if (state === 'CRITICAL' || state === 'HIGH') return 'HIGH_RISK';
        if (state === 'LOW' || state === 'OK') return 'CONSISTENT';
        if (DRIFT_STATES.indexOf(state) !== -1) return state;
        return fallback || 'MONITORING';
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
        if (Array.isArray(value)) {
            return value.slice(0, 250).map(function sanitizeItem(item) { return sanitizedValue(item, key, (seen || []).slice()); }).filter(function keep(item) { return typeof item !== 'undefined'; });
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
            return input.slice(0, 250).map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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

    function freezeConfigurationOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'CONFIGURATION_DRIFT_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Configuration drift governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'CONFIGURATION_DRIFT_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'Configuration drift governance warning.', ''),
            recommendation: safeString(recommendation || 'Review configuration governance evidence.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.company_id || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function validateConfigurationScope(payload, context) {
        try {
            var input = isPlainObject(payload) ? payload : {};
            var ctx = isPlainObject(context) ? context : {};
            var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.type || ctx.actor.userRole));
            var routeType = normalizeToken(ctx.routeType || ctx.surface || 'platform');
            var targetTenant = normalizeTenantSlug(input.targetTenantId || input.tenantSlug || input.tenantId);
            var actorTenant = contextTenant(ctx);
            var archived = normalizeDriftState(input.driftState || input.state || input.status, '') === 'ARCHIVED';
            var remediationRequested = input.remediationRequested === true || input.approvalRequested === true || input.baselineUpdateRequested === true || input.configurationMutationRequested === true;
            var failures = [];

            if (routeType !== 'PLATFORM') failures.push(safeFailure('CONFIGURATION_GOVERNANCE_PLATFORM_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'Configuration drift governance is isolated to platform-control.'));
            if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') failures.push(safeFailure('CONFIGURATION_GOVERNANCE_ROLE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access configuration drift governance.'));
            if (role === 'SUPER_ADMIN' && remediationRequested) failures.push(safeFailure('SUPER_ADMIN_CONFIGURATION_REMEDIATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN may monitor infrastructure drift only and cannot remediate configuration.'));
            if (role === 'SUPER_ADMIN' && !(input.infrastructureOnly === true && input.monitoringOnly === true)) failures.push(safeFailure('SUPER_ADMIN_CONFIGURATION_MONITORING_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN configuration visibility must be infrastructure monitoring only.'));
            if (role === 'SUPER_ADMIN' && targetTenant && actorTenant && targetTenant !== actorTenant) failures.push(safeFailure('CROSS_TENANT_CONFIGURATION_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant configuration visibility is blocked.'));
            if (archived && remediationRequested) failures.push(safeFailure('ARCHIVED_CONFIGURATION_HISTORY_IMMUTABLE', SEVERITIES.CRITICAL_BLOCKER, 'Archived configuration drift history cannot be modified.'));

            var allowed = failures.length === 0;
            return freezeConfigurationOutput({
                success: allowed,
                allowed: allowed,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: role === 'SUPER_ADMIN',
                monitoringOnly: role === 'SUPER_ADMIN',
                configurationAuthority: allowed && role === 'PLATFORM_OWNER',
                configurationMutationAuthority: false,
                visibility: allowed ? (role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_CONFIGURATION_VISIBILITY' : 'CONFIGURATION_DRIFT_GOVERNANCE') : 'NONE',
                failures: failures,
                accessGovernance: {
                    crossTenantConfigurationLeakageBlocked: true,
                    platformOwnerIsolatedFromTenantRbac: true,
                    superAdminConfigurationAuthority: false,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeConfigurationOutput({
                success: false,
                allowed: false,
                visibility: 'NONE',
                failures: [safeFailure('CONFIGURATION_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Configuration scope validation failed safely.')]
            });
        }
    }

    function normalizeConfigurationPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeConfigurationOutput({
                    success: false,
                    malformedPayloads: true,
                    payload: {},
                    failures: [safeFailure('MALFORMED_CONFIGURATION_PAYLOAD', SEVERITIES.HIGH_RISK, 'Configuration payload must be an object.')]
                });
            }
            var metadata = isPlainObject(payload.metadata) ? cloneSanitized(payload.metadata) : {};
            var normalized = {
                configurationId: safeString(payload.configurationId || payload.configId || payload.driftId || payload.baselineId || '', ''),
                driftId: safeString(payload.driftId || payload.configurationId || payload.configId || '', ''),
                baselineId: safeString(payload.baselineId || '', ''),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || contextTenant(context || {})),
                environment: normalizeEnvironment(payload.environment || payload.targetEnvironment || payload.sourceEnvironment || 'PRODUCTION'),
                driftState: normalizeDriftState(payload.driftState || payload.state || payload.status, 'MONITORING'),
                driftStateRaw: safeString(payload.driftState || payload.state || payload.status || '', ''),
                severity: classifyDriftSeverity(payload),
                remediationStatus: normalizeToken(payload.remediationStatus || payload.remediationState || 'REVIEW_REQUIRED'),
                correlationId: safeString(payload.correlationId || '', ''),
                configuration: cloneSanitized(payload.configuration || payload.activeConfiguration || {}),
                baseline: cloneSanitized(payload.baseline || payload.baselineConfiguration || {}),
                active: cloneSanitized(payload.active || payload.activeConfiguration || {}),
                releaseConfiguration: cloneSanitized(payload.releaseConfiguration || {}),
                metadata: metadata
            };
            return freezeConfigurationOutput({
                success: true,
                payload: normalized
            });
        } catch (error) {
            return freezeConfigurationOutput({
                success: false,
                malformedPayloads: true,
                payload: {},
                failures: [safeFailure('CONFIGURATION_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Configuration payload normalization failed safely.')]
            });
        }
    }

    function stableSerialize(value) {
        try {
            if (value === undefined) return 'missing';
            if (value === null) return 'null';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return safeString(value, '');
            if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
            if (isPlainObject(value)) {
                return '{' + Object.keys(value).sort().map(function keyValue(key) {
                    if (SENSITIVE_KEY_PATTERN.test(key)) return key + ':present';
                    return key + ':' + stableSerialize(value[key]);
                }).join(',') + '}';
            }
            return safeString(value, '');
        } catch (error) {
            return 'unserializable';
        }
    }

    function categoryConfig(source, category) {
        var input = isPlainObject(source) ? source : {};
        var config = isPlainObject(input.configuration) ? input.configuration : input;
        var candidates = [
            category.key,
            category.category,
            category.category.toLowerCase(),
            category.label,
            category.label.replace(/\s+/g, ''),
            category.label.replace(/\s+/g, '_')
        ];
        for (var index = 0; index < candidates.length; index += 1) {
            if (config[candidates[index]] !== undefined) return config[candidates[index]];
        }
        return undefined;
    }

    function categorySeverity(category, baselineValue, activeValue) {
        var key = category.category;
        var activeText = stableSerialize(activeValue).toLowerCase();
        var baselineMissing = baselineValue === undefined;
        var activeMissing = activeValue === undefined;
        if (/TENANT_ISOLATION|RBAC/.test(key)) return 'CRITICAL';
        if (/SERVICE_DEPENDENCY|DEPLOYMENT|ENVIRONMENT/.test(key)) return activeMissing || /degraded|disabled|false|relaxed|mismatch|failed/.test(activeText) ? 'HIGH' : 'MODERATE';
        if (baselineMissing || activeMissing) return 'MODERATE';
        return 'LOW';
    }

    function detectConfigurationDrift(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var baseline = source.baseline || source.productionBaseline || source.expected || source.staging || {};
            var active = source.active || source.activeConfiguration || source.production || source.current || {};
            var release = source.releaseConfiguration || source.release || {};
            var compareRelease = Object.keys(release || {}).length > 0;
            var driftItems = [];

            DRIFT_CATEGORIES.forEach(function compareCategory(category) {
                var baselineValue = categoryConfig(baseline, category);
                var activeValue = categoryConfig(active, category);
                var releaseValue = compareRelease ? categoryConfig(release, category) : undefined;
                var baselineSignature = stableSerialize(baselineValue);
                var activeSignature = stableSerialize(activeValue);
                var releaseSignature = compareRelease ? stableSerialize(releaseValue) : activeSignature;
                var missingConfiguration = baselineValue === undefined || activeValue === undefined;
                var activeDrift = baselineSignature !== activeSignature;
                var releaseDrift = compareRelease && activeSignature !== releaseSignature;
                if (missingConfiguration || activeDrift || releaseDrift) {
                    var severity = categorySeverity(category, baselineValue, activeValue);
                    driftItems.push({
                        category: category.category,
                        label: category.label,
                        key: category.key,
                        severity: severity,
                        baselineValue: baselineValue === undefined ? 'MISSING' : stableSerialize(baselineValue),
                        activeValue: activeValue === undefined ? 'MISSING' : stableSerialize(activeValue),
                        releaseValue: compareRelease ? (releaseValue === undefined ? 'MISSING' : stableSerialize(releaseValue)) : '',
                        missingConfiguration: missingConfiguration,
                        conflictingSettings: activeDrift || releaseDrift,
                        weight: category.weight
                    });
                }
            });

            var maxSeverity = driftItems.reduce(function highest(current, item) {
                var order = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
                return order[item.severity] > order[current] ? item.severity : current;
            }, 'LOW');

            return freezeConfigurationOutput({
                success: true,
                driftDetected: driftItems.length > 0,
                driftCount: driftItems.length,
                severity: driftItems.length ? maxSeverity : 'LOW',
                driftItems: driftItems,
                categories: DRIFT_CATEGORIES.map(function categoryName(item) { return item.category; }),
                tenantIsolationPreserved: true,
                immutableConfigurationReports: true
            });
        } catch (error) {
            return freezeConfigurationOutput({
                success: false,
                driftDetected: true,
                driftCount: 0,
                severity: 'CRITICAL',
                driftItems: [],
                failures: [safeFailure('CONFIGURATION_DRIFT_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Configuration drift detection failed safely.')]
            });
        }
    }

    function classifyDriftSeverity(input) {
        try {
            var source = isPlainObject(input) ? input : {};
            var explicit = normalizeToken(source.severity || source.riskLevel || source.classification || '');
            if (explicit === 'CRITICAL_BLOCKER') return 'CRITICAL';
            if (DRIFT_SEVERITIES.indexOf(explicit) !== -1) return explicit;
            var score = 0;
            if (source.securityImpact === true || source.rbacImpact === true) score += 40;
            if (source.tenantImpact === true || source.tenantIsolationImpact === true) score += 40;
            if (source.deploymentImpact === true) score += 36;
            if (source.serviceDependencyImpact === true || source.dependencyImpact === true) score += 24;
            if (source.rollbackImpact === true) score += 18;
            if (Array.isArray(source.driftItems)) {
                source.driftItems.forEach(function scoreItem(item) {
                    var severity = classifyDriftSeverity(item);
                    if (severity === 'CRITICAL') score += 30;
                    else if (severity === 'HIGH') score += 20;
                    else if (severity === 'MODERATE') score += 10;
                    else score += 4;
                });
            }
            score += safeNumber(source.driftRiskScore, 0);
            if (score >= 70) return 'CRITICAL';
            if (score >= 35) return 'HIGH';
            if (score >= 12) return 'MODERATE';
            return 'LOW';
        } catch (error) {
            return 'CRITICAL';
        }
    }

    function calculateConsistencyScore(input, context) {
        try {
            var drift = input && Array.isArray(input.driftItems) ? input : detectConfigurationDrift(input || {}, context || {});
            var items = Array.isArray(drift.driftItems) ? drift.driftItems : [];
            var penalty = items.reduce(function sumPenalty(total, item) {
                var severity = classifyDriftSeverity(item);
                var severityWeight = severity === 'CRITICAL' ? 2.2 : severity === 'HIGH' ? 1.6 : severity === 'MODERATE' ? 1.1 : 0.7;
                return total + Math.round(safeNumber(item.weight, 10) * severityWeight);
            }, 0);
            var consistencyScore = clamp(100 - penalty, 0, 100);
            var driftRiskScore = clamp(penalty + (items.length * 4), 0, 100);
            var remediationPriorityScore = clamp(driftRiskScore + (items.some(function critical(item) { return classifyDriftSeverity(item) === 'CRITICAL'; }) ? 15 : 0), 0, 100);
            return freezeConfigurationOutput({
                success: true,
                environmentConsistent: items.length === 0,
                consistencyScore: consistencyScore,
                environmentConsistencyScore: consistencyScore,
                driftRiskScore: driftRiskScore,
                remediationPriorityScore: remediationPriorityScore,
                driftCount: items.length,
                severity: classifyDriftSeverity({ driftItems: items, driftRiskScore: driftRiskScore })
            });
        } catch (error) {
            return freezeConfigurationOutput({
                success: false,
                environmentConsistent: false,
                consistencyScore: 0,
                driftRiskScore: 100,
                remediationPriorityScore: 100,
                failures: [safeFailure('CONFIGURATION_CONSISTENCY_SCORE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Configuration consistency scoring failed safely.')]
            });
        }
    }

    function activeState(row) {
        var token = normalizeToken(row && (row.driftState || row.status || row.state || row.remediationStatus || ''));
        return !/RESOLVED|CLOSED|COMPLETED|ARCHIVED|MITIGATED/.test(token);
    }

    function collectRows(data, input) {
        var rows = list(data, 'configurationDriftRecords')
            .concat(list(data, 'configurationDriftReports'))
            .concat(list(data, 'environmentConfigurationDriftRecords'));
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return rows.filter(function filterTenant(row) {
            if (!targetTenant) return true;
            var tenant = rowTenant(row);
            return !tenant || tenant === targetTenant;
        }).map(function normalizeRow(row) {
            var normalized = normalizeConfigurationPayload(row || {}, {}).payload || {};
            return Object.assign({}, normalized, {
                driftId: safeString(row && (row.driftId || row.configurationId || row.configId), normalized.driftId || ''),
                driftCategory: safeString(row && row.driftCategory || '', ''),
                remediationStatus: normalizeToken(row && (row.remediationStatus || row.remediationState || normalized.remediationStatus || 'REVIEW_REQUIRED')),
                remediationMinutes: safeNumber(row && (row.remediationMinutes || row.recoveryMinutes || row.durationMinutes), 0),
                createdAt: safeString(row && (row.createdAt || row.timestamp || row.detectedAt), ''),
                correlationId: safeString(row && row.correlationId || normalized.correlationId || '', '')
            });
        });
    }

    function collectBaselines(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'configurationBaselines').concat(list(data, 'configurationBaselineRecords')).filter(function filterTenant(row) {
            if (!targetTenant) return true;
            var tenant = rowTenant(row);
            return !tenant || tenant === targetTenant;
        }).map(function baseline(row) {
            return {
                baselineId: safeString(row && (row.baselineId || row.configurationId), ''),
                tenantSlug: rowTenant(row),
                environment: normalizeEnvironment(row && row.environment || 'PRODUCTION'),
                driftState: normalizeDriftState(row && (row.baselineState || row.driftState || row.state), 'CONSISTENT'),
                version: safeString(row && row.version || '', ''),
                immutableBaselineRecords: true,
                createdAt: safeString(row && (row.createdAt || row.timestamp || ''), '')
            };
        });
    }

    function newestEnvironmentConfig(data, environment, input) {
        var target = normalizeEnvironment(environment || 'PRODUCTION');
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        var rows = list(data, 'environmentConfigurationRecords').concat(list(data, 'configurationEnvironmentRecords')).filter(function filter(row) {
            var env = normalizeEnvironment(row && (row.environment || row.environmentName), '');
            var tenant = rowTenant(row);
            return env === target && (!targetTenant || !tenant || tenant === targetTenant);
        });
        var row = rows[0] || {};
        return isPlainObject(row.configuration) ? row.configuration : row;
    }

    function summarizeRows(rows, consistency) {
        var driftFrequency = rows.length;
        var activeRows = rows.filter(activeState);
        var critical = rows.filter(function criticalRow(row) { return classifyDriftSeverity(row) === 'CRITICAL'; }).length;
        var high = rows.filter(function highRow(row) { return classifyDriftSeverity(row) === 'HIGH'; }).length;
        var remediationRows = rows.filter(function withRemediation(row) { return safeNumber(row.remediationMinutes, 0) > 0; });
        var remediationTimes = remediationRows.length ? Math.round(remediationRows.reduce(function sum(total, row) { return total + safeNumber(row.remediationMinutes, 0); }, 0) / remediationRows.length) : 0;
        var recurring = {};
        rows.forEach(function countCategory(row) {
            var category = normalizeToken(row.driftCategory || row.category || 'GENERAL');
            recurring[category] = (recurring[category] || 0) + 1;
        });
        return {
            driftFrequency: driftFrequency,
            activeDriftAlerts: activeRows.length,
            driftSeverityTrends: { critical: critical, high: high, active: activeRows.length },
            remediationTimes: remediationTimes,
            environmentConsistencyTrends: consistency && consistency.consistencyScore || 100,
            deploymentDriftIncidents: rows.filter(function deployment(row) { return /DEPLOYMENT|ENVIRONMENT|SERVICE/.test(normalizeToken(row.driftCategory || row.category || row.severity)); }).length,
            recurringConfigurationIssues: Object.keys(recurring).filter(function repeated(key) { return recurring[key] > 1; }),
            configurationStabilityScore: consistency && typeof consistency.consistencyScore === 'number' ? consistency.consistencyScore : 100
        };
    }

    function auditConfiguration(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'CONFIGURATION_DRIFT_GOVERNANCE'),
                    actionType: normalizeToken(actionType || 'CONFIGURATION_DRIFT_GOVERNANCE'),
                    source: 'configurationDriftService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({ module: 'configurationDrift' }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Configuration drift audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Configuration drift audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'CONFIGURATION_DRIFT_EVENT'), {
                    source: 'configurationDriftService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Configuration drift telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Configuration drift telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'CONFIGURATION_DRIFT_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'configurationDriftService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Configuration drift metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Configuration drift metrics unavailable.' };
    }

    function reportStateFromSeverity(severity, driftDetected) {
        if (!driftDetected) return 'CONSISTENT';
        if (severity === 'CRITICAL' || severity === 'HIGH') return 'HIGH_RISK';
        if (severity === 'MODERATE') return 'WARNING';
        return 'DRIFT_DETECTED';
    }

    function generateConfigurationDriftReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var scope = validateConfigurationScope(Object.assign({ readOnly: true, aggregateOnly: true }, input), ctx);
            if (!scope.allowed) {
                return freezeConfigurationOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    driftGovernanceModel: { state: 'HIGH_RISK', states: DRIFT_STATES, severities: DRIFT_SEVERITIES, generatedAt: nowIso(ctx) },
                    driftDetection: { driftDetected: true, driftItems: [], driftCount: 0 },
                    environmentConsistency: { environmentConsistent: false, consistencyScore: 0, driftRiskScore: 100, remediationPriorityScore: 100 },
                    failures: scope.failures || [],
                    accessGovernance: scope.accessGovernance || {},
                    timestamp: nowIso(ctx)
                });
            }

            var data = rawData();
            var baseline = Object.keys(input.baseline || {}).length ? input.baseline : newestEnvironmentConfig({ environmentConfigurationRecords: list(data, 'configurationBaselines') }, 'PRODUCTION', input);
            if (!Object.keys(baseline || {}).length) baseline = newestEnvironmentConfig(data, 'STAGING', input);
            var active = Object.keys(input.active || {}).length ? input.active : newestEnvironmentConfig(data, 'PRODUCTION', input);
            var drift = detectConfigurationDrift(Object.assign({}, input, { baseline: baseline, active: active }), ctx);
            var consistency = calculateConsistencyScore(drift, ctx);
            var severity = classifyDriftSeverity({ driftItems: drift.driftItems || [], driftRiskScore: consistency.driftRiskScore || 0 });
            var state = reportStateFromSeverity(severity, drift.driftDetected);
            var rows = collectRows(data, input);
            var baselines = collectBaselines(data, input);
            var analytics = summarizeRows(rows, consistency);
            var remediationRequired = drift.driftDetected === true || analytics.activeDriftAlerts > 0;
            var integrations = {
                environmentPromotionIntegrated: !!(global.EnvironmentPromotionService || global.environmentPromotionService || global.EnvironmentActivationService || global.environmentActivationService),
                deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                rollbackGovernanceIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                globalAuditVisibilityIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService)
            };

            var report = freezeConfigurationOutput({
                success: true,
                classification: severity === 'CRITICAL' ? SEVERITIES.CRITICAL_BLOCKER : severity === 'HIGH' ? SEVERITIES.HIGH_RISK : severity === 'MODERATE' ? SEVERITIES.WARNING : SEVERITIES.INFO,
                driftGovernanceModel: {
                    state: state,
                    states: DRIFT_STATES,
                    severities: DRIFT_SEVERITIES,
                    generatedAt: nowIso(ctx)
                },
                driftDetection: drift,
                environmentConsistency: consistency,
                remediationGovernance: {
                    remediationRequired: remediationRequired,
                    remediationStatus: remediationRequired ? 'REVIEW_REQUIRED' : 'NOT_REQUIRED',
                    remediationPriority: consistency.remediationPriorityScore || 0,
                    remediationWorkflows: remediationRequired ? ['DRIFT_REVIEW', 'CONFIGURATION_APPROVAL', 'CONSISTENCY_CHECKPOINT'] : [],
                    remediationApprovalsRequired: remediationRequired,
                    unsafeEnvironmentMutationBlocked: true,
                    undisclosedConfigurationChangesBlocked: true
                },
                governanceIntegrations: integrations,
                driftAnalytics: analytics,
                configurationHistory: rows,
                baselineRecords: baselines,
                activeDriftAlerts: rows.filter(activeState),
                auditSummary: {
                    configurationActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                deploymentDriftBlocking: {
                    deploymentDriftBlocking: drift.driftDetected === true,
                    promotionValidationSupported: true,
                    rollbackVerificationSupported: true
                },
                accessGovernance: {
                    crossTenantConfigurationLeakageBlocked: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    platformOwnerIsolatedFromTenantRbac: true,
                    superAdminConfigurationAuthority: false,
                    tenantIsolationPreserved: true
                },
                immutableDriftHistory: true,
                immutableConfigurationReports: true,
                immutableBaselineRecords: true,
                failures: drift.failures || [],
                warnings: drift.driftDetected ? [safeWarning('CONFIGURATION_DRIFT_REVIEW_REQUIRED', SEVERITIES.WARNING, 'Configuration drift requires review.', 'Review drift categories and apply approved remediation workflow only.')] : [],
                sections: [drift, consistency, analytics],
                timestamp: nowIso(ctx)
            });

            emitTelemetry('CONFIGURATION_DRIFT_GOVERNANCE_REPORTED', { severity: report.classification, driftCount: report.driftDetection.driftCount }, ctx);
            auditConfiguration('CONFIGURATION_DRIFT_GOVERNANCE_REPORTED', { severity: report.classification, driftCount: report.driftDetection.driftCount }, ctx);
            recordMetric('CONFIGURATION_DRIFT_GOVERNANCE_REPORTED', { status: report.classification, severity: report.classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return report;
        } catch (error) {
            return freezeConfigurationOutput({
                success: false,
                classification: SEVERITIES.CRITICAL_BLOCKER,
                driftGovernanceModel: { state: 'HIGH_RISK', states: DRIFT_STATES, severities: DRIFT_SEVERITIES, generatedAt: nowIso(context || {}) },
                driftDetection: { driftDetected: true, driftItems: [], driftCount: 0 },
                environmentConsistency: { environmentConsistent: false, consistencyScore: 0, driftRiskScore: 100, remediationPriorityScore: 100 },
                remediationGovernance: { remediationRequired: true, unsafeEnvironmentMutationBlocked: true },
                failures: [safeFailure('CONFIGURATION_DRIFT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Configuration drift report failed safely.')],
                warnings: [safeWarning('CONFIGURATION_DRIFT_REPORT_RECOVERED', SEVERITIES.WARNING, 'Configuration drift report recovered from an internal error.', 'Review inputs and retry.', { error: error && error.message })],
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
            var malformed = normalizeConfigurationPayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);

            var drift = detectConfigurationDrift({
                baseline: { tenantIsolation: { rls: true }, rbac: { super_admin: 'infrastructure-only' } },
                active: { tenantIsolation: { rls: false }, rbac: { super_admin: 'business-admin' } }
            });
            add('drift detection works', drift.driftDetected === true && drift.driftItems.length >= 2);

            var consistency = calculateConsistencyScore(drift);
            add('consistency validation works', consistency.environmentConsistent === false && consistency.consistencyScore < 100);

            add('severity classification works', classifyDriftSeverity({ securityImpact: true, tenantImpact: true }) === 'CRITICAL');

            var immutable = freezeConfigurationOutput({ rows: [{ stable: true }] });
            add('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.rows));

            var report = generateConfigurationDriftReport({
                baseline: { tenantIsolation: { rls: true }, rbac: { super_admin: 'infrastructure-only' } },
                active: { tenantIsolation: { rls: false }, rbac: { super_admin: 'business-admin' } },
                remediationRequested: true
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('remediation workflows work without optional dependencies', report.success === true && report.remediationGovernance.remediationRequired === true);

            return freezeConfigurationOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    driftDetection: true,
                    consistencyValidation: true,
                    remediationWorkflows: true,
                    severityClassification: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezeConfigurationOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('CONFIGURATION_DRIFT_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Configuration drift self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        DRIFT_STATES: DRIFT_STATES,
        DRIFT_SEVERITIES: DRIFT_SEVERITIES,
        DRIFT_CATEGORIES: DRIFT_CATEGORIES,
        validateConfigurationScope: validateConfigurationScope,
        detectConfigurationDrift: detectConfigurationDrift,
        calculateConsistencyScore: calculateConsistencyScore,
        classifyDriftSeverity: classifyDriftSeverity,
        normalizeConfigurationPayload: normalizeConfigurationPayload,
        freezeConfigurationOutput: freezeConfigurationOutput,
        generateConfigurationDriftReport: generateConfigurationDriftReport,
        runSelfTest: runSelfTest
    });

    global.ConfigurationDriftService = api;
    global.configurationDriftService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_CONFIGURATION_DRIFT_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_CONFIGURATION_DRIFT_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_CONFIGURATION_DRIFT_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
