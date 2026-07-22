/**
 * productionReadinessService.js
 * ARTHHRMS Enterprise Production Readiness + Release Certification Governance.
 *
 * Additive, platform-control-only certification layer for production readiness,
 * rollback preparedness, stability verification, operational readiness scoring,
 * and release certification analytics. It never exposes salaries, leave
 * balances, confidential HR records, raw tenant documents, URLs, tokens, or
 * tenant-private payloads.
 */
(function attachProductionReadinessService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ProductionReadinessService]';

    var READINESS_STATES = Object.freeze([
        'DRAFT',
        'IN_REVIEW',
        'VALIDATING',
        'BLOCKED',
        'READY',
        'CERTIFIED',
        'RELEASE_READY',
        'ARCHIVED'
    ]);

    var READINESS_SCORE_LEVELS = Object.freeze([
        'NOT_READY',
        'PARTIALLY_READY',
        'READY',
        'PRODUCTION_CERTIFIED'
    ]);

    var READINESS_TYPES = Object.freeze([
        'PRODUCTION_READINESS',
        'RELEASE_CERTIFICATION',
        'STABILITY_VERIFICATION',
        'DEPLOYMENT_APPROVAL',
        'ROLLBACK_PREPAREDNESS',
        'ENVIRONMENT_VERIFICATION',
        'OPERATIONAL_READINESS',
        'RELEASE_GOVERNANCE'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        PRODUCTION_READINESS_GOVERNANCE: 'PRODUCTION_READINESS_GOVERNANCE',
        INFRASTRUCTURE_READINESS_VISIBILITY: 'INFRASTRUCTURE_READINESS_VISIBILITY'
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
        readinessVerification: true,
        certificationAuthority: true,
        certificationBypassAuthority: true,
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
        readinessId: true,
        certificationId: true,
        releaseId: true,
        tenantId: true,
        tenantSlug: true,
        readinessType: true,
        readinessState: true,
        readinessStateRaw: true,
        productionReadinessModel: true,
        READINESS_SCORE_LEVELS: true,
        readinessScoreLevels: true,
        readinessScore: true,
        score: true,
        scoreLevel: true,
        scoreLabel: true,
        readinessChecklist: true,
        checklistResults: true,
        checklistCompletion: true,
        totalCategories: true,
        passedCategories: true,
        completionPercentage: true,
        validationResults: true,
        passedCategoriesCount: true,
        blockedCertificationReasons: true,
        certificationGovernance: true,
        certificationStatus: true,
        certificationWorkflowState: true,
        certificationHistory: true,
        releaseEligibility: true,
        releaseEligible: true,
        releaseBlocked: true,
        requiredCertification: true,
        productionCertified: true,
        readinessReviews: true,
        approvalCheckpoints: true,
        certificationWorkflows: true,
        productionGates: true,
        releaseSignoffRecords: true,
        readinessReports: true,
        certificationHistoryImmutable: true,
        infrastructureReadiness: true,
        deploymentReadiness: true,
        migrationReadiness: true,
        securityReadiness: true,
        tenantIsolationReadiness: true,
        rollbackReadiness: true,
        auditReadiness: true,
        observabilityReadiness: true,
        performanceReadiness: true,
        criticalIncidentExists: true,
        healthStateCritical: true,
        deploymentValidationFailed: true,
        rollbackReadinessIncomplete: true,
        emergencyOverrideActive: true,
        unresolvedAuditFindings: true,
        criticalIncident: true,
        criticalHealth: true,
        deploymentValidation: true,
        rollbackPreparedness: true,
        emergencyOverride: true,
        auditFindings: true,
        environmentValidation: true,
        environmentMismatch: true,
        environmentMatched: true,
        requirementChecks: true,
        deploymentBlocked: true,
        healthBlocked: true,
        incidentBlocked: true,
        emergencyBlocked: true,
        auditBlocked: true,
        rollbackBlocked: true,
        readinessBlocked: true,
        certificationBlocked: true,
        releaseCertification: true,
        operationalReadinessIntelligence: true,
        incidentDeploymentIntegration: true,
        readinessAnalytics: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        readinessSummaries: true,
        readinessChecklistWorkflows: true,
        certificationApprovalGates: true,
        rollbackPreparednessVerification: true,
        stabilityReviewWorkflows: true,
        environmentVerification: true,
        productionFreezeGovernance: true,
        releaseArchivalGovernance: true,
        unsafeProductionReleaseExecutionBlocked: true,
        failedCertificationPatterns: true,
        degradedReleaseReadiness: true,
        rollbackInstability: true,
        environmentInconsistencies: true,
        deploymentCongestion: true,
        operationalInstability: true,
        releaseApprovalEscalationFrequency: true,
        rollbackPreparedReleases: true,
        rollbackActivatedReleases: true,
        rollbackPreparednessHealth: true,
        certificationRollbackReadiness: true,
        rollbackHealthVerification: true,
        deploymentLinkedReadinessFailures: true,
        operationalDegradationRisks: true,
        releaseStabilizationAnalytics: true,
        certificationRecoveryTracking: true,
        certificationSuccessRates: true,
        readinessValidationFailures: true,
        rollbackPreparednessTrends: true,
        deploymentApprovalTimelines: true,
        operationalStabilityScores: true,
        releaseCongestionAnalytics: true,
        certificationGovernanceHealth: true,
        crossTenantDeploymentLeakageBlocked: true,
        unsafeProductionCertificationBlocked: true,
        superAdminCertificationBypassAuthority: true,
        superAdminHrPayrollVisibility: true,
        platformOwnerTenantRbacIsolation: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        historicalCertificationRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        productionActionsAuditable: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        productionCertificationGovernancePreserved: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
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
        certificationRollback: true,
        environmentInconsistency: true,
        stabilityVerification: true,
        tenantIsolation: true,
        environment: true,
        createdAt: true,
        updatedAt: true,
        certifiedAt: true,
        operationalScore: true,
        stabilityScore: true,
        checklistFailures: true,
        rollbackPrepared: true,
        rollbackActivated: true,
        stabilityVerified: true,
        environmentConsistent: true,
        approvalCheckpoint: true,
        certificationBlocked: true,
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

    function freezeReadinessOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'PRODUCTION_READINESS_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Production readiness governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeReadinessState(value, fallback) {
        var state = normalizeToken(value || fallback || 'DRAFT');
        if (state === 'RELEASE_READY' || state === 'READY_FOR_RELEASE') return 'RELEASE_READY';
        if (state === 'READY' || state === 'PRODUCTION_READY' || state === 'APPROVED') return 'READY';
        if (state === 'PENDING' || state === 'PENDING_CERTIFICATION' || state === 'PENDING_APPROVAL' || state === 'AWAITING_APPROVAL' || state === 'REVIEW' || state === 'UNDER_REVIEW') return 'IN_REVIEW';
        if (state === 'VALIDATION' || state === 'IN_PROGRESS' || state === 'ACTIVE') return 'VALIDATING';
        if (state === 'FAILED' || state === 'BLOCKER' || state === 'BLOCKED' || state === 'REJECTED') return 'BLOCKED';
        if (state === 'WARNING' || state === 'UNSTABLE' || state === 'DEGRADED' || state === 'CRITICAL') return 'BLOCKED';
        if (state === 'COMPLETE' || state === 'CERTIFIED' || state === 'PASSED') return 'CERTIFIED';
        if (READINESS_STATES.indexOf(state) !== -1) return state;
        return fallback || 'DRAFT';
    }

    function normalizeReadinessType(value) {
        var type = normalizeToken(value || '');
        if (/ROLLBACK/.test(type)) return 'ROLLBACK_PREPAREDNESS';
        if (/STABILITY|STABILIZATION/.test(type)) return 'STABILITY_VERIFICATION';
        if (/APPROVAL|CERTIFICATION|CERTIFY/.test(type)) return 'RELEASE_CERTIFICATION';
        if (/ENVIRONMENT|DRIFT|CONSISTENCY/.test(type)) return 'ENVIRONMENT_VERIFICATION';
        if (/OPERATIONAL|SCORE|HEALTH/.test(type)) return 'OPERATIONAL_READINESS';
        if (/DEPLOY/.test(type)) return 'DEPLOYMENT_APPROVAL';
        if (/GOVERNANCE|FREEZE/.test(type)) return 'RELEASE_GOVERNANCE';
        if (READINESS_TYPES.indexOf(type) !== -1) return type;
        return 'PRODUCTION_READINESS';
    }

    function isReadinessSignal(row) {
        var token = normalizeToken(row && (row.readinessType || row.eventType || row.actionType || row.status || row.state || row.readinessState || row.deploymentState || row.incidentState || row.healthState || row.rolloutState || row.module || row.severity || ''));
        var count = safeNumber(row && (row.checklistFailures || row.validationFailures || row.failureCount || row.failureRate || row.durationMinutes), 0);
        return /READINESS|CERTIFICATION|RELEASE|DEPLOY|ROLLBACK|STABILITY|ENVIRONMENT|PRODUCTION|DEGRADED|FAILED|BLOCKED|CRITICAL|ESCALATED/.test(token) || count >= 2 || row && (row.rollbackPrepared === true || row.rollbackReady === true || row.environmentConsistent === false || row.environmentDrift === true);
    }

    function classifyReadinessRisk(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || '');
            if (row.crossTenant === true || row.unsafeCertification === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.actionType || row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            var state = normalizeReadinessState(row.readinessState || row.state || row.status || row.deploymentState || row.incidentState || row.healthState || row.rolloutState, 'DRAFT');
            if (state === 'BLOCKED') return SEVERITIES.CRITICAL_BLOCKER;
            if (row.healthState && normalizeToken(row.healthState) === 'CRITICAL' || row.incidentState && normalizeToken(row.incidentState) === 'CRITICAL') return SEVERITIES.CRITICAL_BLOCKER;
            if (row.environmentConsistent === false || row.environmentInconsistency === true || row.environmentDrift === true || safeNumber(row.checklistFailures || row.validationFailures || row.failureCount, 0) >= 2) return SEVERITIES.HIGH_RISK;
            if (row.rollbackInstability === true || state === 'IN_REVIEW' || row.certificationBlocked === true || row.stabilityVerified === false) return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeReadinessPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeReadinessOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_READINESS_PAYLOAD', SEVERITIES.HIGH_RISK, 'Readiness payload must be an object.')]
                });
            }
            var state = normalizeReadinessState(payload.readinessState || payload.state || payload.status || payload.deploymentState || payload.incidentState || payload.healthState || payload.rolloutState, 'DRAFT');
            var createdAt = safeString(payload.createdAt || payload.date || payload.timestamp || payload.loggedAt || nowIso(context || {}), nowIso(context || {}));
            var environmentConsistent = payload.environmentConsistent === false || payload.environmentInconsistency === true || payload.environmentDrift === true ? false : true;
            var severity = classifyReadinessRisk(Object.assign({}, payload, { readinessState: state, environmentConsistent: environmentConsistent }));
            var checklistFailures = safeNumber(payload.checklistFailures || payload.validationFailures || payload.failureCount || (Array.isArray(payload.failures) ? payload.failures.length : 0), 0);
            var stabilityScore = clamp(payload.stabilityScore || payload.operationalScore || (environmentConsistent ? 85 : 55), 0, 100);
            var normalized = {
                readinessId: safeString(payload.readinessId || payload.id || payload.checklistId || payload.stabilityId || payload.deploymentId || payload.releaseId || 'READY-' + timeValue(createdAt), ''),
                certificationId: safeString(payload.certificationId || payload.approvalId || payload.checklistId || '', ''),
                releaseId: safeString(payload.releaseId || payload.buildId || payload.version || '', ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                readinessType: normalizeReadinessType(payload.readinessType || payload.type || payload.actionType || payload.eventType || payload.module || payload.validationType),
                readinessState: state,
                readinessStateRaw: safeString(payload.state || payload.status || payload.readinessState || payload.deploymentState || payload.incidentState || payload.healthState || payload.rolloutState || '', ''),
                severity: severity,
                source: safeString(payload.source || payload.module || 'productionReadiness', 'productionReadiness'),
                module: safeString(payload.module || payload.source || 'Production Readiness', 'Production Readiness'),
                actionType: normalizeToken(payload.actionType || payload.action || payload.eventType || payload.type || 'PRODUCTION_READINESS_EVENT'),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                environment: normalizeToken(payload.environment || payload.deploymentStage || payload.targetEnvironment || ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                certifiedAt: safeString(payload.certifiedAt || payload.completedAt || payload.resolvedAt || '', ''),
                checklistFailures: checklistFailures,
                rollbackPrepared: payload.rollbackPrepared === true || payload.rollbackReady === true || state === 'RELEASE_READY' || /ROLLBACK/.test(normalizeToken(payload.status || payload.actionType || payload.readinessType || '')),
                rollbackActivated: payload.rollbackActivated === true || /ROLLBACK/.test(normalizeToken(payload.rolloutState || payload.eventType || '')),
                rollbackInstability: payload.rollbackInstability === true || payload.rollbackPrepared === false || /ROLLBACK/.test(normalizeToken(payload.status || payload.eventType || '')) && /FAILED|BLOCKED|PENDING/.test(normalizeToken(payload.status || '')),
                stabilityVerified: payload.stabilityVerified === true || state === 'CERTIFIED' || state === 'RELEASE_READY' && stabilityScore >= 70,
                stabilityScore: stabilityScore,
                operationalScore: clamp(payload.operationalScore || stabilityScore, 0, 100),
                environmentConsistent: environmentConsistent,
                approvalCheckpoint: payload.approvalCheckpoint === true || payload.releaseApprovalCheckpoint === true || state === 'IN_REVIEW',
                certificationBlocked: payload.certificationBlocked === true || state === 'BLOCKED' || checklistFailures > 0,
                releaseReady: state === 'RELEASE_READY' || state === 'CERTIFIED' || state === 'READY',
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeReadinessOutput({
                success: true,
                payload: normalized,
                classification: severity,
                productionCertificationGovernancePreserved: true
            });
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                payload: {},
                failures: [safeFailure('READINESS_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Readiness payload normalization failed safely.')]
            });
        }
    }

    function validateReadinessScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || global.location && global.location.pathname || '', '').toLowerCase();
            var failures = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var readinessVerification = record.readinessVerification === true || record.monitoringOnly === true || ctx.readinessVerification === true || ctx.monitoringOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeReadinessState(record.readinessState || record.state || record.status, '');
            var bypassRequested = record.certificationBypass === true || record.releaseBypass === true || record.governanceBypass === true || record.productionBypass === true || record.approveWithoutValidation === true || /BYPASS|FORCE_RELEASE|SKIP_VALIDATION/.test(normalizeToken(record.action || record.actionType || ''));

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('PRODUCTION_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Production readiness governance is isolated to platform-control.'));
            }
            if (state === 'ARCHIVED' && (record.certificationBypass || record.releaseBypass || record.certificationOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_CERTIFICATION_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical certification records are immutable after archival.'));
            }
            if (record.bypassGovernance || record.exportRaw || record.exposeConfidential || record.unsafeProductionCertification || record.executeProductionRelease) {
                failures.push(safeFailure('UNSAFE_CERTIFICATION_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe production certification bypass or exposure is blocked.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (bypassRequested) {
                    failures.push(safeFailure('CERTIFICATION_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Production certification governance cannot be bypassed.'));
                }
                if (!failures.length) {
                    return freezeReadinessOutput({
                        allowed: true,
                        readOnly: record.readOnly === true,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        readinessVerification: true,
                        certificationAuthority: true,
                        certificationBypassAuthority: false,
                        visibility: VISIBILITY.PRODUCTION_READINESS_GOVERNANCE,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly && !readinessVerification) {
                    failures.push(safeFailure('SUPER_ADMIN_PRODUCTION_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure readiness visibility.'));
                }
                if (bypassRequested || record.certificationApproval === true || record.productionCertification === true || record.finalApproval === true) {
                    failures.push(safeFailure('SUPER_ADMIN_CERTIFICATION_BYPASS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot bypass production certification governance.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_READINESS_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant deployment visibility is blocked.'));
                }
                if (!failures.length) {
                    return freezeReadinessOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        readinessVerification: true,
                        certificationAuthority: false,
                        certificationBypassAuthority: false,
                        visibility: VISIBILITY.INFRASTRUCTURE_READINESS_VISIBILITY,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_PRODUCTION_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access production governance center.'));
            }

            return freezeReadinessOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                readinessVerification: readinessVerification,
                certificationAuthority: false,
                certificationBypassAuthority: false,
                visibility: VISIBILITY.NONE,
                failures: failures
            });
        } catch (error) {
            return freezeReadinessOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                certificationAuthority: false,
                certificationBypassAuthority: false,
                failures: [safeFailure('READINESS_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Readiness scope validation failed safely.')]
            });
        }
    }

    function readinessFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeReadinessPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitReadiness(data) {
        var rows = []
            .concat(list(data, 'productionReadinessRecords'))
            .concat(list(data, 'releaseCertificationRecords'))
            .concat(list(data, 'readinessChecklistRecords'))
            .concat(list(data, 'stabilityVerificationRecords'))
            .concat(list(data, 'releaseReadinessRecords'));
        return rows.map(function mapReadiness(row) {
            return readinessFromRow(row, { readinessType: row && (row.readinessType || row.type || 'PRODUCTION_READINESS') });
        }).filter(Boolean);
    }

    function collectDerivedReadiness(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isReadinessSignal(Object.assign({}, defaults, row))) return;
                var timestamp = row.createdAt || row.date || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(readinessFromRow(Object.assign({
                    readinessId: row.readinessId || row.certificationId || row.checklistId || row.stabilityId || row.deploymentId || row.deploymentLogId || row.releaseId || row.validationId || row.migrationId || row.incidentId || row.healthId || row.rolloutId || row.emergencyId || row.auditId || row.id || defaults.prefix + '-' + index,
                    certificationId: row.certificationId || row.approvalId || row.checklistId,
                    releaseId: row.releaseId || row.buildId || row.version,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.readinessState || row.state || row.status || row.deploymentState || row.incidentState || row.healthState || row.rolloutState || defaults.state || 'VALIDATING',
                    severity: row.severity || row.classification || defaults.severity || 'INFO',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    source: defaults.source,
                    readinessType: defaults.readinessType,
                    actionType: defaults.actionType,
                    correlationId: row.correlationId || row.eventId,
                    rollbackPrepared: row.rollbackPrepared === true || row.rollbackReady === true || defaults.rollbackPrepared === true,
                    rollbackActivated: row.rollbackActivated === true || defaults.rollbackActivated === true,
                    rollbackInstability: row.rollbackInstability === true || defaults.rollbackInstability === true,
                    stabilityVerified: row.stabilityVerified === true || defaults.stabilityVerified === true,
                    environmentConsistent: row.environmentConsistent === false || row.environmentDrift === true || defaults.environmentConsistent === false ? false : true,
                    checklistFailures: row.checklistFailures || row.validationFailures || row.failureCount || (Array.isArray(row.failures) ? row.failures.length : 0),
                    operationalScore: row.operationalScore || row.stabilityScore || defaults.operationalScore
                }, row)));
            });
        }
        addRows(list(data, 'deploymentValidationRecords').concat(list(data, 'deploymentGovernanceRecords')).concat(list(data, 'deploymentLogs')), { prefix: 'DEPLOY-READY', module: 'deployment', source: 'deploymentValidationService', readinessType: 'DEPLOYMENT_APPROVAL', actionType: 'DEPLOYMENT_READINESS_EVENT', rollbackPrepared: true });
        addRows(list(data, 'stagingValidationReports').concat(list(data, 'stagingValidationRecords')).concat(list(data, 'migrationValidationRecords')), { prefix: 'STAGE-READY', module: 'staging', source: 'stagingValidationService', readinessType: 'ENVIRONMENT_VERIFICATION', actionType: 'ENVIRONMENT_READINESS_EVENT', environmentConsistent: false });
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT-READY', module: 'incident', source: 'globalIncidentService', readinessType: 'OPERATIONAL_READINESS', actionType: 'READINESS_LINKED_INCIDENT' });
        addRows(list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords')), { prefix: 'HEALTH-READY', module: 'platformHealth', source: 'platformHealthMonitoringService', readinessType: 'STABILITY_VERIFICATION', actionType: 'READINESS_HEALTH_EVENT' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT-READY', module: 'featureRollout', source: 'featureRolloutService', readinessType: 'ROLLBACK_PREPAREDNESS', actionType: 'ROLLOUT_READINESS_EVENT', rollbackPrepared: true, rollbackInstability: true });
        addRows(list(data, 'emergencyOverrideRecords').concat(list(data, 'emergencyOverrides')), { prefix: 'EMERGENCY-READY', module: 'emergency', source: 'emergencyOverrideService', readinessType: 'ROLLBACK_PREPAREDNESS', actionType: 'RECOVERY_CERTIFICATION_EVENT', rollbackPrepared: true, rollbackActivated: true });
        addRows(list(data, 'auditLogs').concat(list(data, 'globalAuditRecords')), { prefix: 'AUDIT-READY', module: 'audit', source: 'auditService', readinessType: 'RELEASE_GOVERNANCE', actionType: 'READINESS_AUDIT_EVENT' });
        return rows.filter(Boolean);
    }

    function externalReadinessSignals(context) {
        var signals = { deployment: {}, incident: {}, health: {}, emergency: {}, rollout: {}, environment: {}, staging: {} };
        var safeCtx = Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
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
        try {
            var env = global.EnvironmentGovernanceService || global.environmentGovernanceService;
            if (env && typeof env.generateDeploymentGovernanceReport === 'function') signals.environment = env.generateDeploymentGovernanceReport({ environment: 'PRODUCTION' }, { skipTelemetry: true }) || {};
        } catch (error) {}
        try {
            var staging = global.StagingValidationService || global.stagingValidationService;
            if (staging && typeof staging.runStagingValidation === 'function') signals.staging = staging.runStagingValidation({ validationOnly: true }, { skipTelemetry: true, skipAuditPersistence: true }) || {};
        } catch (error) {}
        return signals;
    }

    function summarizeReadiness(rows, signals) {
        var readiness = Array.isArray(rows) ? rows : [];
        var totals = readiness.reduce(function reduce(acc, row) {
            acc.readinessChecklistWorkflows += 1;
            if (row.readinessState === 'BLOCKED' || row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.degradedReleaseReadiness += 1;
            if (row.readinessState === 'RELEASE_READY' || row.readinessState === 'CERTIFIED' || row.readinessState === 'READY') acc.readyOrCertified += 1;
            if (row.readinessState === 'ARCHIVED') acc.archivedCertifications += 1;
            if (row.checklistFailures > 0 || row.certificationBlocked) acc.failedCertificationPatterns += Math.max(1, row.checklistFailures);
            if (row.rollbackPrepared) acc.rollbackPreparedReleases += 1;
            if (row.rollbackActivated) acc.rollbackActivatedReleases += 1;
            if (row.rollbackInstability) acc.rollbackInstability += 1;
            if (row.stabilityVerified || row.readinessType === 'STABILITY_VERIFICATION') acc.stabilityReviewWorkflows += 1;
            if (row.environmentConsistent === false || row.readinessType === 'ENVIRONMENT_VERIFICATION') acc.environmentInconsistencies += row.environmentConsistent === false ? 1 : 0;
            if (row.readinessType === 'ENVIRONMENT_VERIFICATION') acc.environmentVerification += 1;
            if (row.approvalCheckpoint || row.readinessState === 'IN_REVIEW') acc.certificationApprovalGates += 1;
            if (row.readinessState === 'BLOCKED' || row.readinessState === 'IN_REVIEW') acc.releaseApprovalEscalationFrequency += 1;
            if (row.correlationId) acc.deploymentCongestion += 1;
            if (row.operationalScore < 70 || row.stabilityScore < 70) acc.operationalInstability += 1;
            if (row.source === 'deploymentValidationService' || row.readinessType === 'DEPLOYMENT_APPROVAL') acc.deploymentLinkedReadinessFailures += row.severity === SEVERITIES.INFO ? 0 : 1;
            if (row.source === 'globalIncidentService' || row.source === 'platformHealthMonitoringService') acc.operationalDegradationRisks += 1;
            if (row.source === 'emergencyOverrideService') acc.certificationRecoveryTracking += 1;
            acc.operationalScoreTotal += row.operationalScore;
            return acc;
        }, {
            readinessChecklistWorkflows: 0,
            certificationApprovalGates: 0,
            rollbackPreparedReleases: 0,
            rollbackActivatedReleases: 0,
            stabilityReviewWorkflows: 0,
            environmentVerification: 0,
            failedCertificationPatterns: 0,
            degradedReleaseReadiness: 0,
            rollbackInstability: 0,
            environmentInconsistencies: 0,
            deploymentCongestion: 0,
            operationalInstability: 0,
            releaseApprovalEscalationFrequency: 0,
            deploymentLinkedReadinessFailures: 0,
            operationalDegradationRisks: 0,
            certificationRecoveryTracking: 0,
            readyOrCertified: 0,
            archivedCertifications: 0,
            operationalScoreTotal: 0
        });

        if (signals && signals.deployment && signals.deployment.deploymentRiskIntelligence) {
            totals.failedCertificationPatterns += safeNumber(signals.deployment.deploymentRiskIntelligence.failedValidationPatterns, 0);
            totals.environmentInconsistencies += safeNumber(signals.deployment.deploymentRiskIntelligence.environmentDrift, 0);
        }
        if (signals && signals.incident && signals.incident.incidentIntelligence) {
            totals.operationalDegradationRisks += safeNumber(signals.incident.incidentIntelligence.incidentEscalationFrequency, 0);
        }
        if (signals && signals.health && signals.health.platformHealthIntelligence) {
            totals.operationalInstability += safeNumber(signals.health.platformHealthIntelligence.workflowCongestion, 0);
        }

        var count = readiness.length || 1;
        var failurePenalty = totals.failedCertificationPatterns * 8 + totals.degradedReleaseReadiness * 6 + totals.environmentInconsistencies * 6 + totals.rollbackInstability * 5;
        var governanceHealth = clamp(100 - failurePenalty, 0, 100);
        var stabilityScore = clamp(Math.round((totals.operationalScoreTotal || (count * 85)) / count), 0, 100);
        var rollbackHealth = clamp(Math.round((totals.rollbackPreparedReleases / count) * 100) - totals.rollbackInstability * 5, 0, 100);
        var successRate = clamp(Math.round((totals.readyOrCertified / count) * 100), 0, 100);

        return {
            totals: totals,
            releaseCertification: {
                readinessChecklistWorkflows: totals.readinessChecklistWorkflows,
                certificationApprovalGates: totals.certificationApprovalGates,
                rollbackPreparednessVerification: totals.rollbackPreparedReleases,
                stabilityReviewWorkflows: totals.stabilityReviewWorkflows,
                environmentVerification: totals.environmentVerification,
                productionFreezeGovernance: totals.degradedReleaseReadiness + totals.releaseApprovalEscalationFrequency,
                releaseArchivalGovernance: totals.archivedCertifications,
                unsafeProductionReleaseExecutionBlocked: true
            },
            operationalReadinessIntelligence: {
                failedCertificationPatterns: totals.failedCertificationPatterns,
                degradedReleaseReadiness: totals.degradedReleaseReadiness,
                rollbackInstability: totals.rollbackInstability,
                environmentInconsistencies: totals.environmentInconsistencies,
                deploymentCongestion: totals.deploymentCongestion,
                operationalInstability: totals.operationalInstability,
                releaseApprovalEscalationFrequency: totals.releaseApprovalEscalationFrequency
            },
            rollbackPreparedness: {
                rollbackPreparedReleases: totals.rollbackPreparedReleases,
                rollbackActivatedReleases: totals.rollbackActivatedReleases,
                rollbackPreparednessHealth: rollbackHealth,
                rollbackInstability: totals.rollbackInstability,
                certificationRollbackReadiness: totals.rollbackPreparedReleases > 0,
                rollbackHealthVerification: rollbackHealth
            },
            incidentDeploymentIntegration: {
                deploymentLinkedReadinessFailures: totals.deploymentLinkedReadinessFailures,
                operationalDegradationRisks: totals.operationalDegradationRisks,
                rollbackPreparednessHealth: rollbackHealth,
                releaseStabilizationAnalytics: stabilityScore,
                certificationRecoveryTracking: totals.certificationRecoveryTracking
            },
            readinessAnalytics: {
                certificationSuccessRates: successRate,
                readinessValidationFailures: totals.failedCertificationPatterns,
                rollbackPreparednessTrends: totals.rollbackPreparedReleases,
                deploymentApprovalTimelines: totals.certificationApprovalGates,
                operationalStabilityScores: stabilityScore,
                releaseCongestionAnalytics: totals.deploymentCongestion,
                certificationGovernanceHealth: governanceHealth
            }
        };
    }

    function collectReadinessRows(filters, context) {
        var data = rawData();
        var rows = collectExplicitReadiness(data).concat(collectDerivedReadiness(data));
        var seen = {};
        var targetTenant = normalizeTenantSlug(filters && (filters.targetTenantId || filters.targetTenantSlug || filters.tenantId || filters.tenantSlug));
        rows = rows.filter(function filterRow(row) {
            if (!row) return false;
            var key = (row.readinessId || '') + '|' + (row.correlationId || '') + '|' + (row.source || '');
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
            audit.recordAudit(freezeReadinessOutput({
                actionType: actionType,
                module: 'ProductionReadinessService',
                severity: payload && payload.severity || SEVERITIES.INFO,
                actorRole: normalizeRole(context && context.actor && context.actor.role),
                source: 'productionReadinessService',
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
            telemetry.emitTelemetry('production_readiness', eventType, freezeReadinessOutput(payload || {}));
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
            metrics.recordWorkflowMetric(name, freezeReadinessOutput(payload || {}));
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

    function pickReadinessFlag(input, names, fallback) {
        var source = input && typeof input === 'object' ? input : {};
        for (var i = 0; i < names.length; i += 1) {
            var key = names[i];
            if (Object.prototype.hasOwnProperty.call(source, key)) return safeBoolean(source[key], fallback);
        }
        return fallback === true;
    }

    function readinessChecklistFromInput(input) {
        var source = input && typeof input === 'object' ? input : {};
        var checklist = source.readinessChecklist && typeof source.readinessChecklist === 'object' ? source.readinessChecklist : {};
        function category(label, keys, fallback) {
            var passed = pickReadinessFlag(Object.assign({}, checklist, source), keys, fallback);
            return {
                label: label,
                passed: passed,
                status: passed ? 'READY' : 'BLOCKED'
            };
        }
        var results = {
            infrastructureReadiness: category('Infrastructure readiness', ['infrastructureReady', 'infrastructureReadiness', 'infrastructureValidationPassed'], false),
            deploymentReadiness: category('Deployment readiness', ['deploymentReady', 'deploymentReadiness', 'deploymentValidationPassed'], false),
            migrationReadiness: category('Migration readiness', ['migrationReady', 'migrationReadiness', 'migrationValidationPassed'], false),
            securityReadiness: category('Security readiness', ['securityReady', 'securityReadiness', 'securityValidationPassed'], false),
            tenantIsolationReadiness: category('Tenant isolation readiness', ['tenantIsolationReady', 'tenantIsolationReadiness', 'tenantIsolationVerified'], true),
            rollbackReadiness: category('Rollback readiness', ['rollbackReady', 'rollbackReadiness', 'rollbackPrepared', 'rollbackPreparednessReady'], false),
            auditReadiness: category('Audit readiness', ['auditReady', 'auditReadiness', 'auditValidationPassed'], false),
            observabilityReadiness: category('Observability readiness', ['observabilityReady', 'observabilityReadiness', 'healthMonitoringReady'], false),
            performanceReadiness: category('Performance readiness', ['performanceReady', 'performanceReadiness', 'performanceValidationPassed'], false)
        };
        var keys = Object.keys(results);
        var passed = keys.filter(function countPassed(key) { return results[key].passed === true; }).length;
        return {
            checklistResults: results,
            checklistCompletion: {
                passedCategories: passed,
                totalCategories: keys.length,
                completionPercentage: clamp(Math.round((passed / keys.length) * 100), 0, 100)
            }
        };
    }

    function collectCertificationBlockers(input) {
        var source = input && typeof input === 'object' ? input : {};
        var blockers = [];
        function add(flag, code, message) {
            if (safeBoolean(flag, false)) blockers.push(safeFailure(code, SEVERITIES.CRITICAL_BLOCKER, message));
        }
        add(source.criticalIncidentExists || source.criticalIncident, 'CRITICAL_INCIDENT_BLOCKS_CERTIFICATION', 'Critical incidents must be resolved before production certification.');
        add(source.healthStateCritical || source.criticalHealth, 'CRITICAL_HEALTH_STATE_BLOCKS_CERTIFICATION', 'Critical platform health states block release certification.');
        add(source.deploymentValidationFailed || source.deploymentValidation === false || source.deploymentBlocked, 'DEPLOYMENT_VALIDATION_BLOCKS_CERTIFICATION', 'Failed deployment validation blocks production certification.');
        add(source.rollbackReadinessIncomplete || source.rollbackReady === false || source.rollbackBlocked, 'ROLLBACK_READINESS_BLOCKS_CERTIFICATION', 'Rollback readiness must be complete before certification.');
        add(source.emergencyOverrideActive || source.emergencyOverride || source.emergencyBlocked, 'EMERGENCY_OVERRIDE_BLOCKS_CERTIFICATION', 'Active emergency overrides block production certification.');
        add(source.unresolvedAuditFindings || source.auditFindings || source.auditBlocked, 'UNRESOLVED_AUDIT_FINDINGS_BLOCK_CERTIFICATION', 'Unresolved audit findings block production certification.');
        add(source.environmentMismatch || source.environmentMatched === false, 'ENVIRONMENT_MISMATCH_BLOCKS_CERTIFICATION', 'Environment mismatches must be resolved before production certification.');
        return blockers;
    }

    function calculateReadinessScore(input) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var checklist = readinessChecklistFromInput(source);
            var blockers = collectCertificationBlockers(source);
            var completion = checklist.checklistCompletion.completionPercentage;
            var score = blockers.length ? Math.min(completion, 49) : completion;
            var scoreLevel = 'NOT_READY';
            if (!blockers.length && score >= 100 && safeBoolean(source.certificationApproved, false) && safeBoolean(source.releaseSignoff, false)) scoreLevel = 'PRODUCTION_CERTIFIED';
            else if (!blockers.length && score >= 80) scoreLevel = 'READY';
            else if (!blockers.length && score >= 50) scoreLevel = 'PARTIALLY_READY';
            var releaseEligible = scoreLevel === 'PRODUCTION_CERTIFIED' && blockers.length === 0;
            var output = {
                success: true,
                readinessScore: score,
                score: score,
                scoreLevel: scoreLevel,
                scoreLabel: scoreLevel.replace(/_/g, ' '),
                certificationBlocked: blockers.length > 0 || scoreLevel === 'NOT_READY',
                blockedCertificationReasons: blockers,
                checklistResults: checklist.checklistResults,
                checklistCompletion: checklist.checklistCompletion,
                releaseEligibility: {
                    releaseEligible: releaseEligible,
                    releaseBlocked: !releaseEligible,
                    requiredCertification: 'PRODUCTION_CERTIFIED',
                    scoreLevel: scoreLevel,
                    blockedCertificationReasons: blockers
                },
                productionCertificationGovernancePreserved: true,
                tenantIsolationPreserved: true
            };
            return freezeReadinessOutput(output);
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                readinessScore: 0,
                score: 0,
                scoreLevel: 'NOT_READY',
                certificationBlocked: true,
                releaseEligibility: { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                blockedCertificationReasons: [safeFailure('READINESS_SCORE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Readiness scoring failed safely.')]
            });
        }
    }

    function stateIsActiveBlocked(state) {
        var normalized = normalizeReadinessState(state, normalizeToken(state || ''));
        var token = normalizeToken(state || '');
        return normalized === 'BLOCKED' || /FAILED|CRITICAL|ESCALATED|OPEN|ACTIVE|RECOVERY_ACTIVE|ROLLBACK_PENDING|DEGRADED/.test(token);
    }

    function anySignal(rows, predicate) {
        try {
            return (Array.isArray(rows) ? rows : []).some(function each(row) { return predicate(row || {}); });
        } catch (error) {
            return false;
        }
    }

    function verifyCertificationRequirements(filters, context) {
        try {
            var input = filters && typeof filters === 'object' ? filters : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateReadinessScope(Object.assign({ aggregateOnly: true, readOnly: true }, input), ctx);
            if (!scope.allowed) {
                return freezeReadinessOutput({
                    success: false,
                    certificationBlocked: true,
                    releaseEligibility: { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                    blockedCertificationReasons: scope.failures,
                    requirementChecks: {},
                    failures: scope.failures
                });
            }
            var data = rawData();
            var rows = collectReadinessRows(input, ctx);
            var deploymentRows = list(data, 'deploymentValidationRecords').concat(list(data, 'deploymentGovernanceRecords')).concat(list(data, 'deploymentLogs'));
            var incidentRows = list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents'));
            var healthRows = list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords'));
            var emergencyRows = list(data, 'emergencyOverrideRecords').concat(list(data, 'emergencyOverrides'));
            var auditRows = list(data, 'globalAuditRecords').concat(list(data, 'auditLogs'));

            var criticalIncidentExists = anySignal(incidentRows, function incident(row) {
                var state = normalizeToken(row.incidentState || row.state || row.status || '');
                var severity = normalizeToken(row.severity || row.classification || '');
                return (severity === 'CRITICAL' || state === 'CRITICAL' || state === 'ESCALATED') && !/RESOLVED|CLOSED|ARCHIVED/.test(state);
            });
            var healthStateCritical = anySignal(healthRows, function health(row) {
                var state = normalizeToken(row.healthState || row.state || row.status || '');
                var severity = normalizeToken(row.severity || row.classification || '');
                return state === 'CRITICAL' || severity === 'CRITICAL' || safeNumber(row.failureRate, 0) >= 15;
            });
            var deploymentValidationFailed = anySignal(deploymentRows, function deployment(row) {
                var state = normalizeToken(row.deploymentState || row.state || row.status || '');
                return /FAILED|BLOCKED|CRITICAL|DEGRADED/.test(state) || safeNumber(row.validationFailures || row.failureCount, 0) > 0;
            });
            var rollbackReadinessIncomplete = anySignal(rows.concat(deploymentRows), function rollback(row) {
                return row.rollbackReady === false || row.rollbackPrepared === false || row.rollbackReadinessIncomplete === true;
            });
            var emergencyOverrideActive = anySignal(emergencyRows, function emergency(row) {
                var state = normalizeToken(row.emergencyState || row.overrideState || row.state || row.status || '');
                return /ACTIVE|RECOVERY|ROLLBACK_PENDING|OPEN/.test(state) && !/RESOLVED|CLOSED|ARCHIVED/.test(state);
            });
            var unresolvedAuditFindings = anySignal(auditRows, function audit(row) {
                var state = normalizeToken(row.auditState || row.state || row.status || '');
                var severity = normalizeToken(row.severity || row.classification || '');
                return safeNumber(row.unresolvedFindings || row.findingCount, 0) > 0 || /OPEN|ESCALATED|FAILED|BLOCKED/.test(state) || severity === 'CRITICAL';
            });
            var environmentMismatch = anySignal(rows.concat(deploymentRows), function environment(row) {
                return row.environmentConsistent === false || row.environmentDrift === true || row.environmentMismatch === true;
            });

            var requirementInput = {
                criticalIncidentExists: criticalIncidentExists,
                healthStateCritical: healthStateCritical,
                deploymentValidationFailed: deploymentValidationFailed,
                rollbackReadinessIncomplete: rollbackReadinessIncomplete,
                emergencyOverrideActive: emergencyOverrideActive,
                unresolvedAuditFindings: unresolvedAuditFindings,
                environmentMismatch: environmentMismatch
            };
            var blockers = collectCertificationBlockers(requirementInput);
            var certificationBlocked = blockers.length > 0;
            var output = {
                success: true,
                certificationBlocked: certificationBlocked,
                releaseEligibility: {
                    releaseEligible: false,
                    releaseBlocked: true,
                    requiredCertification: 'PRODUCTION_CERTIFIED',
                    blockedCertificationReasons: blockers
                },
                blockedCertificationReasons: blockers,
                requirementChecks: {
                    criticalIncident: { passed: !criticalIncidentExists, blocked: criticalIncidentExists },
                    criticalHealth: { passed: !healthStateCritical, blocked: healthStateCritical },
                    deploymentValidation: { passed: !deploymentValidationFailed, blocked: deploymentValidationFailed },
                    rollbackPreparedness: { passed: !rollbackReadinessIncomplete, blocked: rollbackReadinessIncomplete },
                    emergencyOverride: { passed: !emergencyOverrideActive, blocked: emergencyOverrideActive },
                    auditFindings: { passed: !unresolvedAuditFindings, blocked: unresolvedAuditFindings },
                    environmentValidation: { passed: !environmentMismatch, blocked: environmentMismatch }
                },
                integrationHealth: {
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    globalAuditVisibilityIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService)
                },
                tenantIsolationPreserved: true,
                productionCertificationGovernancePreserved: true
            };
            emitAudit('PRODUCTION_CERTIFICATION_REQUIREMENTS_VERIFIED', output, ctx);
            emitTelemetry('PRODUCTION_CERTIFICATION_REQUIREMENTS_VERIFIED', output, ctx);
            emitMetric('production_certification_requirements', output, ctx);
            return freezeReadinessOutput(output);
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                certificationBlocked: true,
                releaseEligibility: { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                blockedCertificationReasons: [safeFailure('CERTIFICATION_REQUIREMENTS_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Certification requirement verification failed safely.')],
                requirementChecks: {}
            });
        }
    }

    function validateProductionReadiness(payload, context) {
        try {
            var input = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateReadinessScope(Object.assign({ aggregateOnly: true, readOnly: true }, input), ctx);
            if (!scope.allowed) {
                return freezeReadinessOutput({
                    success: false,
                    validationResults: {},
                    readinessScore: { score: 0, scoreLevel: 'NOT_READY' },
                    releaseEligibility: { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                    failures: scope.failures
                });
            }
            var score = calculateReadinessScore(input);
            var output = {
                success: score.success === true,
                validationResults: score.checklistResults || {},
                readinessChecklist: {
                    checklistResults: score.checklistResults || {},
                    checklistCompletion: score.checklistCompletion || {}
                },
                readinessScore: {
                    score: score.score || 0,
                    scoreLevel: score.scoreLevel || 'NOT_READY',
                    certificationBlocked: score.certificationBlocked === true
                },
                blockedCertificationReasons: score.blockedCertificationReasons || [],
                releaseEligibility: score.releaseEligibility || { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                certificationGovernance: {
                    certificationStatus: score.scoreLevel === 'PRODUCTION_CERTIFIED' ? 'CERTIFIED' : score.scoreLevel === 'READY' ? 'READY' : 'IN_REVIEW',
                    productionCertified: score.scoreLevel === 'PRODUCTION_CERTIFIED',
                    certificationBlocked: score.certificationBlocked === true
                },
                tenantIsolationPreserved: true,
                productionCertificationGovernancePreserved: true
            };
            emitAudit('PRODUCTION_READINESS_VALIDATED', output, ctx);
            emitTelemetry('PRODUCTION_READINESS_VALIDATED', output, ctx);
            emitMetric('production_readiness_validated', output, ctx);
            return freezeReadinessOutput(output);
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                validationResults: {},
                readinessScore: { score: 0, scoreLevel: 'NOT_READY' },
                releaseEligibility: { releaseEligible: false, releaseBlocked: true, requiredCertification: 'PRODUCTION_CERTIFIED' },
                failures: [safeFailure('PRODUCTION_READINESS_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Production readiness validation failed safely.')]
            });
        }
    }

    function detectReleaseInstability(filters, context) {
        try {
            var scope = validateReadinessScope(Object.assign({ aggregateOnly: true, readOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeReadinessOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    operationalReadinessIntelligence: {
                        failedCertificationPatterns: 0,
                        degradedReleaseReadiness: 0,
                        rollbackInstability: 0,
                        environmentInconsistencies: 0,
                        deploymentCongestion: 0,
                        operationalInstability: 0,
                        releaseApprovalEscalationFrequency: 0
                    },
                    failures: scope.failures
                });
            }
            var rows = collectReadinessRows(filters || {}, context || {});
            var signals = externalReadinessSignals(context || {});
            var summary = summarizeReadiness(rows, signals);
            var classification = summary.operationalReadinessIntelligence.failedCertificationPatterns || summary.operationalReadinessIntelligence.environmentInconsistencies || summary.operationalReadinessIntelligence.rollbackInstability ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO;
            var output = {
                success: true,
                classification: classification,
                operationalReadinessIntelligence: summary.operationalReadinessIntelligence,
                rollbackPreparedness: summary.rollbackPreparedness,
                readinessAnalytics: summary.readinessAnalytics,
                tenantIsolationPreserved: true,
                productionCertificationGovernancePreserved: true
            };
            emitAudit('PRODUCTION_READINESS_INSTABILITY_REVIEWED', output, context || {});
            emitTelemetry('PRODUCTION_READINESS_INSTABILITY_REVIEWED', output, context || {});
            emitMetric('production_readiness_instability', output, context || {});
            return freezeReadinessOutput(output);
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                operationalReadinessIntelligence: {
                    failedCertificationPatterns: 0,
                    degradedReleaseReadiness: 0,
                    rollbackInstability: 0,
                    environmentInconsistencies: 0,
                    deploymentCongestion: 0,
                    operationalInstability: 0,
                    releaseApprovalEscalationFrequency: 0
                },
                failures: [safeFailure('RELEASE_INSTABILITY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release instability detection failed safely.')]
            });
        }
    }

    function readinessRowSummary(row) {
        return {
            readinessId: row.readinessId,
            certificationId: row.certificationId,
            releaseId: row.releaseId,
            tenantSlug: row.tenantSlug,
            tenantId: row.tenantId,
            readinessType: row.readinessType,
            readinessState: row.readinessState,
            severity: row.severity,
            environment: row.environment,
            rollbackPrepared: row.rollbackPrepared,
            rollbackActivated: row.rollbackActivated,
            stabilityVerified: row.stabilityVerified,
            environmentConsistent: row.environmentConsistent,
            checklistFailures: row.checklistFailures,
            operationalScore: row.operationalScore,
            correlationId: row.correlationId,
            source: row.source,
            createdAt: row.createdAt
        };
    }

    function generateProductionReadinessReport(filters, context) {
        try {
            var input = filters && typeof filters === 'object' ? filters : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateReadinessScope(Object.assign({ aggregateOnly: true, readOnly: true }, input), ctx);
            if (!scope.allowed) {
                var denied = {
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    generatedAt: nowIso(ctx),
                    readinessSummaries: [],
                    failures: scope.failures,
                    accessGovernance: {
                        crossTenantDeploymentLeakageBlocked: true,
                        unsafeProductionCertificationBlocked: true,
                        superAdminCertificationBypassAuthority: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        historicalCertificationRecordsImmutable: true,
                        existingTenantWorkflowsPreserved: true,
                        productionActionsAuditable: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        productionCertificationGovernancePreserved: true
                    }
                };
                emitAudit('PRODUCTION_READINESS_ACCESS_DENIED', denied, ctx);
                return freezeReadinessOutput(denied);
            }

            var rows = collectReadinessRows(input, ctx);
            var signals = externalReadinessSignals(ctx);
            var summary = summarizeReadiness(rows, signals);
            var requirements = verifyCertificationRequirements(input, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var checks = requirements.requirementChecks || {};
            function blocked(name) {
                return !!(checks[name] && checks[name].blocked);
            }
            var scoreResult = calculateReadinessScore({
                infrastructureReady: !blocked('criticalHealth') && !blocked('emergencyOverride'),
                deploymentReady: !blocked('deploymentValidation') && summary.incidentDeploymentIntegration.deploymentLinkedReadinessFailures === 0,
                migrationReady: !blocked('environmentValidation') && summary.operationalReadinessIntelligence.environmentInconsistencies === 0,
                securityReady: !blocked('auditFindings'),
                tenantIsolationReady: true,
                rollbackReady: !blocked('rollbackPreparedness') && summary.rollbackPreparedness.rollbackPreparednessHealth >= 80,
                auditReady: !blocked('auditFindings'),
                observabilityReady: !blocked('criticalHealth'),
                performanceReady: !blocked('criticalHealth') && summary.readinessAnalytics.operationalStabilityScores >= 70,
                certificationApproved: input.certificationApproved === true || summary.releaseCertification.certificationApprovalGates > 0 && requirements.certificationBlocked !== true,
                releaseSignoff: input.releaseSignoff === true || summary.totals.readyOrCertified > 0 && requirements.certificationBlocked !== true,
                criticalIncidentExists: blocked('criticalIncident'),
                healthStateCritical: blocked('criticalHealth'),
                deploymentValidationFailed: blocked('deploymentValidation'),
                rollbackReadinessIncomplete: blocked('rollbackPreparedness'),
                emergencyOverrideActive: blocked('emergencyOverride'),
                unresolvedAuditFindings: blocked('auditFindings'),
                environmentMismatch: blocked('environmentValidation')
            });
            var severity = requirements.certificationBlocked ? SEVERITIES.CRITICAL_BLOCKER : summary.operationalReadinessIntelligence.failedCertificationPatterns || summary.operationalReadinessIntelligence.environmentInconsistencies || summary.operationalReadinessIntelligence.rollbackInstability ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO;
            if (summary.operationalReadinessIntelligence.degradedReleaseReadiness > 3) severity = SEVERITIES.CRITICAL_BLOCKER;
            var exposeRows = scope.infrastructureOnly ? [] : rows.map(readinessRowSummary);
            var certificationHistory = scope.infrastructureOnly ? [] : rows.filter(function filterHistory(row) {
                return row.readinessState === 'CERTIFIED' || row.readinessState === 'RELEASE_READY' || row.readinessState === 'READY' || row.readinessState === 'ARCHIVED' || row.certificationId;
            }).slice(0, 25).map(function history(row) {
                return {
                    readinessId: row.readinessId,
                    certificationId: row.certificationId,
                    releaseId: row.releaseId,
                    readinessState: row.readinessState,
                    readinessType: row.readinessType,
                    scoreLevel: scoreResult.scoreLevel,
                    certificationBlocked: row.certificationBlocked,
                    createdAt: row.createdAt,
                    certifiedAt: row.certifiedAt,
                    source: row.source,
                    correlationId: row.correlationId
                };
            });
            var modelState = requirements.certificationBlocked ? 'BLOCKED' : scoreResult.scoreLevel === 'PRODUCTION_CERTIFIED' ? 'RELEASE_READY' : scoreResult.scoreLevel === 'READY' ? 'READY' : 'IN_REVIEW';
            var readinessAnalytics = Object.assign({}, summary.readinessAnalytics, {
                readinessScore: scoreResult.score,
                scoreLevel: scoreResult.scoreLevel,
                blockedReleases: (requirements.blockedCertificationReasons || []).length,
                releaseEligibility: scoreResult.releaseEligibility && scoreResult.releaseEligibility.releaseEligible === true,
                certificationHistoryImmutable: true
            });
            var report = {
                VERSION: VERSION,
                success: true,
                classification: severity,
                generatedAt: nowIso(ctx),
                productionReadinessModel: {
                    state: modelState,
                    states: READINESS_STATES,
                    types: READINESS_TYPES,
                    readinessScoreLevels: READINESS_SCORE_LEVELS
                },
                readinessChecklist: {
                    checklistResults: scoreResult.checklistResults,
                    checklistCompletion: scoreResult.checklistCompletion
                },
                readinessScore: {
                    score: scoreResult.score,
                    readinessScore: scoreResult.score,
                    scoreLevel: scoreResult.scoreLevel,
                    scoreLabel: scoreResult.scoreLabel,
                    certificationBlocked: scoreResult.certificationBlocked
                },
                certificationGovernance: {
                    certificationStatus: requirements.certificationBlocked ? 'BLOCKED' : scoreResult.scoreLevel === 'PRODUCTION_CERTIFIED' ? 'CERTIFIED' : modelState,
                    certificationWorkflowState: requirements.certificationBlocked ? 'BLOCKED' : 'VALIDATING',
                    productionCertified: scoreResult.scoreLevel === 'PRODUCTION_CERTIFIED',
                    certificationBlocked: requirements.certificationBlocked === true,
                    readinessReviews: summary.releaseCertification.readinessChecklistWorkflows,
                    approvalCheckpoints: summary.releaseCertification.certificationApprovalGates,
                    certificationWorkflows: summary.releaseCertification.readinessChecklistWorkflows,
                    productionGates: scoreResult.checklistCompletion,
                    releaseSignoffRecords: certificationHistory.length,
                    readinessReports: rows.length,
                    certificationHistoryImmutable: true
                },
                releaseEligibility: scoreResult.releaseEligibility,
                blockedCertificationReasons: requirements.blockedCertificationReasons || scoreResult.blockedCertificationReasons || [],
                certificationHistory: certificationHistory,
                releaseCertification: summary.releaseCertification,
                operationalReadinessIntelligence: summary.operationalReadinessIntelligence,
                rollbackPreparedness: summary.rollbackPreparedness,
                incidentDeploymentIntegration: summary.incidentDeploymentIntegration,
                readinessAnalytics: readinessAnalytics,
                readinessSummaries: exposeRows,
                accessGovernance: {
                    crossTenantDeploymentLeakageBlocked: true,
                    unsafeProductionCertificationBlocked: true,
                    superAdminCertificationBypassAuthority: false,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalCertificationRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    productionActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    productionCertificationGovernancePreserved: true
                },
                integrationHealth: {
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService),
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    globalAuditVisibilityIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService),
                    emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    environmentGovernanceIntegrated: !!(global.EnvironmentGovernanceService || global.environmentGovernanceService),
                    stagingValidationIntegrated: !!(global.StagingValidationService || global.stagingValidationService)
                },
                governanceDashboard: {
                    label: 'Enterprise Production Certification Center',
                    certificationIndicators: summary.releaseCertification.certificationApprovalGates,
                    readinessScore: scoreResult.score,
                    certificationStatus: requirements.certificationBlocked ? 'BLOCKED' : scoreResult.scoreLevel,
                    blockedConditions: (requirements.blockedCertificationReasons || []).length,
                    releaseEligibility: scoreResult.releaseEligibility && scoreResult.releaseEligibility.releaseEligible === true,
                    rollbackPreparednessMarkers: summary.rollbackPreparedness.rollbackPreparedReleases,
                    operationalStabilitySummaries: readinessAnalytics.operationalStabilityScores,
                    releaseAnalytics: readinessAnalytics.certificationGovernanceHealth,
                    governanceVisibility: scope.visibility
                }
            };
            emitAudit('PRODUCTION_READINESS_REPORT_GENERATED', report, ctx);
            emitTelemetry('PRODUCTION_READINESS_REPORT_GENERATED', report, ctx);
            emitMetric('production_readiness_report', report, ctx);
            return freezeReadinessOutput(report);
        } catch (error) {
            return freezeReadinessOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                readinessSummaries: [],
                failures: [safeFailure('PRODUCTION_READINESS_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Production readiness report generation failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        var coverage = {
            malformedPayloads: false,
            dependencyAbsence: false,
            immutability: false,
            certificationRollback: false,
            certificationWorkflows: false,
            readinessScoring: false,
            releaseBlocking: false,
            environmentInconsistency: false,
            stabilityVerification: false,
            tenantIsolation: false
        };
        function add(name, ok) {
            checks.push(name);
            if (!ok) throw new Error(name);
        }
        try {
            var malformed = normalizeReadinessPayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);
            coverage.malformedPayloads = true;

            var owner = validateReadinessScope({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            add('PLATFORM_OWNER production certification scope works', owner.allowed === true && owner.certificationAuthority === true);

            var tenant = validateReadinessScope({}, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'tenant-a' } });
            add('tenant roles are blocked from production governance', tenant.allowed === false);
            coverage.tenantIsolation = true;

            var superAdminBypass = validateReadinessScope({ certificationBypass: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN' } });
            add('SUPER_ADMIN certification bypass is blocked', superAdminBypass.allowed === false);

            var superAdminInfra = validateReadinessScope({ infrastructureOnly: true, readinessVerification: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'tenant-a' } });
            add('SUPER_ADMIN infrastructure readiness scope is allowed', superAdminInfra.allowed === true && superAdminInfra.certificationAuthority === false);

            var archived = validateReadinessScope({ readinessState: 'ARCHIVED', certificationBypass: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            add('archived certification mutation is blocked', archived.allowed === false);

            var normalized = normalizeReadinessPayload({ state: 'release ready', readinessType: 'rollback preparedness', salary: 1, environmentConsistent: false }, {});
            add('protected field filtering removes restricted fields', normalized.success === true && JSON.stringify(normalized).indexOf('salary') === -1);
            add('immutable outputs enforced', Object.isFrozen(normalized) && Object.isFrozen(normalized.payload));
            coverage.immutability = true;
            coverage.certificationRollback = normalized.payload.rollbackPrepared === true;
            coverage.environmentInconsistency = normalized.payload.environmentConsistent === false;
            coverage.stabilityVerification = typeof normalized.payload.stabilityVerified === 'boolean';

            var blockedScore = calculateReadinessScore({
                infrastructureReady: true,
                deploymentReady: false,
                migrationReady: false,
                securityReady: true,
                tenantIsolationReady: true,
                rollbackReady: false,
                auditReady: true,
                observabilityReady: false,
                performanceReady: true,
                criticalIncidentExists: true,
                deploymentValidationFailed: true
            });
            add('release blocking prevents unsafe certification', blockedScore.scoreLevel === 'NOT_READY' && blockedScore.releaseEligibility.releaseEligible === false);
            coverage.releaseBlocking = true;

            var certifiedScore = calculateReadinessScore({
                infrastructureReady: true,
                deploymentReady: true,
                migrationReady: true,
                securityReady: true,
                tenantIsolationReady: true,
                rollbackReady: true,
                auditReady: true,
                observabilityReady: true,
                performanceReady: true,
                certificationApproved: true,
                releaseSignoff: true
            });
            add('production certified scoring requires completed gates', certifiedScore.scoreLevel === 'PRODUCTION_CERTIFIED');
            coverage.readinessScoring = true;

            var validated = validateProductionReadiness({ infrastructureReady: true, deploymentReady: true, tenantIsolationReady: true, securityReady: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('certification workflow validation runs safely', validated.success === true && validated.releaseEligibility.releaseEligible === false);
            coverage.certificationWorkflows = true;

            var savedDeployment = global.DeploymentValidationService;
            var savedIncident = global.GlobalIncidentService;
            var savedHealth = global.PlatformHealthMonitoringService;
            delete global.DeploymentValidationService;
            delete global.GlobalIncidentService;
            delete global.PlatformHealthMonitoringService;
            var report = generateProductionReadinessReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            global.DeploymentValidationService = savedDeployment;
            global.GlobalIncidentService = savedIncident;
            global.PlatformHealthMonitoringService = savedHealth;
            add('release instability detection degrades safely without optional dependencies', report.success === true);
            coverage.dependencyAbsence = true;

            return freezeReadinessOutput({ passed: true, checks: checks, coverage: coverage });
        } catch (error) {
            return freezeReadinessOutput({ passed: false, checks: checks, coverage: coverage, failures: [safeFailure('PRODUCTION_READINESS_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Self-test failed.')] });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        READINESS_STATES: READINESS_STATES,
        READINESS_SCORE_LEVELS: READINESS_SCORE_LEVELS,
        READINESS_TYPES: READINESS_TYPES,
        validateReadinessScope: validateReadinessScope,
        classifyReadinessRisk: classifyReadinessRisk,
        normalizeReadinessPayload: normalizeReadinessPayload,
        freezeReadinessOutput: freezeReadinessOutput,
        validateProductionReadiness: validateProductionReadiness,
        calculateReadinessScore: calculateReadinessScore,
        verifyCertificationRequirements: verifyCertificationRequirements,
        detectReleaseInstability: detectReleaseInstability,
        generateProductionReadinessReport: generateProductionReadinessReport,
        runSelfTest: runSelfTest
    });

    global.ProductionReadinessService = api;
    global.productionReadinessService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_PRODUCTION_READINESS_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_PRODUCTION_READINESS_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_PRODUCTION_READINESS_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
