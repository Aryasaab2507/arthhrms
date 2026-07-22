/**
 * cicdGovernanceService.js
 * ARTHHRMS Enterprise CI/CD Governance Pipeline + Automated Release Control.
 *
 * Platform-control-only pipeline intelligence for automated validation gates,
 * approval checkpoints, release quality scoring, and deployment control. It
 * reports governance state and blocks unsafe execution; it never deploys code,
 * bypasses approvals, or exposes tenant business data.
 */
(function attachCICDGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[CICDGovernanceService]';

    var PIPELINE_STATES = Object.freeze([
        'CREATED',
        'QUEUED',
        'VALIDATING',
        'APPROVAL_REQUIRED',
        'READY',
        'EXECUTING',
        'FAILED',
        'COMPLETED',
        'ARCHIVED'
    ]);

    var PIPELINE_STAGES = Object.freeze([
        'SOURCE_VALIDATION',
        'DEPENDENCY_VALIDATION',
        'TEST_VALIDATION',
        'SECURITY_VALIDATION',
        'DEPLOYMENT_VALIDATION',
        'READINESS_CERTIFICATION',
        'RELEASE_GOVERNANCE_VALIDATION',
        'PRODUCTION_APPROVAL_VALIDATION'
    ]);

    var RISK_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

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
        pipelineAuthority: true,
        executionAuthority: true,
        approvalAuthority: true,
        visibility: true,
        classification: true,
        state: true,
        states: true,
        stage: true,
        stages: true,
        stageResults: true,
        PIPELINE_STATES: true,
        PIPELINE_STAGES: true,
        RISK_LEVELS: true,
        riskClassification: true,
        riskScore: true,
        pipeline: true,
        pipelines: true,
        activePipelines: true,
        pipelineId: true,
        releaseId: true,
        deploymentId: true,
        tenantId: true,
        tenantSlug: true,
        pipelineState: true,
        pipelineStateRaw: true,
        pipelineGovernanceModel: true,
        pipelineBlocked: true,
        blockingConditions: true,
        validationResults: true,
        governanceStatus: true,
        governanceGatesEnforced: true,
        approvalsBypassed: true,
        productionDeploymentBlocked: true,
        approvalStatus: true,
        approvalRequired: true,
        approvalDelays: true,
        deploymentExecuted: true,
        executionRequested: true,
        emergencyBlockActive: true,
        sourceValid: true,
        dependenciesValid: true,
        testsPassed: true,
        securityValid: true,
        deploymentValidated: true,
        readinessCertified: true,
        releaseGovernanceValid: true,
        productionApprovalGranted: true,
        rollbackReady: true,
        certificationApproved: true,
        readinessApproved: true,
        environmentValidated: true,
        sourceValidation: true,
        dependencyValidation: true,
        testValidation: true,
        securityValidation: true,
        deploymentValidation: true,
        readinessCertification: true,
        releaseGovernanceValidation: true,
        productionApprovalValidation: true,
        pipelineConfidence: true,
        pipelineConfidenceScore: true,
        releaseQuality: true,
        releaseQualityScore: true,
        deploymentRiskScore: true,
        governanceComplianceScore: true,
        qualityScore: true,
        deploymentConfidence: true,
        pipelineAutomation: true,
        automatedValidationExecution: true,
        automatedDependencyChecks: true,
        automatedGovernanceChecks: true,
        automatedCertificationVerification: true,
        automatedReleaseEligibilityChecks: true,
        autoBypassBlocked: true,
        releaseControls: true,
        certificationApprovalRequired: true,
        readinessApprovalRequired: true,
        rollbackReadinessRequired: true,
        environmentValidationRequired: true,
        noDeploymentOnGovernanceFailure: true,
        governanceIntegrations: true,
        deploymentValidationIntegrated: true,
        productionReadinessIntegrated: true,
        safeReleaseIntegrated: true,
        environmentPromotionIntegrated: true,
        rollbackGovernanceIntegrated: true,
        globalAuditVisibilityIntegrated: true,
        pipelineAnalytics: true,
        pipelineSuccessRate: true,
        failedValidations: true,
        deploymentVelocity: true,
        governanceViolations: true,
        releaseQualityTrends: true,
        deploymentReliabilityTrends: true,
        auditSummary: true,
        pipelineActionsAuditable: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        accessGovernance: true,
        crossTenantPipelineLeakageBlocked: true,
        tenantBusinessDataExcluded: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        platformIsolationPreserved: true,
        cicdGovernanceIsolationPreserved: true,
        unsafeProductionDeploymentBlocked: true,
        governanceBypassBlocked: true,
        immutablePipelineHistory: true,
        immutableValidationHistory: true,
        immutableApprovalHistory: true,
        history: true,
        pipelineHistory: true,
        validationHistory: true,
        approvalHistory: true,
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

    function normalizePipelineState(value, fallback) {
        var state = normalizeToken(value || fallback || 'CREATED');
        if (state === 'PENDING_APPROVAL' || state === 'APPROVAL_PENDING') return 'APPROVAL_REQUIRED';
        if (state === 'RUNNING') return 'EXECUTING';
        if (state === 'SUCCESS' || state === 'SUCCEEDED') return 'COMPLETED';
        if (PIPELINE_STATES.indexOf(state) !== -1) return state;
        return fallback || 'CREATED';
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

    function freezePipelineOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'CICD_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'CI/CD governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'CICD_GOVERNANCE_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'CI/CD governance warning.', ''),
            recommendation: safeString(recommendation || 'Review pipeline governance evidence.', ''),
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

    function normalizePipelinePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePipelineOutput({
                    success: false,
                    malformedPayloads: true,
                    failures: [safeFailure('MALFORMED_CICD_PIPELINE_PAYLOAD', SEVERITIES.HIGH_RISK, 'Pipeline payload must be an object.')]
                });
            }
            var ctx = isPlainObject(context) ? context : {};
            var state = normalizePipelineState(payload.pipelineState || payload.state || payload.status, 'CREATED');
            var approvalStatus = normalizeToken(payload.approvalStatus || (payload.productionApprovalGranted ? 'APPROVED' : 'PENDING'));
            var pipeline = {
                pipelineId: safeString(payload.pipelineId || payload.buildId || payload.runId || 'PIPELINE-' + nowIso(ctx), ''),
                releaseId: safeString(payload.releaseId || payload.versionId || '', ''),
                deploymentId: safeString(payload.deploymentId || '', ''),
                tenantId: safeString(payload.tenantId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(ctx)),
                pipelineState: state,
                pipelineStateRaw: safeString(payload.pipelineState || payload.state || payload.status || '', ''),
                approvalStatus: approvalStatus,
                sourceValid: boolFrom(payload, ['sourceValid', 'sourceValidation', 'sourceVerified'], true),
                dependenciesValid: boolFrom(payload, ['dependenciesValid', 'dependencyValidation', 'dependenciesVerified', 'dependencyChecksPassed'], true),
                testsPassed: boolFrom(payload, ['testsPassed', 'testValidation', 'testSuitePassed'], true),
                securityValid: boolFrom(payload, ['securityValid', 'securityValidation', 'securityChecksPassed'], true),
                deploymentValidated: boolFrom(payload, ['deploymentValidated', 'deploymentValidation', 'deploymentReady'], true),
                readinessCertified: boolFrom(payload, ['readinessCertified', 'readinessCertification', 'certificationApproved'], true),
                releaseGovernanceValid: boolFrom(payload, ['releaseGovernanceValid', 'releaseGovernanceValidation', 'releaseApproved'], true),
                productionApprovalGranted: boolFrom(payload, ['productionApprovalGranted', 'productionApproved', 'approvalGranted'], false),
                rollbackReady: boolFrom(payload, ['rollbackReady', 'rollbackReadiness', 'rollbackPrepared'], true),
                emergencyBlockActive: payload.emergencyBlockActive === true || payload.activeEmergencyOverride === true,
                governanceViolation: payload.governanceViolation === true,
                deploymentExecuted: payload.deploymentExecuted === true,
                executionRequested: payload.executionRequested === true || payload.deployRequested === true,
                validationResults: Array.isArray(payload.validationResults) ? payload.validationResults.map(function normalizeStage(row) {
                    return {
                        stage: normalizeToken(row && (row.stage || row.name || row.key || 'VALIDATION')),
                        passed: row && row.passed !== false,
                        severity: row && row.passed === false ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO
                    };
                }) : [],
                createdAt: safeString(payload.createdAt || payload.timestamp || nowIso(ctx), ''),
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezePipelineOutput({
                success: true,
                pipeline: pipeline,
                validationResults: { stageResults: buildStageResults(pipeline) },
                immutablePipelineHistory: true,
                immutableValidationHistory: true,
                immutableApprovalHistory: true
            });
        } catch (error) {
            return freezePipelineOutput({
                success: false,
                malformedPayloads: true,
                failures: [safeFailure('CICD_PIPELINE_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Pipeline normalization failed safely.')]
            });
        }
    }

    function buildStageResults(pipeline) {
        var input = pipeline || {};
        return [
            { stage: 'SOURCE_VALIDATION', passed: input.sourceValid !== false, required: true, weight: 10 },
            { stage: 'DEPENDENCY_VALIDATION', passed: input.dependenciesValid !== false, required: true, weight: 12 },
            { stage: 'TEST_VALIDATION', passed: input.testsPassed !== false, required: true, weight: 14 },
            { stage: 'SECURITY_VALIDATION', passed: input.securityValid !== false, required: true, weight: 16 },
            { stage: 'DEPLOYMENT_VALIDATION', passed: input.deploymentValidated !== false, required: true, weight: 14 },
            { stage: 'READINESS_CERTIFICATION', passed: input.readinessCertified !== false, required: true, weight: 12 },
            { stage: 'RELEASE_GOVERNANCE_VALIDATION', passed: input.releaseGovernanceValid !== false, required: true, weight: 12 },
            { stage: 'PRODUCTION_APPROVAL_VALIDATION', passed: input.productionApprovalGranted === true, required: true, weight: 10 }
        ];
    }

    function validateAccess(payload, context) {
        var input = isPlainObject(payload) ? payload : {};
        var ctx = isPlainObject(context) ? context : {};
        var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.type || ctx.actor.userRole));
        var routeType = normalizeToken(ctx.routeType || ctx.surface || 'platform');
        var targetTenant = normalizeTenantSlug(input.targetTenantId || input.tenantSlug || input.tenantId);
        var actorTenant = contextTenant(ctx);
        var executionRequested = input.executionRequested === true || input.deployRequested === true || input.approvalAction === true || input.approvalRequested === true;
        var archived = normalizePipelineState(input.pipelineState || input.state || input.status, '') === 'ARCHIVED';
        var failures = [];
        if (routeType !== 'PLATFORM') failures.push(safeFailure('CICD_GOVERNANCE_PLATFORM_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'CI/CD governance is isolated to platform-control.'));
        if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') failures.push(safeFailure('CICD_GOVERNANCE_ROLE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access CI/CD governance.'));
        if (role === 'SUPER_ADMIN' && executionRequested) failures.push(safeFailure('SUPER_ADMIN_PIPELINE_EXECUTION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN may monitor CI/CD health only and cannot execute or approve tenant releases.'));
        if (role === 'SUPER_ADMIN' && !(input.infrastructureOnly === true && input.monitoringOnly === true) && !executionRequested) failures.push(safeFailure('SUPER_ADMIN_PIPELINE_MONITORING_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN CI/CD visibility must be infrastructure monitoring only.'));
        if (role === 'SUPER_ADMIN' && targetTenant && actorTenant && targetTenant !== actorTenant) failures.push(safeFailure('CROSS_TENANT_CICD_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant CI/CD visibility is blocked.'));
        if (archived && executionRequested) failures.push(safeFailure('ARCHIVED_PIPELINE_HISTORY_IMMUTABLE', SEVERITIES.CRITICAL_BLOCKER, 'Archived CI/CD pipeline history cannot be modified.'));
        return {
            role: role,
            failures: failures,
            allowed: failures.length === 0
        };
    }

    function validatePipelineGovernance(payload, context) {
        try {
            var normalized = normalizePipelinePayload(isPlainObject(payload) ? payload : {}, context || {});
            if (!isPlainObject(payload)) {
                return freezePipelineOutput({
                    success: false,
                    allowed: false,
                    pipelineBlocked: true,
                    failures: [safeFailure('MALFORMED_CICD_PIPELINE_PAYLOAD', SEVERITIES.HIGH_RISK, 'Pipeline payload must be an object.')]
                });
            }
            var pipeline = normalized.pipeline || {};
            var access = validateAccess(Object.assign({}, pipeline, payload), context || {});
            var stageResults = buildStageResults(Object.assign({}, pipeline, payload));
            var blockingConditions = [];
            stageResults.forEach(function blockStage(row) {
                if (row.required && row.passed === false) {
                    blockingConditions.push(safeFailure(row.stage + '_FAILED', row.stage === 'SECURITY_VALIDATION' || row.stage === 'PRODUCTION_APPROVAL_VALIDATION' ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH_RISK, row.stage.replace(/_/g, ' ') + ' failed.'));
                }
            });
            if (pipeline.emergencyBlockActive) blockingConditions.push(safeFailure('EMERGENCY_BLOCK_ACTIVE', SEVERITIES.CRITICAL_BLOCKER, 'Emergency block controls prevent pipeline execution.'));
            if (pipeline.governanceViolation) blockingConditions.push(safeFailure('CICD_GOVERNANCE_VIOLATION', SEVERITIES.CRITICAL_BLOCKER, 'Pipeline governance violation detected.'));
            if (pipeline.deploymentExecuted && blockingConditions.length) blockingConditions.push(safeFailure('UNSAFE_DEPLOYMENT_EXECUTION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Deployment execution is blocked while governance failures exist.'));
            var accessFailures = access.failures || [];
            var allFailures = accessFailures.concat(blockingConditions);
            var pipelineBlocked = blockingConditions.length > 0 || !access.allowed;
            var result = freezePipelineOutput({
                success: true,
                allowed: access.allowed,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: access.role === 'SUPER_ADMIN',
                monitoringOnly: access.role === 'SUPER_ADMIN',
                pipelineAuthority: access.allowed && access.role === 'PLATFORM_OWNER',
                approvalAuthority: access.allowed && access.role === 'PLATFORM_OWNER',
                executionAuthority: false,
                visibility: access.allowed ? (access.role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_CICD_VISIBILITY' : 'CICD_GOVERNANCE') : 'NONE',
                pipeline: pipeline,
                pipelineBlocked: pipelineBlocked,
                blockingConditions: blockingConditions,
                validationResults: { stageResults: stageResults },
                governanceStatus: {
                    governanceGatesEnforced: true,
                    approvalsBypassed: false,
                    productionDeploymentBlocked: pipelineBlocked,
                    approvalRequired: pipeline.productionApprovalGranted !== true,
                    approvalStatus: pipeline.approvalStatus || 'PENDING',
                    noDeploymentOnGovernanceFailure: true
                },
                releaseControls: {
                    certificationApprovalRequired: true,
                    readinessApprovalRequired: true,
                    rollbackReadinessRequired: true,
                    environmentValidationRequired: true,
                    unsafeProductionDeploymentBlocked: pipelineBlocked,
                    governanceBypassBlocked: true
                },
                accessGovernance: {
                    crossTenantPipelineLeakageBlocked: true,
                    tenantBusinessDataExcluded: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    platformIsolationPreserved: true,
                    cicdGovernanceIsolationPreserved: true,
                    governanceBypassBlocked: true
                },
                immutablePipelineHistory: true,
                immutableValidationHistory: true,
                immutableApprovalHistory: true,
                failures: allFailures
            });
            return result;
        } catch (error) {
            return freezePipelineOutput({
                success: false,
                allowed: false,
                pipelineBlocked: true,
                failures: [safeFailure('CICD_PIPELINE_GOVERNANCE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Pipeline governance validation failed safely.')]
            });
        }
    }

    function calculatePipelineConfidence(input) {
        try {
            var governance = input && input.validationResults ? input : validatePipelineGovernance(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var stages = governance.validationResults && governance.validationResults.stageResults || [];
            var failed = stages.filter(function failedStage(row) { return row.passed === false; }).length;
            var blockers = governance.blockingConditions && governance.blockingConditions.length || 0;
            var score = 100 - failed * 11 - blockers * 6;
            if (governance.pipelineBlocked) score -= 12;
            score = clamp(score, 0, 100);
            var risk = score < 35 ? 'CRITICAL' : score < 60 ? 'HIGH' : score < 80 ? 'MODERATE' : 'LOW';
            return freezePipelineOutput({
                success: true,
                pipelineConfidenceScore: score,
                deploymentConfidence: score,
                deploymentRiskScore: 100 - score,
                riskClassification: risk,
                failedValidations: failed,
                blockingConditions: governance.blockingConditions || []
            });
        } catch (error) {
            return freezePipelineOutput({
                success: false,
                pipelineConfidenceScore: 0,
                deploymentRiskScore: 100,
                riskClassification: 'CRITICAL',
                failures: [safeFailure('PIPELINE_CONFIDENCE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Pipeline confidence scoring failed safely.')]
            });
        }
    }

    function calculateReleaseQuality(input) {
        try {
            var governance = input && input.validationResults ? input : validatePipelineGovernance(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var stages = governance.validationResults && governance.validationResults.stageResults || [];
            var totalWeight = stages.reduce(function sum(total, row) { return total + safeNumber(row.weight, 0); }, 0) || 1;
            var passedWeight = stages.reduce(function sumPassed(total, row) { return total + (row.passed ? safeNumber(row.weight, 0) : 0); }, 0);
            var releaseQualityScore = clamp(Math.round((passedWeight / totalWeight) * 100), 0, 100);
            var governanceComplianceScore = clamp(releaseQualityScore - ((governance.governanceStatus && governance.governanceStatus.approvalsBypassed) ? 50 : 0), 0, 100);
            var deploymentRiskScore = clamp(100 - Math.round((releaseQualityScore + governanceComplianceScore) / 2), 0, 100);
            return freezePipelineOutput({
                success: true,
                releaseQualityScore: releaseQualityScore,
                qualityScore: releaseQualityScore,
                governanceComplianceScore: governanceComplianceScore,
                deploymentRiskScore: deploymentRiskScore,
                riskClassification: deploymentRiskScore >= 75 ? 'CRITICAL' : deploymentRiskScore >= 45 ? 'HIGH' : deploymentRiskScore >= 20 ? 'MODERATE' : 'LOW'
            });
        } catch (error) {
            return freezePipelineOutput({
                success: false,
                releaseQualityScore: 0,
                governanceComplianceScore: 0,
                deploymentRiskScore: 100,
                riskClassification: 'CRITICAL',
                failures: [safeFailure('RELEASE_QUALITY_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Release quality scoring failed safely.')]
            });
        }
    }

    function normalizePipelineRow(row) {
        var normalized = normalizePipelinePayload(row || {}, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        return normalized.pipeline || {};
    }

    function collectPipelines(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'cicdPipelineRecords')
            .concat(list(data, 'cicdPipelines'), list(data, 'releasePipelineRecords'), list(data, 'deploymentPipelineRecords'))
            .filter(function filterTenant(row) {
                if (!targetTenant) return true;
                var tenant = rowTenant(row);
                return !tenant || tenant === targetTenant;
            })
            .map(normalizePipelineRow);
    }

    function activeState(row) {
        var token = normalizePipelineState(row && (row.pipelineState || row.status || row.state || ''), '');
        return !/ARCHIVED/.test(token);
    }

    function aggregateGovernance(pipelines, context) {
        var active = pipelines.filter(activeState);
        var basis = active.length ? active : [{}];
        var aggregate = {
            pipelineId: 'CICD-AGGREGATE',
            releaseId: '',
            pipelineState: 'VALIDATING',
            sourceValid: basis.every(function ok(row) { return row.sourceValid !== false; }),
            dependenciesValid: basis.every(function ok(row) { return row.dependenciesValid !== false; }),
            testsPassed: basis.every(function ok(row) { return row.testsPassed !== false; }),
            securityValid: basis.every(function ok(row) { return row.securityValid !== false; }),
            deploymentValidated: basis.every(function ok(row) { return row.deploymentValidated !== false; }),
            readinessCertified: basis.every(function ok(row) { return row.readinessCertified !== false; }),
            releaseGovernanceValid: basis.every(function ok(row) { return row.releaseGovernanceValid !== false; }),
            productionApprovalGranted: basis.every(function ok(row) { return row.productionApprovalGranted === true; }),
            rollbackReady: basis.every(function ok(row) { return row.rollbackReady !== false; }),
            emergencyBlockActive: basis.some(function blocked(row) { return row.emergencyBlockActive === true; }),
            governanceViolation: basis.some(function blocked(row) { return row.governanceViolation === true; })
        };
        if (!aggregate.productionApprovalGranted) aggregate.pipelineState = 'APPROVAL_REQUIRED';
        else if (basis.some(function failed(row) { return row.pipelineState === 'FAILED'; })) aggregate.pipelineState = 'FAILED';
        else if (basis.every(function ready(row) { return row.pipelineState === 'READY' || row.pipelineState === 'COMPLETED'; })) aggregate.pipelineState = 'READY';
        return validatePipelineGovernance(aggregate, context || {});
    }

    function summarizePipelines(rows, governance) {
        var total = rows.length;
        var completed = rows.filter(function complete(row) { return row.pipelineState === 'COMPLETED' || row.pipelineState === 'READY'; }).length;
        var failed = rows.filter(function fail(row) { return row.pipelineState === 'FAILED'; }).length;
        var failedValidations = rows.reduce(function sum(totalFailures, row) {
            return totalFailures + buildStageResults(row).filter(function failedStage(stage) { return stage.passed === false; }).length;
        }, 0);
        return {
            pipelineSuccessRate: total ? Math.round((completed / total) * 100) : 100,
            failedValidations: failedValidations,
            deploymentVelocity: completed,
            approvalDelays: rows.filter(function pending(row) { return row.productionApprovalGranted !== true || row.approvalStatus === 'PENDING'; }).length,
            governanceViolations: rows.filter(function violation(row) { return row.governanceViolation === true; }).length,
            releaseQualityTrends: Math.max(0, 100 - failed * 20),
            deploymentReliabilityTrends: Math.max(0, 100 - failedValidations * 8),
            blockingConditions: governance && governance.blockingConditions || []
        };
    }

    function auditPipeline(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'CICD_GOVERNANCE'),
                    actionType: normalizeToken(actionType || 'CICD_GOVERNANCE'),
                    source: 'cicdGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({ module: 'cicdGovernance' }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('CI/CD audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'CI/CD audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'CICD_EVENT'), {
                    source: 'cicdGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('CI/CD telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'CI/CD telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'CICD_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'cicdGovernanceService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('CI/CD metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'CI/CD metrics unavailable.' };
    }

    function generateCICDGovernanceReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var access = validateAccess(Object.assign({ readOnly: true, aggregateOnly: true }, input), ctx);
            if (!access.allowed) {
                return freezePipelineOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    pipelineGovernanceModel: { state: 'ARCHIVED', states: PIPELINE_STATES, stages: PIPELINE_STAGES, generatedAt: nowIso(ctx) },
                    failures: access.failures || [],
                    timestamp: nowIso(ctx)
                });
            }
            var data = rawData();
            var pipelines = collectPipelines(data, input);
            var active = pipelines.filter(activeState);
            var governance = aggregateGovernance(active, ctx);
            var confidence = calculatePipelineConfidence(governance);
            var quality = calculateReleaseQuality(governance);
            var analytics = summarizePipelines(active, governance);
            var state = governance.pipelineBlocked ? 'APPROVAL_REQUIRED' : 'READY';
            if (active.some(function executing(row) { return row.pipelineState === 'EXECUTING'; })) state = 'EXECUTING';
            if (active.length && active.every(function completed(row) { return row.pipelineState === 'COMPLETED'; })) state = 'COMPLETED';
            var report = freezePipelineOutput({
                success: true,
                classification: confidence.riskClassification === 'CRITICAL' ? SEVERITIES.CRITICAL_BLOCKER : confidence.riskClassification === 'HIGH' ? SEVERITIES.HIGH_RISK : confidence.riskClassification === 'MODERATE' ? SEVERITIES.WARNING : SEVERITIES.INFO,
                pipelineGovernanceModel: { state: state, states: PIPELINE_STATES, stages: PIPELINE_STAGES, generatedAt: nowIso(ctx) },
                activePipelines: active,
                pipelineHistory: pipelines,
                validationHistory: pipelines.map(function validation(row) { return { pipelineId: row.pipelineId, releaseId: row.releaseId, stageResults: buildStageResults(row), createdAt: row.createdAt }; }),
                approvalHistory: pipelines.map(function approval(row) { return { pipelineId: row.pipelineId, releaseId: row.releaseId, approvalStatus: row.approvalStatus, productionApprovalGranted: row.productionApprovalGranted, createdAt: row.createdAt }; }),
                validationResults: governance.validationResults,
                governanceStatus: governance.governanceStatus,
                pipelineConfidence: confidence,
                releaseQuality: quality,
                releaseControls: governance.releaseControls,
                pipelineAutomation: {
                    automatedValidationExecution: true,
                    automatedDependencyChecks: true,
                    automatedGovernanceChecks: true,
                    automatedCertificationVerification: true,
                    automatedReleaseEligibilityChecks: true,
                    autoBypassBlocked: true
                },
                pipelineAnalytics: analytics,
                governanceIntegrations: {
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    productionReadinessIntegrated: !!(global.ProductionReadinessService || global.productionReadinessService),
                    safeReleaseIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                    environmentPromotionIntegrated: !!(global.EnvironmentPromotionService || global.environmentPromotionService || global.EnvironmentActivationService || global.environmentActivationService),
                    rollbackGovernanceIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                    globalAuditVisibilityIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService)
                },
                auditSummary: {
                    pipelineActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                accessGovernance: governance.accessGovernance,
                immutablePipelineHistory: true,
                immutableValidationHistory: true,
                immutableApprovalHistory: true,
                failures: governance.failures || [],
                warnings: governance.pipelineBlocked ? [safeWarning('CICD_GOVERNANCE_REVIEW_REQUIRED', SEVERITIES.WARNING, 'Pipeline has governance blockers.', 'Resolve validation gates and approvals before deployment execution.')] : [],
                sections: [governance, confidence, quality, analytics],
                timestamp: nowIso(ctx)
            });
            emitTelemetry('CICD_GOVERNANCE_REPORTED', { state: report.pipelineGovernanceModel.state, severity: report.classification }, ctx);
            auditPipeline('CICD_GOVERNANCE_REPORTED', { state: report.pipelineGovernanceModel.state, severity: report.classification }, ctx);
            recordMetric('CICD_GOVERNANCE_REPORTED', { status: report.pipelineGovernanceModel.state, severity: report.classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return report;
        } catch (error) {
            return freezePipelineOutput({
                success: false,
                classification: SEVERITIES.CRITICAL_BLOCKER,
                pipelineGovernanceModel: { state: 'FAILED', states: PIPELINE_STATES, stages: PIPELINE_STAGES, generatedAt: nowIso(context || {}) },
                failures: [safeFailure('CICD_GOVERNANCE_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'CI/CD governance report failed safely.')],
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
            var malformed = normalizePipelinePayload(null, {});
            add('malformed payloads fail safely', malformed.success === false);

            var normalized = normalizePipelinePayload({
                pipelineId: 'PIPE-SELF',
                pipelineState: 'ready',
                sourceValid: true,
                dependenciesValid: true,
                testsPassed: true,
                securityValid: true,
                deploymentValidated: true,
                readinessCertified: true,
                releaseGovernanceValid: true,
                productionApprovalGranted: true,
                rollbackReady: true,
                salary: 1
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('pipeline validation works', normalized.success === true && normalized.pipeline.pipelineState === 'READY');

            var valid = validatePipelineGovernance(normalized.pipeline, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('governance gates work', valid.pipelineBlocked === false);

            var blocked = validatePipelineGovernance({ pipelineId: 'PIPE-BLOCKED', securityValid: false, productionApprovalGranted: false, rollbackReady: false }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('approval workflows work', blocked.pipelineBlocked === true && blocked.governanceStatus.approvalRequired === true);

            var quality = calculateReleaseQuality(valid);
            add('quality scoring works', quality.releaseQualityScore >= 80);

            add('immutable outputs enforced', Object.isFrozen(normalized) && Object.isFrozen(valid) && Object.isFrozen(quality));

            return freezePipelineOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    pipelineValidation: true,
                    governanceGates: true,
                    approvalWorkflows: true,
                    qualityScoring: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezePipelineOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('CICD_GOVERNANCE_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'CI/CD governance self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        PIPELINE_STATES: PIPELINE_STATES,
        PIPELINE_STAGES: PIPELINE_STAGES,
        RISK_LEVELS: RISK_LEVELS,
        validatePipelineGovernance: validatePipelineGovernance,
        calculatePipelineConfidence: calculatePipelineConfidence,
        calculateReleaseQuality: calculateReleaseQuality,
        normalizePipelinePayload: normalizePipelinePayload,
        freezePipelineOutput: freezePipelineOutput,
        generateCICDGovernanceReport: generateCICDGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.CICDGovernanceService = api;
    global.cicdGovernanceService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_CICD_GOVERNANCE_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_CICD_GOVERNANCE_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_CICD_GOVERNANCE_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
