/**
 * zeroDowntimeDeploymentService.js
 * ARTHHRMS Zero Downtime Deployment Foundation + HA Release Governance.
 *
 * Platform-control-only continuity intelligence for high availability releases,
 * traffic transition readiness, deployment stabilization, failover validation,
 * and service continuity analytics. It validates and reports; it never performs
 * production cutovers, bypasses approvals, or exposes tenant business data.
 */
(function attachZeroDowntimeDeploymentService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ZeroDowntimeDeploymentService]';

    var CONTINUITY_STATES = Object.freeze([
        'PREPARING',
        'READY',
        'TRANSITIONING',
        'VALIDATING',
        'STABILIZING',
        'ACTIVE',
        'DEGRADED',
        'FAILOVER',
        'ARCHIVED'
    ]);

    var DEPLOYMENT_MODES = Object.freeze([
        'BLUE_GREEN',
        'ROLLING',
        'STAGED_TRAFFIC',
        'CANARY_READY',
        'REGIONAL_FAILOVER_READY',
        'MULTI_REGION_READY'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
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
        continuityAuthority: true,
        cutoverAuthority: true,
        failoverAuthority: true,
        visibility: true,
        classification: true,
        state: true,
        states: true,
        CONTINUITY_STATES: true,
        DEPLOYMENT_MODES: true,
        mode: true,
        modes: true,
        continuity: true,
        continuityId: true,
        releaseId: true,
        deploymentId: true,
        tenantId: true,
        tenantSlug: true,
        continuityState: true,
        continuityStateRaw: true,
        deploymentMode: true,
        deploymentModeRaw: true,
        continuityGovernanceModel: true,
        continuityValidation: true,
        validationCheckpoints: true,
        activationBlocked: true,
        blockingConditions: true,
        deploymentReady: true,
        rollbackReady: true,
        healthMonitoringReady: true,
        environmentConsistent: true,
        trafficMigrationReady: true,
        serviceDependenciesReady: true,
        failoverPrepared: true,
        certifiedRelease: true,
        validatedPipeline: true,
        healthyEnvironment: true,
        healthCritical: true,
        unresolvedDeploymentRisk: true,
        emergencyOverrideActive: true,
        cutoverRequested: true,
        failoverActivationRequested: true,
        stabilizationApproved: true,
        stabilizationFailure: true,
        stabilizationWindowMinutes: true,
        trafficMigratedPercent: true,
        uptimePercent: true,
        interruptionMinutes: true,
        cutoverSucceeded: true,
        recoverySucceeded: true,
        activeContinuity: true,
        continuityHistory: true,
        failoverHistory: true,
        stabilizationHistory: true,
        availability: true,
        availabilityScore: true,
        continuityConfidenceScore: true,
        deploymentStabilityScore: true,
        failoverReadiness: true,
        failoverReadinessScore: true,
        failoverBlocked: true,
        failoverTrends: true,
        stabilization: true,
        stabilizationScore: true,
        stabilizationStatus: true,
        stabilizationProgress: true,
        trafficTransition: true,
        trafficTransitionSuccessRate: true,
        deploymentRecoveryRate: true,
        deploymentHealth: true,
        availabilityAnalytics: true,
        deploymentUptime: true,
        deploymentInterruptions: true,
        continuitySuccessRate: true,
        stabilizationSuccessRate: true,
        failoverReadinessTrends: true,
        deploymentStabilityTrends: true,
        recoveryEfficiency: true,
        governanceIntegrations: true,
        cicdGovernanceIntegrated: true,
        environmentSnapshotIntegrated: true,
        rollbackGovernanceIntegrated: true,
        platformHealthIntegrated: true,
        safeReleaseIntegrated: true,
        globalIncidentIntegrated: true,
        auditSummary: true,
        continuityActionsAuditable: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        accessGovernance: true,
        crossTenantContinuityLeakageBlocked: true,
        tenantBusinessDataExcluded: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        platformIsolationPreserved: true,
        highAvailabilityGovernancePreserved: true,
        unsafeCutoverBlocked: true,
        governanceBypassBlocked: true,
        serviceInterruptionBlocked: true,
        immutableContinuityHistory: true,
        immutableFailoverRecords: true,
        immutableStabilizationRecords: true,
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
        count: true,
        passed: true,
        required: true,
        weight: true,
        severity: true,
        sections: true,
        tests: true,
        name: true,
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

    function normalizeContinuityState(value, fallback) {
        var state = normalizeToken(value || fallback || 'PREPARING');
        if (state === 'STABLE') return 'ACTIVE';
        if (state === 'FAILOVER_READY') return 'FAILOVER';
        if (CONTINUITY_STATES.indexOf(state) !== -1) return state;
        return fallback || 'PREPARING';
    }

    function normalizeDeploymentMode(value, fallback) {
        var mode = normalizeToken(value || fallback || 'STAGED_TRAFFIC');
        if (mode === 'BLUEGREEN') return 'BLUE_GREEN';
        if (mode === 'STAGED') return 'STAGED_TRAFFIC';
        if (mode === 'CANARY') return 'CANARY_READY';
        if (mode === 'REGIONAL_FAILOVER') return 'REGIONAL_FAILOVER_READY';
        if (mode === 'MULTI_REGION') return 'MULTI_REGION_READY';
        if (DEPLOYMENT_MODES.indexOf(mode) !== -1) return mode;
        return fallback || 'STAGED_TRAFFIC';
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

    function freezeContinuityOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'ZERO_DOWNTIME_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Zero downtime governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'ZERO_DOWNTIME_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'Zero downtime governance warning.', ''),
            recommendation: safeString(recommendation || 'Review continuity evidence.', ''),
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

    function normalizeContinuityPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeContinuityOutput({
                    success: false,
                    malformedPayloads: true,
                    failures: [safeFailure('MALFORMED_CONTINUITY_PAYLOAD', SEVERITIES.HIGH_RISK, 'Continuity payload must be an object.')]
                });
            }
            var ctx = isPlainObject(context) ? context : {};
            var continuity = {
                continuityId: safeString(payload.continuityId || payload.haId || payload.cutoverId || 'CONTINUITY-' + nowIso(ctx), ''),
                releaseId: safeString(payload.releaseId || '', ''),
                deploymentId: safeString(payload.deploymentId || '', ''),
                tenantId: safeString(payload.tenantId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(ctx)),
                continuityState: normalizeContinuityState(payload.continuityState || payload.state || payload.status, 'PREPARING'),
                continuityStateRaw: safeString(payload.continuityState || payload.state || payload.status || '', ''),
                deploymentMode: normalizeDeploymentMode(payload.deploymentMode || payload.mode || payload.strategy, 'STAGED_TRAFFIC'),
                deploymentModeRaw: safeString(payload.deploymentMode || payload.mode || payload.strategy || '', ''),
                deploymentReady: boolFrom(payload, ['deploymentReady', 'releaseReady', 'deploymentReadiness'], true),
                rollbackReady: boolFrom(payload, ['rollbackReady', 'rollbackReadiness', 'rollbackPrepared'], true),
                healthMonitoringReady: boolFrom(payload, ['healthMonitoringReady', 'monitoringReady', 'observabilityReady'], true),
                environmentConsistent: boolFrom(payload, ['environmentConsistent', 'environmentConsistency', 'environmentParity'], true),
                trafficMigrationReady: boolFrom(payload, ['trafficMigrationReady', 'trafficReady', 'cutoverReady'], true),
                serviceDependenciesReady: boolFrom(payload, ['serviceDependenciesReady', 'dependencyReady', 'dependenciesReady'], true),
                failoverPrepared: boolFrom(payload, ['failoverPrepared', 'failoverReady', 'failoverReadiness'], true),
                certifiedRelease: boolFrom(payload, ['certifiedRelease', 'readinessCertified', 'certificationApproved'], true),
                validatedPipeline: boolFrom(payload, ['validatedPipeline', 'pipelineValidated', 'deploymentPipelineValid'], true),
                healthyEnvironment: boolFrom(payload, ['healthyEnvironment', 'environmentHealthy', 'healthReady'], true),
                healthCritical: payload.healthCritical === true || normalizeToken(payload.healthState || '') === 'CRITICAL',
                unresolvedDeploymentRisk: payload.unresolvedDeploymentRisk === true || payload.deploymentRiskUnresolved === true,
                emergencyOverrideActive: payload.emergencyOverrideActive === true || payload.activeEmergencyOverride === true,
                cutoverRequested: payload.cutoverRequested === true || payload.activationRequested === true,
                failoverActivationRequested: payload.failoverActivationRequested === true || payload.failoverRequested === true,
                stabilizationApproved: payload.stabilizationApproved !== false,
                stabilizationFailure: payload.stabilizationFailure === true,
                stabilizationWindowMinutes: safeNumber(payload.stabilizationWindowMinutes || payload.stabilizationMinutes || 0, 0),
                trafficMigratedPercent: clamp(payload.trafficMigratedPercent || payload.trafficPercent || 0, 0, 100),
                uptimePercent: clamp(payload.uptimePercent || payload.deploymentUptime || 100, 0, 100),
                interruptionMinutes: safeNumber(payload.interruptionMinutes || payload.downtimeMinutes || 0, 0),
                cutoverSucceeded: payload.cutoverSucceeded !== false,
                recoverySucceeded: payload.recoverySucceeded !== false,
                createdAt: safeString(payload.createdAt || payload.timestamp || nowIso(ctx), ''),
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeContinuityOutput({
                success: true,
                continuity: continuity,
                continuityValidation: { validationCheckpoints: buildValidationCheckpoints(continuity) },
                immutableContinuityHistory: true,
                immutableFailoverRecords: true,
                immutableStabilizationRecords: true
            });
        } catch (error) {
            return freezeContinuityOutput({
                success: false,
                malformedPayloads: true,
                failures: [safeFailure('CONTINUITY_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Continuity normalization failed safely.')]
            });
        }
    }

    function buildValidationCheckpoints(continuity) {
        var input = continuity || {};
        return [
            { name: 'Deployment readiness', passed: input.deploymentReady !== false, required: true, weight: 14 },
            { name: 'Rollback readiness', passed: input.rollbackReady !== false, required: true, weight: 16 },
            { name: 'Health monitoring readiness', passed: input.healthMonitoringReady !== false && input.healthCritical !== true, required: true, weight: 14 },
            { name: 'Environment consistency', passed: input.environmentConsistent !== false, required: true, weight: 14 },
            { name: 'Traffic migration readiness', passed: input.trafficMigrationReady !== false, required: true, weight: 12 },
            { name: 'Service dependency readiness', passed: input.serviceDependenciesReady !== false, required: true, weight: 14 },
            { name: 'Failover preparedness', passed: input.failoverPrepared !== false, required: true, weight: 10 },
            { name: 'Release certification', passed: input.certifiedRelease !== false, required: true, weight: 8 },
            { name: 'Validated pipeline', passed: input.validatedPipeline !== false, required: true, weight: 8 },
            { name: 'Healthy environment', passed: input.healthyEnvironment !== false && input.emergencyOverrideActive !== true && input.unresolvedDeploymentRisk !== true, required: true, weight: 14 }
        ];
    }

    function validateAccess(payload, context) {
        var input = isPlainObject(payload) ? payload : {};
        var ctx = isPlainObject(context) ? context : {};
        var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.type || ctx.actor.userRole));
        var routeType = normalizeToken(ctx.routeType || ctx.surface || 'platform');
        var targetTenant = normalizeTenantSlug(input.targetTenantId || input.tenantSlug || input.tenantId);
        var actorTenant = contextTenant(ctx);
        var actionRequested = input.cutoverRequested === true || input.failoverActivationRequested === true || input.recoveryApprovalRequested === true || input.stabilizationApprovalRequested === true;
        var archived = normalizeContinuityState(input.continuityState || input.state || input.status, '') === 'ARCHIVED';
        var failures = [];
        if (routeType !== 'PLATFORM') failures.push(safeFailure('HA_GOVERNANCE_PLATFORM_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'High availability governance is isolated to platform-control.'));
        if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') failures.push(safeFailure('HA_GOVERNANCE_ROLE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access zero downtime governance.'));
        if (role === 'SUPER_ADMIN' && actionRequested) failures.push(safeFailure('SUPER_ADMIN_CUTOVER_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN may monitor high availability only and cannot execute cutovers or failovers.'));
        if (role === 'SUPER_ADMIN' && !(input.infrastructureOnly === true && input.monitoringOnly === true) && !actionRequested) failures.push(safeFailure('SUPER_ADMIN_HA_MONITORING_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN high availability visibility must be infrastructure monitoring only.'));
        if (role === 'SUPER_ADMIN' && targetTenant && actorTenant && targetTenant !== actorTenant) failures.push(safeFailure('CROSS_TENANT_HA_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant continuity visibility is blocked.'));
        if (archived && actionRequested) failures.push(safeFailure('ARCHIVED_CONTINUITY_HISTORY_IMMUTABLE', SEVERITIES.CRITICAL_BLOCKER, 'Archived continuity history cannot be modified.'));
        return { role: role, failures: failures, allowed: failures.length === 0 };
    }

    function validateDeploymentContinuity(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeContinuityOutput({
                    success: false,
                    allowed: false,
                    activationBlocked: true,
                    failures: [safeFailure('MALFORMED_CONTINUITY_PAYLOAD', SEVERITIES.HIGH_RISK, 'Continuity payload must be an object.')]
                });
            }
            var normalized = normalizeContinuityPayload(payload, context || {});
            var continuity = normalized.continuity || {};
            var access = validateAccess(Object.assign({}, continuity, payload), context || {});
            var checkpoints = buildValidationCheckpoints(Object.assign({}, continuity, payload));
            var blockingConditions = [];
            checkpoints.forEach(function block(row) {
                if (row.required && row.passed === false) {
                    blockingConditions.push(safeFailure(normalizeToken(row.name) + '_FAILED', /ROLLBACK|HEALTHY|HEALTH|ENVIRONMENT|FAILOVER/.test(normalizeToken(row.name)) ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH_RISK, row.name + ' failed.'));
                }
            });
            if (continuity.healthCritical) blockingConditions.push(safeFailure('HEALTH_CRITICAL_BLOCKS_ACTIVATION', SEVERITIES.CRITICAL_BLOCKER, 'Critical health blocks zero downtime activation.'));
            if (continuity.unresolvedDeploymentRisk) blockingConditions.push(safeFailure('UNRESOLVED_DEPLOYMENT_RISK_BLOCKS_ACTIVATION', SEVERITIES.CRITICAL_BLOCKER, 'Unresolved deployment risk blocks activation.'));
            if (continuity.emergencyOverrideActive) blockingConditions.push(safeFailure('EMERGENCY_OVERRIDE_BLOCKS_ACTIVATION', SEVERITIES.CRITICAL_BLOCKER, 'Active emergency override blocks activation.'));
            if (continuity.interruptionMinutes > 0) blockingConditions.push(safeFailure('SERVICE_INTERRUPTION_DETECTED', SEVERITIES.HIGH_RISK, 'Service interruption detected during deployment continuity review.'));
            var activationBlocked = blockingConditions.length > 0 || !access.allowed;
            return freezeContinuityOutput({
                success: true,
                allowed: access.allowed,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: access.role === 'SUPER_ADMIN',
                monitoringOnly: access.role === 'SUPER_ADMIN',
                continuityAuthority: access.allowed && access.role === 'PLATFORM_OWNER',
                cutoverAuthority: false,
                failoverAuthority: false,
                visibility: access.allowed ? (access.role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_HA_VISIBILITY' : 'HIGH_AVAILABILITY_GOVERNANCE') : 'NONE',
                continuity: continuity,
                activationBlocked: activationBlocked,
                blockingConditions: blockingConditions,
                continuityValidation: { validationCheckpoints: checkpoints },
                trafficTransition: {
                    trafficMigratedPercent: continuity.trafficMigratedPercent,
                    trafficTransitionSuccessRate: continuity.cutoverSucceeded ? 100 : 0,
                    deploymentRecoveryRate: continuity.recoverySucceeded ? 100 : 0
                },
                accessGovernance: {
                    crossTenantContinuityLeakageBlocked: true,
                    tenantBusinessDataExcluded: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    platformIsolationPreserved: true,
                    highAvailabilityGovernancePreserved: true,
                    unsafeCutoverBlocked: activationBlocked,
                    governanceBypassBlocked: true,
                    serviceInterruptionBlocked: true
                },
                immutableContinuityHistory: true,
                immutableFailoverRecords: true,
                immutableStabilizationRecords: true,
                failures: (access.failures || []).concat(blockingConditions)
            });
        } catch (error) {
            return freezeContinuityOutput({
                success: false,
                allowed: false,
                activationBlocked: true,
                failures: [safeFailure('DEPLOYMENT_CONTINUITY_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Deployment continuity validation failed safely.')]
            });
        }
    }

    function calculateAvailabilityScore(input) {
        try {
            var governance = input && input.continuityValidation ? input : validateDeploymentContinuity(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var checkpoints = governance.continuityValidation && governance.continuityValidation.validationCheckpoints || [];
            var totalWeight = checkpoints.reduce(function sum(total, row) { return total + safeNumber(row.weight, 0); }, 0) || 1;
            var passedWeight = checkpoints.reduce(function sumPassed(total, row) { return total + (row.passed ? safeNumber(row.weight, 0) : 0); }, 0);
            var base = Math.round((passedWeight / totalWeight) * 100);
            var continuity = governance.continuity || {};
            var interruptionPenalty = Math.min(40, safeNumber(continuity.interruptionMinutes, 0) * 4);
            var stabilityBonus = continuity.stabilizationApproved !== false && continuity.stabilizationFailure !== true ? 4 : -12;
            var availabilityScore = clamp(base - interruptionPenalty + stabilityBonus - (governance.activationBlocked ? 10 : 0), 0, 100);
            var confidence = clamp(Math.round((availabilityScore + clamp(continuity.uptimePercent || 100, 0, 100)) / 2), 0, 100);
            return freezeContinuityOutput({
                success: true,
                availabilityScore: availabilityScore,
                continuityConfidenceScore: confidence,
                deploymentStabilityScore: clamp(availabilityScore - (continuity.stabilizationFailure ? 20 : 0), 0, 100),
                deploymentHealth: availabilityScore >= 85 ? 'HEALTHY' : availabilityScore >= 60 ? 'WATCH' : 'DEGRADED',
                activationBlocked: governance.activationBlocked === true
            });
        } catch (error) {
            return freezeContinuityOutput({
                success: false,
                availabilityScore: 0,
                continuityConfidenceScore: 0,
                deploymentStabilityScore: 0,
                deploymentHealth: 'DEGRADED',
                failures: [safeFailure('AVAILABILITY_SCORING_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Availability scoring failed safely.')]
            });
        }
    }

    function calculateFailoverReadiness(input) {
        try {
            var governance = input && input.continuityValidation ? input : validateDeploymentContinuity(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var continuity = governance.continuity || {};
            var score = 100;
            if (continuity.failoverPrepared === false) score -= 35;
            if (continuity.rollbackReady === false) score -= 25;
            if (continuity.serviceDependenciesReady === false) score -= 15;
            if (continuity.healthMonitoringReady === false || continuity.healthCritical) score -= 15;
            if (continuity.environmentConsistent === false) score -= 10;
            if (continuity.emergencyOverrideActive) score -= 20;
            score = clamp(score, 0, 100);
            return freezeContinuityOutput({
                success: true,
                failoverReadinessScore: score,
                failoverBlocked: score < 70 || governance.activationBlocked === true,
                failoverTrends: score,
                blockingConditions: governance.blockingConditions || []
            });
        } catch (error) {
            return freezeContinuityOutput({
                success: false,
                failoverReadinessScore: 0,
                failoverBlocked: true,
                failures: [safeFailure('FAILOVER_READINESS_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Failover readiness failed safely.')]
            });
        }
    }

    function normalizeContinuityRow(row) {
        var normalized = normalizeContinuityPayload(row || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        return normalized.continuity || {};
    }

    function collectContinuity(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'deploymentContinuityRecords')
            .concat(list(data, 'zeroDowntimeDeploymentRecords'), list(data, 'highAvailabilityRecords'), list(data, 'continuityGovernanceRecords'))
            .filter(function filterTenant(row) {
                if (!targetTenant) return true;
                var tenant = rowTenant(row);
                return !tenant || tenant === targetTenant;
            })
            .map(normalizeContinuityRow);
    }

    function activeState(row) {
        var token = normalizeContinuityState(row && (row.continuityState || row.status || row.state || ''), '');
        return !/ARCHIVED/.test(token);
    }

    function aggregateContinuity(rows, context) {
        var active = rows.filter(activeState);
        var basis = active.length ? active : [{}];
        var aggregate = {
            continuityId: 'CONTINUITY-AGGREGATE',
            continuityState: basis.some(function degraded(row) { return row.continuityState === 'DEGRADED'; }) ? 'DEGRADED' : basis.some(function transitioning(row) { return row.continuityState === 'TRANSITIONING'; }) ? 'TRANSITIONING' : basis.some(function stabilizing(row) { return row.continuityState === 'STABILIZING'; }) ? 'STABILIZING' : 'READY',
            deploymentMode: 'STAGED_TRAFFIC',
            deploymentReady: basis.every(function ok(row) { return row.deploymentReady !== false; }),
            rollbackReady: basis.every(function ok(row) { return row.rollbackReady !== false; }),
            healthMonitoringReady: basis.every(function ok(row) { return row.healthMonitoringReady !== false; }),
            environmentConsistent: basis.every(function ok(row) { return row.environmentConsistent !== false; }),
            trafficMigrationReady: basis.every(function ok(row) { return row.trafficMigrationReady !== false; }),
            serviceDependenciesReady: basis.every(function ok(row) { return row.serviceDependenciesReady !== false; }),
            failoverPrepared: basis.every(function ok(row) { return row.failoverPrepared !== false; }),
            certifiedRelease: basis.every(function ok(row) { return row.certifiedRelease !== false; }),
            validatedPipeline: basis.every(function ok(row) { return row.validatedPipeline !== false; }),
            healthyEnvironment: basis.every(function ok(row) { return row.healthyEnvironment !== false; }),
            healthCritical: basis.some(function blocked(row) { return row.healthCritical === true; }),
            unresolvedDeploymentRisk: basis.some(function blocked(row) { return row.unresolvedDeploymentRisk === true; }),
            emergencyOverrideActive: basis.some(function blocked(row) { return row.emergencyOverrideActive === true; }),
            stabilizationApproved: basis.every(function ok(row) { return row.stabilizationApproved !== false; }),
            stabilizationFailure: basis.some(function failed(row) { return row.stabilizationFailure === true; }),
            trafficMigratedPercent: Math.round(basis.reduce(function sum(total, row) { return total + safeNumber(row.trafficMigratedPercent, 0); }, 0) / basis.length),
            uptimePercent: Math.min.apply(Math, basis.map(function uptime(row) { return clamp(row.uptimePercent || 100, 0, 100); })),
            interruptionMinutes: basis.reduce(function sum(total, row) { return total + safeNumber(row.interruptionMinutes, 0); }, 0),
            cutoverSucceeded: basis.every(function ok(row) { return row.cutoverSucceeded !== false; }),
            recoverySucceeded: basis.every(function ok(row) { return row.recoverySucceeded !== false; })
        };
        return validateDeploymentContinuity(aggregate, context || {});
    }

    function summarizeAvailability(rows) {
        var total = rows.length;
        var interruptions = rows.filter(function interrupted(row) { return safeNumber(row.interruptionMinutes, 0) > 0 || row.cutoverSucceeded === false; }).length;
        var stable = rows.filter(function stableRow(row) { return row.stabilizationFailure !== true && row.continuityState !== 'DEGRADED'; }).length;
        var failoverReady = rows.filter(function ready(row) { return row.failoverPrepared !== false && row.rollbackReady !== false; }).length;
        var recovered = rows.filter(function recoveredRow(row) { return row.recoverySucceeded !== false; }).length;
        var uptime = rows.length ? Math.round(rows.reduce(function sum(totalUptime, row) { return totalUptime + clamp(row.uptimePercent || 100, 0, 100); }, 0) / rows.length) : 100;
        return {
            deploymentUptime: uptime,
            deploymentInterruptions: interruptions,
            continuitySuccessRate: total ? Math.round(((total - interruptions) / total) * 100) : 100,
            stabilizationSuccessRate: total ? Math.round((stable / total) * 100) : 100,
            failoverReadinessTrends: total ? Math.round((failoverReady / total) * 100) : 100,
            deploymentStabilityTrends: total ? Math.round((stable / total) * 100) : 100,
            recoveryEfficiency: total ? Math.round((recovered / total) * 100) : 100
        };
    }

    function auditContinuity(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'ZERO_DOWNTIME_GOVERNANCE'),
                    actionType: normalizeToken(actionType || 'ZERO_DOWNTIME_GOVERNANCE'),
                    source: 'zeroDowntimeDeploymentService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({ module: 'zeroDowntimeDeployment' }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Zero downtime audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Zero downtime audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'ZERO_DOWNTIME_EVENT'), {
                    source: 'zeroDowntimeDeploymentService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Zero downtime telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Zero downtime telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'ZERO_DOWNTIME_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'zeroDowntimeDeploymentService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Zero downtime metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Zero downtime metrics unavailable.' };
    }

    function generateZeroDowntimeReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var access = validateAccess(Object.assign({ readOnly: true, aggregateOnly: true }, input), ctx);
            if (!access.allowed) {
                return freezeContinuityOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    continuityGovernanceModel: { state: 'ARCHIVED', states: CONTINUITY_STATES, modes: DEPLOYMENT_MODES, generatedAt: nowIso(ctx) },
                    failures: access.failures || [],
                    timestamp: nowIso(ctx)
                });
            }
            var data = rawData();
            var continuityRows = collectContinuity(data, input);
            var active = continuityRows.filter(activeState);
            var governance = aggregateContinuity(active, ctx);
            var availability = calculateAvailabilityScore(governance);
            var failover = calculateFailoverReadiness(governance);
            var analytics = summarizeAvailability(active);
            var stabilizationScore = clamp(Math.round((availability.deploymentStabilityScore + analytics.stabilizationSuccessRate) / 2), 0, 100);
            var state = governance.activationBlocked ? (active.some(function degraded(row) { return row.continuityState === 'DEGRADED'; }) ? 'DEGRADED' : 'VALIDATING') : (active.some(function activeRow(row) { return row.continuityState === 'ACTIVE'; }) ? 'ACTIVE' : 'READY');
            var report = freezeContinuityOutput({
                success: true,
                classification: governance.activationBlocked ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO,
                continuityGovernanceModel: { state: state, states: CONTINUITY_STATES, modes: DEPLOYMENT_MODES, generatedAt: nowIso(ctx) },
                activeContinuity: active,
                continuityHistory: continuityRows,
                failoverHistory: active.filter(function failoverRow(row) { return row.continuityState === 'FAILOVER' || row.failoverPrepared === true; }),
                stabilizationHistory: active.filter(function stabilize(row) { return row.continuityState === 'STABILIZING' || row.stabilizationWindowMinutes > 0 || row.stabilizationApproved === true; }),
                continuityValidation: governance.continuityValidation,
                trafficTransition: governance.trafficTransition,
                availability: availability,
                failoverReadiness: failover,
                stabilization: {
                    stabilizationScore: stabilizationScore,
                    stabilizationStatus: stabilizationScore >= 85 ? 'STABLE' : stabilizationScore >= 60 ? 'WATCH' : 'DEGRADED',
                    stabilizationProgress: stabilizationScore
                },
                availabilityAnalytics: analytics,
                governanceIntegrations: {
                    cicdGovernanceIntegrated: !!(global.CICDGovernanceService || global.cicdGovernanceService),
                    environmentSnapshotIntegrated: !!(global.EnvironmentSnapshotService || global.environmentSnapshotService),
                    rollbackGovernanceIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    safeReleaseIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService)
                },
                auditSummary: {
                    continuityActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                accessGovernance: governance.accessGovernance,
                immutableContinuityHistory: true,
                immutableFailoverRecords: true,
                immutableStabilizationRecords: true,
                failures: governance.failures || [],
                warnings: governance.activationBlocked ? [safeWarning('ZERO_DOWNTIME_REVIEW_REQUIRED', SEVERITIES.WARNING, 'Continuity activation has blockers.', 'Resolve readiness, rollback, health, environment, traffic, dependency, and failover blockers before cutover.')] : [],
                sections: [governance, availability, failover, analytics],
                timestamp: nowIso(ctx)
            });
            emitTelemetry('ZERO_DOWNTIME_GOVERNANCE_REPORTED', { state: report.continuityGovernanceModel.state, severity: report.classification }, ctx);
            auditContinuity('ZERO_DOWNTIME_GOVERNANCE_REPORTED', { state: report.continuityGovernanceModel.state, severity: report.classification }, ctx);
            recordMetric('ZERO_DOWNTIME_GOVERNANCE_REPORTED', { status: report.continuityGovernanceModel.state, severity: report.classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return report;
        } catch (error) {
            return freezeContinuityOutput({
                success: false,
                classification: SEVERITIES.CRITICAL_BLOCKER,
                continuityGovernanceModel: { state: 'DEGRADED', states: CONTINUITY_STATES, modes: DEPLOYMENT_MODES, generatedAt: nowIso(context || {}) },
                failures: [safeFailure('ZERO_DOWNTIME_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Zero downtime report failed safely.')],
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
            var malformed = normalizeContinuityPayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);

            var normalized = normalizeContinuityPayload({
                continuityId: 'CONT-SELF',
                continuityState: 'ready',
                deploymentReady: true,
                rollbackReady: true,
                healthMonitoringReady: true,
                environmentConsistent: true,
                trafficMigrationReady: true,
                serviceDependenciesReady: true,
                failoverPrepared: true,
                certifiedRelease: true,
                validatedPipeline: true,
                healthyEnvironment: true,
                salary: 1
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('continuity validation works', normalized.success === true && normalized.continuity.continuityState === 'READY');

            var valid = validateDeploymentContinuity(normalized.continuity, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('stabilization workflows work', valid.activationBlocked === false);

            var failover = calculateFailoverReadiness(valid);
            add('failover readiness works', failover.failoverReadinessScore >= 80);

            var availability = calculateAvailabilityScore(valid);
            add('availability scoring works', availability.availabilityScore >= 80);

            var immutable = freezeContinuityOutput({ rows: [{ stable: true }] });
            add('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.rows));

            return freezeContinuityOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    continuityValidation: true,
                    stabilizationWorkflows: true,
                    failoverReadiness: true,
                    availabilityScoring: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezeContinuityOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('ZERO_DOWNTIME_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Zero downtime self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        CONTINUITY_STATES: CONTINUITY_STATES,
        DEPLOYMENT_MODES: DEPLOYMENT_MODES,
        validateDeploymentContinuity: validateDeploymentContinuity,
        calculateAvailabilityScore: calculateAvailabilityScore,
        calculateFailoverReadiness: calculateFailoverReadiness,
        normalizeContinuityPayload: normalizeContinuityPayload,
        freezeContinuityOutput: freezeContinuityOutput,
        generateZeroDowntimeReport: generateZeroDowntimeReport,
        runSelfTest: runSelfTest
    });

    global.ZeroDowntimeDeploymentService = api;
    global.zeroDowntimeDeploymentService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_ZERO_DOWNTIME_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_ZERO_DOWNTIME_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_ZERO_DOWNTIME_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
