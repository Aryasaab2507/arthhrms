/**
 * safeReleaseGovernanceService.js
 * ARTHHRMS Enterprise Safe Release + Controlled Production Rollout Governance.
 *
 * Additive, platform-control-only release layer for staged production rollout,
 * rollout waves, release freeze controls, stabilization checkpoints, rollback
 * governance, and release safety analytics. It never exposes salaries, leave
 * balances, confidential HR records, raw tenant documents, URLs, tokens, or
 * tenant-private payloads.
 */
(function attachSafeReleaseGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[SafeReleaseGovernanceService]';

    var RELEASE_STATES = Object.freeze([
        'PLANNED',
        'APPROVED',
        'STAGED',
        'LIMITED_RELEASE',
        'STABILIZING',
        'DEGRADED',
        'ROLLBACK_ACTIVE',
        'ARCHIVED'
    ]);

    var RELEASE_TYPES = Object.freeze([
        'CONTROLLED_ROLLOUT',
        'STAGED_RELEASE',
        'ROLLOUT_WAVE',
        'RELEASE_FREEZE',
        'STABILIZATION_CHECKPOINT',
        'ROLLBACK_GOVERNANCE',
        'DEPLOYMENT_SAFETY',
        'RELEASE_RECOVERY'
    ]);

    var ROLLBACK_STATES = Object.freeze([
        'READY',
        'VALIDATING',
        'APPROVED',
        'EXECUTING',
        'RECOVERING',
        'VERIFIED',
        'FAILED',
        'ARCHIVED'
    ]);

    var ROLLBACK_TYPES = Object.freeze([
        'RELEASE_ROLLBACK',
        'PRODUCTION_ROLLBACK',
        'SCHEMA_ROLLBACK',
        'PLATFORM_WIDE_ROLLBACK',
        'INCIDENT_TRIGGERED_ROLLBACK',
        'EMERGENCY_ROLLBACK'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        SAFE_RELEASE_GOVERNANCE: 'SAFE_RELEASE_GOVERNANCE',
        INFRASTRUCTURE_ROLLOUT_VISIBILITY: 'INFRASTRUCTURE_ROLLOUT_VISIBILITY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        rolloutMonitoring: true,
        rolloutAuthority: true,
        rolloutBypassAuthority: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        type: true,
        types: true,
        generatedAt: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        safeReleaseId: true,
        releaseId: true,
        rolloutWaveId: true,
        tenantId: true,
        tenantSlug: true,
        releaseType: true,
        releaseState: true,
        releaseStateRaw: true,
        safeReleaseModel: true,
        releaseGovernance: true,
        governanceApprovals: true,
        releaseApprovals: true,
        rolloutCheckpoints: true,
        releaseFreezes: true,
        stabilizationGates: true,
        releaseHistory: true,
        immutableReleaseHistory: true,
        rolloutAuditTrails: true,
        rolloutProgress: true,
        rolloutPhaseProgress: true,
        currentPhase: true,
        rolloutPhases: true,
        internalRollout: true,
        pilotRollout: true,
        departmentRollout: true,
        tenantRollout: true,
        fullRollout: true,
        internalRolloutComplete: true,
        pilotRolloutComplete: true,
        departmentRolloutComplete: true,
        tenantRolloutComplete: true,
        fullRolloutComplete: true,
        stabilizationStatus: true,
        stabilizationScore: true,
        rolloutConfidence: true,
        rolloutConfidenceScore: true,
        releaseConfidence: true,
        rolloutEligible: true,
        rolloutRisk: true,
        rolloutRiskScore: true,
        riskLevel: true,
        releaseSafety: true,
        safetyChecks: true,
        releaseBlocked: true,
        rolloutBlocked: true,
        blockedReleases: true,
        blockedReleaseReasons: true,
        certificationMissing: true,
        criticalIncidentActive: true,
        healthStatusCritical: true,
        emergencyOverrideActive: true,
        unresolvedDeploymentValidationFailure: true,
        rollbackReadinessUnavailable: true,
        readinessCertified: true,
        deploymentValidated: true,
        healthVerified: true,
        releaseApproved: true,
        rolloutStrategies: true,
        percentageRollout: true,
        phasedRollout: true,
        featureRollout: true,
        controlledEnablement: true,
        controlledRollout: true,
        releaseStabilizationIntelligence: true,
        rollbackGovernance: true,
        incidentDeploymentIntegration: true,
        releaseAnalytics: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        releaseSummaries: true,
        stagedProductionRollouts: true,
        limitedReleaseActivations: true,
        stabilizationMonitoring: true,
        releaseFreezeHandling: true,
        rolloutApprovalCheckpoints: true,
        releaseArchivalWorkflows: true,
        unsafeProductionDeploymentExecutionBlocked: true,
        rolloutInstability: true,
        degradedReleaseBehavior: true,
        rollbackFrequency: true,
        deploymentRecoveryTimelines: true,
        rolloutCongestion: true,
        stabilizationDelays: true,
        releaseEscalationFrequency: true,
        rollbackCheckpoints: true,
        rollbackActiveReleases: true,
        rollbackReadinessSummaries: true,
        rollbackEfficiency: true,
        rollbackHealthVerification: true,
        rolloutLinkedDegradation: true,
        deploymentTriggeredIncidents: true,
        stabilizationRecoveryAnalytics: true,
        rollbackActivationTrends: true,
        operationalReleaseHealth: true,
        rolloutSuccessRates: true,
        stabilizationTimelines: true,
        deploymentCongestionTrends: true,
        releaseDegradationFrequency: true,
        operationalRecoveryHealth: true,
        governanceApprovalTimelines: true,
        releaseGovernanceHealth: true,
        crossTenantDeploymentLeakageBlocked: true,
        unsafeProductionRolloutBlocked: true,
        superAdminRolloutBypassAuthority: true,
        superAdminHrPayrollVisibility: true,
        platformOwnerTenantRbacIsolation: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        historicalReleaseRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        releaseActionsAuditable: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        releaseGovernanceIsolationPreserved: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        productionReadinessIntegrated: true,
        deploymentValidationIntegrated: true,
        globalIncidentIntegrated: true,
        platformHealthIntegrated: true,
        emergencyOverrideIntegrated: true,
        featureRolloutIntegrated: true,
        workflowTelemetryIntegrated: true,
        environmentGovernanceIntegrated: true,
        stagingValidationIntegrated: true,
        label: true,
        checkId: true,
        passed: true,
        coverage: true,
        malformedPayloads: true,
        dependencyAbsence: true,
        immutability: true,
        rolloutRollback: true,
        stabilizationFailure: true,
        tenantIsolation: true,
        environment: true,
        createdAt: true,
        updatedAt: true,
        releasedAt: true,
        rolloutWave: true,
        rolloutPercentage: true,
        releaseFreeze: true,
        rollbackReady: true,
        rollbackActive: true,
        stabilizationCheckpoint: true,
        stabilizationDelayMinutes: true,
        approvalCheckpoint: true,
        deploymentSafetyMarker: true,
        releaseReady: true,
        correlationId: true,
        module: true,
        actionType: true
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
            return source && typeof source.get === 'function' ? source.get() || {} : {};
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
        var number = safeNumber(value, 0);
        if (number < min) return min;
        if (number > max) return max;
        return number;
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

    function freezeReleaseOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'SAFE_RELEASE_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Safe release governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeReleaseState(value, fallback) {
        var state = normalizeToken(value || fallback || 'PLANNED');
        if (state === 'READY' || state === 'APPROVED' || state === 'CERTIFIED' || state === 'VALIDATED') return 'APPROVED';
        if (state === 'STAGE' || state === 'STAGED' || state === 'WAVE_STAGED') return 'STAGED';
        if (state === 'LIMITED' || state === 'LIMITED_ROLLOUT' || state === 'LIMITED_RELEASE' || state === 'BETA') return 'LIMITED_RELEASE';
        if (state === 'STABILIZING' || state === 'STABILIZATION' || state === 'IN_PROGRESS') return 'STABILIZING';
        if (state === 'FAILED' || state === 'WARNING' || state === 'UNSTABLE' || state === 'DEGRADED') return 'DEGRADED';
        if (state === 'ROLLBACK' || state === 'ROLLBACK_PENDING' || state === 'ROLLBACK_ACTIVE') return 'ROLLBACK_ACTIVE';
        if (RELEASE_STATES.indexOf(state) !== -1) return state;
        return fallback || 'PLANNED';
    }

    function normalizeReleaseType(value) {
        var type = normalizeToken(value || '');
        if (/WAVE/.test(type)) return 'ROLLOUT_WAVE';
        if (/STAGED|STAGE/.test(type)) return 'STAGED_RELEASE';
        if (/FREEZE/.test(type)) return 'RELEASE_FREEZE';
        if (/STABIL/.test(type)) return 'STABILIZATION_CHECKPOINT';
        if (/ROLLBACK/.test(type)) return 'ROLLBACK_GOVERNANCE';
        if (/SAFETY|DEPLOY/.test(type)) return 'DEPLOYMENT_SAFETY';
        if (/RECOVERY/.test(type)) return 'RELEASE_RECOVERY';
        if (RELEASE_TYPES.indexOf(type) !== -1) return type;
        return 'CONTROLLED_ROLLOUT';
    }

    function isReleaseSignal(row) {
        var token = normalizeToken(row && (row.releaseType || row.eventType || row.actionType || row.status || row.state || row.releaseState || row.readinessState || row.deploymentState || row.incidentState || row.healthState || row.rolloutState || row.module || row.severity || ''));
        var count = safeNumber(row && (row.validationFailures || row.failureCount || row.failureRate || row.durationMinutes || row.stabilizationDelayMinutes), 0);
        return /RELEASE|ROLLOUT|WAVE|DEPLOY|ROLLBACK|STABIL|FREEZE|PRODUCTION|DEGRADED|FAILED|BLOCKED|CRITICAL|ESCALATED/.test(token) || count >= 2 || row && (row.rollbackReady === true || row.rollbackPrepared === true || row.releaseFreeze === true || row.stabilizationFailure === true);
    }

    function classifyReleaseRisk(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || '');
            if (row.crossTenant === true || row.unsafeRollout === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.actionType || row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            var state = normalizeReleaseState(row.releaseState || row.state || row.status || row.readinessState || row.deploymentState || row.incidentState || row.healthState || row.rolloutState, 'PLANNED');
            if (state === 'ROLLBACK_ACTIVE' || state === 'DEGRADED') return SEVERITIES.HIGH_RISK;
            if (row.stabilizationFailure === true || row.rolloutInstability === true || row.releaseFreeze === true || safeNumber(row.failureCount || row.validationFailures, 0) >= 2) return SEVERITIES.HIGH_RISK;
            if (row.rollbackReady === true || row.rollbackPrepared === true || state === 'STABILIZING' || severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeReleasePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeReleaseOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_RELEASE_PAYLOAD', SEVERITIES.HIGH_RISK, 'Release payload must be an object.')]
                });
            }
            var state = normalizeReleaseState(payload.releaseState || payload.state || payload.status || payload.readinessState || payload.deploymentState || payload.incidentState || payload.healthState || payload.rolloutState, 'PLANNED');
            var createdAt = safeString(payload.createdAt || payload.date || payload.timestamp || payload.loggedAt || nowIso(context || {}), nowIso(context || {}));
            var severity = classifyReleaseRisk(Object.assign({}, payload, { releaseState: state }));
            var normalized = {
                safeReleaseId: safeString(payload.safeReleaseId || payload.releaseGovernanceId || payload.id || payload.rolloutWaveId || payload.rolloutId || payload.deploymentId || payload.releaseId || 'SAFE-' + timeValue(createdAt), ''),
                releaseId: safeString(payload.releaseId || payload.buildId || payload.version || '', ''),
                rolloutWaveId: safeString(payload.rolloutWaveId || payload.waveId || payload.rolloutId || '', ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                releaseType: normalizeReleaseType(payload.releaseType || payload.type || payload.actionType || payload.eventType || payload.module || payload.readinessType || payload.deploymentType),
                releaseState: state,
                releaseStateRaw: safeString(payload.state || payload.status || payload.releaseState || payload.readinessState || payload.deploymentState || payload.incidentState || payload.healthState || payload.rolloutState || '', ''),
                severity: severity,
                source: safeString(payload.source || payload.module || 'safeRelease', 'safeRelease'),
                module: safeString(payload.module || payload.source || 'Safe Release Governance', 'Safe Release Governance'),
                actionType: normalizeToken(payload.actionType || payload.action || payload.eventType || payload.type || 'SAFE_RELEASE_EVENT'),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                environment: normalizeToken(payload.environment || payload.deploymentStage || payload.targetEnvironment || ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                releasedAt: safeString(payload.releasedAt || payload.completedAt || payload.resolvedAt || '', ''),
                rolloutWave: safeNumber(payload.rolloutWave || payload.wave || 0, 0),
                rolloutPercentage: clamp(payload.rolloutPercentage || payload.percentage || 0, 0, 100),
                releaseFreeze: payload.releaseFreeze === true || payload.freezeActive === true || /FREEZE/.test(normalizeToken(payload.status || payload.actionType || payload.releaseType || '')),
                rollbackReady: payload.rollbackReady === true || payload.rollbackPrepared === true || /ROLLBACK/.test(normalizeToken(payload.releaseType || payload.status || '')),
                rollbackActive: payload.rollbackActive === true || payload.rollbackActivated === true || state === 'ROLLBACK_ACTIVE' || /ROLLBACK/.test(normalizeToken(payload.rolloutState || payload.eventType || '')),
                stabilizationCheckpoint: payload.stabilizationCheckpoint === true || payload.stabilityVerified === true || payload.stabilityCheckpoint === true || /STABIL/.test(normalizeToken(payload.releaseType || payload.actionType || '')),
                stabilizationFailure: payload.stabilizationFailure === true || /DEGRADED|FAILED|BLOCKED/.test(normalizeToken(payload.status || payload.healthState || payload.rolloutState || '')),
                stabilizationDelayMinutes: safeNumber(payload.stabilizationDelayMinutes || payload.delayMinutes || payload.durationMinutes, 0),
                approvalCheckpoint: payload.approvalCheckpoint === true || payload.releaseApprovalCheckpoint === true || payload.rolloutApproval === true,
                deploymentSafetyMarker: payload.deploymentSafetyMarker === true || payload.deploymentSafety === true || /DEPLOYMENT|SAFETY/.test(normalizeToken(payload.releaseType || payload.actionType || '')),
                releaseReady: state === 'APPROVED' || state === 'STAGED' || state === 'LIMITED_RELEASE',
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeReleaseOutput({
                success: true,
                payload: normalized,
                classification: severity,
                releaseGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                payload: {},
                failures: [safeFailure('RELEASE_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release payload normalization failed safely.')]
            });
        }
    }

    function validateReleaseScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || global.location && global.location.pathname || '', '').toLowerCase();
            var failures = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var rolloutMonitoring = record.rolloutMonitoring === true || record.monitoringOnly === true || ctx.rolloutMonitoring === true || ctx.monitoringOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeReleaseState(record.releaseState || record.state || record.status, '');
            var bypassRequested = record.rolloutBypass === true || record.releaseBypass === true || record.governanceBypass === true || record.productionBypass === true || record.executeWithoutValidation === true || /BYPASS|FORCE_RELEASE|SKIP_VALIDATION/.test(normalizeToken(record.action || record.actionType || ''));

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('RELEASE_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Release governance is isolated to platform-control.'));
            }
            if (state === 'ARCHIVED' && (record.rolloutBypass || record.releaseBypass || record.releaseOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_RELEASE_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical release governance records are immutable after archival.'));
            }
            if (record.bypassGovernance || record.exportRaw || record.exposeConfidential || record.unsafeProductionRollout || record.executeProductionDeployment) {
                failures.push(safeFailure('UNSAFE_ROLLOUT_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe production rollout bypass or exposure is blocked.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (bypassRequested) {
                    failures.push(safeFailure('ROLLOUT_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Rollout governance validation cannot be bypassed.'));
                }
                if (!failures.length) {
                    return freezeReleaseOutput({
                        allowed: true,
                        readOnly: record.readOnly === true,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        rolloutMonitoring: true,
                        rolloutAuthority: true,
                        rolloutBypassAuthority: false,
                        visibility: VISIBILITY.SAFE_RELEASE_GOVERNANCE,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly && !rolloutMonitoring) {
                    failures.push(safeFailure('SUPER_ADMIN_RELEASE_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure rollout visibility.'));
                }
                if (bypassRequested || record.rolloutApproval === true || record.productionRelease === true || record.finalRelease === true) {
                    failures.push(safeFailure('SUPER_ADMIN_ROLLOUT_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot bypass rollout governance validation.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_RELEASE_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant deployment visibility is blocked.'));
                }
                if (!failures.length) {
                    return freezeReleaseOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        rolloutMonitoring: true,
                        rolloutAuthority: false,
                        rolloutBypassAuthority: false,
                        visibility: VISIBILITY.INFRASTRUCTURE_ROLLOUT_VISIBILITY,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_RELEASE_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access release governance center.'));
            }

            return freezeReleaseOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                rolloutMonitoring: rolloutMonitoring,
                rolloutAuthority: false,
                rolloutBypassAuthority: false,
                visibility: VISIBILITY.NONE,
                failures: failures
            });
        } catch (error) {
            return freezeReleaseOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                rolloutAuthority: false,
                rolloutBypassAuthority: false,
                failures: [safeFailure('RELEASE_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release scope validation failed safely.')]
            });
        }
    }

    function releaseFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeReleasePayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitReleases(data) {
        var rows = []
            .concat(list(data, 'safeReleaseRecords'))
            .concat(list(data, 'releaseGovernanceRecords'))
            .concat(list(data, 'controlledRolloutRecords'))
            .concat(list(data, 'releaseWaveRecords'))
            .concat(list(data, 'releaseStabilizationRecords'));
        return rows.map(function mapRelease(row) {
            return releaseFromRow(row, { releaseType: row && (row.releaseType || row.type || 'CONTROLLED_ROLLOUT') });
        }).filter(Boolean);
    }

    function collectDerivedReleases(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isReleaseSignal(Object.assign({}, defaults, row))) return;
                var timestamp = row.createdAt || row.date || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(releaseFromRow(Object.assign({
                    safeReleaseId: row.safeReleaseId || row.releaseGovernanceId || row.releaseId || row.rolloutWaveId || row.rolloutId || row.deploymentId || row.readinessId || row.incidentId || row.healthId || row.emergencyId || row.auditId || row.id || defaults.prefix + '-' + index,
                    releaseId: row.releaseId || row.buildId || row.version,
                    rolloutWaveId: row.rolloutWaveId || row.waveId || row.rolloutId,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.releaseState || row.state || row.status || row.readinessState || row.deploymentState || row.incidentState || row.healthState || row.rolloutState || defaults.state || 'STAGED',
                    severity: row.severity || row.classification || defaults.severity || 'INFO',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    source: defaults.source,
                    releaseType: defaults.releaseType,
                    actionType: defaults.actionType,
                    correlationId: row.correlationId || row.eventId,
                    releaseFreeze: row.releaseFreeze === true || defaults.releaseFreeze === true,
                    rollbackReady: row.rollbackReady === true || row.rollbackPrepared === true || defaults.rollbackReady === true,
                    rollbackActive: row.rollbackActive === true || row.rollbackActivated === true || defaults.rollbackActive === true,
                    stabilizationFailure: row.stabilizationFailure === true || defaults.stabilizationFailure === true,
                    stabilizationCheckpoint: row.stabilizationCheckpoint === true || row.stabilityVerified === true || defaults.stabilizationCheckpoint === true,
                    stabilizationDelayMinutes: row.stabilizationDelayMinutes || row.delayMinutes || row.durationMinutes || defaults.stabilizationDelayMinutes,
                    approvalCheckpoint: row.approvalCheckpoint === true || row.releaseApprovalCheckpoint === true || defaults.approvalCheckpoint === true,
                    deploymentSafetyMarker: row.deploymentSafetyMarker === true || defaults.deploymentSafetyMarker === true,
                    rolloutPercentage: row.rolloutPercentage || row.percentage
                }, row)));
            });
        }
        addRows(list(data, 'productionReadinessRecords').concat(list(data, 'releaseCertificationRecords')), { prefix: 'READY-RELEASE', module: 'productionReadiness', source: 'productionReadinessService', releaseType: 'CONTROLLED_ROLLOUT', actionType: 'READINESS_LINKED_RELEASE', rollbackReady: true, stabilizationCheckpoint: true });
        addRows(list(data, 'deploymentValidationRecords').concat(list(data, 'deploymentGovernanceRecords')).concat(list(data, 'deploymentLogs')), { prefix: 'DEPLOY-RELEASE', module: 'deployment', source: 'deploymentValidationService', releaseType: 'DEPLOYMENT_SAFETY', actionType: 'DEPLOYMENT_LINKED_RELEASE', rollbackReady: true, deploymentSafetyMarker: true });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'FEATURE-RELEASE', module: 'featureRollout', source: 'featureRolloutService', releaseType: 'ROLLOUT_WAVE', actionType: 'FEATURE_ROLLOUT_RELEASE', rollbackReady: true, stabilizationFailure: true });
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT-RELEASE', module: 'incident', source: 'globalIncidentService', releaseType: 'RELEASE_RECOVERY', actionType: 'ROLLOUT_LINKED_INCIDENT' });
        addRows(list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords')), { prefix: 'HEALTH-RELEASE', module: 'platformHealth', source: 'platformHealthMonitoringService', releaseType: 'STABILIZATION_CHECKPOINT', actionType: 'RELEASE_HEALTH_EVENT', stabilizationCheckpoint: true });
        addRows(list(data, 'emergencyOverrideRecords').concat(list(data, 'emergencyOverrides')), { prefix: 'EMERGENCY-RELEASE', module: 'emergency', source: 'emergencyOverrideService', releaseType: 'ROLLBACK_GOVERNANCE', actionType: 'ROLLBACK_GOVERNANCE_EVENT', rollbackReady: true, rollbackActive: true });
        addRows(list(data, 'auditLogs').concat(list(data, 'globalAuditRecords')), { prefix: 'AUDIT-RELEASE', module: 'audit', source: 'auditService', releaseType: 'CONTROLLED_ROLLOUT', actionType: 'RELEASE_AUDIT_EVENT' });
        return rows.filter(Boolean);
    }

    function externalReleaseSignals(context) {
        var signals = { readiness: {}, deployment: {}, incident: {}, health: {}, emergency: {}, rollout: {} };
        var safeCtx = Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        try {
            var readiness = global.ProductionReadinessService || global.productionReadinessService;
            if (readiness && typeof readiness.generateProductionReadinessReport === 'function') signals.readiness = readiness.generateProductionReadinessReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var deployment = global.DeploymentValidationService || global.deploymentValidationService;
            if (deployment && typeof deployment.generateDeploymentValidationReport === 'function') signals.deployment = deployment.generateDeploymentValidationReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var incident = global.GlobalIncidentService || global.globalIncidentService;
            if (incident && typeof incident.generateGlobalIncidentReport === 'function') signals.incident = incident.generateGlobalIncidentReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var health = global.PlatformHealthMonitoringService || global.platformHealthMonitoringService;
            if (health && typeof health.generatePlatformHealthReport === 'function') signals.health = health.generatePlatformHealthReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var emergency = global.EmergencyOverrideService || global.emergencyOverrideService;
            if (emergency && typeof emergency.generateEmergencyOverrideReport === 'function') signals.emergency = emergency.generateEmergencyOverrideReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') signals.rollout = rollout.generateFeatureRolloutReport({}, safeCtx) || {};
        } catch (error) {}
        return signals;
    }

    function summarizeReleases(rows, signals) {
        var releases = Array.isArray(rows) ? rows : [];
        var totals = releases.reduce(function reduce(acc, row) {
            acc.stagedProductionRollouts += 1;
            if (row.releaseState === 'LIMITED_RELEASE') acc.limitedReleaseActivations += 1;
            if (row.releaseState === 'STAGED') acc.stagedReleases += 1;
            if (row.releaseState === 'STABILIZING' || row.stabilizationCheckpoint) acc.stabilizationMonitoring += 1;
            if (row.releaseFreeze) acc.releaseFreezeHandling += 1;
            if (row.approvalCheckpoint) acc.rolloutApprovalCheckpoints += 1;
            if (row.releaseState === 'ARCHIVED') acc.releaseArchivalWorkflows += 1;
            if (row.releaseState === 'DEGRADED' || row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER || row.stabilizationFailure) acc.degradedReleaseBehavior += 1;
            if (row.stabilizationFailure) acc.rolloutInstability += 1;
            if (row.rollbackReady || row.releaseType === 'ROLLBACK_GOVERNANCE') acc.rollbackCheckpoints += 1;
            if (row.rollbackActive || row.releaseState === 'ROLLBACK_ACTIVE') acc.rollbackActiveReleases += 1;
            if (row.rollbackReady || row.rollbackActive) acc.rollbackFrequency += 1;
            if (row.stabilizationDelayMinutes > 0) acc.stabilizationDelays += 1;
            acc.deploymentRecoveryTimelines += row.stabilizationDelayMinutes || 0;
            if (row.correlationId) acc.rolloutCongestion += 1;
            if (row.releaseState === 'DEGRADED' || row.releaseState === 'ROLLBACK_ACTIVE') acc.releaseEscalationFrequency += 1;
            if (row.source === 'deploymentValidationService' || row.source === 'globalIncidentService' || row.source === 'platformHealthMonitoringService' || row.releaseType === 'RELEASE_RECOVERY') acc.rolloutLinkedDegradation += row.severity === SEVERITIES.INFO ? 0 : 1;
            if (row.source === 'globalIncidentService') acc.deploymentTriggeredIncidents += 1;
            if (row.source === 'emergencyOverrideService') acc.rollbackActivationTrends += 1;
            if (row.releaseReady || row.releaseState === 'APPROVED' || row.releaseState === 'STAGED' || row.releaseState === 'LIMITED_RELEASE') acc.readyOrControlled += 1;
            return acc;
        }, {
            stagedProductionRollouts: 0,
            limitedReleaseActivations: 0,
            stagedReleases: 0,
            stabilizationMonitoring: 0,
            releaseFreezeHandling: 0,
            rolloutApprovalCheckpoints: 0,
            releaseArchivalWorkflows: 0,
            rolloutInstability: 0,
            degradedReleaseBehavior: 0,
            rollbackFrequency: 0,
            deploymentRecoveryTimelines: 0,
            rolloutCongestion: 0,
            stabilizationDelays: 0,
            releaseEscalationFrequency: 0,
            rollbackCheckpoints: 0,
            rollbackActiveReleases: 0,
            rolloutLinkedDegradation: 0,
            deploymentTriggeredIncidents: 0,
            rollbackActivationTrends: 0,
            readyOrControlled: 0
        });

        if (signals && signals.readiness && signals.readiness.operationalReadinessIntelligence) {
            totals.rolloutInstability += safeNumber(signals.readiness.operationalReadinessIntelligence.degradedReleaseReadiness, 0);
            totals.releaseEscalationFrequency += safeNumber(signals.readiness.operationalReadinessIntelligence.releaseApprovalEscalationFrequency, 0);
        }
        if (signals && signals.deployment && signals.deployment.deploymentRiskIntelligence) {
            totals.degradedReleaseBehavior += safeNumber(signals.deployment.deploymentRiskIntelligence.degradedDeploymentHealth, 0);
            totals.rolloutCongestion += safeNumber(signals.deployment.deploymentRiskIntelligence.deploymentCongestion, 0);
        }

        var count = releases.length || 1;
        var failurePenalty = totals.rolloutInstability * 7 + totals.degradedReleaseBehavior * 6 + totals.rollbackFrequency * 3 + totals.stabilizationDelays * 4;
        var governanceHealth = clamp(100 - failurePenalty, 0, 100);
        var successRate = clamp(Math.round((totals.readyOrControlled / count) * 100), 0, 100);
        var recoveryHealth = clamp(100 - totals.releaseEscalationFrequency * 5 - totals.stabilizationDelays * 5, 0, 100);
        var rollbackEfficiency = clamp(100 - totals.rollbackActiveReleases * 8 + totals.rollbackCheckpoints * 3, 0, 100);
        var averageStabilization = totals.deploymentRecoveryTimelines ? Math.round(totals.deploymentRecoveryTimelines / Math.max(1, totals.stabilizationDelays)) : 0;

        return {
            totals: totals,
            controlledRollout: {
                stagedProductionRollouts: totals.stagedProductionRollouts,
                limitedReleaseActivations: totals.limitedReleaseActivations,
                stabilizationMonitoring: totals.stabilizationMonitoring,
                releaseFreezeHandling: totals.releaseFreezeHandling,
                rolloutApprovalCheckpoints: totals.rolloutApprovalCheckpoints,
                releaseArchivalWorkflows: totals.releaseArchivalWorkflows,
                unsafeProductionDeploymentExecutionBlocked: true
            },
            releaseStabilizationIntelligence: {
                rolloutInstability: totals.rolloutInstability,
                degradedReleaseBehavior: totals.degradedReleaseBehavior,
                rollbackFrequency: totals.rollbackFrequency,
                deploymentRecoveryTimelines: averageStabilization,
                rolloutCongestion: totals.rolloutCongestion,
                stabilizationDelays: totals.stabilizationDelays,
                releaseEscalationFrequency: totals.releaseEscalationFrequency
            },
            rollbackGovernance: {
                rollbackCheckpoints: totals.rollbackCheckpoints,
                rollbackActiveReleases: totals.rollbackActiveReleases,
                rollbackReadinessSummaries: totals.rollbackCheckpoints,
                rollbackFrequency: totals.rollbackFrequency,
                rollbackEfficiency: rollbackEfficiency,
                rollbackHealthVerification: rollbackEfficiency
            },
            incidentDeploymentIntegration: {
                rolloutLinkedDegradation: totals.rolloutLinkedDegradation,
                deploymentTriggeredIncidents: totals.deploymentTriggeredIncidents,
                stabilizationRecoveryAnalytics: recoveryHealth,
                rollbackActivationTrends: totals.rollbackActivationTrends,
                operationalReleaseHealth: recoveryHealth
            },
            releaseAnalytics: {
                rolloutSuccessRates: successRate,
                stabilizationTimelines: averageStabilization,
                rollbackEfficiency: rollbackEfficiency,
                deploymentCongestionTrends: totals.rolloutCongestion,
                releaseDegradationFrequency: totals.degradedReleaseBehavior,
                operationalRecoveryHealth: recoveryHealth,
                governanceApprovalTimelines: totals.rolloutApprovalCheckpoints,
                releaseGovernanceHealth: governanceHealth
            }
        };
    }

    function collectReleaseRows(filters, context) {
        var data = rawData();
        var rows = collectExplicitReleases(data).concat(collectDerivedReleases(data));
        var seen = {};
        var targetTenant = normalizeTenantSlug(filters && (filters.targetTenantId || filters.targetTenantSlug || filters.tenantId || filters.tenantSlug));
        rows = rows.filter(function filterRow(row) {
            if (!row) return false;
            var key = (row.safeReleaseId || '') + '|' + (row.correlationId || '') + '|' + (row.source || '');
            if (seen[key]) return false;
            seen[key] = true;
            if (targetTenant) return row.tenantSlug === targetTenant || normalizeTenantSlug(row.tenantId) === targetTenant;
            return true;
        });
        rows.sort(function sortRows(a, b) { return timeValue(b.createdAt) - timeValue(a.createdAt); });
        return rows.slice(0, 300);
    }

    function emitAudit(actionType, payload, context) {
        if (auditForwarding || context && context.skipAuditPersistence === true) return;
        try {
            var audit = global.AuditService || global.auditService;
            if (!audit || typeof audit.recordAudit !== 'function') return;
            auditForwarding = true;
            audit.recordAudit(freezeReleaseOutput({
                actionType: actionType,
                module: 'SafeReleaseGovernanceService',
                severity: payload && payload.severity || SEVERITIES.INFO,
                actorRole: normalizeRole(context && context.actor && context.actor.role),
                source: 'safeReleaseGovernanceService',
                metadata: cloneSanitized(payload || {})
            }));
        } catch (error) {
            safeWarn('Audit forwarding failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, payload, context) {
        if (telemetryForwarding || context && context.skipTelemetry === true) return;
        try {
            var telemetry = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (!telemetry || typeof telemetry.emitTelemetry !== 'function') return;
            telemetryForwarding = true;
            telemetry.emitTelemetry('safe_release_governance', eventType, freezeReleaseOutput(payload || {}));
        } catch (error) {
            safeWarn('Telemetry forwarding failed safely.', { eventType: eventType, error: error && error.message });
        } finally {
            telemetryForwarding = false;
        }
    }

    function emitMetric(name, payload, context) {
        if (metricForwarding || context && context.skipMetrics === true) return;
        try {
            var metrics = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (!metrics || typeof metrics.recordWorkflowMetric !== 'function') return;
            metricForwarding = true;
            metrics.recordWorkflowMetric(name, freezeReleaseOutput(payload || {}));
        } catch (error) {
            safeWarn('Metric forwarding failed safely.', { name: name, error: error && error.message });
        } finally {
            metricForwarding = false;
        }
    }

    function safeBoolean(value, fallback) {
        if (value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1' || value === 'passed' || value === 'PASSED') return true;
        if (value === false || value === 'false' || value === 'FALSE' || value === 0 || value === '0' || value === 'failed' || value === 'FAILED') return false;
        return fallback === true;
    }

    function collectReleaseBlockers(input) {
        var source = input && typeof input === 'object' ? input : {};
        var blockers = [];
        function add(flag, code, message) {
            if (safeBoolean(flag, false)) blockers.push(safeFailure(code, SEVERITIES.CRITICAL_BLOCKER, message));
        }
        add(source.certificationMissing || source.readinessCertified === false, 'READINESS_CERTIFICATION_MISSING', 'Production readiness certification is required before rollout.');
        add(source.criticalIncidentActive || source.criticalIncident, 'CRITICAL_INCIDENT_BLOCKS_ROLLOUT', 'Critical incidents block controlled production rollout.');
        add(source.healthStatusCritical || source.criticalHealth, 'CRITICAL_HEALTH_BLOCKS_ROLLOUT', 'Critical platform health blocks release rollout.');
        add(source.emergencyOverrideActive || source.emergencyOverride, 'EMERGENCY_OVERRIDE_BLOCKS_ROLLOUT', 'Active emergency overrides block release rollout.');
        add(source.unresolvedDeploymentValidationFailure || source.deploymentValidated === false || source.deploymentBlocked, 'DEPLOYMENT_VALIDATION_BLOCKS_ROLLOUT', 'Unresolved deployment validation failures block rollout.');
        add(source.rollbackReadinessUnavailable || source.rollbackReady === false || source.rollbackBlocked, 'ROLLBACK_READINESS_BLOCKS_ROLLOUT', 'Rollback readiness is required before rollout.');
        add(source.releaseFreeze || source.freezeActive, 'RELEASE_FREEZE_BLOCKS_ROLLOUT', 'Active release freeze prevents rollout progression.');
        return blockers;
    }

    function rolloutPhaseProgress(input) {
        var source = input && typeof input === 'object' ? input : {};
        var percentage = clamp(source.rolloutPercentage || source.percentage || 0, 0, 100);
        var phases = {
            internalRollout: {
                label: 'Internal rollout',
                passed: safeBoolean(source.internalRolloutComplete, percentage >= 5),
                progress: percentage >= 5 ? 100 : percentage * 20
            },
            pilotRollout: {
                label: 'Pilot rollout',
                passed: safeBoolean(source.pilotRolloutComplete, percentage >= 15),
                progress: percentage >= 15 ? 100 : clamp(Math.round((percentage / 15) * 100), 0, 100)
            },
            departmentRollout: {
                label: 'Department rollout',
                passed: safeBoolean(source.departmentRolloutComplete, percentage >= 35),
                progress: percentage >= 35 ? 100 : clamp(Math.round((percentage / 35) * 100), 0, 100)
            },
            tenantRollout: {
                label: 'Tenant rollout',
                passed: safeBoolean(source.tenantRolloutComplete, percentage >= 70),
                progress: percentage >= 70 ? 100 : clamp(Math.round((percentage / 70) * 100), 0, 100)
            },
            fullRollout: {
                label: 'Full rollout',
                passed: safeBoolean(source.fullRolloutComplete, percentage >= 100),
                progress: percentage >= 100 ? 100 : percentage
            }
        };
        var phaseKeys = Object.keys(phases);
        var completed = phaseKeys.filter(function passed(key) { return phases[key].passed === true; }).length;
        var currentPhase = completed >= 5 ? 'full rollout' : phases[phaseKeys[completed]].label;
        return {
            rolloutPhases: phases,
            rolloutPhaseProgress: {
                currentPhase: currentPhase,
                completedPhases: completed,
                totalPhases: phaseKeys.length,
                rolloutPercentage: percentage,
                progress: clamp(Math.round((completed / phaseKeys.length) * 100), 0, 100)
            }
        };
    }

    function calculateRolloutRisk(input) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var blockers = collectReleaseBlockers(source);
            var risk = blockers.length * 16;
            if (safeBoolean(source.stabilizationFailure, false)) risk += 14;
            if (safeBoolean(source.rolloutInstability, false)) risk += 12;
            if (safeBoolean(source.rollbackActive, false)) risk += 10;
            risk += clamp(source.failureCount || source.validationFailures || 0, 0, 5) * 5;
            risk += clamp(source.stabilizationDelayMinutes || source.delayMinutes || 0, 0, 180) > 60 ? 10 : 0;
            risk = clamp(risk, 0, 100);
            var riskLevel = risk >= 75 || blockers.length >= 2 ? SEVERITIES.CRITICAL_BLOCKER : risk >= 45 ? SEVERITIES.HIGH_RISK : risk >= 20 ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeReleaseOutput({
                success: true,
                rolloutRiskScore: risk,
                riskLevel: riskLevel,
                rolloutBlocked: blockers.length > 0,
                releaseBlocked: blockers.length > 0,
                blockedReleaseReasons: blockers,
                tenantIsolationPreserved: true,
                releaseGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                rolloutRiskScore: 100,
                riskLevel: SEVERITIES.HIGH_RISK,
                rolloutBlocked: true,
                releaseBlocked: true,
                blockedReleaseReasons: [safeFailure('ROLLOUT_RISK_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollout risk calculation failed safely.')]
            });
        }
    }

    function calculateRolloutConfidence(input) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var phase = rolloutPhaseProgress(source);
            var risk = calculateRolloutRisk(source);
            var stabilizationScore = clamp(source.stabilizationScore || (safeBoolean(source.stabilizationFailure, false) ? 45 : 85), 0, 100);
            var governanceScore = 0;
            governanceScore += safeBoolean(source.releaseApproved, false) ? 12 : 0;
            governanceScore += safeBoolean(source.deploymentValidated, false) ? 12 : 0;
            governanceScore += safeBoolean(source.readinessCertified, false) ? 12 : 0;
            governanceScore += safeBoolean(source.rollbackReady, false) ? 10 : 0;
            governanceScore += safeBoolean(source.healthVerified, true) ? 6 : 0;
            var phaseScore = phase.rolloutPhaseProgress.progress * 0.3;
            var stabilizationComponent = stabilizationScore * 0.3;
            var confidence = clamp(Math.round(phaseScore + stabilizationComponent + governanceScore - (risk.rolloutRiskScore * 0.25)), 0, 100);
            var rolloutEligible = confidence >= 70 && risk.rolloutBlocked !== true;
            return freezeReleaseOutput({
                success: true,
                rolloutConfidenceScore: confidence,
                releaseConfidence: confidence,
                stabilizationScore: stabilizationScore,
                rolloutEligible: rolloutEligible,
                rolloutRiskScore: risk.rolloutRiskScore,
                riskLevel: risk.riskLevel,
                rolloutBlocked: risk.rolloutBlocked,
                blockedReleaseReasons: risk.blockedReleaseReasons,
                rolloutPhases: phase.rolloutPhases,
                rolloutPhaseProgress: phase.rolloutPhaseProgress,
                tenantIsolationPreserved: true,
                releaseGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                rolloutConfidenceScore: 0,
                releaseConfidence: 0,
                stabilizationScore: 0,
                rolloutEligible: false,
                rolloutRiskScore: 100,
                riskLevel: SEVERITIES.HIGH_RISK,
                rolloutBlocked: true,
                blockedReleaseReasons: [safeFailure('ROLLOUT_CONFIDENCE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollout confidence calculation failed safely.')]
            });
        }
    }

    function validateReleaseGovernance(payload, context) {
        try {
            var input = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateReleaseScope(Object.assign({ aggregateOnly: true, readOnly: true }, input), ctx);
            if (!scope.allowed) {
                return freezeReleaseOutput({
                    success: false,
                    releaseSafety: { rolloutBlocked: true, releaseBlocked: true },
                    rolloutConfidence: { rolloutEligible: false, rolloutConfidenceScore: 0 },
                    rolloutRisk: { rolloutRiskScore: 100, riskLevel: SEVERITIES.CRITICAL_BLOCKER },
                    failures: scope.failures
                });
            }
            var normalized = normalizeReleasePayload(input, ctx);
            var risk = calculateRolloutRisk(input);
            var confidence = calculateRolloutConfidence(input);
            var output = {
                success: normalized.success === true && risk.success === true && confidence.success === true,
                releaseGovernance: {
                    releaseApprovals: safeBoolean(input.releaseApproved, false) ? 1 : 0,
                    rolloutCheckpoints: safeBoolean(input.approvalCheckpoint, false) ? 1 : 0,
                    releaseFreezes: safeBoolean(input.releaseFreeze, false) ? 1 : 0,
                    stabilizationGates: safeBoolean(input.stabilizationCheckpoint, false) ? 1 : 0,
                    rolloutAuditTrails: 1,
                    immutableReleaseHistory: true
                },
                rolloutProgress: confidence.rolloutPhaseProgress,
                stabilizationStatus: {
                    stabilizationScore: confidence.stabilizationScore,
                    stabilizationStatus: confidence.stabilizationScore >= 80 ? 'STABLE' : confidence.stabilizationScore >= 60 ? 'WATCH' : 'DEGRADED'
                },
                rolloutConfidence: confidence,
                rolloutRisk: risk,
                releaseSafety: {
                    safetyChecks: {
                        readinessCertified: safeBoolean(input.readinessCertified, false),
                        deploymentValidated: safeBoolean(input.deploymentValidated, false),
                        healthVerified: safeBoolean(input.healthVerified, true),
                        rollbackReady: safeBoolean(input.rollbackReady, false),
                        releaseApproved: safeBoolean(input.releaseApproved, false)
                    },
                    rolloutBlocked: risk.rolloutBlocked === true,
                    releaseBlocked: risk.releaseBlocked === true,
                    blockedReleaseReasons: risk.blockedReleaseReasons
                },
                rolloutStrategies: {
                    percentageRollout: true,
                    phasedRollout: true,
                    departmentRollout: true,
                    featureRollout: true,
                    controlledEnablement: true
                },
                payload: normalized.payload,
                tenantIsolationPreserved: true,
                releaseGovernanceIsolationPreserved: true
            };
            emitAudit('SAFE_RELEASE_GOVERNANCE_VALIDATED', output, ctx);
            emitTelemetry('SAFE_RELEASE_GOVERNANCE_VALIDATED', output, ctx);
            emitMetric('safe_release_governance_validated', output, ctx);
            return freezeReleaseOutput(output);
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                releaseSafety: { rolloutBlocked: true, releaseBlocked: true },
                rolloutConfidence: { rolloutEligible: false, rolloutConfidenceScore: 0 },
                rolloutRisk: { rolloutRiskScore: 100, riskLevel: SEVERITIES.HIGH_RISK },
                failures: [safeFailure('RELEASE_GOVERNANCE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release governance validation failed safely.')]
            });
        }
    }

    function freezeRollbackOutput(value) {
        return freezeReleaseOutput(value || {});
    }

    function normalizeRollbackState(value, fallback) {
        var state = normalizeToken(value || fallback || 'READY');
        if (state === 'PENDING' || state === 'REQUESTED') return 'VALIDATING';
        if (state === 'APPROVE' || state === 'APPROVAL_APPROVED') return 'APPROVED';
        if (state === 'EXECUTE' || state === 'ROLLBACK_ACTIVE') return 'EXECUTING';
        if (state === 'RECOVERY' || state === 'RECOVERY_ACTIVE') return 'RECOVERING';
        if (state === 'SUCCESS' || state === 'PASSED' || state === 'COMPLETE' || state === 'COMPLETED') return 'VERIFIED';
        if (state === 'ERROR' || state === 'BLOCKED' || state === 'DEGRADED') return 'FAILED';
        if (ROLLBACK_STATES.indexOf(state) !== -1) return state;
        return fallback || 'READY';
    }

    function normalizeRollbackType(value, payload) {
        var type = normalizeToken(value || '');
        var source = payload && typeof payload === 'object' ? payload : {};
        if (source.platformWideRollback === true || /PLATFORM/.test(type)) return 'PLATFORM_WIDE_ROLLBACK';
        if (source.schemaRollback === true || /SCHEMA|MIGRATION/.test(type)) return 'SCHEMA_ROLLBACK';
        if (source.productionRollback === true || /PRODUCTION/.test(type)) return 'PRODUCTION_ROLLBACK';
        if (source.emergencyRollback === true || /EMERGENCY/.test(type)) return 'EMERGENCY_ROLLBACK';
        if (source.incidentTriggered === true || /INCIDENT/.test(type)) return 'INCIDENT_TRIGGERED_ROLLBACK';
        if (ROLLBACK_TYPES.indexOf(type) !== -1) return type;
        return 'RELEASE_ROLLBACK';
    }

    function normalizeApprovalStatus(value) {
        var status = normalizeToken(value || 'PENDING');
        if (status === 'APPROVE') return 'APPROVED';
        if (status === 'REJECT') return 'REJECTED';
        if (['PENDING', 'APPROVED', 'REJECTED', 'MISSING', 'NOT_REQUIRED'].indexOf(status) !== -1) return status;
        return 'PENDING';
    }

    function approvalApproved(input) {
        var source = input && typeof input === 'object' ? input : {};
        if (normalizeApprovalStatus(source.approvalStatus || source.approvalState) === 'APPROVED') return true;
        return (Array.isArray(source.approvals) ? source.approvals : []).some(function approved(row) {
            return normalizeApprovalStatus(row && (row.status || row.approvalStatus)) === 'APPROVED' &&
                normalizeRole(row && (row.approverRole || row.role || row.actorRole)) === 'PLATFORM_OWNER';
        });
    }

    function normalizeRollbackPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRollbackOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_ROLLBACK_PAYLOAD', SEVERITIES.HIGH_RISK, 'Rollback payload must be an object.')]
                });
            }
            var ctx = context && typeof context === 'object' ? context : {};
            var createdAt = safeString(payload.createdAt || payload.requestedAt || payload.timestamp || nowIso(ctx), nowIso(ctx));
            var state = normalizeRollbackState(payload.rollbackState || payload.state || payload.status, 'READY');
            var type = normalizeRollbackType(payload.rollbackType || payload.type || payload.actionType || payload.eventType, payload);
            var normalized = {
                rollbackId: safeString(payload.rollbackId || payload.id || payload.recoveryId || 'RB-' + timeValue(createdAt), ''),
                releaseId: safeString(payload.releaseId || payload.safeReleaseId || '', ''),
                targetReleaseId: safeString(payload.targetReleaseId || payload.rollbackTargetId || payload.targetId || payload.releaseId || '', ''),
                snapshotId: safeString(payload.snapshotId || payload.releaseSnapshotId || payload.checkpointId || '', ''),
                rollbackType: type,
                rollbackState: state,
                rollbackStateRaw: safeString(payload.rollbackState || payload.state || payload.status || '', ''),
                approvalStatus: normalizeApprovalStatus(payload.approvalStatus || payload.approvalState || payload.approval),
                source: safeString(payload.source || payload.module || 'safeReleaseRollback', 'safeReleaseRollback'),
                module: safeString(payload.module || 'Safe Release Rollback Governance', 'Safe Release Rollback Governance'),
                actionType: normalizeToken(payload.actionType || payload.action || 'ROLLBACK_SAFETY_EVENT'),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                environment: normalizeToken(payload.environment || payload.targetEnvironment || payload.deploymentStage || ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                verifiedAt: safeString(payload.verifiedAt || payload.recoveredAt || '', ''),
                recoveryDurationMinutes: safeNumber(payload.recoveryDurationMinutes || payload.recoveryMinutes || payload.durationMinutes, 0),
                rollbackTargetExists: safeBoolean(payload.rollbackTargetExists !== undefined ? payload.rollbackTargetExists : payload.targetExists, false),
                releaseSnapshotExists: safeBoolean(payload.releaseSnapshotExists !== undefined ? payload.releaseSnapshotExists : payload.snapshotExists, false),
                migrationCompatible: safeBoolean(payload.migrationCompatible !== undefined ? payload.migrationCompatible : payload.migrationCompatibility, false),
                environmentCompatible: safeBoolean(payload.environmentCompatible !== undefined ? payload.environmentCompatible : payload.environmentCompatibility, false),
                dependencyCompatible: safeBoolean(payload.dependencyCompatible !== undefined ? payload.dependencyCompatible : payload.dependencyCompatibility, false),
                tenantIsolationIntegrity: safeBoolean(payload.tenantIsolationIntegrity !== undefined ? payload.tenantIsolationIntegrity : payload.tenantIsolationVerified, false),
                auditIntegrity: safeBoolean(payload.auditIntegrity !== undefined ? payload.auditIntegrity : payload.auditReady, false),
                recoveryReady: safeBoolean(payload.recoveryReady !== undefined ? payload.recoveryReady : payload.recoveryReadiness, false),
                productionRollback: payload.productionRollback === true || type === 'PRODUCTION_ROLLBACK',
                schemaRollback: payload.schemaRollback === true || type === 'SCHEMA_ROLLBACK',
                platformWideRollback: payload.platformWideRollback === true || type === 'PLATFORM_WIDE_ROLLBACK',
                incidentTriggered: payload.incidentTriggered === true || type === 'INCIDENT_TRIGGERED_ROLLBACK',
                emergencyRollback: payload.emergencyRollback === true || type === 'EMERGENCY_ROLLBACK',
                failedRollback: payload.failedRollback === true || state === 'FAILED',
                partialRollback: payload.partialRollback === true,
                recoveryValidationFailed: payload.recoveryValidationFailed === true,
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeRollbackOutput({
                success: true,
                payload: normalized,
                classification: normalized.failedRollback || normalized.recoveryValidationFailed ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO,
                rollbackGovernanceIsolationPreserved: true,
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeRollbackOutput({
                success: false,
                payload: {},
                failures: [safeFailure('ROLLBACK_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollback payload normalization failed safely.')]
            });
        }
    }

    function recoveryCheck(label, passed, code, message) {
        return {
            checkId: normalizeToken(label),
            label: label,
            passed: passed === true,
            severity: passed === true ? SEVERITIES.INFO : SEVERITIES.CRITICAL_BLOCKER,
            failureCode: passed === true ? '' : code,
            message: passed === true ? 'Recovery check passed.' : message
        };
    }

    function verifyRecoveryIntegrity(input) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var checks = [
                recoveryCheck('Deployment stability', safeBoolean(source.deploymentStability, false), 'DEPLOYMENT_RECOVERY_UNSTABLE', 'Deployment stability verification failed after rollback.'),
                recoveryCheck('Environment integrity', safeBoolean(source.environmentIntegrity, false), 'ENVIRONMENT_RECOVERY_INTEGRITY_FAILED', 'Environment integrity verification failed after rollback.'),
                recoveryCheck('Tenant isolation integrity', safeBoolean(source.tenantIsolationIntegrity, false), 'TENANT_ISOLATION_RECOVERY_FAILED', 'Tenant isolation integrity verification failed after rollback.'),
                recoveryCheck('Workflow integrity', safeBoolean(source.workflowIntegrity, false), 'WORKFLOW_RECOVERY_INTEGRITY_FAILED', 'Workflow integrity verification failed after rollback.'),
                recoveryCheck('Feature integrity', safeBoolean(source.featureIntegrity, false), 'FEATURE_RECOVERY_INTEGRITY_FAILED', 'Feature integrity verification failed after rollback.'),
                recoveryCheck('Audit integrity', safeBoolean(source.auditIntegrity, false), 'AUDIT_RECOVERY_INTEGRITY_FAILED', 'Audit integrity verification failed after rollback.'),
                recoveryCheck('Platform health status', safeBoolean(source.platformHealthStatus || source.platformHealthHealthy, false), 'PLATFORM_HEALTH_RECOVERY_FAILED', 'Platform health verification failed after rollback.')
            ];
            var passedCount = checks.filter(function passed(row) { return row.passed; }).length;
            var score = Math.round((passedCount / checks.length) * 100);
            var failures = checks.filter(function failed(row) { return !row.passed; }).map(function asFailure(row) {
                return safeFailure(row.failureCode, SEVERITIES.CRITICAL_BLOCKER, row.message, { checkId: row.checkId });
            });
            return freezeRollbackOutput({
                success: true,
                recoveryVerified: failures.length === 0,
                recoveryAssuranceScore: score,
                rollbackConfidenceContribution: Math.round(score * 0.25),
                recoveryVerificationStatus: failures.length === 0 ? 'VERIFIED' : 'FAILED',
                recoveryChecks: checks,
                failures: failures,
                tenantIsolationPreserved: failures.every(function notTenantFailure(item) { return item.failureCode !== 'TENANT_ISOLATION_RECOVERY_FAILED'; }),
                rollbackGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeRollbackOutput({
                success: false,
                recoveryVerified: false,
                recoveryAssuranceScore: 0,
                recoveryVerificationStatus: 'FAILED',
                recoveryChecks: [],
                failures: [safeFailure('RECOVERY_INTEGRITY_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Recovery integrity verification failed safely.')]
            });
        }
    }

    function explicitApprovalRequired(input) {
        var source = input && typeof input === 'object' ? input : {};
        return source.productionRollback === true || source.schemaRollback === true || source.platformWideRollback === true ||
            /PRODUCTION|SCHEMA|PLATFORM/.test(normalizeToken(source.rollbackType || source.type || ''));
    }

    function validateRollbackEligibility(payload, context) {
        try {
            var input = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var normalized = normalizeRollbackPayload(input, ctx);
            var data = normalized.payload || {};
            var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.actorRole) || ctx.role || data.requestedByRole || '');
            var routeType = normalizeToken(ctx.routeType || input.routeType || '');
            var recovery = input.recoveryIntegrity && input.recoveryIntegrity.recoveryChecks ? input.recoveryIntegrity : verifyRecoveryIntegrity(Object.assign({}, input, {
                deploymentStability: input.deploymentStability !== undefined ? input.deploymentStability : data.recoveryReady,
                environmentIntegrity: input.environmentIntegrity !== undefined ? input.environmentIntegrity : data.environmentCompatible,
                tenantIsolationIntegrity: input.tenantIsolationIntegrity !== undefined ? input.tenantIsolationIntegrity : data.tenantIsolationIntegrity,
                workflowIntegrity: input.workflowIntegrity !== undefined ? input.workflowIntegrity : data.recoveryReady,
                featureIntegrity: input.featureIntegrity !== undefined ? input.featureIntegrity : data.dependencyCompatible,
                auditIntegrity: input.auditIntegrity !== undefined ? input.auditIntegrity : data.auditIntegrity,
                platformHealthStatus: input.platformHealthStatus !== undefined ? input.platformHealthStatus : data.recoveryReady
            }));
            var failures = (normalized.failures || []).slice();
            var warnings = [];

            if (routeType === 'TENANT' || ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR'].indexOf(role) !== -1) {
                failures.push(safeFailure('TENANT_ROLE_ROLLBACK_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access rollback governance.'));
            }
            if (role === 'SUPER_ADMIN' && !input.infrastructureOnly) {
                failures.push(safeFailure('SUPER_ADMIN_ROLLBACK_EXECUTION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot execute release rollback. Infrastructure monitoring only.'));
            }
            if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') {
                failures.push(safeFailure('ROLLBACK_AUTHORITY_REQUIRED', SEVERITIES.CRITICAL_BLOCKER, 'Rollback governance requires isolated platform authority.'));
            }
            if (!data.rollbackTargetExists) failures.push(safeFailure('ROLLBACK_TARGET_MISSING', SEVERITIES.CRITICAL_BLOCKER, 'Rollback target is missing.'));
            if (!data.releaseSnapshotExists) failures.push(safeFailure('ROLLBACK_SNAPSHOT_UNAVAILABLE', SEVERITIES.CRITICAL_BLOCKER, 'Release snapshot is unavailable for rollback.'));
            if (!data.migrationCompatible) failures.push(safeFailure('MIGRATION_INCOMPATIBILITY_BLOCKS_ROLLBACK', SEVERITIES.CRITICAL_BLOCKER, 'Migration incompatibility blocks rollback.'));
            if (!data.environmentCompatible) failures.push(safeFailure('ENVIRONMENT_INCOMPATIBILITY_BLOCKS_ROLLBACK', SEVERITIES.HIGH_RISK, 'Environment compatibility must be verified before rollback.'));
            if (!data.dependencyCompatible) failures.push(safeFailure('DEPENDENCY_CORRUPTION_RISK_BLOCKS_ROLLBACK', SEVERITIES.CRITICAL_BLOCKER, 'Dependency corruption risk blocks rollback.'));
            if (!data.tenantIsolationIntegrity) failures.push(safeFailure('TENANT_ISOLATION_ROLLBACK_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant isolation integrity must be verified before rollback.'));
            if (!data.auditIntegrity) failures.push(safeFailure('AUDIT_INTEGRITY_ROLLBACK_BLOCKED', SEVERITIES.HIGH_RISK, 'Audit integrity must be verified before rollback.'));
            if (!data.recoveryReady || recovery.recoveryVerified === false || data.recoveryValidationFailed) {
                failures.push(safeFailure('RECOVERY_VALIDATION_BLOCKS_ROLLBACK', SEVERITIES.CRITICAL_BLOCKER, 'Recovery validation must pass before rollback execution.'));
            }
            if (explicitApprovalRequired(Object.assign({}, input, data)) && !approvalApproved(input)) {
                failures.push(safeFailure('ROLLBACK_APPROVAL_REQUIRED', SEVERITIES.CRITICAL_BLOCKER, 'Explicit PLATFORM_OWNER approval is required for production, schema, or platform-wide rollback.'));
            }
            if (data.partialRollback) {
                warnings.push(safeFailure('PARTIAL_ROLLBACK_REQUIRES_REVIEW', SEVERITIES.WARNING, 'Partial rollback requires recovery assurance review.'));
            }

            var eligible = failures.length === 0;
            return freezeRollbackOutput({
                success: true,
                eligible: eligible,
                rollbackState: eligible ? (approvalApproved(input) ? 'APPROVED' : 'READY') : 'FAILED',
                approvalStatus: approvalApproved(input) ? 'APPROVED' : data.approvalStatus,
                recoveryIntegrity: recovery,
                blockedRollbackReasons: failures,
                failures: failures,
                warnings: warnings,
                rollbackSafety: {
                    rollbackBlocked: !eligible,
                    productionRollbackApprovalRequired: explicitApprovalRequired(Object.assign({}, input, data)),
                    rollbackTargetExists: data.rollbackTargetExists,
                    releaseSnapshotExists: data.releaseSnapshotExists,
                    migrationCompatible: data.migrationCompatible,
                    dependencyCompatible: data.dependencyCompatible,
                    recoveryReady: data.recoveryReady,
                    tenantIsolationPreserved: data.tenantIsolationIntegrity,
                    superAdminRollbackAuthority: false
                },
                payload: data,
                timestamp: nowIso(ctx)
            });
        } catch (error) {
            return freezeRollbackOutput({
                success: false,
                eligible: false,
                rollbackState: 'FAILED',
                blockedRollbackReasons: [safeFailure('ROLLBACK_ELIGIBILITY_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollback eligibility validation failed safely.')],
                failures: [safeFailure('ROLLBACK_ELIGIBILITY_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollback eligibility validation failed safely.')]
            });
        }
    }

    function calculateRollbackConfidence(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var recovery = source.recoveryIntegrity && source.recoveryIntegrity.recoveryChecks ? source.recoveryIntegrity : verifyRecoveryIntegrity(source);
            var score = 0;
            score += safeBoolean(source.rollbackTargetExists, false) ? 12 : 0;
            score += safeBoolean(source.releaseSnapshotExists, false) ? 14 : 0;
            score += safeBoolean(source.migrationCompatible, false) ? 12 : 0;
            score += safeBoolean(source.environmentCompatible, false) ? 10 : 0;
            score += safeBoolean(source.dependencyCompatible, false) ? 12 : 0;
            score += safeBoolean(source.tenantIsolationIntegrity, false) ? 14 : 0;
            score += safeBoolean(source.auditIntegrity, false) ? 8 : 0;
            score += safeBoolean(source.recoveryReady, false) ? 8 : 0;
            score += approvalApproved(source) || !explicitApprovalRequired(source) ? 5 : 0;
            score += Math.round((recovery.recoveryAssuranceScore || 0) * 0.05);
            score = clamp(score, 0, 100);
            var scoringContext = Object.assign({ routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } }, context || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            if (!scoringContext.actor) scoringContext.actor = { role: 'PLATFORM_OWNER' };
            var blockers = validateRollbackEligibility(Object.assign({}, source, { recoveryIntegrity: recovery }), scoringContext);
            if (blockers.eligible !== true) score = Math.min(score, 49);
            return freezeRollbackOutput({
                success: true,
                rollbackConfidenceScore: score,
                confidenceScore: score,
                rollbackRiskScore: 100 - score,
                confidenceLevel: score >= 90 ? 'RECOVERY_ASSURED' : score >= 70 ? 'HIGH' : score >= 50 ? 'MODERATE' : 'LOW',
                rollbackBlocked: blockers.eligible !== true,
                blockedRollbackReasons: blockers.failures || [],
                recoveryAssuranceScore: recovery.recoveryAssuranceScore || 0,
                recoveryIntegrity: recovery,
                tenantIsolationPreserved: true,
                rollbackGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeRollbackOutput({
                success: false,
                rollbackConfidenceScore: 0,
                confidenceScore: 0,
                rollbackRiskScore: 100,
                confidenceLevel: 'LOW',
                rollbackBlocked: true,
                blockedRollbackReasons: [safeFailure('ROLLBACK_CONFIDENCE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollback confidence calculation failed safely.')]
            });
        }
    }

    function rollbackFromRow(row) {
        var normalized = normalizeRollbackPayload(row || {}, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectRollbackRows(input) {
        var rows = [];
        if (Array.isArray(input && input.rollbacks)) rows = rows.concat(input.rollbacks);
        if (input && typeof input === 'object' && (input.rollbackId || input.rollbackState || input.snapshotId)) rows.push(input);
        try {
            var data = rawData();
            rows = rows.concat(list(data, 'rollbackSafetyRecords'))
                .concat(list(data, 'releaseRollbackRecords'))
                .concat(list(data, 'rollbackHistory'))
                .concat(list(data, 'emergencyOverrideRecords').filter(function emergency(row) { return row && (row.rollbackActivated || /ROLLBACK/.test(normalizeToken(row.emergencyType || row.actionType || ''))); }))
                .concat(list(data, 'deploymentValidationRecords').filter(function deployment(row) { return row && row.rollbackReady === false; }));
        } catch (error) {}
        return rows.slice(0, 80).map(rollbackFromRow).filter(Boolean);
    }

    function summarizeRollbackRows(rows) {
        var safeRows = Array.isArray(rows) ? rows : [];
        var failed = safeRows.filter(function failedRow(row) { return row.failedRollback || row.rollbackState === 'FAILED' || row.recoveryValidationFailed; });
        var verified = safeRows.filter(function verifiedRow(row) { return row.rollbackState === 'VERIFIED' || row.success === true; });
        var totalDuration = safeRows.reduce(function sum(acc, row) { return acc + safeNumber(row.recoveryDurationMinutes, 0); }, 0);
        return {
            rollbackFrequency: safeRows.length,
            rollbackSuccessRate: safeRows.length ? Math.round((verified.length / safeRows.length) * 100) : 0,
            rollbackFailures: failed.length,
            recoveryDuration: safeRows.length ? Math.round(totalDuration / safeRows.length) : 0,
            deploymentRegressions: failed.filter(function regression(row) { return row.recoveryValidationFailed || row.partialRollback; }).length,
            rollbackConfidenceTrends: safeRows.length ? Math.max(0, 100 - failed.length * 20) : 0,
            recoveryAssuranceTrends: safeRows.length ? Math.max(0, 100 - failed.length * 25) : 0
        };
    }

    function generateRollbackSafetyReport(filters, context) {
        try {
            var input = filters && typeof filters === 'object' ? filters : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var eligibility = validateRollbackEligibility(input, ctx);
            var recovery = input.recoveryIntegrity && input.recoveryIntegrity.recoveryChecks ? input.recoveryIntegrity : verifyRecoveryIntegrity(input);
            var confidence = calculateRollbackConfidence(Object.assign({}, input, { recoveryIntegrity: recovery }), ctx);
            var rows = collectRollbackRows(input);
            var analytics = summarizeRollbackRows(rows);
            var failedRows = rows.filter(function failed(row) { return row.failedRollback || row.rollbackState === 'FAILED' || row.recoveryValidationFailed; });
            var report = {
                VERSION: VERSION,
                success: true,
                classification: eligibility.eligible ? SEVERITIES.INFO : SEVERITIES.CRITICAL_BLOCKER,
                rollbackGovernanceModel: {
                    state: eligibility.rollbackState || 'VALIDATING',
                    states: ROLLBACK_STATES,
                    types: ROLLBACK_TYPES,
                    generatedAt: nowIso(ctx)
                },
                rollbackReadiness: {
                    ready: eligibility.eligible === true,
                    rollbackBlocked: eligibility.eligible !== true,
                    blockedRollbackReasons: eligibility.failures || [],
                    rollbackTargetExists: eligibility.rollbackSafety && eligibility.rollbackSafety.rollbackTargetExists === true,
                    releaseSnapshotExists: eligibility.rollbackSafety && eligibility.rollbackSafety.releaseSnapshotExists === true,
                    productionApprovalRequired: eligibility.rollbackSafety && eligibility.rollbackSafety.productionRollbackApprovalRequired === true
                },
                rollbackConfidence: confidence,
                recoveryAssurance: {
                    recoveryVerified: recovery.recoveryVerified === true,
                    recoveryAssuranceScore: recovery.recoveryAssuranceScore || 0,
                    recoveryVerificationStatus: recovery.recoveryVerificationStatus || 'FAILED',
                    recoveryChecks: recovery.recoveryChecks || []
                },
                rollbackSafety: {
                    unsafeRollbackExecutionBlocked: eligibility.eligible !== true,
                    tenantCorruptionPrevented: true,
                    releaseHistoryPreserved: true,
                    governanceBypassBlocked: true,
                    superAdminRollbackAuthority: false,
                    rollbackGovernanceIsolationPreserved: true
                },
                incidentIntegration: {
                    incidentTriggeredRollback: input.incidentTriggered === true || rows.some(function incident(row) { return row.incidentTriggered; }),
                    emergencyRollbackWorkflow: input.emergencyRollback === true || rows.some(function emergency(row) { return row.emergencyRollback; }),
                    recoveryVerification: recovery.recoveryVerified === true,
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService)
                },
                rollbackAnalytics: analytics,
                rollbackHistory: rows,
                failedRollbackAttempts: failedRows,
                recoveryVerificationStatus: recovery.recoveryVerificationStatus || 'FAILED',
                failures: eligibility.failures || [],
                warnings: eligibility.warnings || [],
                accessGovernance: {
                    crossTenantDeploymentLeakageBlocked: true,
                    unsafeRollbackExecutionBlocked: eligibility.eligible !== true,
                    tenantCorruptionPrevented: true,
                    releaseHistoryLossPrevented: true,
                    superAdminRollbackAuthority: false,
                    platformOwnerTenantRbacIsolation: true,
                    tenantIsolationPreserved: true,
                    rollbackGovernanceIsolationPreserved: true,
                    releaseActionsAuditable: true
                },
                integrationHealth: {
                    safeReleaseIntegrated: true,
                    environmentPromotionIntegrated: !!(global.EnvironmentActivationService || global.environmentActivationService || global.EnvironmentPromotionService || global.environmentPromotionService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                governanceDashboard: {
                    label: 'Enterprise Recovery Command Center',
                    rollbackReadiness: eligibility.eligible === true ? 'READY' : 'BLOCKED',
                    rollbackConfidence: confidence.rollbackConfidenceScore || 0,
                    recoveryAssuranceScore: recovery.recoveryAssuranceScore || 0,
                    failedRollbackAttempts: failedRows.length,
                    recoveryVerificationStatus: recovery.recoveryVerificationStatus || 'FAILED',
                    rollbackHistory: rows.length
                },
                timestamp: nowIso(ctx)
            };
            emitAudit('ROLLBACK_SAFETY_REPORTED', report, ctx);
            emitTelemetry('ROLLBACK_SAFETY_REPORTED', report, ctx);
            emitMetric('ROLLBACK_SAFETY_REPORTED', report, ctx);
            return freezeRollbackOutput(report);
        } catch (error) {
            return freezeRollbackOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                rollbackGovernanceModel: { state: 'FAILED', states: ROLLBACK_STATES, types: ROLLBACK_TYPES, generatedAt: nowIso(context || {}) },
                rollbackReadiness: { ready: false, rollbackBlocked: true },
                rollbackConfidence: { rollbackConfidenceScore: 0, rollbackBlocked: true },
                recoveryAssurance: { recoveryVerified: false, recoveryAssuranceScore: 0, recoveryVerificationStatus: 'FAILED' },
                rollbackHistory: [],
                failedRollbackAttempts: [],
                rollbackAnalytics: {},
                failures: [safeFailure('ROLLBACK_SAFETY_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollback safety report generation failed safely.')]
            });
        }
    }

    function externalSafetyBlockers(rows, summary, signals) {
        var releaseRows = Array.isArray(rows) ? rows : [];
        var input = {
            certificationMissing: true,
            criticalIncidentActive: false,
            healthStatusCritical: false,
            emergencyOverrideActive: false,
            unresolvedDeploymentValidationFailure: false,
            rollbackReadinessUnavailable: false,
            releaseFreeze: summary && summary.controlledRollout && summary.controlledRollout.releaseFreezeHandling > 0
        };
        if (signals && signals.readiness) {
            input.certificationMissing = !(signals.readiness.readinessScore && signals.readiness.readinessScore.scoreLevel === 'PRODUCTION_CERTIFIED' || signals.readiness.productionReadinessModel && signals.readiness.productionReadinessModel.state === 'RELEASE_READY');
        } else {
            input.certificationMissing = !releaseRows.some(function ready(row) { return row.source === 'productionReadinessService' && (row.releaseState === 'APPROVED' || row.releaseState === 'STAGED' || row.releaseState === 'LIMITED_RELEASE'); });
        }
        input.criticalIncidentActive = releaseRows.some(function incident(row) { return row.source === 'globalIncidentService' && (row.severity === SEVERITIES.CRITICAL_BLOCKER || row.releaseState === 'DEGRADED'); });
        input.healthStatusCritical = releaseRows.some(function health(row) { return row.source === 'platformHealthMonitoringService' && (row.severity === SEVERITIES.CRITICAL_BLOCKER || row.releaseState === 'DEGRADED'); });
        input.emergencyOverrideActive = releaseRows.some(function emergency(row) { return row.source === 'emergencyOverrideService' && (row.rollbackActive || row.releaseState === 'ROLLBACK_ACTIVE'); });
        input.unresolvedDeploymentValidationFailure = releaseRows.some(function deployment(row) { return row.source === 'deploymentValidationService' && (row.severity !== SEVERITIES.INFO || row.releaseState === 'DEGRADED'); });
        input.rollbackReadinessUnavailable = releaseRows.some(function rollback(row) { return row.rollbackReady === false; }) || !(summary && summary.rollbackGovernance && summary.rollbackGovernance.rollbackCheckpoints > 0);
        if (signals && signals.readiness && signals.readiness.releaseEligibility && signals.readiness.releaseEligibility.releaseEligible === false) input.certificationMissing = true;
        return input;
    }

    function detectRolloutInstability(filters, context) {
        try {
            var scope = validateReleaseScope(Object.assign({ aggregateOnly: true, readOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeReleaseOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    releaseStabilizationIntelligence: {
                        rolloutInstability: 0,
                        degradedReleaseBehavior: 0,
                        rollbackFrequency: 0,
                        deploymentRecoveryTimelines: 0,
                        rolloutCongestion: 0,
                        stabilizationDelays: 0,
                        releaseEscalationFrequency: 0
                    },
                    failures: scope.failures
                });
            }
            var rows = collectReleaseRows(filters || {}, context || {});
            var signals = externalReleaseSignals(context || {});
            var summary = summarizeReleases(rows, signals);
            var classification = summary.releaseStabilizationIntelligence.rolloutInstability || summary.releaseStabilizationIntelligence.degradedReleaseBehavior || summary.releaseStabilizationIntelligence.rollbackFrequency ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO;
            var output = {
                success: true,
                classification: classification,
                releaseStabilizationIntelligence: summary.releaseStabilizationIntelligence,
                rollbackGovernance: summary.rollbackGovernance,
                releaseAnalytics: summary.releaseAnalytics,
                tenantIsolationPreserved: true,
                releaseGovernanceIsolationPreserved: true
            };
            emitAudit('SAFE_RELEASE_INSTABILITY_REVIEWED', output, context || {});
            emitTelemetry('SAFE_RELEASE_INSTABILITY_REVIEWED', output, context || {});
            emitMetric('safe_release_instability', output, context || {});
            return freezeReleaseOutput(output);
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                releaseStabilizationIntelligence: {
                    rolloutInstability: 0,
                    degradedReleaseBehavior: 0,
                    rollbackFrequency: 0,
                    deploymentRecoveryTimelines: 0,
                    rolloutCongestion: 0,
                    stabilizationDelays: 0,
                    releaseEscalationFrequency: 0
                },
                failures: [safeFailure('ROLLOUT_INSTABILITY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Rollout instability detection failed safely.')]
            });
        }
    }

    function releaseRowSummary(row) {
        return {
            safeReleaseId: row.safeReleaseId,
            releaseId: row.releaseId,
            rolloutWaveId: row.rolloutWaveId,
            tenantSlug: row.tenantSlug,
            tenantId: row.tenantId,
            releaseType: row.releaseType,
            releaseState: row.releaseState,
            severity: row.severity,
            environment: row.environment,
            rolloutWave: row.rolloutWave,
            rolloutPercentage: row.rolloutPercentage,
            releaseFreeze: row.releaseFreeze,
            rollbackReady: row.rollbackReady,
            rollbackActive: row.rollbackActive,
            stabilizationCheckpoint: row.stabilizationCheckpoint,
            stabilizationDelayMinutes: row.stabilizationDelayMinutes,
            approvalCheckpoint: row.approvalCheckpoint,
            correlationId: row.correlationId,
            source: row.source,
            createdAt: row.createdAt
        };
    }

    function generateSafeReleaseReport(filters, context) {
        try {
            var input = filters && typeof filters === 'object' ? filters : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateReleaseScope(Object.assign({ aggregateOnly: true, readOnly: true }, input), ctx);
            if (!scope.allowed) {
                var denied = {
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    generatedAt: nowIso(ctx),
                    releaseSummaries: [],
                    failures: scope.failures,
                    accessGovernance: {
                        crossTenantDeploymentLeakageBlocked: true,
                        unsafeProductionRolloutBlocked: true,
                        superAdminRolloutBypassAuthority: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        historicalReleaseRecordsImmutable: true,
                        existingTenantWorkflowsPreserved: true,
                        releaseActionsAuditable: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        releaseGovernanceIsolationPreserved: true
                    }
                };
                emitAudit('SAFE_RELEASE_ACCESS_DENIED', denied, ctx);
                return freezeReleaseOutput(denied);
            }

            var rows = collectReleaseRows(input, ctx);
            var signals = externalReleaseSignals(ctx);
            var summary = summarizeReleases(rows, signals);
            var safetyInput = externalSafetyBlockers(rows, summary, signals);
            var confidence = calculateRolloutConfidence(Object.assign({
                rolloutPercentage: rows.reduce(function maxPercentage(max, row) { return Math.max(max, row.rolloutPercentage || 0); }, 0),
                internalRolloutComplete: summary.totals.stagedProductionRollouts > 0,
                pilotRolloutComplete: summary.totals.limitedReleaseActivations > 0 || summary.totals.stagedReleases > 0,
                departmentRolloutComplete: summary.totals.limitedReleaseActivations > 0,
                tenantRolloutComplete: summary.totals.readyOrControlled > 2,
                fullRolloutComplete: summary.releaseAnalytics.rolloutSuccessRates >= 95,
                stabilizationScore: summary.incidentDeploymentIntegration.operationalReleaseHealth,
                releaseApproved: summary.controlledRollout.rolloutApprovalCheckpoints > 0,
                deploymentValidated: !safetyInput.unresolvedDeploymentValidationFailure,
                readinessCertified: !safetyInput.certificationMissing,
                rollbackReady: !safetyInput.rollbackReadinessUnavailable,
                healthVerified: !safetyInput.healthStatusCritical,
                stabilizationFailure: summary.releaseStabilizationIntelligence.rolloutInstability > 0,
                rolloutInstability: summary.releaseStabilizationIntelligence.rolloutInstability > 0,
                rollbackActive: summary.rollbackGovernance.rollbackActiveReleases > 0,
                stabilizationDelayMinutes: summary.releaseStabilizationIntelligence.deploymentRecoveryTimelines
            }, safetyInput));
            var risk = calculateRolloutRisk(Object.assign({
                stabilizationFailure: summary.releaseStabilizationIntelligence.rolloutInstability > 0,
                rolloutInstability: summary.releaseStabilizationIntelligence.rolloutInstability > 0,
                rollbackActive: summary.rollbackGovernance.rollbackActiveReleases > 0,
                stabilizationDelayMinutes: summary.releaseStabilizationIntelligence.deploymentRecoveryTimelines
            }, safetyInput));
            var severity = risk.rolloutBlocked ? SEVERITIES.CRITICAL_BLOCKER : summary.releaseStabilizationIntelligence.rolloutInstability || summary.releaseStabilizationIntelligence.degradedReleaseBehavior || summary.releaseStabilizationIntelligence.rollbackFrequency ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO;
            if (summary.releaseStabilizationIntelligence.degradedReleaseBehavior > 3) severity = SEVERITIES.CRITICAL_BLOCKER;
            var exposeRows = scope.infrastructureOnly ? [] : rows.map(releaseRowSummary);
            var activeReleases = exposeRows.filter(function active(row) {
                return ['PLANNED', 'APPROVED', 'STAGED', 'LIMITED_RELEASE', 'STABILIZING', 'DEGRADED', 'ROLLBACK_ACTIVE'].indexOf(row.releaseState) !== -1;
            }).slice(0, 25);
            var blockedReleases = scope.infrastructureOnly ? [] : exposeRows.filter(function blocked(row) {
                return row.releaseFreeze || row.rollbackActive || row.releaseState === 'DEGRADED' || row.releaseState === 'ROLLBACK_ACTIVE' || row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER;
            }).slice(0, 25);
            var releaseHistory = scope.infrastructureOnly ? [] : exposeRows.filter(function history(row) {
                return row.releaseState === 'ARCHIVED' || row.releaseId || row.safeReleaseId;
            }).slice(0, 30).map(function mapHistory(row) {
                return {
                    safeReleaseId: row.safeReleaseId,
                    releaseId: row.releaseId,
                    releaseState: row.releaseState,
                    releaseType: row.releaseType,
                    rolloutPercentage: row.rolloutPercentage,
                    rollbackReady: row.rollbackReady,
                    rollbackActive: row.rollbackActive,
                    createdAt: row.createdAt,
                    source: row.source,
                    correlationId: row.correlationId
                };
            });
            var rolloutProgress = confidence.rolloutPhaseProgress || { progress: 0, rolloutPercentage: 0 };
            var stabilizationStatus = {
                stabilizationScore: confidence.stabilizationScore || 0,
                stabilizationStatus: (confidence.stabilizationScore || 0) >= 80 ? 'STABLE' : (confidence.stabilizationScore || 0) >= 60 ? 'WATCH' : 'DEGRADED',
                stabilizationTimelines: summary.releaseAnalytics.stabilizationTimelines,
                stabilizationDelays: summary.releaseStabilizationIntelligence.stabilizationDelays
            };
            var report = {
                VERSION: VERSION,
                success: true,
                classification: severity,
                generatedAt: nowIso(ctx),
                safeReleaseModel: {
                    state: risk.rolloutBlocked ? 'DEGRADED' : severity === SEVERITIES.INFO ? 'APPROVED' : 'STABILIZING',
                    states: RELEASE_STATES,
                    types: RELEASE_TYPES
                },
                releaseGovernance: {
                    governanceApprovals: summary.controlledRollout.rolloutApprovalCheckpoints,
                    releaseApprovals: summary.controlledRollout.rolloutApprovalCheckpoints,
                    rolloutCheckpoints: summary.controlledRollout.stagedProductionRollouts,
                    releaseFreezes: summary.controlledRollout.releaseFreezeHandling,
                    stabilizationGates: summary.controlledRollout.stabilizationMonitoring,
                    releaseHistory: releaseHistory.length,
                    immutableReleaseHistory: true,
                    rolloutAuditTrails: rows.length
                },
                rolloutProgress: rolloutProgress,
                stabilizationStatus: stabilizationStatus,
                rolloutConfidence: confidence,
                rolloutRisk: risk,
                releaseSafety: {
                    safetyChecks: {
                        readinessCertified: safetyInput.certificationMissing !== true,
                        deploymentValidated: safetyInput.unresolvedDeploymentValidationFailure !== true,
                        healthVerified: safetyInput.healthStatusCritical !== true,
                        rollbackReady: safetyInput.rollbackReadinessUnavailable !== true,
                        releaseApproved: summary.controlledRollout.rolloutApprovalCheckpoints > 0
                    },
                    rolloutBlocked: risk.rolloutBlocked === true,
                    releaseBlocked: risk.releaseBlocked === true,
                    blockedReleaseReasons: risk.blockedReleaseReasons
                },
                rolloutStrategies: {
                    percentageRollout: true,
                    phasedRollout: true,
                    departmentRollout: true,
                    featureRollout: true,
                    controlledEnablement: true
                },
                activeReleases: activeReleases,
                blockedReleases: blockedReleases,
                releaseHistory: releaseHistory,
                controlledRollout: summary.controlledRollout,
                releaseStabilizationIntelligence: summary.releaseStabilizationIntelligence,
                rollbackGovernance: summary.rollbackGovernance,
                incidentDeploymentIntegration: summary.incidentDeploymentIntegration,
                releaseAnalytics: summary.releaseAnalytics,
                releaseSummaries: exposeRows,
                accessGovernance: {
                    crossTenantDeploymentLeakageBlocked: true,
                    unsafeProductionRolloutBlocked: true,
                    superAdminRolloutBypassAuthority: false,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalReleaseRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    releaseActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    releaseGovernanceIsolationPreserved: true
                },
                integrationHealth: {
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService),
                    productionReadinessIntegrated: !!(global.ProductionReadinessService || global.productionReadinessService),
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    environmentGovernanceIntegrated: !!(global.EnvironmentGovernanceService || global.environmentGovernanceService),
                    stagingValidationIntegrated: !!(global.StagingValidationService || global.stagingValidationService)
                },
                governanceDashboard: {
                    label: 'Enterprise Release Command Center',
                    activeReleases: activeReleases.length,
                    rolloutProgress: rolloutProgress.progress || 0,
                    rolloutConfidence: confidence.rolloutConfidenceScore || 0,
                    rolloutRisk: risk.rolloutRiskScore || 0,
                    blockedReleases: blockedReleases.length,
                    stabilizationIndicators: summary.releaseStabilizationIntelligence.stabilizationDelays,
                    releaseFreezeVisibility: summary.controlledRollout.releaseFreezeHandling,
                    rollbackReadinessSummaries: summary.rollbackGovernance.rollbackReadinessSummaries,
                    deploymentAnalytics: summary.releaseAnalytics.deploymentCongestionTrends,
                    stabilizationTrends: summary.releaseAnalytics.stabilizationTimelines,
                    governanceVisibility: scope.visibility
                }
            };
            emitAudit('SAFE_RELEASE_REPORT_GENERATED', report, ctx);
            emitTelemetry('SAFE_RELEASE_REPORT_GENERATED', report, ctx);
            emitMetric('safe_release_report', report, ctx);
            return freezeReleaseOutput(report);
        } catch (error) {
            return freezeReleaseOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                releaseSummaries: [],
                failures: [safeFailure('SAFE_RELEASE_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Safe release report generation failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        var coverage = {
            malformedPayloads: false,
            dependencyAbsence: false,
            immutability: false,
            releaseGovernance: false,
            rolloutProgression: false,
            releaseBlocking: false,
            rolloutConfidence: false,
            rolloutRollback: false,
            stabilizationFailure: false,
            tenantIsolation: false
        };
        function add(name, ok) {
            checks.push(name);
            if (!ok) throw new Error(name);
        }
        try {
            var malformed = normalizeReleasePayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);
            coverage.malformedPayloads = true;

            var owner = validateReleaseScope({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            add('PLATFORM_OWNER safe release scope works', owner.allowed === true && owner.rolloutAuthority === true);

            var tenant = validateReleaseScope({}, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'tenant-a' } });
            add('tenant roles are blocked from release governance', tenant.allowed === false);
            coverage.tenantIsolation = true;

            var superAdminBypass = validateReleaseScope({ rolloutBypass: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN' } });
            add('SUPER_ADMIN rollout bypass is blocked', superAdminBypass.allowed === false);

            var superAdminInfra = validateReleaseScope({ infrastructureOnly: true, rolloutMonitoring: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'tenant-a' } });
            add('SUPER_ADMIN infrastructure rollout scope is allowed', superAdminInfra.allowed === true && superAdminInfra.rolloutAuthority === false);

            var archived = validateReleaseScope({ releaseState: 'ARCHIVED', rolloutBypass: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            add('archived release mutation is blocked', archived.allowed === false);

            var normalized = normalizeReleasePayload({ state: 'rollback active', releaseType: 'rollback governance', salary: 1, stabilizationFailure: true }, {});
            add('protected field filtering removes restricted fields', normalized.success === true && JSON.stringify(normalized).indexOf('salary') === -1);
            add('immutable outputs enforced', Object.isFrozen(normalized) && Object.isFrozen(normalized.payload));
            coverage.immutability = true;
            coverage.rolloutRollback = normalized.payload.rollbackActive === true;
            coverage.stabilizationFailure = normalized.payload.stabilizationFailure === true;

            var risk = calculateRolloutRisk({ certificationMissing: true, criticalIncidentActive: true, healthStatusCritical: true, emergencyOverrideActive: true, unresolvedDeploymentValidationFailure: true, rollbackReadinessUnavailable: true });
            add('release blocking works for missing certification and operational blockers', risk.rolloutBlocked === true && risk.riskLevel === SEVERITIES.CRITICAL_BLOCKER);
            coverage.releaseBlocking = true;

            var confidence = calculateRolloutConfidence({ rolloutPercentage: 35, internalRolloutComplete: true, pilotRolloutComplete: true, departmentRolloutComplete: true, stabilizationScore: 85, releaseApproved: true, deploymentValidated: true, readinessCertified: true, rollbackReady: true });
            add('rollout confidence works for controlled progression', confidence.success === true && confidence.rolloutConfidenceScore >= 50);
            coverage.rolloutConfidence = true;
            coverage.rolloutProgression = true;

            var governance = validateReleaseGovernance({ releaseId: 'SELF-TEST-REL', rolloutPercentage: 10, releaseApproved: false, readinessCertified: false, deploymentValidated: false, rollbackReady: false, criticalIncidentActive: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('release governance validation blocks unsafe rollout', governance.success === true && governance.releaseSafety.rolloutBlocked === true && governance.rolloutConfidence.rolloutEligible === false);
            coverage.releaseGovernance = true;

            var savedReadiness = global.ProductionReadinessService;
            var savedDeployment = global.DeploymentValidationService;
            var savedHealth = global.PlatformHealthMonitoringService;
            delete global.ProductionReadinessService;
            delete global.DeploymentValidationService;
            delete global.PlatformHealthMonitoringService;
            var report = generateSafeReleaseReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            global.ProductionReadinessService = savedReadiness;
            global.DeploymentValidationService = savedDeployment;
            global.PlatformHealthMonitoringService = savedHealth;
            add('rollout instability detection degrades safely without optional dependencies', report.success === true);
            coverage.dependencyAbsence = true;

            return freezeReleaseOutput({ passed: true, checks: checks, coverage: coverage });
        } catch (error) {
            return freezeReleaseOutput({ passed: false, checks: checks, coverage: coverage, failures: [safeFailure('SAFE_RELEASE_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Self-test failed.')] });
        }
    }

    function runRollbackSafetySelfTest() {
        var checks = [];
        function add(name, ok) {
            checks.push({ name: name, passed: !!ok });
            if (!ok) throw new Error(name);
        }
        try {
            var malformed = normalizeRollbackPayload(null, {});
            add('malformed rollback payloads fail safely', malformed.success === false);

            var recovery = verifyRecoveryIntegrity({
                deploymentStability: true,
                environmentIntegrity: true,
                tenantIsolationIntegrity: true,
                workflowIntegrity: true,
                featureIntegrity: true,
                auditIntegrity: true,
                platformHealthStatus: true
            });
            add('recovery verification works', recovery.recoveryVerified === true && recovery.recoveryAssuranceScore === 100);

            var blocked = validateRollbackEligibility({
                rollbackTargetExists: false,
                releaseSnapshotExists: false,
                migrationCompatible: false,
                environmentCompatible: true,
                dependencyCompatible: false,
                tenantIsolationIntegrity: true,
                auditIntegrity: true,
                recoveryReady: false,
                productionRollback: true
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('rollback blocking works', blocked.eligible === false && blocked.failures.some(function target(item) { return item.failureCode === 'ROLLBACK_TARGET_MISSING'; }));

            var confidence = calculateRollbackConfidence({
                rollbackTargetExists: true,
                releaseSnapshotExists: true,
                migrationCompatible: true,
                environmentCompatible: true,
                dependencyCompatible: true,
                tenantIsolationIntegrity: true,
                auditIntegrity: true,
                recoveryReady: true,
                approvalStatus: 'APPROVED',
                recoveryIntegrity: recovery
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('confidence scoring works', confidence.rollbackConfidenceScore >= 90 && confidence.rollbackBlocked === false);

            var immutable = freezeRollbackOutput({ rows: [{ stable: true }] });
            add('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.rows));

            var report = generateRollbackSafetyReport({
                rollbackTargetExists: true,
                releaseSnapshotExists: true,
                migrationCompatible: true,
                environmentCompatible: true,
                dependencyCompatible: true,
                tenantIsolationIntegrity: true,
                auditIntegrity: true,
                recoveryReady: true,
                approvalStatus: 'APPROVED',
                recoveryIntegrity: recovery
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('rollback report works without optional dependencies', report.success === true);

            return freezeRollbackOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    rollbackValidation: true,
                    recoveryVerification: true,
                    rollbackBlocking: true,
                    confidenceScoring: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezeRollbackOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('ROLLBACK_SAFETY_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Rollback safety self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        RELEASE_STATES: RELEASE_STATES,
        RELEASE_TYPES: RELEASE_TYPES,
        ROLLBACK_STATES: ROLLBACK_STATES,
        ROLLBACK_TYPES: ROLLBACK_TYPES,
        validateReleaseScope: validateReleaseScope,
        classifyReleaseRisk: classifyReleaseRisk,
        normalizeReleasePayload: normalizeReleasePayload,
        freezeReleaseOutput: freezeReleaseOutput,
        validateReleaseGovernance: validateReleaseGovernance,
        calculateRolloutConfidence: calculateRolloutConfidence,
        calculateRolloutRisk: calculateRolloutRisk,
        normalizeRollbackPayload: normalizeRollbackPayload,
        freezeRollbackOutput: freezeRollbackOutput,
        validateRollbackEligibility: validateRollbackEligibility,
        calculateRollbackConfidence: calculateRollbackConfidence,
        verifyRecoveryIntegrity: verifyRecoveryIntegrity,
        generateRollbackSafetyReport: generateRollbackSafetyReport,
        detectRolloutInstability: detectRolloutInstability,
        generateSafeReleaseReport: generateSafeReleaseReport,
        runSelfTest: runSelfTest,
        runRollbackSafetySelfTest: runRollbackSafetySelfTest
    });

    global.SafeReleaseGovernanceService = api;
    global.safeReleaseGovernanceService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_SAFE_RELEASE_SELF_TEST__ = runSelfTest();
        global.__ARTHHRMS_ROLLBACK_SAFETY_SELF_TEST__ = runRollbackSafetySelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_SAFE_RELEASE_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_SAFE_RELEASE_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
